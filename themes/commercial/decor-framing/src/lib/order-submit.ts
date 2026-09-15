/**
 * What an order submission carries, and what comes back.
 *
 * A plain module rather than part of the action, for the reason
 * `service-enquiry.ts` gives: a `'use server'` file may export **async functions
 * and nothing else**, so a type or a constant beside the action is a runtime
 * error rather than a build one — exactly the kind that ships.
 */

/** What the browser sends. Ids and quantities; never a price. See the action. */
export interface OrderSubmission {
  items: { productId: number; quantity: number }[];
  name: string;
  phone: string;
  address: string;
  note: string;
  sourceUrl: string;
  /**
   * A saved address, for a signed-in customer.
   *
   * An **id**, never the text. The API checks it against that customer's own
   * addresses and writes its own formatting of it onto the order — a body that
   * could name any address id would be a way of reading other people's addresses
   * back out of an order confirmation.
   */
  addressId?: number | null;
}

/** What the API gave back, and what the panel does next with it. */
export interface OrderResult {
  status: 'success' | 'error';
  message: string;
  /** `ORD-00012`. Only exists once the order has been recorded. */
  orderNo?: string;
  /**
   * The total **the shop computed**, not the one the basket showed.
   *
   * Where they differ — a price changed while somebody was deciding — this is
   * the one that is right, and it is what the confirmation prints.
   */
  total?: number | null;
  /**
   * Where to send them next, when the tenant publishes a number.
   *
   * A link they press rather than a window opened for them: a popup opened after
   * an `await` has lost its user gesture and browsers block it, so the reliable
   * version is the honest one — confirm the order, then offer the chat.
   */
  whatsapp?: { number: string; countryCode: string } | null;
}

export const IDLE_ORDER: OrderResult = { status: 'success', message: '' };
