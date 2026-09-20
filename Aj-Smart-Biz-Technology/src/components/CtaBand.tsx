import Link from 'next/link';
import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import styles from './CtaBand.module.css';

/**
 * The band that closes every page.
 *
 * One block of copy for the whole site rather than a different pitch per page:
 * a site that ends on a different promise from the one it opened with is a site
 * that has argued with itself.
 *
 * It carries the phone number as well as the button, because a proportion of
 * people who have read this far would rather call than fill anything in, and
 * making them hunt through the footer for it loses them.
 */
export default async function CtaBand() {
  const { content } = await getSite();
  const cta = content.cta;
  const contact = content.contact;

  if (!cta?.title) return null;

  return (
    <section className="section">
      <div className="container">
        <div className={styles.band}>
          <div className={styles.copy}>
            <span className="eyebrow">{cta.eyebrow}</span>
            <h2 className={styles.title}>{cta.title}</h2>
            <p className={styles.body}>{cta.body}</p>
          </div>

          <div className={styles.actions}>
            {cta.primary?.href ? (
              <Link className="btn btn--primary" href={cta.primary.href}>
                {cta.primary.label}
                <Glyph name="arrow-right" className={styles.icon} />
              </Link>
            ) : null}

            {/* Dropped rather than rendered as `tel:` with nothing after it —
                a button that dials silence is worse than no button. */}
            {contact?.phoneHref ? (
              <a className="btn btn--ghost" href={`tel:${contact.phoneHref}`}>
                <Glyph name="phone" className={styles.icon} />
                {contact.phone ?? contact.phoneHref}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
