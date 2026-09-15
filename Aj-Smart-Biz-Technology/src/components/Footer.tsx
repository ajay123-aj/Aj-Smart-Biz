import Link from 'next/link';
import { CONTACT, NAV_LINKS, SITE } from '@/config/site';
import styles from './Footer.module.css';

/**
 * The footer.
 *
 * A server component, unlike the header — nothing in it needs the browser, and
 * keeping it off the client bundle is free.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.about}>
          <Link className={styles.brand} href="/">
            <span className={styles.mark} aria-hidden="true">
              AJ
            </span>
            <span className={styles.brandText}>{SITE.name}</span>
          </Link>
          <p className={styles.tagline}>{SITE.tagline}</p>
          <p className={styles.address}>{CONTACT.addressLine}</p>
        </div>

        <nav className={styles.column} aria-label="Footer">
          <h2 className={styles.columnTitle}>Site</h2>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} className={styles.link} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link className={styles.link} href="/demo">
            Book a demo
          </Link>
        </nav>

        <div className={styles.column}>
          <h2 className={styles.columnTitle}>Talk to us</h2>
          <a className={styles.link} href={`tel:${CONTACT.phoneHref}`}>
            {CONTACT.phone}
          </a>
          <a className={styles.link} href={`mailto:${CONTACT.email}`}>
            {CONTACT.email}
          </a>
          <a
            className={styles.link}
            href={`https://wa.me/${CONTACT.whatsapp}`}
            target="_blank"
            /* `noopener` is not optional on a `_blank` link: without it the page
               that opens gets a handle on this one through `window.opener`. */
            rel="noopener noreferrer"
          >
            WhatsApp us
          </a>
          <p className={styles.hours}>{CONTACT.hours}</p>
        </div>
      </div>

      <div className={`container ${styles.base}`}>
        <p>
          © {year} {SITE.name}
        </p>
        <p className={styles.baseNote}>Websites built, hosted and looked after in India.</p>
      </div>
    </footer>
  );
}
