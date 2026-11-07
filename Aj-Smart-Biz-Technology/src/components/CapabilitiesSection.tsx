import Link from 'next/link';
import Glyph from './Glyph';
import GroupArt from './GroupArt';
import { getSite } from '@/lib/api';
import { groupCapabilities } from '@/lib/capabilityGroups';
import styles from './CapabilitiesSection.module.css';

/**
 * What a business gets, grouped by outcome (Your website / Sell online /
 * Stock & billing / Leads & customers), each group in its own colour.
 *
 * Two layouts:
 *   - **compact** (home): one coloured card per group, its tools listed by
 *     name with ticks. Four cards answer "what do I get?" in one glance.
 *   - **detailed** (Services): every tool as its own card with the summary
 *     and long description, under a coloured group heading.
 *
 * The capabilities are the API's live catalogue — the same list the plans
 * refer to by key — so a feature added in the backend appears here with no
 * change to this site. Each group keeps the `#group-<key>` anchor the hero's
 * tiles link to.
 */
export default async function CapabilitiesSection({
  eyebrow,
  title,
  lede,
  detailed = false,
  alt = false,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  detailed?: boolean;
  alt?: boolean;
}) {
  const { capabilities } = await getSite();
  const groups = groupCapabilities(capabilities);

  if (!groups.length) return null;

  return (
    <section className={`section ${alt ? 'section--alt' : ''}`} id="capabilities">
      <div className="container">
        <header className="section-head section-head--center">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2 className="section-title">{title}</h2>
          {lede ? <p className="section-lede">{lede}</p> : null}
        </header>

        {detailed ? (
          <>
            <nav className={styles.jump} aria-label="Feature groups">
              {groups.map((group) => (
                <a key={group.key} className={styles.jumpLink} href={`#group-${group.key}`} data-tone={group.tone}>
                  <Glyph name={group.icon} />
                  {group.title}
                  <span className={styles.jumpCount}>{group.items.length}</span>
                </a>
              ))}
            </nav>

            <div className={styles.groups}>
              {groups.map((group) => (
                <section
                  key={group.key}
                  id={`group-${group.key}`}
                  className={styles.group}
                  data-tone={group.tone}
                  aria-labelledby={`group-${group.key}-title`}
                >
                  <header className={styles.groupHead}>
                    <span className="icon-tile" aria-hidden="true">
                      <Glyph name={group.icon} />
                    </span>
                    <div>
                      <h3 id={`group-${group.key}-title`} className={styles.groupTitle}>
                        {group.title}
                      </h3>
                      <p className={styles.groupSummary}>{group.summary}</p>
                    </div>
                  </header>

                  <ul className={styles.grid}>
                    {group.items.map((capability) => (
                      <li key={capability.key} className={styles.card}>
                        <span className={styles.icon} aria-hidden="true">
                          <Glyph name={capability.icon} />
                        </span>
                        <div>
                          <h4 className={styles.title}>{capability.name}</h4>
                          <p className={styles.summary}>{capability.summary}</p>
                          {capability.description ? (
                            <p className={styles.description}>{capability.description}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <ul className={styles.compact}>
              {groups.map((group) => (
                <li
                  key={group.key}
                  id={`group-${group.key}`}
                  className={styles.groupCard}
                  data-tone={group.tone}
                >
                  <GroupArt group={group.key} labels={group.items.slice(0, 3).map((item) => item.name)} />
                  <div className={styles.groupCardBody}>
                  <div className={styles.groupCardHead}>
                    <span className="icon-tile" aria-hidden="true">
                      <Glyph name={group.icon} />
                    </span>
                    <span className={styles.groupCount}>
                      {group.items.length} {group.items.length === 1 ? 'tool' : 'tools'}
                    </span>
                  </div>
                  <h3 className={styles.groupCardTitle}>{group.title}</h3>
                  <p className={styles.groupCardSummary}>{group.summary}</p>
                  </div>
                  <ul className={styles.toolList}>
                    {group.items.map((capability) => (
                      <li key={capability.key} title={capability.summary}>
                        <Glyph name="tick" className={styles.toolTick} />
                        {capability.name}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <p className={styles.more}>
              <Link className="btn btn--ghost" href="/services">
                See what each tool does
                <Glyph name="arrow-right" />
              </Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
