import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { InvoiceService } from '../../core/services/invoice.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { ListQuery } from '../../core/models/api.model';
import { InvoiceAccess, InvoiceAnalysis, InvoiceMeta, InvoiceScope } from '../../core/models/invoice.model';
import { formatMoney } from '../../shared/utils';

type Preset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'custom';

/** `YYYY-MM-DD` in local time — what an `<input type="date">` holds. */
const ymd = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Invoice analysis: how the counter is doing.
 *
 * One request (`GET /invoices/analysis`) feeds the whole screen — headline
 * totals, revenue over time, product-wise, admin-wise, payment mode, payment
 * status and branch. Issued invoices only: a draft is not a sale and a
 * cancelled invoice was undone.
 *
 * It reports on the invoices this admin may see. Without the All invoices
 * permission that is their own; with it, "All" covers everyone's and can be
 * narrowed to one admin or one branch.
 */
@Component({
  selector: 'app-invoice-analysis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, DecimalPipe],
  template: `
    <div class="row-between wrap head">
      <div>
        <a class="tiny muted" routerLink="/invoices">← Invoices</a>
        <h2 class="mt-0 mb-0">Invoice analysis</h2>
        <p class="muted tiny mb-0">
          Issued invoices
          @if (data(); as d) {
            · {{ d.range.from | date: 'dd MMM yyyy' }} – {{ d.range.to | date: 'dd MMM yyyy' }}
          }
          · {{ scope() === 'all' ? (creatorName() ? creatorName() + "'s invoices" : 'everyone in the company') : 'your own invoices' }}
        </p>
      </div>
      <button type="button" class="btn btn-ghost" (click)="load()" [disabled]="loading()">↻ Refresh</button>
    </div>

    <!-- ------------------------------ filters ------------------------------ -->
    <section class="card filters-card">
      <div class="card-body filters">
        <div class="presets" role="group" aria-label="Date range">
          @for (p of presets; track p.key) {
            <button type="button" class="chip-btn" [class.on]="preset() === p.key" (click)="choose(p.key)">{{ p.label }}</button>
          }
        </div>
        <div class="row wrap" style="gap:8px;align-items:center">
          <label class="tiny muted lab">From <input class="input" type="date" [value]="from()" (change)="setFrom(value($event))" /></label>
          <label class="tiny muted lab">To <input class="input" type="date" [value]="to()" (change)="setTo(value($event))" /></label>

          @if (access()?.canSeeAll) {
            <div class="seg" role="group" aria-label="Whose invoices">
              <button type="button" class="seg-btn" [class.seg-on]="scope() === 'mine'" (click)="setScope('mine')">Mine</button>
              <button type="button" class="seg-btn" [class.seg-on]="scope() === 'all'" (click)="setScope('all')">All</button>
            </div>
            @if (scope() === 'all') {
              <select class="select" style="width:auto" aria-label="Created by" (change)="setCreator(value($event))">
                <option value="">Every admin</option>
                @for (a of access()!.admins; track a.id) {
                  <option [value]="a.id" [selected]="creator() === '' + a.id">{{ a.name }}</option>
                }
              </select>
            }
          }

          @if ((meta()?.branches?.length ?? 0) > 1) {
            <select class="select" style="width:auto" aria-label="Branch" (change)="setBranch(value($event))">
              <option value="">All branches</option>
              @for (b of meta()!.branches; track b.id) {
                <option [value]="b.id" [selected]="branch() === '' + b.id">{{ b.name }}</option>
              }
            </select>
          }
        </div>
      </div>
    </section>

    @if (loading() && !data()) {
      <div class="skeleton" style="height:420px"></div>
    } @else if (data(); as d) {
      <!-- ------------------------------ totals ------------------------------ -->
      <div class="kpis" [class.dim]="loading()">
        <div class="kpi kpi-lead">
          <div class="kpi-label">Revenue</div>
          <div class="kpi-value">{{ money(d.totals.revenue) }}</div>
          <div class="kpi-note">{{ d.totals.invoices | number }} invoices</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Average bill</div>
          <div class="kpi-value">{{ money(d.totals.averageBill) }}</div>
          <div class="kpi-note">{{ d.totals.itemsSold | number }} items sold</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Collected</div>
          <div class="kpi-value">{{ money(d.totals.collected) }}</div>
          <div class="kpi-note">{{ d.totals.collectionRate }}% of revenue</div>
        </div>
        <div class="kpi" [class.kpi-warn]="d.totals.outstanding > 0">
          <div class="kpi-label">To collect</div>
          <div class="kpi-value">{{ money(d.totals.outstanding) }}</div>
          <div class="kpi-note">Unpaid balance</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Discount given</div>
          <div class="kpi-value">{{ money(d.totals.discount) }}</div>
          <div class="kpi-note">Tax {{ money(d.totals.tax) }}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Customers</div>
          <div class="kpi-value">{{ d.totals.customers | number }}</div>
          <div class="kpi-note">By phone number</div>
        </div>
      </div>

      @if (!d.totals.invoices) {
        <section class="card"><div class="card-body empty">
          <div class="big">📭</div>
          <p>No issued invoices in this range. Try a longer period{{ access()?.canSeeAll && scope() === 'mine' ? ', or switch to All' : '' }}.</p>
        </div></section>
      } @else {
        <!-- ------------------------------ trend ------------------------------ -->
        <section class="card">
          <div class="card-head">
            <h3>Revenue {{ d.range.granularity === 'month' ? 'by month' : 'by day' }}</h3>
            <span class="tiny muted">Hover a bar for the figures</span>
          </div>
          <div class="card-body">
            <div class="chart" role="img" [attr.aria-label]="'Revenue ' + (d.range.granularity === 'month' ? 'by month' : 'by day')">
              @for (t of trend(); track t.period) {
                <div class="col" [title]="t.label + ': ' + money(t.revenue) + ' · ' + t.invoices + ' invoices'">
                  <div class="bar-wrap"><div class="bar" [style.height.%]="t.height"></div></div>
                  <div class="col-label">{{ t.short }}</div>
                </div>
              }
            </div>
          </div>
        </section>

        <div class="grid-2col">
          <!-- ------------------------------ product-wise ------------------------------ -->
          <section class="card span-2">
            <div class="card-head">
              <h3>Product-wise</h3>
              <div class="row" style="gap:8px">
                <input class="input input-sm" type="search" placeholder="Filter products" [value]="productFilter()" (input)="productFilter.set(value($event))" />
                <button type="button" class="btn btn-ghost btn-sm" (click)="exportProducts()">⬇ CSV</button>
              </div>
            </div>
            <div class="card-body tight">
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="n" style="width:42px">#</th>
                      <th>Product</th>
                      <th class="n">Qty sold</th>
                      <th class="n">Invoices</th>
                      <th class="n">Discount</th>
                      <th class="n">Revenue</th>
                      <th style="width:22%">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of products(); track p.name; let i = $index) {
                      <tr>
                        <td class="n muted">{{ i + 1 }}</td>
                        <td>
                          <span class="strong">{{ p.name }}</span>
                          @if (p.sku) { <div class="tiny muted">{{ p.sku }}</div> }
                        </td>
                        <td class="n">{{ p.quantity | number }}</td>
                        <td class="n">{{ p.invoices | number }}</td>
                        <td class="n">{{ money(p.discount) }}</td>
                        <td class="n strong">{{ money(p.revenue) }}</td>
                        <td><div class="share"><span [style.width.%]="p.share"></span></div><span class="tiny muted">{{ p.share }}%</span></td>
                      </tr>
                    } @empty {
                      <tr><td colspan="7" class="muted tiny" style="text-align:center;padding:18px">No product matches.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <!-- ------------------------------ admin-wise ------------------------------ -->
          <section class="card span-2">
            <div class="card-head">
              <h3>Admin-wise</h3>
              <button type="button" class="btn btn-ghost btn-sm" (click)="exportAdmins()">⬇ CSV</button>
            </div>
            <div class="card-body tight">
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Created by</th>
                      <th class="n">Invoices</th>
                      <th class="n">Average bill</th>
                      <th class="n">Collected</th>
                      <th class="n">Revenue</th>
                      <th style="width:22%">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of d.byAdmin; track a.adminId) {
                      <tr>
                        <td>
                          <span class="who">
                            <span class="who-dot" aria-hidden="true">{{ initial(a.name) }}</span>
                            <span>
                              <span class="strong">{{ a.adminId === access()?.me?.id ? a.name + ' (you)' : a.name }}</span>
                              @if (a.email) { <div class="tiny muted">{{ a.email }}</div> }
                            </span>
                          </span>
                        </td>
                        <td class="n">{{ a.invoices | number }}</td>
                        <td class="n">{{ money(a.averageBill) }}</td>
                        <td class="n">{{ money(a.collected) }}</td>
                        <td class="n strong">{{ money(a.revenue) }}</td>
                        <td><div class="share"><span [style.width.%]="a.share"></span></div><span class="tiny muted">{{ a.share }}%</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <!-- ------------------------------ payment mode / status / branch ------------------------------ -->
          <section class="card">
            <div class="card-head"><h3>Payment mode</h3></div>
            <div class="card-body">
              <ul class="bars">
                @for (m of d.byPaymentMode; track m.key) {
                  <li>
                    <div class="row-between"><span class="tiny strong">{{ m.name }}</span><span class="tiny muted">{{ money(m.revenue) }} · {{ m.share }}%</span></div>
                    <div class="share share-lg"><span [style.width.%]="m.share"></span></div>
                  </li>
                }
              </ul>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h3>Payment status</h3></div>
            <div class="card-body">
              <ul class="bars">
                @for (m of d.byPaymentStatus; track m.key) {
                  <li>
                    <div class="row-between"><span class="tiny strong">{{ m.name }}</span><span class="tiny muted">{{ m.invoices }} invoices · {{ money(m.revenue) }}</span></div>
                    <div class="share share-lg" [attr.data-status]="m.key"><span [style.width.%]="m.share"></span></div>
                  </li>
                }
              </ul>
            </div>
          </section>

          @if (d.byBranch.length > 1 || (d.byBranch[0] && d.byBranch[0].branchId)) {
            <section class="card span-2">
              <div class="card-head"><h3>Branch-wise</h3></div>
              <div class="card-body">
                <ul class="bars bars-2">
                  @for (b of d.byBranch; track b.branchId) {
                    <li>
                      <div class="row-between"><span class="tiny strong">{{ b.name }}</span><span class="tiny muted">{{ b.invoices }} invoices · {{ money(b.revenue) }} · {{ b.share }}%</span></div>
                      <div class="share share-lg"><span [style.width.%]="b.share"></span></div>
                    </li>
                  }
                </ul>
              </div>
            </section>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host { display: block; }
      .head { margin-bottom: 14px; gap: 12px; }
      .filters-card { margin-bottom: 14px; }
      .filters { display: flex; flex-direction: column; gap: 10px; }
      .presets { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip-btn { padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; }
      .chip-btn.on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .lab { display: flex; align-items: center; gap: 6px; }
      .lab .input { width: auto; }
      .seg { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2, var(--surface)); }
      .seg-btn { padding: 4px 14px; border: 0; border-radius: 999px; background: none; font-size: 12.5px; font-weight: 600; color: var(--text-2); cursor: pointer; }
      .seg-on { background: var(--brand-600); color: #fff; }

      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 14px; transition: opacity .2s; }
      .kpis.dim { opacity: .55; }
      .kpi { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
      .kpi-lead { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .kpi-lead .kpi-label, .kpi-lead .kpi-note { color: rgba(255,255,255,.8); }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .kpi-value { margin-top: 3px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .kpi-note { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }
      .kpi-warn .kpi-value { color: var(--danger); }

      .card { margin-bottom: 14px; }
      .chart { display: flex; align-items: flex-end; gap: 4px; height: 200px; padding-top: 6px; overflow-x: auto; }
      .col { flex: 1 0 18px; max-width: 56px; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: default; }
      .bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; }
      .bar { width: 100%; min-height: 2px; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, var(--brand-500, var(--brand-600)), var(--brand-600)); transition: height .4s ease; }
      .col:hover .bar { filter: brightness(1.15); }
      .col-label { font-size: 10.5px; color: var(--text-3); white-space: nowrap; }

      .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      .span-2 { grid-column: 1 / -1; }
      td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
      .input-sm { width: 180px; padding: 6px 10px; font-size: 12.5px; }
      .share { display: inline-block; width: calc(100% - 46px); height: 7px; margin-right: 6px; border-radius: 99px; background: var(--surface-3, var(--border)); overflow: hidden; vertical-align: middle; }
      .share span { display: block; height: 100%; border-radius: inherit; background: var(--brand-600); }
      .share-lg { width: 100%; height: 9px; margin: 6px 0 0; }
      .share[data-status='paid'] span { background: var(--success); }
      .share[data-status='partial'] span { background: var(--warning); }
      .share[data-status='unpaid'] span { background: var(--danger); }
      .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
      .bars-2 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px 24px; }
      .who { display: inline-flex; align-items: center; gap: 9px; }
      .who-dot { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--brand-600); color: #fff; font-size: 12px; font-weight: 700; }
      .empty { text-align: center; padding: 34px 0; color: var(--text-3); font-size: 13px; }
      .empty .big { font-size: 34px; }

      @media (max-width: 900px) { .grid-2col { grid-template-columns: 1fr; } }
    `,
  ],
})
export class InvoiceAnalysisComponent {
  private readonly invoices = inject(InvoiceService);
  private readonly toast = inject(ToastService);

