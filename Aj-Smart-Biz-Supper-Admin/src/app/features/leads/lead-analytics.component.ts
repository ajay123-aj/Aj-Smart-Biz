import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CompanyService } from '../../core/services/company.service';
import { Company, LeadAnalytics, LEAD_STAGES } from '../../core/models/domain.model';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { LeadBreakdownComponent } from './lead-breakdown.component';

/**
 * Lead analysis across the whole platform.
 *
 * The screen the tenant console has, plus the one breakdown only this console
 * can compute: **leads per company**. That is the platform's headline number —
 * which tenants are getting traffic, and which bought a website nobody has
 * opened — so it leads the page rather than sitting among the other bars.
 *
 * Narrowing to one company with the filter turns this into that tenant's own
 * analysis, which is how a support conversation about "we are getting no
 * enquiries" gets answered without logging into their console.
 */
@Component({
  selector: 'app-super-lead-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, LeadBreakdownComponent],
  templateUrl: './lead-analytics.component.html',
  styles: [
    `
      .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .date-filter { display: flex; align-items: center; gap: 6px; }
      .date-filter input { width: 152px; }

      .trend { display: flex; align-items: flex-end; gap: 3px; height: 120px; padding-top: 6px; }
      .trend-col { flex: 1; min-width: 3px; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
      .trend-bar { border-radius: 3px 3px 0 0; background: var(--brand-600); min-height: 2px; }
      .trend-axis { display: flex; justify-content: space-between; margin-top: 8px; }

      .funnel { display: flex; flex-wrap: wrap; gap: 10px; }
      .funnel-step {
        flex: 1 1 120px; padding: 12px 14px;
        border: 1px solid var(--border); border-radius: var(--radius-sm);
        background: var(--surface-2);
      }
      .funnel-n { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .funnel-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); }

      .rank-code { color: var(--text-3); font-size: 12px; }
      .rank-n { font-weight: 700; font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class SuperLeadAnalyticsComponent {
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);

  readonly loading = signal(true);
  readonly data = signal<LeadAnalytics | null>(null);
  readonly companyOptions = signal<Company[]>([]);
  readonly stages = LEAD_STAGES;

  private readonly filters = signal<Record<string, string | boolean>>({});

  private readonly peakDay = computed(() => Math.max(1, ...(this.data()?.daily ?? []).map((day) => day.total)));

  /** Branch-wise counts as bars. `Company-wide` is a real bucket — see the API. */
  readonly branchRows = computed(() =>
    (this.data()?.branches ?? []).map((row) => ({ label: row.name, total: row.total }))
  );

  /** Company-wise counts as bars, for the summary alongside the ranked table. */
  readonly companyRows = computed(() =>
    (this.data()?.companies ?? []).slice(0, 10).map((row) => ({ label: row.name, total: row.total }))
  );

  constructor() {
    this.load();
    this.companies.list({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.companyOptions.set(result.items),
      error: () => this.companyOptions.set([]),
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

  barHeight(total: number): number {
    return Math.round((total / this.peakDay()) * 100);
  }

  dayLabel(day: string): string {
    const date = new Date(day);
    return Number.isNaN(date.getTime())
      ? day
      : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /** Visits divided by leads, per company — how often that tenant's visitors return. */
  returnRate(total: number, visits: number): string {
    return total ? (visits / total).toFixed(2) : '—';
  }

  load(): void {
    this.loading.set(true);
    this.api.get<LeadAnalytics>('/super-admin/leads/analytics', this.filters()).subscribe({
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
