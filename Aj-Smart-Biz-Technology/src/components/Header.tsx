'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTACT, NAV_LINKS, SITE } from '@/config/site';
import styles from './Header.module.css';

/**
 * The floating glass bar.
 *
 * A client component for three things that need the browser: the scroll state,
 * the escape key, and closing the mobile sheet when the route changes. The nav
 * itself is a constant — this site has one owner and five pages, both known at
 * build time — so nothing is threaded in from the layout.
 */
export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  /**
   * The bar gains a stronger edge and a deeper shadow once the page moves.
   *
   * Without it the header is a pane of glass over the hero's own glass and the
   * two are indistinguishable until something scrolls underneath.
   */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /**
   * Close the sheet whenever the route changes.
   *
   * Watching the path rather than putting an `onClick` on every link: that
   * would miss the back button, and it would miss any link added to the sheet
   * later. This catches everything that moves the router.
   */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href="/">
          <span className={styles.mark} aria-hidden="true">
            AJ
          </span>
          <span className={styles.brandText}>{SITE.shortName}</span>
        </Link>

        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              className={styles.navLink}
              href={link.href}
              /* `/` would otherwise be marked current on every page, since
                 every path starts with it. */
              aria-current={
                (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)) ? 'page' : undefined
              }
            >
              {link.label}
            </Link>
          ))}

          {/* Inside the nav so it is reachable in the mobile sheet, where the
              desktop call-to-action beside it is hidden. */}
          <a className={styles.navPhone} href={`tel:${CONTACT.phoneHref}`}>
            {CONTACT.phone}
          </a>
        </nav>

        <Link className={`btn btn--primary ${styles.cta}`} href="/demo">
          Book a free demo
        </Link>

        <button
          type="button"
          className={styles.toggle}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={`${styles.bar} ${menuOpen ? styles.barTop : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barMid : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barBottom : ''}`} />
        </button>
      </div>
    </header>
  );
}
