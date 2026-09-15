import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import BlogSection from '@/components/BlogSection';
import CtaBand from '@/components/CtaBand';
import { BLOG_COPY, BLOG_PAGE_SIZE } from '@/config/site';
import { navOf, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { getBlogPage } from '@/lib/blog.server';
import { resolveBlog } from '@/lib/blog';
import styles from './page.module.css';

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The first value of a repeated query parameter, trimmed, or null. */
const one = (params: Record<string, string | string[] | undefined>, key: string): string | null => {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
};

const pageNumber = (params: Record<string, string | string[] | undefined>): number => {
  const raw = Number(one(params, 'page'));
  return Number.isInteger(raw) && raw > 1 ? raw : 1;
};

/**
 * What this page is called on this tenant's site.
 *
 * The tenant renames it on Company Details → Blog, and the API sends the result
 * in `nav` — so the breadcrumb, the browser tab and the menu all say the same
 * word, whatever word that is.
 */
const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'blog')?.label ?? BLOG_COPY.metaTitle;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [company, params] = await Promise.all([getCompanyDetails(), searchParams]);
  const blog = resolveBlog(company);
  const tag = one(params, 'tag');

  /* A filtered view is titled by its tag — it is what somebody arriving from a
     shared link is actually looking at, and "Blog · Acme" on every one of them
     tells a search engine nothing. */
  const heading = tag ? BLOG_COPY.taggedWith.replace('{tag}', tag) : pageLabel(company);

  return {
    title: `${heading} · ${company.name}`,
    description: blog?.lede || company.description || undefined,
    robots:
      blog && company.service.active
        ? /* A tag filter and page two are the same articles in another
             arrangement. Indexing them competes with the archive itself for the
             same content, so only the first unfiltered page is offered. */
          tag || pageNumber(params) > 1
          ? { index: false, follow: true }
          : undefined
        : { index: false, follow: false },
  };
}

/**
 * The blog — every post, a page at a time.
 *
 * **The one page on this site that fetches something of its own.** Everything
 * else is rendered from the company payload the layout already has, because
 * everything else is as long as the business is wide. A blog accumulates: the
 * payload carries the latest few for the band on the home page, and this page
 * asks the API for the rest, a page at a time. See `getBlogPage`.
 *
 * Gated on `blog` by the same rule Services and Products follow, with the same
 * addition: an **empty** blog withholds the page as firmly as a missing grant
 * does. Entitled, switched on and nothing published is an ordinary state for a
 * tenant on its first afternoon, and the API drops the menu entry on the same
 * signal — so nothing on the site points here while it is not there.
 */
export default async function BlogPage({ searchParams }: { searchParams: Search }) {
  const [company, params] = await Promise.all([getCompanyDetails(), searchParams]);

  /* The layout declines to frame the site when the API is unreachable; the page
     has to decline to render it too, or its markup stays readable in the
     streamed RSC payload. Same rule as the plan check below. */
  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;

  /*
   * Withheld, switched off, or simply empty. A 404 is the honest answer to all
   * three: the tenant is not publishing a blog, so it does not exist on their
   * website.
   */
  const blog = resolveBlog(company);
  if (!blog) notFound();

  const tag = one(params, 'tag');
  const page = pageNumber(params);

  const result = await getBlogPage({ page, limit: BLOG_PAGE_SIZE, tag: tag ?? undefined });
  /* The payload said this tenant has a blog a moment ago, so a null here is the
     API having gone away between the two calls rather than a missing feature. */
  if (!result) notFound();

  const label = pageLabel(company);
  const { items, meta } = result;

  const href = (target: number): string => {
    const query = new URLSearchParams();
    if (tag) query.set('tag', tag);
    if (target > 1) query.set('page', String(target));
    const suffix = query.toString();
    return suffix ? `/blog?${suffix}` : '/blog';
  };

  return (
    <>
      {/* ------------------------------- masthead ------------------------------ */}
      <header className={styles.masthead}>
        <div className="container">
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link className={styles.crumb} href="/">
              Home
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            {tag ? (
              <>
                <Link className={styles.crumb} href="/blog">
                  {label}
                </Link>
                <span className={styles.crumbSep} aria-hidden="true">
                  /
                </span>
                <span aria-current="page">{tag}</span>
              </>
            ) : (
              <span aria-current="page">{label}</span>
            )}
          </nav>

          {/* The tenant's own heading, exactly as the band below would print it.
              The section's head is suppressed so the page opens with one
              heading rather than repeating it forty pixels further down. */}
          <span className="eyebrow">{blog.eyebrow}</span>
          <h1 className={styles.title}>{tag ? BLOG_COPY.taggedWith.replace('{tag}', tag) : blog.title}</h1>
          <p className={styles.lead}>{blog.lede}</p>

          <p className={styles.count}>
            {meta.total} {meta.total === 1 ? 'post' : 'posts'}
            {tag ? (
              <>
                {' · '}
                <Link className={styles.clear} href="/blog">
                  {BLOG_COPY.clearTag}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {items.length ? (
        /* The same component the home page uses, given this page's posts — so
           the band and the archive can never drift into two different-looking
           lists of the same articles. */
        <BlogSection company={company} posts={items} showHead={false} className={styles.list} />
      ) : (
        <section className="section">
          <div className="container">
            <p className={styles.empty}>{BLOG_COPY.emptyTag}</p>
          </div>
        </section>
      )}

      {/*
        The pager, as two real links rather than numbers.

        A blog is read in one direction, and "older" and "newer" are the words a
        reader actually thinks in — page 3 of a blog means nothing to anybody.
        Both are ordinary links with their own URLs, so they work without
        JavaScript and can be shared.
      */}
      {meta.totalPages > 1 ? (
        <nav className={styles.pager} aria-label="Blog pages">
          <div className={`container ${styles.pagerRow}`}>
            {page > 1 ? (
              <Link className="btn btn--ghost" href={href(page - 1)} rel="prev">
                ← {BLOG_COPY.newer}
              </Link>
            ) : (
              <span />
            )}

            <span className={styles.pagerCount}>
              {page} / {meta.totalPages}
            </span>

            {meta.hasNext ? (
              <Link className="btn btn--ghost" href={href(page + 1)} rel="next">
                {BLOG_COPY.older} →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </nav>
      ) : null}

      {/* Every page closes the same way, with the same band. */}
      <CtaBand company={company} />
    </>
  );
}
