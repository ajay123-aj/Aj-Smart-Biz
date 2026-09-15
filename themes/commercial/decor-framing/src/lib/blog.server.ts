import 'server-only';
import { resolveDomain } from './company.server';
import type { BlogPostCard, BlogPostFull } from './company';

/**
 * The two blog calls this site makes, and the only two requests it makes for
 * anything beyond `/website/company-details`.
 *
 * ### Why the blog is the exception
 *
 * Every other section rides in the company payload, because every other section
 * is as long as the business is wide — a shop has a range, not an ever-growing
 * pile of ranges. A blog is the one thing that **accumulates**: a tenant writing
 * weekly has two hundred articles in four years, each with an article-length
 * body, and putting all of that in the payload of every page would make the home
 * page pay for the archive forever.
 *
 * So the payload carries the latest few as cards (enough for the band on the
 * home page, and enough for the API to decide the menu entry), and these two
 * calls fetch the rest: a page of the archive, and one article whole.
 *
 * Both are unauthenticated, both resolve the tenant from the domain this site
 * was served on, and both answer **404 when the tenant has no blog today** — the
 * plan does not grant it, the switch is off, or the term has lapsed. The pages
 * turn that into `notFound()`, which is the truthful answer: there is no such
 * page on this website.
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  meta?: PageMeta;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
}

export interface BlogPage {
  items: BlogPostCard[];
  meta: PageMeta;
}

/** A neighbouring article, by date. Enough to link to it and nothing more. */
export interface BlogNeighbour {
  slug: string;
  title: string;
  publishedAt: string;
}

export interface BlogArticle {
  post: BlogPostFull;
  /** The section's wording, so the article page needs no second payload. */
  settings: { eyebrow: string; ctaLabel: string; showAuthor: boolean };
  previous: BlogNeighbour | null;
  next: BlogNeighbour | null;
}

const EMPTY_META: PageMeta = { total: 0, page: 1, limit: 0, totalPages: 1, hasNext: false };

/**
 * One request, with the rules every call from this site follows.
 *
 * `cache: 'no-store'` for the reason `getCompanyDetails` gives: Next otherwise
 * persists the response and keeps serving it across restarts and deploys, so a
 * post taken down in the console would go on being readable here.
 *
 * A failure of any kind returns `null` rather than throwing. The caller turns
 * that into a 404, which is what an unreachable API and a tenant with no blog
 * should look like to a reader: the page is not there. Throwing would render the
 * framework's error page over the top of the tenant's own site.
 */
async function get<T>(path: string): Promise<{ data: T | null; meta: PageMeta }> {
  const domain = await resolveDomain();
  const join = path.includes('?') ? '&' : '?';

  try {
    const res = await fetch(`${API_URL}${path}${join}domain=${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { data: null, meta: EMPTY_META };

    const body = (await res.json()) as ApiResponse<T>;
    return { data: body.data ?? null, meta: body.meta ?? EMPTY_META };
  } catch {
    return { data: null, meta: EMPTY_META };
  }
}

/** One page of the archive, newest first. `null` when this tenant has no blog. */
export async function getBlogPage(params: {
  page?: number;
  limit?: number;
  tag?: string;
}): Promise<BlogPage | null> {
  const query = new URLSearchParams();
  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.tag) query.set('tag', params.tag);

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const { data, meta } = await get<BlogPostCard[]>(`/website/blog${suffix}`);

  return data ? { items: data, meta } : null;
}

/**
 * One article, with the two beside it.
 *
 * `null` covers a slug that names nothing, a post whose date has not arrived,
 * and a tenant with no blog at all — the API answers 404 to all three, on
 * purpose. A scheduled post that said "not yet" rather than "not here" would let
 * anybody with the URL confirm that a tenant has an article coming.
 */
export async function getBlogPost(slug: string): Promise<BlogArticle | null> {
  const { data } = await get<BlogArticle>(`/website/blog/${encodeURIComponent(slug)}`);
  return data;
}
