import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  AvailablePlan,
  MyPlanView,
  PlanCatalogue,
  PlanRequest,
  PlanUsageLine,
  Subscription,
} from '../../core/models/domain.model';
import { formatMoney } from '../../shared/utils';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/**
 * A plan parameter as the screen renders it. Tracked ones (branches, admins)
 * carry live usage; the rest show the ceiling they were sold, marked so nobody
 * reads a blank meter as "zero used".
 */
interface UsageRow {
  key: string;
  label: string;
  used: number | null;
  limit: number | null;
  percent: number;
  atLimit: boolean;
  unlimited: boolean;
  /** False for limits the platform does not meter yet. */
  tracked: boolean;
  hint: string;
}

const TRACKED: { key: 'branches' | 'admins'; label: string }[] = [
  { key: 'branches', label: 'Branches' },
  { key: 'admins', label: 'Admins' },
];

/**
 * Sold as part of the plan but not metered by the platform yet. Shown anyway —
 * they are part of what the company bought — but labelled honestly rather than
 * given a fabricated usage number.
 */
const UNTRACKED: { key: 'maxUsers' | 'storageMb'; label: string; hint: string }[] = [
  { key: 'maxUsers', label: 'Users', hint: 'included in your plan' },
  { key: 'storageMb', label: 'Storage', hint: 'MB included' },
];

@Component({
  selector: 'app-my-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    ModalComponent,
    PageHeaderComponent,
    PlanTimerComponent,
    StatusBadgeComponent,
    TableStateComponent,
  ],
  templateUrl: './my-plan.component.html',
  styles: [
    `
      .hero { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; justify-content: space-between; }
      .hero-plan { font-size: 26px; font-weight: 750; line-height: 1.2; }
      .hero-facts { display: flex; flex-wrap: wrap; gap: 26px; margin-top: 16px; }
      .fact-value { font-weight: 700; font-size: 15px; margin-top: 3px; }

      .notice {
        display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
        padding: 12px 16px; border-radius: var(--radius); margin-bottom: 18px;
        font-size: 13.5px;
      }
      .notice.warn { background: var(--warning-bg); color: var(--warning); }
      .notice.bad { background: var(--danger-bg); color: var(--danger); }
      .notice.info { background: var(--info-bg); color: var(--info); }

      .usage { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
      .usage-item { background: var(--surface-3); border-radius: var(--radius-sm); padding: 12px 14px; }
      .usage-value { font-size: 18px; font-weight: 700; margin: 4px 0 8px; }
      .meter { height: 5px; border-radius: 999px; background: var(--border); overflow: hidden; }
      .meter-fill { display: block; height: 100%; border-radius: 999px; background: var(--brand-600); }
      .meter-fill.full { background: var(--danger); }

      .feature-list { list-style: none; margin: 0; padding: 0; columns: 2; }
      .feature-list li { padding: 4px 0; font-size: 13px; break-inside: avoid; }
      .feature-list li::before { content: '✓'; color: var(--success); margin-right: 8px; font-weight: 700; }

      /* Catalogue */
      .plan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
      .plan-card {
        display: flex; flex-direction: column;
        border: 1px solid var(--border); border-radius: var(--radius);
        padding: 16px; background: var(--surface);
      }
      .plan-card.current { border-color: var(--success); box-shadow: 0 0 0 1px var(--success) inset; }
      .plan-card.popular { border-color: var(--brand-600); }
      .plan-name { font-weight: 700; font-size: 15px; }
      .plan-price { font-size: 22px; font-weight: 750; margin: 8px 0 2px; }
      .plan-limits { font-size: 12.5px; color: var(--text-2); margin: 10px 0; line-height: 1.7; }
      .plan-card .spacer { flex: 1; }
      .chip {
        display: inline-block; padding: 2px 8px; border-radius: 999px;
        font-size: 11px; font-weight: 650;
      }
      .chip.up { background: var(--success-bg); color: var(--success); }
      .chip.down { background: var(--warning-bg); color: var(--warning); }

      .feature-mini { list-style: none; margin: 0 0 12px; padding: 0; }
      .feature-mini li { font-size: 12.5px; padding: 2px 0; color: var(--text-2); }
      .feature-mini li::before { content: '✓'; color: var(--success); margin-right: 6px; }

      @media (max-width: 700px) {
        .feature-list { columns: 1; }
      }
    `,
  ],
})
export class MyPlanComponent {
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly view = signal<MyPlanView | null>(null);
  readonly loading = signal(true);

