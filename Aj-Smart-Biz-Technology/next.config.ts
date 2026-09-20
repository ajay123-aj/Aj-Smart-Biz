import type { NextConfig } from 'next';

/**
 * Deliberately almost empty, and what is *missing* here is what makes this a
 * different kind of app from the templates in `themes/`.
 *
 * Those resolve a tenant from the host they were served on, proxy the API's
 * upload directory so a company's logo rides on whatever host the visitor used,
 * and configure a remote image origin to go with it. None of that applies here:
 * this site has one owner, no tenant to resolve, and no images that are not
 * drawn in the markup.
 *
 * So there is no `rewrites`, no `images.remotePatterns`, and no `middleware.ts`
 * anywhere in the project.
 */
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
};

export default nextConfig;
