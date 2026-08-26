import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ListQuery, PageMeta, PagedResult } from '../models/api.model';
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
  LeadStage,
  MyPlanView,
  PlanCatalogue,
  PlanRequest,
  QuotaView,
  ServiceLead,
  ServiceLeadView,
  Status,
  Subscription,
  TestimonialListView,
  TestimonialModeration,
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
 * Everything under `/admin/company` is implicitly scoped to the signed-in admin's
 * tenant by the API — no company id is ever sent from the client.
 */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly api = inject(ApiService);

  get(): Observable<Company> {
    return this.api.get<Company>('/admin/company');
  }

  update(payload: Record<string, unknown>): Observable<Company> {
    return this.api.put<Company>('/admin/company', payload);
  }

  subscriptions(): Observable<Subscription[]> {
    return this.api.get<Subscription[]>('/admin/company/subscriptions');
  }

  /**
   * The active plan, its expiry timer, limits against actual usage, any booked
   * renewal, and the payment history — everything the My Plan screen renders in
   * one call. Read-only: plans are sold and changed by the platform.
   */
  plan(): Observable<MyPlanView> {
    return this.api.get<MyPlanView>('/admin/company/plan');
  }

  /* ---------------------------- plan requests --------------------------- */

  /** The plans this company could move to, each compared against its current one. */
  availablePlans(): Observable<PlanCatalogue> {
    return this.api.get<PlanCatalogue>('/admin/company/plans');
  }

  planRequests(): Observable<PlanRequest[]> {
    return this.api.get<PlanRequest[]>('/admin/company/plan-requests');
  }

  /**
   * Asks to be moved onto another plan. Writes nothing to the subscription —
   * the platform decides, which is why the button says "request".
   */
  requestPlan(planId: number, note?: string | null): Observable<PlanRequest> {
    return this.api.post<PlanRequest>('/admin/company/plan-requests', { planId, note: note || null });
  }

  cancelPlanRequest(id: number): Observable<{ id: number }> {
    return this.api.post<{ id: number }>(`/admin/company/plan-requests/${id}/cancel`);
  }

  transactions(query: ListQuery = {}): Observable<PagedResult<Transaction>> {
    return this.api.list<Transaction>('/admin/company/transactions', query);
  }

  /* -------------------------- functionality --------------------------- */

  /**
   * Every optional functionality and where this company stands on it. The
   * screen renders `granted` / `enabled` / `active` straight from here rather
   * than working them out, so a disabled switch and a refused request can never
   * tell different stories.
   */
  functionalities(): Observable<FunctionalityView> {
    return this.api.get<FunctionalityView>('/admin/company/functionalities');
  }

  /** Omitting `status` flips it, which is what the switch sends. */
  toggleFunctionality(key: FunctionalityKey, status?: Status): Observable<Functionality> {
    return this.api.patch<Functionality>(
      `/admin/company/functionalities/${key}/status`,
      status ? { status } : {}
    );
  }

  /** Replaces the whole settings object for one functionality. */
  saveFunctionalitySettings(
    key: FunctionalityKey,
    settings: Record<string, unknown>
  ): Observable<Functionality> {
    return this.api.put<Functionality>(`/admin/company/functionalities/${key}/settings`, settings);
  }

  /* ------------------------- whatsapp numbers ------------------------- */

  whatsappNumbers(): Observable<WhatsappNumberView> {
    return this.api.get<WhatsappNumberView>('/admin/company/whatsapp-numbers');
  }

  createWhatsappNumber(payload: Record<string, unknown>): Observable<WhatsappNumber> {
    return this.api.post<WhatsappNumber>('/admin/company/whatsapp-numbers', payload);
  }

  updateWhatsappNumber(id: number, payload: Record<string, unknown>): Observable<WhatsappNumber> {
    return this.api.put<WhatsappNumber>(`/admin/company/whatsapp-numbers/${id}`, payload);
  }

  toggleWhatsappNumber(id: number): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/admin/company/whatsapp-numbers/${id}/status`, {});
  }

  removeWhatsappNumber(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/whatsapp-numbers/${id}`);
  }

  /* -------------------------- website content ------------------------- */

  /**
   * The About stat band, the Team section, the Gallery, the Services list and
   * the Features / Benefits cards are the same shape of thing — an ordered list of cards the
   * tenant adds, edits, reorders and deletes — so they share one client rather
   * than four near-identical ones.
   */
  cards<T>(path: 'stats' | 'team' | 'gallery' | 'features' | 'services' | 'testimonials'): CardClient<T> {
    return new CardClient<T>(this.api, `/admin/company/${path}`);
  }

  /* --------------------------- testimonials --------------------------- */

  /**
   * The reviews — one page of them, the counts, and where that page sits.
   *
   * Not `cards().list()`, which would drop both extras on the floor. This list
   * differs from the other card lists in the two ways its screen is built on:
   *
   *  - **It counts.** The number waiting on someone is the point of opening the
   *    screen, and it has to come from the API so it is the whole tenant's
   *    rather than the open tab's — a count derived from a filtered page is a
   *    count of that page.
   *  - **It pages.** The other lists are short and edited whole. This one is
   *    fed by the public internet and grows for as long as the site is up.
   *
   * The counts arrive in `data` and the page in `meta`, which is what each of
   * them is about. Everything else on a row (create, update, reorder, delete)
   * still goes through the shared card client.
   */
  listTestimonials(query: ListQuery = {}): Observable<{ data: TestimonialListView; meta: PageMeta }> {
    return this.api.getWithMeta<TestimonialListView>('/admin/company/testimonials', query);
  }

  /**
   * Approve or reject one review — the only thing standing between a stranger's
   * typing and the tenant's public website, so it is its own call rather than a
   * field on the general update.
   */
  moderateTestimonial(
    id: number,
    moderation: TestimonialModeration
  ): Observable<{ id: number; moderation: TestimonialModeration }> {
    return this.api.patch<{ id: number; moderation: TestimonialModeration }>(
      `/admin/company/testimonials/${id}/moderation`,
      { moderation }
    );
  }

  /* -------------------------- service enquiries ----------------------- */

  /**
   * The enquiry queue — one page of it, the counts, and the services to filter
   * by.
   *
   * Not `cards()`, which would drop all three extras: this list is fed by the
   * public internet and grows for as long as the website is up, so it pages,
   * and the number waiting on somebody is the reason to open the screen at all.
   * The counts come from the API for the same reason the testimonial ones do —
   * a count derived here from a filtered page is a count of that filter.
   */
  listServiceLeads(query: ListQuery = {}): Observable<{ data: ServiceLeadView; meta: PageMeta }> {
    return this.api.getWithMeta<ServiceLeadView>('/admin/company/service-leads', query);
  }

  /**
   * Move an enquiry along, and write down what happened. The only two things
   * this accepts — what the visitor typed is a record of what happened and is
   * not the company's to rewrite.
   */
  updateServiceLead(id: number, payload: { stage?: LeadStage; note?: string | null }): Observable<ServiceLead> {
    return this.api.patch<ServiceLead>(`/admin/company/service-leads/${id}`, payload);
  }

  removeServiceLead(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/service-leads/${id}`);
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
    return this.api.get<AboutView>('/admin/company/about', branchId ? { branchId: String(branchId) } : {});
  }

  saveAbout(branchId: number | null, copy: Record<string, unknown>): Observable<AboutView> {
    return this.api.put<AboutView>(
      `/admin/company/about${branchId ? `?branchId=${branchId}` : ''}`,
      copy
    );
  }

  /** Drops a branch's override so it inherits the company-wide copy again. */
  clearAbout(branchId: number): Observable<AboutView> {
    return this.api.delete<AboutView>(`/admin/company/about?branchId=${branchId}`);
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
    return this.api.get<ContactView>('/admin/company/contact', branchId ? { branchId: String(branchId) } : {});
  }

  saveContact(branchId: number | null, settings: Record<string, unknown>): Observable<ContactView> {
    return this.api.put<ContactView>(
      `/admin/company/contact${branchId ? `?branchId=${branchId}` : ''}`,
      settings
    );
  }

  clearContact(branchId: number): Observable<ContactView> {
    return this.api.delete<ContactView>(`/admin/company/contact?branchId=${branchId}`);
  }

  /* ------------------------------ branches ----------------------------- */

  listBranches(query: ListQuery = {}): Observable<PagedResult<Branch>> {
    return this.api.list<Branch>('/admin/company/branches', query);
  }

  /**
   * What the plan still allows. The Add button reads `canCreate` from here
   * rather than comparing counts itself, so it can never disagree with the
   * guard that would refuse the request.
   */
  branchQuota(): Observable<QuotaView> {
    return this.api.get<QuotaView>('/admin/company/branches/quota');
  }

  getBranch(branchId: number): Observable<Branch> {
    return this.api.get<Branch>(`/admin/company/branches/${branchId}`);
  }

  createBranch(payload: Record<string, unknown>): Observable<Branch> {
    return this.api.post<Branch>('/admin/company/branches', payload);
  }

  updateBranch(branchId: number, payload: Record<string, unknown>): Observable<Branch> {
    return this.api.put<Branch>(`/admin/company/branches/${branchId}`, payload);
  }

  toggleBranchStatus(branchId: number): Observable<{ id: number; status: string }> {
    return this.api.patch<{ id: number; status: string }>(`/admin/company/branches/${branchId}/status`, {});
  }

  removeBranch(branchId: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/branches/${branchId}`);
  }

  /* -------------------------- branch contacts -------------------------- */

  listContacts(branchId: number): Observable<BranchContact[]> {
    return this.api.get<BranchContact[]>(`/admin/company/branches/${branchId}/contacts`);
  }

  createContact(branchId: number, payload: Record<string, unknown>): Observable<BranchContact> {
    return this.api.post<BranchContact>(`/admin/company/branches/${branchId}/contacts`, payload);
  }

  updateContact(branchId: number, contactId: number, payload: Record<string, unknown>): Observable<BranchContact> {
    return this.api.put<BranchContact>(`/admin/company/branches/${branchId}/contacts/${contactId}`, payload);
  }

  removeContact(branchId: number, contactId: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/branches/${branchId}/contacts/${contactId}`);
  }
}
