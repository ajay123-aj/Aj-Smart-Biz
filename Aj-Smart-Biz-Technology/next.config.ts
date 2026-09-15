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
const nextConfig: NextConfig = {
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
