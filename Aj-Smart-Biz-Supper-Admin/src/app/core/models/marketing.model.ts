import { AuditFields, LeadStage, LeadTally } from './domain.model';

/**
 * Our own marketing site — the Aj Smart Biz Technology pages.
 *
 * Not a tenant's website. Everything here is the copy, the FAQ and the
 * enquiries belonging to the site that *sells* the platform, which is why it is
 * managed from this console and nowhere else.
 */

/* ------------------------------------------------------------------ *
 * The writing
 * ------------------------------------------------------------------ */

/**
 * The sections the site reads, and what each one holds.
 *
 * This mirrors `MARKETING_CONTENT_KEY` in the API, which validates against the
 * same list — a key that is not one of these is refused, so a typo cannot
 * create a section nothing will ever render. Adding a section to the site means
 * adding it to the API's constants first, then here.
 */
export type MarketingContentKey =
  | 'site'
  | 'contact'
  | 'hero'
  | 'steps'
  | 'promises'
  | 'recharge'
  | 'cta'
  | 'services_page'
  | 'plans_page'
  | 'demo_page'
  | 'about_page'
  | 'contact_page'
  | 'faq_intro';

export interface MarketingContent extends AuditFields {
  key: MarketingContentKey;
  /** What the section is, for whoever edits it. Never rendered on the site. */
  label?: string | null;
  /**
   * The section itself.
   *
   * **Its shape is different for every key** — `hero` is a headline and two
   * buttons, `steps` is four cards, `faq_intro` is two lines — so this is
   * genuinely `unknown` rather than lazily typed. Nothing on either side
   * validates it, which is why the site treats every field as optional and the
   * editor here works on the JSON rather than pretending to know the fields.
   */
  payload: Record<string, unknown>;
}

/**
 * One row of the editor's list.
 *
 * `MARKETING_SECTIONS` is what gives each key a human name and a sentence of
 * explanation, because `services_page` on its own does not tell somebody which
 * page they are about to change.
 */
export interface MarketingSectionMeta {
  key: MarketingContentKey;
  name: string;
  /** Where it appears, in the words of somebody looking at the site. */
  where: string;
}

export const MARKETING_SECTIONS: MarketingSectionMeta[] = [
  { key: 'site', name: 'Brand & titles', where: 'The site name, tagline, browser title and the top menu.' },
  { key: 'contact', name: 'Contact details', where: 'Phone, WhatsApp, email, address and hours. Used in the header, footer and every call button.' },
  { key: 'hero', name: 'Home — hero', where: 'The first screen: headline, the two buttons, and the three assurances under them.' },
  { key: 'steps', name: 'Home — how it works', where: 'The four numbered steps.' },
  { key: 'promises', name: 'Home — what we take on', where: 'The six things that stop being the customer’s problem.' },
  { key: 'recharge', name: 'Why a monthly recharge', where: 'The four arguments for the pricing model. Shown on Plans and What you get.' },
  { key: 'cta', name: 'Closing band', where: 'The band at the bottom of every page.' },
  { key: 'services_page', name: 'What you get — page', where: 'Heading and the six things in every plan.' },
  { key: 'plans_page', name: 'Plans — page', where: 'Heading, intro and the footnote under the price cards.' },
  { key: 'demo_page', name: 'Book a demo — page', where: 'Heading, what to expect, and the heading over the trades.' },
  { key: 'about_page', name: 'About — page', where: 'The whole About page: intro, paragraphs and the four values.' },
  { key: 'contact_page', name: 'Contact — page', where: 'Heading, intro and the title over the form.' },
  { key: 'faq_intro', name: 'FAQ — heading', where: 'The two lines above the questions. The questions themselves are on the FAQ tab.' },
];

/* ------------------------------------------------------------------ *
 * The FAQ
 * ------------------------------------------------------------------ */

export interface MarketingFaq extends AuditFields {
  question: string;
  answer: string;
  /** Low to high. The order on the page is the order these get asked on calls. */
  sequence: number;
}

/* ------------------------------------------------------------------ *
 * The enquiries
 * ------------------------------------------------------------------ */

export type MarketingEnquiryKind = 'demo' | 'contact';
export type MarketingEnquiryStatus = 'new' | 'contacted' | 'converted' | 'closed';

