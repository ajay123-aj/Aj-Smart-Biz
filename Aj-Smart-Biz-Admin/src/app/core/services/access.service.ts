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
  RolePermissionMatrix,
} from '../models/domain.model';
import { ApiService } from './api.service';

/** Roles, menus, the permission matrix and company admins. */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly api = inject(ApiService);

  /* -------------------------------- roles ------------------------------- */

  listRoles(query: ListQuery = {}): Observable<PagedResult<Role>> {
    return this.api.list<Role>('/roles', query);
  }

  roleOptions(): Observable<Option[]> {
    return this.api.get<Option[]>('/roles/dropdown');
  }

  createRole(payload: Record<string, unknown>): Observable<Role> {
    return this.api.post<Role>('/roles', payload);
  }

  updateRole(id: number, payload: Record<string, unknown>): Observable<Role> {
    return this.api.put<Role>(`/roles/${id}`, payload);
  }

  toggleRoleStatus(id: number): Observable<{ id: number; status: string }> {
    return this.api.patch<{ id: number; status: string }>(`/roles/${id}/status`, {});
  }

  removeRole(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/roles/${id}`);
  }

  /* ---------------------------- permissions ----------------------------- */

  getPermissions(roleId: number): Observable<RolePermissionMatrix> {
    return this.api.get<RolePermissionMatrix>(`/roles/${roleId}/permissions`);
  }

  /** Replaces the whole matrix for a role in one call. */
  syncPermissions(roleId: number, permissions: Partial<PermissionRow>[]): Observable<{ roleId: number }> {
    return this.api.put<{ roleId: number }>(`/roles/${roleId}/permissions`, { permissions });
  }

  /* -------------------------------- menus ------------------------------- */

  listMenus(query: ListQuery = {}): Observable<PagedResult<Menu>> {
    return this.api.list<Menu>('/menus', query);
  }

  menuTree(): Observable<Menu[]> {
    return this.api.get<Menu[]>('/menus/tree');
  }

  createMenu(payload: Record<string, unknown>): Observable<Menu> {
    return this.api.post<Menu>('/menus', payload);
  }

  updateMenu(id: number, payload: Record<string, unknown>): Observable<Menu> {
    return this.api.put<Menu>(`/menus/${id}`, payload);
  }

  removeMenu(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/menus/${id}`);
  }

  /* -------------------------------- admins ------------------------------ */

  listAdmins(query: ListQuery = {}): Observable<PagedResult<CompanyAdmin>> {
    return this.api.list<CompanyAdmin>('/admins', query);
  }

  /**
   * How many admins the plan still allows. The Add button reads `canCreate`
   * from here rather than counting rows itself, so it always matches the guard
   * that would refuse the request.
   */
  adminQuota(): Observable<QuotaView> {
    return this.api.get<QuotaView>('/admins/quota');
  }

  createAdmin(payload: Record<string, unknown>): Observable<CompanyAdmin> {
    return this.api.post<CompanyAdmin>('/admins', payload);
  }

  updateAdmin(id: number, payload: Record<string, unknown>): Observable<CompanyAdmin> {
    return this.api.put<CompanyAdmin>(`/admins/${id}`, payload);
  }

  toggleAdminStatus(id: number): Observable<{ id: number; status: string }> {
    return this.api.patch<{ id: number; status: string }>(`/admins/${id}/status`, {});
  }

  resetAdminPassword(id: number, newPassword: string): Observable<{ id: number }> {
    return this.api.patch<{ id: number }>(`/admins/${id}/reset-password`, { newPassword });
  }

  removeAdmin(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admins/${id}`);
  }
}
