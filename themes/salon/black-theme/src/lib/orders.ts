import { ORDERS_COPY } from '@/config/site';
import { formatMoney, priceOf } from './catalogue';
import type { CompanyDetails, OrdersFeature, ProductItem } from './company';

/**
 * Everything about taking an order, decided once.
 *
 * The rule this file exists to hold: **the template never decides whether this
 * site sells anything.** The API resolves the plan's grant, the tenant's switch,
 * the mode they chose and whether the route they chose has anything behind it,
 * and sends `features.orders` or does not. Every button, the header's basket and
 * the order panel hang off that one presence — so a site can never show an Add
 * to cart that leads to a Send button that leads nowhere.
 *
 * What *is* decided here is the arithmetic and the wording of the message, and
 * both are here rather than in a component for the same reason `priceOf` is: a
 * total computed in the drawer and a total written into the WhatsApp message by
 * a different function is a customer and a shop reading two different numbers
 * off the same basket.
 */

/** The cart, or `null` when this site does not take orders. See the note above. */
export const orderingOf = (company: CompanyDetails): OrdersFeature | null =>
  company.features?.orders ?? null;

/**
 * Whether *this* product can be ordered, given that the site takes orders at
 * all.
 *
 * Two questions, and both have to be yes. The API already folded the tenant's
 * own `orderable` flag together with the stock status, so this is the second
 * half only: is there a cart on this site.
 */
export const canOrder = (product: ProductItem, orders: OrdersFeature | null): boolean =>
  Boolean(orders) && product.orderable;

/* ------------------------------------------------------------------ *
 * The basket
 * ------------------------------------------------------------------ */

/**
 * One line of a basket, as it is **stored**.
 *
 * A snapshot of the product rather than a reference to one, and deliberately.
 * The basket lives in the visitor's own browser and outlives the page it was
 * filled on; a line holding only an id would have to be re-resolved against a
 * catalogue that may since have dropped the product, renamed it or changed its
 * price, and the honest rendering of that is not a crash halfway down a drawer.
 *
 * It also keeps the panel a *client* component with no catalogue in it — the
 * whole reason `siteCompany` strips products out of everything serialised into
 * the page.
 *
 * `price` is what the visitor pays today, already resolved through `priceOf`'s
 * one true order, or `null` on a product priced in words. A null price is not a
 * zero: it is a line that cannot be totalled, which the totals below carry
 * through rather than quietly adding nothing.
 */
export interface CartLine {
  id: number;
  slug: string;
  name: string;
  image: string | null;
  /** What it costs today. Null on a product priced in words. */
  price: number | null;
  /** The tenant's free-text price, printed where there is no number. */
  priceLabel: string | null;
  quantity: number;
}

/** The snapshot a product makes when it goes in the basket. */
export function lineOf(product: ProductItem, company: CompanyDetails, quantity = 1): CartLine {
  const price = priceOf(product, company);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    image: product.image,
    /* `priceOf` decides which of the three fields is the live one; taking
       `effectivePrice` directly would ignore a free-text override sitting over
       it and total a number the card never showed. */
    price: price.words ? null : product.effectivePrice,
    priceLabel: price.words,
    quantity,
  };
}

/** What a basket comes to, and whether that total is the whole story. */
export interface CartTotals {
  /** How many things, counting quantities. What the header badge shows. */
  count: number;
  /** The sum of every line that has a number. */
  amount: number;
  /**
   * True when at least one line is priced in words and is therefore **not** in
   * `amount`. The panel says so out loud rather than printing a total that
   * quietly under-counts the order.
   */
  partial: boolean;
}

export function totalsOf(lines: CartLine[]): CartTotals {
  return lines.reduce<CartTotals>(
    (totals, line) => ({
      count: totals.count + line.quantity,
      amount: totals.amount + (line.price ?? 0) * line.quantity,
      partial: totals.partial || line.price === null,
    }),
    { count: 0, amount: 0, partial: false }
  );
}

/**
 * Whether this basket may be sent, and why not when it may not.
 *
 * The minimum is checked against the part of the total the platform can
 * actually see. A basket whose lines are *all* priced in words has an amount of
 * zero and no way of knowing whether it clears a floor — so the minimum is not
 * applied to it at all, rather than refusing an order nobody can price. A shop
 * that prices in words and sets a minimum has asked for two things that do not
 * fit together, and the one worth keeping is the order.
 */
export function belowMinimum(
  totals: CartTotals,
  orders: OrdersFeature,
  company: CompanyDetails
): string | null {
  const minimum = orders.minOrderAmount;
  if (!minimum || totals.amount <= 0) return null;
  if (totals.amount >= minimum) return null;

  const amount = formatMoney(minimum, company) ?? String(minimum);
  return ORDERS_COPY.belowMinimum.replace('{amount}', amount);
}

/* ------------------------------------------------------------------ *
 * Who is ordering
 * ------------------------------------------------------------------ */

