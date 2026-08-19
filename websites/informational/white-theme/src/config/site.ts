/**
 * Everything on this page that the company-details API does not supply.
 *
 * The API owns the tenant's identity — name, tagline, logo, favicon, theme,
 * contact details, address and branches. The copy below is the informational
 * template's own. Where a line should carry the tenant's name it uses
 * `{company}`, filled in at render time.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: NavLink;
  secondaryCta?: NavLink;
}

export interface Highlight {
  title: string;
  body: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'What we do', href: '#services' },
  { label: 'Why us', href: '#why' },
  { label: 'Contact', href: '#contact' },
];

export const SLIDES: Slide[] = [
  {
    eyebrow: 'Welcome',
    title: '{company}',
    body: '{tagline}',
    primaryCta: { label: 'Get in touch', href: '#contact' },
    secondaryCta: { label: 'What we do', href: '#services' },
  },
  {
    eyebrow: 'Built on trust',
    title: 'Work that holds up',
    body: 'Every engagement starts with understanding what you actually need, and ends with something you can rely on long after we have handed it over.',
    primaryCta: { label: 'About us', href: '#about' },
    secondaryCta: { label: 'Why us', href: '#why' },
  },
  {
    eyebrow: 'Here when you need us',
    title: 'People, not ticket numbers',
    body: 'You get the same team that built it — reachable, accountable and quick to answer, whether the question is small or serious.',
    primaryCta: { label: 'Talk to us', href: '#contact' },
  },
];

/** Auto-advance interval for the slider, in milliseconds. */
export const SLIDE_INTERVAL_MS = 6000;

export const SERVICES: Highlight[] = [
  {
    title: 'Consulting',
    body: 'A clear read on where you are and what to do next, written in plain language and costed honestly.',
  },
  {
    title: 'Implementation',
    body: 'We build and roll out what was agreed, on the timeline that was agreed, and tell you early when something changes.',
  },
  {
    title: 'Support',
    body: 'Ongoing care after go-live — monitoring, small changes and a straight answer whenever you call.',
  },
];

export const WHY_US: Highlight[] = [
  { title: 'Fixed, honest pricing', body: 'You know the number before work starts. No line items appear later.' },
  { title: 'One team throughout', body: 'The people who scoped the work are the people who deliver it.' },
  { title: 'Documented handover', body: 'Nothing is left in someone\u2019s head. You own what we build, in full.' },
  { title: 'Answered the same day', body: 'Questions get a reply within business hours, not a queue position.' },
];

export const STATS: { value: string; label: string }[] = [
  { value: '12+', label: 'Years in business' },
  { value: '250+', label: 'Projects delivered' },
  { value: '98%', label: 'Clients who stay' },
  { value: '24h', label: 'Typical reply time' },
];

/**
 * Shown only when a host resolved to no tenant at all — a real company's own
 * email, phone, address and opening hours come from the API.
 */
export const CONTACT_FALLBACK = {
  email: 'hello@example.com',
  phone: '+91 00000 00000',
  address: 'Address to be configured',
  hours: 'Mon\u2013Sat, 9:30am \u2013 6:30pm',
};

/* ------------------------------------------------------------------ *
 * Holding page
 * ------------------------------------------------------------------ */

/**
 * Shown instead of the website when the platform has stopped serving this
 * tenant — the plan lapsed, was suspended, or was never assigned.
 *
 * Two audiences read this page and they want different things: a customer who
 * followed a link wants to know the business still exists and how to reach it,
 * and the owner wants to know what to do about it. So the headline speaks to the
 * visitor and the action speaks to the owner. Nothing here names a plan, a price
 * or a date — the API does not return them, and a company's billing state is not
 * its customers' business.
 *
 * `{company}` is filled in with the tenant's name. Edit freely.
 */
export const PLAN_NOTICE = {
  /** Where "Renew your plan" sends the owner. Their company workspace. */
  renewUrl: 'http://localhost:4300/plan',
  renewLabel: 'Renew your plan',

  /** Per-reason copy. `no_plan` and `suspended` fall back to `expired`'s tone. */
  expired: {
    eyebrow: 'Temporarily unavailable',
    title: 'This website is offline for now',
    body: '{company} is still here — the website subscription simply needs renewing before the pages come back. If you were looking for us, the contact details below still reach us.',
    ownerNote: 'Are you the owner? Renewing the plan brings the site back immediately.',
  },
  suspended: {
    eyebrow: 'Temporarily unavailable',
    title: 'This website is paused',
    body: '{company} is still here — the website has been paused and will return shortly. The contact details below still reach us.',
    ownerNote: 'Are you the owner? Your plan is on hold — the platform can switch it back on.',
  },
  no_plan: {
    eyebrow: 'Coming soon',
    title: 'This website is not live yet',
    body: '{company} has not published its website yet. Please check back shortly.',
    ownerNote: 'Are you the owner? Choose a plan to publish this site.',
  },
} as const;
