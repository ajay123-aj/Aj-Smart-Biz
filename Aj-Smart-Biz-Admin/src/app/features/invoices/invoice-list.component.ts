import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import { CatalogueEntry, Invoice, InvoiceAccess, InvoiceMeta, InvoiceScope, InvoiceSummary } from '../../core/models/invoice.model';
import { PagerComponent } from '../../shared/ui/pager.component';
import { formatMoney } from '../../shared/utils';

/**
 * Invoices: bills raised at the counter, newest first, with today's and this
 * month's takings above the list.
 *
 * One screen, two scopes, chosen by the route (`data.scope`):
 *   - `/invoices` — **My invoices**: the ones this admin created.
 *   - `/invoices/all` — **All invoices**: everyone's, with a "Created by"
 *     filter. Needs the All invoices permission; the API enforces it too.
 * The totals above the list cover the same invoices as the list.
 */
@Component({
  selector: 'app-invoice-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [DatePipe, RouterLink, PagerComponent],
  template: `
    <div class="card-body">
      <div class="row-between wrap head">
        <div>
          <h2 class="mt-0 mb-0">{{ scope() === 'all' ? 'All invoices' : 'My invoices' }}</h2>
          <p class="muted tiny mb-0">
            @if (scope() === 'all') {
              Every invoice raised by every admin in your company.
            } @else {
              Invoices you created. Issuing an invoice takes the items out of stock.
            }
          </p>
        </div>
        <div class="row wrap" style="gap:8px">
          @if (access(); as a) {
            @if (a.canSeeAll) {
              <div class="seg" role="group" aria-label="Whose invoices">
                <a class="seg-btn" routerLink="/invoices" [class.seg-on]="scope() === 'mine'">Mine</a>
                <a class="seg-btn" routerLink="/invoices/all" [class.seg-on]="scope() === 'all'">All</a>
              </div>
            }
            @if (a.canAnalyse) {
              <a class="btn btn-ghost" routerLink="/invoices/analysis">📈 Analysis</a>
            }
          }
          @if (canCreate()) {
            <a class="btn btn-primary" routerLink="/invoices/new">+ New invoice</a>
          }
        </div>
      </div>

      @if (meta(); as m) {
        @if (!m.granted) {
          <div class="notice notice-warn">
            Invoice management is not part of your current plan. You can still view past invoices, but you cannot
            create new ones. Ask us to add it from <a routerLink="/plan">My Plan</a>.
          </div>
        } @else if (!m.stockTracking) {
          <div class="notice">
            Stock is <strong>not</strong> deducted when you issue invoices, because Warehouse &amp; stock is not
            switched on. Turn it on and mark products as "Track inventory" to deduct stock automatically.
          </div>
        }
      }

      @if (summary(); as s) {
        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Today's sales</div>
            <div class="kpi-value">{{ money(s.today.total) }}</div>
            <div class="kpi-note">{{ s.today.count }} invoice(s) · {{ money(s.today.collected) }} received</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">This month</div>
            <div class="kpi-value">{{ money(s.month.total) }}</div>
            <div class="kpi-note">{{ s.month.count }} invoice(s) · {{ money(s.month.discount) }} discount given</div>
          </div>
          <div class="kpi" [class.kpi-warn]="s.outstanding > 0">
            <div class="kpi-label">To collect</div>
            <div class="kpi-value">{{ money(s.outstanding) }}</div>
            <div class="kpi-note">Unpaid balance on issued invoices</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Drafts</div>
            <div class="kpi-value">{{ s.drafts }}</div>
            <div class="kpi-note">Saved but not issued yet</div>
          </div>
        </div>
      }

      <div class="tabs-row">
        <button type="button" class="tab" [class.tab-on]="status() === ''" (click)="setStatus('')">All</button>
        @for (s of statuses(); track s.key) {
          <button type="button" class="tab" [class.tab-on]="status() === s.key" (click)="setStatus(s.key)">
            {{ s.name }}
          </button>
        }
      </div>

      <div class="filters">
        <input
          class="input grow"
          type="search"
          placeholder="Search invoice number, customer name or phone"
          [value]="search()"
          (change)="setSearch(value($event))"
        />
        <select class="select" style="width:auto" (change)="setPayment(value($event))">
          <option value="">Any payment</option>
          @for (p of paymentStatuses(); track p.key) {
            <option [value]="p.key" [selected]="payment() === p.key">{{ p.name }}</option>
          }
        </select>
        @if (scope() === 'all' && (access()?.admins?.length ?? 0) > 1) {
          <select class="select" style="width:auto" aria-label="Created by" (change)="setCreator(value($event))">
            <option value="">Everyone</option>
            @for (a of access()!.admins; track a.id) {
              <option [value]="a.id" [selected]="creator() === '' + a.id">{{ a.name }}</option>
            }
          </select>
        }
        <label class="tiny muted">From <input class="input" style="width:auto" type="date" [value]="from()" (change)="setFrom(value($event))" /></label>
        <label class="tiny muted">To <input class="input" style="width:auto" type="date" [value]="to()" (change)="setTo(value($event))" /></label>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:260px"></div>
      } @else if (!items().length) {
        <div class="empty-note">
          <div class="big">🧾</div>
          <p>{{ scope() === 'all' ? 'No invoices match these filters.' : 'You have not created any invoices yet.' }}</p>
          @if (canCreate() && meta()?.granted) {
            <a class="btn btn-primary btn-sm" routerLink="/invoices/new">Create your first invoice</a>
          }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Created by</th>
                <th class="n">Items</th>
                <th class="n">Total</th>
                <th class="n">Balance</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.id) {
                <tr class="clickable" [routerLink]="['/invoices', row.id]">
                  <td class="strong mono">{{ row.invoiceNo ?? 'Draft #' + row.id }}</td>
                  <td class="nowrap">{{ row.invoiceDate | date: 'dd MMM yyyy' }}</td>
                  <td>
                    {{ row.customerName || 'Walk-in customer' }}
                    @if (row.customerPhone) {
                      <div class="tiny muted">{{ row.customerPhone }}</div>
                    }
                  </td>
                  <td class="nowrap">
                    @if (row.creator) {
                      <span class="who">
                        <span class="who-dot" aria-hidden="true">{{ initial(row.creator.name) }}</span>
                        {{ row.createdBy === me() ? 'You' : row.creator.name }}
                      </span>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                  <td class="n">{{ row.itemCount }}</td>
                  <td class="n strong">{{ money(row.grandTotal) }}</td>
                  <td class="n">{{ row.status === 'cancelled' ? '—' : money(balance(row)) }}</td>
                  <td><span class="badge" [class]="'badge badge-' + tone(statuses(), row.status)">{{ label(statuses(), row.status) }}</span></td>
                  <td>
                    @if (row.status !== 'cancelled') {
                      <span [class]="'badge badge-' + tone(paymentStatuses(), row.paymentStatus)">{{ label(paymentStatuses(), row.paymentStatus) }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pager [meta]="pageMeta()" (pageChange)="goTo($event)" />
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .head { margin-bottom: 16px; gap: 12px; }
      .notice { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2, var(--surface)); font-size: 13px; margin-bottom: 14px; }
      .notice-warn { border-color: rgba(245, 158, 11, .45); background: rgba(245, 158, 11, .08); }
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 0 0 16px; }
      .kpi { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .kpi-value { margin-top: 3px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .kpi-note { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }
      .kpi-warn .kpi-value { color: var(--danger); }
      .tabs-row { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 0 12px; }
      .tab { padding: 5px 12px; border-radius: 999px; cursor: pointer; border: 1px solid var(--border); background: var(--surface); font-size: 12.5px; font-weight: 600; color: var(--text-2); }
      .tab-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
      .filters .grow { flex: 1; min-width: 200px; }
      .filters label { display: flex; align-items: center; gap: 6px; }
      td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
      .mono { font-variant-numeric: tabular-nums; }
      tr.clickable { cursor: pointer; }
      tr.clickable:hover td { background: var(--surface-2, rgba(0,0,0,.02)); }
      .seg { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2, var(--surface)); }
      .seg-btn { padding: 5px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; color: var(--text-2); text-decoration: none; }
      .seg-btn:hover { text-decoration: none; color: var(--text); }
      .seg-on { background: var(--brand-600); color: #fff !important; }
      .who { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; }
      .who-dot { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--brand-600); color: #fff; font-size: 10.5px; font-weight: 700; }
      .empty-note { padding: 34px 0; text-align: center; color: var(--text-3); font-size: 13px; }
      .empty-note .big { font-size: 34px; }
    `,
  ],
})
export class InvoiceListComponent {
  private readonly invoices = inject(InvoiceService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  /** Whose invoices this screen shows — from the route, so the URL says it. */
  readonly scope = signal<InvoiceScope>((this.route.snapshot.data['scope'] as InvoiceScope) ?? 'mine');
  readonly access = signal<InvoiceAccess | null>(null);
  readonly me = computed(() => this.access()?.me.id ?? null);
  readonly creator = signal('');

  readonly canCreate = computed(() => this.auth.can('invoices', 'canCreate'));

  readonly meta = signal<InvoiceMeta | null>(null);
  readonly summary = signal<InvoiceSummary | null>(null);
  readonly items = signal<Invoice[]>([]);
  readonly pageMeta = signal<PageMeta>(EMPTY_META);
  readonly loading = signal(true);

  readonly statuses = computed(() => this.meta()?.statuses ?? []);
  readonly paymentStatuses = computed(() => this.meta()?.paymentStatuses ?? []);

  readonly status = signal('');
  readonly payment = signal('');
  readonly search = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);

