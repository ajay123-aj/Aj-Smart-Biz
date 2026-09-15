'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { submitOrder } from '@/app/actions/submit-order';
import { ORDERS_COPY } from '@/config/site';
import { formatMoney } from '@/lib/catalogue';
import { toFileUrl } from '@/lib/company';
import {
  EMPTY_ORDERER,
  belowMinimum,
  orderWhatsappHref,
  paymentHref,
  validateOrderer,
  type Orderer,
} from '@/lib/orders';
import type { CartLine } from '@/lib/orders';
import type { OrderResult } from '@/lib/order-submit';
import { useCart } from './CartProvider';
import styles from './CartPanel.module.css';

/**
 * The basket, and the one screen that sends an order.
 *
 * Mounted once by the layout, opened by the header's basket or by an *Order
 * now* press. A **native `<dialog>`** driven with `showModal()`, the same choice
 * `ServiceEnquiryButton` makes and for the same reasons: the element gives us
 * the focus trap, Escape, the inert background, the `::backdrop` scrim and the
 * right `aria-modal` semantics without a line of code to maintain.
 *
 * ## Two tenants, two endings
 *
 * What the last button does is the company's setting, resolved by the API and
 * arriving as `orders.mode`. The panel above it is identical in both, which is
 * the point — the difference is where the order goes, not what a shopper has to
 * do:
 *
 *   `whatsapp`  the basket is composed into a message and the button is a real
 *               anchor to `wa.me`. A real link on a real click, so no popup
 *               blocker touches it and nothing is stored on the platform.
 *   `payment`   the button opens the tenant's own UPI intent or payment page
 *               with the total already on it — and, where they have published a
 *               number, the order is offered to WhatsApp underneath as well. A
 *               payment with no idea what was bought is not an order.
 *
 * The panel is never mounted for a tenant with no cart: `orders` is null and
 * this returns nothing. Nothing here re-derives that.
 */
