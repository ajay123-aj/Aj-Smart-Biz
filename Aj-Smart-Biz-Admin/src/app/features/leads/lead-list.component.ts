import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CompanyService } from '../../core/services/company.service';
import { Branch, Lead, LeadSummary, LEAD_STAGES } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { PagerComponent } from '../../shared/ui/pager.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';
import { LeadStageBadgeComponent } from './lead-stage-badge.component';
import { deviceLabel, machineLabel, placeLabel, sourceLabel, whoLabel } from './lead-format';

/**
 * Everyone who has opened the company's public website.
 *
 * **One row per device.** A visitor who has been back four times is one row
 * here with four visits behind it, not four rows — that is what the `leads`
 * table is, and it is why this screen is a list of people rather than a
 * page-view log. The visits themselves are one click away, on the detail
 * screen the View action opens.
 *
 * Crawlers are excluded unless the filter asks for them. They are recorded, so
 * a company whose numbers jump overnight can see why, but the headline count
 * has to be a count of people.
 */
@Component({
  selector: 'app-lead-list',
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
        max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .stack { display: flex; flex-direction: column; gap: 2px; }
      .visits { display: inline-flex; align-items: baseline; gap: 5px; }
      .visits-n { font-weight: 700; font-variant-numeric: tabular-nums; }
      .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .date-filter { display: flex; align-items: center; gap: 6px; }
      .date-filter input { width: 148px; }
      .bot-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); }
    `,
  ],
})
export class LeadListComponent {
  private readonly api = inject(ApiService);
  private readonly company = inject(CompanyService);

  readonly store = new ListStore<Lead>((query) => this.api.list<Lead>('/admin/company/leads', query), { limit: 25 });

  readonly branches = signal<Branch[]>([]);
  readonly summary = signal<LeadSummary | null>(null);
  readonly stages = LEAD_STAGES;

  /** Kept so the summary strip can be refetched under the same filters as the table. */
  private readonly filters = signal<Record<string, string | number | boolean>>({});

  readonly showingBots = computed(() => this.filters()['includeBots'] === true);

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload();
    this.company.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      // The screen still works without them; the branch picker just stays empty.
      error: () => this.branches.set([]),
    });
  }

  /* ---------------- Formatting, shared with the detail screen ---------------- */

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

  /**
   * Applies a filter to the table **and** the counters above it.
   *
   * They have to move together: a strip saying "312 leads" above a table
   * showing this month's forty is the kind of disagreement that gets a report
   * distrusted entirely. An empty value is dropped rather than sent, so
   * clearing a filter widens the query instead of asking for the empty string.
   */
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
    this.api.get<LeadSummary>('/admin/company/leads/summary', this.filters()).subscribe({
      next: (data) => this.summary.set(data),
      // The table is the screen; the counters are a convenience above it.
      error: () => this.summary.set(null),
    });
  }
}
