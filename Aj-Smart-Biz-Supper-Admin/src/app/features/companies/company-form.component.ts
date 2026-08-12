import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Company,
  CompanyPlanView,
  Option,
  Plan,
  PlanChangePreview,
  Subscription,
} from '../../core/models/domain.model';
import { cleanPayload, formatMoney, touchAll, strongPassword } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

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
  selector: 'app-company-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    FieldErrorComponent,
    ModalComponent,
    ImageUploadComponent,
    PlanTimerComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './company-form.component.html',
  styles: [
    `
      .plan-now { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; justify-content: space-between; }
      .plan-facts { display: flex; flex-wrap: wrap; gap: 24px; }
      .plan-fact-value { font-weight: 700; font-size: 15px; margin-top: 3px; }

      .preview { background: var(--surface-3); border-radius: var(--radius); padding: 14px 16px; margin-top: 14px; }
      .preview-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 13px; }
      .preview-row.total { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 8px; font-weight: 700; }
      .delta-up { color: var(--success); }
      .delta-down { color: var(--warning); }
    `,
  ],
})
export class CompanyFormComponent {
  /** Bound from the `companies/:id/edit` route by `withComponentInputBinding()`. */
  readonly id = input<string | undefined>();

  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly subscriptions = inject(SubscriptionService);
  private readonly crud = inject(CrudFactory);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly paymentModes = PAYMENT_MODES;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly businessTypes = signal<Option[]>([]);
  readonly themes = signal<Option[]>([]);
  readonly states = signal<Option[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly credentials = signal<{ companyName: string; code: string; email: string; password: string } | null>(null);

  readonly companyId = computed(() => (this.id() ? Number(this.id()) : null));
  readonly isEdit = computed(() => this.companyId() !== null);

  /* ----------------------------- plan, on edit ---------------------------- */

  readonly planView = signal<CompanyPlanView | null>(null);
  readonly preview = signal<PlanChangePreview | null>(null);
  readonly previewing = signal(false);
  readonly savingPlan = signal(false);

  readonly currentPlan = computed(() => this.planView()?.current ?? null);
  /** With a term running this is a change of plan; without one it is a first assignment. */
  readonly isChangingPlan = computed(() => this.currentPlan() !== null);

  /**
   * The plans on offer, plus whatever the company is already on — a retired plan
   * still has to appear or the current selection would read as blank.
   */
  readonly sellablePlans = computed(() => {
    const active = this.plans().filter((plan) => plan.status === 'active');
    const currentId = this.currentPlan()?.planId;
    if (!currentId || active.some((plan) => plan.id === currentId)) return active;
    const current = this.plans().find((plan) => plan.id === currentId);
    return current ? [current, ...active] : active;
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    legalName: [''],
    code: [''],
    description: [''],
    // Bare hostname, no scheme or path — matched against the request Host.
    domain: ['', [Validators.pattern(/^(?!https?:)[a-z0-9.-]+\.[a-z]{2,}$/)]],
    logo: [null as string | null],
    favicon: [null as string | null],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required]],
    alternatePhone: [''],
    businessTypeId: [null as number | null],
    themeId: [null as number | null],
    stateId: [null as number | null],
    website: ['', [Validators.pattern(/^https?:\/\/.+/)]],
    gstNumber: [''],
    panNumber: [''],
    addressLine1: [''],
    addressLine2: [''],
    city: [''],
    pincode: [''],
    currency: ['INR'],
    timezone: ['Asia/Kolkata'],
    status: ['active'],

    mainAdmin: this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      password: ['', [strongPassword]],
    }),

    subscription: this.fb.nonNullable.group({
      planId: [null as number | null],
      startDate: [''],
      amount: [null as number | null],
      discount: [0],
      taxAmount: [0],
      autoRenew: [false],
      paymentMode: [''],
      paymentReference: [''],
    }),
  });

  /**
   * Kept out of the profile form on purpose. Changing a plan bills the company
   * and rewrites its subscription history, so it gets its own button and its own
   * confirmation — pressing "Save changes" on an address must never re-charge
   * anyone.
   */
  readonly planForm = this.fb.nonNullable.group({
    planId: [null as number | null, [Validators.required]],
    applyCredit: [true],
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

  constructor() {
    this.crud.for<Option>(MASTER_PATHS.businessTypes).dropdown().subscribe((rows) => this.businessTypes.set(rows));
    this.crud.for<Option>(MASTER_PATHS.themes).dropdown().subscribe((rows) => this.themes.set(rows));
    this.crud.for<Option>(MASTER_PATHS.states).dropdown().subscribe((rows) => this.states.set(rows));
    this.crud
      .for<Plan>(MASTER_PATHS.plans)
      .list({ limit: 100, status: 'active', sortBy: 'sequence', sortOrder: 'asc' })
      .subscribe((result) => this.plans.set(result.items));

    // Edit mode: load the record, and drop the create-only validators.
    effect(() => {
      const companyId = this.companyId();
      if (companyId === null) return;

      this.form.controls.mainAdmin.disable();
      this.form.controls.subscription.disable();
      this.loading.set(true);

      this.companies.getById(companyId).subscribe({
        next: (company) => {
          this.patchForm(company);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.toast.error('Could not load the company', messageOf(error));
          void this.router.navigate(['/companies']);
        },
      });

      this.loadPlan(companyId);
    });
  }

  private loadPlan(companyId: number): void {
    this.subscriptions.companyPlan(companyId).subscribe({
      next: (view) => {
        this.planView.set(view);
        this.resetPlanForm();
      },
      error: () => this.planView.set(null),
    });
  }

  /** Back to a clean slate: no target plan chosen, no stale preview on screen. */
  private resetPlanForm(): void {
    const current = this.currentPlan();
    this.preview.set(null);
    this.planForm.reset({
      planId: null,
      applyCredit: true,
      startDate: '',
      amount: null,
      discount: 0,
      taxAmount: 0,
      graceDays: current?.graceDays ?? 0,
      autoRenew: current?.autoRenew ?? false,
      paymentMode: '',
      paymentReference: '',
      remarks: '',
    });
  }

  private patchForm(company: Company): void {
    this.form.patchValue({
      name: company.name,
      legalName: company.legalName ?? '',
      code: company.code,
      description: company.description ?? '',
      logo: company.logo ?? null,
      favicon: company.favicon ?? null,
      email: company.email,
      phone: company.phone,
      alternatePhone: company.alternatePhone ?? '',
      businessTypeId: company.businessTypeId ?? null,
      themeId: company.themeId ?? null,
      stateId: company.stateId ?? null,
      website: company.website ?? '',
      gstNumber: company.gstNumber ?? '',
      panNumber: company.panNumber ?? '',
      addressLine1: company.addressLine1 ?? '',
      addressLine2: company.addressLine2 ?? '',
      city: company.city ?? '',
      pincode: company.pincode ?? '',
      currency: company.currency,
      timezone: company.timezone,
      status: company.status,
    });
  }

  submit(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      this.toast.warning('Please fix the highlighted fields');
      return;
    }

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const { mainAdmin, subscription, ...profile } = raw;
    const companyPayload = cleanPayload(profile as unknown as Record<string, unknown>);

    if (this.isEdit()) {
      this.companies.update(this.companyId()!, companyPayload as Record<string, unknown>).subscribe({
        next: (company) => {
          this.saving.set(false);
          this.toast.success('Company updated');
          void this.router.navigate(['/companies', company.id]);
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not update the company', messageOf(error));
        },
      });
      return;
    }

    const payload: Record<string, unknown> = {
      ...companyPayload,
      status: undefined,
      mainAdmin: cleanPayload({
        name: mainAdmin.name,
        email: mainAdmin.email,
        phone: mainAdmin.phone,
        ...(mainAdmin.password ? { password: mainAdmin.password } : {}),
      }),
    };
    delete payload['status'];

    if (subscription.planId) {
      payload['subscription'] = {
        planId: subscription.planId,
        ...(subscription.startDate ? { startDate: subscription.startDate } : {}),
        ...(subscription.amount !== null ? { amount: subscription.amount } : {}),
        discount: subscription.discount ?? 0,
        taxAmount: subscription.taxAmount ?? 0,
        autoRenew: subscription.autoRenew,
        ...(subscription.paymentMode
          ? {
              payment: {
                paymentMode: subscription.paymentMode,
                paymentReference: subscription.paymentReference || null,
              },
            }
          : {}),
      };
    }

    this.companies.create(payload).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.toast.success('Company created', `${result.company.name} is ready to use.`);

        if (result.mainAdminPassword) {
          this.credentials.set({
            companyName: result.company.name,
            code: result.company.code,
            email: result.mainAdmin.email,
            password: result.mainAdminPassword,
          });
        } else {
          void this.router.navigate(['/companies', result.company.id]);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not create the company', messageOf(error));
      },
    });
  }

  /* ------------------------------ plan actions ----------------------------- */

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  isLive(subscription: Subscription): boolean {
    return subscription.status === 'active' || subscription.status === 'suspended';
  }

  planNameOf(subscription: Subscription): string {
    return subscription.plan?.name ?? subscription.planSnapshot?.name ?? '—';
  }

  /**
   * Prices the move the moment a plan is picked. The numbers are the API's call,
   * not ours, so what is shown here is exactly what will be charged.
   */
  onPlanChosen(): void {
    const companyId = this.companyId();
    const planId = Number(this.planForm.controls.planId.value);
    const plan = this.plans().find((item) => item.id === planId);

    // First assignment: nothing to prorate, just prefill what it costs.
    if (!this.isChangingPlan()) {
      this.preview.set(null);
      if (plan) this.planForm.controls.amount.setValue(Number(plan.discountPrice ?? plan.price));
      return;
    }

    if (!companyId || !planId) {
      this.preview.set(null);
      return;
    }

    this.previewing.set(true);
    this.subscriptions.changePreview(companyId, planId, this.planForm.controls.applyCredit.value).subscribe({
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

  /** Moves a running company onto a different plan, crediting its unused days. */
  async applyPlanChange(): Promise<void> {
    const companyId = this.companyId();
    const current = this.currentPlan();
    if (!companyId || !current || this.planForm.invalid) {
      touchAll(this.planForm);
      return;
    }

    const raw = this.planForm.getRawValue();
    const target = this.plans().find((plan) => plan.id === Number(raw.planId));
    const priced = this.preview();

    const ok = await this.confirm.ask({
      title: `Move to ${target?.name ?? 'the selected plan'}?`,
      message: priced
        ? `This is a ${priced.changeType}. ${this.money(priced.pricing.creditApplied, priced.pricing.currency)} of unused value is credited, leaving ${this.money(priced.pricing.payable, priced.pricing.currency)} payable. The current term is closed as superseded.`
        : 'The current term is closed as superseded and a new one starts today.',
      confirmText: 'Apply plan change',
    });
    if (!ok) return;

    this.savingPlan.set(true);
    this.subscriptions
      .changePlan(companyId, {
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
          this.savingPlan.set(false);
          this.toast.success(`Plan ${result.changeType}d`, `Credit applied ${this.money(result.creditApplied)}`);
          this.loadPlan(companyId);
        },
        error: (error: HttpErrorResponse) => {
          this.savingPlan.set(false);
          this.toast.error('Could not change the plan', messageOf(error));
        },
      });
  }

  /** First plan for a company that has none, or one whose last term ended. */
  assignPlan(): void {
    const companyId = this.companyId();
    if (!companyId || this.planForm.invalid) {
      touchAll(this.planForm);
      return;
    }

    const raw = this.planForm.getRawValue();
    this.savingPlan.set(true);

    this.companies
      .assignPlan(companyId, {
        planId: Number(raw.planId),
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
        next: () => {
          this.savingPlan.set(false);
          this.toast.success('Plan activated');
          this.loadPlan(companyId);
        },
        error: (error: HttpErrorResponse) => {
          this.savingPlan.set(false);
          this.toast.error('Could not activate the plan', messageOf(error));
        },
      });
  }

  copyCredentials(): void {
    const creds = this.credentials();
    if (!creds) return;
    void navigator.clipboard
      ?.writeText(`Company: ${creds.companyName}\nEmail: ${creds.email}\nPassword: ${creds.password}`)
      .then(() => this.toast.success('Credentials copied'));
  }

  finishCreate(): void {
    this.credentials.set(null);
    void this.router.navigate(['/companies']);
  }
}
