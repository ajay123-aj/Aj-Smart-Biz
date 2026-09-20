import Link from 'next/link';
import Glyph from './Glyph';
import { getSite, type Capability, type Plan } from '@/lib/api';
import {
  billingUnit,
  capabilitiesOf,
  discountPercent,
  formatMoney,
  formatStorage,
  payablePrice,
  plural,
} from '@/lib/format';
import styles from './PlansSection.module.css';

/**
 * The pricing table.
 *
 * Every figure on these cards comes from the API — the price, the discount, the
 * cycle, the limits, and which capabilities the plan switches on. There is no
 * second copy of any of it in this component, and no rupee figure anywhere in
 * this project: a price is changed in the super admin console and nowhere else.
 *
 * Only plans flagged `isPublic` reach this list. The platform also sells plans
 * built for one tenant, and those are not a price list.
 */
export default async function PlansSection({
  eyebrow,
  title,
  lede,
  footnote,
  /** The home page shows the table and links onward; `/plans` *is* the table. */
  showAllLink = false,
}: {
  eyebrow?: string;
  title?: string;
  lede?: string;
  footnote?: string;
  showAllLink?: boolean;
}) {
  const { plans, capabilities } = await getSite();

  if (!plans.length) return null;

  return (
    <section className="section" id="plans">
      <div className="container">
        {/* The whole block goes when there is nothing to put in it — an empty
            `h2` is a heading to a screen reader and a gap to everyone else. */}
        {eyebrow || title || lede ? (
          <header className="section-head">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="section-title">{title}</h2> : null}
            {lede ? <p className="section-lede">{lede}</p> : null}
          </header>
        ) : null}

        <ul className={styles.grid}>
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} catalogue={capabilities} />
          ))}
        </ul>

        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}

        {showAllLink ? (
          <p className={styles.allLink}>
            <Link className="btn btn--ghost" href="/plans">
              Compare the plans in full
              <Glyph name="arrow-right" className={styles.allIcon} />
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One plan.
 *
 * The two lists are different in kind and shown as such:
 *
 *   `highlights`  the sales argument, in the customer's words. Ticked.
 *   `includes`    the capabilities the plan actually switches on, expanded from
 *                 keys into names. Chips, because it is a set to scan rather
 *                 than an argument to read.
 */
function PlanCard({ plan, catalogue }: { plan: Plan; catalogue: Capability[] }) {
  const saving = discountPercent(plan);
  const includes = capabilitiesOf(plan, catalogue);

  return (
    <li className={`card-surface ${styles.card} ${plan.isPopular ? styles.popular : ''}`}>
      {plan.isPopular ? <span className={styles.flag}>Most popular</span> : null}

      <h3 className={styles.name}>{plan.name}</h3>
      <p className={styles.tagline}>{plan.tagline}</p>

      <p className={styles.priceRow}>
        <span className={styles.price}>{formatMoney(payablePrice(plan), plan.currency)}</span>
        <span className={styles.unit}>{billingUnit(plan)}</span>
      </p>

      {/* Only where there is a real discount. `discountPercent` returns null
          when the "discount" is not one, so this cannot print "save 0%". */}
      {saving ? (
        <p className={styles.saving}>
          <s className={styles.wasPrice}>{formatMoney(plan.price, plan.currency)}</s>
          <span className={styles.savingBadge}>save {saving}%</span>
        </p>
      ) : null}

      <dl className={styles.limits}>
        <div>
          <dt>Branches</dt>
          <dd>{plural(plan.limits.branches, 'branch', 'branches')}</dd>
        </div>
        <div>
          <dt>Logins</dt>
          <dd>{plural(plan.limits.logins, 'admin')}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{formatStorage(plan.limits.storageMb)}</dd>
        </div>
      </dl>

      <ul className={styles.features}>
        {plan.highlights.map((line) => (
          <li key={line}>
            <Glyph name="tick" className={styles.tick} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {includes.length ? (
        <div className={styles.includes}>
          <h4 className={styles.includesTitle}>Switched on for you</h4>
          <ul className={styles.chips}>
            {includes.map((item) => (
              /* `title` carries the capability's own one-line summary, so the
                 chip stays short without losing what it means. */
              <li key={item.key} className="chip" title={item.summary}>
                {item.icon ? <Glyph name={item.icon} className={styles.chipIcon} /> : null}
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        The plan rides along in the query string, so the demo form opens with
        this plan already chosen — and the message we receive says which card
        they were looking at. The id is the plan's `code` and is checked
        against the live list on the other side, so a stale or hand-typed one
        falls back to "not sure yet".
      */}
      <div className={styles.ctaSlot}>
        <Link
          className={`btn ${plan.isPopular ? 'btn--primary' : 'btn--ghost'} ${styles.cta}`}
          href={`/demo?plan=${plan.id}`}
        >
          Start with {plan.name}
        </Link>
      </div>
    </li>
  );
}
