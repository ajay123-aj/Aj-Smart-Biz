import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfirmService } from '../../core/services/confirm.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Subscription, SubscriptionEvent, SubscriptionEventType } from '../../core/models/domain.model';
import { formatMoney } from '../../shared/utils';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/** Icon and wording for each entry in the transition trail. */
const EVENT_LABELS: Record<SubscriptionEventType, { icon: string; label: string }> = {
  created: { icon: '✨', label: 'Created' },
  activated: { icon: '🟢', label: 'Activated' },
  scheduled: { icon: '🗓️', label: 'Scheduled' },
  renewed: { icon: '🔁', label: 'Renewed' },
  upgraded: { icon: '⬆️', label: 'Upgraded' },
  downgraded: { icon: '⬇️', label: 'Downgraded' },
  crossgraded: { icon: '↔️', label: 'Plan swapped' },
  suspended: { icon: '⏸️', label: 'Suspended' },
  resumed: { icon: '▶️', label: 'Resumed' },
  cancelled: { icon: '🚫', label: 'Cancelled' },
  expired: { icon: '⛔', label: 'Expired' },
  reactivated: { icon: '♻️', label: 'Reactivated' },
  superseded: { icon: '📦', label: 'Superseded' },
  term_extended: { icon: '⏳', label: 'Term extended' },
  auto_renew_on: { icon: '🔄', label: 'Auto renew on' },
  auto_renew_off: { icon: '⏹️', label: 'Auto renew off' },
  payment_recorded: { icon: '🧾', label: 'Payment recorded' },
};

@Component({
  selector: 'app-subscription-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, PageHeaderComponent, StatusBadgeComponent, PlanTimerComponent],
  templateUrl: './subscription-detail.component.html',
  styles: [
    `
      .trail { list-style: none; margin: 0; padding: 4px 0; }
      .trail li { display: flex; gap: 12px; padding: 10px 16px; }
      .trail li + li { border-top: 1px solid var(--border); }
      .trail-icon {
        flex-shrink: 0; display: grid; place-items: center;
        width: 30px; height: 30px; border-radius: 50%;
        background: var(--surface-3); font-size: 14px;
      }
      .trail-body { min-width: 0; flex: 1; }
      .trail-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: space-between; }

      .feature-list { list-style: none; margin: 0; padding: 0; }
      .feature-list li { padding: 4px 0; font-size: 13px; }
      .feature-list li::before { content: '✓'; color: var(--success); margin-right: 8px; font-weight: 700; }

      .limits { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
      .limit { background: var(--surface-3); border-radius: var(--radius-sm); padding: 10px 12px; }
      .limit-value { font-size: 18px; font-weight: 700; }

      .term-row { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
    `,
  ],
})
export class SubscriptionDetailComponent {
  readonly id = input.required<string>();

  private readonly subscriptions = inject(SubscriptionService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly record = signal<Subscription | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);

  readonly subscriptionId = computed(() => Number(this.id()));

  /** Plan terms as they were sold, falling back to the plan row when older. */
  readonly terms = computed(() => {
    const row = this.record();
    return row?.planSnapshot ?? row?.plan ?? null;
  });

  readonly features = computed(() => this.terms()?.features ?? []);

  constructor() {
    effect(() => {
      const id = this.subscriptionId();
      if (!Number.isFinite(id)) return;
      this.load(id);
    });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.subscriptions.getById(id).subscribe({
      next: (row) => {
        this.record.set(row);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the subscription', messageOf(error));
        void this.router.navigate(['/subscriptions']);
      },
    });
  }

  private refresh(): void {
    this.load(this.subscriptionId());
  }

  /* ------------------------------ helpers ------------------------------ */

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  isLive(row: Subscription): boolean {
    return row.status === 'active' || row.status === 'suspended';
  }

  can(status: Subscription['status']): boolean {
    return (this.record()?.allowedTransitions ?? []).includes(status);
  }

  eventIcon(type: SubscriptionEventType): string {
    return EVENT_LABELS[type]?.icon ?? '•';
  }

  eventLabel(type: SubscriptionEventType): string {
    return EVENT_LABELS[type]?.label ?? String(type).replace(/_/g, ' ');
  }

  /** The one-line story of an event: who, from what, to what. */
  eventDetail(event: SubscriptionEvent): string {
    const parts: string[] = [];
    if (event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus) {
      parts.push(`${event.fromStatus} → ${event.toStatus}`);
    }
    if (event.fromPlan?.name && event.toPlan?.name && event.fromPlan.name !== event.toPlan.name) {
      parts.push(`${event.fromPlan.name} → ${event.toPlan.name}`);
    }
    if (event.reason) parts.push(event.reason);
    return parts.join(' · ');
  }

  changeLabel(type: string | undefined): string {
    if (!type) return '—';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  /* ---------------------------- transitions ---------------------------- */

  private run(request: Observable<unknown>, message: string): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(message);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.error('That change was refused', messageOf(error));
      },
    });
  }

  async suspend(): Promise<void> {
    const row = this.record();
    if (!row) return;
    const ok = await this.confirm.ask({
      title: 'Suspend this plan?',
      message: 'The term keeps its dates but the company loses access until it is resumed.',
      confirmText: 'Suspend',
      danger: true,
    });
    if (ok) this.run(this.subscriptions.suspend(row.id, 'Suspended from the subscription screen'), 'Plan suspended');
  }

  resume(): void {
    const row = this.record();
    if (row) this.run(this.subscriptions.resume(row.id), 'Plan resumed');
  }

  async cancel(): Promise<void> {
    const row = this.record();
    if (!row) return;
    const ok = await this.confirm.ask({
      title: 'Cancel this subscription?',
      message: 'The term ends now. Cancelling is final — a new term is the only way back.',
      confirmText: 'Cancel subscription',
      danger: true,
    });
    if (ok) this.run(this.subscriptions.cancel(row.id, 'Cancelled from the subscription screen'), 'Subscription cancelled');
  }

  async expire(): Promise<void> {
    const row = this.record();
    if (!row) return;
    const ok = await this.confirm.ask({
      title: 'Expire this term now?',
      message: 'The term closes at today’s date rather than waiting for its end date.',
      confirmText: 'Expire now',
      danger: true,
    });
    if (ok) this.run(this.subscriptions.expire(row.id, 'Expired manually'), 'Term expired');
  }

  async startNow(): Promise<void> {
    const row = this.record();
    if (!row) return;
    const ok = await this.confirm.ask({
      title: 'Start this plan today?',
      message: 'It keeps its full duration, so the end date moves. Whatever is running now is closed.',
      confirmText: 'Start now',
    });
    if (ok) this.run(this.subscriptions.startNow(row.id), 'Scheduled plan started');
  }

  async reactivate(): Promise<void> {
    const row = this.record();
    if (!row) return;
    const ok = await this.confirm.ask({
      title: 'Reactivate on this plan?',
      message: 'A fresh term starts today. This finished term stays in the history.',
      confirmText: 'Reactivate',
    });
    if (ok) this.run(this.subscriptions.reactivate(row.id), 'Subscription reactivated');
  }

  toggleAutoRenew(): void {
    const row = this.record();
    if (!row) return;
    const next = !row.autoRenew;
    this.run(
      this.subscriptions.setAutoRenew(row.id, next),
      next ? 'Auto renew switched on' : 'Auto renew switched off'
    );
  }
}
