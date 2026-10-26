import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, takeWhile, timer } from 'rxjs';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS, FUNCTIONALITY_CATALOGUE_PATH } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  AiContentJob,
  AiContentModule,
  Company,
  CompanyCreateResult,
  CompanyDuplicateResult,
  CompanyPlanView,
  DuplicateSection,
  Option,
  Plan,
  PlanChangePreview,
  Subscription,
  PaymentModeOption,
  FunctionalityCatalogue,
} from '../../core/models/domain.model';
import { cleanPayload, formatMoney, touchAll, strongPassword } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * Shown only until the catalogue arrives — see `loadPaymentModes`. The API's
 * list replaces it, so this exists to stop the select being empty for the one
 * render before that, not to be a second source of truth.
 */
/** The AI content creator's choices, in the order the form lists them. */
const AI_MODULE_OPTIONS: { key: AiContentModule; label: string; hint: string }[] = [
  { key: 'site', label: 'Website pages', hint: 'Hero slides, About, Contact, benefits, and figures or team if your prompt gives them' },
  { key: 'services', label: 'Services', hint: 'Service categories and services, with prices and durations' },
  { key: 'products', label: 'Products', hint: 'Product categories and products, with prices and specs' },
  { key: 'blog', label: 'Blog', hint: 'Four helpful articles for customers' },
];

/**
 * What "Duplicate company" offers to copy. Testimonials start unticked: they
 * are what customers said about the original business.
 */
const DUPLICATE_OPTIONS: { key: DuplicateSection; label: string; hint: string; checked: boolean }[] = [
  { key: 'website', label: 'Website pages', hint: 'Slides, About, Contact, benefits, figures, team, gallery, social links, WhatsApp, section settings and theme', checked: true },
  { key: 'services', label: 'Services', hint: 'Service categories and services', checked: true },
  { key: 'products', label: 'Products', hint: 'Product categories and products (not stock counts)', checked: true },
  { key: 'blog', label: 'Blog', hint: 'Every post, with its publish date', checked: true },
  { key: 'branches', label: 'Branches', hint: 'Branches and their contacts, up to the new plan’s branch limit', checked: true },
  { key: 'roles', label: 'Roles & permissions', hint: 'Custom roles and what each may see and do', checked: true },
  { key: 'testimonials', label: 'Testimonials', hint: 'Approved reviews of the original business, without reviewers’ contact details', checked: false },
];

/** How often a running content job is asked how it is going. */
const AI_POLL_MS = 3000;

