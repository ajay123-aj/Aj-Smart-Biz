import type { Metadata } from 'next';
import Glyph from '@/components/Glyph';
import StepsSection from '@/components/StepsSection';
import CtaBand from '@/components/CtaBand';
import { getSite } from '@/lib/api';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'Aj Smart Biz Technology builds and runs business websites on a monthly recharge — hosting, domain, security, backups and every edit included.',
};

/**
 * Who this is and why it works the way it does.
 *
 * The one page on the site that is mostly prose rather than cards, and that is
 * correct: it is an argument, and an argument is writing. The only thing to get
 * right here is the measure — see `.prose`.
 *
 * There is deliberately **no** band of round numbers ("500+ happy clients").
 * Every number on this site is either a price or something countable from what
 * the API returns; a customer count is neither, and a page about being honest
 * with people is the last place to put a figure nobody counted.
 */
export default async function AboutPage() {
  const { content } = await getSite();
  const page = content.about_page;
  const body = page?.body ?? [];
  const values = page?.values ?? [];

  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{page?.eyebrow}</span>
          <h1 className={styles.title}>{page?.title}</h1>
          <p className={styles.lede}>{page?.lede}</p>
        </div>
      </section>

      <section className={styles.bodySection}>
        <div className="container">
          <div className={styles.prose}>
            {body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--panel">
        <div className="container">
          <header className="section-head">
            <h2 className="section-title">{page?.valuesTitle}</h2>
          </header>

          <ul className={styles.values}>
            {values.map((value) => (
              <li key={value.title} className={styles.value}>
                {value.icon ? (
                  <span className={styles.valueIcon} aria-hidden="true">
                    <Glyph name={value.icon} />
                  </span>
                ) : null}
                <div>
                  <h3 className={styles.valueTitle}>{value.title}</h3>
                  <p className={styles.valueBody}>{value.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <StepsSection />

      <CtaBand />
    </>
  );
}