  /* ---------------------------- plan requests --------------------------- */

  readonly catalogue = signal<PlanCatalogue | null>(null);
  readonly requests = signal<PlanRequest[]>([]);
  readonly requestFor = signal<AvailablePlan | null>(null);
  readonly requestNote = signal('');
  readonly sending = signal(false);

  /** Only one request may be open at a time, so every button reads from this. */
  readonly pendingRequest = computed(() => this.catalogue()?.pendingRequest ?? null);

  /** Plan terms as they were sold, not as the plan reads today. */
  readonly terms = computed(() => {
    const current = this.view()?.current;
    return current?.planSnapshot ?? current?.plan ?? null;
  });

  readonly features = computed(() => this.terms()?.features ?? []);

  /** Every plan parameter, metered ones first. */
  readonly usageRows = computed<UsageRow[]>(() => {
    const view = this.view();
    if (!view) return [];

    const metered: UsageRow[] = TRACKED.map(({ key, label }) => {
      const line: PlanUsageLine | undefined = view.usage?.[key];
      return {
        key,
        label,
        used: line?.used ?? 0,
        limit: line?.limit ?? null,
        percent: line?.percentUsed ?? 0,
        atLimit: line?.atLimit ?? false,
        unlimited: line?.unlimited ?? false,
        tracked: true,
        hint: line?.unlimited ? 'unlimited on this plan' : `${line?.remaining ?? 0} left`,
      };
    });

    const informational: UsageRow[] = UNTRACKED.map(({ key, label, hint }) => ({
      key,
      label,
      used: null,
      limit: view.planLimits?.[key] ?? null,
      percent: 0,
      atLimit: false,
      unlimited: (view.planLimits?.[key] ?? null) === null,
      tracked: false,
      hint,
    }));

    return [...metered, ...informational];
  });

  constructor() {
    this.load();
    this.loadCatalogue();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.plan().subscribe({
      next: (data) => {
        this.view.set(data);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your plan', messageOf(error));
      },
    });
  }

  private loadCatalogue(): void {
    this.companies.availablePlans().subscribe({
      next: (data) => this.catalogue.set(data),
      error: () => this.catalogue.set(null),
    });
    this.companies.planRequests().subscribe({
      next: (rows) => this.requests.set(rows),
      error: () => this.requests.set([]),
    });
  }

  /* ------------------------------ helpers ------------------------------ */

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  /** A term counts down only while it is running or paused. */
  isLive(subscription: Subscription): boolean {
    return subscription.status === 'active' || subscription.status === 'suspended';
  }

  planNameOf(subscription: Subscription): string {
    return subscription.plan?.name ?? subscription.planSnapshot?.name ?? '—';
  }

  cycleLabel(value: string | undefined | null): string {
    if (!value) return '—';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  modeLabel(mode: string): string {
    return mode.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /* --------------------------- asking to move --------------------------- */

  /** What the button on a catalogue card should say. */
  actionLabel(plan: AvailablePlan): string {
    if (plan.isCurrent) return 'Your plan';
    if (plan.change === 'downgrade') return 'Request downgrade';
    if (!this.catalogue()?.currentPlanId) return 'Request this plan';
    return 'Request upgrade';
  }

  openRequest(plan: AvailablePlan): void {
    this.requestNote.set('');
    this.requestFor.set(plan);
  }

  sendRequest(): void {
    const plan = this.requestFor();
    if (!plan) return;

    this.sending.set(true);
    this.companies.requestPlan(plan.id, this.requestNote()).subscribe({
      next: () => {
        this.sending.set(false);
        this.requestFor.set(null);
        this.toast.success('Request sent', 'Your account manager will be in touch.');
        this.loadCatalogue();
      },
      error: (error: HttpErrorResponse) => {
        this.sending.set(false);
        this.toast.error('Could not send the request', messageOf(error));
      },
    });
  }

  async cancelRequest(request: PlanRequest): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Withdraw this request?',
      message: `Your request to move to ${request.requestedPlan?.name ?? 'that plan'} will be withdrawn. You can raise a new one afterwards.`,
      confirmText: 'Withdraw request',
      danger: true,
    });
    if (!ok) return;

    this.companies.cancelPlanRequest(request.id).subscribe({
      next: () => {
        this.toast.success('Request withdrawn');
        this.loadCatalogue();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not withdraw the request', messageOf(error)),
    });
  }
}
