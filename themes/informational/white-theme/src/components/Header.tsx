'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { navOf, toFileUrl, type CompanyDetails } from '@/lib/company';
import WhatsAppButton from './WhatsAppButton';
import CartButton from './CartButton';
import styles from './Header.module.css';

/**
 * Sticky white header. The mark on the left is the company's own logo when the
 * domain resolved to a tenant that has uploaded one; otherwise it falls back to
 * the first letter of the name, so the header is never empty.
 */
export default function Header({ company }: { company: CompanyDetails }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const logo = toFileUrl(company.logo);
  const branchName = company.branch?.name;

  // A hairline turns into a shadow once the page moves, so the header stays
  // readable over the slider.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The mobile sheet must not stay open behind a section the visitor jumped to.
  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.brand} href="/" onClick={() => setMenuOpen(false)}>
          {logo ? (
            // Not next/image: the file origin is configured per deployment and a
            // plain img keeps the header working when it is not.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.logo} src={logo} alt={`${company.name} logo`} />
          ) : (
            <span className={styles.logoFallback} aria-hidden="true">
              {company.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className={styles.brandText}>
            <span className={styles.brandName}>{company.name}</span>
            {branchName ? <span className={styles.brandBranch}>{branchName}</span> : null}
          </span>
        </Link>

        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`} aria-label="Primary">
          {/* next/link throughout: the bar mixes a route (`/about`) with
              anchors on another page (`/#services`), and Link handles both
              without a full reload. */}
          {/* Straight from the API: pages the tenant is not publishing are
              already absent from it, and each is named the way they named it. */}
          {navOf(company).map((link) => (
            <Link key={link.key} className={styles.navLink} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
          {/* Renders nothing unless the tenant's plan includes WhatsApp and it
              is switched on — the same rule everywhere it appears. */}
        </nav>

        {/*
          The three personal actions, grouped and pinned to the right.

          None of them is a *place on the site* — they are things about you and
          about this moment: talk to us, what you are buying, who you are. That is
          why they sit apart from the navigation rather than at the end of it, and
          why they stay reachable when the mobile menu is shut.

          **Icons only, no words.** Three labelled buttons beside a menu is four
          competing calls to action in one bar; the glyphs are universally
          understood, and each carries a real `aria-label` and a `title`, so what
          is dropped is the visual noise rather than the meaning.
        */}
        <div className={styles.actions}>
          <WhatsAppButton
            company={company}
            type="contact"
            label="WhatsApp"
            iconOnly
            className={styles.action}
          />

          {company.features?.customers ? (
            <Link
              className={styles.action}
              href="/account"
              aria-label="Your account"
              title="Your account"
              onClick={() => setMenuOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
                aria-hidden="true"
              >
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
              </svg>
            </Link>
          ) : null}

          <CartButton className={styles.action} />
        </div>

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
