import { NextResponse, type NextRequest } from 'next/server';

/**
 * Company logos, product photos and every other uploaded image, served from
 * this site's own origin.
 *
 * The files live on the API (`GET /uploads/...`). Handing the browser the API's
 * own address instead would break the moment the site is reached from anywhere
 * but the server itself — see the note in `api/track/route.ts`, which forwards
 * to the same place for the same reasons.
 *
 * ---------------------------------------------------------------------------
 * Why this is a route handler and not a `rewrites()` entry
 * ---------------------------------------------------------------------------
 *
 * It *was* a rewrite, and the rewrite could not work in production. **Next
 * freezes rewrites into the route manifest at build time.** `next.config.ts`
 * runs during `next build`, so the destination is whatever `API_URL` said in
 * the builder — and the builder is a CI runner with no environment file. It
 * fell through to the `http://localhost:4000` default and got baked in.
 *
 * The container then started with the real `API_URL` in its environment, read
 * it correctly for every API call, and still proxied images to a port nothing
 * was listening on. Every image on every deployed theme returned **500**, and
 * no amount of fixing the environment file could change it, because the
 * decision had already been made in a different machine days earlier.
 *
 * Read here, the address is read when the request is served. That is how
 * `API_URL` behaves everywhere else in this app, and it means moving the API
 * needs a restart rather than a rebuild.
 */

/** Read at runtime, exactly as `company.server.ts` reads it. Never inlined. */
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * The origin holding `/uploads`.
 *
 * `UPLOADS_ORIGIN` first, for the deployment that serves files from somewhere
 * other than the API — a CDN, a separate static host. Otherwise the API's own
 * origin, which is the normal case.
 *
 * Empty when `API_URL` is relative (`/api/v1`). That is a deliberate statement
 * that a proxy in front of this app already serves both the API and the files
 * on this origin, so requests never reach this handler at all; if one does, it
 * is a misconfiguration and 404 is the honest answer.
 */
const uploadsOrigin = (): string => {
  const explicit = process.env.UPLOADS_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(API_URL)) return '';
  try {
    return new URL(API_URL).origin;
  } catch {
    return '';
  }
};

/** The address is read per request, so nothing here may be cached by Next. */
export const dynamic = 'force-dynamic';

/**
 * Headers worth passing on in each direction.
 *
 * Deliberately a short list rather than a copy of everything. The request
 * carries this site's cookies — a session, a cart — and the uploads directory
 * has no use for them; forwarding them would hand a tenant's session to a
 * service that never needs it. The conditional headers are forwarded because
 * they are what turns a repeat visit into a 304 instead of a re-download.
 */
const FORWARD_REQUEST = ['accept', 'if-none-match', 'if-modified-since', 'range', 'cache-control'];
const FORWARD_RESPONSE = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
  'x-content-type-options',
];

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const origin = uploadsOrigin();
  if (!origin) return new NextResponse('Not found', { status: 404 });

  const { path } = await context.params;

  /**
   * The path is rebuilt from the decoded segments rather than taken from the
   * URL, so `..` cannot walk out of the uploads directory. Next has already
   * decoded them, which is what makes the check meaningful: a raw `%2e%2e`
   * would slip past a string comparison on the untouched URL.
   */
  const segments = (path ?? []).filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const target = `${origin}/uploads/${segments.map(encodeURIComponent).join('/')}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  /**
   * Set blank when the visitor did not send one, and this is load-bearing.
   *
   * `fetch` appends `Cache-Control: no-cache` of its own whenever the header is
   * absent. Express's `fresh()` reads that as "revalidate regardless", so the
   * `If-None-Match` two lines above was answered with a full **200 and the
   * whole file** every single time — a repeat visitor re-downloading every
   * image on the page. Present-but-empty is the one state `fetch` leaves
   * alone, and it says nothing to the API, which is what we mean.
   *
   * A browser that sent its own — `no-cache` on a hard reload — keeps it.
   */
  if (!headers.has('cache-control')) headers.set('cache-control', '');

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers, cache: 'no-store', redirect: 'follow' });
  } catch {
    /**
     * The API is unreachable. 502 rather than 500: this app is working and is
     * saying so about something behind it, which is the difference between
     * "the site is broken" and "the file server is down" when somebody reads
     * the access log at three in the morning.
     */
    return new NextResponse('Bad gateway', { status: 502 });
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }

  /**
   * Uploaded files are content-addressed — the API gives each one a generated
   * name — so a URL's bytes never change and a long cache is safe. Only
   * supplied when the API did not say otherwise, and never for an error, whose
   * body is a message rather than an image.
   */
  if (upstream.ok && !out.has('cache-control')) {
    out.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  }
  /** The API sets this on uploads; restated here in case a hop dropped it. */
  out.set('X-Content-Type-Options', 'nosniff');

  /** 204 and 304 must not carry one, and `fetch` gives null for both anyway. */
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}
