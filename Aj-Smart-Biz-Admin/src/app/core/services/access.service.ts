import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  CompanyAdmin,
  Menu,
  Option,
  PermissionRow,
  QuotaView,
  Role,
  RoleAdminsView,
  RolePermissionMatrix,
} from '../models/domain.model';
import { ApiService } from './api.service';

/** Roles, menus, the permission matrix and company admins. */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly api = inject(ApiService);

  /* -------------------------------- roles ------------------------------- */

  listRoles(query: ListQuery = {}): Observable<PagedResult<Role>> {
    return this.api.list<Role>('/admin/roles', query);
  }

  roleOptions(): Observable<Option[]> {
    return this.api.get<Option[]>('/admin/roles/dropdown');
  }

  createRole(payload: Record<string, unknown>): Observable<Role> {
    return this.api.post<Role>('/admin/roles', payload);
  }

  updateRole(id: number, payload: Record<string, unknown>): Observable<Role> {
    return this.api.put<Role>(`/admin/roles/${id}`, payload);
  }

  toggleRoleStatus(id: number): Observable<{ id: number; status: string }> {
    return this.api.patch<{ id: number; status: string }>(`/admin/roles/${id}/status`, {});
  }

  removeRole(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/roles/${id}`);
  }

  /** Who holds a role (primary or extra), for the Assign admins dialog. */
  roleAdmins(roleId: number): Observable<RoleAdminsView> {
    return this.api.get<RoleAdminsView>(`/admin/roles/${roleId}/admins`);
  }

  /** `adminIds` is the complete list of admins who should hold the role. */
  syncRoleAdmins(roleId: number, adminIds: number[]): Observable<{ roleId: number; changed: number }> {
    return this.api.put<{ roleId: number; changed: number }>(`/admin/roles/${roleId}/admins`, { adminIds });
  }

  /* ---------------------------- permissions ----------------------------- */

  getPermissions(roleId: number): Observable<RolePermissionMatrix> {
    return this.api.get<RolePermissionMatrix>(`/admin/roles/${roleId}/permissions`);
  }

  /** Replaces the whole matrix for a role in one call. */
  syncPermissions(roleId: number, permissions: Partial<PermissionRow>[]): Observable<{ roleId: number }> {
    return this.api.put<{ roleId: number }>(`/admin/roles/${roleId}/permissions`, { permissions });
  }

  /* -------------------------------- menus ------------------------------- */

  listMenus(query: ListQuery = {}): Observable<PagedResult<Menu>> {
    return this.api.list<Menu>('/admin/menus', query);
  }

  menuTree(): Observable<Menu[]> {
    return this.api.get<Menu[]>('/admin/menus/tree');
  }

  createMenu(payload: Record<string, unknown>): Observable<Menu> {
    return this.api.post<Menu>('/admin/menus', payload);
  }

  updateMenu(id: number, payload: Record<string, unknown>): Observable<Menu> {
    return this.api.put<Menu>(`/admin/menus/${id}`, payload);
  }

  removeMenu(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/menus/${id}`);
  }

  /* -------------------------------- admins ------------------------------ */

  listAdmins(query: ListQuery = {}): Observable<PagedResult<CompanyAdmin>> {
    return this.api.list<CompanyAdmin>('/admin/admins', query);
  }

  /**
   * How many admins the plan still allows. The Add button reads `canCreate`
   * from here rather than counting rows itself, so it always matches the guard
   * that would refuse the request.
   */
  adminQuota(): Observable<QuotaView> {
    return this.api.get<QuotaView>('/admin/admins/quota');
  }

  createAdmin(payload: Record<string, unknown>): Observable<CompanyAdmin> {
    return this.api.post<CompanyAdmin>('/admin/admins', payload);
  }

  updateAdmin(id: number, payload: Record<string, unknown>): Observable<CompanyAdmin> {
    return this.api.put<CompanyAdmin>(`/admin/admins/${id}`, payload);
  }

  toggleAdminStatus(id: number): Observable<{ id: number; status: string }> {
    return this.api.patch<{ id: number; status: string }>(`/admin/admins/${id}/status`, {});
  }

  resetAdminPassword(id: number, newPassword: string): Observable<{ id: number }> {
    return this.api.patch<{ id: number }>(`/admin/admins/${id}/reset-password`, { newPassword });
  }

  removeAdmin(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/admins/${id}`);
  }
}
