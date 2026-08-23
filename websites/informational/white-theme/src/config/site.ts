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

/**
 * The nav.
 *
 * Every entry is a real route now. The two anchor links this bar used to carry
 * pointed at the template's own "what we do" and "why us" sections, which are
 * gone — nothing on the site is the template's words any more.
 */
/**
 * The menu the template would use on its own.
 *
 * The API sends the real one — named by the tenant, with the pages they are
 * not publishing already removed — so this is only the shape of it, and the
 * fallback in `FALLBACK_COMPANY` for when there is no tenant to ask.
 */
export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'About us', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/** The band that closes the home page and sends people to `/contact`. */
/**
 * The band that closes every page. One block of copy, because the band is one
 * component — see `CtaBand`. It said something different on each page before,
 * which is how the two of them drifted apart.
 */
export const CTA_BAND = {
  eyebrow: 'Next step',
  title: 'Tell {company} what you need',
  body: 'A short message is enough to start. We will come back with questions, a scope and a number — usually within a working day.',
  button: 'Contact us →',
} as const;

/**
 * Copy for the Contact page. Its heading and intro come from the tenant's own
 * Contact settings; these are the labels around them.
 */
export const CONTACT_PAGE = {
  metaTitle: 'Contact',
  formTitle: 'Send us a message',
  formLede: 'Fill this in and it opens in your own app, ready to send — nothing is stored here.',
  detailsTitle: 'Reach us directly',
  shareLabel: 'Know someone who needs us?',
  locationsEyebrow: 'Where to find us',
  locationsTitle: 'Our locations',
  mapLink: 'Open in maps →',
} as const;

/** Copy for the About page. Everything factual on it comes from the API. */
export const ABOUT_PAGE = {
  metaTitle: 'About us',

  storyEyebrow: 'The story',
  storyTitle: 'How we got here',
  /** When the tenant has written nothing and the profile yielded nothing either. */
  emptyStory: 'There is more to say about {company} than fits here — get in touch and ask.',

} as const;

export const SLIDES: Slide[] = [
  {
    eyebrow: 'Welcome',
    title: '{company}',
    body: '{tagline}',
    primaryCta: { label: 'Get in touch', href: '/contact' },
    secondaryCta: { label: 'About us', href: '/about' },
  },
  {
    eyebrow: 'Built on trust',
    title: 'Work that holds up',
    body: 'Every engagement starts with understanding what you actually need, and ends with something you can rely on long after we have handed it over.',
    primaryCta: { label: 'About us', href: '/about' },
    secondaryCta: { label: 'Talk to us', href: '/contact' },
  },
  {
    eyebrow: 'Here when you need us',
    title: 'People, not ticket numbers',
    body: 'You get the same team that built it — reachable, accountable and quick to answer, whether the question is small or serious.',
    primaryCta: { label: 'Talk to us', href: '/contact' },
  },
];

/** Auto-advance interval for the slider, in milliseconds. */
export const SLIDE_INTERVAL_MS = 6000;



/**
 * About copy for a host that resolved to no tenant at all.
 *
 * A real company that has not bought the About functionality does NOT get this
 * — it gets a section built from its own profile instead, because inventing
 * prose about a real business is worse than saying less. See `AboutSection`.
 */
export const ABOUT_FALLBACK = {
  eyebrow: 'About us',
  title: 'Who {company} is',
  lead: 'Straightforward work, delivered when we said it would be.',
  paragraphs: [
    'We are a small team that prefers finishing things to announcing them. Work is scoped honestly, priced once, and handed over documented — so what you get on the last day is what you were shown on the first.',
    'Most of our work comes from people we have already worked with. That is the only marketing metric we pay attention to.',
  ],
};

/** Headings for the Team section. The people themselves come from the API. */
export const TEAM_COPY = {
  eyebrow: 'Our team',
  title: 'The people you will be working with',
  lede: 'Small enough that you will know everyone by name, and reach them directly.',
};

/** Headings for the Gallery section. The pictures come from the API. */
export const GALLERY_COPY = {
  eyebrow: 'Our work',
  title: 'A look at what we have made',
  lede: 'A selection of recent work. Every piece here was made for someone.',
};

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