  readonly presets: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'month', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
    { key: 'year', label: 'This year' },
  ];

  readonly access = signal<InvoiceAccess | null>(null);
  readonly meta = signal<InvoiceMeta | null>(null);
  readonly data = signal<InvoiceAnalysis | null>(null);
  readonly loading = signal(true);

  readonly preset = signal<Preset>('30d');
  readonly from = signal('');
  readonly to = signal('');
  readonly scope = signal<InvoiceScope>('mine');
  readonly creator = signal('');
  readonly branch = signal('');
  readonly productFilter = signal('');

  readonly creatorName = computed(() => {
    const id = Number(this.creator());
    return id ? (this.access()?.admins.find((a) => a.id === id)?.name ?? null) : null;
  });

  /** Bars scaled to the busiest period, with a short label under each. */
  readonly trend = computed(() => {
    const d = this.data();
    if (!d) return [];
    const max = Math.max(1, ...d.trend.map((t) => t.revenue));
    const monthly = d.range.granularity === 'month';
    return d.trend.map((t) => {
      const date = new Date(monthly ? `${t.period}-01T00:00:00` : `${t.period}T00:00:00`);
      return {
        ...t,
        height: Math.max(2, Math.round((t.revenue / max) * 100)),
        label: date.toLocaleDateString('en-IN', monthly ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }),
        short: date.toLocaleDateString('en-IN', monthly ? { month: 'short' } : { day: 'numeric', month: 'short' }),
      };
    });
  });

  readonly products = computed(() => {
    const list = this.data()?.byProduct ?? [];
    const q = this.productFilter().trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)) : list;
  });

  constructor() {
    this.applyPreset('30d');
    this.invoices.meta().subscribe({ next: (m) => this.meta.set(m), error: () => undefined });
    this.invoices.access().subscribe({
      next: (a) => {
        this.access.set(a);
        /* Someone who can see everyone's starts on everyone's. */
        if (a.canSeeAll) this.scope.set('all');
        this.load();
      },
      error: () => this.load(),
    });
  }

  load(): void {
    const query: ListQuery = { from: this.from(), to: this.to(), scope: this.scope() };
    if (this.scope() === 'all' && this.creator()) query['createdBy'] = this.creator();
    if (this.branch()) query['branchId'] = this.branch();

    this.loading.set(true);
    this.invoices.analysis(query).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the analysis', messageOf(e));
      },
    });
  }

  private applyPreset(key: Preset): void {
    const now = new Date();
    const start = new Date(now);
    let end = new Date(now);
    switch (key) {
      case 'today':
        break;
      case '7d':
        start.setDate(now.getDate() - 6);
        break;
      case '30d':
        start.setDate(now.getDate() - 29);
        break;
      case 'month':
        start.setDate(1);
        break;
      case 'lastMonth':
        start.setMonth(now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'year':
        start.setMonth(0, 1);
        break;
      default:
        return;
    }
    this.preset.set(key);
    this.from.set(ymd(start));
    this.to.set(ymd(end));
  }

  choose(key: Preset): void {
    this.applyPreset(key);
    this.load();
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  setFrom(v: string): void { this.from.set(v); this.preset.set('custom'); this.load(); }
  setTo(v: string): void { this.to.set(v); this.preset.set('custom'); this.load(); }
  setScope(v: InvoiceScope): void { this.scope.set(v); this.creator.set(''); this.load(); }
  setCreator(v: string): void { this.creator.set(v); this.load(); }
  setBranch(v: string): void { this.branch.set(v); this.load(); }

  money(value: number | string | null | undefined): string {
    return formatMoney(value);
  }

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  /* ------------------------------ export ------------------------------ */

  exportProducts(): void {
    const d = this.data();
    if (!d) return;
    this.download(`product-wise-${d.range.from}-to-${d.range.to}.csv`, [
      ['Product', 'SKU', 'Quantity sold', 'Invoices', 'Discount', 'Revenue', 'Share %'],
      ...this.products().map((p) => [p.name, p.sku ?? '', p.quantity, p.invoices, p.discount, p.revenue, p.share]),
    ]);
  }

  exportAdmins(): void {
    const d = this.data();
    if (!d) return;
    this.download(`admin-wise-${d.range.from}-to-${d.range.to}.csv`, [
      ['Admin', 'Email', 'Invoices', 'Average bill', 'Collected', 'Revenue', 'Share %'],
      ...d.byAdmin.map((a) => [a.name, a.email ?? '', a.invoices, a.averageBill, a.collected, a.revenue, a.share]),
    ]);
  }

  private download(name: string, rows: (string | number)[][]): void {
    const cell = (v: string | number) => {
      const text = String(v);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = rows.map((row) => row.map(cell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