  constructor() {
    this.invoices.meta().subscribe({
      next: (m) => this.meta.set(m),
      error: (e: HttpErrorResponse) => this.toast.error('Could not load invoice settings', messageOf(e)),
    });
    this.invoices.access().subscribe({ next: (a) => this.access.set(a), error: () => undefined });
    this.invoices.summary(this.scope()).subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
    this.load();
  }

  private load(): void {
    const query: ListQuery = { page: this.page(), limit: 25, scope: this.scope() };
    if (this.scope() === 'all' && this.creator()) query['createdBy'] = this.creator();
    if (this.status()) query['status'] = this.status();
    if (this.payment()) query['paymentStatus'] = this.payment();
    if (this.search().trim()) query['search'] = this.search().trim();
    if (this.from()) query['from'] = this.from();
    if (this.to()) query['to'] = this.to();

    this.loading.set(true);
    this.invoices.list(query).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.pageMeta.set(r.meta);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.items.set([]);
        this.loading.set(false);
        this.toast.error('Could not load invoices', messageOf(e));
      },
    });
  }

  private refilter(): void {
    this.page.set(1);
    this.load();
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  setStatus(v: string): void { this.status.set(v); this.refilter(); }
  setPayment(v: string): void { this.payment.set(v); this.refilter(); }
  setSearch(v: string): void { this.search.set(v); this.refilter(); }
  setFrom(v: string): void { this.from.set(v); this.refilter(); }
  setTo(v: string): void { this.to.set(v); this.refilter(); }
  setCreator(v: string): void { this.creator.set(v); this.refilter(); }

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }
  goTo(page: number): void { this.page.set(page); this.load(); }

  money(value: number | string | null | undefined): string {
    return formatMoney(value);
  }

  balance(row: Invoice): number {
    return Math.max(0, Number(row.grandTotal) - Number(row.amountPaid));
  }

  label(list: CatalogueEntry[], key: string): string {
    return list.find((e) => e.key === key)?.name ?? key;
  }

  tone(list: CatalogueEntry[], key: string): string {
    const tone = list.find((e) => e.key === key)?.tone ?? 'muted';
    return tone === 'neutral' ? 'muted' : tone;
  }
}
