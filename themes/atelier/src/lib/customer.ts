/**
 * The customer's own account, as this template reads it.
 *
 * A plain module, for the reason `service-enquiry.ts` gives: a `'use server'`
 * file may export **async functions and nothing else**, so every type and
 * constant the actions need has to live beside them rather than in them.
 */

/** Who is signed in. No token in here — see `session.server.ts` for where it lives. */
export interface Customer {
  id: number;
  name: string;
  /** Digits only, normalised by the API. The identity, and not editable. */
  phone: string;
  email: string | null;
  phoneVerified: boolean;
  createdAt?: string;
}

/** One place they want things delivered. */
export interface Address {
  id: number;
  label: string;
  contactName: string | null;
  contactPhone: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  stateId: number | null;
  state: { id: number; name: string } | null;
  pincode: string | null;
  isDefault: boolean;
  /**
   * The whole thing as one block, formatted by the **API**.
   *
   * Printed rather than re-joined here, so an address on a profile page and the
   * one copied onto an order read identically — they are the same function's
   * output.
   */
  formatted: string;
}

/** What `/theme/me` answers with. */
export interface Account {
  customer: Customer;
  addresses: Address[];
  addressesMax: number;
  addressLabels: string[];
}

/* ------------------------------------------------------------------ *
 * Orders, as a customer sees them
 * ------------------------------------------------------------------ */

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type OrderPaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface CustomerOrderItem {
  id: number;
  productName: string;
  productSlug: string | null;
  quantity: number;
  unitPrice: number | null;
  priceLabel: string | null;
  lineTotal: number | null;
}

export interface CustomerOrder {
  id: number;
  orderNo: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  /** How it was taken at the time — what the history tags each row with. */
  mode: 'whatsapp' | 'payment' | null;
  itemCount: number;
  unpricedItems: number;
  subtotal: number;
  adjustment: number;
  total: number;
  currency: string;
  customerAddress: string | null;
  createdAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: CustomerOrderItem[];
}

/* ------------------------------------------------------------------ *
 * What the actions hand back
 * ------------------------------------------------------------------ */

/** Every account action answers in this one shape, so one banner renders them all. */
export interface AccountResult {
  status: 'idle' | 'success' | 'error';
  message: string;
  /**
   * The code, while **no SMS gateway is connected**.
   *
   * The API sends it back labelled as a development code, and the sign-in page
   * shows it with that label rather than pretending a message was sent. It is
   * the difference between a feature nobody can test and one that quietly looks
   * like it works.
   */
  devCode?: string | null;
  /**
   * Which step the sign-in is on, so the page knows what to render.
   *
   * `register` is the one the API decides rather than the person: somebody who
   * typed a number with no account is carried straight there with the number
   * already filled in, instead of being told a code is coming and left waiting
   * for a message that is never sent. See the note on `registered` in the API's
   * `requestOtp`.
   */
  step?: 'phone' | 'register' | 'code' | 'done';
  /**
   * True when the shop knows the number — false is what sends somebody to the
   * sign-up step. Absent until the number has actually been checked.
   */
  registered?: boolean;
  /**
   * The account exists but the shop has barred it. Neither a sign-in nor a
   * sign-up will help, so the page says to get in touch rather than offering
   * either.
   */
  blocked?: boolean;
  /** Echoed back so a rejection does not empty the form. */
  phone?: string;
  /**
   * Why the API refused, in its own words.
   *
   * Sent **only while there is no SMS gateway**, exactly like the code itself:
   * one message is shown to the customer whatever went wrong, and this is the
   * line that tells whoever is building the shop whether it was a mistyped digit
   * or codes that are never being stored at all.
   */
  detail?: string | null;
}

export const IDLE_ACCOUNT: AccountResult = { status: 'idle', message: '' };

/**
 * How an order should be **tagged** in the history.
 *
 * Two facts, not one. *Where it went* is the mode the shop was running when it
 * was placed — a WhatsApp order or one sent to payment — and it is snapshotted
 * on the order, so a shop that changes its mind next month does not relabel what
 * somebody already bought. *Whether it is paid* is the other axis entirely, and
 * putting them in one badge is what makes an order history unreadable.
 */
export function orderTags(order: CustomerOrder): { label: string; tone: string }[] {
  const tags: { label: string; tone: string }[] = [];

  if (order.mode === 'whatsapp') tags.push({ label: 'WhatsApp order', tone: 'whatsapp' });
  if (order.mode === 'payment') tags.push({ label: 'Paid online', tone: 'accent' });

  if (order.paymentStatus === 'paid') tags.push({ label: 'Paid', tone: 'good' });
  if (order.paymentStatus === 'unpaid') tags.push({ label: 'Payment due', tone: 'warn' });
  if (order.paymentStatus === 'refunded') tags.push({ label: 'Refunded', tone: 'bad' });

  return tags;
}

/**
 * One enquiry a customer made about a service.
 *
 * Deliberately thin. The figure the shop has pencilled in and whether it has
 * marked the job paid are both on the enquiry and neither is sent here — a
 * number somebody is still deciding is not a quote until they send it.
 * `priceLabel` is what the **card** said when they asked, which is a thing they
 * were actually told.
 */
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'completed' | 'cancelled';

/**
 * The appointment on an enquiry, where one was asked for.
 *
 * `null` on a row that only asked a question, which is most of them. This is the
 * half of the platform a customer is actually **waiting on**: they picked a
 * time, somebody has to confirm it, and until this says so they do not know
 * whether they have an appointment on Thursday.
 */
export interface CustomerBooking {
  /** `YYYY-MM-DD` and `HH:mm` in the **shop's** own day, never the reader's. */
  date: string;
  time: string;
  minutes: number | null;
  status: BookingStatus;
  /** What the shop said back — the one line here they wrote for the customer. */
  response: string | null;
}

export interface ServiceEnquiryRecord {
  id: number;
  service: string;
  icon: string | null;
  /** The address of the service's own page, so the history can link back. */
  slug: string | null;
  priceLabel: string | null;
  stage: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  askedAt: string;
  /** The appointment, or null. See `CustomerBooking`. */
  booking: CustomerBooking | null;
}

/**
 * What each booking state is called **to the customer**.
 *
 * Not the console's words. A shop reads `requested` and knows it has something
 * to answer; the person who asked needs to be told that nobody has confirmed it
 * yet, which is a different sentence. `declined` is the one that matters most:
 * "Not available" with the shop's own line under it beats a red word.
 */
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Waiting for confirmation',
  accepted: 'Confirmed',
  declined: 'Not available',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Where an enquiry has got to, in words for the person who made it.
 *
 * Not the shop's own vocabulary: `qualified` and `lost` are sales words, and
 * telling a customer their enquiry is "lost" would be worse than telling them
 * nothing. What they need to know is whether anybody is still going to ring.
 */
export const SERVICE_STAGE_LABEL: Record<ServiceEnquiryRecord['stage'], string> = {
  new: 'Received',
  contacted: 'We have been in touch',
  qualified: 'We are working on a quote',
  converted: 'Booked in',
  lost: 'Closed',
};

/** What each step is called on a customer's own history. The shop's words are its own. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Received',
  confirmed: 'Confirmed',
  packed: 'Being packed',
  dispatched: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
