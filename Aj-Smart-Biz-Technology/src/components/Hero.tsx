import Link from 'next/link';
import Glyph from './Glyph';
import { getSite } from '@/lib/api';
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
 * The four facts are counted from what the API returns rather than typed here,
 * so adding a trade or a capability updates the hero without anybody
 * remembering to. The cheapest plan's price is read the same way: there is no
 * rupee figure anywhere in this project.
 */
export default async function Hero() {
  const { content, plans, capabilities, businessTypes } = await getSite();
  const hero = content.hero;

  /**
   * The cheapest plan, by what is actually charged.
   *
   * `payablePrice` rather than `price`, so a discounted plan cannot be beaten
   * in the hero by a cheaper plan that is dearer once the discount applies.
   * `Math.min` on an empty array returns `Infinity`, so the list is checked
   * first — a content file emptied by accident should not print "₹∞".
   */
  const cheapest = plans.length ? Math.min(...plans.map(payablePrice)) : null;
  const currency = plans[0]?.currency ?? 'INR';

  const tiles = [
    { value: '1 day', label: 'to go live' },
    ...(businessTypes.length
      ? [{ value: `${businessTypes.length}+`, label: 'kinds of business' }]
      : []),
    ...(capabilities.length
      ? [{ value: `${capabilities.length}`, label: 'features to switch on' }]
      : []),
    ...(cheapest !== null
      ? [{ value: formatMoney(cheapest, currency), label: 'a month, all in' }]
      : []),
  ];

  return (
    <section className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className="eyebrow">{hero?.eyebrow}</span>

          {/*
            One gradient phrase per page, and it is always the payload of the
            sentence — "online by tomorrow" here, because that is the claim
            somebody is actually weighing.
          */}
          <h1 className={styles.title}>
            {hero?.title} <span className="gradient-text">{hero?.titleAccent}</span>
          </h1>

          <p className={styles.body}>{hero?.body}</p>

          <div className={styles.actions}>
            {hero?.primaryCta?.href ? (
              <Link className="btn btn--primary" href={hero.primaryCta.href}>
                {hero.primaryCta.label}
                <Glyph name="arrow-right" className={styles.btnIcon} />
              </Link>
            ) : null}
            {hero?.secondaryCta?.href ? (
              <Link className="btn btn--ghost" href={hero.secondaryCta.href}>
                {hero.secondaryCta.label}
              </Link>
            ) : null}
          </div>

          <ul className={styles.assurances}>
            {(hero?.assurances ?? []).map((line) => (
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
