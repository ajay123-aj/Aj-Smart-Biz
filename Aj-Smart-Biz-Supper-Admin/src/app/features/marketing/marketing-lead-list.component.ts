import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ListQuery, PageMeta } from '../../core/models/api.model';
import { LEAD_STAGES, LeadStage } from '../../core/models/domain.model';
import { MarketingLead, MarketingLeadSummary } from '../../core/models/marketing.model';
import { MarketingService } from '../../core/services/marketing.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/**
 * Everyone who has visited our own marketing site.
 *
 * The tenant equivalent is Lead Management; this is the same screen over our
 * own traffic. **One row per device, not per page load** — somebody who comes
 * back four times is one lead with four visits, which is what a salesperson
 * means by a lead.
 *
 * The column that makes this worth having is `enquiryId`: it joins "read the
 * pricing page four times" to "asked for a demo", which is the only way to see
 * which campaign actually produced customers rather than traffic.
 */
@Component({
  selector: 'app-marketing-lead-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    PageHeaderComponent,
    PagerComponent,
    TableStateComponent,
    ModalComponent,
  ],
  templateUrl: './marketing-lead-list.component.html',
})
export class MarketingLeadListComponent {
  private readonly service = inject(MarketingService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly stages = LEAD_STAGES;

  readonly rows = signal<MarketingLead[]>([]);
  readonly meta = signal<PageMeta>({ total: 0, page: 1, limit: 25, totalPages: 1, hasNext: false });
  readonly summary = signal<MarketingLeadSummary | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);

  readonly editing = signal<MarketingLead | null>(null);

  readonly filters = this.fb.nonNullable.group({
    search: [''],
    stage: [''],
    /** Blank = all time. The API reads this as "look back N days". */
    days: [''],
    enquiredOnly: [false],
    /**
     * Crawlers are stored but hidden by default — a lead list is a list of
     * people. The toggle exists because traffic that jumps overnight deserves
     * to show why.
     */
    includeBots: [false],
  });

  readonly form = this.fb.nonNullable.group({
    stage: ['new'],
    name: [''],
    email: [''],
    phone: [''],
    notes: [''],
  });

  private query: ListQuery = { page: 1, limit: 25 };

  constructor() {
    this.load();
  }

  load(page = this.query.page ?? 1): void {
    this.loading.set(true);
    this.failed.set(false);

    const { search, stage, days, enquiredOnly, includeBots } = this.filters.getRawValue();
    /**
     * Blank strings and `false` are dropped rather than sent.
     *
     * `ApiService.toParams` already skips empty values, but `false` is not
     * empty — sending `enquiredOnly=false` would be harmless and sending
     * `includeBots=false` equally so, yet both would show up in the URL and
     * read as deliberate. Kept out so the query string says only what was asked.
     */
    this.query = {
      page,
      limit: 25,
      search,
      stage,
      days,
      ...(enquiredOnly ? { enquiredOnly: true } : {}),
      ...(includeBots ? { includeBots: true } : {}),
    };

    this.service.listLeads(this.query).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.meta.set(result.meta);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });

    /**
     * Fired alongside the list rather than after it.
     *
     * The two answer different questions — "these leads, this page" and "all of
     * them, under these filters" — and neither needs the other's result, so
     * chaining them would just make the counters appear a round trip late.
     */
    const { page: _p, limit: _l, ...summaryQuery } = this.query;
    this.service.leadSummary(summaryQuery).subscribe({
      next: (data) => this.summary.set(data),
      error: () => this.summary.set(null),
    });
  }

  applyFilters(): void {
    this.load(1);
  }

  clearFilters(): void {
    this.filters.reset({ search: '', stage: '', days: '', enquiredOnly: false, includeBots: false });
    this.load(1);
  }

  /** One of the range buttons above the table. */
  setRange(days: string): void {
    this.filters.patchValue({ days });
    this.load(1);
  }

  edit(row: MarketingLead): void {
    this.editing.set(row);
    this.form.reset({
      stage: row.stage,
      name: row.name ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      notes: row.notes ?? '',
    });
  }

  close(): void {
    this.editing.set(null);
  }

  save(): void {
    const row = this.editing();
    if (!row) return;

    this.saving.set(true);
    const { stage, name, email, phone, notes } = this.form.getRawValue();

    this.service
      .updateLead(row.id, {
        stage: stage as LeadStage,
        name: name || null,
        email: email || null,
        phone: phone || null,
        notes: notes || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Lead updated');
          this.close();
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }

  /** Colours the stage chip. `new` is the one nobody has looked at yet. */
  stageClass(stage: LeadStage): string {
    switch (stage) {
      case 'new':
        return 'badge badge-warning';
      case 'contacted':
      case 'qualified':
        return 'badge badge-info';
      case 'converted':
        return 'badge badge-success';
      default:
        return 'badge';
    }
  }

  /**
   * The campaign that produced this lead, as one readable line.
   *
   * First touch, so it is the ad that won them rather than the last link they
   * happened to click. "Direct" where there was no campaign and no referrer —
   * somebody who typed the address, which is a real and useful answer.
   */
  campaignOf(row: MarketingLead): string {
    const parts = [row.utmSource, row.utmMedium, row.utmCampaign].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    return row.firstReferrerHost || 'Direct';
  }

  whoOf(row: MarketingLead): string {
    return row.name || row.email || row.phone || row.deviceId.slice(0, 12) + '…';
  }
}
