import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { ToastService } from '../../core/services/toast.service';
import { FUNCTIONALITY_CATALOGUE_PATH } from '../../core/services/crud.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Functionality,
  FunctionalityCatalogue,
  OrderMode,
  OrderModeMeta,
  OrdersSettings,
  WhatsappNumber,
  WhatsappType,
  WhatsappTypeMeta,
} from '../../core/models/domain.model';
import { numberOrNull, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';

const KEY = 'orders' as const;

/**
 * Cart & orders: whether a visitor can buy anything, and where the order goes.
 *
 * The whole feature is **one settings blob** — there is no orders table, and
 * that is a decision rather than an omission. An order is handed to WhatsApp or
 * to a payment app and nothing is kept on the platform, exactly as a service
 * enquiry sent with the `whatsapp` target is: the company already has an inbox
 * and a phone, and a queue nobody has open is a queue nobody packs.
 *
 * The screen is arranged around the one question that matters and then the
 * consequences of the answer:
 *
 *   where orders go   WhatsApp, straight to payment, or off entirely. Off keeps
 *                     everything else on this page, so a shop pausing orders
 *                     for a fortnight sets nothing up again afterwards.
 *   the basket        on, or one product per order.
 *   what it says      the labels on the buttons and the note above them.
 *   what you ask for  name, phone, address — only what the company wants.
 *   the money         a minimum, and the UPI id or link payment needs.
 *
 * **It says out loud when a setting cannot work.** A company pointing orders at
 * WhatsApp with no published number, or at payment with no UPI id and no link,
 * gets no cart on its website at all — the API withholds the whole block rather
 * than painting a button that leads nowhere. That is the right behaviour and
 * the wrong surprise, so `blocked` below warns before it happens rather than
 * leaving somebody to find out from their own site.
 */
@Component({
  selector: 'app-orders-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, FeatureGateComponent, FieldErrorComponent],
  templateUrl: './orders-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      .block { padding: 18px 0; border-top: 1px solid var(--border); }
      .block:first-of-type { border-top: 0; padding-top: 0; }

      /* The three routes, as cards rather than a dropdown: this is the one
         setting on the screen that changes what a stranger can do, and a line
         in a <select> is not enough room to say what each one means. */
      .modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
      .mode {
        display: block; cursor: pointer;
        padding: 12px 13px; border-radius: 12px;
        border: 1px solid var(--border); background: var(--surface);
        transition: border-color .15s ease, background .15s ease;
      }
      .mode:hover { border-color: var(--border-strong, var(--brand-600)); }
      .mode-on { border-color: var(--brand-600); background: var(--brand-50, var(--surface-2)); }
      .mode input { margin-right: 8px; }
      .mode-name { font-weight: 600; font-size: 13px; }
      .mode-text { margin: 4px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5; }
      .mode-needs { display: block; margin-top: 6px; font-size: 11.5px; color: var(--text-3); }

      /* What a setting will actually do on the website, said before it does it. */
      .warn {
        margin: 12px 0 0; padding: 9px 12px; border-radius: 8px;
        background: var(--warn-bg, var(--surface-2));
        border: 1px solid var(--warn-border, var(--border));
        font-size: 12.5px; line-height: 1.55;
      }
      .warn strong { color: var(--danger); }

      .switch-row { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; }
      .switch-row input { margin-top: 3px; }
      .switch-text { font-size: 12.5px; }
      .switch-text .hint { display: block; margin-top: 2px; }

      .preview {
        margin: 10px 0 0; padding: 11px 13px; border-radius: 10px;
        background: var(--surface-2); border: 1px dashed var(--border);
        font-size: 12.5px; color: var(--text-2); line-height: 1.6; white-space: pre-wrap;
      }
    `,
  ],
})
export class OrdersManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** The platform's own list of routes, read rather than written out here. */
  readonly modes = signal<OrderModeMeta[]>([]);
  readonly whatsappTypes = signal<WhatsappTypeMeta[]>([]);
  /** The numbers the company has actually published — what `blocked` checks. */
  readonly numbers = signal<WhatsappNumber[]>([]);
  /** The platform's wording, shown as this screen's placeholders. */
  readonly defaults = signal<Partial<OrdersSettings>>({});

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  readonly form = this.fb.nonNullable.group({
    mode: ['whatsapp' as OrderMode],
    cart: [true],

    addToCartLabel: [''],
    buyNowLabel: [''],
    submitLabel: [''],
    cartTitle: [''],
    cartNote: [''],

    whatsappType: ['orders' as WhatsappType],
    messageIntro: [''],

    requireName: [true],
    requirePhone: [true],
    requireAddress: [false],

    /* A number control, matching the `type="number"` box it is bound to. */
    minOrderAmount: this.fb.control<number | null>(null),

    upiId: ['', [Validators.pattern(/^[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{1,}$/i)]],
    payeeName: [''],
    paymentUrl: ['', [Validators.pattern(/^https:\/\/\S+$/i)]],
    paymentLabel: [''],
    paymentNote: [''],
  });

  /** The chosen route, as a signal, so the template can branch on it. */
  readonly mode = signal<OrderMode>('whatsapp');

  constructor() {
    this.form.controls.mode.valueChanges.subscribe((value) => this.mode.set(value));
    this.load();
  }

  private load(): void {
    this.loading.set(true);

    this.companies.functionalities().subscribe({
      next: (view) => {
        this.feature.set((view.items ?? []).find((row) => row.key === KEY) ?? null);
        this.patch();
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your order settings', messageOf(error));
      },
    });

    this.api.get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH).subscribe({
      next: (catalogue) => {
        this.modes.set(catalogue.orderModes ?? []);
        this.whatsappTypes.set(catalogue.whatsappTypes ?? []);
        this.defaults.set(catalogue.orderDefaults ?? {});
      },
      error: () => {
        this.modes.set([]);
        this.whatsappTypes.set([]);
      },
    });

    /*
     * Read so the screen can tell the company what its chosen route will
     * actually do. Pointing orders at a number nobody has published produces no
     * cart at all on the website, and finding that out from your own site is
     * the surprise this screen exists to prevent.
     */
    this.companies.whatsappNumbers().subscribe({
      next: (view) => this.numbers.set((view.items ?? []).filter((row) => row.status === 'active')),
      error: () => this.numbers.set([]),
    });
  }

  private patch(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<OrdersSettings>;

    this.form.reset({
      mode: settings.mode ?? 'whatsapp',
      /* `?? true` rather than `|| true`: the company switching the basket off is
         a stored `false`, and treating it as "never set" would turn it back on
         every time this screen loaded. */
      cart: settings.cart ?? true,

      addToCartLabel: settings.addToCartLabel ?? '',
      buyNowLabel: settings.buyNowLabel ?? '',
      submitLabel: settings.submitLabel ?? '',
      cartTitle: settings.cartTitle ?? '',
      cartNote: settings.cartNote ?? '',

      whatsappType: settings.whatsappType ?? 'orders',
      messageIntro: settings.messageIntro ?? '',

      requireName: settings.requireName ?? true,
      requirePhone: settings.requirePhone ?? true,
      requireAddress: settings.requireAddress ?? false,

      minOrderAmount: numberOrNull(settings.minOrderAmount),

      upiId: settings.upiId ?? '',
      payeeName: settings.payeeName ?? '',
      paymentUrl: settings.paymentUrl ?? '',
      paymentLabel: settings.paymentLabel ?? '',
      paymentNote: settings.paymentNote ?? '',
    });

    this.mode.set(this.form.controls.mode.value);
    if (!this.writable()) this.form.disable({ emitEvent: false });
  }

  /** A published number of the chosen type, or the `contact` one it falls back to. */
  private numberFor(type: WhatsappType): WhatsappNumber | null {
    const published = this.numbers();
    return (
      published.find((row) => row.type === type) ??
      published.find((row) => row.type === 'contact') ??
      published[0] ??
      null
    );
  }

  /**
   * What is missing for the chosen route to work at all, or null when nothing
   * is. The exact condition `publicOrders` applies on the way out, said here
   * before it costs anybody a cart.
   */
  readonly blocked = computed<string | null>(() => {
    const raw = this.form.getRawValue();

    if (raw.mode === 'none') return null;

    if (raw.mode === 'whatsapp' && !this.numberFor(raw.whatsappType)) {
      return 'You have no published WhatsApp number, so there is nowhere for an order to go — your website will show no cart at all until you add one on the Functionality screen.';
    }

    if (raw.mode === 'payment' && !raw.upiId.trim() && !raw.paymentUrl.trim()) {
      return 'Taking payment needs a UPI id or a payment link. Without one your website will show no cart at all.';
    }

    return null;
  });

  /** Where an order will actually land, in the company's own published numbers. */
  readonly routedTo = computed<string | null>(() => {
    const found = this.numberFor(this.form.getRawValue().whatsappType);
    return found ? `+${found.countryCode} ${found.number}` : null;
  });

  save(): void {
    if (!this.writable()) return;

    if (this.form.invalid) {
      touchAll(this.form);
      this.toast.error('Check the highlighted fields');
      return;
    }

    const raw = this.form.getRawValue();
    const minimum = numberOrNull(raw.minOrderAmount);
    this.saving.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        mode: raw.mode,
        cart: raw.cart,

        /* Blank asks for the platform's wording back, the rule every copy field
           on the console follows. Null rather than '' so the API's own
           normaliser fills it rather than storing an empty string. */
        addToCartLabel: raw.addToCartLabel.trim() || null,
        buyNowLabel: raw.buyNowLabel.trim() || null,
        submitLabel: raw.submitLabel.trim() || null,
        cartTitle: raw.cartTitle.trim() || null,
        cartNote: raw.cartNote.trim() || null,

        whatsappType: raw.whatsappType,
        messageIntro: raw.messageIntro.trim() || null,

        requireName: raw.requireName,
        requirePhone: raw.requirePhone,
        requireAddress: raw.requireAddress,

        /* An empty box clears the minimum; a zero is not a minimum either. */
        minOrderAmount: minimum && minimum > 0 ? minimum : null,

        upiId: raw.upiId.trim() || null,
        payeeName: raw.payeeName.trim() || null,
        paymentUrl: raw.paymentUrl.trim() || null,
        paymentLabel: raw.paymentLabel.trim() || null,
        paymentNote: raw.paymentNote.trim() || null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.feature.set(updated);
          this.patch();
          this.toast.success('Order settings saved');
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save your order settings', messageOf(error));
        },
      });
  }

  reset(): void {
    this.patch();
  }

  pickMode(mode: OrderMode): void {
    if (!this.writable()) return;
    this.form.controls.mode.setValue(mode);
    this.form.controls.mode.markAsDirty();
  }

  /** The placeholder for a copy field — the platform's own wording. */
  placeholder(key: keyof OrdersSettings): string {
    const value = this.defaults()[key];
    return typeof value === 'string' ? value : '';
  }
}
