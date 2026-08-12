import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlanUsageLine } from '../../core/models/domain.model';

/**
 * The bar shown above a list once its plan limit is reached, or the plan behind
 * it has lapsed. The wording comes straight from the API, so this says exactly
 * what a create request would have been refused with.
 */
@Component({
  selector: 'app-limit-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (line(); as l) {
      @if (!l.canCreate) {
        <div class="limit" [class.hard]="l.reason !== 'limit_reached'">
          <span class="icon" aria-hidden="true">{{ l.reason === 'limit_reached' ? '🚫' : '⚠️' }}</span>
          <span class="body">
            <strong>{{ headline() }}</strong>
            <span class="tiny">{{ l.message }}</span>
          </span>
          @if (showAction()) {
            <a class="btn btn-sm btn-primary" routerLink="/plan">Upgrade your plan</a>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .limit {
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        padding: 12px 16px; margin-bottom: 14px;
        border-radius: var(--radius);
        background: var(--warning-bg); color: var(--warning);
        font-size: 13.5px;
      }
      .limit.hard { background: var(--danger-bg); color: var(--danger); }
      .icon { font-size: 16px; }
      .body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 200px; }
      .limit .btn { margin-left: auto; }
    `,
  ],
})
export class LimitNoticeComponent {
  /** The metric line from `quota.metrics`, e.g. `quota.metrics.branches`. */
  readonly line = input.required<PlanUsageLine | null | undefined>();
  /** What is being capped, for the headline: "branch", "admin". */
  readonly resource = input('record');
  /** Hidden on screens the tenant cannot act from. */
  readonly showAction = input(true);

  readonly headline = computed(() => {
    const line = this.line();
    if (!line) return '';
    const resource = this.resource();
    switch (line.reason) {
      case 'limit_reached':
        return `${resource.charAt(0).toUpperCase()}${resource.slice(1)} limit reached — ${line.used} of ${line.limit} used`;
      case 'expired':
        return 'Your plan has expired';
      case 'suspended':
        return 'Your plan is suspended';
      case 'no_plan':
        return 'No active plan';
      default:
        return '';
    }
  });
}
