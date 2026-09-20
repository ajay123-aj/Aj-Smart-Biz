/**
 * What the browser tells the platform when someone opens this website.
 *
 * Everything here runs in the visitor's browser and every field is best-effort:
 * a browser that does not implement something, or a visitor who has denied it,
 * simply leaves that field out. Nothing in this file throws, and nothing in it
 * blocks rendering — the page is finished painting before any of it runs.
 *
 * ## What is deliberately *not* collected
 *
 *  - **One prompt, once.** The location permission is asked for a single time
 *    per browser and never again — not on the next page, not on the next
 *    visit, not next month. A visitor who says no is not asked twice, and one
 *    who ignores the dialog is not chased. See `requestLocationOnce`, which
 *    holds that rule, and `collectLocation`, which only ever *reads* a
 *    permission already given.
 *  - **No fingerprinting.** The device id is a random value this site stores in
 *    the visitor's own browser and nothing more. It is not derived from the
 *    machine, so clearing site data genuinely resets it — which is the point.
 *  - **No third parties.** The beacon goes to this site's own origin and
 *    nowhere else. There is no script here from anyone but us.
 */

/** Where the device id lives. Survives tabs and restarts; dies with site data. */
const DEVICE_KEY = 'aj_device_id';
/** Where the session id lives. Dies with the tab, which is what a session is. */
const SESSION_KEY = 'aj_session_id';
/**
 * That the location dialog has been shown. Set once and never cleared, so the
 * answer — including no answer at all — is respected for good.
 */
const LOCATION_ASKED_KEY = 'aj_location_asked';

/**
 * A push token the host application has obtained, if it ever does.
 *
 * This template ships no Firebase SDK — it is an informational website, and
 * pulling in a messaging library every visitor has to download in order to
 * populate a column would be the wrong trade. The field is wired end to end
 * regardless, so a deployment that *does* set up Firebase Cloud Messaging has
 * one thing left to do: put the token here and the platform stores it against
 * the lead from the next page load on.
 *
 *     window.ajSmartBiz = { fcmToken: await getToken(messaging, { vapidKey }) };
 *
 * A token that arrives after this page load is not lost: set it and the next
 * navigation carries it, because the tracker fires on every route change.
 */
declare global {
  interface Window {
    ajSmartBiz?: { fcmToken?: string | null };
  }
}

/** Never throws, whatever the storage does — private windows reject writes. */
const readStore = (store: Storage | undefined, key: string): string | null => {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const writeStore = (store: Storage | undefined, key: string, value: string): void => {
  try {
    store?.setItem(key, value);
  } catch {
    /* Storage disabled or full. The server derives an id instead — see the API. */
  }
};

/** A random id. `randomUUID` where it exists, which is everywhere modern and secure. */
const newId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* Falls through. `randomUUID` is absent on insecure origins. */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

/**
 * The id this browser is known by, minted on first visit.
 *
 * Returns null when storage is unavailable rather than minting a value that
 * cannot be kept: an id that changes on every page load would turn one visitor
 * into a hundred leads. Where this returns null the API derives a stable-enough
 * id of its own from address and user agent, and nothing comes back to the
 * page — see `sendVisit`.
 */
export function deviceId(): string | null {
  const existing = readStore(window.localStorage, DEVICE_KEY);
  if (existing) return existing;

  const minted = newId();
  writeStore(window.localStorage, DEVICE_KEY, minted);
  /* Only claim it if it actually stuck. */
  return readStore(window.localStorage, DEVICE_KEY);
}

/** This tab's id. Session storage is per-tab, which is exactly the right scope. */
function sessionId(): string | null {
  const existing = readStore(window.sessionStorage, SESSION_KEY);
  if (existing) return existing;
  const minted = newId();
  writeStore(window.sessionStorage, SESSION_KEY, minted);
  return readStore(window.sessionStorage, SESSION_KEY);
}

/**
 * Every query parameter on the current URL.
 *
 * All of them, not just the ones we know about — the API keeps the `utm_*` keys
 * and the recognised click ids and discards the rest. Doing the filtering there
 * rather than here means a campaign parameter nobody has thought of yet is
 * captured by a website that was deployed before it existed.
 */
function collectQuery(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    new URL(window.location.href).searchParams.forEach((value, key) => {
      if (Object.keys(out).length >= 50) return;
      out[key] = value.slice(0, 500);
    });
  } catch {
    /* An unparseable URL is not worth failing a page load over. */
  }
  return out;
}

