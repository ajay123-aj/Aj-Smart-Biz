import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import SignInPanel from '@/components/SignInPanel';
import { getCompanyDetails } from '@/lib/company.server';
import { getAccount, getMyOrders } from '@/lib/session.server';
import { ORDER_STATUS_LABEL, orderTags, type CustomerOrder } from '@/lib/customer';
import styles from '@/components/Account.module.css';

/**
 * Everything this customer has ordered.
 *
 * ### Why the lines are on it
 *
 * A history that showed only a date and a total is one nobody can check against
 * what actually arrived — which is the single most common reason somebody opens
 * it. So every order carries its lines, and the page is a list of orders rather
 * than a table of totals with a detail page behind each.
 *
 * ### Two tags, never one
 *
 * *Where it went* — a WhatsApp order, or one sent to payment — is the shop's mode
 * at the time, snapshotted on the order so a shop that changes its mind next
 * month does not relabel what somebody already bought. *Whether it is paid* is a
 * separate axis entirely. Folding them into one badge is what makes an order
 * history unreadable, and `orderTags` is the one place that decides both.
 */

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();

  return {
    title: `Your orders · ${company.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function MyOrdersPage() {
  const company = await getCompanyDetails();

  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;
  if (!company.features?.customers) notFound();

  const account = await getAccount();

  /* Signed out on a page that is only about you: the sign-in panel is the whole
     answer, and a redirect to `/account` would lose where they were going. */
  if (!account) {
    return (
      <section className="section">
        <div className="container" style={{ maxWidth: '46rem' }}>
          <SignInPanel companyName={company.name} />
        </div>
      </section>
    );
  }

  const orders = await getMyOrders();

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: '46rem' }}>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>Your orders</h1>
            <p className={styles.lede}>Everything you have ordered from {company.name}.</p>
          </div>
          <Link className={styles.quiet} href="/account">
            Your details
          </Link>
        </div>

        {!orders.length ? (
          <p className={styles.empty}>
            You have not ordered anything yet.{' '}
            <Link className={styles.link} href="/products">
              Have a look at what we sell →
            </Link>
          </p>
        ) : (
          <ul className={styles.orders}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} currency={order.currency} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Money, in the currency the **order** was taken in.
 *
 * Not the company's current one: an order is a historical fact, it carries the
 * currency it was placed in, and a shop that switched currency last year must
 * not have its old orders silently re-denominated. `formatMoney` in
 * `catalogue.ts` reads the live company profile, which is right for a price list
 * and wrong here — so this is its own three lines rather than a shared helper
 * bent into a shape it was not built for.
 */
function formatOrderMoney(value: number | null, currency: string): string | null {
  if (value === null || !Number.isFinite(value)) return null;

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    /* An unrecognised currency on one old order must not take the page down. */
    return String(value);
  }
}

/** One order, in the shape somebody scans rather than reads. */
function OrderCard({ order, currency }: { order: CustomerOrder; currency: string }) {
  const money = (value: number | null) => formatOrderMoney(value, currency);

  return (
    <li className={styles.order}>
      <div className={styles.orderHead}>
        <div>
          <div className={styles.orderNo}>{order.orderNo}</div>
          <div className={styles.orderWhen}>
            {new Date(order.createdAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div className={styles.orderTotal}>{money(order.total)}</div>
          {/* Said out loud rather than folded into a total that would quietly
              under-count the order. */}
          {order.unpricedItems > 0 ? (
            <div className={styles.orderWhen}>plus {order.unpricedItems} to be quoted</div>
          ) : null}
        </div>
      </div>

      <p className={styles.state}>{ORDER_STATUS_LABEL[order.status]}</p>

      {order.status === 'cancelled' && order.cancelReason ? (
        <p className={styles.note}>{order.cancelReason}</p>
      ) : null}

      <div className={styles.tags}>
        {orderTags(order).map((tag) => (
          <span
            key={tag.label}
            className={`${styles.pill} ${
              tag.tone === 'whatsapp'
                ? styles.pillWhatsapp
                : tag.tone === 'accent'
                  ? styles.pillAccent
                  : tag.tone === 'good'
                    ? styles.pillGood
                    : tag.tone === 'warn'
                      ? styles.pillWarn
                      : styles.pillBad
            }`}
          >
            {tag.label}
          </span>
        ))}
      </div>

      <ul className={styles.lines}>
        {order.items.map((line) => (
          <li key={line.id} className={styles.line}>
            <span className={styles.lineName}>
              {line.productName} <span className={styles.lineQty}>× {line.quantity}</span>
            </span>
            <span className={styles.lineSum}>
              {/* A null price is not a zero: it is a line priced in words, and it
                  prints as whatever the card said instead. */}
              {line.lineTotal !== null ? money(line.lineTotal) : line.priceLabel || 'On request'}
            </span>
          </li>
        ))}
      </ul>

      {order.customerAddress ? <p className={styles.note}>Delivered to {order.customerAddress}</p> : null}
    </li>
  );
}
