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

/**
 * Headings for the band of figures. The figures themselves come from the API,
 * and so does this wording — the tenant writes it on the About screen.
 *
 * What is left here is the standing `ABOUT_FALLBACK` has: the words to use if
 * the block arrives with a field blank, or does not arrive at all because the
 * API predates it. Safe to invent, unlike the figures: a heading over a
 * company's own numbers makes no claim the numbers do not already make.
 */
export const STATS_COPY = {
  eyebrow: 'By the numbers',
  title: 'What {company} has to show for it',
  lead: 'A few figures that say more about the work than a page of prose would.',
} as const;

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

/**
 * Shown instead of the website when the API cannot be reached.
 *
 * Distinct from `PLAN_NOTICE`, which is for a tenant the platform has stopped
 * serving — that is a decision, this is a failure, and they read differently.
 * Nothing here names the company, because with the API down nothing here knows
 * which company it is.
 */
export const SERVICE_UNAVAILABLE = {
  title: 'This website is temporarily unavailable',
  body: 'We could not load the page just now. Nothing is wrong at your end — please try again in a moment.',
  retry: 'Try again',
  /**
   * Enough for whoever runs the site to know where to look, and no more. Naming
   * the host or the port of an internal service on a public page is not a
   * visitor's business.
   */
  note: 'If you are the site owner: the website could not reach its API.',
} as const;

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

/* ------------------------------------------------------------------ *
 * Services
 * ------------------------------------------------------------------ */

/**
 * The Services section's wording of last resort, and the labels around it.
 *
 * The copy comes from the API — the tenant writes it on Company Details →
 * Services — so `eyebrow`, `title`, `lede` and `cta` here are the same standing
 * `FEATURES_COPY` has: the words to use if a block arrives with a field blank,
 * so a heading is never an empty line.
 *
 * There are deliberately no `items`, for a stronger version of the reason
 * `FEATURES_COPY` has none. A benefit the platform invented is a claim nobody
 * can stand behind; a *service* the platform invented is a business advertising
 * work it may not do, and a visitor ringing up about it. A tenant with nothing
 * written here shows no section and has no Services page.
 *
 * `metaTitle`, `more` and `emptyPrice` are the template's own labels rather
 * than fallbacks — they are chrome, not the tenant's words.
 */
export const SERVICES_COPY = {
  eyebrow: 'What we do',
  title: 'How {company} can help',
  lede: 'What we take on, what is included, and roughly what it costs.',
  /** The button on each card. Rendered only where there is a Contact page. */
  cta: 'Enquire',

  /** The page's browser title. The heading on it is the tenant's. */
  metaTitle: 'Services',
  /** The link out of the home band when it is showing only part of the list. */
  more: 'See everything we do',
  /** Above the tick list on a card. */
  includesLabel: 'Includes',

  /* ----------------------------- the enquiry ----------------------------- */
  /*
   * The dialog's own furniture. Its heading and its introduction are the
   * tenant's — written on Company Details → Services — and everything here is
   * the labels around them, which no company needs to rewrite.
   */
  enquiryName: 'Your name',
  enquiryPhone: 'Mobile number',
  enquiryPhoneHint: 'So we can call you back',
  enquirySubmit: 'Send enquiry',
  enquirySending: 'Sending…',
  /** The button that opens the chat, on both the direct and the confirmed routes. */
  enquiryWhatsapp: 'Continue on WhatsApp',
  enquirySent: 'Enquiry sent',
  enquiryClose: 'Close',
  enquiryPrivacy: 'We use your number to reply to this enquiry and nothing else.',
} as const;

/**
 * How many services the home page shows before it stops and links to the page.
 *
 * Four rather than all of them: the home band is the case for looking further,
 * not the catalogue. A business with three services shows three and no link; one
 * with eleven shows four and a way to the rest, instead of turning the home page
 * into a price list.
 */
export const SERVICES_HOME_LIMIT = 4;

/* ------------------------------------------------------------------ *
 * Features / Benefits
 * ------------------------------------------------------------------ */

/**
 * The glyphs this template can draw.
 *
 * Drawn in `FeaturesSection` rather than uploaded, so the set is consistent
 * across every tenant and costs no request: one line weight, one 24-unit box,
 * one cap and join. A company picks a name from the platform's library in the
 * admin, and the API sends the name back here.
 *
 * The union mirrors that library — `FEATURE_ICONS` in the backend's constants,
 * which is the contract — but is not a promise to match it forever. The library
 * may grow a glyph before this template learns to draw it, which is exactly why
 * `BenefitCard.icon` is a plain string and why `Glyph` falls back to `spark`
 * instead of leaving a hole in the card.
 */
export type FeatureIcon =
  | 'spark'
  | 'star'
  | 'check'
  | 'lightbulb'
  | 'target'
  | 'layers'
  | 'shield'
  | 'award'
  | 'lock'
  | 'heart'
  | 'headset'
  | 'people'
  | 'phone'
  | 'message'
  | 'calendar'
  | 'clock'
  | 'rocket'
  | 'zap'
  | 'truck'
  | 'refresh'
  | 'wallet'
  | 'tag'
  | 'chart'
  | 'globe'
  | 'map-pin'
  | 'leaf'
  | 'tools';

/**
 * The section's wording of last resort.
 *
 * Not the tenant's, and no longer the page's usual source either: the cards and
 * the copy both come from the API now, and the section is absent altogether
 * from a site whose company has not switched Features on. What is left here is
 * the same standing `ABOUT_FALLBACK` has — the words to use if a block arrives
 * with a field blank, so a heading is never an empty line.
 *
 * There are deliberately no `items`. Six paragraphs about how a business works,
 * written by nobody who has met it, is wording no one can stand behind; a
 * tenant with nothing to say here shows no section rather than the template's
 * claims. The starting cards a company gets to edit live in the backend's
 * `DEFAULT_FEATURE_ITEMS`, seeded the first time it switches the section on.
 */
export const FEATURES_COPY = {
  eyebrow: 'What you get',
  title: 'Why people work with {company}',
  lede: 'The short version of how we work, and what it means for you once the job is underway.',
  /** Sends people to the Contact page. Rendered only when that page exists. */
  cta: 'Talk it through',
} as const;