export default function CartPanel() {
  const cart = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);

  /* Read before any early return: hooks below initialise from it, and a hook
     cannot be called conditionally. */
  const cartAccount = cart?.account ?? null;

  /**
   * Prefilled from the account, where there is one.
   *
   * A signed-in customer being asked to type their own name again is the exact
   * thing the account exists to stop. The fields stay editable: ordering on
   * somebody else's behalf is ordinary, and the order copies whatever is in the
   * box rather than whatever is on the account.
   */
  const [who, setWho] = useState<Orderer>(() =>
    cartAccount ? { ...EMPTY_ORDERER, name: cartAccount.customer.name, phone: cartAccount.customer.phone } : EMPTY_ORDERER
  );
  const [errors, setErrors] = useState<Partial<Record<keyof Orderer, string>>>({});

  /**
   * The order, once the API has one — its number, its total and the number to
   * open. Null while the basket is still being filled in.
   *
   * This is what the panel switches on, rather than a boolean: the confirmation
   * has something to say (`ORD-00012`, and what the **shop** totalled it at),
   * and a flag would have meant keeping that somewhere else.
   */
  const [placed, setPlaced] = useState<OrderResult | null>(null);
  /**
   * The basket as it was when the order went.
   *
   * Kept because the basket itself is emptied on success, and the confirmation
   * still has to compose the WhatsApp message from what was actually ordered.
   * Reading the live basket there would compose a message with nothing in it.
   */
  const [sentLines, setSentLines] = useState<CartLine[]>([]);
  /** What went wrong, said in the API's own words. It knows; this page does not. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Which saved address this order is going to.
   *
   * Starts on the customer's default, which is the whole point of having one —
   * the common case is somebody ordering to the same place as last time, and they
   * should not have to choose. `0` means *somewhere else*, which opens the plain
   * address box for a one-off delivery.
   */
  const [addressId, setAddressId] = useState<number>(
    /* `cartAccount`, not the destructured `account` — that one is pulled out of
       `cart` below, after the early return, so reading it here would be a
       temporal dead zone that only shows up at runtime. */
    () =>
      cartAccount?.addresses.find((entry) => entry.isDefault)?.id ?? cartAccount?.addresses[0]?.id ?? 0
  );

  /**
   * `showModal()` is imperative, so opening is an effect on state rather than a
   * call in a click handler — that way the dialog cannot end up open in the DOM
   * and closed in React, which is what makes Escape and the backdrop work
   * without a second source of truth.
   */
  const open = Boolean(cart?.open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!cart?.orders) return null;

  const { orders, company, account, lines, totals, setOpen, setQuantity, remove, clear } = cart;

  const close = () => setOpen(false);

  /**
   * Whether this shop takes orders only from people it knows.
   *
   * The presence of `features.customers` is the tenant's answer: they bought
   * customer accounts, so an order should arrive attached to one. The API
   * enforces it — this is what stops somebody being walked all the way through a
   * basket and a form before being told.
   */
  const accountsRequired = Boolean(company.features?.customers);
  const mustSignIn = accountsRequired && !account;

  /**
   * What the shop already knows, and therefore does not ask for.
   *
   * A signed-in customer being asked to type their own name and number again is
   * the exact thing the account exists to stop — so those fields are not
   * rendered at all rather than pre-filled and left to be edited. The values are
   * still carried in `who`, and the API fills anything blank from the account
   * regardless.
   */
  const knowsWho = Boolean(account);

  const minimumNote = belowMinimum(totals, orders, company);
  const payHref = paymentHref(totals, orders, company);

  /**
   * The chat link, composed **after** the order exists so the number is in it.
   *
   * Built from what came back rather than from the payload the page was rendered
   * with: the API decides where an order goes, and reading that off the response
   * keeps the link honest if the tenant changed it while somebody was shopping.
   */
  const whatsappHref = placed?.orderNo
    ? orderWhatsappHref(sentLines, who, orders, company, placed.orderNo, placed.whatsapp ?? undefined)
    : null;

  /**
   * Place the order.
   *
   * **Two steps, and the order in which they happen is the point.** The basket
   * is recorded first, through the Server Action, and only then is the visitor
   * offered the chat or the payment. Before there was an order book this was one
   * step — a link straight to `wa.me` — and the shop's whole record of a sale
   * was a message it had to notice. Now the record exists whether or not
   * anybody presses anything afterwards, which is the difference between a sale
   * that can be counted and one that cannot.
   *
   * **No price is sent.** The action posts ids and quantities; the API reads
   * every figure off the shop's own catalogue. So the total in the confirmation
   * is the shop's, not the basket's — and where the two differ, because a price
   * changed while somebody was deciding, the shop's is the one that is right.
   *
   * **WhatsApp opens by itself**, which is what the hint under the button says
   * will happen. The trick is *when* the tab is opened: a window opened after an
   * `await` has lost its user gesture and every browser blocks it, so the tab is
   * opened **during the press** - empty - and pointed at the composed message
   * once the order has a number. The order number is the reason it cannot simply
   * be an anchor: it does not exist until the API has answered.
   *
   * The button on the confirmation stays regardless. A blocker that refuses even
   * the gesture-time open, a tab closed by hand, an embedded browser that does
   * nothing with `wa.me` - in all of them the visitor still has something to
   * press, and the order is recorded either way.
   */
  const place = () => {
    /* A chosen saved address *is* an address, so the typed box is not required
       when one is selected — validating it anyway would refuse the very order the
       picker exists to make easy. */
    /**
     * Only what is actually on the form.
     *
     * A chosen saved address *is* an address, and a signed-in customer's name and
     * number are already known — validating fields that were never rendered
     * would refuse the very order this checkout exists to make easy.
     */
    const found = validateOrderer(who, {
      ...orders,
      requireAddress: orders.requireAddress && !addressId,
      requireName: orders.requireName && !knowsWho,
      requirePhone: orders.requirePhone && !knowsWho,
    });
    setErrors(found);
    setFailure(null);

    if (Object.keys(found).length || minimumNote || !lines.length) return;

    /**
     * Opened **now**, inside the press, and aimed once the order lands.
     *
     * This is the whole reason WhatsApp opens at all: the message has to carry
     * the order number, the order number only exists after a round trip, and a
     * window opened after that round trip is a popup as far as the browser is
     * concerned and is blocked without a word. A tab opened during the click is
     * not - it is the same gesture, still being honoured.
     *
     * `null` when the shop takes payment instead, or publishes no number: the
     * confirmation offers WhatsApp underneath the payment there, and which of
     * the two happens first is the shop's decision, not this panel's.
     */
    const chat =
      orders.mode === 'whatsapp' && orders.whatsapp && typeof window !== 'undefined'
        ? window.open('', '_blank')
        : null;

    startTransition(async () => {
      const result = await submitOrder({
        items: lines.map((line) => ({ productId: line.id, quantity: line.quantity })),
        name: who.name.trim(),
        phone: who.phone.trim(),
        address: who.address.trim(),
        note: who.notes.trim(),
        /* An id, never the text — the API checks it against this customer's own
           addresses and writes its own formatting onto the order. */
        addressId: addressId || null,
        sourceUrl: typeof window === 'undefined' ? '' : window.location.href,
      });

      if (result.status === 'error') {
        /* Nothing was ordered, so nothing is handed over - and a blank tab left
           open over a failed order reads as though something was sent. */
        chat?.close();
        setFailure(result.message);
        return;
      }

      /**
       * The basket is emptied **now that the order is a record**.
       *
       * It used to be kept, and that was right when the order was only a message
       * the shop had to notice: clearing on the way out would have lost the one
       * copy of it if the message never got sent. There is a row in the order book
       * now, so the basket has done its job — and a basket that still holds the
       * order somebody just placed is how the same order gets sent twice.
       *
       * The confirmation still shows the lines, because it reads them from the
       * result rather than from the basket.
       */
      setSentLines(lines);
      setPlaced(result);
      clear();

      /**
       * Composed from `lines` rather than the basket, which has just been
       * emptied - and with the number the API sent back, so the message goes
       * where the shop says it goes rather than where the page thought it did
       * when it loaded.
       */
      const href = orderWhatsappHref(
        lines,
        who,
        orders,
        company,
        result.orderNo,
        result.whatsapp ?? undefined
      );

      if (chat && !chat.closed && href) chat.location.href = href;
      /* No tab, or it was refused: the confirmation's own button is still there
         and says the same thing. Nothing is lost, it is one press instead of
         none. */
      else chat?.close();
    });
  };

  const field = (key: keyof Orderer, value: string) => {
    setWho((current) => ({ ...current, [key]: value }));
    /* Clearing the error as they type, rather than on the next press: an error
       that stays put while somebody fixes it reads as one they have not fixed. */
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={orders.cartTitle}
      onClose={close}
      /* The backdrop is part of the dialog element, so a click lands on the
         dialog itself rather than on the panel inside it. */
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2 className={styles.title}>{orders.cartTitle}</h2>
          <button type="button" className={styles.close} onClick={close} aria-label={ORDERS_COPY.close}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              focusable="false"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {/**
          * **A placed order outranks an empty basket**, and the order of these
          * two is the whole of it.
          *
          * Placing an order empties the basket - deliberately, so the same order
          * cannot be sent twice - and while the empty test came first that
          * emptying hid the confirmation behind "Your basket is empty. Add
          * something from the catalogue". The order number, the total and the
          * WhatsApp button were all in a branch nothing could reach, so pressing
          * Send appeared to throw the order away and WhatsApp never opened.
          */}
        {placed ? (
          /**
           * The order is **recorded**, whatever happens next. That is the whole
           * change: what used to be a link the shop had to notice is now a row in
           * its order book, and the message underneath is a notification rather
           * than the only evidence.
           *
           * The basket is emptied when the order is placed - see `place` - so
           * this branch is what stands in its place, and it has to be tested
           * before the empty one rather than after it.
           */
          <div className={styles.empty}>
            <p className={styles.orderNo}>{placed.orderNo}</p>
            <p className={styles.emptyTitle}>{ORDERS_COPY.placed}</p>

            {/* The **shop's** total, not the basket's. Where they differ, because
                a price moved while somebody was deciding, this is the one that is
                right — so it is the one printed. */}
            {typeof placed.total === 'number' && placed.total > 0 ? (
              <p className={styles.placedTotal}>{formatMoney(placed.total, company) ?? ''}</p>
            ) : null}

            {/* Three things can have happened, and the line says which: WhatsApp
                was opened for them, there is a message waiting to be sent after
                payment, or the shop publishes no number and nothing is expected
                of them at all. */}
            <p className={styles.emptyHint}>
              {!whatsappHref
                ? ORDERS_COPY.placedHintQuiet
                : orders.mode === 'whatsapp'
                  ? ORDERS_COPY.placedHintOpened
                  : ORDERS_COPY.placedHint}
            </p>

            <div className={styles.actions}>
              {/* Payment first when that is what the shop takes: the order exists
                  either way, and this is the step it is still waiting on. */}
              {orders.mode === 'payment' && payHref ? (
                <>
                  <a className={styles.primary} href={payHref}>
                    {orders.payment?.label ?? ORDERS_COPY.payNow}
                  </a>
                  {orders.payment?.upiId ? (
                    <p className={styles.upi}>
                      <span>UPI</span>
                      <code>{orders.payment.upiId}</code>
                    </p>
                  ) : null}
                </>
              ) : null}

              {whatsappHref ? (
                <a
                  className={orders.mode === 'payment' ? styles.secondary : styles.primary}
                  href={whatsappHref}
                >
                  {orders.mode === 'payment' ? ORDERS_COPY.sendAfterPay : orders.submitLabel}
                </a>
              ) : null}

              <button
                type="button"
                className={styles.quiet}
                onClick={() => {
                  /* Already emptied when the order was placed. */
                  setWho(EMPTY_ORDERER);
                  setSentLines([]);
                  setPlaced(null);
                  close();
                }}
              >
                {ORDERS_COPY.startAnother}
              </button>
            </div>
          </div>
        ) : !lines.length ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{ORDERS_COPY.empty}</p>
            <p className={styles.emptyHint}>{ORDERS_COPY.emptyHint}</p>
          </div>
        ) : (
          <>
            <ul className={styles.lines}>
              {lines.map((line) => {
                const image = toFileUrl(line.image);
                const each = line.price !== null ? formatMoney(line.price, company) : line.priceLabel;
                const sum =
                  line.price !== null ? formatMoney(line.price * line.quantity, company) : null;

                return (
                  <li key={line.id} className={styles.line}>
                    {image ? (
                      // Not next/image: the file origin is configured per
                      // deployment, and a plain img keeps the basket working
                      // when it is not. The call the whole catalogue makes.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.thumb} src={image} alt="" loading="lazy" />
                    ) : (
                      <span className={styles.noThumb} aria-hidden="true">
                        {line.name.trim().charAt(0).toUpperCase()}
                      </span>
                    )}

                    <div className={styles.lineBody}>
                      <p className={styles.lineName}>{line.name}</p>
                      <p className={styles.lineEach}>{each ?? ORDERS_COPY.priceOnRequest}</p>

                      <div className={styles.stepper}>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.id, line.quantity - 1)}
                          aria-label={ORDERS_COPY.decrease}
                        >
                          −
                        </button>
                        {/* Announced with the product's name, because "2" on its
                            own in a list of four products says nothing. */}
                        <span aria-label={`${ORDERS_COPY.quantity}: ${line.quantity}`}>
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.id, line.quantity + 1)}
                          disabled={line.quantity >= orders.quantityMax}
                          aria-label={ORDERS_COPY.increase}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className={styles.lineEnd}>
                      {sum ? <span className={styles.lineSum}>{sum}</span> : null}
                      <button
                        type="button"
                        className={styles.remove}
                        onClick={() => remove(line.id)}
                        aria-label={ORDERS_COPY.removeOne.replace('{name}', line.name)}
                      >
                        {ORDERS_COPY.remove}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className={styles.totals}>
              <span>{ORDERS_COPY.subtotal}</span>
              <strong>{formatMoney(totals.amount, company) ?? '—'}</strong>
            </div>

            {/* Said out loud rather than hidden in a total that quietly
                under-counts the order. */}
            {totals.partial ? <p className={styles.note}>{ORDERS_COPY.totalPartial}</p> : null}
            {minimumNote ? <p className={styles.warn}>{minimumNote}</p> : null}

            {orders.cartNote ? <p className={styles.note}>{orders.cartNote}</p> : null}

            {/* Only asked for where the tenant asked for it. A shop that
                collects nothing gets a one-press order, which is the point of
                the setting. */}
            {(orders.requireName && !knowsWho) || (orders.requirePhone && !knowsWho) || orders.requireAddress ? (
              <h3 className={styles.formTitle}>{ORDERS_COPY.detailsTitle}</h3>
            ) : null}

            {/* Said once, plainly, instead of two greyed-out boxes nobody can
                use — a signed-in customer should be able to see at a glance who
                this order is going to be filed against. */}
            {knowsWho ? (
              <p className={styles.note}>
                {ORDERS_COPY.orderingAs.replace('{name}', account!.customer.name)}{' '}
                <a className={styles.inlineLink} href="/account">
                  {ORDERS_COPY.notYou}
                </a>
              </p>
            ) : null}

            <div className={styles.form}>
              {orders.requireName && !knowsWho ? (
                <Field
                  label={ORDERS_COPY.name}
                  value={who.name}
                  error={errors.name}
                  onChange={(value) => field('name', value)}
                  autoComplete="name"
                />
              ) : null}

              {orders.requirePhone && !knowsWho ? (
                <Field
                  label={ORDERS_COPY.phone}
                  value={who.phone}
                  error={errors.phone}
                  onChange={(value) => field('phone', value)}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                />
              ) : null}

              {orders.requireAddress ? (
                account?.addresses.length ? (
                  <>
                    {/*
                      The saved addresses, as the first thing rather than a link
                      under a box. Not typing it again is the whole reason the
                      account exists, so the box is what you reach for when none
                      of them fit — not the other way round.
                    */}
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>{ORDERS_COPY.deliverTo}</span>
                      <select
                        className={styles.control}
                        value={addressId}
                        onChange={(event) => setAddressId(Number(event.target.value))}
                      >
                        {account.addresses.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label} — {entry.formatted}
                          </option>
                        ))}
                        <option value={0}>{ORDERS_COPY.addressElsewhere}</option>
                      </select>
                    </label>

                    {addressId === 0 ? (
                      <Field
                        label={ORDERS_COPY.address}
                        value={who.address}
                        error={errors.address}
                        onChange={(value) => field('address', value)}
                        autoComplete="street-address"
                        multiline
                      />
                    ) : null}
                  </>
                ) : (
                  <Field
                    label={ORDERS_COPY.address}
                    value={who.address}
                    error={errors.address}
                    onChange={(value) => field('address', value)}
                    autoComplete="street-address"
                    multiline
                  />
                )
              ) : null}

              <Field
                label={`${ORDERS_COPY.notes} (${ORDERS_COPY.notesHint})`}
                value={who.notes}
                onChange={(value) => field('notes', value)}
                multiline
              />
            </div>

            <div className={styles.actions}>
              {mustSignIn ? (
                /**
                 * This shop takes orders from account holders.
                 *
                 * Shown **here**, under the basket, rather than as a gate in front
                 * of it: somebody should be able to fill a basket, see the total
                 * and read the delivery terms before being asked who they are.
                 * The basket survives the trip — it lives in this browser, not in
                 * the session — so signing in and coming back finds it exactly as
                 * it was.
                 */
                <>
                  <a className={styles.primary} href="/account">
                    {ORDERS_COPY.signInToOrder}
                  </a>
                  <p className={styles.hint}>{ORDERS_COPY.signInWhy}</p>
                </>
              ) : (
                <>
              {/*
                One button, whatever the shop takes.

                It used to be two anchors — straight to `wa.me`, or straight to a
                payment app — because there was nothing to record and a real link
                on a real click is the only thing no popup blocker touches. There
                is something to record now, so this is a submit: the order is
                written first, and the handoff becomes a link on the confirmation
                where it is still a real link on a real click.
              */}
              <button type="button" className={styles.primary} onClick={place} disabled={pending}>
                {pending ? ORDERS_COPY.placing : orders.submitLabel}
              </button>

              <p className={styles.hint}>
                {orders.mode === 'payment' ? ORDERS_COPY.payHint : ORDERS_COPY.sendHint}
              </p>

              {/* The API's own wording. It knows why it refused — something went
                  out of stock while they were deciding, a minimum not met — and
                  this page does not. */}
              {failure ? <p className={styles.warn}>{failure}</p> : null}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

/**
 * One box, with its label and whatever is wrong with it.
 *
 * A real `<label>` wrapping the control rather than a placeholder standing in
 * for one: a placeholder disappears the moment somebody types, which is exactly
 * when a person filling in four boxes needs to be told which one they are in.
 */
function Field({
  label,
  value,
  error,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  multiline = false,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: 'tel' | 'text';
  multiline?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>

      {multiline ? (
        <textarea
          className={`${styles.control} ${error ? styles.bad : ''}`}
          value={value}
          rows={2}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={`${styles.control} ${error ? styles.bad : ''}`}
          value={value}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {error ? <span className={styles.error}>{error}</span> : null}
    </label>
  );
}
