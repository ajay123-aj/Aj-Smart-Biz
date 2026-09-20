'use server';

import { resolveDomain } from '@/lib/company.server';
import { readSession } from '@/lib/session.server';
import type { OrderResult, OrderSubmission } from '@/lib/order-submit';

/**
 * Carries an order to the API.
 *
 * A Server Action rather than a route handler, for the reason
 * `submit-service-enquiry` gives: this template has no API of its own, and a
 * route handler would be one. It also keeps `API_URL` where it belongs — the
 * browser never learns the API's address and cannot be handed a `localhost`
 * origin that means the visitor's own machine.
 *
 * **It sends product ids and quantities, and no prices.** The basket in the
 * browser knows what each line cost because it snapshotted it when the button
 * was pressed, and none of that is sent: the API reads every figure off the
 * tenant's own catalogue at the moment the order is placed. A body that could
 * name its own price is a shop that can be bought from at a price the customer
 * chose, and a client-side total is a suggestion rather than a fact.
 *
 * Which means the total that comes **back** is the one that counts, and it is
 * what the confirmation shows. Where the two differ — a price changed while
 * somebody was deciding — the shop's number wins, which is the only answer that
 * can be right.
 *
 * It validates nothing beyond what it takes to give the person in front of it a
 * useful message. The API is the authority: it decides whether this tenant takes
 * orders at all, which details it asks for, whether each product is one of theirs
 * and orderable, and it rate limits by IP.
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function submitOrder(submission: OrderSubmission): Promise<OrderResult> {
  if (!submission.items.length) {
    return { status: 'error', message: 'Your basket is empty.' };
  }

  /* Null for a guest, which is a first-class case rather than a failure. */
  const token = await readSession();

  let response: Response;

  try {
    response = await fetch(`${API_URL}/theme/orders`, {
      method: 'POST',
      body: JSON.stringify({
        /**
         * The tenant, resolved server-side from the host this page was served
         * on — the same answer `getCompanyDetails` uses. Not a field the browser
         * supplies, so an order cannot be aimed at a company whose website the
         * sender never opened. The API resolves the host itself as well; this is
         * what makes it work on a dev server, where the host names nobody.
         */
        domain: await resolveDomain(),
        items: submission.items.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        name: submission.name || null,
        phone: submission.phone || null,
        address: submission.address || null,
        note: submission.note || null,
        sourceUrl: submission.sourceUrl || null,
        /* A saved address, for a signed-in customer. An id, never the text — the
           API checks it against their own addresses and formats it itself. */
        addressId: submission.addressId ?? null,
      }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        /**
         * The session, where there is one.
         *
         * Optional by design: a signed-in customer gets the order filed against
         * their account and their saved address honoured; a stranger gets exactly
         * the checkout the site had before accounts existed. The token never
         * reaches the browser — it is read here, on the server, out of an
         * httpOnly cookie.
         */
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    /* The API being unreachable is not the shopper's fault and not their problem
       to solve, so the message says what to do rather than what broke. */
    return {
      status: 'error',
      message: 'We could not send that just now. Please try again in a moment.',
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | {
      success?: boolean;
      message?: string;
      data?: {
        orderNo?: string;
        total?: number;
        currency?: string;
        whatsapp?: { number: string; countryCode: string } | null;
      };
    }
    | null;

  if (!response.ok || !payload?.success || !payload.data?.orderNo) {
    return {
      status: 'error',
      /* The API's own wording. It knows why it refused — a product that went out
         of stock while somebody was deciding, a minimum not met — and this page
         does not. */
      message: payload?.message || 'That order could not be placed. Please try again.',
    };
  }

  return {
    status: 'success',
    message: payload.message || 'Thank you — your order has been received.',
    orderNo: payload.data.orderNo,
    total: typeof payload.data.total === 'number' ? payload.data.total : null,
    /**
     * Present only where the tenant publishes a number. The page composes the
     * message itself, because it is the only side that knows what the basket
     * said — and it can now put the order number at the top of it, which is the
     * thing the shop reads back down the phone.
     */
    whatsapp: payload.data.whatsapp ?? null,
  };
}
