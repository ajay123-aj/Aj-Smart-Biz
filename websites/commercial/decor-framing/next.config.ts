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

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
