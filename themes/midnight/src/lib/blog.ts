import { BLOG_COPY } from '@/config/site';
import { fillCompany, type BlogFeature, type BlogPostCard, type CompanyDetails } from './company';

/**
 * What the blog section should say, and the latest few posts to put under it.
 *
 * The same job `resolveServices` does, and it takes the same hard line on
 * fallbacks for the same reason, only more so. About has a fallback because the
 * platform holds facts about a company it can honestly build a section from. It
 * holds nothing at all about what a business has *been doing*, and an invented
 * article is not a weak section — it is a company publishing something it never
 * wrote, under its own name, on its own domain.
 *
 * So this returns `null` rather than reaching for wording of its own, and `null`
 * covers every way a tenant can be not publishing a blog — the component needs
 * to tell none of them apart:
 *
 *   - the plan does not grant `blog`
 *   - the company has the switch off
 *   - the plan has stopped being served
 *   - nothing is published yet, or everything published is dated in the future
 *
 * The API decides all four and omits the block, which is also what decides the
 * `/blog` route and the menu entry — so the page, the link and the band can
 * never disagree about whether this tenant has a blog.
 */
export interface ResolvedBlog {
  eyebrow: string;
  title: string;
  lede: string;
  /** The label under each card. */
  cta: string;
  /** Whether to print a byline at all. The company's choice, not the post's. */
  showAuthor: boolean;
  /** What is being rendered here, after any limit was applied. */
  items: BlogPostCard[];
  /** Everything the tenant has published, not just what is above. */
  total: number;
  /** True when `items` is a shortened list and the archive holds more. */
  truncated: boolean;
}

/**
 * The section for this tenant, or `null` when there is none.
 *
 * `limit` shortens the list without changing anything else about it — the home
 * page shows the first few, the archive passes none. Deliberately a count rather
 * than a variant: a section that reworded itself per page is exactly what
 * `CtaBand` was written to undo.
 *
 * `BLOG_COPY` is read only as a floor under each field. The API fills them from
 * its own defaults already, so these apply to a block that arrived with
 * something blank — a heading of empty space is the one outcome worth spending a
 * fallback on.
 */
export function resolveBlog(company: CompanyDetails, limit?: number): ResolvedBlog | null {
  const blog: BlogFeature | null = company.features?.blog ?? null;
  const all = blog?.items ?? [];
  if (!all.length) return null;

  const items = typeof limit === 'number' && limit > 0 ? all.slice(0, limit) : all;

  return {
    eyebrow: blog!.eyebrow?.trim() || BLOG_COPY.eyebrow,
    title: fillCompany(blog!.title?.trim() || BLOG_COPY.title, company),
    lede: fillCompany(blog!.lead?.trim() || BLOG_COPY.lede, company),
    cta: blog!.ctaLabel?.trim() || BLOG_COPY.cta,
    /* Passed through as sent: whether bylines are printed is the tenant's
       setting, not something to infer from whether a post happens to have one. */
    showAuthor: blog!.showAuthor !== false,
    items,
    /* The archive's count, which is larger than `items` whenever the tenant has
       written more than the payload carries. */
    total: blog!.total ?? all.length,
    truncated: items.length < (blog!.total ?? all.length),
  };
}

/**
 * The date on an article, as a person reads it.
 *
 * Fixed to `en-GB` and to UTC rather than left to the reader's locale, and both
 * halves are deliberate. A date formatted per-locale renders differently on the
 * server and in the browser, which React reports as a hydration mismatch; a date
 * formatted in the reader's *time zone* can show the day before the one the shop
 * published on, for a reader far enough west. The tenant published on a day, and
 * that day is what the page says.
 */
export const postDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

/**
 * An article's text as paragraphs.
 *
 * The body is **plain text and is printed as plain text** — split on blank
 * lines, each piece rendered as its own `<p>`. Nothing here interprets markup,
 * which is the whole point: there is no path by which something a tenant pasted
 * in from a word processor, or anything a compromised console might write,
 * becomes live HTML on a page a stranger is reading.
 */
export const paragraphsOf = (body: string): string[] =>
  String(body ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
