import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { FUNCTIONALITY_CATALOGUE_PATH } from '../../core/services/crud.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import {
  Branch,
  FunctionalityCatalogue,
  Product,
  StockAnalytics,
  StockLevel,
  StockMovement,
  StockReason,
  StockReasonMeta,
  Warehouse,
} from '../../core/models/domain.model';
import { numberOrNull, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { MiniChartComponent, type ChartPoint } from '../../shared/ui/mini-chart.component';

/** Which of the four jobs this screen is doing. */
type View = 'stock' | 'warehouses' | 'movements' | 'analytics';

/**
 * What the reason dropdown offers when `/masters/functionalities` cannot be
 * reached.
 *
 * Deliberately the *manual* five and nothing else — `sale` and `transfer` are
 * written by the platform alongside something else that has to be true, and a
 * fallback that offered them would let somebody put a sale in the ledger against
 * no order. The API refuses those anyway; this list is what keeps the screen from
 * inviting the attempt.
 */
const FALLBACK_REASONS: StockReasonMeta[] = [
  { key: 'opening', name: 'Opening balance', direction: 'in', summary: '', sequence: 1 },
  { key: 'purchase', name: 'Received', direction: 'in', summary: '', sequence: 2 },
  { key: 'return', name: 'Customer return', direction: 'in', summary: '', sequence: 3 },
  { key: 'damage', name: 'Damaged or lost', direction: 'out', summary: '', sequence: 4 },
  { key: 'correction', name: 'Stock count', direction: null, summary: '', sequence: 5 },
];

/**
 * The warehouse: where stock is, how much there is, and everything that moved.
 *
 * ### Four views, one screen
 *
 * Stock is the daily work, warehouses is set-up somebody does once, movements is
 * the ledger they read when a count disagrees, and analytics is what all three
 * add up to. Four menu entries for one job would be four things to grant
 * permissions for; four tabs is one.
 *
 * ### The thing this screen refuses to do
 *
 * **There is no box you can type a quantity into.** Every change to a level is a
 * movement with a reason on it — a delivery received, a breakage written off, a
 * count that disagreed. The nearest thing to an edit is a `correction`, which
 * records that the shelf and the ledger differed rather than quietly replacing
 * the number. That is the whole difference between a stock system and a cell in
 * a spreadsheet, and it is why the ledger has no delete.
 *
 * The one genuinely confusing thing about stock control is that `quantity` means
 * two things — *how many arrived*, except on a count where it is *how many there
 * are now*. The form says so beside the box, because nobody reads it anywhere
 * else.
 */
@Component({
  selector: 'app-warehouse-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    ModalComponent,
    PagerComponent,
    FieldErrorComponent,
    MiniChartComponent,
  ],
  templateUrl: './warehouse-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 0 14px; }
      .tab {
        padding: 5px 12px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--border); background: var(--surface);
        font-size: 12.5px; font-weight: 600; color: var(--text-2);
      }
      .tab-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .tab .n { opacity: .7; margin-left: 5px; font-variant-numeric: tabular-nums; }

      .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
      .filters .grow { flex: 1; min-width: 180px; }

      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 16px; }
      .kpi {
        padding: 12px 14px; border-radius: 12px;
        border: 1px solid var(--border); background: var(--surface);
      }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .kpi-value { margin-top: 3px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .kpi-note { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }
      .kpi-warn .kpi-value { color: var(--danger); }

      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
      .panel {
        padding: 14px 15px; border-radius: 12px;
        border: 1px solid var(--border); background: var(--surface);
      }
      .panel h5 { margin: 0 0 10px; font-size: 12.5px; font-weight: 600; }

      .rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
      .rank li { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
      .rank .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rank .num { font-variant-numeric: tabular-nums; font-weight: 600; }
      .rank .sub { color: var(--text-3); font-size: 11.5px; }
      .rank .bad { color: var(--danger); }

      .wh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
      .wh {
        display: flex; flex-direction: column; gap: 8px;
        padding: 14px 15px; border-radius: 12px;
        border: 1px solid var(--border); background: var(--surface);
      }
      .wh-default { border-color: var(--brand-600); }
      .wh-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .wh-name { font-weight: 600; font-size: 13.5px; }
      .wh-code { font-family: var(--font-mono, monospace); font-size: 11.5px; color: var(--text-3); }
      .wh-stats { display: flex; gap: 14px; font-size: 12px; }
      .wh-stats b { display: block; font-size: 15px; font-variant-numeric: tabular-nums; }
      .wh-foot { display: flex; gap: 6px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border); }
      .wh-foot .spacer { flex: 1; }

      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid, .wh-grid { grid-template-columns: 1fr; } }

      .mono { font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }
      .muted-sm { font-size: 11.5px; color: var(--text-3); }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
      .num-cell { font-variant-numeric: tabular-nums; text-align: right; }
      .low { color: var(--danger); font-weight: 600; }

      /* What the quantity box means changes with the reason, so the form says so
         where the number is typed rather than in a help page nobody opens. */
      .qty-note {
        margin: 6px 0 0; padding: 8px 11px; border-radius: 8px;
        background: var(--surface-2); border: 1px solid var(--border);
        font-size: 12px; line-height: 1.55;
      }
    `,
  ],
})
export class WarehouseManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly view = signal<View>('stock');

  readonly warehouses = signal<Warehouse[]>([]);
  readonly levels = signal<StockLevel[]>([]);
  readonly movements = signal<StockMovement[]>([]);
  readonly products = signal<Product[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly analytics = signal<StockAnalytics | null>(null);
  /** Why stock may move, named by the API. Never written out here. */
  readonly reasons = signal<StockReasonMeta[]>([]);
  readonly manualReasons = signal<StockReason[]>([]);
  readonly ranges = signal<number[]>([7, 30, 90, 365]);

  readonly meta = signal<PageMeta>(EMPTY_META);
  readonly loading = signal(true);
  readonly listing = signal(false);
  readonly saving = signal(false);

  readonly warehouseOpen = signal(false);
  readonly movementOpen = signal(false);
  readonly transferOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly editingWarehouse = signal<Warehouse | null>(null);
  readonly editingLevel = signal<StockLevel | null>(null);

  /* Filters. */
  readonly warehouseFilter = signal<string>('');
  readonly shortage = signal<'' | 'low' | 'out'>('');
  readonly search = signal('');
  readonly page = signal(1);
  readonly limit = signal(25);
  readonly days = signal(30);

  readonly warehouseForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    branchId: [''],
    addressLine: [''],
    city: [''],
    pincode: [''],
    contactName: [''],
    contactPhone: [''],
    notes: [''],
    isDefault: [false],
    status: ['active'],
  });

  /**
   * One movement.
   *
   * No `type` field, and that is the point: the direction comes from the reason,
   * so a receipt goes in and a breakage goes out without anybody being asked to
   * say both — and a ledger holding a receipt that decremented the shelf is one
   * nobody can reconcile.
   */
  readonly movementForm = this.fb.nonNullable.group({
    warehouseId: ['', [Validators.required]],
    productId: ['', [Validators.required]],
    reason: ['purchase' as StockReason, [Validators.required]],
    quantity: ['', [Validators.required]],
    unitCost: [''],
    reference: [''],
    note: [''],
  });

  readonly transferForm = this.fb.nonNullable.group({
    fromWarehouseId: ['', [Validators.required]],
    toWarehouseId: ['', [Validators.required]],
    productId: ['', [Validators.required]],
    quantity: ['', [Validators.required]],
    note: [''],
  });

  readonly settingsForm = this.fb.nonNullable.group({
    reorderLevel: ['0'],
    binLocation: [''],
  });

  constructor() {
    /* Keeps `reasonChosen` in step with the dropdown — see the note on it for why
       a computed cannot read the control directly. */
    this.movementForm.controls.reason.valueChanges.subscribe((reason) =>
      this.reasonChosen.set(reason)
    );

    this.load();
  }

  /* -------------------------------- loading ------------------------------- */

  private load(): void {
    this.loading.set(true);

    this.companies.listWarehouses({ limit: 100 }).subscribe({
      next: (result) => {
        this.warehouses.set(result.items);
        this.loading.set(false);
        this.loadStock();
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your warehouses', messageOf(error));
      },
    });

    this.api.get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH).subscribe({
      next: (catalogue) => {
        this.reasons.set(catalogue.stockReasons ?? []);
        this.manualReasons.set(catalogue.stockManualReasons ?? []);
        this.ranges.set(catalogue.analyticsRanges ?? [7, 30, 90, 365]);
      },
      /**
       * A failed catalogue used to leave the reason dropdown **empty**, which is
       * a form nobody can complete and no message explaining why. The platform's
       * own list is the authority, but a fallback that keeps the screen usable is
       * better than a modal that cannot be filled in; the toast says the names
       * may not be the tenant's own.
       */
      error: () => {
        this.reasons.set(FALLBACK_REASONS);
        this.manualReasons.set(FALLBACK_REASONS.map((reason) => reason.key));
        this.toast.error('Could not load the movement reasons', 'Using the standard list for now.');
      },
    });

    /* The product picker. Bounded by the catalogue, which is what a tenant with
       a warehouse has — a shop with three hundred lines loads three hundred, and
       the alternative is a search-as-you-type against a list of that size. */
    this.companies.listProducts({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.products.set(result.items),
      error: () => this.products.set([]),
    });

    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  private stockQuery(): ListQuery {
    const query: ListQuery = { page: this.page(), limit: this.limit() };
    if (this.warehouseFilter()) query['warehouseId'] = this.warehouseFilter();
    if (this.search().trim()) query['search'] = this.search().trim();
    /* Resolved by the API, not here: the product that ran out is on page four. */
    if (this.shortage() === 'low') query['low'] = true;
    if (this.shortage() === 'out') query['out'] = true;
    return query;
  }

  private loadStock(): void {
    this.listing.set(true);
    this.companies.listStock(this.stockQuery()).subscribe({
      next: (result) => {
        this.listing.set(false);
        this.levels.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.listing.set(false);
        this.levels.set([]);
        this.meta.set(EMPTY_META);
        this.toast.error('Could not load the stock', messageOf(error));
      },
    });
  }

  private loadMovements(): void {
    this.listing.set(true);
    const query: ListQuery = { page: this.page(), limit: this.limit() };
    if (this.warehouseFilter()) query['warehouseId'] = this.warehouseFilter();

    this.companies.listMovements(query).subscribe({
      next: (result) => {
        this.listing.set(false);
        this.movements.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.listing.set(false);
        this.movements.set([]);
        this.toast.error('Could not load the ledger', messageOf(error));
      },
    });
  }

  private loadAnalytics(): void {
    this.listing.set(true);
    this.companies
      .stockAnalytics({ days: this.days(), ...(this.warehouseFilter() ? { warehouseId: this.warehouseFilter() } : {}) })
      .subscribe({
        next: (result) => {
          this.listing.set(false);
          this.analytics.set(result);
        },
        error: (error: HttpErrorResponse) => {
          this.listing.set(false);
          this.toast.error('Could not load your stock figures', messageOf(error));
        },
      });
  }

  private reloadWarehouses(): void {
    this.companies.listWarehouses({ limit: 100 }).subscribe({
      next: (result) => this.warehouses.set(result.items),
      error: () => undefined,
    });
  }

  /* --------------------------------- views -------------------------------- */

  setView(view: View): void {
    this.view.set(view);
    this.page.set(1);

    if (view === 'stock') this.loadStock();
    if (view === 'movements') this.loadMovements();
    if (view === 'analytics') this.loadAnalytics();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.loadAnalytics();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private refilter(): void {
    this.page.set(1);
    if (this.view() === 'movements') this.loadMovements();
    else if (this.view() === 'analytics') this.loadAnalytics();
    else this.loadStock();
  }

  onWarehouseFilter(value: string): void {
    this.warehouseFilter.set(value);
    this.refilter();
  }

  setShortage(value: '' | 'low' | 'out'): void {
    this.shortage.set(value);
    this.refilter();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.refilter();
  }

  onPage(page: number): void {
    this.page.set(page);
    if (this.view() === 'movements') this.loadMovements();
    else this.loadStock();
  }

  /* ------------------------------- warehouses ------------------------------ */

  openWarehouse(row: Warehouse | null): void {
    this.editingWarehouse.set(row);
    this.warehouseForm.reset({
      name: row?.name ?? '',
      code: row?.code ?? '',
      branchId: row?.branchId ? String(row.branchId) : '',
      addressLine: row?.addressLine ?? '',
      city: row?.city ?? '',
      pincode: row?.pincode ?? '',
      contactName: row?.contactName ?? '',
      contactPhone: row?.contactPhone ?? '',
      notes: row?.notes ?? '',
      isDefault: row?.isDefault ?? false,
      status: row?.status ?? 'active',
    });
    this.warehouseOpen.set(true);
  }

  saveWarehouse(): void {
    if (this.warehouseForm.invalid) {
      touchAll(this.warehouseForm);
      this.toast.error('Nothing saved', this.missingFrom(this.warehouseForm));
      return;
    }

    const raw = this.warehouseForm.getRawValue();
    const row = this.editingWarehouse();

    const payload: Record<string, unknown> = {
      name: raw.name,
      code: raw.code.toUpperCase(),
      branchId: raw.branchId ? Number(raw.branchId) : null,
      addressLine: raw.addressLine || null,
      city: raw.city || null,
      pincode: raw.pincode || null,
      contactName: raw.contactName || null,
      contactPhone: raw.contactPhone || null,
      notes: raw.notes || null,
      status: raw.status,
    };

    /* Only ever sent as `true`. A company with warehouses always has exactly one
       default, and demotion happens by promoting something else — so there is no
       way to un-default the only one and leave orders with nowhere to go. */
    if (raw.isDefault) payload['isDefault'] = true;

    this.saving.set(true);
    const request = row
      ? this.companies.updateWarehouse(row.id, payload)
      : this.companies.createWarehouse(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.warehouseOpen.set(false);
        this.toast.success(row ? 'Warehouse updated' : 'Warehouse added');
        this.reloadWarehouses();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save that warehouse', messageOf(error));
      },
    });
  }

  async removeWarehouse(row: Warehouse): Promise<void> {
    const agreed = await this.confirm.ask({
      title: `Delete ${row.name}?`,
      message:
        'Only possible while it is empty and no open order is being filled from it. Its ledger stays, so what moved through it is still on record.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!agreed) return;

    this.companies.deleteWarehouse(row.id).subscribe({
      next: () => {
        this.toast.success('Warehouse deleted');
        this.reloadWarehouses();
      },
      /* The API knows why — stock still in it, orders pointed at it — and this
         screen does not, so its wording is what gets shown. */
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete it', messageOf(error)),
    });
  }

  /* -------------------------------- movements ------------------------------ */

  openMovement(level: StockLevel | null): void {
    this.movementForm.reset({
      warehouseId: level ? String(level.warehouseId) : String(this.defaultWarehouseId() ?? ''),
      productId: level ? String(level.productId) : '',
      reason: 'purchase',
      quantity: '',
      unitCost: '',
      reference: '',
      note: '',
    });
    /* `reset` emits, but setting it here too means the note is right on the very
       first frame rather than one change-detection pass later. */
    this.reasonChosen.set('purchase');
    this.movementOpen.set(true);
  }

  saveMovement(): void {
    if (this.movementForm.invalid) {
      /**
       * Touching the controls is what makes the field messages appear — but on
       * its own it is a silent failure: the two things most often left blank here
       * are the warehouse and the product, both `<select>`s at the top of a modal
       * that may have scrolled out of view. A person presses the button, nothing
       * happens, and the screen looks broken.
       */
      touchAll(this.movementForm);
      this.toast.error('Nothing recorded', this.missingFrom(this.movementForm));
      return;
    }

    const raw = this.movementForm.getRawValue();
    this.saving.set(true);

    this.companies
      .recordMovement({
        warehouseId: Number(raw.warehouseId),
        productId: Number(raw.productId),
        reason: raw.reason,
        quantity: numberOrNull(raw.quantity) ?? 0,
        /**
         * `numberOrNull`, not `.trim()`.
         *
         * This box is `type="number"`, so the control holds a **number** the
         * moment somebody types one - and `.trim()` on a number throws inside
         * the save handler, after the button is already disabled. The delivery
         * was never sent and nothing said why.
         */
        unitCost: numberOrNull(raw.unitCost),
        reference: raw.reference || null,
        note: raw.note || null,
      })
      .subscribe({
        next: (movement) => {
          this.saving.set(false);
          this.movementOpen.set(false);
          this.toast.success('Recorded', `${this.productName(movement.productId)} is now ${movement.balanceAfter}`);
          this.loadStock();
          this.reloadWarehouses();
          this.analytics.set(null);
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not record that', messageOf(error));
        },
      });
  }

  saveTransfer(): void {
    if (this.transferForm.invalid) {
      touchAll(this.transferForm);
      this.toast.error('Nothing moved', this.missingFrom(this.transferForm));
      return;
    }

    const raw = this.transferForm.getRawValue();

    if (raw.fromWarehouseId === raw.toWarehouseId) {
      this.toast.error('Pick two different warehouses');
      return;
    }

    this.saving.set(true);
    this.companies
      .transferStock({
        fromWarehouseId: Number(raw.fromWarehouseId),
        toWarehouseId: Number(raw.toWarehouseId),
        productId: Number(raw.productId),
        quantity: numberOrNull(raw.quantity) ?? 0,
        note: raw.note || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.transferOpen.set(false);
          this.toast.success('Stock transferred');
          this.loadStock();
          this.reloadWarehouses();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not transfer that', messageOf(error));
        },
      });
  }

  /* ----------------------------- level settings ---------------------------- */

  openSettings(level: StockLevel): void {
    this.editingLevel.set(level);
    this.settingsForm.reset({
      reorderLevel: String(level.reorderLevel ?? 0),
      binLocation: level.binLocation ?? '',
    });
    this.settingsOpen.set(true);
  }

  saveSettings(): void {
    const level = this.editingLevel();
    if (!level) return;

    const raw = this.settingsForm.getRawValue();
    this.saving.set(true);

    this.companies
      .saveStockSettings({
        warehouseId: level.warehouseId,
        productId: level.productId,
        reorderLevel: numberOrNull(raw.reorderLevel) ?? 0,
        binLocation: raw.binLocation || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.settingsOpen.set(false);
          this.toast.success('Saved');
          this.loadStock();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save that', messageOf(error));
        },
      });
  }

  /* -------------------------------- display -------------------------------- */

  readonly defaultWarehouseId = computed(() => this.warehouses().find((row) => row.isDefault)?.id ?? null);

  /** The reasons a **person** may write. `sale` and `transfer` are the platform's. */
  readonly writableReasons = computed(() =>
    this.reasons().filter((reason) => this.manualReasons().includes(reason.key))
  );

  /**
   * The reason currently chosen, as a **signal**.
   *
   * A reactive form control is not a signal, so a `computed` reading
   * `controls.reason.value` directly reads once and caches forever — the note
   * below would be written for whichever reason the form opened on and would
   * never change when somebody picked another. That is the exact trap
   * `FieldErrorComponent` documents, and this is the same escape from it:
   * `AbstractControl.events` drives a signal the computed can depend on.
   */
  private readonly reasonChosen = signal<StockReason>('purchase');

  /**
   * What the quantity box means for the reason currently chosen.
   *
   * The one genuinely confusing thing about stock control, said where the number
   * is typed rather than in a help page nobody opens — and it has to follow the
   * dropdown, because a note that still says *how many arrived* while somebody is
   * entering a stock count is worse than no note at all.
   */
  readonly quantityNote = computed(() => {
    if (this.reasonChosen() === 'correction') {
      return 'How many there are NOW — the number you just counted, not the difference. The change is worked out for you and recorded as a correction; if it agrees with the ledger, that is recorded too, as a movement of nothing.';
    }
    if (this.reasonChosen() === 'damage') return 'How many are gone.';
    return 'How many arrived.';
  });

  /**
   * Which boxes are stopping the save, in the words on their labels.
   *
   * A form is refused as a whole, so naming the fields is the difference between
   * "that did not work" and "you have not picked a warehouse". Read off the
   * control names rather than the DOM, so a field renamed in the template cannot
   * leave this saying something that is no longer on screen.
   */
  private missingFrom(form: { controls: Record<string, { invalid: boolean }> }): string {
    const LABELS: Record<string, string> = {
      warehouseId: 'a warehouse',
      fromWarehouseId: 'a warehouse to move from',
      toWarehouseId: 'a warehouse to move to',
      productId: 'a product',
      reason: 'what happened',
      quantity: 'a quantity',
      name: 'a name',
      code: 'a code',
    };

    const missing = Object.entries(form.controls)
      .filter(([, control]) => control.invalid)
      .map(([field]) => LABELS[field] ?? field);

    if (!missing.length) return 'Check the highlighted fields.';
    if (missing.length === 1) return `You still need to choose ${missing[0]}.`;

    return `You still need ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}.`;
  }

  /**
   * The smallest quantity the chosen reason accepts.
   *
   * Zero only on a stock count. A receipt or a write-off of nothing is not a
   * movement and the API refuses it; a count of zero says the shelf is empty,
   * which is exactly the kind of thing a stocktake exists to record.
   */
  readonly quantityMin = computed(() => (this.reasonChosen() === 'correction' ? 0 : 1));

  reasonName(key: string): string {
    return this.reasons().find((reason) => reason.key === key)?.name ?? key;
  }

  productName(id: number): string {
    return this.products().find((product) => product.id === id)?.name ?? `#${id}`;
  }

  readonly movementSeries = computed<ChartPoint[]>(() =>
    (this.analytics()?.movements ?? []).map((point) => ({ label: point.day, value: point.out ?? 0 }))
  );

  readonly intakeSeries = computed<ChartPoint[]>(() =>
    (this.analytics()?.movements ?? []).map((point) => ({ label: point.day, value: point.in ?? 0 }))
  );

  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return String(value);
    }
  }
}
