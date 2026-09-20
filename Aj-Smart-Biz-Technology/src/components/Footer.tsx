import Link from 'next/link';
import { getSite } from '@/lib/api';
import styles from './Footer.module.css';

/**
 * The footer.
 *
 * A server component, unlike the header — nothing in it needs the browser, and
 * keeping it off the client bundle is free. That is also why it reads the API
 * directly while the header has to be handed its half through props.
 */
export default async function Footer() {
  const { content } = await getSite();
  const site = content.site;
  const contact = content.contact;
  const navLinks = site?.navLinks ?? [];
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.about}>
          <Link className={styles.brand} href="/">
            <span className={styles.mark} aria-hidden="true">
              AJ
            </span>
            <span className={styles.brandText}>{site?.name}</span>
          </Link>
          <p className={styles.tagline}>{site?.tagline}</p>
          <p className={styles.address}>{contact?.addressLine}</p>
        </div>

        <nav className={styles.column} aria-label="Footer">
          <h2 className={styles.columnTitle}>Site</h2>
          {navLinks.map((link) => (
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
          {contact?.phoneHref ? (
            <a className={styles.link} href={`tel:${contact.phoneHref}`}>
              {contact.phone ?? contact.phoneHref}
            </a>
          ) : null}
          {contact?.email ? (
            <a className={styles.link} href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          ) : null}
          {contact?.whatsapp ? (
            <a
              className={styles.link}
              href={`https://wa.me/${contact.whatsapp}`}
              target="_blank"
              /* `noopener` is not optional on a `_blank` link: without it the
                 page that opens gets a handle on this one through
                 `window.opener`. */
              rel="noopener noreferrer"
            >
              WhatsApp us
            </a>
          ) : null}
          <p className={styles.hours}>{contact?.hours}</p>
        </div>
      </div>

      <div className={`container ${styles.base}`}>
        <p>
          © {year} {site?.name}
        </p>
        <p className={styles.baseNote}>Websites built, hosted and looked after in India.</p>
      </div>
    </footer>
  );
}
