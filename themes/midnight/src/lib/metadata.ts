import type { Metadata } from 'next';
import { COMPANY_NOT_FOUND, SERVICE_UNAVAILABLE } from '@/config/site';

/**
 * The `<title>` and robots rules for a page that has **no tenant to name**.
 *
 * Every page on this site builds its own title out of `company.name`, which is
 * right when a company resolved and wrong in exactly two cases — and in both of
 * them `company.name` holds `FALLBACK_COMPANY`'s placeholder, the platform's
 * own name. Emitting that produces two separate problems:
 *
 *   - a visitor is told, in the one piece of chrome they always see, that they
 *     have reached a business nobody confirmed;
 *   - a crawler records that name against this domain, and keeps it. An
 *     unreachable API is a blip, but a domain nobody has mapped can sit like
 *     this for weeks, which is long enough to be indexed.
 *
 * The layout already handles the home page. It cannot handle the rest: a page's
 * own `generateMetadata` overrides the layout's title, so `/about` on an
 * unmapped domain was still emitting "About us · Aj Smart Biz" over a body that
 * correctly said the company was not found.
 *
 * Hence one helper rather than a guard written eleven times. It returns `null`
 * when there *is* a tenant, so the call site reads as a one-line early return
 * and every page keeps its own real metadata untouched.
 *
 *     const anonymous = anonymousMetadata(company);
 *     if (anonymous) return anonymous;
 *
 * It deliberately does **not** set `icons`. The layout's own metadata already
 * pins the default favicon in both cases, and Next merges the two — repeating
 * it here would be a second place to keep in step.
 */
export function anonymousMetadata(company: {
  resolved: boolean;
  apiReachable?: boolean;
}): Metadata | null {
  /**
   * Nothing answered, so nothing about this domain is known — not even whether
   * it belongs to anyone. Checked first because it is the stronger statement:
   * `resolved` is `false` in this case too, but only because there was no reply
   * to resolve anything from, and "we cannot reach our own systems" is a
   * different thing to tell someone than "this domain is not set up".
   */
  if (company.apiReachable === false) {
    return { title: SERVICE_UNAVAILABLE.title, robots: { index: false, follow: false } };
  }

  /** The API answered, and said this host belongs to no company. */
  if (!company.resolved) {
    return { title: COMPANY_NOT_FOUND.title, robots: { index: false, follow: false } };
  }

  return null;
}