/** What the panel asks for, as far as any of it is filled in. */
export interface Orderer {
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export const EMPTY_ORDERER: Orderer = { name: '', phone: '', address: '', notes: '' };

/**
 * Which boxes are wrong, keyed by field, or an empty object when none are.
 *
 * Only the fields the **tenant** asked for are required — a shop that collects
 * nothing gets a one-press order, which is the point of the setting. The phone
 * is additionally checked for shape, loosely: seven digits or more, ignoring
 * everything people put between them. Loose on purpose, because this is a
 * website rather than a telephone exchange and refusing a number that turns out
 * to be real costs more than accepting one that turns out not to be.
 */
export function validateOrderer(
  who: Orderer,
  orders: OrdersFeature
): Partial<Record<keyof Orderer, string>> {
  const errors: Partial<Record<keyof Orderer, string>> = {};

  if (orders.requireName && !who.name.trim()) errors.name = ORDERS_COPY.required;

  if (orders.requirePhone) {
    const digits = who.phone.replace(/[^0-9]/g, '');
    if (!digits) errors.phone = ORDERS_COPY.required;
    else if (digits.length < 7) errors.phone = ORDERS_COPY.phoneInvalid;
  }

  if (orders.requireAddress && !who.address.trim()) errors.address = ORDERS_COPY.required;

  return errors;
}

/* ------------------------------------------------------------------ *
 * The message
 * ------------------------------------------------------------------ */

/**
 * The basket as a message somebody can actually read and act on.
 *
 * Plain text with no markup at all: this is pasted into WhatsApp, where a `*`
 * is bold and a `_` is italic, and a product name carrying either would come out
 * formatted rather than printed. So the shape is carried by line breaks and
 * spacing, which survive everywhere.
 *
 * It is written for the person **receiving** it, not the person sending it —
 * quantities before names so a picker can scan the left edge, the total at the
 * bottom where an invoice keeps it, and the customer's details last because they
 * are read once at the end rather than checked line by line.
 */
export function orderMessage(
  lines: CartLine[],
  who: Orderer,
  orders: OrdersFeature,
  company: CompanyDetails,
  /**
   * The number the API gave the order, once it has one.
   *
   * Put at the very top, above the intro, because it is the one line either side
   * reads back to the other — and because a shop scrolling a chat thread finds
   * an order by its number rather than by its first product. Absent only in the
   * moment before the order has been recorded, which nothing user-facing shows.
   */
  orderNo?: string | null
): string {
  const totals = totalsOf(lines);
  const parts: string[] = [];

  if (orderNo) parts.push(`Order ${orderNo}`, '');
  parts.push(orders.messageIntro, '');

  lines.forEach((line) => {
    const each = line.price !== null ? formatMoney(line.price, company) : line.priceLabel;
    const sum = line.price !== null ? formatMoney(line.price * line.quantity, company) : null;

    /* `2 x Solid oak table — ₹24,999 each — ₹49,998`, with the halves that do
       not apply left out rather than printed empty. The line total only appears
       where it says something the unit price does not. */
    const money = [each ? `${each} each` : null, sum && line.quantity > 1 ? sum : null].filter(
      Boolean
    );

    parts.push([`${line.quantity} x ${line.name}`, ...money].join(' — '));
  });

  parts.push('');

  const total = formatMoney(totals.amount, company);
  if (totals.amount > 0 && total) {
    parts.push(`${ORDERS_COPY.subtotal}: ${total}`);
    if (totals.partial) parts.push(ORDERS_COPY.totalPartial);
  }

  const details = [
    who.name.trim() ? `Name: ${who.name.trim()}` : null,
    who.phone.trim() ? `Phone: ${who.phone.trim()}` : null,
    who.address.trim() ? `Address: ${who.address.trim()}` : null,
    who.notes.trim() ? `Notes: ${who.notes.trim()}` : null,
  ].filter(Boolean) as string[];

  if (details.length) parts.push('', ...details);

  return parts.join('\n').trim();
}

/**
 * The whole `wa.me` link, message and all.
 *
 * The only place this template builds one for an order. Everywhere else the API
 * sends a finished `href`; here it cannot, because the text is whatever is in
 * the basket at the moment the button is pressed.
 */
export function orderWhatsappHref(
  lines: CartLine[],
  who: Orderer,
  orders: OrdersFeature,
  company: CompanyDetails,
  orderNo?: string | null,
  /**
   * The number the API sent back with the order, where it differs from the one
   * in the payload — it does not today, and taking it from the response rather
   * than assuming keeps the page rendering what the API decided rather than what
   * it decided a page load ago.
   */
  number: { number: string; countryCode: string } | null = orders.whatsapp
): string | null {
  if (!number) return null;

  const phone = `${number.countryCode}${number.number}`.replace(/[^0-9]/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(
    orderMessage(lines, who, orders, company, orderNo)
  )}`;
}

/**
 * Where "Pay now" goes: the tenant's UPI id as a payment intent, or their own
 * hosted page.
 *
 * **UPI first, and built rather than linked.** `upi://pay?pa=…&am=…` is the
 * scheme every Indian payment app registers, so a phone opens it in GPay or
 * PhonePe with the payee and the amount already filled in and nothing for the
 * customer to mistype. A desktop browser has nothing registered for it, which is
 * why the panel prints the id as copyable text beside the button rather than
 * only as a link — see `CartPanel`.
 *
 * The amount goes on the link only when the basket has a real total. A `upi://`
 * carrying `am=0` is a request to pay nothing, which some apps reject outright
 * and others open with a zero the customer has to correct — so a basket priced
 * entirely in words gets a link with no amount on it, and the shop names the
 * figure when it confirms.
 */
export function paymentHref(
  totals: CartTotals,
  orders: OrdersFeature,
  company: CompanyDetails
): string | null {
  const payment = orders.payment;
  if (!payment) return null;

  if (payment.upiId) {
    const params = new URLSearchParams({
      pa: payment.upiId,
      pn: payment.payeeName || company.name,
      cu: company.locale?.currency || 'INR',
    });

    if (totals.amount > 0) params.set('am', totals.amount.toFixed(2));

    return `upi://pay?${params.toString()}`;
  }

  return payment.url;
}
