/**
 * Dev-server proxy, so the console talks to its OWN origin in development —
 * exactly as it does in production, where the nginx inside the image proxies
 * `/api/v1` to the backend container.
 *
 * A `.js` config rather than `.json` so these notes are real comments. JSON has
 * none, and a `"//"` key is parsed as a proxy rule for the path `//`.
 *
 * ## Why this exists
 *
 * Without it the app calls `http://localhost:4000` directly, which breaks in
 * two different ways the moment the console is not opened on plain localhost:
 *
 *   * **Mixed content.** A dev tunnel serves the console over https, and a page
 *     on https may not call `http://`. The browser blocks it *before* any CORS
 *     check happens, so no CORS setting on the API can rescue it.
 *   * **CORS.** Even over https, `localhost:4000` is a different origin, so
 *     every call needs the API to allow whatever host the tunnel handed out
 *     today. Tunnel hostnames change between sessions — that is a list nobody
 *     can keep current.
 *
 * Proxying removes both: the browser only ever talks to the dev server, and the
 * dev server talks to the API from Node, where neither rule applies.
 *
 * `/uploads` is here for the same reason — company logos and favicons are
 * served by the API off its uploads volume, and an `<img>` pointing at `http://`
 * from an https page is blocked just as hard as a `fetch`.
 */
const target = process.env.API_PROXY_TARGET || 'http://localhost:4000';

module.exports = {
  '/api/v1': { target, secure: false, changeOrigin: false },
  '/uploads': { target, secure: false, changeOrigin: false },
};
