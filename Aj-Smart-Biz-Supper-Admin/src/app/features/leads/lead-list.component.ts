import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CompanyService } from '../../core/services/company.service';
import { Company, Lead, LeadSummary, LEAD_STAGES } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { PagerComponent } from '../../shared/ui/pager.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';
import { LeadStageBadgeComponent } from './lead-stage-badge.component';
import { deviceLabel, machineLabel, placeLabel, sourceLabel, whoLabel } from './lead-format';

/**
 * Every tenant's website leads, in one table.
 *
 * The same controller the company console reads through — the scope comes from
 * the token, so mounting it under the platform's routes is what makes it
 * cross-tenant. The two extra things this view has are the **company** column
 * and the company filter; everything else is the tenant screen.
 *
 * Read-only on purpose. Which stage a lead is at is the company's judgement
 * about its own customer, and the platform has no business overwriting it —
 * the API exposes no write route here at all.
 */
@Component({
  selector: 'app-super-lead-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TitleCasePipe,
    RouterLink,
    PagerComponent,
    PageHeaderComponent,
    TableStateComponent,
    LeadStageBadgeComponent,
  ],
  templateUrl: './lead-list.component.html',
  styles: [
    `
      .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .who-id {
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 11.5px; color: var(--text-3);
        max-width: 20ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .stack { display: flex; flex-direction: column; gap: 2px; }
      .visits-n { font-weight: 700; font-variant-numeric: tabular-nums; }
      .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .date-filter { display: flex; align-items: center; gap: 6px; }
      .date-filter input { width: 148px; }
      .bot-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); }
    `,
  ],
})
export class SuperLeadListComponent {
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);

  readonly store = new ListStore<Lead>((query) => this.api.list<Lead>('/super-admin/leads', query), { limit: 25 });

  readonly companyOptions = signal<Company[]>([]);
  readonly summary = signal<LeadSummary | null>(null);
  readonly stages = LEAD_STAGES;

  private readonly filters = signal<Record<string, string | number | boolean>>({});

  readonly showingBots = computed(() => this.filters()['includeBots'] === true);

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload();
    this.companies.list({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.companyOptions.set(result.items),
      // The table still works without the picker; only the filter is lost.
      error: () => this.companyOptions.set([]),
    });
  }

  readonly who = whoLabel;
  readonly device = deviceLabel;
  readonly machine = machineLabel;
  readonly place = placeLabel;
  readonly source = sourceLabel;

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  onSearch(event: Event): void {
    const search = this.inputValue(event);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.apply({ search }), 350);
  }

  /** Moves the table and the counters above it together — see the tenant console. */
  apply(partial: Record<string, string | number | boolean>): void {
    const next = { ...this.filters() };
    Object.entries(partial).forEach(([key, value]) => {
      if (value === '' || value === false || value === null || value === undefined) delete next[key];
      else next[key] = value;
    });
    this.filters.set(next);
    this.store.patch(next);
    this.loadSummary();
  }

  reload(): void {
    this.store.reload();
    this.loadSummary();
  }

  private loadSummary(): void {
    this.api.get<LeadSummary>('/super-admin/leads/summary', this.filters()).subscribe({
      next: (data) => this.summary.set(data),
      error: () => this.summary.set(null),
    });
  }
}
