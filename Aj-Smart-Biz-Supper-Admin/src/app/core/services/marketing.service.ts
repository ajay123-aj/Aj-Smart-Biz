import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import { LeadStage } from '../models/domain.model';
import {
  MarketingContent,
  MarketingContentKey,
  MarketingEnquiry,
  MarketingEnquiryStatus,
  MarketingFaq,
  MarketingLead,
  MarketingLeadAnalytics,
  MarketingLeadSummary,
  MarketingLeadVisit,
} from '../models/marketing.model';
import { ApiService } from './api.service';

/**
 * Our own marketing site: its writing, its FAQ and the enquiries it takes.
 *
 * Not a `CrudClient`. The three resources behind `/super-admin/marketing` do
 * not share the master-table REST shape the four master tables do — content is
 * keyed by name and upserted, the FAQ has no status toggle or restore, and an
 * enquiry is patched rather than replaced — so forcing them through that client
 * would mean four methods that 404.
 */
@Injectable({ providedIn: 'root' })
export class MarketingService {
  private readonly api = inject(ApiService);
  private readonly base = '/super-admin/marketing';

  /* ------------------------------ the writing ----------------------------- */

  /** Every section, **including inactive ones** — the console has to show a
   *  section that is switched off in order to switch it back on. */
  listContent(): Observable<MarketingContent[]> {
    return this.api.get<MarketingContent[]>(`${this.base}/content`);
  }

  getContent(key: MarketingContentKey): Observable<MarketingContent> {
    return this.api.get<MarketingContent>(`${this.base}/content/${key}`);
  }

  /**
   * An upsert, not a create/update pair.
   *
   * The set of keys is fixed in the API, so a section always conceptually
   * exists; whether a row has been written for it yet is not something this
   * console should have to ask about before it can save.
   */
  saveContent(
    key: MarketingContentKey,
    body: { payload: Record<string, unknown>; label?: string | null; status?: string }
  ): Observable<MarketingContent> {
    return this.api.put<MarketingContent>(`${this.base}/content/${key}`, body);
  }

  /* -------------------------------- the FAQ ------------------------------- */

  listFaqs(): Observable<MarketingFaq[]> {
    return this.api.get<MarketingFaq[]>(`${this.base}/faqs`);
  }

  createFaq(body: Partial<MarketingFaq>): Observable<MarketingFaq> {
    return this.api.post<MarketingFaq>(`${this.base}/faqs`, body);
  }

  updateFaq(id: number, body: Partial<MarketingFaq>): Observable<MarketingFaq> {
    return this.api.put<MarketingFaq>(`${this.base}/faqs/${id}`, body);
  }

  /**
   * Removes a question.
   *
   * A soft delete on the API side — every model there is `paranoid` — so the
   * row survives with a `deleted_at` and drops out of every read. To take a
   * question off the site *reversibly*, set its status to inactive instead.
   */
  removeFaq(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`${this.base}/faqs/${id}`);
  }

  /* ----------------------------- the enquiries ---------------------------- */

  listEnquiries(query: ListQuery = {}): Observable<PagedResult<MarketingEnquiry>> {
    return this.api.list<MarketingEnquiry>(`${this.base}/enquiries`, query);
  }

  getEnquiry(id: number): Observable<MarketingEnquiry> {
    return this.api.get<MarketingEnquiry>(`${this.base}/enquiries/${id}`);
  }

  /**
   * Status and our own note, and nothing else.
   *
   * What the sender typed stays as they typed it: correcting it here would turn
   * a message into a record that reads as if they had said something they did
   * not. The API refuses the other fields for the same reason.
   */
  updateEnquiry(
    id: number,
    body: { status?: MarketingEnquiryStatus; note?: string | null }
  ): Observable<MarketingEnquiry> {
    return this.api.patch<MarketingEnquiry>(`${this.base}/enquiries/${id}`, body);
  }

  /* ------------------------------ the traffic ----------------------------- */

  /**
   * Everyone who has visited the marketing site — one row per device.
   *
   * Crawlers are excluded by the API unless `includeBots` is passed, because a
   * lead list is a list of people.
   */
  listLeads(query: ListQuery = {}): Observable<PagedResult<MarketingLead>> {
    return this.api.list<MarketingLead>(`${this.base}/leads`, query);
  }

  /** The counters above the table, under whatever filters are set. */
  leadSummary(query: ListQuery = {}): Observable<MarketingLeadSummary> {
    return this.api.get<MarketingLeadSummary>(`${this.base}/leads/summary`, query);
  }

  /** The campaign report. First touch throughout — see the model. */
  leadAnalytics(query: ListQuery = {}): Observable<MarketingLeadAnalytics> {
    return this.api.get<MarketingLeadAnalytics>(`${this.base}/leads/analytics`, query);
  }

  getLead(id: number): Observable<MarketingLead> {
    return this.api.get<MarketingLead>(`${this.base}/leads/${id}`);
  }

  leadVisits(id: number, query: ListQuery = {}): Observable<PagedResult<MarketingLeadVisit>> {
    return this.api.list<MarketingLeadVisit>(`${this.base}/leads/${id}/visits`, query);
  }

  /**
   * Stage, notes, and who they turned out to be.
   *
   * Nothing the browser reported is editable: the traffic is a record of what
   * happened, and correcting a campaign here would quietly falsify the report
   * that campaign is judged by. The API refuses those fields too.
   */
  updateLead(
    id: number,
    body: { stage?: LeadStage; name?: string | null; email?: string | null; phone?: string | null; notes?: string | null }
  ): Observable<MarketingLead> {
    return this.api.patch<MarketingLead>(`${this.base}/leads/${id}`, body);
  }
}
