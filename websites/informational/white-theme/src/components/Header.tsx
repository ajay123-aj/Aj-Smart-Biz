'use client';

import { useEffect, useState } from 'react';
import { NAV_LINKS } from '@/config/site';
import { toFileUrl, type CompanyDetails } from '@/lib/company';
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
        <a className={styles.brand} href="#home" onClick={() => setMenuOpen(false)}>
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
        </a>

        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} className={styles.navLink} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
          <a className={`btn btn--primary ${styles.navCta}`} href="#contact" onClick={() => setMenuOpen(false)}>
            Enquire now
          </a>
        </nav>

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