/** The screen, the window, and whatever else `navigator` will admit to. */
function collectDevice(): Record<string, unknown> {
  const nav = window.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    userAgentData?: { brands?: unknown; mobile?: boolean; platform?: string };
  };

  const connection = nav.connection;

  return {
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    availWidth: window.screen?.availWidth,
    availHeight: window.screen?.availHeight,
    colorDepth: window.screen?.colorDepth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    orientation: window.screen?.orientation?.type,
    touchPoints: nav.maxTouchPoints,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    cookieEnabled: nav.cookieEnabled,
    /** Whether the site is running as an installed app rather than in a tab. */
    standalone: window.matchMedia?.('(display-mode: standalone)')?.matches,
    /** Accessibility and preference signals, which say something about the visit. */
    prefersDark: window.matchMedia?.('(prefers-color-scheme: dark)')?.matches,
    prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    ...(connection
      ? {
          connectionType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
        }
      : {}),
  };
}

/**
 * The timezone, which every browser gives up without being asked.
 *
 * The honest, no-permission answer to "roughly where is this visitor" —
 * `Asia/Kolkata` is worth a great deal to a business and costs the visitor
 * nothing, which is why it is collected on every beacon whatever happened with
 * the permission.
 */
function timezoneFields(): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  try {
    base.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    base.timezoneOffset = new Date().getTimezoneOffset();
  } catch {
    /* Both are optional. */
  }
  return base;
}

/**
 * What the browser says about the location permission, or `null` where it will
 * not say — Safari has no Permissions API for geolocation, so "unknown" is a
 * real and common answer rather than an edge case.
 */
async function locationPermission(): Promise<PermissionState | null> {
  try {
    const permissions = navigator.permissions;
    if (!permissions?.query) return null;
    const status = await permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

/**
 * One position read, with a deadline of its own.
 *
 * The deadline is the caller's because the two cases are nothing alike: a
 * permission already granted should produce a fix in seconds or be given up on,
 * while a dialog waiting for a person to notice it deserves as long as they
 * take. `maximumAge` lets a fix taken moments ago answer instantly, which is
 * what makes the second read after a fresh grant cost nothing.
 */
function readPosition(deadlineMs: number): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), deadlineMs);
    const settle = (value: GeolocationPosition | null) => {
      clearTimeout(timer);
      resolve(value);
    };

    try {
      navigator.geolocation.getCurrentPosition(
        settle,
        () => settle(null),
        { timeout: deadlineMs, maximumAge: 300000, enableHighAccuracy: false }
      );
    } catch {
      settle(null);
    }
  });
}

/** A position as the beacon carries it. Rounded accuracy; nothing else derived. */
const positionFields = (position: GeolocationPosition): Record<string, unknown> => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: Math.round(position.coords.accuracy),
  source: 'geolocation',
});

/**
 * Claims the single ask this browser gets.
 *
 * Returns true exactly once per browser — the first caller gets it, every
 * later one is refused, including after a reload, a new tab or a visit next
 * year. Written **before** the dialog is opened rather than after it is
 * answered, because a visitor who reloads the page while it is sitting there
 * has already been asked; asking again is the thing this exists to prevent.
 *
 * The write is read back, and a flag that did not stick refuses the ask
 * altogether. Storage is disabled in some private windows, and a flag that
 * cannot be kept would mean prompting on every single page load — far worse
 * than never prompting at all.
 */
function claimLocationAsk(): boolean {
  if (readStore(window.localStorage, LOCATION_ASKED_KEY)) return false;
  writeStore(window.localStorage, LOCATION_ASKED_KEY, String(Date.now()));
  return Boolean(readStore(window.localStorage, LOCATION_ASKED_KEY));
}

/**
 * Where this is, as far as the browser will say **without being asked**.
 *
 * Coordinates are read only when the permission has already been granted, and
 * the read is given a short deadline so a device that never produces a fix does
 * not hold the beacon up. Prompting is `requestLocationOnce`'s job and happens
 * once in the life of a browser.
 *
 * A browser that will not say what the permission is gets the timezone and
 * nothing else — Safari, in practice, which has no Permissions API for
 * geolocation. Reading a position there means calling `getCurrentPosition` and
 * hoping it does not prompt, and Safari does prompt again in a later session.
 * So a Safari visitor who allowed it is recorded with coordinates on the visit
 * they allowed it on and by timezone afterwards. That is the price of “asked
 * once” meaning once, and it is the right way round: a second dialog costs the
 * tenant a visitor, and a missing coordinate costs them a column.
 */
