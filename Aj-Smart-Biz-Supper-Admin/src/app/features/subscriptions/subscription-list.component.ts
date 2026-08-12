import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { SubscriptionService, SubscriptionListQuery } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  PlanChangePreview,
  Plan,
  PlanRequest,
  Subscription,
  SubscriptionStatus,
  SubscriptionSummary,
} from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { formatMoney } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/** The views the renewal desk actually works from, as one click each. */
interface QuickView {
  key: string;
  label: string;
  icon: string;
  query: SubscriptionListQuery;
}

const QUICK_VIEWS: QuickView[] = [
  { key: 'live', label: 'Running', icon: '🟢', query: { status: 'active' } },
  { key: 'expiring7', label: 'Expiring in 7 days', icon: '⏰', query: { expiringInDays: 7 } },
  { key: 'expiring30', label: 'Expiring in 30 days', icon: '📅', query: { expiringInDays: 30 } },
  { key: 'scheduled', label: 'Scheduled renewals', icon: '🗓️', query: { status: 'pending' } },
  { key: 'suspended', label: 'Suspended', icon: '⏸️', query: { status: 'suspended' } },
  { key: 'expired', label: 'Expired', icon: '⛔', query: { status: 'expired' } },
  { key: 'cancelled', label: 'Cancelled', icon: '🚫', query: { status: 'cancelled' } },
  { key: 'all', label: 'Everything', icon: '📋', query: {} },
];

/** Keys a quick view may set, so switching views clears the previous one cleanly. */
const VIEW_KEYS = ['status', 'expiringInDays', 'expiredOnly'] as const;

