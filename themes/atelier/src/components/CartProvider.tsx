'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CompanyDetails, OrdersFeature } from '@/lib/company';
import type { Account } from '@/lib/customer';
import { orderingOf, totalsOf, type CartLine, type CartTotals } from '@/lib/orders';

/**
 * The basket, and the one place it lives.
 *
 * Every part of the cart is a client component reading this: the button on a
 * card, the basket in the header, the panel that sends the order. They are on
 * three different levels of three different pages, so a context is the only
 * arrangement where pressing Add on the home page makes the header's count go
 * up without the page reloading.
 *
 * **The provider is mounted on every page, whether or not the tenant sells
 * anything.** `orders` is null when they do not, and every consumer renders
 * nothing on that — which keeps the check in one place instead of making the
 * layout decide whether to mount a provider, and keeps the tree shape the same
 * for a tenant who switches orders on while somebody is looking at the site.
 *
 * What it is given is the **lightened** company (see `siteCompany`): the whole
 * catalogue has no business being serialised into the payload of every page,
 * and nothing here needs it. A basket line is a snapshot taken when the button
 * was pressed — see `CartLine` for why that is a feature rather than a
 * shortcut.
 */

interface CartApi {
  /** The tenant's order settings, or null when this site takes no orders. */
  orders: OrdersFeature | null;
  /**
   * The signed-in customer and their addresses, where there is one.
   *
   * Resolved on the **server** and handed down, rather than fetched by the panel:
   * the session token lives in an httpOnly cookie no script can read, so the
   * browser could not ask for this even if it wanted to. Null for a guest, which
   * is the ordinary case and not a failure — the checkout then behaves exactly
   * as it did before accounts existed.
   */
  account: Account | null;
  /** The lightened company, for money formatting and the payee's name. */
  company: CompanyDetails;

  lines: CartLine[];
  totals: CartTotals;

  /** True once the basket has been read back from storage. See `hydrated`. */
  ready: boolean;

  open: boolean;
  setOpen: (open: boolean) => void;

  /** Adds one, or adds to the quantity of the line already there. */
  add: (line: CartLine) => void;
  /** Empties the basket and puts this one thing in it — the *Order now* route. */
  replaceWith: (line: CartLine) => void;
  setQuantity: (id: number, quantity: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  /** Whether this product is already in the basket, for the button's label. */
  has: (id: number) => boolean;
}

const CartContext = createContext<CartApi | null>(null);

/**
 * Where the basket is kept between visits.
 *
 * Per **origin**, which on this platform is per tenant: every company's site is
 * its own domain, so two shops can never see each other's baskets through this.
 * The version suffix is what lets the shape of a line change later without
 * having to read someone's half-migrated basket — a bumped key simply starts
 * empty, which is a far better failure than a drawer that throws halfway down.
 */
const STORAGE_KEY = 'ajsb.cart.v1';

/** What the platform will accept back out of storage, whatever is in there. */
function parseLines(raw: string | null, quantityMax: number, linesMax: number): CartLine[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object')
      .map((line) => ({
        id: Number(line.id),
        slug: String(line.slug ?? ''),
        name: String(line.name ?? ''),
        image: typeof line.image === 'string' ? line.image : null,
        price: typeof line.price === 'number' && Number.isFinite(line.price) ? line.price : null,
        priceLabel: typeof line.priceLabel === 'string' ? line.priceLabel : null,
        quantity: Math.min(Math.max(Math.trunc(Number(line.quantity) || 1), 1), quantityMax),
      }))
      .filter((line) => Number.isInteger(line.id) && line.id > 0 && line.name && line.slug)
      .slice(0, linesMax);
  } catch {
    /* Storage holding something that is not a basket is not worth a broken
       page. An empty basket is the honest recovery. */
    return [];
  }
}

