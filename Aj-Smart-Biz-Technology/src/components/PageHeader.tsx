import Link from 'next/link';
import type { ReactNode } from 'react';
import { jsonLd, siteUrl } from '@/lib/seo';
import styles from './PageHeader.module.css';

/**
 * The opening block of every inner page — one component so /services, /plans,
 * /templates, /about and /contact all start the same way: a breadcrumb, the
 * eyebrow, the `h1` and the lede, on the same tinted band.
 *
 * `crumb` is the page's own short name for the breadcrumb; the words above it
 * come from the API via the caller.
 */
export default async function PageHeader({
  crumb,
  path,
  eyebrow,
  title,
  lede,
  children,
}: {
  crumb: string;
  /** This page's route, e.g. `/plans` — for the breadcrumb structured data. */
  path?: string;
  eyebrow?: string;
  title?: string;
  lede?: string;
  children?: ReactNode;
}) {
  const base = path ? await siteUrl() : '';
  const breadcrumbSchema = path
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: crumb, item: `${base}${path}` },
        ],
      }
    : null;

  return (
    <section className={`page-head ${styles.head}`}>
      {breadcrumbSchema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      ) : null}
      <div className="container">
        <div className={styles.badges}>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link href="/">
              <svg className={styles.home} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
              </svg>
              Home
            </Link>
            <svg className={styles.sep} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
            <span aria-current="page">{crumb}</span>
          </nav>
          {eyebrow ? <span className={`eyebrow ${styles.eyebrow}`}>{eyebrow}</span> : null}
        </div>
        {title ? <h1 className={styles.title}>{title}</h1> : null}
        {lede ? <p className={styles.lede}>{lede}</p> : null}
        {children}
      </div>
    </section>
  );
}
