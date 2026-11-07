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
import { groupCapabilities } from '@/lib/capabilityGroups';
import styles from './PlansSection.module.css';

/**
 * The pricing cards, and (with `compare`) a side-by-side table underneath.
 *
 * Every figure comes from the API: price, discount, cycle, limits, and which
 * capabilities each plan switches on. No rupee figure lives in this project.
 */
export default async function PlansSection({
  eyebrow,
  title,
  lede,
  footnote,
  showAllLink = false,
  compare = false,
  alt = false,
}: {
  eyebrow?: string;
  title?: string;
  lede?: string;
  footnote?: string;
  showAllLink?: boolean;
  compare?: boolean;
  alt?: boolean;
}) {
  const { plans, capabilities } = await getSite();

  if (!plans.length) return null;

  return (
    <section className={`section ${alt ? 'section--alt' : ''}`} id="plans">
      <div className="container">
        {eyebrow || title || lede ? (
          <header className="section-head section-head--center">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="section-title">{title}</h2> : null}
            {lede ? <p className="section-lede">{lede}</p> : null}
          </header>
        ) : null}

        <ul className={styles.grid} style={{ ['--plans' as string]: Math.min(plans.length, 4) }}>
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} catalogue={capabilities} />
          ))}
        </ul>

        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}

        {compare ? <CompareTable plans={plans} catalogue={capabilities} /> : null}

        {showAllLink ? (
          <p className={styles.allLink}>
            <Link className="btn btn--ghost" href="/plans#compare">
              Compare every feature, plan by plan
              <Glyph name="arrow-right" />
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** How many highlights a card shows before "Show details". */
const TOP_HIGHLIGHTS = 3;

function PlanCard({ plan, catalogue }: { plan: Plan; catalogue: Capability[] }) {
  const saving = discountPercent(plan);
  const includes = capabilitiesOf(plan, catalogue);
  const topHighlights = plan.highlights.slice(0, TOP_HIGHLIGHTS);
  const moreHighlights = plan.highlights.slice(TOP_HIGHLIGHTS);

  return (
    <li className={`${styles.card} ${plan.isPopular ? styles.popular : ''}`}>
      {plan.isPopular ? <span className={styles.flag}>Most popular</span> : null}

      <h3 className={styles.name}>{plan.name}</h3>
      {plan.tagline ? <p className={styles.tagline}>{plan.tagline}</p> : null}

      <p className={styles.priceRow}>
        <span className={styles.price}>{formatMoney(payablePrice(plan), plan.currency)}</span>
        <span className={styles.unit}>{billingUnit(plan)}</span>
      </p>

      {saving ? (
        <p className={styles.saving}>
          <s className={styles.wasPrice}>{formatMoney(plan.price, plan.currency)}</s>
          <span className={styles.savingBadge}>Save {saving}%</span>
        </p>
      ) : (
        <p className={styles.saving} aria-hidden="true">
          &nbsp;
        </p>
      )}

      {/* The plan rides along so the demo form opens with it chosen. */}
      <Link
        className={`btn ${plan.isPopular ? 'btn--primary' : 'btn--ghost'} ${styles.cta}`}
        href={`/demo?plan=${plan.id}`}
      >
        Start with {plan.name}
      </Link>

      {/* At a glance: the top highlights and one line of key facts. */}
      {topHighlights.length ? (
        <ul className={styles.features}>
          {topHighlights.map((line) => (
            <li key={line}>
              <Glyph name="tick" className={styles.tick} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.keyFacts}>
        {includes.length ? (
          <span>
            <strong>{includes.length}</strong> {includes.length === 1 ? 'tool' : 'tools'}
          </span>
        ) : null}
        <span>{plural(plan.limits.branches, 'branch', 'branches')}</span>
        <span>{plural(plan.limits.logins, 'admin')}</span>
      </p>

      {/*
        Everything else, one click away. Native <details>: works without
        JavaScript, is keyboard- and screen-reader-friendly, and Ctrl-F still
        finds text inside it.
      */}
      <details className={styles.details}>
        <summary className={styles.detailsToggle}>
          <span className={styles.showLabel}>Show details</span>
          <span className={styles.hideLabel}>Hide details</span>
          <Glyph name="arrow-right" className={styles.detailsIcon} />
        </summary>

        <div className={styles.detailsBody}>
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

          {moreHighlights.length ? (
            <ul className={styles.features}>
              {moreHighlights.map((line) => (
                <li key={line}>
                  <Glyph name="tick" className={styles.tick} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {includes.length ? (
            <div className={styles.includes}>
              <h4 className={styles.includesTitle}>
                {includes.length} {includes.length === 1 ? 'tool' : 'tools'} included
              </h4>
              <ul className={styles.chips}>
                {includes.map((item) => (
                  <li key={item.key} className="chip" title={item.summary}>
                    <Glyph name={item.icon} className={styles.chipIcon} />
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/**
 * Feature × plan matrix. Rows are the live capability catalogue, grouped the
 * same way as the rest of the site; a tick means the plan's `includes` lists
 * that key. Scrolls sideways on a phone with the feature column pinned.
 */
function CompareTable({ plans, catalogue }: { plans: Plan[]; catalogue: Capability[] }) {
  const groups = groupCapabilities(catalogue);
  const sets = new Map(plans.map((plan) => [plan.id, new Set(plan.includes)]));

  return (
    <div className={styles.compare} id="compare">
      <h3 className={styles.compareTitle}>Compare plans</h3>
      <div className={styles.tableWrap} role="region" aria-label="Plan comparison" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.featureCol}>
                Feature
              </th>
              {plans.map((plan) => (
                <th key={plan.id} scope="col" className={plan.isPopular ? styles.popularCol : undefined}>
                  <span className={styles.thName}>{plan.name}</span>
                  <span className={styles.thPrice}>
                    {formatMoney(payablePrice(plan), plan.currency)}
                    <small> {billingUnit(plan)}</small>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr className={styles.groupRow}>
              <th scope="colgroup" colSpan={plans.length + 1}>
                Limits
              </th>
            </tr>
            <tr>
              <th scope="row">Branches</th>
              {plans.map((plan) => (
                <td key={plan.id}>{plan.limits.branches}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Admin logins</th>
              {plans.map((plan) => (
                <td key={plan.id}>{plan.limits.logins}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Storage</th>
              {plans.map((plan) => (
                <td key={plan.id}>{formatStorage(plan.limits.storageMb)}</td>
              ))}
            </tr>
          </tbody>

          {groups.map((group) => (
            <tbody key={group.key}>
              <tr className={styles.groupRow}>
                <th scope="colgroup" colSpan={plans.length + 1}>
                  {group.title}
                </th>
              </tr>
              {group.items.map((capability) => (
                <tr key={capability.key}>
                  <th scope="row" title={capability.summary}>
                    {capability.name}
                  </th>
                  {plans.map((plan) =>
                    sets.get(plan.id)?.has(capability.key) ? (
                      <td key={plan.id}>
                        <Glyph name="tick" className={styles.yes} />
                        <span className="sr-only">Included</span>
                      </td>
                    ) : (
                      <td key={plan.id}>
                        <span className={styles.no} aria-hidden="true">
                          —
                        </span>
                        <span className="sr-only">Not included</span>
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          ))}

          <tfoot>
            <tr>
              <th scope="row" />
              {plans.map((plan) => (
                <td key={plan.id}>
                  <Link
                    className={`btn ${plan.isPopular ? 'btn--primary' : 'btn--ghost'} ${styles.tableCta}`}
                    href={`/demo?plan=${plan.id}`}
                  >
                    Choose
                    <span className="sr-only"> {plan.name}</span>
                  </Link>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