export default function CartProvider({
  company,
  account = null,
  children,
}: {
  company: CompanyDetails;
  account?: Account | null;
  children: ReactNode;
}) {
  const orders = orderingOf(company);
  const quantityMax = orders?.quantityMax ?? 99;
  const linesMax = orders?.linesMax ?? 40;

  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);

  /**
   * The basket is read back in an effect rather than in the initial state, and
   * that is not a preference.
   *
   * This tree is server-rendered, and the server has no `localStorage`. Seeding
   * state from it directly would make the first client render disagree with the
   * HTML that was sent — React throws the markup away and remounts, which on a
   * page carrying a hydration mismatch is a visible flash and, in dev, an error
   * every tenant's developer would report. So the first render is always an
   * empty basket, and the stored one arrives immediately afterwards.
   *
   * `ready` is what consumers use to avoid announcing "0 items" for that one
   * frame — see `CartButton`, which renders no badge until it is true.
   */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLines(parseLines(window.localStorage.getItem(STORAGE_KEY), quantityMax, linesMax));
    } catch {
      /* Private mode, or storage switched off entirely. The cart still works
         for this visit; it just does not survive the tab being closed. */
    }
    setReady(true);
  }, [quantityMax, linesMax]);

  /** Written back on every change, once the stored one has been read — writing
      before that would save the empty first render over a real basket. */
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* Quota, or storage switched off. Nothing to do and nothing worth
         telling a shopper about mid-order. */
    }
  }, [lines, ready]);

  /**
   * A tenant who switches orders off — or whose plan lapses — while somebody is
   * looking at the site has a basket in that browser that can no longer be
   * sent. It is closed and emptied rather than left to sit behind a button that
   * is no longer on the page, so the next visit does not restore a basket from
   * a shop that has stopped taking orders.
   */
  useEffect(() => {
    if (ready && !orders) {
      setOpen(false);
      setLines((current) => (current.length ? [] : current));
    }
  }, [orders, ready]);

  const add = useCallback(
    (line: CartLine) => {
      setLines((current) => {
        const existing = current.find((entry) => entry.id === line.id);

        if (existing) {
          return current.map((entry) =>
            entry.id === line.id
              ? { ...entry, quantity: Math.min(entry.quantity + line.quantity, quantityMax) }
              : entry
          );
        }

        /* The cap is the message's, not the shop's — see `ORDER_LINES_MAX`. A
           basket at the ceiling keeps what is in it rather than silently
           dropping the oldest line to make room for a new one. */
        if (current.length >= linesMax) return current;

        return [...current, line];
      });
    },
    [quantityMax, linesMax]
  );

  const replaceWith = useCallback((line: CartLine) => setLines([line]), []);

  const setQuantity = useCallback(
    (id: number, quantity: number) => {
      const wanted = Math.trunc(quantity);

      /* Stepping below one removes the line. That is what the button under a
         quantity of 1 means, and a line of zero is not a thing anyone ordered. */
      if (wanted < 1) {
        setLines((current) => current.filter((entry) => entry.id !== id));
        return;
      }

      setLines((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, quantity: Math.min(wanted, quantityMax) } : entry
        )
      );
    },
    [quantityMax]
  );

  const remove = useCallback(
    (id: number) => setLines((current) => current.filter((entry) => entry.id !== id)),
    []
  );

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartApi>(
    () => ({
      orders,
      company,
      account,
      lines,
      totals: totalsOf(lines),
      ready,
      open,
      setOpen,
      add,
      replaceWith,
      setQuantity,
      remove,
      clear,
      has: (id: number) => lines.some((line) => line.id === id),
    }),
    [orders, company, account, lines, ready, open, add, replaceWith, setQuantity, remove, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * The basket, from anywhere inside the provider.
 *
 * Returns `null` outside one rather than throwing. Every consumer already has
 * to render nothing for a tenant that takes no orders, so the same branch
 * covers being mounted somewhere unusual — a preview, a test, a page rendered
 * outside the layout — and none of those are worth a blank site.
 */
export function useCart(): CartApi | null {
  return useContext(CartContext);
}