const PAYMENT_MODE_FALLBACK: PaymentModeOption[] = [
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
  /** `?duplicate=<id>`: start from that company's details and copy its content. */
  readonly duplicate = input<string | undefined>();

  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly subscriptions = inject(SubscriptionService);
  private readonly crud = inject(CrudFactory);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The platform's payment modes, from the catalogue endpoint. A signal rather
   * than a constant because it arrives after the first render.
   */
  readonly paymentModes = signal<PaymentModeOption[]>(PAYMENT_MODE_FALLBACK);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly businessTypes = signal<Option[]>([]);
  readonly themes = signal<Option[]>([]);
  readonly states = signal<Option[]>([]);
  readonly plans = signal<Plan[]>([]);
  /** The new company, for the modal shown after saving. `password` is null when one was typed in. */
  readonly credentials = signal<{ companyName: string; code: string; email: string; password: string | null } | null>(null);

  /* --------------------------- AI content creator -------------------------- */

  readonly aiModuleOptions = AI_MODULE_OPTIONS;
  readonly aiJob = signal<AiContentJob | null>(null);
  /** Set when the job could not start or could not be followed: a missing key, a lost connection. */
  readonly aiStartError = signal<string | null>(null);
  readonly aiRunning = computed(() => this.aiJob()?.status === 'running');

  /**
   * Its own form, not part of the company payload: none of it is saved on the
   * company. The key in particular goes to the API once, for one job.
   */
  readonly aiForm = this.fb.nonNullable.group({
    enabled: [false],
    prompt: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(8000)]],
    apiKey: [''],
    modules: this.fb.nonNullable.group({
      site: [true],
      services: [true],
      products: [true],
      blog: [true],
    }),
  });

  /** "12 services, 18 products, …" from a job's counts. */
  readonly aiSummary = computed(() => {
    const created = this.aiJob()?.created ?? {};
    const labels: Record<string, string> = {
      sliders: 'hero slides',
      about: 'About page',
      contactPage: 'Contact page',
      features: 'benefit cards',
      figures: 'figures',
      team: 'team members',
      serviceCategories: 'service categories',
      services: 'services',
      productCategories: 'product categories',
      products: 'products',
      blog: 'blog posts',
    };
    return Object.entries(labels)
      .filter(([key]) => created[key])
      .map(([key, label]) => `${created[key]} ${label}`);
  });

  readonly companyId = computed(() => (this.id() ? Number(this.id()) : null));
  readonly isEdit = computed(() => this.companyId() !== null);

  /* ---------------------------- duplicate company --------------------------- */

  readonly duplicateOptions = DUPLICATE_OPTIONS;
  /** The company being copied, once loaded. Null when this is a plain create. */
  readonly duplicateSource = signal<Company | null>(null);
  /** Rows copied, by kind, for the modal after saving. */
  readonly copied = signal<Record<string, number> | null>(null);
  readonly copySkipped = signal<Record<string, number> | null>(null);

  readonly duplicateForm = this.fb.nonNullable.group(
    Object.fromEntries(DUPLICATE_OPTIONS.map((option) => [option.key, [option.checked]])) as Record<
      DuplicateSection,
      [boolean]
    >
  );

  /** "21 services, 25 products, …" from what the duplicate copied. */
  readonly copiedSummary = computed(() => {
    const copied = this.copied() ?? {};
    const labels: Record<string, string> = {
      sliders: 'slides',
      about: 'About page',
      contactPage: 'Contact page',
      features: 'benefit cards',
      figures: 'figures',
      team: 'team members',
      gallery: 'gallery photos',
      socialLinks: 'social links',
      whatsapp: 'WhatsApp numbers',
      sections: 'section settings',
      serviceCategories: 'service categories',
      services: 'services',
      productCategories: 'product categories',
      products: 'products',
      blog: 'blog posts',
      testimonials: 'testimonials',
      branches: 'branches',
      branchContacts: 'branch contacts',
      roles: 'roles',
    };
    return Object.entries(labels)
      .filter(([key]) => copied[key])
      .map(([key, label]) => `${copied[key]} ${label}`);
  });

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
    this.loadPaymentModes();
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

    // Duplicate mode: the source's profile pre-fills the form. What must be
    // unique (name aside) is cleared, for the new company's own values.
    effect(() => {
      const sourceId = this.duplicate() ? Number(this.duplicate()) : null;
      if (this.isEdit() || !sourceId) return;

      this.loading.set(true);
      this.companies.getById(sourceId).subscribe({
        next: (company) => {
          this.patchForm(company);
          this.form.patchValue({ name: `${company.name} (copy)`, code: '', email: '', domain: '', status: 'active' });
          this.duplicateSource.set(company);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.toast.error('Could not load the company to duplicate', messageOf(error));
          void this.router.navigate(['/companies']);
        },
      });
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
    const withAi = !this.isEdit() && this.aiForm.controls.enabled.value;
    if (this.form.invalid || (withAi && (this.aiForm.invalid || !this.aiModules().length))) {
      touchAll(this.form);
      if (withAi) touchAll(this.aiForm);
      this.toast.warning(
        withAi && !this.aiModules().length ? 'Pick at least one thing for the AI to write' : 'Please fix the highlighted fields'
      );
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

    const source = this.duplicateSource();
    if (source) {
      const picked = this.duplicateForm.getRawValue();
      payload['include'] = DUPLICATE_OPTIONS.map((option) => option.key).filter((key) => picked[key]);
    }
    const request = source
      ? this.companies.duplicate(source.id, payload)
      : this.companies.create(payload);

    request.subscribe({
      next: (result: CompanyCreateResult | CompanyDuplicateResult) => {
        this.saving.set(false);
        if ('copied' in result) {
          this.copied.set(result.copied);
          this.copySkipped.set(result.skipped);
        }
        this.toast.success(
          source ? 'Company duplicated' : 'Company created',
          source ? `${result.company.name} was made from ${source.name}.` : `${result.company.name} is ready to use.`
        );

        if (withAi) this.startAiContent(result.company.id);

        if (result.mainAdminPassword || withAi || source) {
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

  /* --------------------------- AI content creator -------------------------- */

  private aiModules(): AiContentModule[] {
    const picked = this.aiForm.controls.modules.getRawValue();
    return AI_MODULE_OPTIONS.map((option) => option.key).filter((key) => picked[key]);
  }

  /**
   * Starts the job, then asks how it is going every few seconds until it is
   * no longer running. The company already exists by now, so a failure here
   * is shown in the modal rather than undoing anything.
   */
  private startAiContent(companyId: number): void {
    const { prompt, apiKey } = this.aiForm.getRawValue();
    this.aiStartError.set(null);

    this.companies
      .startAiContent(companyId, { prompt: prompt.trim(), apiKey: apiKey.trim() || undefined, modules: this.aiModules() })
      .subscribe({
        next: (job) => {
          this.aiJob.set(job);
          // The key has done its job; it does not stay on the page.
          this.aiForm.controls.apiKey.reset('');
          timer(AI_POLL_MS, AI_POLL_MS)
            .pipe(
              switchMap(() => this.companies.aiContentJob(companyId, job.id)),
              takeWhile((latest) => latest.status === 'running', true),
              takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
              next: (latest) => this.aiJob.set(latest),
              error: (error: HttpErrorResponse) => this.aiStartError.set(messageOf(error)),
            });
        },
        error: (error: HttpErrorResponse) => this.aiStartError.set(messageOf(error)),
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
      ?.writeText(`Company: ${creds.companyName}\nEmail: ${creds.email}\nPassword: ${creds.password ?? '(as entered)'}`)
      .then(() => this.toast.success('Credentials copied'));
  }

  finishCreate(): void {
    this.credentials.set(null);
    void this.router.navigate(['/companies']);
  }

  /**
   * Reads the platform's payment modes once, from the same catalogue endpoint
   * this console already calls for functionalities and share channels.
   *
   * Nothing on the screen waits for it: the fallback above renders immediately
   * and this replaces it. A catalogue that fails to load therefore costs a
   * possibly-stale list rather than an empty select on a form somebody is
   * trying to submit.
   */
  private loadPaymentModes(): void {
    this.api.get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH).subscribe({
      next: (catalogue) => {
        if (catalogue.paymentModes?.length) this.paymentModes.set(catalogue.paymentModes);
      },
      error: () => {
        /* Keep the fallback. */
      },
    });
  }

}
