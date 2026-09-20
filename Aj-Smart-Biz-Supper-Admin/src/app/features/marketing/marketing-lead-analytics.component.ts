import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MarketingLeadAnalytics } from '../../core/models/marketing.model';
import { MarketingService } from '../../core/services/marketing.service';
import { LeadBreakdownComponent } from '../leads/lead-breakdown.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

/**
 * Where the traffic on our own marketing site came from — the campaign report.
 *
 * **First touch throughout.** The `utm_*` values on a lead are the campaign
 * that *produced* it, written once and never overwritten, so somebody who
 * arrives from an ad and returns a week later by typing the address still
 * counts for the ad. That is what a campaign report has to mean; last touch is
 * on the lead's own row for the one question it answers better.
 *
 * The two campaign panels are meant to be read together, and the page puts them
 * side by side for that reason: **Campaigns by traffic** is how loud a campaign
 * was, **Campaigns by enquiries** is whether it worked. A campaign can win the
 * first and lose the second, and that gap is the only thing on this page worth
 * changing a budget over.
 */
@Component({
  selector: 'app-marketing-lead-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, PageHeaderComponent, LeadBreakdownComponent],
  templateUrl: './marketing-lead-analytics.component.html',
  styles: [
    `
      .trend { display: flex; align-items: flex-end; gap: 3px; height: 120px; padding-top: 6px; }
      .trend-col {
        flex: 1; min-width: 3px;
        display: flex; flex-direction: column; justify-content: flex-end; height: 100%;
      }
      .trend-bar { border-radius: 3px 3px 0 0; background: var(--brand-600); min-height: 2px; }
      .trend-axis { display: flex; justify-content: space-between; margin-top: 8px; }
    `,
  ],
})
export class MarketingLeadAnalyticsComponent {
  private readonly service = inject(MarketingService);
  private readonly fb = inject(FormBuilder);

  readonly data = signal<MarketingLeadAnalytics | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  readonly filters = this.fb.nonNullable.group({
    days: ['30'],
    includeBots: [false],
    /** How many rows each breakdown shows. */
    limit: ['10'],
  });

  /**
   * The tallest day in the trend, used to scale the bars.
   *
   * Against the peak rather than the total, for the same reason the breakdown
   * bars are: the question is which day was busiest and by how much, and
   * scaling to the total leaves every bar a sliver.
   *
   * Floored at 1 so a period with no traffic divides by something.
   */
  private readonly peakDay = computed(() => Math.max(1, ...(this.data()?.daily ?? []).map((d) => d.total)));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);

    const { days, includeBots, limit } = this.filters.getRawValue();

    this.service
      /* `limit` is a number in `ListQuery`; the select hands back a string. */
      .leadAnalytics({ days, limit: Number(limit), ...(includeBots ? { includeBots: true } : {}) })
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }

  barHeight(total: number): number {
    return Math.round((total / this.peakDay()) * 100);
  }
}
