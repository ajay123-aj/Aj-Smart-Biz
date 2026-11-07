import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { CatalogueEntry, Invoice, InvoiceMeta } from '../../core/models/invoice.model';
import { ModalComponent } from '../../shared/ui/modal.component';
import { formatMoney } from '../../shared/utils';

/**
 * One invoice: the printable bill, and what can still be done with it.
 *
 * Draft → edit, issue or delete. Issued → record payment, print, cancel (which
 * returns the stock). Cancelled → read only, kept for the record.
 *
 * `.print-area` is the only thing that prints — see the print rules in
 * `styles.scss` — so the sidebar, buttons and banners never reach paper.
 */
@Component({
  selector: 'app-invoice-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, ModalComponent],
  template: `
    @if (loading()) {
      <div class="skeleton" style="height:520px"></div>
    } @else if (invoice(); as inv) {
      <div class="row-between wrap toolbar no-print">
        <a class="btn btn-link btn-sm back" routerLink="/invoices">← All invoices</a>
        <div class="row wrap g6">
          @if (inv.status === 'draft') {
            @if (can('canDelete')) {
              <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" (click)="remove(inv)">Delete draft</button>
            }
            @if (can('canEdit')) {
              <a class="btn btn-sm" [routerLink]="['/invoices', inv.id, 'edit']">Edit</a>
              <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="issue(inv)">Issue invoice</button>
            }
          }
          @if (inv.status === 'issued' && can('canEdit')) {
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="openCancel()">Cancel invoice</button>
            @if (balance(inv) > 0) {
              <button type="button" class="btn btn-sm" (click)="openPayment(inv)">Record payment</button>
            }
          }
          <button type="button" class="btn btn-primary btn-sm" (click)="print()">🖨 Print</button>
        </div>
      </div>

      @if (inv.status === 'draft') {
        <div class="banner no-print">This is a <strong>draft</strong>. It has no invoice number and has not touched stock. Issue it to finalise.</div>
      }
      @if (inv.status === 'cancelled') {
        <div class="banner banner-danger no-print">
          Cancelled {{ inv.cancelledAt | date: 'dd MMM yyyy, h:mm a' }}@if (inv.cancelReason) { — {{ inv.cancelReason }} }.
          Any stock it deducted has been returned.
        </div>
      }
      @if (inv.status === 'issued') {
        <div class="banner banner-ok no-print">
          Issued {{ inv.issuedAt | date: 'dd MMM yyyy, h:mm a' }}.
          @if (inv.stockApplied) {
            Stock deducted from {{ inv.warehouse?.name ?? 'your warehouse' }}.
          } @else {
            No stock was deducted (no tracked products, or Warehouse &amp; stock is off).
          }
        </div>
      }

      <article class="card paper print-area">
        <div class="card-body">
          <header class="paper-head">
            <div class="seller">
              @if (seller()?.logo) {
                <img class="logo" [src]="img(seller()!.logo!)" alt="" />
              }
              <div>
                <div class="seller-name">{{ seller()?.name }}</div>
                <div class="tiny muted">
                  {{ sellerAddress() }}
                  @if (seller()?.phone) { <br />{{ seller()!.phone }} }
                  @if (seller()?.email) { · {{ seller()!.email }} }
                  @if (seller()?.gstNumber) { <br />GSTIN: <strong>{{ seller()!.gstNumber }}</strong> }
                </div>
              </div>
            </div>
            <div class="doc">
              <div class="doc-title">{{ inv.taxTotal && +inv.taxTotal > 0 ? 'TAX INVOICE' : 'INVOICE' }}</div>
              <div class="doc-no">{{ inv.invoiceNo ?? 'DRAFT' }}</div>
              <div class="tiny">Date: {{ inv.invoiceDate | date: 'dd MMM yyyy' }}</div>
              @if (inv.dueDate) { <div class="tiny">Due: {{ inv.dueDate | date: 'dd MMM yyyy' }}</div> }
              @if (inv.status === 'cancelled') { <div class="stamp">CANCELLED</div> }
            </div>
          </header>

          <section class="bill-to">
            <div class="tiny muted label">Bill to</div>
            <div class="strong">{{ inv.customerName || 'Walk-in customer' }}</div>
            <div class="tiny">
              @if (inv.customerPhone) { {{ inv.customerPhone }} }
              @if (inv.customerEmail) { · {{ inv.customerEmail }} }
              @if (inv.customerAddress) { <br />{{ inv.customerAddress }} }
              @if (inv.customerGstin) { <br />GSTIN: {{ inv.customerGstin }} }
            </div>
          </section>

          <table class="items">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th class="n">Qty</th>
                <th class="n">Rate</th>
                <th class="n">Discount</th>
                <th class="n">Tax</th>
                <th class="n">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (item of inv.items ?? []; track item.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>
                    {{ item.productName }}
                    @if (item.productSku) { <div class="tiny muted">{{ item.productSku }}</div> }
                  </td>
                  <td class="n">{{ item.quantity }}</td>
                  <td class="n">
                    {{ money(item.unitPrice) }}
                    @if (item.listPrice && +item.listPrice > +item.unitPrice) { <div class="tiny muted"><s>{{ money(item.listPrice) }}</s></div> }
                  </td>
                  <td class="n">
                    @if (+item.discount > 0) {
                      {{ money(item.discount) }}
                      <div class="tiny muted">{{ item.discountType === 'percent' ? (+item.discountValue) + '%' : 'flat' }}</div>
                    } @else { — }
                  </td>
                  <td class="n">
                    @if (+item.tax > 0) {
                      {{ money(item.tax) }}
                      <div class="tiny muted">{{ +item.taxPercent }}%</div>
                    } @else { — }
                  </td>
                  <td class="n strong">{{ money(item.lineTotal) }}</td>
                </tr>
              }
            </tbody>
          </table>

          <div class="foot">
            <div class="foot-left">
              @if (inv.notes) {
                <div class="tiny muted label">Note</div>
                <p class="tiny note">{{ inv.notes }}</p>
              }
              <div class="tiny muted label">Payment</div>
              <div class="tiny">
                <span [class]="'badge badge-' + tone(meta()?.paymentStatuses ?? [], inv.paymentStatus)">{{ label(meta()?.paymentStatuses ?? [], inv.paymentStatus) }}</span>
                @if (inv.paymentMode) { · {{ label(meta()?.paymentModes ?? [], inv.paymentMode) }} }
                @if (inv.paymentReference) { · Ref {{ inv.paymentReference }} }
              </div>
              @if (saved(inv) > 0) {
                <div class="saved">You saved {{ money(saved(inv)) }} on this bill</div>
              }
            </div>
            <dl class="sum">
              <div><dt>Subtotal</dt><dd>{{ money(inv.subtotal) }}</dd></div>
              @if (+inv.itemDiscount > 0) { <div><dt>Item discounts</dt><dd>− {{ money(inv.itemDiscount) }}</dd></div> }
              @if (+inv.taxTotal > 0) { <div><dt>Tax</dt><dd>+ {{ money(inv.taxTotal) }}</dd></div> }
              @if (+inv.billDiscount > 0) {
                <div><dt>Bill discount @if (inv.billDiscountType === 'percent') { ({{ +inv.billDiscountValue }}%) }</dt><dd>− {{ money(inv.billDiscount) }}</dd></div>
              }
              @if (+inv.roundOff !== 0) { <div><dt>Round off</dt><dd>{{ +inv.roundOff > 0 ? '+' : '−' }} {{ money(abs(+inv.roundOff)) }}</dd></div> }
              <div class="grand"><dt>Total</dt><dd>{{ money(inv.grandTotal) }}</dd></div>
              <div><dt>Received</dt><dd>{{ money(inv.amountPaid) }}</dd></div>
              @if (inv.status !== 'cancelled') {
                <div class="bal"><dt>Balance due</dt><dd>{{ money(balance(inv)) }}</dd></div>
              }
            </dl>
          </div>

          <p class="thanks tiny muted">Thank you for your business.</p>
        </div>
      </article>

      @if (paymentOpen()) {
        <app-modal title="Record payment" [subtitle]="'Total ' + money(inv.grandTotal)" size="sm" (closed)="paymentOpen.set(false)">
          <div class="stack-sm">
            <label class="field-sm">Total amount received so far
              <input class="input" type="number" min="0" step="0.01" [value]="payAmount()" (input)="payAmount.set(num(value($event)))" />
            </label>
            <button type="button" class="btn btn-sm left" (click)="payAmount.set(+inv.grandTotal)">Mark fully paid</button>
            <label class="field-sm">Mode
              <select class="select" (change)="payMode.set(value($event) || null)">
                <option value="">—</option>
                @for (m of meta()?.paymentModes ?? []; track m.key) {
                  <option [value]="m.key" [selected]="payMode() === m.key">{{ m.name }}</option>
                }
              </select>
            </label>
            <label class="field-sm">Reference
              <input class="input" [value]="payRef()" (input)="payRef.set(value($event))" />
            </label>
          </div>
          <div footer class="row-end g6">
            <button type="button" class="btn" (click)="paymentOpen.set(false)">Close</button>
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="savePayment(inv)">Save</button>
          </div>
        </app-modal>
      }

      @if (cancelOpen()) {
        <app-modal title="Cancel this invoice?" size="sm" (closed)="cancelOpen.set(false)">
          <p class="tiny">
            {{ inv.invoiceNo }} will be marked cancelled and kept for your records.
            @if (inv.stockApplied) { Every item it took out of stock will be <strong>returned to stock</strong>. }
            This cannot be undone.
          </p>
          <label class="field-sm">Reason (optional)
            <input class="input" [value]="cancelReason()" (input)="cancelReason.set(value($event))" />
          </label>
          <div footer class="row-end g6">
            <button type="button" class="btn" (click)="cancelOpen.set(false)">Keep invoice</button>
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="cancel(inv)">Cancel invoice</button>
          </div>
        </app-modal>
      }
    }
  `,
  styles: [
    `
      :host { display: block; }
      .toolbar { margin-bottom: 12px; gap: 8px; }
      .back { padding-left: 0; }
      .g6 { gap: 6px; }
      .left { justify-self: start; }
      .banner { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font-size: 13px; margin-bottom: 12px; }
      .banner-ok { border-color: rgba(34,197,94,.4); background: rgba(34,197,94,.07); }
      .banner-danger { border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.06); }
      .field-sm { display: grid; gap: 4px; font-size: 12px; color: var(--text-3); font-weight: 600; }

      .paper { max-width: 900px; margin: 0 auto; }
      .paper-head { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 2px solid var(--text-1, #111); }
      .seller { display: flex; gap: 12px; align-items: flex-start; }
      .logo { width: 56px; height: 56px; object-fit: contain; }
      .seller-name { font-size: 18px; font-weight: 800; }
      .doc { text-align: right; position: relative; }
      .doc-title { font-size: 12px; letter-spacing: .14em; font-weight: 700; color: var(--text-3); }
      .doc-no { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .stamp { margin-top: 6px; display: inline-block; padding: 2px 10px; border: 2px solid var(--danger); color: var(--danger); font-weight: 800; letter-spacing: .1em; transform: rotate(-4deg); }
      .bill-to { padding: 14px 0; }
      .label { text-transform: uppercase; letter-spacing: .08em; font-weight: 700; margin-bottom: 2px; }
      .items { width: 100%; border-collapse: collapse; font-size: 13px; }
      .items th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-3); border-bottom: 1px solid var(--border); padding: 8px 6px; }
      .items td { padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
      .items .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .foot { display: grid; grid-template-columns: 1fr 300px; gap: 20px; margin-top: 16px; }
      @media (max-width: 640px) { .foot { grid-template-columns: 1fr; } }
      .note { white-space: pre-line; margin: 0 0 10px; }
      .saved { margin-top: 10px; display: inline-block; padding: 4px 10px; border-radius: 6px; background: rgba(34,197,94,.1); color: #15803d; font-size: 12px; font-weight: 600; }
      .sum { margin: 0; display: grid; gap: 5px; font-size: 13px; }
      .sum div { display: flex; justify-content: space-between; gap: 10px; }
      .sum dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
      .sum .grand { border-top: 2px solid var(--text-1, #111); padding-top: 6px; margin-top: 2px; font-size: 18px; font-weight: 800; }
      .sum .bal dd { color: var(--danger); }
      .thanks { text-align: center; margin: 22px 0 0; }
    `,
  ],
})
export class InvoiceDetailComponent {
  private readonly invoices = inject(InvoiceService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  private readonly uploads = inject(UploadService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly invoice = signal<Invoice | null>(null);
  readonly meta = signal<InvoiceMeta | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);

  readonly paymentOpen = signal(false);
  readonly payAmount = signal(0);
  readonly payMode = signal<string | null>(null);
  readonly payRef = signal('');

  readonly cancelOpen = signal(false);
  readonly cancelReason = signal('');

  readonly seller = computed(() => this.meta()?.seller ?? null);
  readonly sellerAddress = computed(() => {
    const s = this.seller();
    if (!s) return '';
    return [s.addressLine1, s.addressLine2, s.city, s.state?.name, s.pincode].filter(Boolean).join(', ');
  });

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  constructor() {
    this.invoices.meta().subscribe({ next: (m) => this.meta.set(m), error: () => undefined });
    this.load();
  }

  private load(): void {
    this.invoices.get(this.id).subscribe({
      next: (inv) => {
        this.invoice.set(inv);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the invoice', messageOf(e));
        this.router.navigate(['/invoices']);
      },
    });
  }

  can(action: 'canEdit' | 'canDelete'): boolean {
    return this.auth.can('invoices', action);
  }

  print(): void {
    window.print();
  }

  async issue(inv: Invoice): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Issue invoice for ${this.money(inv.grandTotal)}?`,
      message: 'It gets an invoice number, can no longer be edited, and tracked items are taken out of stock.',
      confirmText: 'Issue invoice',
    });
    if (!ok) return;
    this.run(this.invoices.issue(inv.id), (next) => `Invoice ${next.invoiceNo} issued`);
  }

  async remove(inv: Invoice): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete this draft?',
      message: 'The draft and its items are removed. Nothing in stock changes.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.invoices.remove(inv.id).subscribe({
      next: () => {
        this.toast.success('Draft deleted');
        this.router.navigate(['/invoices']);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.error('Could not delete the draft', messageOf(e));
      },
    });
  }

  openPayment(inv: Invoice): void {
    this.payAmount.set(Number(inv.amountPaid));
    this.payMode.set(inv.paymentMode);
    this.payRef.set(inv.paymentReference ?? '');
    this.paymentOpen.set(true);
  }

  savePayment(inv: Invoice): void {
    this.run(
      this.invoices.recordPayment(inv.id, { amountPaid: this.payAmount(), paymentMode: this.payMode(), paymentReference: this.payRef() }),
      () => 'Payment recorded',
      () => this.paymentOpen.set(false)
    );
  }

  openCancel(): void {
    this.cancelReason.set('');
    this.cancelOpen.set(true);
  }

  cancel(inv: Invoice): void {
    this.run(
      this.invoices.cancel(inv.id, this.cancelReason()),
      () => (inv.stockApplied ? 'Invoice cancelled, stock returned' : 'Invoice cancelled'),
      () => this.cancelOpen.set(false)
    );
  }

  private run(request: ReturnType<InvoiceService['get']>, message: (inv: Invoice) => string, after?: () => void): void {
    this.busy.set(true);
    request.subscribe({
      next: (inv) => {
        this.busy.set(false);
        this.invoice.set(inv);
        after?.();
        this.toast.success(message(inv));
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.error('That did not work', messageOf(e));
      },
    });
  }

  balance(inv: Invoice): number {
    return Math.max(0, Math.round((Number(inv.grandTotal) - Number(inv.amountPaid)) * 100) / 100);
  }

  saved(inv: Invoice): number {
    const offer = (inv.items ?? []).reduce((acc, item) => {
      const list = Number(item.listPrice ?? 0);
      const unit = Number(item.unitPrice);
      return acc + (list > unit ? (list - unit) * item.quantity : 0);
    }, 0);
    return Math.round((Number(inv.itemDiscount) + Number(inv.billDiscount) + offer) * 100) / 100;
  }

  label(list: CatalogueEntry[], key: string | null): string {
    if (!key) return '';
    return list.find((e) => e.key === key)?.name ?? key;
  }

  tone(list: CatalogueEntry[], key: string): string {
    const tone = list.find((e) => e.key === key)?.tone ?? 'muted';
    return tone === 'neutral' ? 'muted' : tone;
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  num(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
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
