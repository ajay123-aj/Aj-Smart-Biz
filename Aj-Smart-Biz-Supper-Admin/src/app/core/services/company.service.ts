import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  Branch,
  Company,
  CompanyAdmin,
  CompanyCreateResult,
  QuotaView,
  Status,
  Subscription,
  Transaction,
} from '../models/domain.model';
import { ApiService } from './api.service';

export interface AssignPlanPayload {
  planId: number;
  startDate?: string;
  durationDays?: number;
  amount?: number;
  discount?: number;
  taxAmount?: number;
  autoRenew?: boolean;
  isTrial?: boolean;
  /** Days of access after the end date before the term is closed. */
  graceDays?: number;
  remarks?: string | null;
  payment?: {
    paymentMode: string;
    paymentReference?: string | null;
    status?: string;
    paidAt?: string;
    remarks?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly api = inject(ApiService);

  list(query: ListQuery = {}): Observable<PagedResult<Company>> {
    return this.api.list<Company>('/super-admin/companies', query);
  }

  getById(id: number): Observable<Company> {
    return this.api.get<Company>(`/super-admin/companies/${id}`);
  }

  create(payload: Record<string, unknown>): Observable<CompanyCreateResult> {
    return this.api.post<CompanyCreateResult>('/super-admin/companies', payload);
  }

  update(id: number, payload: Record<string, unknown>): Observable<Company> {
    return this.api.put<Company>(`/super-admin/companies/${id}`, payload);
  }

  toggleStatus(id: number, status?: Status): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/super-admin/companies/${id}/status`, status ? { status } : {});
  }

  remove(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/super-admin/companies/${id}`);
  }

  restore(id: number): Observable<{ id: number }> {
    return this.api.post<{ id: number }>(`/super-admin/companies/${id}/restore`);
  }

  /* ------------------------------ billing ------------------------------ */

  listSubscriptions(companyId: number): Observable<Subscription[]> {
    return this.api.get<Subscription[]>(`/super-admin/companies/${companyId}/subscriptions`);
  }

  assignPlan(
    companyId: number,
    payload: AssignPlanPayload
  ): Observable<{ subscription: Subscription; transaction: Transaction | null }> {
    return this.api.post<{ subscription: Subscription; transaction: Transaction | null }>(
      `/super-admin/companies/${companyId}/subscriptions`,
      payload
    );
  }

  cancelSubscription(companyId: number, subscriptionId: number): Observable<{ id: number }> {
    return this.api.post<{ id: number }>(`/super-admin/companies/${companyId}/subscriptions/${subscriptionId}/cancel`);
  }

  listTransactions(companyId: number, query: ListQuery = {}): Observable<PagedResult<Transaction>> {
    return this.api.list<Transaction>(`/super-admin/companies/${companyId}/transactions`, query);
  }

  createTransaction(companyId: number, payload: Record<string, unknown>): Observable<Transaction> {
    return this.api.post<Transaction>(`/super-admin/companies/${companyId}/transactions`, payload);
  }

  /* ------------------------------ branches ----------------------------- */

  listBranches(companyId: number, query: ListQuery = {}): Observable<PagedResult<Branch>> {
    return this.api.list<Branch>(`/super-admin/companies/${companyId}/branches`, query);
  }

  /**
   * How much of the company's plan is left. Read rather than re-derived, so the
   * Add button and the guard that would refuse the request never disagree.
   */
  branchQuota(companyId: number): Observable<QuotaView> {
    return this.api.get<QuotaView>(`/super-admin/companies/${companyId}/branches/quota`);
  }

  createBranch(companyId: number, payload: Record<string, unknown>): Observable<Branch> {
    return this.api.post<Branch>(`/super-admin/companies/${companyId}/branches`, payload);
  }

  updateBranch(companyId: number, branchId: number, payload: Record<string, unknown>): Observable<Branch> {
    return this.api.put<Branch>(`/super-admin/companies/${companyId}/branches/${branchId}`, payload);
  }

  removeBranch(companyId: number, branchId: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/super-admin/companies/${companyId}/branches/${branchId}`);
  }

  /* ------------------------------- admins ------------------------------ */

  /**
   * Edits one of the company's admin logins.
   *
   * The same handler the company reaches at `/admin/admins/:id`, addressed here
   * through the company in the path — so which of the two consoles made the
   * change is the only difference between them.
   */
  updateAdmin(companyId: number, adminId: number, payload: Record<string, unknown>): Observable<CompanyAdmin> {
    return this.api.put<CompanyAdmin>(`/super-admin/companies/${companyId}/admins/${adminId}`, payload);
  }
}
