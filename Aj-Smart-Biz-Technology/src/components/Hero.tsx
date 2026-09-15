import Link from 'next/link';
import Glyph from './Glyph';
import { HERO } from '@/config/site';
import { BUSINESS_TYPES } from '@/content/business-types';
import { CAPABILITIES } from '@/content/capabilities';
import { PLANS } from '@/content/plans';
import { formatMoney, payablePrice } from '@/lib/format';
import styles from './Hero.module.css';

/**
 * The first screen.
 *
 * Two columns: the claim on the left, and on the right a stylised browser frame
 * that is the **only picture on this site**. There is no photograph and no
 * screenshot of a real customer's website anywhere in this project, and that is
 * a decision rather than an omission — a screenshot is a promise about design,
 * and the promise this business makes is about the *running* of it. A frame
 * with four facts in it says the right thing and never goes out of date.
 *
 * The four facts are derived from the content files rather than typed here, so
 * adding a trade or a capability updates the hero without anybody remembering
 * to. The cheapest plan's price is read the same way: there is exactly one
 * place a rupee figure lives, and it is `content/plans.ts`.
 */
export default function Hero() {
  /**
   * The cheapest plan, by what is actually charged.
   *
   * `payablePrice` rather than `price`, so a discounted plan cannot be beaten
   * in the hero by a cheaper plan that is dearer once the discount applies.
   * `Math.min` on an empty array returns `Infinity`, so the list is checked
   * first — a content file emptied by accident should not print "₹∞".
   */
  const cheapest = PLANS.length ? Math.min(...PLANS.map(payablePrice)) : null;
  const currency = PLANS[0]?.currency ?? 'INR';

  const tiles = [
    { value: '1 day', label: 'to go live' },
    { value: `${BUSINESS_TYPES.length}+`, label: 'kinds of business' },
    { value: `${CAPABILITIES.length}`, label: 'features to switch on' },
    ...(cheapest !== null
      ? [{ value: formatMoney(cheapest, currency), label: 'a month, all in' }]
      : []),
  ];

  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className="eyebrow">{HERO.eyebrow}</span>

          {/*
            One gradient phrase per page, and it is always the payload of the
            sentence — "online by tomorrow" here, because that is the claim
            somebody is actually weighing.
          */}
          <h1 className={styles.title}>
            {HERO.title} <span className="gradient-text">{HERO.titleAccent}</span>
          </h1>

          <p className={styles.body}>{HERO.body}</p>

          <div className={styles.actions}>
            <Link className="btn btn--primary" href={HERO.primaryCta.href}>
              {HERO.primaryCta.label}
              <Glyph name="arrow-right" className={styles.btnIcon} />
            </Link>
            <Link className="btn btn--ghost" href={HERO.secondaryCta.href}>
              {HERO.secondaryCta.label}
            </Link>
          </div>

          <ul className={styles.assurances}>
            {HERO.assurances.map((line) => (
              <li key={line}>
                <Glyph name="check" className={styles.tick} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/*
          The frame.

          `aria-hidden` on the chrome — the dots and the fake address bar are
          decoration and announcing them is noise — but **not** on the tiles,
          which carry real claims and are the only place two of them appear.
        */}
        <div className={styles.stage}>
          <div className={styles.frame}>
            <div className={styles.chrome} aria-hidden="true">
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.url}>yourbusiness.in</span>
            </div>

            <div className={styles.screen}>
              <div className={styles.screenBrand} aria-hidden="true">
                <span className={styles.screenMark} />
                <span className={styles.screenLines}>
                  <i />
                  <i />
                </span>
              </div>

              <dl className={styles.tiles}>
                {tiles.map((tile) => (
                  <div key={tile.label} className={styles.tile}>
                    <dt className={styles.tileValue}>{tile.value}</dt>
                    <dd className={styles.tileLabel}>{tile.label}</dd>
                  </div>
                ))}
              </dl>

              <div className={styles.screenFoot} aria-hidden="true">
                <span className={styles.screenPill} />
                <span className={styles.screenPillGhost} />
              </div>
            </div>
          </div>

          {/* Clipped to the frame's corner. The one moment of swagger on the
              page, and it is a claim the four steps then explain. */}
          <span className={styles.badge}>
            <Glyph name="bolt" className={styles.badgeIcon} />
            Live in one working day
          </span>
        </div>
      </div>
    </section>
  );
}
