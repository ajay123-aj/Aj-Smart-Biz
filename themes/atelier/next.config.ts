import type { NextConfig } from 'next';

/**
 * Where the API lives. Only the server ever calls it.
 *
 * Read here to derive the uploads proxy target. Unlike the fetch in
 * `company.server.ts`, this one is fixed when the app is built — `next.config.ts`
 * runs at build time — so moving the API needs a rebuild, or an explicit
 * `BACKEND_ORIGIN`.
 */
const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * The origin serving `/uploads`. Absolute when the API is on its own host
 * (`http://localhost:4000/api/v1` -> `http://localhost:4000`), empty when the API
 * is already same-origin behind a proxy (`/api/v1`).
 */
const backendOrigin = (() => {
  if (process.env.BACKEND_ORIGIN) return process.env.BACKEND_ORIGIN.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(apiUrl)) return '';
  try {
    return new URL(apiUrl).origin;
  } catch {
    return '';
  }
})();

/**
 * If `NEXT_PUBLIC_FILES_URL` is set, logos and favicons are rendered as absolute
 * URLs on that origin and reach the browser directly. Left empty — the default —
 * they stay relative (`/uploads/...`), the browser asks *this* site for them, and
 * the rewrite below fetches them from the API.
 */
const filesOrigin = process.env.NEXT_PUBLIC_FILES_URL;

/**
 * Hosts that may submit a Server Action to this app.
 *
 * Next compares the request's `Origin` against the `Host` it was served on and
 * refuses the action when they differ — a CSRF defence, and the right default.
 * It breaks on any hop that rewrites Host: a dev tunnel, `next start` behind a
 * proxy, a preview URL. The browser sends the public origin, the server sees its
 * own, and every action is rejected with "a server-side exception has occurred"
 * — which is what sign-in, the cart, bookings and the enquiry form all are.
 *
 * **`*` matches exactly one label.** A dev tunnel host like
 * `31vz1nqf-4600.inc1.devtunnels.ms` has two before the zone, so
 * `*.devtunnels.ms` does NOT match it and `**.devtunnels.ms` does.
 *
 * Read from the environment rather than hard-coded: a tunnel hostname changes
 * between sessions, and rebuilding to accept today's is not a fix.
 *
 *     ALLOWED_ORIGINS=my-tunnel.devtunnels.ms,localhost:4600
 *     ALLOWED_ORIGINS=**.devtunnels.ms,localhost:4600
 *
 * **List every origin you actually browse from, and include the port.** Next
 * matches on `new URL(origin).host`, which keeps the port — so `localhost` does
 * not match `localhost:4600`, and a wildcard cannot cover it either
 * (`matchWildcardDomain` only matches subdomains).
 *
 * Both directions of the mismatch happen in practice and both need listing:
 * browse the tunnel and the origin is the tunnel while the host is localhost;
 * browse localhost while a tunnel is forwarding and it is the other way round.
 * Leave it unset in production: behind nginx the Host *is* the public domain,
 * so Origin already matches and widening this would only weaken the check.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  /* See `allowedOrigins` above. `serverActions` lives under `experimental` in
     Next 15 — at the top level it is silently ignored, which looks exactly
     like the fix not working. Omitted entirely when the list is empty, so in
     production the check keeps its teeth. */
  ...(allowedOrigins.length ? { experimental: { serverActions: { allowedOrigins } } } : {}),

  reactStrictMode: true,

  /**
   * Trace exactly which files the server needs and emit them, with a minimal
   * `node_modules`, into `.next/standalone`. This is what the Docker image
   * ships: the alternative is copying the whole dependency tree and the build
   * cache into the runtime stage, which is several hundred megabytes of things
   * that never execute.
   *
   * It changes nothing about `next dev` or `next start` locally — it only adds
   * a directory to the build output.
   */
  output: 'standalone',

  /**
   * Serve the API's uploads from this site's own origin.
   *
   * Company logos and favicons are stored as paths like
   * `/uploads/company/logo.png` and served by the API on port 4000. Handing the
   * browser `http://localhost:4000/uploads/...` only works when the browser is on
   * the same machine as the API — it breaks the moment the site is reached over a
   * dev tunnel, from a phone on the LAN, or from anywhere in production, because
   * `localhost` then means the *visitor's* machine.
   *
   * Proxying keeps every image on whatever host the visitor actually used, so the
   * branding works everywhere without per-environment configuration.
   */
  async rewrites() {
    if (!backendOrigin) return [];
    return [{ source: '/uploads/:path*', destination: `${backendOrigin}/uploads/:path*` }];
  },

  images: {
    remotePatterns: filesOrigin
      ? [
        {
          protocol: new URL(filesOrigin).protocol.replace(':', '') as 'http' | 'https',
          hostname: new URL(filesOrigin).hostname,
          port: new URL(filesOrigin).port || undefined,
          pathname: '/uploads/**',
        },
      ]
      : [],
  },
};

export default nextConfig;
