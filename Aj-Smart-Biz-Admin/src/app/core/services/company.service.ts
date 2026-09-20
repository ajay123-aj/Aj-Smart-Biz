import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ListQuery, PageMeta, PagedResult } from '../models/api.model';
import {
  Branch,
  BookingStatus,
  ServiceCategory,
  BlogPost,
  BlogSummary,
  BlogTag,
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
  Product,
  ProductCategory,
  QuotaView,
  ServiceAnalytics,
  ServiceLead,
  ServiceLeadView,
  Status,
  Subscription,
  TestimonialListView,
  TestimonialModeration,
  Transaction,
  WhatsappNumber,
  WhatsappNumberView,
  WebsiteThemeInput,
  WebsiteThemeView,
  CompanyOrder,
  OrderSummary,
  SalesAnalytics,
  StockAnalytics,
  StockLevel,
  StockMovement,
  Warehouse,
  Customer,
  CustomerDetail,
  CustomerSummary,
  ServiceRevenue,
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
 * Which theme scope a call is for: a branch id, or the company-wide theme.
 *
 * Absent rather than `none` for the company-wide case — the API treats a
 * missing `branchId` and the literal `none` the same way, and sending nothing
 * keeps the common call free of a magic string.
 */
const themeScope = (branchId?: number | null) => (branchId ? { branchId: String(branchId) } : {});

/** The same thing as a query suffix, for the verbs `ApiService` gives no params. */
const themeScopeQuery = (branchId?: number | null) => (branchId ? `?branchId=${branchId}` : '');

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

  /* --------------------------- website theme --------------------------- */

  /**
   * The colours this company's public website is painted with.
   *
   * These three write `companies.theme_config` — the company's **own** values —
   * and never the platform's shared `themes` catalogue. A dozen tenants can sit
   * on one preset row, so editing that row here would repaint all of them; the
   * API lays this company's values over the preset at read time instead.
   */
  websiteTheme(branchId?: number | null): Observable<WebsiteThemeView> {
    return this.api.get<WebsiteThemeView>('/admin/company/theme', themeScope(branchId));
  }

  /**
   * A **replace**, not a merge: every field the form holds is sent, and a blank
   * one clears that colour back to the level below. Sending nothing usable is
   * the same as a reset, which is what makes "clear every field" behave the way
   * an admin expects.
   *
   * `branchId` names the scope. Omitted it writes the company-wide theme; with
   * one it writes only that branch, leaving every other site alone.
   */
  saveWebsiteTheme(colours: WebsiteThemeInput, branchId?: number | null): Observable<WebsiteThemeView> {
    return this.api.put<WebsiteThemeView>(`/admin/company/theme${themeScopeQuery(branchId)}`, colours);
  }

  /**
   * Drops one scope's own colours so it goes back to inheriting — a branch
   * falls back to the company's colours, the company falls back to the preset.
   */
  resetWebsiteTheme(branchId?: number | null): Observable<WebsiteThemeView> {
    return this.api.delete<WebsiteThemeView>(`/admin/company/theme${themeScopeQuery(branchId)}`);
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
  cards<T>(
    path: 'stats' | 'team' | 'gallery' | 'features' | 'services' | 'testimonials' | 'social-links'
  ): CardClient<T> {
    return new CardClient<T>(this.api, `/admin/company/${path}`);
  }

  /* ---------------------------- service leads --------------------------- */

  /**
   * What the services are earning — quoted, won and collected over one of the
   * platform's windows. Three numbers rather than one; see `ServiceRevenue`.
   */
  serviceRevenue(query: ListQuery = {}): Observable<ServiceRevenue> {
    return this.api.get<ServiceRevenue>('/admin/company/service-leads/revenue', query);
  }

  /* -------------------------------- orders ----------------------------- */

  /**
   * The order book.
   *
   * Read and moved along, never created or deleted. The only writer is the
   * public website, and an order that could be typed in here would make the list
   * a place where "somebody bought this" and "somebody typed this in" are
   * indistinguishable — which is exactly what a sales report must never be.
   * Cancelling is what "this is not happening" means, and it leaves the record
   * and the stock it gave back both visible.
   */
  listOrders(query: ListQuery = {}): Observable<PagedResult<CompanyOrder>> {
    return this.api.list<CompanyOrder>('/admin/company/orders', query);
  }

  /**
   * The strip above the list. Its own call rather than a field on the page, so
   * the counts do not change when somebody filters — a count of the current
   * filter would read zero on the very tab that needed it.
   */
  orderSummary(): Observable<OrderSummary> {
    return this.api.get<OrderSummary>('/admin/company/orders/summary');
  }

  getOrder(id: number): Observable<CompanyOrder> {
    return this.api.get<CompanyOrder>(`/admin/company/orders/${id}`);
  }

  /**
   * Moving an order along — and, where the warehouse feature is live, doing to
   * stock whatever that step means. All of it happens in one transaction on the
   * API, so a reservation that cannot be met leaves the order where it was.
   */
  setOrderStatus(id: number, status: string, reason?: string | null): Observable<CompanyOrder> {
    return this.api.patch<CompanyOrder>(`/admin/company/orders/${id}/status`, { status, reason: reason || null });
  }

  setOrderPayment(id: number, paymentStatus: string, reference?: string | null): Observable<CompanyOrder> {
    return this.api.patch<CompanyOrder>(`/admin/company/orders/${id}/payment`, {
      paymentStatus,
      reference: reference || null,
    });
  }

  /** The few things a person may edit after the fact. Not the lines or the prices. */
  updateOrder(id: number, payload: Record<string, unknown>): Observable<CompanyOrder> {
    return this.api.put<CompanyOrder>(`/admin/company/orders/${id}`, payload);
  }

  salesAnalytics(query: ListQuery = {}): Observable<SalesAnalytics> {
    return this.api.get<SalesAnalytics>('/admin/company/orders/analytics', query);
  }

  /* ------------------------------ customers ---------------------------- */

  /**
   * The customer list.
   *
   * Read and corrected, never created: an account is made by the person it
   * belongs to, signing in with their own number. One a shop could manufacture
   * would be a row nobody consented to, attached to somebody's phone number.
   */
  listCustomers(query: ListQuery = {}): Observable<PagedResult<Customer>> {
    return this.api.list<Customer>('/admin/company/customers', query);
  }

  customerSummary(): Observable<CustomerSummary> {
    return this.api.get<CustomerSummary>('/admin/company/customers/summary');
  }

  /** The customer, their addresses and their orders — one request, not three. */
  getCustomer(id: number): Observable<CustomerDetail> {
    return this.api.get<CustomerDetail>(`/admin/company/customers/${id}`);
  }

  /** A correction and a note. **Not the phone** — it is the identity. */
  updateCustomer(id: number, payload: Record<string, unknown>): Observable<Customer> {
    return this.api.put<Customer>(`/admin/company/customers/${id}`, payload);
  }

  /** Bars them, or lets them back. Their orders stay exactly where they are. */
  toggleCustomer(id: number): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/admin/company/customers/${id}/status`, {});
  }

  deleteCustomer(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/customers/${id}`);
  }

  /* ------------------------------ warehouse ---------------------------- */

  listWarehouses(query: ListQuery = {}): Observable<PagedResult<Warehouse>> {
    return this.api.list<Warehouse>('/admin/company/warehouses', query);
  }

  createWarehouse(payload: Record<string, unknown>): Observable<Warehouse> {
    return this.api.post<Warehouse>('/admin/company/warehouses', payload);
  }

  updateWarehouse(id: number, payload: Record<string, unknown>): Observable<Warehouse> {
    return this.api.put<Warehouse>(`/admin/company/warehouses/${id}`, payload);
  }

  deleteWarehouse(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/warehouses/${id}`);
  }

  /**
   * What is on the shelves. `low` and `out` are filters the **API** resolves:
   * a browser filtering a page would be filtering a page, and the product that
   * ran out is on page four.
   */
  listStock(query: ListQuery = {}): Observable<PagedResult<StockLevel>> {
    return this.api.list<StockLevel>('/admin/company/stock', query);
  }

  /**
   * One movement.
   *
   * **There is no `type`** — the direction comes from the reason, so a receipt
   * goes in and a breakage goes out without anybody being asked to say both.
   * `quantity` therefore means two things: how many arrived, except on a stock
   * count where it is how many there are now.
   */
  recordMovement(payload: Record<string, unknown>): Observable<StockMovement> {
    return this.api.post<StockMovement>('/admin/company/stock/movements', payload);
  }

  /** Two movements, one call, one transaction. A half-recorded transfer is stock lost. */
  transferStock(payload: Record<string, unknown>): Observable<unknown> {
    return this.api.post('/admin/company/stock/transfer', payload);
  }

  /** Where it is kept and when to warn. Not a movement: neither changes the count. */
  saveStockSettings(payload: Record<string, unknown>): Observable<StockLevel> {
    return this.api.put<StockLevel>('/admin/company/stock/settings', payload);
  }

  listMovements(query: ListQuery = {}): Observable<PagedResult<StockMovement>> {
    return this.api.list<StockMovement>('/admin/company/stock/movements', query);
  }

  stockAnalytics(query: ListQuery = {}): Observable<StockAnalytics> {
    return this.api.get<StockAnalytics>('/admin/company/stock/analytics', query);
  }

  /* ------------------------------ catalogue ---------------------------- */

  /**
   * The category tree.
   *
   * A card client, because a category list is exactly that — short, ordered,
   * edited as a whole. What it needs on top is the `tree` flag, which asks the
   * API to nest the rows rather than return them flat; the management screen and
   * the parent picker both render the nested form.
   */
  categories(): CardClient<ProductCategory> {
    return new CardClient<ProductCategory>(this.api, '/admin/company/categories');
  }

  /**
   * The categories, nested, with a product count on every node.
   *
   * Its own method rather than an argument on `cards().list()` because the flag
   * changes the shape of what comes back, and a signature that returns two
   * different shapes depending on a boolean is one every caller has to guard.
   */
  categoryTree(branchId?: number | string | null): Observable<ProductCategory[]> {
    const query: Record<string, string> = { tree: 'true' };
    if (branchId !== undefined && branchId !== null && branchId !== '') query['branchId'] = String(branchId);
    return this.api
      .get<CardList<ProductCategory>>('/admin/company/categories', query)
      .pipe(map((result) => result.items ?? []));
  }

  /**
   * The products — one page of them.
   *
   * Not `cards()`, which is unpaginated by design. Every other list in this
   * section is short and edited whole; a catalogue is however many things the
   * business sells, so this one pages, searches and filters by category.
   */
  listProducts(query: ListQuery = {}): Observable<PagedResult<Product>> {
    return this.api.list<Product>('/admin/company/products', query);
  }

  getProduct(id: number): Observable<Product> {
    return this.api.get<Product>(`/admin/company/products/${id}`);
  }

  createProduct(payload: Record<string, unknown>): Observable<Product> {
    return this.api.post<Product>('/admin/company/products', payload);
  }

  updateProduct(id: number, payload: Record<string, unknown>): Observable<Product> {
    return this.api.put<Product>(`/admin/company/products/${id}`, payload);
  }

  toggleProduct(id: number): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/admin/company/products/${id}/status`, {});
  }

  /** The whole order in one call, so a shuffle cannot be left half-applied. */
  reorderProducts(ids: number[]): Observable<{ ids: number[] }> {
    return this.api.patch<{ ids: number[] }>('/admin/company/products/reorder', { ids });
  }

  removeProduct(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/products/${id}`);
  }

  /* -------------------------- service categories -------------------------- */

  /**
   * How a business sorts the work it sells.
   *
   * `cards()` rather than a client of its own, because the ordinary half is
   * ordinary - add, rename, reorder, delete. The tree rules live in the API,
   * which refuses a parent from another company, a cycle, or a tree pushed past
   * its depth; this app renders the refusal rather than duplicating the rule.
   */
  serviceCategories(): CardClient<ServiceCategory> {
    return new CardClient<ServiceCategory>(this.api, '/admin/company/service-categories');
  }

  /** The tree, with a count on every node - what the screen and the picker render. */
  serviceCategoryTree(branchId?: number | string | null): Observable<ServiceCategory[]> {
    const query: Record<string, string> = { tree: 'true' };
    if (branchId !== undefined && branchId !== null && branchId !== '') query['branchId'] = String(branchId);
    return this.api
      .get<CardList<ServiceCategory>>('/admin/company/service-categories', query)
      .pipe(map((result) => result.items ?? []));
  }

  /**
   * What is happening on the service side, over one of the platform's windows.
   *
   * Beside `serviceRevenue` rather than replacing it: one is what the work
   * earned, the other is whether the work is coming in. A screen showing both
   * asks for both, and neither pays for the half it is not drawing.
   */
  serviceAnalytics(query: ListQuery = {}): Observable<ServiceAnalytics> {
    return this.api.get<ServiceAnalytics>('/admin/company/service-leads/analytics', query);
  }

  /* ------------------------------ bookings -------------------------------- */

  /**
   * Confirm an appointment, or refuse it with a line saying why.
   *
   * Its own call rather than a field on `updateServiceLead`, matching the API:
   * that one moves an enquiry through the company's own pipeline, and this
   * changes a fact the customer is waiting on and can see on their own page.
   */
  decideBooking(
    id: number,
    payload: { status: BookingStatus; response?: string | null }
  ): Observable<{ id: number; bookingStatus: BookingStatus; stage: LeadStage }> {
    return this.api.patch<{ id: number; bookingStatus: BookingStatus; stage: LeadStage }>(
      `/admin/company/service-leads/${id}/booking`,
      payload
    );
  }

  /** One day of appointments, in time order - what the shop is doing tomorrow. */
  diary(date: string): Observable<{ date: string; items: ServiceLead[]; booked: number }> {
    return this.api.get<{ date: string; items: ServiceLead[]; booked: number }>(
      '/admin/company/service-leads/diary',
      { date }
    );
  }

  /* ------------------------------- blog ------------------------------- */

  /**
   * The posts — one page of them.
   *
   * Not `cards()`, which is unpaginated by design: a blog is as long as the
   * business has been writing, and it is the one list in this section that only
   * ever grows. Drafts and scheduled posts come back alongside what is live;
   * this is the writing desk, not the website.
   */
  listBlogPosts(query: ListQuery = {}): Observable<PagedResult<BlogPost>> {
    return this.api.list<BlogPost>('/admin/company/blog', query);
  }

  blogSummary(): Observable<BlogSummary> {
    return this.api.get<BlogSummary>('/admin/company/blog/summary');
  }

  /**
   * Every label this tenant has used, with a count.
   *
   * Read from the posts rather than from a table, because there is no table.
   * It feeds the filter above the list and the suggestions under the tag field,
   * and the second is the point: free-text tags with no list of what already
   * exists is how a blog ends up filed under `case-study`, `case study` and
   * `Case Studies` at once.
   */
  blogTags(): Observable<BlogTag[]> {
    return this.api
      .get<{ items: BlogTag[] }>('/admin/company/blog/tags')
      .pipe(map((result) => result.items ?? []));
  }

  getBlogPost(id: number): Observable<BlogPost> {
    return this.api.get<BlogPost>(`/admin/company/blog/${id}`);
  }

  createBlogPost(payload: Record<string, unknown>): Observable<BlogPost> {
    return this.api.post<BlogPost>('/admin/company/blog', payload);
  }

  updateBlogPost(id: number, payload: Record<string, unknown>): Observable<BlogPost> {
    return this.api.put<BlogPost>(`/admin/company/blog/${id}`, payload);
  }

  /**
   * Takes a post off the site, or puts it back.
   *
   * Leaves `publishedAt` alone — hiding an article and un-publishing it are
   * different acts, and a post hidden for a week comes back with its own date on
   * it rather than with today's.
   */
  toggleBlogPost(id: number): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`/admin/company/blog/${id}/status`, {});
  }

  removeBlogPost(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`/admin/company/blog/${id}`);
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
  /**
   * What a person may change about an enquiry.
   *
   * The stage and the note are how it is worked; `amount` and the payment are
   * what make it countable. A service is priced in words on the website because
   * it cannot be priced in advance, so the figure only exists once somebody has
   * looked at the job — `null` clears it back to "not quoted yet", which is a
   * real state and not the same as a quote of zero.
   */
  updateServiceLead(
    id: number,
    payload: {
      stage?: LeadStage;
      note?: string | null;
      amount?: number | null;
      paymentStatus?: string;
      paymentReference?: string | null;
    }
  ): Observable<ServiceLead> {
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
