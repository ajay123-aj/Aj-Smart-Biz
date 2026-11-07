'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Glyph from './Glyph';
import type { NavLink } from '@/lib/api';
import styles from './Header.module.css';

/**
 * The sticky top bar: brand, the API's nav links, the phone number and one
 * primary action. On narrow screens the links, phone and action fold into a
 * sheet behind a menu button.
 *
 * A client component for the scroll state, the Escape key and closing the sheet
 * on navigation. The layout hands it only what it renders.
 */
export default function Header({
  shortName,
  navLinks,
  phone,
  phoneHref,
}: {
  shortName?: string;
  navLinks: NavLink[];
  phone?: string;
  phoneHref?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Close the sheet whenever the route changes (links, back button, anything). */
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

  const phoneLabel = phone ?? phoneHref;

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href="/">
          <span className={styles.mark} aria-hidden="true">
            AJ
          </span>
          <span className={styles.brandText}>{shortName}</span>
        </Link>

        <nav id="primary-nav" className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`} aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              className={styles.navLink}
              href={link.href}
              /* `/` would otherwise be current on every page. */
              aria-current={
                (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)) ? 'page' : undefined
              }
            >
              {link.label}
            </Link>
          ))}

          {/* Only shown inside the mobile sheet, where the bar's own phone and
              button are hidden. */}
          <div className={styles.sheetActions}>
            {phoneHref ? (
              <a className="btn btn--ghost" href={`tel:${phoneHref}`}>
                <Glyph name="phone" />
                Call {phoneLabel}
              </a>
            ) : null}
            <Link className="btn btn--primary" href="/demo">
              Book a free demo
            </Link>
          </div>
        </nav>

        {phoneHref ? (
          <a className={styles.phone} href={`tel:${phoneHref}`} aria-label={`Call ${phoneLabel}`}>
            <span className={styles.phoneIcon} aria-hidden="true">
              <Glyph name="phone" />
            </span>
            <span className={styles.phoneText}>{phoneLabel}</span>
          </a>
        ) : null}

        <Link className={`btn btn--primary ${styles.cta}`} href="/demo">
          Book a free demo
        </Link>

        <button
          type="button"
          className={styles.toggle}
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
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
