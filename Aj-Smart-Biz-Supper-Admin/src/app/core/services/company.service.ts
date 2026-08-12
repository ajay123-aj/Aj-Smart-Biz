import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  Branch,
  Company,
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
    return this.api.list<Company>('/companies', query);
  }

  getById(id: number): Observable<Company> {
    return this.api.get<Company>(`/companies/${id}`);
  }

  create(payload: Record<string, unknown>): Observable<CompanyCreateResult> {
    return this.api.post<CompanyCreateResult>('/companies', payload);
  }

  update(id: number, payload: Record<string, unknown>): Observable<Company> {
    return this.api.put<Company>(`/companies/${id}`, payload);
  }

  toggleStatus(id: number, status?: Status): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/companies/${id}/status`, status ? { status } : {});
  }

  remove(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/companies/${id}`);
  }

  restore(id: number): Observable<{ id: number }> {
    return this.api.post<{ id: number }>(`/companies/${id}/restore`);
  }

  /* ------------------------------ billing ------------------------------ */

  listSubscriptions(companyId: number): Observable<Subscription[]> {
    return this.api.get<Subscription[]>(`/companies/${companyId}/subscriptions`);
  }

  assignPlan(
    companyId: number,
    payload: AssignPlanPayload
  ): Observable<{ subscription: Subscription; transaction: Transaction | null }> {
    return this.api.post<{ subscription: Subscription; transaction: Transaction | null }>(
      `/companies/${companyId}/subscriptions`,
      payload
    );
  }

  cancelSubscription(companyId: number, subscriptionId: number): Observable<{ id: number }> {
    return this.api.post<{ id: number }>(`/companies/${companyId}/subscriptions/${subscriptionId}/cancel`);
  }

  listTransactions(companyId: number, query: ListQuery = {}): Observable<PagedResult<Transaction>> {
    return this.api.list<Transaction>(`/companies/${companyId}/transactions`, query);
  }

  createTransaction(companyId: number, payload: Record<string, unknown>): Observable<Transaction> {
    return this.api.post<Transaction>(`/companies/${companyId}/transactions`, payload);
  }

  /* ------------------------------ branches ----------------------------- */

  listBranches(companyId: number, query: ListQuery = {}): Observable<PagedResult<Branch>> {
    return this.api.list<Branch>(`/companies/${companyId}/branches`, query);
  }

  /**
   * How much of the company's plan is left. Read rather than re-derived, so the
   * Add button and the guard that would refuse the request never disagree.
   */
  branchQuota(companyId: number): Observable<QuotaView> {
    return this.api.get<QuotaView>(`/companies/${companyId}/branches/quota`);
  }

  createBranch(companyId: number, payload: Record<string, unknown>): Observable<Branch> {
    return this.api.post<Branch>(`/companies/${companyId}/branches`, payload);
  }

  updateBranch(companyId: number, branchId: number, payload: Record<string, unknown>): Observable<Branch> {
    return this.api.put<Branch>(`/companies/${companyId}/branches/${branchId}`, payload);
  }

  removeBranch(companyId: number, branchId: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/companies/${companyId}/branches/${branchId}`);
  }
}
