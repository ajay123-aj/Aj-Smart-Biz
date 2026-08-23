import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  Branch,
  BranchContact,
  AboutView,
  CardList,
  ContactView,
  Company,
  Functionality,
  FunctionalityKey,
  FunctionalityView,
  MyPlanView,
  PlanCatalogue,
  PlanRequest,
  QuotaView,
  Status,
  Subscription,
  Transaction,
  WhatsappNumber,
  WhatsappNumberView,
} from '../models/domain.model';
import { ApiService } from './api.service';

/**
 * One tenant-owned, ordered list of cards.
 *
 * Stat cards, team members and gallery images differ only in their fields, so
 * they share this client — writing three near-identical ones is how the three
 * screens drift apart. Unpaginated, matching the API: these are short lists
 * edited as a whole, not tables anyone pages through.
 */
export class CardClient<T> {
  constructor(private readonly api: ApiService, private readonly path: string) {}

  /**
   * `branchId` narrows the list to one scope: a branch id for that branch's own
   * cards, `'none'` for the company-wide ones, omitted for everything.
   */
  list(branchId?: number | string | null): Observable<T[]> {
    const query =
      branchId === undefined || branchId === null || branchId === '' ? {} : { branchId: String(branchId) };
    return this.api.get<CardList<T>>(this.path, query).pipe(map((result) => result.items ?? []));
  }

  create(payload: Record<string, unknown>): Observable<T> {
    return this.api.post<T>(this.path, payload);
  }

  update(id: number, payload: Record<string, unknown>): Observable<T> {
    return this.api.put<T>(`${this.path}/${id}`, payload);
  }

  toggleStatus(id: number): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`${this.path}/${id}/status`, {});
  }

  /** The whole order in one call, so a shuffle cannot be left half-applied. */
  reorder(ids: number[]): Observable<{ ids: number[] }> {
    return this.api.patch<{ ids: number[] }>(`${this.path}/reorder`, { ids });
  }

  remove(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`${this.path}/${id}`);
  }
}

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

  /* -------------------------- functionality --------------------------- */

  /**
   * Every optional functionality and where this company stands on it. The
   * screen renders `granted` / `enabled` / `active` straight from here rather
   * than working them out, so a disabled switch and a refused request can never
   * tell different stories.
   */
  functionalities(): Observable<FunctionalityView> {
    return this.api.get<FunctionalityView>('/my-company/functionalities');
  }

  /** Omitting `status` flips it, which is what the switch sends. */
  toggleFunctionality(key: FunctionalityKey, status?: Status): Observable<Functionality> {
    return this.api.patch<Functionality>(
      `/my-company/functionalities/${key}/status`,
      status ? { status } : {}
    );
  }

  /** Replaces the whole settings object for one functionality. */
  saveFunctionalitySettings(
    key: FunctionalityKey,
    settings: Record<string, unknown>
  ): Observable<Functionality> {
    return this.api.put<Functionality>(`/my-company/functionalities/${key}/settings`, settings);
  }

  /* ------------------------- whatsapp numbers ------------------------- */

  whatsappNumbers(): Observable<WhatsappNumberView> {
    return this.api.get<WhatsappNumberView>('/my-company/whatsapp-numbers');
  }

  createWhatsappNumber(payload: Record<string, unknown>): Observable<WhatsappNumber> {
    return this.api.post<WhatsappNumber>('/my-company/whatsapp-numbers', payload);
  }

  updateWhatsappNumber(id: number, payload: Record<string, unknown>): Observable<WhatsappNumber> {
    return this.api.put<WhatsappNumber>(`/my-company/whatsapp-numbers/${id}`, payload);
  }

  toggleWhatsappNumber(id: number): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/my-company/whatsapp-numbers/${id}/status`, {});
  }

  removeWhatsappNumber(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/my-company/whatsapp-numbers/${id}`);
  }

  /* -------------------------- website content ------------------------- */

  /**
   * The About stat band, the Team section and the Gallery are the same shape of
   * thing — an ordered list of cards the tenant adds, edits, reorders and
   * deletes — so they share one client rather than three near-identical ones.
   */
  cards<T>(path: 'stats' | 'team' | 'gallery'): CardClient<T> {
    return new CardClient<T>(this.api, `/my-company/${path}`);
  }

  /* ---------------------------- about copy ---------------------------- */

  /**
   * The About prose for one scope — the company-wide copy, or one branch's.
   *
   * Branch-aware like the sliders, so it lives in its own table rather than on
   * the functionality's settings blob; a branch with no copy of its own
   * inherits, and the response says which.
   */
  about(branchId?: number | null): Observable<AboutView> {
    return this.api.get<AboutView>('/my-company/about', branchId ? { branchId: String(branchId) } : {});
  }

  saveAbout(branchId: number | null, copy: Record<string, unknown>): Observable<AboutView> {
    return this.api.put<AboutView>(
      `/my-company/about${branchId ? `?branchId=${branchId}` : ''}`,
      copy
    );
  }

  /** Drops a branch's override so it inherits the company-wide copy again. */
  clearAbout(branchId: number): Observable<AboutView> {
    return this.api.delete<AboutView>(`/my-company/about?branchId=${branchId}`);
  }

  /* --------------------------- contact page --------------------------- */

  /**
   * The Contact page settings for one scope.
   *
   * Not gated by a plan functionality, unlike About/Team/Gallery: a website
   * nobody can reach is not a website, so every tenant has this page and these
   * routes only decide how it reads.
   */
  contact(branchId?: number | null): Observable<ContactView> {
    return this.api.get<ContactView>('/my-company/contact', branchId ? { branchId: String(branchId) } : {});
  }

  saveContact(branchId: number | null, settings: Record<string, unknown>): Observable<ContactView> {
    return this.api.put<ContactView>(
      `/my-company/contact${branchId ? `?branchId=${branchId}` : ''}`,
      settings
    );
  }

  clearContact(branchId: number): Observable<ContactView> {
    return this.api.delete<ContactView>(`/my-company/contact?branchId=${branchId}`);
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