async function collectLocation(): Promise<Record<string, unknown>> {
  const base = timezoneFields();

  try {
    if (!navigator.geolocation) return base;
    if ((await locationPermission()) !== 'granted') return base;

    const position = await readPosition(3000);
    return position ? { ...base, ...positionFields(position) } : base;
  } catch {
    return base;
  }
}

/**
 * Asks for the location permission. Once per browser, ever.
 *
 * Returns the coordinates when the visitor allows it, and `null` in every other
 * case — refused, ignored, unsupported, or simply asked already. The caller
 * sends a follow-up beacon on a `null`-free answer; see `LeadTracker`.
 *
 * Deliberately **not** part of `collect`. A beacon that waited for this would
 * be waiting on a human reading a dialog, and a visitor who never answers would
 * go unrecorded entirely — so the visit is reported first with the timezone,
 * and coordinates upgrade it afterwards if they arrive at all.
 *
 * Three things have to be true before a dialog opens, and each rules out a way
 * of pestering someone:
 *
 *   1. the browser has geolocation at all
 *   2. the permission is genuinely unanswered — `granted` needs no dialog and
 *      `denied` cannot produce one, so neither is worth a call
 *   3. this browser has not been asked before, ever — see `claimLocationAsk`
 */
export async function requestLocationOnce(): Promise<Record<string, unknown> | null> {
  try {
    if (!navigator.geolocation) return null;

    const state = await locationPermission();
    if (state === 'granted' || state === 'denied') return null;

    if (!claimLocationAsk()) return null;

    /**
     * Twenty seconds, against three for an established grant. The clock here is
     * a person noticing a dialog and deciding, and nothing is waiting on the
     * answer — the visit has already been reported.
     */
    const position = await readPosition(20000);
    return position ? { ...timezoneFields(), ...positionFields(position) } : null;
  } catch {
    return null;
  }
}

export interface TrackPayload extends Record<string, unknown> {
  deviceId: string | null;
  sessionId: string | null;
  url: string;
}

/** What a caller may say about the beacon it is asking for. */
export interface TrackOptions {
  /**
   * Location to send instead of reading it again — the coordinates a fresh
   * permission grant just produced.
   */
  location?: Record<string, unknown>;
  /**
   * Whether this beacon is a page being looked at. False for the follow-up that
   * carries nothing but a location: the visitor did not open a second page, and
   * counting one would make every granted permission look like an extra view.
   */
  pageView?: boolean;
}

/** Assembles everything above into the one object the beacon sends. */
export async function collect(options: TrackOptions = {}): Promise<TrackPayload> {
  const nav = window.navigator as Navigator & {
    userAgentData?: { brands?: unknown; mobile?: boolean; platform?: string };
  };

  return {
    deviceId: deviceId(),
    sessionId: sessionId(),

    url: window.location.href,
    path: window.location.pathname,
    host: window.location.host,
    title: document.title,
    /* Empty on a direct visit, which the API reads as exactly that. */
    referrer: document.referrer || null,

    query: collectQuery(),

    device: collectDevice(),
    /**
     * The version Chromium tells the truth in. Its user-agent string is frozen
     * and increasingly fictional, so the API prefers this wherever it is sent.
     */
    clientHints: nav.userAgentData
      ? {
          brands: nav.userAgentData.brands,
          mobile: nav.userAgentData.mobile,
          platform: nav.userAgentData.platform,
        }
      : undefined,

    location: options.location ?? (await collectLocation()),
    /* Only ever sent as `false`; the API treats its absence as a page view. */
    ...(options.pageView === false ? { pageView: false } : {}),

    language: nav.language,
    languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 10) : undefined,

    /* See the `ajSmartBiz` declaration above. Absent unless something set it. */
    fcmToken: window.ajSmartBiz?.fcmToken ?? undefined,
  };
}

/**
 * Sends one visit.
 *
 * `keepalive` so a beacon fired as the visitor navigates away still completes —
 * without it the browser cancels in-flight requests on unload and the last page
 * of every visit goes unrecorded. Failures are swallowed: this is measurement,
 * and measurement that can break the thing it measures is worse than no
 * measurement at all.
 */
export async function sendVisit(options: TrackOptions = {}): Promise<void> {
  try {
    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await collect(options)),
      keepalive: true,
      cache: 'no-store',
    });

    /**
     * Nothing to read back.
     *
     * The tenant templates adopt a device id the API derived for them; this
     * site's proxy deliberately returns none, because handing row ids or a
     * server-derived identity to the page gives a script on it something to
     * enumerate. A browser that cannot keep an id simply goes unrecognised
     * next time, which is the honest outcome.
     */
    void response;
  } catch {
    /* Offline, blocked by an extension, or the API is down. All the same here. */
  }
}
