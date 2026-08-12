import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  CompanyPlanView,
  PlanChangePreview,
  PlanRequest,
  PlanRequestStatus,
  Subscription,
  SubscriptionChangeType,
  SubscriptionEvent,
  SubscriptionStatus,
  SubscriptionSummary,
  Transaction,
} from '../models/domain.model';
import { ApiService } from './api.service';

export interface PaymentPayload {
  paymentMode: string;
  paymentReference?: string | null;
  status?: string;
  paidAt?: string;
  remarks?: string | null;
}

/** The money-and-dates half every "give this company a term" call shares. */
export interface TermPayload {
  startDate?: string;
  durationDays?: number;
  amount?: number;
  discount?: number;
  taxAmount?: number;
  autoRenew?: boolean;
  isTrial?: boolean;
  graceDays?: number;
  remarks?: string | null;
  payment?: PaymentPayload;
}

export interface RenewPayload extends TermPayload {
  /** Omit to renew onto the plan the company is already on. */
  planId?: number;
  /** Start now and close the running term, instead of queueing behind it. */
  immediate?: boolean;
}

export interface ChangePlanPayload extends TermPayload {
  planId: number;
  applyCredit?: boolean;
  creditApplied?: number;
}

export interface SubscriptionListQuery extends ListQuery {
  status?: SubscriptionStatus;
  companyId?: number;
  planId?: number;
  changeType?: SubscriptionChangeType;
  isTrial?: boolean;
  autoRenew?: boolean;
  expiringInDays?: number;
  expiredOnly?: boolean;
}

export interface RenewResult {
  subscription: Subscription;
  transaction: Transaction | null;
  /** True when the term was queued rather than started immediately. */
  scheduled: boolean;
}

export interface ChangePlanResult {
  subscription: Subscription;
  transaction: Transaction | null;
  changeType: SubscriptionChangeType;
  creditApplied: number;
  proration: { termDays: number; remainingDays: number; dailyRate: number; creditable: number };
}

/**
 * Everything that happens to a company's plan after it is first assigned:
 * renewals, upgrades, suspensions and the transition trail behind them.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly api = inject(ApiService);

  /* ---------------------------- the console ---------------------------- */

  list(query: SubscriptionListQuery = {}): Observable<PagedResult<Subscription>> {
    return this.api.list<Subscription>('/subscriptions', query);
  }

  summary(): Observable<SubscriptionSummary> {
    return this.api.get<SubscriptionSummary>('/subscriptions/summary');
  }

  getById(id: number): Observable<Subscription> {
    return this.api.get<Subscription>(`/subscriptions/${id}`);
  }

  events(id: number, query: ListQuery = {}): Observable<PagedResult<SubscriptionEvent>> {
    return this.api.list<SubscriptionEvent>(`/subscriptions/${id}/events`, query);
  }

  /** Rolls due terms forward on demand rather than waiting for the hourly sweep. */
  runDue(): Observable<{ activated: number; expired: number; renewed: number; checkedAt: string }> {
    return this.api.post('/subscriptions/run-due');
  }

  /* ---------------------------- transitions ---------------------------- */

  transition(id: number, status: SubscriptionStatus, reason?: string | null): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/transition`, { status, reason: reason || null });
  }

  suspend(id: number, reason?: string | null): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/suspend`, { reason: reason || null });
  }

  resume(id: number): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/resume`);
  }

  cancel(id: number, reason?: string | null): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/cancel`, { reason: reason || null });
  }

  expire(id: number, reason?: string | null): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/expire`, { reason: reason || null });
  }

  /** Starts a queued term today; its full duration is re-based on the new start. */
  startNow(id: number): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/start-now`);
  }

  reactivate(id: number, payload: TermPayload & { planId?: number } = {}): Observable<RenewResult> {
    return this.api.post<RenewResult>(`/subscriptions/${id}/reactivate`, payload);
  }

  extend(id: number, days: number, reason?: string | null): Observable<Subscription> {
    return this.api.post<Subscription>(`/subscriptions/${id}/extend`, { days, reason: reason || null });
  }

  setAutoRenew(id: number, autoRenew: boolean): Observable<{ id: number; autoRenew: boolean }> {
    return this.api.patch<{ id: number; autoRenew: boolean }>(`/subscriptions/${id}/auto-renew`, { autoRenew });
  }

  /* -------------------------- per-company work ------------------------- */

  companyPlan(companyId: number): Observable<CompanyPlanView> {
    return this.api.get<CompanyPlanView>(`/companies/${companyId}/plan`);
  }

  /** Queues a pre-renewal by default; pass `immediate` to start it right away. */
  renew(companyId: number, payload: RenewPayload = {}): Observable<RenewResult> {
    return this.api.post<RenewResult>(`/companies/${companyId}/subscriptions/renew`, payload);
  }

  changePlan(companyId: number, payload: ChangePlanPayload): Observable<ChangePlanResult> {
    return this.api.post<ChangePlanResult>(`/companies/${companyId}/subscriptions/change-plan`, payload);
  }

  /** Proration workings for an upgrade or downgrade, without writing anything. */
  changePreview(companyId: number, planId: number, applyCredit = true): Observable<PlanChangePreview> {
    return this.api.get<PlanChangePreview>(`/companies/${companyId}/subscriptions/change-preview`, {
      planId,
      applyCredit,
    });
  }

  /* -------------------------- plan requests --------------------------- */

  /** Tenants asking to be moved onto a different plan. */
  requests(query: ListQuery & { status?: PlanRequestStatus } = {}): Observable<PagedResult<PlanRequest>> {
    return this.api.list<PlanRequest>('/plan-requests', query);
  }

  /** Approving is what actually moves the company — and bills it. */
  approveRequest(
    id: number,
    payload: {
      applyCredit?: boolean;
      discount?: number;
      taxAmount?: number;
      autoRenew?: boolean;
      remarks?: string | null;
      decisionNote?: string | null;
      payment?: PaymentPayload;
    } = {}
  ): Observable<{ request: PlanRequest; subscription: Subscription; transaction: Transaction | null }> {
    return this.api.post(`/plan-requests/${id}/approve`, payload);
  }

  rejectRequest(id: number, decisionNote?: string | null): Observable<PlanRequest> {
    return this.api.post<PlanRequest>(`/plan-requests/${id}/reject`, { decisionNote: decisionNote || null });
  }
}
