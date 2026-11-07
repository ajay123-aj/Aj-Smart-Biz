import { cache } from 'react';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where this site gets everything it renders.
 *
 * **There is no content in this project any more.** The headlines, the price
 * list, the capability catalogue, the trades and the FAQ all come from
 * `GET /website/bootstrap` on `Aj-Smart-Biz-Backend`, and are edited in the
 * super admin console rather than in a file here. `config/site.ts` and
 * `content/*.ts` used to hold them and are gone.
 *
 * **This site has no database of its own and never talks to one.** Its only
 * dependency is the API — check `package.json`: `next`, `react`, `react-dom`
 * and nothing else. A database driver appearing in here would mean two things
 * owned the same rows, which is the situation the API exists to prevent.
 *
 * `API_URL` is deliberately not a `NEXT_PUBLIC_` name. Next inlines those into
 * the browser bundle at build time, which would bake one environment's API
 * address into an image meant to run in all of them — the same reasoning as the
 * theme templates in `themes/`. Every call in this file runs on the server.
 */
const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

/**
 * How long a page may serve the last good answer.
 *
 * This is the whole resilience story, and it is worth being explicit about the
 * trade. Nothing is hard-coded as a fallback, so if the API has never answered,
 * the page cannot render and says so. But once it *has* answered, Next serves
 * that response for five minutes and refreshes it in the background — so a
 * backend restart, a deploy or a blip is invisible to visitors rather than
 * being a marketing site that is down.
 *
 * Five minutes is the cost of an edit: a price changed in the console shows up
 * within that, which is the right trade for a page that is mostly read by
 * strangers and edited a few times a year.
 */
const REVALIDATE_SECONDS = 300;

/* ------------------------------------------------------------------ *
 * What the API returns
 * ------------------------------------------------------------------ */

/** The envelope every endpoint answers in. See `utils/response` in the API. */
interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

export interface Plan {
  /** The plan's `code` in the API, which is what `/demo?plan=` carries. */
  id: string;
  name: string;
  tagline: string;
  price: number;
  discountPrice?: number;
  currency: string;
  billingCycle: BillingCycle;
  limits: { branches: number; logins: number; storageMb: number };
  /** Prose, ticked on the card. */
  highlights: string[];
  /** Capability keys. Unknown ones are dropped — see `capabilitiesOf`. */
  includes: string[];
  isPopular: boolean;
}

export interface Capability {
  key: string;
  name: string;
  /** A name from the glyph library — see `components/Glyph.tsx`. */
  icon: string | null;
  summary: string;
  description: string;
  sequence: number;
}

export interface BusinessType {
  id: number;
  name: string;
  slug: string | null;
  icon: string | null;
  description: string | null;
}

