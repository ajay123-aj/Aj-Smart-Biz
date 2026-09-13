import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { FUNCTIONALITY_CATALOGUE_PATH } from '../../core/services/crud.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { numberOrNull } from '../../shared/utils';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import {
  Branch,
  CompanyOrder,
  FunctionalityCatalogue,
  OrderStatus,
  OrderStatusMeta,
  OrderSummary,
  SalesAnalytics,
  Warehouse,
} from '../../core/models/domain.model';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { MiniChartComponent, type ChartPoint } from '../../shared/ui/mini-chart.component';

/** Which half of the screen is showing — the queue, or what it adds up to. */
type View = 'queue' | 'analytics';

/**
 * Orders: the queue somebody works down, and what it has come to.
 *
 * ### One screen, two views
 *
 * The queue and the analytics are the same subject seen at two distances, and
 * keeping them on one screen rather than two menus is deliberate: the question
 * "how are we doing" is asked *while* working through the morning's orders, and
 * a separate menu entry is one nobody clicks. The tabs cost nothing and the
 * analytics load only when asked for.
 *
 * ### What this screen cannot do
 *
 * There is no *Add order* button, and there is no delete. The only writer is the
 * public website: an order that could be typed in here would make this list a
 * place where "somebody bought this" and "somebody typed this in" are
 * indistinguishable, and one that could be deleted would make every revenue
 * figure provisional. Cancelling is what "this is not happening" means, and it
 * leaves both the record and the stock it gave back visible.
 *
 * The lines are read-only for the same reason. An order records what was bought
 * at what price; a console that could rewrite that would turn every sales report
 * into an opinion. What a shop legitimately changes after the fact — the
 * warehouse, a delivery charge agreed on the phone, its own notes — it can.
 *
 * ### The buttons come from the API
 *
 * Which moves an order may make is `nextStatuses` on the row, decided by the
 * API. This screen renders them rather than working them out, so a button it
 * offers and a request the API accepts can never disagree — the same rule the
 * functionality switches follow.
 */
