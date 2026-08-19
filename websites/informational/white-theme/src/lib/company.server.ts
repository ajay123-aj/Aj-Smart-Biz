import 'server-only';
import { headers } from 'next/headers';
import { FALLBACK_COMPANY, type CompanyDetails } from './company';

/**
 * Calls the company-details API.
 *
 * The endpoint lives in the backend — `GET /public/company-details?domain=` in
 * `Aj-Smart-Biz-Backend/src/controllers/public.controller.js`. This website
 * defines no API of its own; it passes the domain it was served on and renders
 * whatever comes back.
 *
 * It is unauthenticated, like the `/public/branding` endpoint the admin console
 * uses, and an unknown or inactive tenant gets platform defaults rather than an
 * error — so the site always has something to paint.
 */

/**
 * Where the API is, read at **runtime** — only the server ever calls it.
 *
 * `API_URL` is deliberately not a `NEXT_PUBLIC_` name: Next inlines those into
 * the bundle at build time, so a baked-in value cannot be changed by restarting
 * with a different environment. `NEXT_PUBLIC_API_URL` is still honoured for
 * anyone who already set it.
 *
 * It must be absolute. Server-side `fetch` has no page to resolve `/api/v1`
 * against, so in production point this at the API's internal address even when
 * the browser reaches it same-origin.
 */
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

/** Strips the port and lower-cases, matching what the API normalises to. */
const normaliseHost = (value: string): string =>
  value.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

/**
 * The domain that identifies this tenant.
 *
 * `middleware.ts` has already worked it out — `?domain=` override, the cookie it
 * left behind, `X-Forwarded-Host`, `Host`, then `TENANT_DOMAIN` — and put the
 * answer on `x-tenant-domain`. The fallbacks here only matter if the middleware
 * was bypassed.
 */
export async function resolveDomain(): Promise<string> {
  const headerList = await headers();

  return normaliseHost(
    headerList.get('x-tenant-domain') ||
      headerList.get('x-forwarded-host') ||
      headerList.get('host') ||
      process.env.TENANT_DOMAIN ||
      ''
  );
}

/**
 * Called once at launch, from the root layout, so header, slider and footer all
 * render against one already-resolved company rather than each fetching its own.
 */
export async function getCompanyDetails(): Promise<CompanyDetails> {
  const domain = await resolveDomain();

  try {
    const res = await fetch(`${API_URL}/public/company-details?domain=${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/json' },
      /**
       * Always live, never cached.
       *
       * Next otherwise persists the response to `.next/cache` and keeps serving
       * it — including across restarts and deploys — so a company that changed
       * its logo or name in the admin would go on seeing the old one here, and a
       * response captured against one database can be replayed later against
       * another. It is one small request per render; the admin's login screen
       * fetches its branding on every load too.
       */
      cache: 'no-store',
    });

    if (!res.ok) return { ...FALLBACK_COMPANY, host: domain };

    const body = (await res.json()) as ApiResponse<CompanyDetails>;
    return body.data ? { ...FALLBACK_COMPANY, ...body.data } : { ...FALLBACK_COMPANY, host: domain };
  } catch {
    // The site is informational — it must render with or without the API.
    return { ...FALLBACK_COMPANY, host: domain };
  }
}
