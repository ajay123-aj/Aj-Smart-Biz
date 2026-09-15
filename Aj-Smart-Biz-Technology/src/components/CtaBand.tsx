import Link from 'next/link';
import Glyph from './Glyph';
import { CONTACT, CTA } from '@/config/site';
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
export default function CtaBand() {
  return (
    <section className="section">
      <div className="container">
        <div className={styles.band}>
          <div className={styles.copy}>
            <span className="eyebrow">{CTA.eyebrow}</span>
            <h2 className={styles.title}>{CTA.title}</h2>
            <p className={styles.body}>{CTA.body}</p>
          </div>

          <div className={styles.actions}>
            <Link className="btn btn--primary" href={CTA.primary.href}>
              {CTA.primary.label}
              <Glyph name="arrow-right" className={styles.icon} />
            </Link>
            <a className="btn btn--ghost" href={`tel:${CONTACT.phoneHref}`}>
              <Glyph name="phone" className={styles.icon} />
              {CONTACT.phone}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
