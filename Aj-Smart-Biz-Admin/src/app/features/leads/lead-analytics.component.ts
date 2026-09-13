import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CompanyService } from '../../core/services/company.service';
import { Branch, LeadAnalytics, LEAD_STAGES } from '../../core/models/domain.model';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { LeadBreakdownComponent } from './lead-breakdown.component';
import { stageLabel } from '../../shared/utils';

/**
 * Where this company's website visitors come from.
 *
 * The same aggregation the platform console renders, scoped by the token to
 * this tenant — see the API's `lead.controller`. A company reads it to find out
 * which campaigns are worth the money; the platform reads it to find out which
 * tenants are getting traffic. One query set, two audiences, so the two can
 * never quote different numbers at each other.
 */
@Component({
  selector: 'app-lead-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, LeadBreakdownComponent],
  templateUrl: './lead-analytics.component.html',
  styles: [
    `
      .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .date-filter { display: flex; align-items: center; gap: 6px; }
      .date-filter input { width: 152px; }

      /* The daily trend. A column per day, scaled to the busiest one. */
      .trend { display: flex; align-items: flex-end; gap: 3px; height: 120px; padding-top: 6px; }
      .trend-col { flex: 1; min-width: 3px; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
      .trend-bar { border-radius: 3px 3px 0 0; background: var(--brand-600); min-height: 2px; }
      .trend-axis { display: flex; justify-content: space-between; margin-top: 8px; }

      .funnel { display: flex; flex-wrap: wrap; gap: 10px; }
      .funnel-step {
        flex: 1 1 120px;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface-2);
      }
      .funnel-n { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .funnel-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); }
    `,
  ],
})
export class LeadAnalyticsComponent {
  private readonly api = inject(ApiService);
  private readonly company = inject(CompanyService);

  readonly loading = signal(true);
  readonly data = signal<LeadAnalytics | null>(null);
  readonly branches = signal<Branch[]>([]);
  /** The same words the badges use. */
  stageLabel = stageLabel;

  readonly stages = LEAD_STAGES;

  private readonly filters = signal<Record<string, string | boolean>>({});

  /** The busiest day, so every column is scaled against something real. */
  private readonly peakDay = computed(() => Math.max(1, ...(this.data()?.daily ?? []).map((day) => day.total)));

  /**
   * The branch breakdown, as bars.
   *
   * `branchId: null` is the company-wide site and is a real bucket — usually
   * the largest — so it is labelled and kept rather than filtered out. A
   * breakdown that quietly dropped it would not add up to the total printed
   * above it on the same screen.
   */
  readonly branchRows = computed(() =>
    (this.data()?.branches ?? []).map((row) => ({ label: row.name, total: row.total }))
  );

  constructor() {
    this.load();
    this.company.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  apply(partial: Record<string, string | boolean>): void {
    const next = { ...this.filters() };
    Object.entries(partial).forEach(([key, value]) => {
      if (value === '' || value === false) delete next[key];
      else next[key] = value;
    });
    this.filters.set(next);
    this.load();
  }

  /** Height of one column in the trend, as a percentage of the busiest day. */
  barHeight(total: number): number {
    return Math.round((total / this.peakDay()) * 100);
  }

  /** `2026-08-25` -> `25 Aug`. Only the ends of the axis are labelled. */
  dayLabel(day: string): string {
    const date = new Date(day);
    return Number.isNaN(date.getTime())
      ? day
      : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  load(): void {
    this.loading.set(true);
    this.api.get<LeadAnalytics>('/admin/company/leads/analytics', this.filters()).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.data.set(null);
        this.loading.set(false);
      },
    });
  }
}
