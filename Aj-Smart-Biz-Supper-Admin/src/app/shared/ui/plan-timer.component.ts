import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { SubscriptionTimer } from '../../core/models/domain.model';

/**
 * Live countdown to a subscription's expiry.
 *
 * The API sends `msRemaining` measured on the server; this only ticks it down,
 * so a browser with a skewed clock still shows the same number of days left as
 * the tenant's own dashboard. It stops rendering seconds beyond a day out —
 * nobody is watching a 40-day term to the second, and a per-second repaint of a
 * 50-row table is wasted work.
 */
@Component({
  selector: 'app-plan-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (timer(); as t) {
      <div class="timer" [class]="'tone-' + tone()">
        <span class="clock">{{ display() }}</span>
        @if (showBar()) {
          <span class="bar" [attr.aria-label]="t.percentUsed + '% of the term used'">
            <span class="fill" [style.width.%]="t.percentUsed"></span>
          </span>
        }
        @if (showMeta()) {
          <span class="meta tiny muted">{{ meta() }}</span>
        }
      </div>
    } @else {
      <span class="muted tiny">—</span>
    }
  `,
  styles: [
    `
      .timer { display: inline-flex; flex-direction: column; gap: 4px; min-width: 108px; }
      .clock { font-variant-numeric: tabular-nums; font-weight: 650; font-size: 13px; white-space: nowrap; }
      .bar { display: block; height: 4px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
      .fill { display: block; height: 100%; border-radius: 999px; background: currentColor; }
      .meta { white-space: nowrap; }

      .tone-ok { color: var(--success); }
      .tone-soon { color: var(--warning); }
      .tone-urgent { color: var(--danger); }
      .tone-over { color: var(--danger); }
      .tone-idle { color: var(--text-3); }
      /* The bar borrows the tone colour; the number stays readable on its own. */
      .tone-idle .clock { color: var(--text-2); }
    `,
  ],
})
export class PlanTimerComponent {
  readonly timer = input.required<SubscriptionTimer | null | undefined>();
  /** Terms that are not running get a static label rather than a countdown. */
  readonly live = input(true);
  readonly showBar = input(true);
  readonly showMeta = input(true);

  private readonly destroyRef = inject(DestroyRef);
  /** Ticks purely to re-evaluate the computeds below. */
  private readonly now = signal(Date.now());
  /** When the current `msRemaining` was taken, so drift is measured from there. */
  private readonly receivedAt = signal(Date.now());
  private handle: ReturnType<typeof setInterval> | null = null;

  /** Milliseconds left, carried forward from the server's reading. */
  readonly remaining = computed(() => {
    const timer = this.timer();
    if (!timer) return 0;
    const drift = this.now() - this.receivedAt();
    return timer.msRemaining - drift;
  });

  readonly tone = computed(() => {
    const timer = this.timer();
    if (!timer || !this.live()) return 'idle';
    const ms = this.remaining();
    if (ms <= 0) return 'over';
    if (ms <= 3 * 86_400_000) return 'urgent';
    if (timer.isExpiringSoon) return 'soon';
    return 'ok';
  });

  readonly display = computed(() => {
    const timer = this.timer();
    if (!timer) return '—';
    if (!this.live()) return `${timer.termDays} day term`;

    const ms = this.remaining();
    if (ms <= 0) {
      const over = Math.max(1, Math.ceil(-ms / 86_400_000));
      return timer.inGrace ? `Grace · ${over}d over` : `Expired ${over}d ago`;
    }

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Past a day out the seconds are noise; inside it they are the point.
    if (days >= 1) return `${days}d ${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m ${seconds}s`;
  });

  readonly meta = computed(() => {
    const timer = this.timer();
    if (!timer) return '';
    if (!timer.hasStarted) return `starts ${new Date(timer.startsAt).toLocaleDateString('en-IN')}`;
    return `${timer.elapsedDays}/${timer.termDays} days used`;
  });

  constructor() {
    // Re-base the countdown whenever a fresh timer arrives from the API.
    effect(() => {
      this.timer();
      this.receivedAt.set(Date.now());
      this.now.set(Date.now());
    });

    this.handle = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      if (this.handle) clearInterval(this.handle);
    });
  }
}