/**
 * Somebody asking us to build them a website.
 *
 * **Not a lead.** A lead belongs to a tenant and is somebody who wants to buy
 * from them; this is somebody who wants to buy from *us* and has no company on
 * the platform yet — which is why there is no company to filter by.
 *
 * Everything except `status` and `note` is a stranger's typing, submitted
 * without a token. `businessName` is not a business that exists and `email` is
 * not an address anybody has confirmed. Treat a row as a message, not a record.
 */
export interface MarketingEnquiry extends Omit<AuditFields, 'status'> {
  /**
   * `Omit<..., 'status'>` because this one does not have the platform's
   * active/inactive status. An enquiry moves along a callback list instead, so
   * reusing `Status` here would type it as something it can never hold.
   */
  kind: MarketingEnquiryKind;
  name: string;
  businessName?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  /** Free text, including trades that are not on our list — often the useful part. */
  businessType?: string | null;
  plan?: string | null;
  message?: string | null;
  /** Which page the form was on. */
  source?: string | null;
  status: MarketingEnquiryStatus;
  /** Ours, written after calling back. Never the sender's. */
  note?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const ENQUIRY_STATUSES: { value: MarketingEnquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'closed', label: 'Closed' },
];

/* ------------------------------------------------------------------ *
 * Traffic on our own marketing site
 * ------------------------------------------------------------------ */

/**
 * One device that has visited the Technology site.
 *
 * The tenant twin is `Lead`, and the column names are deliberately the same so
 * a screen written against one reads against the other. What is missing is the
 * point: no company and no branch, because these rows are ours. `Omit` on the
 * status for the same reason `MarketingEnquiry` does it — a lead moves along a
 * sales stage, and its `status` is the platform's active/inactive, so both are
 * present and they mean different things.
 */
export interface MarketingLead extends AuditFields {
  deviceId: string;
  stage: LeadStage;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** The enquiry this device went on to send, where it sent one. */
  enquiryId?: number | null;
  enquiry?: MarketingEnquiry | null;

  visitCount: number;
  pageViewCount: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;

  /** First touch — the campaign that produced this lead. Never overwritten. */
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  firstLandingUrl?: string | null;
  firstReferrerHost?: string | null;

  /** Last touch — where they came from most recently. */
  lastLandingUrl?: string | null;
  lastReferrerHost?: string | null;

  deviceType?: string | null;
  os?: string | null;
  browser?: string | null;
  isBot: boolean;

  country?: string | null;
  region?: string | null;
  city?: string | null;
  language?: string | null;

  notes?: string | null;
}

/** One visit behind a lead. */
export interface MarketingLeadVisit {
  id: number;
  leadId: number;
  sessionId?: string | null;
  visitedAt: string;
  lastActivityAt?: string | null;
  pageViewCount: number;
  pageUrl?: string | null;
  path?: string | null;
  pageTitle?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  deviceType?: string | null;
  os?: string | null;
  browser?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface MarketingLeadSummary {
  total: number;
  today: number;
  thisWeek: number;
  /** Leads that went on to send the demo or contact form. */
  enquired: number;
  /** `enquired / total`, as a percentage to one decimal. Zero on an empty window. */
  conversionRate: number;
  totalVisits: number;
  stages: Record<LeadStage, number>;
  devices: LeadTally[];
}

/**
 * The campaign report.
 *
 * **First touch throughout**, so a visitor who arrives from an ad and returns
 * later by typing the address still counts for the ad.
 */
export interface MarketingLeadAnalytics {
  totals: { leads: number; visits: number; enquiries: number; conversionRate: number };
  stages: Record<LeadStage, number>;
  devices: LeadTally[];
  utm: {
    source: LeadTally[];
    medium: LeadTally[];
    campaign: LeadTally[];
    term: LeadTally[];
    content: LeadTally[];
  };
  /**
   * Campaigns by **enquiries produced**, not by traffic.
   *
   * The one to read next to `utm.campaign`: that is how loud a campaign was,
   * this is whether it worked. A campaign can win the first and lose this.
   */
  campaignEnquiries: LeadTally[];
  referrers: LeadTally[];
  landingPages: LeadTally[];
  geo: { cities: LeadTally[]; countries: LeadTally[] };
  tech: { browsers: LeadTally[]; os: LeadTally[] };
  daily: { day: string; total: number }[];
}
