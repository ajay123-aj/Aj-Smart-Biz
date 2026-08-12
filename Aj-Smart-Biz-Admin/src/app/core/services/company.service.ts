import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  Branch,
  BranchContact,
  Company,
  MyPlanView,
  PlanCatalogue,
  PlanRequest,
  QuotaView,
  Subscription,
  Transaction,
} from '../models/domain.model';
import { ApiService } from './api.service';

/**
 * Everything under `/my-company` is implicitly scoped to the signed-in admin's
 * tenant by the API — no company id is ever sent from the client.
 */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly api = inject(ApiService);

  get(): Observable<Company> {
    return this.api.get<Company>('/my-company');
  }

  update(payload: Record<string, unknown>): Observable<Company> {
    return this.api.put<Company>('/my-company', payload);
  }

  subscriptions(): Observable<Subscription[]> {
    return this.api.get<Subscription[]>('/my-company/subscriptions');
  }

  /**
   * The active plan, its expiry timer, limits against actual usage, any booked
   * renewal, and the payment history — everything the My Plan screen renders in
   * one call. Read-only: plans are sold and changed by the platform.
   */
  plan(): Observable<MyPlanView> {
    return this.api.get<MyPlanView>('/my-company/plan');
  }

  /* ---------------------------- plan requests --------------------------- */

  /** The plans this company could move to, each compared against its current one. */
  availablePlans(): Observable<PlanCatalogue> {
    return this.api.get<PlanCatalogue>('/my-company/plans');
  }

  planRequests(): Observable<PlanRequest[]> {
    return this.api.get<PlanRequest[]>('/my-company/plan-requests');
  }

  /**
   * Asks to be moved onto another plan. Writes nothing to the subscription —
   * the platform decides, which is why the button says "request".
   */
  requestPlan(planId: number, note?: string | null): Observable<PlanRequest> {
    return this.api.post<PlanRequest>('/my-company/plan-requests', { planId, note: note || null });
  }

  cancelPlanRequest(id: number): Observable<{ id: number }> {
    return this.api.post<{ id: number }>(`/my-company/plan-requests/${id}/cancel`);
  }

  transactions(query: ListQuery = {}): Observable<PagedResult<Transaction>> {
    return this.api.list<Transaction>('/my-company/transactions', query);
  }

  /* ------------------------------ branches ----------------------------- */

  listBranches(query: ListQuery = {}): Observable<PagedResult<Branch>> {
    return this.api.list<Branch>('/my-company/branches', query);
  }

  /**
   * What the plan still allows. The Add button reads `canCreate` from here
   * rather than comparing counts itself, so it can never disagree with the
   * guard that would refuse the request.
   */
  branchQuota(): Observable<QuotaView> {
    return this.api.get<QuotaView>('/my-company/branches/quota');
  }

  getBranch(branchId: number): Observable<Branch> {
    return this.api.get<Branch>(`/my-company/branches/${branchId}`);
  }

  createBranch(payload: Record<string, unknown>): Observable<Branch> {
    return this.api.post<Branch>('/my-company/branches', payload);
  }

  updateBranch(branchId: number, payload: Record<string, unknown>): Observable<Branch> {
    return this.api.put<Branch>(`/my-company/branches/${branchId}`, payload);
  }

  toggleBranchStatus(branchId: number): Observable<{ id: number; status: string }> {
    return this.api.patch<{ id: number; status: string }>(`/my-company/branches/${branchId}/status`, {});
  }

  removeBranch(branchId: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/my-company/branches/${branchId}`);
  }

  /* -------------------------- branch contacts -------------------------- */

  listContacts(branchId: number): Observable<BranchContact[]> {
    return this.api.get<BranchContact[]>(`/my-company/branches/${branchId}/contacts`);
  }

  createContact(branchId: number, payload: Record<string, unknown>): Observable<BranchContact> {
    return this.api.post<BranchContact>(`/my-company/branches/${branchId}/contacts`, payload);
  }

  updateContact(branchId: number, contactId: number, payload: Record<string, unknown>): Observable<BranchContact> {
    return this.api.put<BranchContact>(`/my-company/branches/${branchId}/contacts/${contactId}`, payload);
  }

  removeContact(branchId: number, contactId: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/my-company/branches/${branchId}/contacts/${contactId}`);
  }
}
