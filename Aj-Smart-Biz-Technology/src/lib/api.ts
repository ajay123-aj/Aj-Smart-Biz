import { cache } from 'react';

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
}

export interface Site {
  content: SiteContent;
  plans: Plan[];
  capabilities: Capability[];
  businessTypes: BusinessType[];
  faqs: Faq[];
}

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

/**
 * Everything this site renders, in one call.
 *
 * `cache()` is what lets each section go on reading its own content the way it
 * always did: the home page renders eight components that each call `getSite`,
 * and React dedupes them into **one** request per render pass. Passing the
 * payload down through props would work too and would make every component's
 * signature depend on what its siblings need.
 *
 * Throws on a failure rather than returning a default. There is no wording in
 * this project to fall back to, and inventing some would put a price on the
 * page that nobody agreed to — a visible error is the honest failure. See
 * `REVALIDATE_SECONDS` for why a blip does not reach visitors.
 */
export const getSite = cache(async (): Promise<Site> => {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/website/bootstrap`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS, tags: ['site'] },
    });
  } catch (cause) {
    /* Connection refused, DNS, TLS — the API was not reachable at all. */
    throw new Error(`Could not reach the API at ${API_URL}. Is the backend running?`, { cause });
  }

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