export interface Faq {
  id: number;
  question: string;
  answer: string;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface CtaLink {
  label: string;
  href: string;
}

export interface IconCard {
  icon?: string;
  title: string;
  body: string;
}

/**
 * The writing, keyed by section.
 *
 * **Every field is optional, and that is not laziness.** These payloads are
 * JSON columns edited by hand in a console; nothing on either side validates
 * that a section still has the field a component reads. Typing them as
 * optional forces each component to cope, so a half-finished edit renders a
 * section without its lede rather than crashing the page.
 */
export interface SiteContent {
  site?: {
    name?: string;
    shortName?: string;
    title?: string;
    tagline?: string;
    description?: string;
    navLinks?: NavLink[];
  };
  contact?: {
    phone?: string;
    phoneHref?: string;
    whatsapp?: string;
    email?: string;
    addressLine?: string;
    hours?: string;
  };
  hero?: {
    eyebrow?: string;
    title?: string;
    titleAccent?: string;
    body?: string;
    primaryCta?: CtaLink;
    secondaryCta?: CtaLink;
    assurances?: string[];
  };
  steps?: { eyebrow?: string; title?: string; lede?: string; items?: IconCard[] };
  promises?: { eyebrow?: string; title?: string; lede?: string; items?: IconCard[] };
  recharge?: {
    eyebrow?: string;
    title?: string;
    lede?: string;
    points?: { title: string; body: string }[];
  };
  cta?: { eyebrow?: string; title?: string; body?: string; primary?: CtaLink };
  services_page?: {
    eyebrow?: string;
    title?: string;
    lede?: string;
    capabilitiesTitle?: string;
    capabilitiesLede?: string;
    alwaysTitle?: string;
    always?: IconCard[];
  };
  plans_page?: { eyebrow?: string; title?: string; lede?: string; footnote?: string };
  demo_page?: {
    eyebrow?: string;
    title?: string;
    lede?: string;
    expectations?: { title: string; body: string }[];
    typesTitle?: string;
    typesLede?: string;
  };
  about_page?: {
    eyebrow?: string;
    title?: string;
    lede?: string;
    body?: string[];
    valuesTitle?: string;
    values?: IconCard[];
  };
  contact_page?: { eyebrow?: string; title?: string; lede?: string; formTitle?: string };
  faq_intro?: { eyebrow?: string; title?: string };
  templates_page?: {
    eyebrow?: string;
    title?: string;
    lede?: string;
    allLabel?: string;
    demoLabel?: string;
    noDemoLabel?: string;
    sectionsLabel?: string;
    emptyTitle?: string;
    emptyBody?: string;
    homeEyebrow?: string;
    homeTitle?: string;
    homeLede?: string;
    homeLink?: string;
  };
}

export interface Site {
  content: SiteContent;
  plans: Plan[];
  capabilities: Capability[];
  businessTypes: BusinessType[];
  faqs: Faq[];
}

/* ------------------------------------------------------------------ *
 * Surviving a backend restart
 *
 * A backend restart or deploy takes a few seconds, and during that window every
 * request to the API is refused. Before this, `getSite` threw on the first
 * refusal and every page on the site rendered an error until the API was back.
 *
 * Three layers now stand between a restart and a visitor:
 *
 *   1. **Retry.** A refused connection or a 5xx is retried with a short
 *      backoff (~3.5s in total), which covers most restarts on its own.
 *   2. **Last good response.** Every successful answer is kept in memory and
 *      written to a snapshot file in the OS temp directory. If the API is still
 *      down after the retries, the page renders from that snapshot: the API's
 *      own data, a little old, nothing invented. The file means a restart of
 *      *this* app while the API is down still has something to serve.
 *   3. **Friendly error page.** Only when the API has *never* answered does the
 *      request fail, and `app/error.tsx` / `app/global-error.tsx` then show a
 *      "back in a moment" screen that retries by itself.
 * ------------------------------------------------------------------ */

const RETRY_DELAYS_MS = [500, 1000, 2000];

/** Statuses worth retrying: the API is starting, restarting or overloaded. */
const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch` that retries while the API is unreachable or answering 5xx.
 * A 4xx is returned at once: asking again will not change the answer.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!isTransient(response.status) || attempt === RETRY_DELAYS_MS.length) return response;
      lastError = new Error(`The API answered ${response.status}.`);
    } catch (cause) {
      /* Connection refused, reset, DNS: the API is not reachable right now. */
      lastError = cause;
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError;
}

/** In-memory last good answers, keyed by what was asked. */
const lastGood = new Map<string, unknown>();

/**
 * Where snapshots are written. Read from the environment first so Next's file
 * tracer cannot resolve it at build time: given a bare `tmpdir()` it treats the
 * temp folder as a dependency and tries to copy it into `.next/standalone`.
 */
function snapshotPath(key: string): string {
  const dir = process.env.SITE_SNAPSHOT_DIR || tmpdir();
  return join(dir, `aj-smart-biz-technology-${key.replace(/[^a-z0-9_-]/gi, '_')}.json`);
}

/** Remember a good answer: memory first, then a best-effort file write. */
async function remember<T>(key: string, value: T): Promise<void> {
  lastGood.set(key, value);
  try {
    await writeFile(snapshotPath(key), JSON.stringify(value), 'utf8');
  } catch {
    /* A read-only disk costs us the file layer only; memory still works. */
  }
}

/** The last good answer for `key`, from memory or the snapshot file. */
async function recall<T>(key: string): Promise<T | undefined> {
  if (lastGood.has(key)) return lastGood.get(key) as T;
  try {
    const value = JSON.parse(await readFile(snapshotPath(key), 'utf8')) as T;
    lastGood.set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

async function fetchSite(): Promise<Site> {
  const response = await fetchWithRetry(`${API_URL}/website/bootstrap`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE_SECONDS, tags: ['site'] },
  });

  if (!response.ok) {
    throw new Error(`The API answered ${response.status} for /website/bootstrap.`);
  }

  const payload = (await response.json()) as ApiEnvelope<Site>;

  if (!payload?.success || !payload.data) {
    throw new Error(`The API returned an unsuccessful response: ${payload?.message ?? 'no message'}`);
  }

  return {
    content: payload.data.content ?? {},
    plans: payload.data.plans ?? [],
    capabilities: payload.data.capabilities ?? [],
    businessTypes: payload.data.businessTypes ?? [],
    faqs: payload.data.faqs ?? [],
  };
}

/**
 * Everything this site renders, in one call.
 *
 * `cache()` dedupes the many sections that each call this into **one** request
 * per render pass.
 *
 * On failure it falls back to the last good response (see "Surviving a backend
 * restart" above). It throws only when the API is down and has never answered:
 * there is no wording in this project to fall back to, and inventing some would
 * put a price on the page that nobody agreed to.
 */
export const getSite = cache(async (): Promise<Site> => {
  try {
    const site = await fetchSite();
    await remember('site', site);
    return site;
  } catch (cause) {
    const stale = await recall<Site>('site');
    if (stale) {
      console.warn('[api] /website/bootstrap failed; serving the last good response.', cause);
      return stale;
    }
    throw new Error(`Could not reach the API at ${API_URL}. Is the backend running?`, { cause });
  }
});

/* ------------------------------------------------------------------ *
 * Writing to it
 * ------------------------------------------------------------------ */

export interface EnquiryPayload {
  kind: 'demo' | 'contact';
  name: string;
  businessName?: string;
  phone?: string;
  email?: string;
  city?: string;
  businessType?: string;
  plan?: string;
  message?: string;
  source?: string;
  /**
   * The browser's tracking id, where the page had one.
   *
   * Only ever *attributes* the enquiry to traffic already recorded. Optional
   * and unverified — a wrong one costs a line in a report and can reach
   * nothing, because the API does a lookup that either matches one of its own
   * rows or does not.
   */
  deviceId?: string;
}

export type EnquiryResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Sends one enquiry to the API.
 *
 * Returns a result rather than throwing: a form that loses what somebody typed
 * because the API was slow is worse than one that says so and keeps the fields
 * filled in. The caller decides what to show, and still offers the WhatsApp
 * handoff either way — so a failure here costs us the record, not the lead.
 */
/* ------------------------------------------------------------------ *
 * The template showcase
 * ------------------------------------------------------------------ */

/** One of the tenant site designs in `themes/`, as the API names it. */
export interface TemplateDesign {
  key: string;
  name: string;
  /** `light`, `dark` or `glass`: which preview surface the card draws. */
  look: string;
  summary: string;
}

/**
 * One demo company in the showcase. Read live from that company by the API,
 * so every field here is true of the demo it links to.
 */
export interface ShowcaseTemplate {
  id: number;
  title: string;
  summary: string | null;
  featured: boolean;
  businessType: { name: string; icon: string | null } | null;
  design: TemplateDesign;
  /** The company's brand colours, or nulls when it uses the design's own. */
  palette: { primary: string | null; secondary: string | null; accent: string | null; mode: string | null };
  headline: { eyebrow: string | null; title: string; subtitle: string | null } | null;
  /** Up to four featured service or product names. */
  highlights: string[];
  /** The website sections that are live on the demo. */
  sections: string[];
  demoUrl: string | null;
}

export interface Showcase {
  designs: TemplateDesign[];
  templates: ShowcaseTemplate[];
}

/**
 * The template showcase, optionally narrowed to one design.
 *
 * Its own request rather than part of `getSite`: it is only on two pages,
 * and the API reads every demo company to build it, which is not work every
 * page on the site should wait for. A failure gives an empty showcase rather
 * than an error page, because the rest of the page is still worth showing.
 */
export const getTemplates = cache(async (design?: string): Promise<Showcase> => {
  const query = design ? `?design=${encodeURIComponent(design)}` : '';
  const key = `templates${design ? `-${design}` : ''}`;
  try {
    const response = await fetchWithRetry(`${API_URL}/website/templates${query}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS, tags: ['templates'] },
    });
    if (!response.ok) throw new Error(`The API answered ${response.status} for /website/templates.`);
    const payload = (await response.json()) as ApiEnvelope<Showcase>;
    const showcase: Showcase = {
      designs: payload?.data?.designs ?? [],
      templates: payload?.data?.templates ?? [],
    };
    await remember(key, showcase);
    return showcase;
  } catch {
    /* The last good showcase if there is one, else an empty one: the rest of
       the page is still worth showing. */
    return (await recall<Showcase>(key)) ?? { designs: [], templates: [] };
  }
});

export async function submitEnquiry(payload: EnquiryPayload): Promise<EnquiryResult> {
  try {
    const response = await fetch(`${API_URL}/website/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const body = (await response.json().catch(() => null)) as
      | (ApiEnvelope<{ id: number }> & { errors?: { message: string }[] })
      | null;

    if (!response.ok || !body?.success) {
      /* The API's own validation message where there is one — it is written
         for the person filling the form, not for a log. */
      const detail = body?.errors?.[0]?.message || body?.message;
      return { ok: false, error: detail || `The server answered ${response.status}.` };
    }

    return { ok: true, id: body.data.id };
  } catch {
    return { ok: false, error: 'We could not reach our server just now.' };
  }
}
