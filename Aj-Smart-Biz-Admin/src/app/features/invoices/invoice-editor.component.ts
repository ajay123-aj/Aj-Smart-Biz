import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { InvoiceService } from '../../core/services/invoice.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  DiscountType,
  Invoice,
  InvoiceInput,
  InvoiceMeta,
  InvoiceProduct,
} from '../../core/models/invoice.model';
import { formatMoney } from '../../shared/utils';
import { computeLine, computeTotals } from './invoice-math';

/** One line on the bill being written. */
interface Line {
  productId: number;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  listPrice: number | null;
  discountType: DiscountType;
  discountValue: number;
  taxPercent: number;
  /** Sellable units in the warehouse; null when stock is not tracked or unknown. */
  available: number | null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Create or edit an invoice — the billing counter.
 *
 * Left: find a product and it lands on the bill; each line takes a quantity,
 * a price, a discount (% or ₹) and a tax rate. Right: who is buying, a discount
 * on the whole bill, how they paid, and the totals, updated as you type.
 *
 * Save as draft keeps it editable and touches no stock. Issue numbers it,
 * locks it and takes the stock off the shelf — the API checks stock for every
 * line first and refuses the whole bill if anything is short.
 */
@Component({
  selector: 'app-invoice-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="row-between wrap head">
      <div>
        <a class="btn btn-link btn-sm back" routerLink="/invoices">← All invoices</a>
        <h2 class="mt-0 mb-0">{{ editingId() ? 'Edit draft invoice' : 'New invoice' }}</h2>
      </div>
      @if (meta(); as m) {
        <span class="tiny muted stock-note">
          @if (m.stockTracking) {
            ✓ Stock is deducted when you issue this invoice
          } @else {
            Stock will not be deducted (Warehouse &amp; stock is off)
          }
        </span>
      }
    </div>

    @if (loading()) {
      <div class="skeleton" style="height:480px"></div>
    } @else {
      <div class="layout">
        <!-- ============ LEFT: products and lines ============ -->
        <section class="card main">
          <div class="card-body">
            <div class="step"><span class="num">1</span> Add products</div>
            <div class="search">
              <input
                #searchBox
                class="input search-input"
                type="search"
                autocomplete="off"
                placeholder="Search product by name or SKU, then press Enter to add"
                [value]="term()"
                (input)="onTerm(value($event))"
                (keydown.enter)="$event.preventDefault(); addFirst()"
                (keydown.escape)="results.set([])"
              />
              @if (results().length) {
                <ul class="results" role="listbox">
                  @for (p of results(); track p.id) {
                    <li>
                      <button type="button" class="result" (click)="add(p)">
                        @if (p.image) {
                          <img [src]="img(p.image)" alt="" />
                        } @else {
                          <span class="ph">📦</span>
                        }
                        <span class="r-name">
                          {{ p.name }}
                          @if (p.sku) { <span class="tiny muted">· {{ p.sku }}</span> }
                        </span>
                        <span class="r-price">
                          @if (p.sellingPrice !== null) {
                            {{ money(p.sellingPrice) }}
                            @if (p.listPrice) { <s class="tiny muted">{{ money(p.listPrice) }}</s> }
                          } @else {
                            <span class="tiny muted">{{ p.priceLabel || 'No price' }}</span>
                          }
                        </span>
                        @if (p.available !== null) {
                          <span class="stock" [class.stock-out]="p.available <= 0" [class.stock-low]="p.available > 0 && p.available <= 5">
                            {{ p.available <= 0 ? 'Out of stock' : p.available + ' in stock' }}
                          </span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              } @else if (term().trim() && !searching()) {
                <div class="results empty tiny muted">No product matches "{{ term() }}"</div>
              }
            </div>

            <div class="default-tax tiny muted">
              Tax on new items:
              @for (t of taxPresets(); track t) {
                <button type="button" class="chip" [class.chip-on]="defaultTax() === t" (click)="defaultTax.set(t)">{{ t }}%</button>
              }
            </div>

            @if (!lines().length) {
              <div class="empty-lines">
                <div class="big">🛒</div>
                <p class="mb-0">No items yet. Search above to add products to this bill.</p>
              </div>
            } @else {
              <div class="table-wrap">
                <table class="table lines">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th class="c">Qty</th>
                      <th class="n">Price (₹)</th>
                      <th class="c">Discount</th>
                      <th class="c">Tax %</th>
                      <th class="n">Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of lines(); track $index; let i = $index) {
                      <tr [class.short]="isShort(line)">
                        <td class="item">
                          <div class="strong">{{ line.name }}</div>
                          <div class="tiny muted">
                            @if (line.sku) { {{ line.sku }} · }
                            @if (line.available !== null) {
                              <span [class.text-danger]="isShort(line)">{{ line.available }} in stock</span>
                            }
                          </div>
                          @if (isShort(line)) {
                            <div class="tiny text-danger">Only {{ line.available }} available</div>
                          }
                        </td>
                        <td class="c">
                          <div class="qty">
                            <button type="button" class="btn btn-sm btn-ghost" (click)="bump(i, -1)" aria-label="Less">−</button>
                            <input class="input qty-input" type="number" min="1" [value]="line.quantity" (change)="patch(i, { quantity: int(value($event), 1) })" />
                            <button type="button" class="btn btn-sm btn-ghost" (click)="bump(i, 1)" aria-label="More">+</button>
                          </div>
                        </td>
                        <td class="n">
                          <input class="input price-input" type="number" min="0" step="0.01" [value]="line.unitPrice" (change)="patch(i, { unitPrice: dec(value($event)) })" />
                          @if (line.listPrice && line.listPrice > line.unitPrice) {
                            <div class="tiny muted"><s>{{ money(line.listPrice) }}</s></div>
                          }
                        </td>
                        <td class="c">
                          <div class="disc">
                            <input class="input disc-input" type="number" min="0" step="0.01" [value]="line.discountValue || ''" placeholder="0" (change)="patch(i, { discountValue: dec(value($event)) })" />
                            <div class="seg">
                              <button type="button" [class.on]="line.discountType === 'percent'" (click)="patch(i, { discountType: 'percent' })">%</button>
                              <button type="button" [class.on]="line.discountType === 'amount'" (click)="patch(i, { discountType: 'amount' })">₹</button>
                            </div>
                          </div>
                          @if (figures()[i].discount > 0) {
                            <div class="tiny text-success">− {{ money(figures()[i].discount) }}</div>
                          }
                        </td>
                        <td class="c">
                          <select class="select tax-select" (change)="patch(i, { taxPercent: dec(value($event)) })">
                            @for (t of taxOptions(line.taxPercent); track t) {
                              <option [value]="t" [selected]="t === line.taxPercent">{{ t }}%</option>
                            }
                          </select>
                        </td>
                        <td class="n strong">{{ money(figures()[i].lineTotal) }}</td>
                        <td><button type="button" class="btn btn-icon btn-ghost" (click)="removeLine(i)" aria-label="Remove item">✕</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </section>

        <!-- ============ RIGHT: customer, discount, payment, totals ============ -->
        <aside class="side">
          <section class="card">
            <div class="card-body stack-sm">
              <div class="step"><span class="num">2</span> Customer <span class="tiny muted">(optional)</span></div>
              <div class="grid-2 g">
                <input class="input" placeholder="Name" [value]="customer().name" (input)="setCustomer('name', value($event))" />
                <input class="input" placeholder="Mobile" inputmode="tel" [value]="customer().phone" (input)="setCustomer('phone', value($event))" />
              </div>
              @if (moreCustomer()) {
                <input class="input" placeholder="Email" type="email" [value]="customer().email" (input)="setCustomer('email', value($event))" />
                <textarea class="textarea" rows="2" placeholder="Billing address" [value]="customer().address" (input)="setCustomer('address', value($event))"></textarea>
                <input class="input" placeholder="Customer GSTIN" [value]="customer().gstin" (input)="setCustomer('gstin', value($event))" />
              } @else {
                <button type="button" class="btn btn-link btn-sm left" (click)="moreCustomer.set(true)">+ Email, address, GSTIN</button>
              }
              <div class="grid-2 g">
                <label class="field-sm">Invoice date <input class="input" type="date" [value]="invoiceDate()" (change)="invoiceDate.set(value($event))" /></label>
                <label class="field-sm">Due date <input class="input" type="date" [value]="dueDate()" (change)="dueDate.set(value($event))" /></label>
              </div>
              @if ((meta()?.branches?.length ?? 0) > 0 || (meta()?.stockTracking && (meta()?.warehouses?.length ?? 0) > 1)) {
                <div class="grid-2 g">
                  @if ((meta()?.branches?.length ?? 0) > 0) {
                    <label class="field-sm">Branch
                      <select class="select" (change)="branchId.set(idOrNull(value($event)))">
                        <option value="">Company</option>
                        @for (b of meta()!.branches; track b.id) {
                          <option [value]="b.id" [selected]="branchId() === b.id">{{ b.name }}</option>
                        }
                      </select>
                    </label>
                  }
                  @if (meta()?.stockTracking && (meta()?.warehouses?.length ?? 0) > 1) {
                    <label class="field-sm">Take stock from
                      <select class="select" (change)="setWarehouse(idOrNull(value($event)))">
                        <option value="">Default warehouse</option>
                        @for (w of meta()!.warehouses; track w.id) {
                          <option [value]="w.id" [selected]="warehouseId() === w.id">{{ w.name }}</option>
                        }
                      </select>
                    </label>
                  }
                </div>
              }
            </div>
          </section>

          <section class="card">
            <div class="card-body stack-sm">
              <div class="step"><span class="num">3</span> Bill discount &amp; payment</div>
              <label class="field-sm">Discount on whole bill
                <div class="disc wide">
                  <input class="input" type="number" min="0" step="0.01" placeholder="0" [value]="billValue() || ''" (input)="billValue.set(dec(value($event)))" />
                  <div class="seg">
                    <button type="button" [class.on]="billType() === 'percent'" (click)="billType.set('percent')">%</button>
                    <button type="button" [class.on]="billType() === 'amount'" (click)="billType.set('amount')">₹</button>
                  </div>
                </div>
              </label>
              <label class="check tiny"><input type="checkbox" [checked]="roundOff()" (change)="roundOff.set(checked($event))" /> Round off to nearest rupee</label>

              <div class="divider"></div>

              <label class="field-sm">Payment mode
                <div class="modes">
                  @for (mode of meta()?.paymentModes ?? []; track mode.key) {
                    <button type="button" class="chip" [class.chip-on]="paymentMode() === mode.key" (click)="setMode(mode.key)">{{ mode.name }}</button>
                  }
                </div>
              </label>
              <div class="grid-2 g">
                <label class="field-sm">Amount received
                  <input class="input" type="number" min="0" step="0.01" [value]="amountPaid()" (input)="amountPaid.set(dec(value($event)))" />
                </label>
                <label class="field-sm">Reference
                  <input class="input" placeholder="UPI / card ref" [value]="paymentReference()" (input)="paymentReference.set(value($event))" />
                </label>
              </div>
              <div class="row wrap g6">
                <button type="button" class="btn btn-sm" (click)="amountPaid.set(totals().grandTotal)">Paid in full</button>
                <button type="button" class="btn btn-sm btn-ghost" (click)="amountPaid.set(0)">Not paid</button>
              </div>
              <textarea class="textarea" rows="2" placeholder="Note printed on the invoice (optional)" [value]="notes()" (input)="notes.set(value($event))"></textarea>
            </div>
          </section>

          <section class="card totals-card">
            <div class="card-body">
              <dl class="totals">
                <div><dt>Subtotal ({{ totals().itemCount }} items)</dt><dd>{{ money(totals().subtotal) }}</dd></div>
                @if (totals().itemDiscount > 0) {
                  <div class="minus"><dt>Item discounts</dt><dd>− {{ money(totals().itemDiscount) }}</dd></div>
                }
                @if (totals().taxTotal > 0) {
                  <div><dt>Tax</dt><dd>+ {{ money(totals().taxTotal) }}</dd></div>
                }
                @if (totals().billDiscount > 0) {
                  <div class="minus"><dt>Bill discount</dt><dd>− {{ money(totals().billDiscount) }}</dd></div>
                }
                @if (totals().roundOff !== 0) {
                  <div><dt>Round off</dt><dd>{{ totals().roundOff > 0 ? '+' : '−' }} {{ money(abs(totals().roundOff)) }}</dd></div>
                }
                <div class="grand"><dt>Total</dt><dd>{{ money(totals().grandTotal) }}</dd></div>
                <div><dt>Received</dt><dd>{{ money(paidCapped()) }}</dd></div>
                <div class="balance" [class.due]="balance() > 0"><dt>Balance due</dt><dd>{{ money(balance()) }}</dd></div>
              </dl>
              @if (totals().saved > 0) {
                <div class="saved">Customer saves {{ money(totals().saved) }} on this bill 🎉</div>
              }
              @if (shortCount() > 0) {
                <div class="warn tiny">{{ shortCount() }} item(s) have more quantity than stock. Issuing will be refused until fixed.</div>
              }
              <div class="actions">
                <button type="button" class="btn" [disabled]="saving() || !lines().length" (click)="save(false)">Save draft</button>
                <button type="button" class="btn btn-primary" [disabled]="saving() || !lines().length" (click)="save(true)">
                  {{ saving() ? 'Saving…' : 'Issue invoice' }}
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .head { margin-bottom: 14px; gap: 10px; align-items: flex-end; }
      .back { padding-left: 0; margin-bottom: 2px; }
      .stock-note { padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
      .layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
      @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }
      .side { display: grid; gap: 16px; position: sticky; top: 12px; }
      @media (max-width: 1100px) { .side { position: static; } }
      .step { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; margin-bottom: 10px; }
      .step .num { width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--brand-600); color: #fff; font-size: 12px; }

      .search { position: relative; }
      .search-input { font-size: 15px; padding: 11px 14px; }
      .results { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 30px rgba(0,0,0,.12); max-height: 340px; overflow: auto; }
      .results.empty { padding: 12px; }
      .result { width: 100%; display: grid; grid-template-columns: 36px 1fr auto auto; gap: 10px; align-items: center; padding: 7px 8px; border: 0; background: none; border-radius: 8px; cursor: pointer; text-align: left; color: inherit; font: inherit; }
      .result:hover, .result:focus-visible { background: var(--surface-2, rgba(0,0,0,.04)); outline: none; }
      .result img, .result .ph { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; display: grid; place-items: center; background: var(--surface-2, rgba(0,0,0,.04)); }
      .r-name { font-weight: 600; font-size: 13.5px; }
      .r-price { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; white-space: nowrap; }
      .r-price s { margin-left: 4px; }
      .stock { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(34,197,94,.12); color: #15803d; white-space: nowrap; }
      .stock-low { background: rgba(245,158,11,.14); color: #b45309; }
      .stock-out { background: rgba(239,68,68,.12); color: #b91c1c; }

      .default-tax { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 10px 0 12px; }
      .chip { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text-2); }
      .chip-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .modes { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }

      .empty-lines { text-align: center; padding: 40px 0; color: var(--text-3); border: 1px dashed var(--border); border-radius: 12px; }
      .empty-lines .big { font-size: 34px; }

      .lines th.n, .lines td.n { text-align: right; }
      .lines th.c, .lines td.c { text-align: center; }
      .lines td { vertical-align: top; }
      .lines .item { min-width: 160px; }
      tr.short td { background: rgba(239,68,68,.05); }
      .qty { display: inline-flex; align-items: center; gap: 2px; }
      .qty-input { width: 58px; text-align: center; padding: 6px 4px; }
      .price-input { width: 96px; text-align: right; padding: 6px 8px; }
      .disc { display: inline-flex; align-items: center; gap: 4px; }
      .disc.wide { display: flex; margin-top: 4px; }
      .disc.wide .input { flex: 1; }
      .disc-input { width: 70px; text-align: right; padding: 6px 8px; }
      .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
      .seg button { border: 0; background: var(--surface); padding: 6px 9px; cursor: pointer; font-weight: 700; font-size: 12px; color: var(--text-2); }
      .seg button.on { background: var(--brand-600); color: #fff; }
      .tax-select { width: 78px; padding: 6px; }
      .text-danger { color: var(--danger); }
      .text-success { color: #15803d; }

      .g { gap: 8px; }
      .g6 { gap: 6px; }
      .left { align-self: flex-start; padding-left: 0; }
      .field-sm { display: grid; gap: 4px; font-size: 12px; color: var(--text-3); font-weight: 600; }

      .totals { margin: 0; display: grid; gap: 6px; font-size: 13.5px; }
      .totals div { display: flex; justify-content: space-between; gap: 10px; }
      .totals dt { color: var(--text-2); }
      .totals dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
      .totals .minus dd { color: #15803d; }
      .totals .grand { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px; font-size: 20px; }
      .totals .grand dt { color: inherit; font-weight: 700; }
      .totals .grand dd { font-weight: 800; }
      .totals .balance.due dd { color: var(--danger); }
      .saved { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: rgba(34,197,94,.1); color: #15803d; font-size: 12.5px; font-weight: 600; text-align: center; }
      .warn { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: rgba(239,68,68,.08); color: var(--danger); }
      .actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; margin-top: 14px; }
      .actions .btn { justify-content: center; padding: 11px; }
    `,
  ],
})
export class InvoiceEditorComponent {
  private readonly invoices = inject(InvoiceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly uploads = inject(UploadService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  readonly meta = signal<InvoiceMeta | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);

  /* Product search */
  readonly term = signal('');
  readonly results = signal<InvoiceProduct[]>([]);
  readonly searching = signal(false);
  private readonly terms = new Subject<string>();

  /* The bill */
  readonly lines = signal<Line[]>([]);
  readonly defaultTax = signal(0);
  readonly customer = signal({ name: '', phone: '', email: '', address: '', gstin: '' });
  readonly moreCustomer = signal(false);
  readonly invoiceDate = signal(today());
  readonly dueDate = signal('');
  readonly branchId = signal<number | null>(null);
  readonly warehouseId = signal<number | null>(null);
  readonly billType = signal<DiscountType>('percent');
  readonly billValue = signal(0);
  readonly roundOff = signal(true);
  readonly paymentMode = signal<string | null>('cash');
  readonly amountPaid = signal(0);
  readonly paymentReference = signal('');
  readonly notes = signal('');

  readonly taxPresets = computed(() => this.meta()?.taxPresets ?? [0, 5, 12, 18, 28]);

  readonly figures = computed(() => this.lines().map((line) => computeLine(line)));
  readonly totals = computed(() =>
    computeTotals(
      this.lines().map((line, i) => ({ ...this.figures()[i], quantity: line.quantity, unitPrice: line.unitPrice, listPrice: line.listPrice })),
      { type: this.billType(), value: this.billValue(), roundOff: this.roundOff() }
    )
  );
  readonly paidCapped = computed(() => Math.min(Math.max(0, this.amountPaid()), this.totals().grandTotal));
  readonly balance = computed(() => Math.max(0, Math.round((this.totals().grandTotal - this.paidCapped()) * 100) / 100));

  /** Units wanted per product across all lines, against what is available. */
  private readonly wanted = computed(() => {
    const map = new Map<number, number>();
    this.lines().forEach((l) => map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity));
    return map;
  });
  readonly shortCount = computed(() => this.lines().filter((l) => this.isShort(l)).length);

  constructor() {
    this.terms
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((term) => {
          if (!term.trim()) {
            this.searching.set(false);
            return of([] as InvoiceProduct[]);
          }
          this.searching.set(true);
          return this.fetchProducts(term).pipe(catchError(() => of([] as InvoiceProduct[])));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((items) => {
        this.searching.set(false);
        this.results.set(items);
      });

    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.invoices.meta().subscribe({
      next: (meta) => {
        this.meta.set(meta);
        if (!meta.granted) {
          this.toast.error('Not in your plan', 'Invoice management is not included in your current plan.');
          this.router.navigate(['/invoices']);
          return;
        }
        if (Number.isInteger(id) && id > 0) this.loadExisting(id);
        else this.ready();
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not open the invoice screen', messageOf(e));
      },
    });
  }

  private ready(): void {
    this.loading.set(false);
    setTimeout(() => this.searchBox()?.nativeElement.focus());
  }

  private fetchProducts(term: string) {
    const query: Record<string, string | number> = { search: term.trim(), limit: 12 };
    if (this.warehouseId()) query['warehouseId'] = this.warehouseId()!;
    if (this.branchId()) query['branchId'] = this.branchId()!;
    return this.invoices.products(query).pipe(
      switchMap((r) => of(r.data))
    );
  }

  private loadExisting(id: number): void {
    this.invoices.get(id).subscribe({
      next: (inv) => {
        if (inv.status !== 'draft') {
          this.toast.error('Cannot edit', 'Only draft invoices can be edited.');
          this.router.navigate(['/invoices', id]);
          return;
        }
        this.fill(inv);
        this.ready();
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the invoice', messageOf(e));
      },
    });
  }

  private fill(inv: Invoice): void {
    this.editingId.set(inv.id);
    this.lines.set(
      (inv.items ?? [])
        .filter((item) => item.productId !== null)
        .map((item) => ({
          productId: item.productId as number,
          name: item.productName,
          sku: item.productSku ?? null,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          listPrice: item.listPrice ? Number(item.listPrice) : null,
          discountType: item.discountType ?? 'percent',
          discountValue: Number(item.discountValue),
          taxPercent: Number(item.taxPercent),
          available: null,
        }))
    );
    this.customer.set({
      name: inv.customerName ?? '',
      phone: inv.customerPhone ?? '',
      email: inv.customerEmail ?? '',
      address: inv.customerAddress ?? '',
      gstin: inv.customerGstin ?? '',
    });
    this.moreCustomer.set(Boolean(inv.customerEmail || inv.customerAddress || inv.customerGstin));
    this.invoiceDate.set(inv.invoiceDate ?? today());
    this.dueDate.set(inv.dueDate ?? '');
    this.branchId.set(inv.branchId);
    this.warehouseId.set(inv.warehouseId);
    this.billType.set(inv.billDiscountType ?? 'percent');
    this.billValue.set(Number(inv.billDiscountValue));
    this.roundOff.set(Number(inv.roundOff) !== 0 || Number(inv.grandTotal) % 1 === 0);
    this.paymentMode.set(inv.paymentMode);
    this.amountPaid.set(Number(inv.amountPaid));
    this.paymentReference.set(inv.paymentReference ?? '');
    this.notes.set(inv.notes ?? '');
  }

  /* ------------------------------ search ------------------------------ */

  onTerm(term: string): void {
    this.term.set(term);
    this.terms.next(term);
  }

  addFirst(): void {
    const first = this.results()[0];
    if (first) this.add(first);
  }

  add(product: InvoiceProduct): void {
    const existing = this.lines().findIndex((l) => l.productId === product.id && !l.discountValue);
    if (existing >= 0) {
      this.bump(existing, 1);
    } else {
      this.lines.update((lines) => [
        ...lines,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: product.sellingPrice ?? 0,
          listPrice: product.listPrice,
          discountType: 'percent',
          discountValue: 0,
          taxPercent: this.defaultTax(),
          available: product.available,
        },
      ]);
      if (product.sellingPrice === null) {
        this.toast.info('Enter a price', `${product.name} has no price in your catalogue.`);
      }
    }
    this.term.set('');
    this.terms.next('');
    this.results.set([]);
    this.searchBox()?.nativeElement.focus();
  }

  /* ------------------------------ lines ------------------------------ */

  patch(index: number, change: Partial<Line>): void {
    this.lines.update((lines) => lines.map((l, i) => (i === index ? { ...l, ...change } : l)));
  }

  bump(index: number, by: number): void {
    const line = this.lines()[index];
    if (!line) return;
    this.patch(index, { quantity: Math.max(1, line.quantity + by) });
  }

  removeLine(index: number): void {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  isShort(line: Line): boolean {
    if (line.available === null || !this.meta()?.stockTracking) return false;
    return (this.wanted().get(line.productId) ?? 0) > line.available;
  }

  taxOptions(current: number): number[] {
    const presets = this.taxPresets();
    return presets.includes(current) ? presets : [...presets, current].sort((a, b) => a - b);
  }

  /** A new warehouse means different stock — drop the cached numbers so nothing stale warns. */
  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.lines.update((lines) => lines.map((l) => ({ ...l, available: null })));
  }

  setMode(key: string): void {
    this.paymentMode.set(key);
    if (key === 'credit') this.amountPaid.set(0);
    else if (this.amountPaid() === 0) this.amountPaid.set(this.totals().grandTotal);
  }

  setCustomer(field: 'name' | 'phone' | 'email' | 'address' | 'gstin', value: string): void {
    this.customer.update((c) => ({ ...c, [field]: value }));
  }

  /* ------------------------------ save ------------------------------ */

  async save(issue: boolean): Promise<void> {
    if (!this.lines().length) return;
    if (this.lines().some((l) => !(l.unitPrice >= 0))) {
      this.toast.error('Check prices', 'Every item needs a price.');
      return;
    }

    if (issue) {
      const ok = await this.confirm.ask({
        title: `Issue invoice for ${this.money(this.totals().grandTotal)}?`,
        message: this.meta()?.stockTracking
          ? 'It gets an invoice number, can no longer be edited, and the items are taken out of stock.'
          : 'It gets an invoice number and can no longer be edited.',
        confirmText: 'Issue invoice',
      });
      if (!ok) return;
    }

    const c = this.customer();
    const body: InvoiceInput = {
      branchId: this.branchId(),
      warehouseId: this.warehouseId(),
      invoiceDate: this.invoiceDate() || null,
      dueDate: this.dueDate() || null,
      customerName: c.name.trim(),
      customerPhone: c.phone.trim(),
      customerEmail: c.email.trim(),
      customerAddress: c.address.trim(),
      customerGstin: c.gstin.trim(),
      items: this.lines().map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountType: l.discountValue > 0 ? l.discountType : null,
        discountValue: l.discountValue || 0,
        taxPercent: l.taxPercent || 0,
      })),
      billDiscountType: this.billValue() > 0 ? this.billType() : null,
      billDiscountValue: this.billValue() || 0,
      roundOff: this.roundOff(),
      amountPaid: this.paidCapped(),
      paymentMode: this.paymentMode(),
      paymentReference: this.paymentReference().trim(),
      notes: this.notes().trim(),
      issue,
    };

    this.saving.set(true);
    const id = this.editingId();
    const request = id ? this.invoices.update(id, body) : this.invoices.create(body);
    request.subscribe({
      next: (inv) => {
        this.saving.set(false);
        this.toast.success(issue ? `Invoice ${inv.invoiceNo} issued` : 'Draft saved');
        this.router.navigate(['/invoices', inv.id]);
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error(issue ? 'Could not issue the invoice' : 'Could not save the draft', messageOf(e));
      },
    });
  }

  /* ------------------------------ helpers ------------------------------ */

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
  int(value: string, min = 0): number {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.max(min, n) : min;
  }
  dec(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }
  idOrNull(value: string): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  abs(n: number): number {
    return Math.abs(n);
  }
  money(value: number | string | null | undefined): string {
    return formatMoney(value);
  }
  img(path: string): string | null {
    return this.uploads.toUrl(path);
  }
}
