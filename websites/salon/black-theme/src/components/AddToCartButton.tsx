'use client';

import { useState } from 'react';
import { ORDERS_COPY } from '@/config/site';
import type { CartLine } from '@/lib/orders';
import { useCart } from './CartProvider';
import styles from './AddToCartButton.module.css';

/**
 * The button that puts one product in the basket.
 *
 * On every product card and on every product page, and the same component in
 * both — a shopper who adds from a card and a shopper who adds from the detail
 * page have to end up with the same line, and two implementations of that is
 * how a basket ends up with two entries for one product.
 *
 * **It takes a finished `CartLine`, not a `ProductItem`.** The card is a server
 * component and this is a client one, so whatever crosses that boundary is
 * serialised into the page's HTML — once per card. A line is five fields; a
 * product is its whole description, its specifications and its gallery, none of
 * which a basket has any use for. The snapshot is taken on the server by
 * `lineOf`, which is also what keeps the price in the basket identical to the
 * price on the card: one resolution of the tenant's three pricing fields, not
 * two.
 *
 * ## What it renders, and when it renders nothing
 *
 *   no cart on this site   nothing at all. `orders` is null, which the API
 *                          decides — see `OrdersFeature`.
 *   not orderable          a plain disabled note. The product is out of stock
 *                          or the tenant marked it not for sale, and a card
 *                          that silently loses its button next to five that
 *                          kept theirs reads as a bug.
 *   cart off               the tenant takes one order per product, so the
 *                          button says *Order now*, and pressing it empties
 *                          the basket into this one line and opens the panel.
 *   ordinary               *Add to cart*, then *In your basket* once it is.
 */
export default function AddToCartButton({
  line,
  orderable,
  /** The detail page's button is the page's main action and is sized like one. */
  size = 'card',
  className,
}: {
  line: CartLine;
  orderable: boolean;
  size?: 'card' | 'page';
  className?: string;
}) {
  const cart = useCart();
  const [justAdded, setJustAdded] = useState(false);

  if (!cart?.orders) return null;

  const { orders, add, replaceWith, setOpen, has } = cart;

  if (!orderable) {
    return (
      <span className={`${styles.button} ${styles.off} ${className ?? ''}`}>
        {ORDERS_COPY.unavailable}
      </span>
    );
  }

  /** The basket route and the one-at-a-time route, told apart in one place. */
  const single = !orders.cart;
  const inBasket = !single && has(line.id);

  const press = () => {
    if (single) {
      replaceWith(line);
      setOpen(true);
      return;
    }

    add(line);

    /*
     * The basket is **not** opened on an ordinary add.
     *
     * A panel that takes over the screen every time somebody adds something is
     * the single most reliable way to stop them adding a second thing. The
     * header's count moves, the button changes, and the shopper decides when
     * they are done. The one-at-a-time route above is the exception, because
     * there the press *is* the order.
     */
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1400);
  };

  const label = single
    ? orders.buyNowLabel
    : inBasket || justAdded
      ? ORDERS_COPY.added
      : orders.addToCartLabel;

  return (
    <button
      type="button"
      className={`${styles.button} ${size === 'page' ? styles.page : ''} ${
        inBasket || justAdded ? styles.in : ''
      } ${className ?? ''}`}
      onClick={press}
    >
      <Glyph done={inBasket || justAdded} single={single} />
      {label}
    </button>
  );
}

/**
 * A basket, or a tick once it is in one. Drawn here rather than pulled from an
 * icon set for the reason `Glyph` gives: two icons is not worth a dependency,
 * and these have to inherit `currentColor` to work in both states.
 */
function Glyph({ done, single }: { done: boolean; single: boolean }) {
  return (
    <svg
      className={styles.glyph}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      {done ? (
        <path d="m5 12.5 4.4 4.4L19 7.5" />
      ) : single ? (
        <>
          <path d="M5 8h14l-1.2 10.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9Z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </>
      ) : (
        <>
          <circle cx="9.5" cy="20" r="1.4" />
          <circle cx="17.5" cy="20" r="1.4" />
          <path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21 8H6" />
        </>
      )}
    </svg>
  );
}
