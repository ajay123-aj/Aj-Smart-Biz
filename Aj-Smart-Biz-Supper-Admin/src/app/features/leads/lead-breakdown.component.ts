import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LeadTally } from '../../core/models/domain.model';

/**
 * One "top N" breakdown — sources, campaigns, cities, browsers.
 *
 * A bar list rather than a pie: these are ranked comparisons of a handful of
 * labelled things, and the question is always "which is biggest, and by how
 * much". A row of bars answers that at a glance and stays readable at eight
 * entries, where a pie chart has long since become a legend with a circle
 * next to it.
 *
 * Bars are scaled against the **largest bucket**, not against the total. The
 * point is the comparison between rows; scaling to the total would leave every
 * bar a sliver whenever there is a long tail, which is most of the time.
 */
@Component({
  selector: 'app-lead-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <div class="card-head">
        <h3 class="card-title">{{ title() }}</h3>
        @if (hint()) {
          <span class="tiny muted" style="margin-left:auto">{{ hint() }}</span>
        }
      </div>
      <div class="card-body">
        @if (!rows().length) {
          <p class="muted mb-0 tiny">{{ emptyText() }}</p>
        }
        @for (row of rows(); track row.label) {
          <div class="bar-row">
            <span class="bar-label" [title]="row.label">{{ row.label }}</span>
            <span class="bar-track">
              <span class="bar-fill" [style.width.%]="width(row.total)"></span>
            </span>
            <span class="bar-total">{{ row.total }}</span>
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .bar-row {
        display: grid;
        grid-template-columns: minmax(90px, 1fr) minmax(60px, 2fr) 46px;
        align-items: center;
        gap: 10px;
        padding: 5px 0;
      }
      .bar-label {
        font-size: 13px;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar-track {
        height: 8px;
        border-radius: 999px;
        background: var(--surface-3);
        overflow: hidden;
      }
      .bar-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--brand-600);
        /* A bucket with one lead still has to be visible as a bar. */
        min-width: 3px;
      }
      .bar-total {
        text-align: right;
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--text-2);
      }
    `,
  ],
})
export class LeadBreakdownComponent {
  readonly title = input.required<string>();
  readonly rows = input.required<LeadTally[]>();
  readonly hint = input<string>('');
  readonly emptyText = input<string>('Nothing recorded in this period.');

  private readonly peak = computed(() => Math.max(1, ...this.rows().map((row) => row.total)));

  width(total: number): number {
    return Math.round((total / this.peak()) * 100);
  }
}