const PAYMENT_MODES = [
  { value: '', label: 'Do not record a payment' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'net_banking', label: 'Net banking' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-subscription-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    PlanTimerComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './subscription-list.component.html',
  styles: [
    `
      .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
      .tile {
        text-align: left; cursor: pointer; font: inherit; color: inherit;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 14px 16px;
      }
      .tile:hover { border-color: var(--brand-600); }
      .tile.active { border-color: var(--brand-600); box-shadow: 0 0 0 1px var(--brand-600) inset; }
      .tile-value { font-size: 22px; font-weight: 750; margin-top: 4px; }
      .tile-value.warn { color: var(--warning); }
      .tile-value.bad { color: var(--danger); }
      .tile-value.good { color: var(--success); }

      .views { display: flex; flex-wrap: wrap; gap: 6px; }
      .view-chip {
        padding: 6px 11px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 12.5px;
        background: var(--surface-3); border: 1px solid transparent; color: var(--text-2);
      }
      .view-chip:hover { color: var(--text); }
      .view-chip.active { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }

      .rowmenu { position: relative; display: inline-block; }
      .rowmenu-panel {
        position: absolute; right: 0; top: calc(100% + 4px); z-index: 20;
        min-width: 190px; padding: 6px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); box-shadow: var(--shadow-lg);
      }
      .rowmenu-item {
        display: block; width: 100%; text-align: left;
        padding: 8px 10px; border: none; background: none; border-radius: var(--radius-sm);
        color: var(--text); font: inherit; font-size: 13px; cursor: pointer;
      }
      .rowmenu-item:hover { background: var(--surface-3); }
      .rowmenu-item.danger { color: var(--danger); }
      .rowmenu-item:disabled { opacity: .45; cursor: not-allowed; }

      .preview { background: var(--surface-3); border-radius: var(--radius); padding: 14px 16px; margin-top: 4px; }
      .preview-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 13px; }
      .preview-row.total { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 8px; font-weight: 700; }
      .delta-up { color: var(--success); }
      .delta-down { color: var(--warning); }

      .switch { position: relative; display: inline-block; width: 38px; height: 21px; vertical-align: middle; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; cursor: pointer; background: var(--border-strong); border-radius: 999px; transition: background .2s; }
      .slider::before {
        content: ''; position: absolute; width: 15px; height: 15px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%; transition: transform .2s;
      }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(17px); }
    `,
  ],
})
export class SubscriptionListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly subscriptions = inject(SubscriptionService);
  private readonly crud = inject(CrudFactory);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly quickViews = QUICK_VIEWS;
  readonly paymentModes = PAYMENT_MODES;

  readonly plans = signal<Plan[]>([]);
  readonly summary = signal<SubscriptionSummary | null>(null);
  readonly activeView = signal<string>('live');
  readonly openMenu = signal<number | null>(null);
  readonly busyId = signal<number | null>(null);
  readonly sweeping = signal(false);

  readonly store = new ListStore<Subscription>(
    (query) => this.subscriptions.list(query as SubscriptionListQuery),
    { limit: 10, ...QUICK_VIEWS[0].query }
  );

  /* ------------------------------- modals ------------------------------ */

  readonly renewFor = signal<Subscription | null>(null);
  readonly savingRenew = signal(false);

  readonly changeFor = signal<Subscription | null>(null);
  readonly savingChange = signal(false);
  readonly preview = signal<PlanChangePreview | null>(null);
  readonly previewing = signal(false);

  readonly extendFor = signal<Subscription | null>(null);
  readonly savingExtend = signal(false);

  /* --------------------------- plan requests --------------------------- */

  /** Tenants waiting on a decision. Loaded alongside the list, shown above it. */
  readonly requests = signal<PlanRequest[]>([]);
  readonly approveFor = signal<PlanRequest | null>(null);
  readonly deciding = signal(false);

  readonly approveForm = this.fb.nonNullable.group({
    applyCredit: [true],
    discount: [0],
    taxAmount: [0],
    autoRenew: [false],
    paymentMode: [''],
    paymentReference: [''],
    decisionNote: [''],
  });

  readonly renewForm = this.fb.nonNullable.group({
    planId: [null as number | null],
    mode: ['schedule' as 'schedule' | 'immediate'],
    startDate: [''],
    amount: [null as number | null],
    discount: [0],
    taxAmount: [0],
    graceDays: [0],
    autoRenew: [false],
    paymentMode: [''],
    paymentReference: [''],
    remarks: [''],
  });

  readonly changeForm = this.fb.nonNullable.group({
    planId: [null as number | null, [Validators.required]],
    applyCredit: [true],
    discount: [0],
    taxAmount: [0],
    autoRenew: [false],
    paymentMode: [''],
    paymentReference: [''],
    remarks: [''],
  });

  readonly extendForm = this.fb.nonNullable.group({
    days: [7, [Validators.required, Validators.min(1)]],
    reason: [''],
  });

  /** Plans a company can be moved on to — inactive ones are not sold any more. */
  readonly sellablePlans = computed(() => this.plans().filter((plan) => plan.status === 'active'));

  /**
   * The renew dropdown also keeps the plan the company is already on, even once
   * it has been retired — otherwise the default selection would silently vanish
   * and a straight renewal would look like a plan change.
   */
  readonly renewPlans = computed(() => {
    const sellable = this.sellablePlans();
    const currentId = this.renewFor()?.planId;
    if (!currentId || sellable.some((plan) => plan.id === currentId)) return sellable;
    const current = this.plans().find((plan) => plan.id === currentId);
    return current ? [current, ...sellable] : sellable;
  });

  constructor() {
    this.crud
      .for<Plan>(MASTER_PATHS.plans)
      .list({ limit: 200, sortBy: 'sequence', sortOrder: 'asc' })
      .subscribe((result) => this.plans.set(result.items));

    this.loadSummary();
    this.loadRequests();
    this.store.reload();
  }

  private loadSummary(): void {
    this.subscriptions.summary().subscribe({
      next: (data) => this.summary.set(data),
      error: () => this.summary.set(null),
    });
  }

  private loadRequests(): void {
    this.subscriptions.requests({ status: 'pending', limit: 50 }).subscribe({
      next: (result) => this.requests.set(result.items),
      error: () => this.requests.set([]),
    });
  }

  /** Every write refreshes the list, the counters and the queue together. */
  private refresh(): void {
    this.store.reload();
    this.loadSummary();
    this.loadRequests();
  }

  /* ------------------------------ helpers ------------------------------ */

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  planNameOf(row: Subscription): string {
    return row.plan?.name ?? row.planSnapshot?.name ?? '—';
  }

  /** A term is counting down only while it is running or paused. */
  isLive(row: Subscription): boolean {
    return row.status === 'active' || row.status === 'suspended';
  }

  can(row: Subscription, status: SubscriptionStatus): boolean {
    return (row.allowedTransitions ?? []).includes(status);
  }

  changeLabel(type: string | undefined): string {
    if (!type || type === 'new') return '';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  toggleMenu(id: number): void {
    this.openMenu.update((current) => (current === id ? null : id));
  }

  /* ---------------------------- view filters --------------------------- */

  selectView(view: QuickView): void {
    this.activeView.set(view.key);
    // Clear whatever the previous view set before applying the new one, or the
    // filters would stack up and quietly return nothing.
    const cleared = VIEW_KEYS.reduce<SubscriptionListQuery>(
      (acc, key) => ({ ...acc, [key]: undefined }),
      {}
    );
    this.store.patch({ ...cleared, ...view.query });
  }

  onSearch(event: Event): void {
    this.store.patch({ search: (event.target as HTMLInputElement).value });
  }

  onPlanFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.patch({ planId: value ? Number(value) : undefined });
  }

  /* ---------------------------- transitions ---------------------------- */

  /** One place for the fire-and-refresh shape every transition button shares. */
  private run(id: number, request: Observable<unknown>, message: string): void {
    this.busyId.set(id);
    this.openMenu.set(null);
    request.subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(message);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.busyId.set(null);
        this.toast.error('That change was refused', messageOf(error));
      },
    });
  }

  async suspend(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Suspend this plan?',
      message: `${row.company?.name ?? 'The company'} keeps its term and dates but loses access until the plan is resumed.`,
      confirmText: 'Suspend',
      danger: true,
    });
    if (!ok) return;
    this.run(row.id, this.subscriptions.suspend(row.id, 'Suspended from the plan console'), 'Plan suspended');
  }

  resume(row: Subscription): void {
    this.run(row.id, this.subscriptions.resume(row.id), 'Plan resumed');
  }

  async cancel(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Cancel this subscription?',
      message: 'The term ends now and the company is left without a plan until a new one is assigned. This cannot be undone — a new term is the only way back.',
      confirmText: 'Cancel subscription',
      danger: true,
    });
    if (!ok) return;
    this.run(row.id, this.subscriptions.cancel(row.id, 'Cancelled from the plan console'), 'Subscription cancelled');
  }

  async expire(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Expire this term now?',
      message: 'The term is closed off at today’s date rather than waiting for its end date.',
      confirmText: 'Expire now',
      danger: true,
    });
    if (!ok) return;
    this.run(row.id, this.subscriptions.expire(row.id, 'Expired manually'), 'Term expired');
  }

  async startNow(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Start this plan today?',
      message: 'The scheduled term starts now and keeps its full duration, so its end date moves. Whatever is currently running is closed.',
      confirmText: 'Start now',
    });
    if (!ok) return;
    this.run(row.id, this.subscriptions.startNow(row.id), 'Scheduled plan started');
  }

  async reactivate(row: Subscription): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Reactivate on the same plan?',
      message: `A fresh term on ${this.planNameOf(row)} starts today. The finished term stays in the history.`,
      confirmText: 'Reactivate',
    });
    if (!ok) return;
    this.run(row.id, this.subscriptions.reactivate(row.id), 'Subscription reactivated');
  }

  toggleAutoRenew(row: Subscription): void {
    const next = !row.autoRenew;
    this.subscriptions.setAutoRenew(row.id, next).subscribe({
      next: () => {
        this.toast.success(next ? 'Auto renew switched on' : 'Auto renew switched off');
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change auto renew', messageOf(error)),
    });
  }

  /** Rolls due terms forward now instead of waiting for the hourly sweep. */
  runDue(): void {
    this.sweeping.set(true);
    this.subscriptions.runDue().subscribe({
      next: (result) => {
        this.sweeping.set(false);
        this.toast.success(
          'Expiry check complete',
          `${result.activated} started · ${result.expired} expired · ${result.renewed} auto-renewed`
        );
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.sweeping.set(false);
        this.toast.error('Could not run the expiry check', messageOf(error));
      },
    });
  }

  /* ------------------------------- renew ------------------------------- */

  openRenew(row: Subscription): void {
    this.openMenu.set(null);
    const plan = this.plans().find((item) => item.id === row.planId);
    this.renewForm.reset({
      planId: row.planId,
      // While a term is still running the sensible default is to queue behind it.
      mode: this.isLive(row) ? 'schedule' : 'immediate',
      startDate: '',
      amount: plan ? Number(plan.discountPrice ?? plan.price) : Number(row.amount),
      discount: 0,
      taxAmount: 0,
      graceDays: row.graceDays ?? 0,
      autoRenew: row.autoRenew,
      paymentMode: '',
      paymentReference: '',
      remarks: '',
    });
    this.renewFor.set(row);
  }

  syncRenewAmount(): void {
    const plan = this.plans().find((item) => item.id === Number(this.renewForm.controls.planId.value));
    if (plan) this.renewForm.controls.amount.setValue(Number(plan.discountPrice ?? plan.price));
  }

  saveRenew(): void {
    const row = this.renewFor();
    if (!row) return;

    const raw = this.renewForm.getRawValue();
    this.savingRenew.set(true);

    this.subscriptions
      .renew(row.companyId, {
        ...(raw.planId ? { planId: Number(raw.planId) } : {}),
        immediate: raw.mode === 'immediate',
        ...(raw.startDate ? { startDate: raw.startDate } : {}),
        ...(raw.amount !== null ? { amount: Number(raw.amount) } : {}),
        discount: Number(raw.discount ?? 0),
        taxAmount: Number(raw.taxAmount ?? 0),
        graceDays: Number(raw.graceDays ?? 0),
        autoRenew: raw.autoRenew,
        remarks: raw.remarks || null,
        ...(raw.paymentMode
          ? { payment: { paymentMode: raw.paymentMode, paymentReference: raw.paymentReference || null } }
          : {}),
      })
      .subscribe({
        next: (result) => {
          this.savingRenew.set(false);
          this.renewFor.set(null);
          this.toast.success(
            result.scheduled ? 'Renewal scheduled' : 'Plan renewed',
            result.scheduled ? `It starts on ${result.subscription.startDate}` : undefined
          );
          this.refresh();
        },
        error: (error: HttpErrorResponse) => {
          this.savingRenew.set(false);
          this.toast.error('Could not renew the plan', messageOf(error));
        },
      });
  }

  /* --------------------------- change of plan -------------------------- */

  openChange(row: Subscription): void {
    this.openMenu.set(null);
    this.preview.set(null);
    this.changeForm.reset({
      planId: null,
      applyCredit: true,
      discount: 0,
      taxAmount: 0,
      autoRenew: row.autoRenew,
      paymentMode: '',
      paymentReference: '',
      remarks: '',
    });
    this.changeFor.set(row);
  }

  /** Asks the API what the move would cost — the numbers are its call, not ours. */
  loadPreview(): void {
    const row = this.changeFor();
    const planId = Number(this.changeForm.controls.planId.value);
    if (!row || !planId) {
      this.preview.set(null);
      return;
    }

    this.previewing.set(true);
    this.subscriptions.changePreview(row.companyId, planId, this.changeForm.controls.applyCredit.value).subscribe({
      next: (data) => {
        this.preview.set(data);
        this.previewing.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.previewing.set(false);
        this.preview.set(null);
        this.toast.error('Could not price that change', messageOf(error));
      },
    });
  }

  saveChange(): void {
    const row = this.changeFor();
    if (!row || this.changeForm.invalid) return;

    const raw = this.changeForm.getRawValue();
    this.savingChange.set(true);

    this.subscriptions
      .changePlan(row.companyId, {
        planId: Number(raw.planId),
        applyCredit: raw.applyCredit,
        discount: Number(raw.discount ?? 0),
        taxAmount: Number(raw.taxAmount ?? 0),
        autoRenew: raw.autoRenew,
        remarks: raw.remarks || null,
        ...(raw.paymentMode
          ? { payment: { paymentMode: raw.paymentMode, paymentReference: raw.paymentReference || null } }
          : {}),
      })
      .subscribe({
        next: (result) => {
          this.savingChange.set(false);
          this.changeFor.set(null);
          this.toast.success(`Plan ${result.changeType}d`, `Credit applied ${this.money(result.creditApplied)}`);
          this.refresh();
        },
        error: (error: HttpErrorResponse) => {
          this.savingChange.set(false);
          this.toast.error('Could not change the plan', messageOf(error));
        },
      });
  }

  /* --------------------------- plan requests --------------------------- */

  openApprove(request: PlanRequest): void {
    this.approveForm.reset({
      applyCredit: true,
      discount: 0,
      taxAmount: 0,
      autoRenew: false,
      paymentMode: '',
      paymentReference: '',
      decisionNote: '',
    });
    this.approveFor.set(request);
  }

  /** Approving is the write: it moves the company and bills it. */
  approveRequest(): void {
    const request = this.approveFor();
    if (!request) return;

    const raw = this.approveForm.getRawValue();
    this.deciding.set(true);

    this.subscriptions
      .approveRequest(request.id, {
        applyCredit: raw.applyCredit,
        discount: Number(raw.discount ?? 0),
        taxAmount: Number(raw.taxAmount ?? 0),
        autoRenew: raw.autoRenew,
        decisionNote: raw.decisionNote || null,
        ...(raw.paymentMode
          ? { payment: { paymentMode: raw.paymentMode, paymentReference: raw.paymentReference || null } }
          : {}),
      })
      .subscribe({
        next: () => {
          this.deciding.set(false);
          this.approveFor.set(null);
          this.toast.success('Request approved', `${request.company?.name} is now on ${request.requestedPlan?.name}`);
          this.refresh();
        },
        error: (error: HttpErrorResponse) => {
          this.deciding.set(false);
          this.toast.error('Could not approve the request', messageOf(error));
        },
      });
  }

  async rejectRequest(request: PlanRequest): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Reject this request?',
      message: `${request.company?.name ?? 'The company'} asked to move to ${request.requestedPlan?.name}. Rejecting leaves them on their current plan; they can ask again.`,
      confirmText: 'Reject request',
      danger: true,
    });
    if (!ok) return;

    this.subscriptions.rejectRequest(request.id, 'Not approved').subscribe({
      next: () => {
        this.toast.success('Request rejected');
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not reject the request', messageOf(error)),
    });
  }

  /* ------------------------------- extend ------------------------------ */

  openExtend(row: Subscription): void {
    this.openMenu.set(null);
    this.extendForm.reset({ days: 7, reason: '' });
    this.extendFor.set(row);
  }

  saveExtend(): void {
    const row = this.extendFor();
    if (!row || this.extendForm.invalid) return;

    const raw = this.extendForm.getRawValue();
    this.savingExtend.set(true);

    this.subscriptions.extend(row.id, Number(raw.days), raw.reason || null).subscribe({
      next: () => {
        this.savingExtend.set(false);
        this.extendFor.set(null);
        this.toast.success(`Term extended by ${raw.days} day(s)`);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.savingExtend.set(false);
        this.toast.error('Could not extend the term', messageOf(error));
      },
    });
  }
}
