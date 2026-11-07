import { DiscountType } from '../../core/models/invoice.model';

/**
 * The live preview of an invoice's figures while it is being written.
 *
 * Mirrors `services/invoice.service.js` in the API line for line. The API
 * recomputes everything on save and its numbers are the ones stored — this is
 * only so the person at the counter sees the total change as they type.
 */

const r2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function discountOn(amount: number, type: DiscountType | null, value: unknown): number {
  const v = Math.max(0, num(value));
  if (!type || v === 0 || amount <= 0) return 0;
  if (type === 'percent') return r2((amount * Math.min(v, 100)) / 100);
  return r2(Math.min(v, amount));
}

export interface LineFigures {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  lineTotal: number;
}

export function computeLine(line: {
  quantity: unknown;
  unitPrice: unknown;
  discountType: DiscountType | null;
  discountValue: unknown;
  taxPercent: unknown;
}): LineFigures {
  const qty = Math.max(0, Math.trunc(num(line.quantity)));
  const price = Math.max(0, r2(num(line.unitPrice)));
  const gross = r2(qty * price);
  const discount = discountOn(gross, line.discountType, line.discountValue);
  const taxable = r2(gross - discount);
  const rate = Math.min(100, Math.max(0, num(line.taxPercent)));
  const tax = r2((taxable * rate) / 100);
  return { gross, discount, taxable, tax, lineTotal: r2(taxable + tax) };
}

export interface InvoiceTotals {
  itemCount: number;
  subtotal: number;
  itemDiscount: number;
  taxTotal: number;
  billDiscount: number;
  roundOff: number;
  grandTotal: number;
  /** Everything taken off: line discounts, the bill discount, and offer savings. */
  saved: number;
}

export function computeTotals(
  lines: (LineFigures & { quantity: unknown; listPrice?: number | null; unitPrice: unknown })[],
  bill: { type: DiscountType | null; value: unknown; roundOff: boolean }
): InvoiceTotals {
  const sum = (pick: (l: (typeof lines)[number]) => number) => r2(lines.reduce((acc, l) => acc + pick(l), 0));
  const subtotal = sum((l) => l.gross);
  const itemDiscount = sum((l) => l.discount);
  const taxTotal = sum((l) => l.tax);
  const afterLines = sum((l) => l.lineTotal);
  const billDiscount = discountOn(afterLines, bill.type, bill.value);
  const beforeRound = r2(afterLines - billDiscount);
  const grandTotal = bill.roundOff ? Math.round(beforeRound) : beforeRound;
  const offerSaving = sum((l) =>
    l.listPrice && l.listPrice > num(l.unitPrice) ? (l.listPrice - num(l.unitPrice)) * Math.trunc(num(l.quantity)) : 0
  );
  return {
    itemCount: lines.reduce((acc, l) => acc + Math.trunc(num(l.quantity)), 0),
    subtotal,
    itemDiscount,
    taxTotal,
    billDiscount,
    roundOff: r2(grandTotal - beforeRound),
    grandTotal: r2(grandTotal),
    saved: r2(itemDiscount + billDiscount + offerSaving),
  };
}
