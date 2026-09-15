'use client';

import { ORDERS_COPY } from '@/config/site';
import { useCart } from './CartProvider';
import styles from './CartButton.module.css';

/**
 * The basket in the header, and the only way back to an order in progress.
 *
 * Renders nothing in three cases, all of which are ordinary rather than
 * exceptional:
 *
 *   no cart on this site   `orders` is null — the plan, the switch, the mode or
 *                          the catalogue. The API decided; nothing here asks.
 *   one order per product  the tenant switched the basket off, so there is no
 *                          basket to open. The order *is* the press on the card.
 *   nothing in it          an empty basket icon on every page of a site nobody
 *                          has added anything to is a permanent reminder that
 *                          the shop is empty. It appears when there is something
 *                          in it, which is also the moment it becomes useful.
 *
 * The count is announced rather than left as a decorative number: a badge
 * reading "3" beside a basket glyph is nothing at all to a screen reader.
 */
export default function CartButton({ className }: { className?: string }) {
  const cart = useCart();

  if (!cart?.orders || !cart.orders.cart) return null;
  /* `ready` keeps the button from flashing in and out on load: the first client
     render has an empty basket by necessity, and the stored one lands a moment
     later. See `CartProvider`. */
  if (!cart.ready || !cart.totals.count) return null;

  const { count } = cart.totals;
  const announced = (count === 1 ? ORDERS_COPY.cartCountOne : ORDERS_COPY.cartCount).replace(
    '{n}',
    String(count)
  );

  return (
    <button
      type="button"
      className={`${styles.button} ${className ?? ''}`}
      onClick={() => cart.setOpen(true)}
      aria-label={`${ORDERS_COPY.cartOpen} — ${announced}`}
    >
      <svg
        className={styles.glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="9.5" cy="20" r="1.4" />
        <circle cx="17.5" cy="20" r="1.4" />
        <path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21 8H6" />
      </svg>

      {/*
        The count, and no word beside it.

        A basket glyph with a number on it needs no label — and the button's own
        `aria-label` already says "3 items in your basket" in full, so what is
        dropped here is visual noise rather than meaning. Hidden from assistive
        technology for exactly that reason: it would otherwise be read twice.
      */}
      <span className={styles.count} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
