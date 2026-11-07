import Link from 'next/link';
import Glyph from './Glyph';
import CountUp from './CountUp';
import Marquee from './Marquee';
import { getSite } from '@/lib/api';
import { formatMoney, payablePrice } from '@/lib/format';
import { groupCapabilities } from '@/lib/capabilityGroups';
import styles from './Hero.module.css';

/**
 * The first screen, built to answer "what is this?" without reading.
 *
 * Left: the claim, the actions and the assurances. Right: a drawn dashboard
 * that *is* the answer: a browser bar with the visitor's own address, and one
 * coloured tile per feature group (the same colour that group has everywhere
 * else on the site), each naming a few of its real tools. Two floating cards
 * carry the two facts people weigh: how fast, and how much.
 *
 * Everything inside the drawing comes from the API: group membership from
 * `groupCapabilities`, tool names from the capability catalogue, the price
 * from the cheapest public plan. Below the fold, a row of counted facts.
 */
export default async function Hero() {
  const { content, plans, capabilities, businessTypes } = await getSite();
  const hero = content.hero;

  /* What is actually charged; the empty check stops `Math.min()` printing ∞. */
  const cheapest = plans.length ? Math.min(...plans.map(payablePrice)) : null;
  const currency = plans[0]?.currency ?? 'INR';
  const allGroups = groupCapabilities(capabilities);
  const groups = allGroups.slice(0, 4);

  /* One real tool from each group, for the "switched on" notifications that
     cycle over the dashboard. */
  const toasts = allGroups
    .map((group) => ({ tone: group.tone, icon: group.icon, name: group.items[0]?.name }))
    .filter((toast): toast is { tone: typeof toast.tone; icon: string; name: string } => Boolean(toast.name))
    .slice(0, 3);

  const facts = [
    { tone: 'blue', icon: 'bolt', value: '1 day', label: 'to go live' },
    ...(businessTypes.length
      ? [{ tone: 'green', icon: 'briefcase', value: `${businessTypes.length}+`, label: 'business types' }]
      : []),
    ...(capabilities.length
      ? [{ tone: 'orange', icon: 'layers', value: `${capabilities.length}`, label: 'tools included' }]
      : []),
    ...(cheapest !== null
      ? [{ tone: 'purple', icon: 'wallet', value: formatMoney(cheapest, currency), label: 'a month, all in' }]
      : []),
  ];

  return (
    <section className={styles.hero}>
      <div className={styles.bg} aria-hidden="true">
        <span className={styles.orbA} />
        <span className={styles.orbB} />
        <span className={styles.orbC} />
        <span className={styles.grid} />
      </div>

      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          {hero?.eyebrow ? (
            <span className={styles.badge}>
              <span className={styles.badgeNew}>
                <Glyph name="bolt" />
              </span>
              {hero.eyebrow}
            </span>
          ) : null}

          <h1 className={styles.title}>
            {hero?.title} {hero?.titleAccent ? <span className="gradient-text">{hero.titleAccent}</span> : null}
          </h1>

          {hero?.body ? <p className={styles.body}>{hero.body}</p> : null}

          <div className={styles.actions}>
            <Link className="btn btn--primary btn--lg" href={hero?.primaryCta?.href || '/demo'}>
              {hero?.primaryCta?.label || 'Book a free demo'}
              <Glyph name="arrow-right" />
            </Link>
            {hero?.secondaryCta?.href ? (
              <Link className="btn btn--ghost btn--lg" href={hero.secondaryCta.href}>
                {hero.secondaryCta.label}
              </Link>
            ) : null}
          </div>

          {(hero?.assurances ?? []).length ? (
            <ul className={styles.assurances}>
              {(hero?.assurances ?? []).map((line) => (
                <li key={line}>
                  <span className={styles.tick} aria-hidden="true">
                    <Glyph name="tick" />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* The drawing. Decorative chrome is hidden from screen readers; the
            group tiles are real links to the feature section below. */}
        <div className={styles.stage}>
          <div className={styles.blob} aria-hidden="true" />

          <div className={styles.window}>
            <span className={styles.shine} aria-hidden="true" />
            <div className={styles.chrome} aria-hidden="true">
              <span className={styles.dots}>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.url}>
                <Glyph name="lock" />
                yourbusiness.in
              </span>
            </div>

            <div className={styles.screen}>
              <div className={styles.screenHead} aria-hidden="true">
                <span className={styles.logo}>AJ</span>
                <span className={styles.lines}>
                  <i />
                  <i />
                </span>
                <span className={styles.liveDot}>Live</span>
              </div>

              {groups.length ? (
                <ul className={styles.tiles}>
                  {groups.map((group) => (
                    <li key={group.key} data-tone={group.tone}>
                      <a className={styles.tile} href={`#group-${group.key}`}>
                        <span className="icon-tile" aria-hidden="true">
                          <Glyph name={group.icon} />
                        </span>
                        <span className={styles.tileName}>{group.title}</span>
                        <span className={styles.tileTools}>
                          {group.items
                            .slice(0, 2)
                            .map((item) => item.name)
                            .join(' · ')}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {toasts.length ? (
            <ul className={styles.toasts} aria-hidden="true">
              {toasts.map((toast, index) => (
                <li
                  key={toast.name}
                  className={styles.toast}
                  data-tone={toast.tone}
                  style={{ animationDelay: `${index * 3}s` }}
                >
                  <span className={styles.toastIcon}>
                    <Glyph name={toast.icon} />
                  </span>
                  <span>
                    <strong>{toast.name}</strong>
                    <small>Switched on</small>
                  </span>
                  <Glyph name="check" className={styles.toastCheck} />
                </li>
              ))}
            </ul>
          ) : null}

          <div className={`${styles.float} ${styles.floatTop}`} aria-hidden="true">
            <span className={styles.floatIcon} data-tone="green">
              <Glyph name="bolt" />
            </span>
            <span>
              <strong>Live in 1 day</strong>
              <small>We build it for you</small>
            </span>
          </div>

          {cheapest !== null ? (
            <div className={`${styles.float} ${styles.floatBottom}`} aria-hidden="true">
              <span className={styles.floatIcon} data-tone="purple">
                <Glyph name="wallet" />
              </span>
              <span>
                <small>Plans from</small>
                <strong>
                  {formatMoney(cheapest, currency)}
                  <em>/month</em>
                </strong>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="container">
        <ul className={styles.facts}>
          {facts.map((fact) => (
            <li key={fact.label} className={styles.fact} data-tone={fact.tone}>
              <span className="icon-tile" aria-hidden="true">
                <Glyph name={fact.icon} />
              </span>
              <span>
                <strong className={styles.factValue}>
                  <CountUp value={fact.value} />
                </strong>
                <span className={styles.factLabel}>{fact.label}</span>
              </span>
            </li>
          ))}
        </ul>

        <Marquee />
      </div>
    </section>
  );
}
