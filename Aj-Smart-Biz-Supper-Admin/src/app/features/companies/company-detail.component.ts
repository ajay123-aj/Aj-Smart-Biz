import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { EMPTY_META, PageMeta } from '../../core/models/api.model';
import { PlatformService } from '../../core/services/platform.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Branch, Company, Option, Plan, QuotaView, Subscription,
  CompanyAdmin,
  CompanyInsights,
  PlatformCustomer,
} from '../../core/models/domain.model';
import { cleanPayload, formatMoney, initials, strongPassword, touchAll } from '../../shared/utils';
import { DomainManagerComponent } from '../../shared/domain-manager.component';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { LimitNoticeComponent } from '../../shared/ui/limit-notice.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

type Tab = 'overview' | 'business' | 'customers' | 'branches' | 'domains' | 'billing' | 'admins';

@Component({
  selector: 'app-company-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    PlanTimerComponent,
    LimitNoticeComponent,
    ModalComponent,
    FieldErrorComponent,
    DomainManagerComponent,
  ],
  templateUrl: './company-detail.component.html',
  styles: [
    `
      /* The Business tab. Numbers a person reads before deciding what to say to
         this tenant, so they are large and plain. */
      .sect { margin: 22px 0 10px; font-size: 13px; font-weight: 600; }
      .sect:first-child { margin-top: 0; }
      .ins-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .ins { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); }
      .ins-label { display: block; font-size: 11.5px; font-weight: 600; color: var(--text-3); }
      .ins-value { display: block; margin-top: 3px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .ins-note { display: block; margin-top: 2px; font-size: 11.5px; color: var(--text-3); }
      .ins-warn .ins-value { color: var(--warn, var(--danger)); }
      .ins-bad .ins-value { color: var(--danger); }

      .rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
      .rank li { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
      .rank-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rank-num { font-weight: 600; font-variant-numeric: tabular-nums; }
      .rank-sub { color: var(--text-3); font-size: 11.5px; font-variant-numeric: tabular-nums; }

      .mono { font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }

      .swatch { width: 16px; height: 16px; border-radius: 5px; border: 1px solid var(--border); display: inline-block; }

      .plan-panel {
        display: flex; flex-wrap: wrap; gap: 20px;
        align-items: flex-start; justify-content: space-between;
      }
      .plan-facts { display: flex; flex-wrap: wrap; gap: 22px; }
      .plan-fact { min-width: 110px; }
      .plan-fact-value { font-weight: 700; font-size: 15px; margin-top: 3px; }

      .switch { position: relative; display: inline-block; width: 42px; height: 23px; vertical-align: middle; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; inset: 0; cursor: pointer; background: var(--border-strong); border-radius: 999px; transition: background .2s; }
      .slider::before {
        content: ''; position: absolute; width: 17px; height: 17px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%; transition: transform .2s;
      }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(19px); }
      .switch input:disabled + .slider { opacity: .5; cursor: not-allowed; }
    `,
  ],
})
export class CompanyDetailComponent {
  readonly id = input.required<string>();

  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly subscriptions = inject(SubscriptionService);
  private readonly crud = inject(CrudFactory);
  private readonly platform = inject(PlatformService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly company = signal<Company | null>(null);
  readonly loading = signal(true);
  readonly tab = signal<Tab>('overview');

  /**
   * How this tenant is actually doing, and who buys from them.
   *
   * Loaded **only when the tab is opened**. This screen is mostly used to check
   * an address or a plan, and paying for five aggregate queries on every visit to
   * answer a question nobody asked would be a slow page for everybody.
   */
  readonly insights = signal<CompanyInsights | null>(null);
  readonly insightDays = signal(30);
  readonly loadingInsights = signal(false);

  readonly customers = signal<PlatformCustomer[]>([]);
  readonly customerMeta = signal<PageMeta>(EMPTY_META);
  readonly loadingCustomers = signal(false);
  readonly customerPage = signal(1);
  /** Live domain count from the panel; the company payload only has the initial one. */
  readonly domainCount = signal<number | null>(null);
  readonly states = signal<Option[]>([]);
  readonly plans = signal<Plan[]>([]);

  /** What the company's plan still allows; the API's answer, rendered as-is. */
  readonly quota = signal<QuotaView | null>(null);
  readonly branchLimit = computed(() => this.quota()?.metrics?.branches ?? null);
  readonly canAddBranch = computed(() => this.branchLimit()?.canCreate ?? true);

  readonly branchModalOpen = signal(false);
  readonly editingBranch = signal<Branch | null>(null);
  readonly savingBranch = signal(false);

  readonly planModalOpen = signal(false);
  readonly savingPlan = signal(false);

  readonly paymentModalOpen = signal(false);
  readonly savingPayment = signal(false);

  readonly adminModalOpen = signal(false);
  readonly editingAdmin = signal<CompanyAdmin | null>(null);
  readonly savingAdmin = signal(false);

  readonly passwordTarget = signal<CompanyAdmin | null>(null);
  readonly resettingPassword = signal(false);

  readonly companyId = computed(() => Number(this.id()));
  /** Branches a domain can be pinned to. */
  readonly branchOptions = computed(() =>
    (this.company()?.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name }))
  );

  readonly branchForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    code: [''],
    phone: [''],
    email: ['', [Validators.email]],
    gstNumber: [''],
    addressLine1: [''],
    stateId: [null as number | null],
    city: [''],
    pincode: [''],
    status: ['active'],
  });

  readonly adminForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    roleId: [null as number | null],
    branchId: [null as number | null],
    status: ['active'],
  });

  readonly passwordForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, strongPassword]],
    mustChangePassword: [true],
  });

  readonly planForm = this.fb.nonNullable.group({
    planId: [null as number | null, [Validators.required]],
    startDate: [''],
    amount: [null as number | null],
    discount: [0],
    taxAmount: [0],
    graceDays: [0],
    autoRenew: [false],
    paymentMode: [''],
    paymentReference: [''],
  });

  readonly paymentForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0)]],
    discount: [0],
    taxAmount: [0],
    paymentMode: ['upi'],
    status: ['success'],
    paymentReference: [''],
    remarks: [''],
  });

  constructor() {
    this.crud.for<Option>(MASTER_PATHS.states).dropdown().subscribe((rows) => this.states.set(rows));
    this.crud
      .for<Plan>(MASTER_PATHS.plans)
      .list({ limit: 100, status: 'active', sortBy: 'sequence', sortOrder: 'asc' })
      .subscribe((result) => this.plans.set(result.items));

    effect(() => {
      const companyId = this.companyId();
      if (!Number.isFinite(companyId)) return;
      this.load(companyId);
    });
  }

  private loadQuota(companyId: number): void {
    this.companies.branchQuota(companyId).subscribe({
      next: (data) => this.quota.set(data),
      error: () => this.quota.set(null),
    });
  }

  private load(companyId: number): void {
    this.loading.set(true);
    this.loadQuota(companyId);
    this.companies.getById(companyId).subscribe({
      next: (company) => {
        this.company.set(company);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the company', messageOf(error));
        void this.router.navigate(['/super-admin/companies']);
      },
    });
  }

  private refresh(): void {
    this.load(this.companyId());
  }

  /* ------------------------------ helpers ------------------------------ */

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  /** A term counts down only while it is running or paused. */
  isLive(subscription: Subscription): boolean {
    return subscription.status === 'active' || subscription.status === 'suspended';
  }

  /** The API decides what a term may do next; the UI just renders that list. */
  can(subscription: Subscription, status: Subscription['status']): boolean {
    return (subscription.allowedTransitions ?? []).includes(status);
  }

  addressOf(company: Company): string {
    return (
      [company.addressLine1, company.addressLine2, company.city, company.pincode].filter(Boolean).join(', ') || '—'
    );
  }

  /**
   * True when this company has recoloured its own website.
   *
   * A preset is shared, so the row named beside the swatch may be serving a
   * dozen tenants — and any of them can override it. Without this the detail
   * screen shows the preset's colour as though it were the company's, which is
   * wrong for exactly the companies somebody is most likely to be looking at.
   */
  hasOwnTheme(company: Company): boolean {
    const own = company.themeConfig;
    return Boolean(own && Object.values(own).some((value) => typeof value === 'string' && value.trim() !== ''));
  }

  /**
   * The primary colour the website is actually painted with: the company's own
   * if it set one, otherwise the preset's.
   */
  effectivePrimary(company: Company): string | null {
    return company.themeConfig?.primaryColor || company.theme?.primaryColor || null;
  }

  modeLabel(mode: string): string {
    return mode.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /* ------------------------------ branches ----------------------------- */

  openBranchModal(branch: Branch | null): void {
    // Editing an existing branch is always allowed; only adding consumes quota.
    if (!branch && !this.canAddBranch()) {
      this.toast.warning('Branch limit reached', this.branchLimit()?.message ?? undefined);
      return;
    }
    this.editingBranch.set(branch);
    this.branchForm.reset({
      name: branch?.name ?? '',
      code: branch?.code ?? '',
      phone: branch?.phone ?? '',
      email: branch?.email ?? '',
      gstNumber: branch?.gstNumber ?? '',
      addressLine1: branch?.addressLine1 ?? '',
      stateId: branch?.stateId ?? null,
      city: branch?.city ?? '',
      pincode: branch?.pincode ?? '',
      status: branch?.status ?? 'active',
    });
    this.branchModalOpen.set(true);
  }

  saveBranch(): void {
    if (this.branchForm.invalid) {
      touchAll(this.branchForm);
      return;
    }

    const payload = cleanPayload(this.branchForm.getRawValue() as Record<string, unknown>);
    const branch = this.editingBranch();
    this.savingBranch.set(true);

    const request = branch
      ? this.companies.updateBranch(this.companyId(), branch.id, payload as Record<string, unknown>)
      : this.companies.createBranch(this.companyId(), payload as Record<string, unknown>);

    request.subscribe({
      next: () => {
        this.savingBranch.set(false);
        this.toast.success(branch ? 'Branch updated' : 'Branch added');
        this.branchModalOpen.set(false);
        this.refresh(); // reloads the quota too - the headroom just moved
      },
      error: (error: HttpErrorResponse) => {
        this.savingBranch.set(false);
        this.toast.error('Could not save the branch', messageOf(error));
      },
    });
  }

  async removeBranch(branch: Branch): Promise<void> {
    if (!(await this.confirm.askDelete(`the branch "${branch.name}"`))) return;

    this.companies.removeBranch(this.companyId(), branch.id).subscribe({
      next: () => {
        this.toast.success('Branch deleted');
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the branch', messageOf(error)),
    });
  }

  /* ------------------------------- admins ------------------------------ */

  /**
   * The roles this admin may be moved to.
   *
   * The company-admin role is a system role: the main admin has to keep it and
   * nobody else may be given it. Filtering the list here means the dropdown
   * cannot offer a choice the API would refuse — the rule still lives in the
   * API, this only stops the operator finding out by being rejected.
   */
  readonly assignableRoles = computed(() => {
    const roles = this.company()?.roles ?? [];
    const main = this.editingAdmin()?.isCompanyAdmin ?? false;
    return roles.filter((role) => (main ? role.isSystem : !role.isSystem));
  });

  /** NULL means the admin is not pinned to one branch. */
  branchNameOf(branchId: number | null | undefined): string {
    if (!branchId) return 'All branches';
    return this.company()?.branches?.find((branch) => branch.id === branchId)?.name ?? '—';
  }

  openAdminModal(admin: CompanyAdmin): void {
    this.editingAdmin.set(admin);
    this.adminForm.reset({
      name: admin.name ?? '',
      email: admin.email ?? '',
      phone: admin.phone ?? '',
      roleId: admin.roleId ?? null,
      branchId: admin.branchId ?? null,
      status: admin.status ?? 'active',
    });

    // The main admin keeps its role and stays active — the API refuses both
    // changes, so the fields are shown (they are worth reading) but locked.
    const controls = this.adminForm.controls;
    if (admin.isCompanyAdmin) {
      controls.roleId.disable();
      controls.status.disable();
    } else {
      controls.roleId.enable();
      controls.status.enable();
    }

    this.adminModalOpen.set(true);
  }

  openPasswordModal(admin: CompanyAdmin): void {
    this.passwordForm.reset({ newPassword: '', mustChangePassword: true });
    this.passwordTarget.set(admin);
  }

  submitPassword(): void {
    const admin = this.passwordTarget();
    if (!admin) return;
    if (this.passwordForm.invalid) {
      touchAll(this.passwordForm);
      return;
    }

    this.resettingPassword.set(true);
    this.companies.resetAdminPassword(this.companyId(), admin.id, this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.resettingPassword.set(false);
        // The password is not read back afterwards, so this is the only moment
        // it exists anywhere outside the operator's own screen.
        this.toast.success(`Password set for ${admin.name}`, 'Hand it over now — it cannot be read again.');
        this.passwordTarget.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.resettingPassword.set(false);
        this.toast.error('Could not set the password', messageOf(error));
      },
    });
  }

  saveAdmin(): void {
    if (this.adminForm.invalid) {
      touchAll(this.adminForm);
      return;
    }

    const admin = this.editingAdmin();
    if (!admin) return;

    // `getRawValue` rather than `value`: the locked fields still have to be sent,
    // and sending what is already stored is a no-op the API accepts.
    const payload = cleanPayload(this.adminForm.getRawValue() as Record<string, unknown>);
    this.savingAdmin.set(true);

    this.companies.updateAdmin(this.companyId(), admin.id, payload as Record<string, unknown>).subscribe({
      next: () => {
        this.savingAdmin.set(false);
        this.toast.success('Admin updated');
        this.adminModalOpen.set(false);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.savingAdmin.set(false);
        this.toast.error('Could not save the admin', messageOf(error));
      },
    });
  }

  /* ------------------------------ billing ------------------------------ */

  openPlanModal(): void {
    this.planForm.reset({
      planId: null,
      startDate: '',
      amount: null,
      discount: 0,
      taxAmount: 0,
      graceDays: 0,
      autoRenew: false,
      paymentMode: '',
      paymentReference: '',
    });
    this.planModalOpen.set(true);
  }

  /** Prefills the amount from the chosen plan so the operator only overrides it. */
  syncAmountToPlan(): void {
    const planId = this.planForm.controls.planId.value;
    const plan = this.plans().find((item) => item.id === Number(planId));
    if (plan) this.planForm.controls.amount.setValue(Number(plan.discountPrice ?? plan.price));
  }

  assignPlan(): void {
    if (this.planForm.invalid) {
      touchAll(this.planForm);
      return;
    }

    const raw = this.planForm.getRawValue();
    this.savingPlan.set(true);

    this.companies
      .assignPlan(this.companyId(), {
        planId: Number(raw.planId),
        ...(raw.startDate ? { startDate: raw.startDate } : {}),
        ...(raw.amount !== null ? { amount: Number(raw.amount) } : {}),
        discount: Number(raw.discount ?? 0),
        taxAmount: Number(raw.taxAmount ?? 0),
        graceDays: Number(raw.graceDays ?? 0),
        autoRenew: raw.autoRenew,
        ...(raw.paymentMode
          ? { payment: { paymentMode: raw.paymentMode, paymentReference: raw.paymentReference || null } }
          : {}),
      })
      .subscribe({
        next: () => {
          this.savingPlan.set(false);
          this.toast.success('Plan activated');
          this.planModalOpen.set(false);
          this.refresh();
        },
        error: (error: HttpErrorResponse) => {
          this.savingPlan.set(false);
          this.toast.error('Could not activate the plan', messageOf(error));
        },
      });
  }

  /** Shared shape for the quick transitions offered against each term. */
  private runTransition(request: Observable<unknown>, message: string): void {
    request.subscribe({
      next: () => {
        this.toast.success(message);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.toast.error('That change was refused', messageOf(error)),
    });
  }

  async cancelSubscription(subscriptionId: number): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Cancel subscription?',
      message: 'The company keeps working but loses its active plan until a new one is assigned. Cancelling is final — a new term is the only way back.',
      confirmText: 'Cancel subscription',
      danger: true,
    });
    if (!ok) return;

    this.runTransition(
      this.companies.cancelSubscription(this.companyId(), subscriptionId),
      'Subscription cancelled'
    );
  }

  /**
   * The plan's active/inactive switch. "Inactive" is a suspension: the term
   * keeps its dates and its money, the tenant just stops getting in — which is
   * what you want for non-payment, and is reversible. It is not a cancellation.
   */
  async setPlanActive(subscription: Subscription, active: boolean): Promise<void> {
    if (active) {
      this.resumeSubscription(subscription.id);
      return;
    }
    await this.suspendSubscription(subscription.id);
  }

  async suspendSubscription(subscriptionId: number): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Suspend this plan?',
      message: 'The term keeps its dates but the company loses access until it is resumed.',
      confirmText: 'Suspend',
      danger: true,
    });
    if (!ok) return;

    this.runTransition(
      this.subscriptions.suspend(subscriptionId, 'Suspended from the company screen'),
      'Plan suspended'
    );
  }

  resumeSubscription(subscriptionId: number): void {
    this.runTransition(this.subscriptions.resume(subscriptionId), 'Plan resumed');
  }

  /** Starts a queued renewal today rather than waiting for its start date. */
  async startScheduled(subscriptionId: number): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Start the scheduled plan today?',
      message: 'It keeps its full duration, so its end date moves. The running term is closed.',
      confirmText: 'Start now',
    });
    if (!ok) return;

    this.runTransition(this.subscriptions.startNow(subscriptionId), 'Scheduled plan started');
  }

  toggleAutoRenew(subscription: Subscription): void {
    const next = !subscription.autoRenew;
    this.runTransition(
      this.subscriptions.setAutoRenew(subscription.id, next),
      next ? 'Auto renew switched on' : 'Auto renew switched off'
    );
  }

  openPaymentModal(): void {
    const active = this.company()?.activeSubscription;
    this.paymentForm.reset({
      amount: active ? Number(active.amount) : 0,
      discount: 0,
      taxAmount: 0,
      paymentMode: 'upi',
      status: 'success',
      paymentReference: '',
      remarks: '',
    });
    this.paymentModalOpen.set(true);
  }

  savePayment(): void {
    if (this.paymentForm.invalid) {
      touchAll(this.paymentForm);
      return;
    }

    const active = this.company()?.activeSubscription;
    const raw = this.paymentForm.getRawValue();
    this.savingPayment.set(true);

    this.companies
      .createTransaction(this.companyId(), {
        ...raw,
        paymentReference: raw.paymentReference || null,
        remarks: raw.remarks || null,
        ...(active ? { subscriptionId: active.id, planId: active.planId } : {}),
      })
      .subscribe({
        next: () => {
          this.savingPayment.set(false);
          this.toast.success('Payment recorded');
          this.paymentModalOpen.set(false);
          this.refresh();
        },
        error: (error: HttpErrorResponse) => {
          this.savingPayment.set(false);
          this.toast.error('Could not record the payment', messageOf(error));
        },
      });
  }

  /**
   * Opening a tab is what fetches it.
   *
   * Kept once loaded: flicking between Business and Branches should not re-run
   * five aggregate queries, and nothing on this screen changes underneath
   * somebody in the seconds they spend looking at it.
   */
  openTab(tab: Tab): void {
    this.tab.set(tab);

    if (tab === 'business' && !this.insights()) this.loadInsights();
    if (tab === 'customers' && !this.customers().length) this.loadCustomers();
  }

  private loadInsights(): void {
    const id = this.company()?.id;
    if (!id) return;

    this.loadingInsights.set(true);
    this.platform.companyInsights(id, this.insightDays()).subscribe({
      next: (data) => {
        this.loadingInsights.set(false);
        this.insights.set(data);
      },
      error: (error: HttpErrorResponse) => {
        this.loadingInsights.set(false);
        this.toast.error('Could not load this company’s figures', messageOf(error));
      },
    });
  }

  setInsightDays(days: number): void {
    this.insightDays.set(days);
    this.loadInsights();
  }

  private loadCustomers(): void {
    const id = this.company()?.id;
    if (!id) return;

    this.loadingCustomers.set(true);
    this.platform.customers({ companyId: id, page: this.customerPage(), limit: 25 }).subscribe({
      next: (result) => {
        this.loadingCustomers.set(false);
        this.customers.set(result.items);
        this.customerMeta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.loadingCustomers.set(false);
        this.toast.error('Could not load this company’s customers', messageOf(error));
      },
    });
  }

  onCustomerPage(page: number): void {
    this.customerPage.set(page);
    this.loadCustomers();
  }

  /**
   * Whether a tenant's blog has gone quiet - nothing published for a season.
   *
   * A quarter rather than a month: a small business posting every six weeks is
   * running a blog, and colouring that amber would make the signal meaningless
   * on the tenants it is meant to find.
   */
  staleBlog(lastPostedAt: string | null): boolean {
    if (!lastPostedAt) return true;
    return Date.now() - new Date(lastPostedAt).getTime() > 90 * 86400000;
  }

  /* Money is already formatted by `money()` above, which every other tab uses.
     A second one here would be two places for the currency to drift. */
}