@Component({
  selector: 'app-orders-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, ModalComponent, PagerComponent, MiniChartComponent],
  templateUrl: './orders-manager.component.html',
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

      /* The strip above the queue. Four numbers somebody reads before deciding
         what to open, so they are large and they are not links. */
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 16px; }
      .kpi {
        padding: 12px 14px; border-radius: 12px;
        border: 1px solid var(--border); background: var(--surface);
      }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; letter-spacing: .02em; }
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
      .rank .sub { color: var(--text-3); font-size: 11.5px; font-variant-numeric: tabular-nums; }

      .mono { font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }
      .muted-sm { font-size: 11.5px; color: var(--text-3); }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      /* The detail modal. */
      .lines { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .lines th, .lines td { padding: 7px 8px; border-bottom: 1px solid var(--border); text-align: left; }
      .lines th { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .lines td.n, .lines th.n { text-align: right; font-variant-numeric: tabular-nums; }
      .lines tfoot td { font-weight: 700; border-bottom: 0; }

      .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .detail-grid { grid-template-columns: 1fr; } }

      .trail { display: grid; gap: 4px; margin: 0; font-size: 12px; color: var(--text-3); }
      .trail div { display: flex; gap: 8px; }
      .trail dt { min-width: 92px; font-weight: 600; color: var(--text-2); }

      .moves { display: flex; gap: 6px; flex-wrap: wrap; }
    `,
  ],
})
export class OrdersManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly view = signal<View>('queue');

  readonly items = signal<CompanyOrder[]>([]);
  readonly meta = signal<PageMeta>(EMPTY_META);
  readonly summary = signal<OrderSummary | null>(null);
  readonly analytics = signal<SalesAnalytics | null>(null);
  readonly branches = signal<Branch[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  /** The platform's own words for each step. Read, never written out here. */
  readonly statuses = signal<OrderStatusMeta[]>([]);
  readonly paymentStatuses = signal<OrderStatusMeta[]>([]);
  readonly ranges = signal<number[]>([7, 30, 90, 365]);

  readonly loading = signal(true);
  readonly listing = signal(false);
  readonly loadingAnalytics = signal(false);
  readonly saving = signal(false);
  readonly detailOpen = signal(false);
  readonly current = signal<CompanyOrder | null>(null);

  /* The filters, held as signals so the list reloads from one place. */
  readonly statusFilter = signal<string>('');
  readonly paymentFilter = signal<string>('');
  readonly branchFilter = signal<string>('');
  readonly search = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);
  readonly limit = signal(25);
  readonly days = signal(30);

  /** The few things a person may legitimately change after the fact. */
  readonly editForm = this.fb.nonNullable.group({
    warehouseId: [''],
    /* A number control, matching the `type="number"` box it is bound to. */
    adjustment: this.fb.control<number | null>(null),
    adjustmentNote: [''],
    internalNote: [''],
    customerName: [''],
    customerPhone: [''],
    customerAddress: [''],
  });

  readonly paymentForm = this.fb.nonNullable.group({
    paymentStatus: [''],
    reference: [''],
  });

  constructor() {
    this.load();
  }

  /* -------------------------------- loading ------------------------------- */

  private load(): void {
    this.loading.set(true);

    this.companies.orderSummary().subscribe({
      next: (view) => {
        this.summary.set(view);
        /* The API names the steps. A hard-coded list here would go stale the
           first time one was added, and would show a raw key on the tab. */
        this.statuses.set(view.statuses ?? []);
        this.paymentStatuses.set(view.paymentStatuses ?? []);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your orders', messageOf(error));
      },
    });

    this.loadItems();

    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });

    /* Only for the warehouse picker in the detail modal. A tenant without the
       feature gets an empty list and no picker, which is correct. */
    this.companies.listWarehouses({ limit: 100, status: 'active' }).subscribe({
      next: (result) => this.warehouses.set(result.items),
      error: () => this.warehouses.set([]),
    });

    this.api.get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH).subscribe({
      next: (catalogue) => this.ranges.set(catalogue.analyticsRanges ?? [7, 30, 90, 365]),
      error: () => undefined,
    });
  }

  private query(): ListQuery {
    const query: ListQuery = { page: this.page(), limit: this.limit() };

    if (this.search().trim()) query['search'] = this.search().trim();
    if (this.statusFilter() === 'open') query['open'] = true;
    else if (this.statusFilter()) query['status'] = this.statusFilter();
    if (this.paymentFilter()) query['paymentStatus'] = this.paymentFilter();
    if (this.branchFilter()) query['branchId'] = this.branchFilter();
    if (this.from()) query['from'] = this.from();
    if (this.to()) query['to'] = this.to();

    return query;
  }

  private loadItems(): void {
    this.listing.set(true);
    this.companies.listOrders(this.query()).subscribe({
      next: (result) => {
        this.listing.set(false);
        this.items.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.listing.set(false);
        this.items.set([]);
        this.meta.set(EMPTY_META);
        this.toast.error('Could not load the orders', messageOf(error));
      },
    });
  }

  /** Only when the tab is actually opened — nobody pays for a report they did not ask for. */
  private loadAnalytics(): void {
    this.loadingAnalytics.set(true);
    this.companies.salesAnalytics({ days: this.days() }).subscribe({
      next: (result) => {
        this.loadingAnalytics.set(false);
        this.analytics.set(result);
      },
      error: (error: HttpErrorResponse) => {
        this.loadingAnalytics.set(false);
        this.toast.error('Could not load your sales figures', messageOf(error));
      },
    });
  }

  /** The counts the summary already answered, refreshed after anything changes. */
  private refreshSummary(): void {
    this.companies.orderSummary().subscribe({
      next: (view) => this.summary.set(view),
      error: () => undefined,
    });
  }

  /* -------------------------------- filters ------------------------------- */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  setView(view: View): void {
    this.view.set(view);
    if (view === 'analytics' && !this.analytics()) this.loadAnalytics();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.loadAnalytics();
  }

  /** Any filter change goes back to page one — page four of the old filter is nowhere. */
  private refilter(): void {
    this.page.set(1);
    this.loadItems();
  }

  setStatus(value: string): void {
    this.statusFilter.set(value);
    this.refilter();
  }

  onPayment(value: string): void {
    this.paymentFilter.set(value);
    this.refilter();
  }

  onBranch(value: string): void {
    this.branchFilter.set(value);
    this.refilter();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.refilter();
  }

  onFrom(value: string): void {
    this.from.set(value);
    this.refilter();
  }

  onTo(value: string): void {
    this.to.set(value);
    this.refilter();
  }

  onPage(page: number): void {
    this.page.set(page);
    this.loadItems();
  }

  /* -------------------------------- detail -------------------------------- */

  open(row: CompanyOrder): void {
    /* Re-read rather than trusting the list row: the list carries no lines, and
       somebody else may have moved it along since the page was loaded. */
    this.companies.getOrder(row.id).subscribe({
      next: (order) => {
        this.current.set(order);
        this.editForm.reset({
          warehouseId: order.warehouseId ? String(order.warehouseId) : '',
          adjustment: numberOrNull(order.adjustment),
          adjustmentNote: order.adjustmentNote ?? '',
          internalNote: order.internalNote ?? '',
          customerName: order.customerName ?? '',
          customerPhone: order.customerPhone ?? '',
          customerAddress: order.customerAddress ?? '',
        });
        this.paymentForm.reset({ paymentStatus: '', reference: order.paymentReference ?? '' });
        this.detailOpen.set(true);
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not open that order', messageOf(error)),
    });
  }

  /**
   * Move the order along.
   *
   * Cancelling asks for a reason and says out loud what it will do to stock —
   * both because a cancelled order with no reason is the one somebody asks about
   * six weeks later, and because putting boxes back on a shelf is not something
   * to do to somebody by surprise.
   */
  async move(status: OrderStatus): Promise<void> {
    const order = this.current();
    if (!order || !this.canEdit()) return;

    let reason: string | null = null;

    if (status === 'cancelled') {
      const stock = order.stockIssued
        ? ' The stock that went out will be booked back in.'
        : order.stockReserved
          ? ' The stock it is holding will be released.'
          : '';

      const agreed = await this.confirm.ask({
        title: `Cancel ${order.orderNo}?`,
        message: `This cannot be undone — a cancelled order stays on the list as a record.${stock}`,
        confirmText: 'Cancel the order',
        danger: true,
      });
      if (!agreed) return;

      reason = window.prompt('Why is it being cancelled?')?.trim() || null;
    }

    this.saving.set(true);
    this.companies.setOrderStatus(order.id, status, reason).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.current.set(updated);
        this.toast.success(`${updated.orderNo} is now ${updated.status}`);
        this.loadItems();
        this.refreshSummary();
        this.analytics.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        /* The API's own wording. It knows why — not enough stock to reserve, a
           move this order cannot make — and this screen does not. */
        this.toast.error('Could not move that order', messageOf(error));
      },
    });
  }

  markPayment(status: string): void {
    const order = this.current();
    if (!order || !this.canEdit()) return;

    this.saving.set(true);
    this.companies.setOrderPayment(order.id, status, this.paymentForm.controls.reference.value).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.current.set(updated);
        this.toast.success(`Payment marked ${updated.paymentStatus}`);
        this.loadItems();
        this.refreshSummary();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not update the payment', messageOf(error));
      },
    });
  }

  saveEdits(): void {
    const order = this.current();
    if (!order || !this.canEdit()) return;

    const raw = this.editForm.getRawValue();
    this.saving.set(true);

    this.companies
      .updateOrder(order.id, {
        warehouseId: raw.warehouseId ? Number(raw.warehouseId) : null,
        /**
         * An empty box is no adjustment, not a zero somebody typed - and
         * `numberOrNull` rather than `.trim()`, because this box is
         * `type="number"` and holds a number as soon as anybody uses it. The old
         * check threw on the way past, leaving the order editor stuck on
         * "Saving…" with nothing sent.
         */
        adjustment: numberOrNull(raw.adjustment) ?? 0,
        adjustmentNote: raw.adjustmentNote || null,
        internalNote: raw.internalNote || null,
        customerName: raw.customerName || null,
        customerPhone: raw.customerPhone || null,
        customerAddress: raw.customerAddress || null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.current.set(updated);
          this.toast.success('Order updated');
          this.loadItems();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save that', messageOf(error));
        },
      });
  }

  /* -------------------------------- display ------------------------------- */

  /** The platform's name for a step, or the raw key if it somehow has none. */
  nameOf(key: string): string {
    return (
      this.statuses().find((entry) => entry.key === key)?.name ??
      this.paymentStatuses().find((entry) => entry.key === key)?.name ??
      key
    );
  }

  toneOf(key: string): string {
    return (
      this.statuses().find((entry) => entry.key === key)?.tone ??
      this.paymentStatuses().find((entry) => entry.key === key)?.tone ??
      'info'
    );
  }

  countOf(key: string): number {
    return this.summary()?.byStatus?.[key as OrderStatus] ?? 0;
  }

  /**
   * The same count from the analytics window rather than from all time.
   *
   * A method rather than an index in the template, because `statuses()` carries
   * the payment vocabulary too and TypeScript is right to refuse `refunded` as a
   * key of an order-status map. Narrowing it here keeps the template readable and
   * the types honest.
   */
  analyticsCount(key: string): number {
    return this.analytics()?.byStatus?.[key as OrderStatus] ?? 0;
  }

  /** The daily series, as the chart wants it. Never re-shaped, only re-labelled. */
  readonly revenueSeries = computed<ChartPoint[]>(() =>
    (this.analytics()?.daily ?? []).map((point) => ({ label: point.day, value: point.revenue ?? 0 }))
  );

  readonly orderSeries = computed<ChartPoint[]>(() =>
    (this.analytics()?.daily ?? []).map((point) => ({ label: point.day, value: point.orders ?? 0 }))
  );

  /** The tenant's own currency, off the orders themselves. */
  readonly currency = computed(
    () => this.items()[0]?.currency ?? this.analytics()?.recent?.[0]?.currency ?? 'INR'
  );

  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: this.currency(),
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
      }).format(value);
    } catch {
      return String(value);
    }
  }
}
