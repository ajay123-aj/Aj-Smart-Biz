import Link from 'next/link';
import Glyph from './Glyph';
import { getSite } from '@/lib/api';
import styles from './Footer.module.css';

/**
 * The footer: a dark band that closes every page.
 *
 * Four parts, top to bottom:
 *   1. **Brand** — the mark, the tagline, and the one action (book a demo),
 *      beside quick-contact buttons for the three ways to reach us.
 *   2. **Columns** — the site's pages, and every contact detail with an icon.
 *   3. **Wordmark** — the short name, huge and faint, as the visual full stop.
 *   4. **Base** — copyright, where the sites are run from, and "back to top".
 *
 * Every word and link comes from the API (`site` and `contact` in
 * `/website/bootstrap`); a contact line with no value is dropped rather than
 * rendered as a link to nowhere.
 *
 * A server component, unlike the header — nothing in it needs the browser.
 */
export default async function Footer() {
  const { content } = await getSite();
  const site = content.site;
  const contact = content.contact;
  const navLinks = site?.navLinks ?? [];
  const year = new Date().getFullYear();
  const whatsappHref = contact?.whatsapp ? `https://wa.me/${contact.whatsapp}` : null;

  return (
    <footer className={styles.footer}>
      <div className={styles.glow} aria-hidden="true" />

      <div className={`container ${styles.top}`}>
        <div className={styles.about}>
          <Link className={styles.brand} href="/">
            <span className={styles.mark} aria-hidden="true">
              AJ
            </span>
            <span className={styles.brandText}>{site?.name}</span>
          </Link>
          {site?.tagline ? <p className={styles.tagline}>{site.tagline}</p> : null}

          <div className={styles.actions}>
            <Link className={`btn ${styles.demo}`} href="/demo">
              Book a free demo
              <Glyph name="arrow-right" />
            </Link>

            <div className={styles.quick} role="group" aria-label="Contact us">
              {whatsappHref ? (
                <a
                  className={styles.quickBtn}
                  data-kind="whatsapp"
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp us"
                  title="WhatsApp"
                >
                  <Glyph name="message-circle" />
                </a>
              ) : null}
              {contact?.phoneHref ? (
                <a
                  className={styles.quickBtn}
                  data-kind="phone"
                  href={`tel:${contact.phoneHref}`}
                  aria-label={`Call ${contact.phone ?? contact.phoneHref}`}
                  title="Call"
                >
                  <Glyph name="phone" />
                </a>
              ) : null}
              {contact?.email ? (
                <a
                  className={styles.quickBtn}
                  data-kind="mail"
                  href={`mailto:${contact.email}`}
                  aria-label={`Email ${contact.email}`}
                  title="Email"
                >
                  <Glyph name="mail" />
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <nav className={styles.column} aria-label="Footer">
          <h2 className={styles.columnTitle}>Explore</h2>
          <ul className={styles.links}>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link className={styles.link} href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className={styles.link} href="/demo">
                Book a demo
              </Link>
            </li>
          </ul>
        </nav>

        <div className={styles.column}>
          <h2 className={styles.columnTitle}>Talk to us</h2>
          <ul className={styles.contacts}>
            {contact?.phoneHref ? (
              <li>
                <span className={styles.contactIcon} aria-hidden="true">
                  <Glyph name="phone" />
                </span>
                <a className={styles.link} href={`tel:${contact.phoneHref}`}>
                  {contact.phone ?? contact.phoneHref}
                </a>
              </li>
            ) : null}
            {contact?.email ? (
              <li>
                <span className={styles.contactIcon} aria-hidden="true">
                  <Glyph name="mail" />
                </span>
                <a className={styles.link} href={`mailto:${contact.email}`}>
                  {contact.email}
                </a>
              </li>
            ) : null}
            {whatsappHref ? (
              <li>
                <span className={styles.contactIcon} aria-hidden="true">
                  <Glyph name="message-circle" />
                </span>
                {/* `noopener` is not optional on a `_blank` link. */}
                <a className={styles.link} href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  WhatsApp us
                </a>
              </li>
            ) : null}
            {contact?.addressLine ? (
              <li>
                <span className={styles.contactIcon} aria-hidden="true">
                  <Glyph name="map-pin" />
                </span>
                <span>{contact.addressLine}</span>
              </li>
            ) : null}
            {contact?.hours ? (
              <li>
                <span className={styles.contactIcon} aria-hidden="true">
                  <Glyph name="clock" />
                </span>
                <span>{contact.hours}</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* The full stop: the short name, huge and faint. Decoration only. */}
      {site?.shortName || site?.name ? (
        <div className={styles.wordmark} aria-hidden="true">
          {site?.shortName ?? site?.name}
        </div>
      ) : null}

      <div className={`container ${styles.base}`}>
        <p>
          © {year} {site?.name}. All rights reserved.
        </p>
        <p className={styles.baseNote}>
          <span className={styles.liveDot} aria-hidden="true" />
          Websites built, hosted and looked after in India.
        </p>
        <a className={styles.toTop} href="#main">
          Back to top
          <Glyph name="arrow-right" className={styles.toTopIcon} />
        </a>
      </div>
    </footer>
  );
}
