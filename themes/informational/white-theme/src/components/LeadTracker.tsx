'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { requestLocationOnce, sendVisit } from '@/lib/tracking';

/**
 * Reports every launch of this website to the platform.
 *
 * Renders nothing. It lives in the root layout so it covers every page, and it
 * fires on client-side navigation as well as the first load — an app-router
 * site does not reload between pages, so a plain mount effect would record the
 * landing page and nothing else.
 *
 * ## Why it waits
 *
 * The beacon is scheduled rather than sent immediately. Nothing the visitor
 * came for depends on it, so it must not compete with the page for the main
 * thread or the connection during the first paint. `requestIdleCallback` where
 * it exists, a short timeout where it does not.
 *
 * ## Why the guard
 *
 * React runs effects twice in development's Strict Mode, and `useSearchParams`
 * re-renders on every query change. Without a per-URL guard one page load would
 * post two or three visits — which the API would fold into one visit anyway,
 * but they would still be requests nobody asked for and a page-view count that
 * lies. The key is the full URL, so a real navigation is a new key and the same
 * page re-rendering is not.
 *
 * ## The location dialog
 *
 * Asked for once per browser and never again — the rule itself lives in
 * `requestLocationOnce`, which holds the flag; this only decides *when* to try.
 *
 * After the beacon, never before it. A dialog cannot be allowed to hold the
 * visit up: a visitor who ignores one would otherwise go unrecorded entirely.
 * So the visit is reported with the timezone first, and coordinates follow as a
 * second beacon if the visitor allows them — marked as no page view, because
 * granting a permission is not opening another page.
 *
 * Once per mount as well as once per browser. The ref stops a client-side
 * navigation from re-entering this while the first dialog is still open, which
 * would spend the browser's one ask on a call it is going to ignore anyway.
 */
export default function LeadTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);
  const askedForLocation = useRef(false);

  useEffect(() => {
    const key = `${pathname}?${searchParams?.toString() ?? ''}`;
    if (lastSent.current === key) return;
    lastSent.current = key;

    /**
     * Held so a navigation that happens before the idle callback runs cancels
     * the one it superseded, rather than sending two.
     */
    let cancelled = false;

    /**
     * The one ask. `requestLocationOnce` answers `null` for everything that is
     * not a fresh grant — refused, ignored, unsupported, or already asked on
     * some earlier visit — so the follow-up beacon goes only when there is
     * genuinely something new to report.
     */
    const askOnceForLocation = async () => {
      if (askedForLocation.current) return;
      askedForLocation.current = true;

      const location = await requestLocationOnce();
      /* `cancelled` is not checked again: the permission has been granted and
         the fix is in hand, and a navigation mid-dialog is no reason to throw
         away the one answer this browser will ever give. */
      if (location) await sendVisit({ location, pageView: false });
    };

    const fire = () => {
      if (cancelled) return;
      void sendVisit().then(askOnceForLocation);
    };

    /**
     * `typeof` rather than a truthiness check: the DOM types declare
     * `requestIdleCallback` as always present, so TypeScript rejects testing it
     * for existence — but Safari only shipped it in 16.4, and this site still
     * has to work on the phone in someone's pocket.
     */
    const supportsIdle = typeof window.requestIdleCallback === 'function';
    const handle = supportsIdle
      ? window.requestIdleCallback(fire, { timeout: 2000 })
      : window.setTimeout(fire, 800);

    return () => {
      cancelled = true;
      if (supportsIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [pathname, searchParams]);

  return null;
}
