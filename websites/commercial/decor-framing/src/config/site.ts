/**
 * Everything on this page that the company-details API does not supply.
 *
 * The API owns the tenant's identity — name, tagline, logo, favicon, theme,
 * contact details, address and branches — and it owns the content too: the
 * services, the price list, the retail shelf, the team, the gallery, the
 * reviews and the articles all arrive from `/website/company-details`. The copy
 * below is the **Gilt template's own**, and every line of it is a fallback
 * for a host that resolved to no tenant at all. Where a line should carry the
 * tenant's name it uses `{company}`, filled in at render time.
 *
 * Nothing here is a framing shop's actual content. A real shop's moulding list,
 * its wall art and what it charges to mount an A2 print live in its own
 * database rows, which is why this file has no price in it.
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
  eyebrow: 'Bring it in',
  title: 'Tell {company} what you are framing',
  body: 'A photograph of the piece and a rough size is enough to start. We will come back with what it would look like in two or three mouldings, and what each of them costs.',
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

  storyEyebrow: 'The workshop',
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
    eyebrow: 'Framed on site',
    title: 'Cut, mounted and glazed here',
    body: 'The moulding is cut, joined and fitted in our own workshop, which is the only arrangement where the person who advised you on it is the person answerable for it.',
    primaryCta: { label: 'About us', href: '/about' },
    secondaryCta: { label: 'Talk to us', href: '/contact' },
  },
  {
    eyebrow: 'Bring the piece',
    title: 'Nothing is quoted from a photograph',
    body: 'Every frame is decided with the work on the counter and three mouldings held against it. A size and a price agreed over the phone is a guess somebody has to live with.',
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
  lead: 'A workshop, a wall of mouldings, and somebody who has cut them before.',
  paragraphs: [
    'We are a small workshop that would rather take on fewer jobs and finish each of them properly. Every frame is decided with the piece on the counter, so nothing is cut before somebody has actually looked at what is going in it.',
    'Most of the work on our bench was sent by somebody whose work is already on a wall. That is the only marketing figure we pay attention to.',
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
  eyebrow: 'At the bench',
  title: 'The people you will be working with',
  lede: 'Small enough that you will know everyone by name, and reach them directly.',
};

/** Headings for the Gallery section. The pictures come from the API. */
export const GALLERY_COPY = {
  eyebrow: 'On the wall',
  title: 'A look at what we have framed',
  lede: 'A selection of recent work. Every piece here was cut for someone, to fit something they owned.',
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

  /* ------------------------- the other two bands ------------------------- */
  /*
   * The categories band and the offers band, each with its own wording, for the
   * reason the catalogue has three sets: "what kinds of work we do" and "what is
   * reduced this month" are different sentences, and one heading cannot make
   * both arguments.
   */
  categoriesEyebrow: 'What we do',
  categoriesTitle: 'Find what you came for',
  categoriesLede: 'The kinds of work we take on. Pick one to see everything in it.',
  offersEyebrow: 'This month',
  offersTitle: 'On offer right now',
  offersLede: 'Reduced for a while. Prices go back up when the offer ends.',
  /** The link out of a shortened band. */
  moreOffers: 'See every offer',
  /** On a card that can be booked, where "Enquire" is the wrong promise. */
  book: 'Book a time',
  /** The filter row above the list, and the way out of a filtered view. */
  allCategories: 'Everything',

  /* ---------------------------- the booking ------------------------------ */
  /*
   * The furniture around the diary. The heading, the note and the button's
   * label are the tenant's - they come from the API - and everything here is
   * what no company needs to rewrite.
   */
  bookHeading: 'Pick a time',
  bookDate: 'Day',
  bookNoSlots: 'Nothing left on that day.',
  bookClosed: 'We are closed that day.',
  bookChoose: 'Choose a time',
  bookConfirm: 'Request this time',
  bookSending: 'Requesting…',
  bookSignIn: 'Sign in to book',
  bookSignInWhy: 'Appointments are kept on your account, so you can see what you have booked.',
  bookRequested: 'Requested — we will confirm it shortly',
  bookAs: 'Booking as',
  bookWhatNext: 'We will confirm it shortly. You can see the answer on your account.',
  /** Beside a price on a card that has a duration. */
  durationLabel: 'Takes',

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

/**
 * The other two service bands on the home page.
 *
 * Kept beside `SERVICES_HOME_LIMIT` rather than folded into it, because the
 * three bands are three arguments and are shortened for different reasons: the
 * services band is a sample of the price list, the offers band is everything a
 * shop is actually promoting (there are rarely more than a few), and the
 * categories band is a map that stops being one past about six headings.
 *
 * The API applies its own caps over these, so lowering a number here shortens a
 * band and raising it past the platform's ceiling changes nothing - which is the
 * right way round, since the payload is the thing worth keeping small.
 */
export const SERVICE_HOME_LIMITS = { categories: 6, offers: 3 } as const;

/* ------------------------------------------------------------------ *
 * The blog
 * ------------------------------------------------------------------ */

/**
 * The blog's wording of last resort, and the labels around it.
 *
 * The same standing `SERVICES_COPY` has: the API fills the heading, the lede and
 * the button from its own defaults already, so these apply only to a block that
 * arrived with something blank. What is genuinely this file's, and is never the
 * tenant's, is the furniture — the word "read", the breadcrumb, the labels on
 * the links to the next article. No company needs to rewrite those, and every
 * one of them that became a setting would be a field somebody has to fill in.
 *
 * There is deliberately no fallback **content** anywhere near this section. The
 * platform knows nothing about what a business has been doing, and an invented
 * article is a company publishing something it never wrote.
 */
export const BLOG_COPY = {
  eyebrow: 'Latest',
  title: 'News from {company}',
  lede: 'What we have been working on, and anything worth knowing before you get in touch.',
  /** Under each card. */
  cta: 'Read more',

  /** The page's browser title. The heading on it is the tenant's. */
  metaTitle: 'Blog',
  /** The link out of the home band when it is showing only part of the list. */
  more: 'Read everything',
  /** Beside the date on a card. `{n}` is the estimate. */
  readTime: '{n} min read',
  /** Above the byline on an article. */
  byLine: 'By {name}',
  /** The two links at the foot of an article. */
  previous: 'Previous post',
  next: 'Next post',
  backToBlog: 'All posts',
  /** The tag filter's heading on the archive, and the way out of it. */
  taggedWith: 'Tagged {tag}',
  clearTag: 'Show everything',
  /** The pager. */
  newer: 'Newer',
  older: 'Older',
  /** What the archive says when a tag matches nothing — a stale shared link. */
  emptyTag: 'Nothing is filed under that.',
} as const;

/**
 * How many posts the home page shows before it stops and links to the archive.
 *
 * Three rather than the six the payload carries: the home band is an invitation
 * to read, not the archive. The API's own cap is the ceiling over this one, so
 * lowering it here shortens the band and raising it past six changes nothing
 * — which is the right way round, since the payload is the thing worth
 * keeping small.
 */
export const BLOG_HOME_LIMIT = 3;

/** The archive's page size. Matches the API's default, which is the real one. */
export const BLOG_PAGE_SIZE = 9;

/* ------------------------------------------------------------------ *
 * Products, categories and offers
 * ------------------------------------------------------------------ */

/**
 * The catalogue's wording of last resort, and the labels around it.
 *
 * The same standing `SERVICES_COPY` has, and for the same reason: the API fills
 * every heading from the tenant's own settings, so these apply only to a block
 * that arrived with a field blank. There are no fallback *products* for the
 * reason there are no fallback services, only more so — an invented service is
 * work a business may not do, and an invented product with a price on it is a
 * customer arriving with money for something that does not exist.
 *
 * Everything below the copy is the template's own chrome: labels, not the
 * tenant's words, and nothing a company needs to rewrite.
 */
export const PRODUCTS_COPY = {
  eyebrow: 'What we sell',
  title: 'The {company} range',
  lede: 'Everything we stock, with what it costs.',
  /** The button on each card, where the card has none of its own. */
  cta: 'View details',

  categoriesEyebrow: 'Browse',
  categoriesTitle: 'Shop by category',
  categoriesLede: 'Start with the kind of thing you are after.',

  offersEyebrow: 'On offer',
  offersTitle: 'Reduced right now',
  offersLede: 'Current reductions.',

  /* ------------------------------ the pages ------------------------------ */
  metaTitle: 'Products',
  categoriesMetaTitle: 'Categories',
  offersMetaTitle: 'Offers',

  /** The links out of the three home bands, each saying where it goes. */
  moreProducts: 'See the whole range',
  moreCategories: 'See all categories',
  moreOffers: 'See every offer',

  /* ------------------------------- the cards ------------------------------ */
  includesLabel: 'Includes',
  specsLabel: 'Specifications',
  skuLabel: 'Ref',
  /** Above the strip of thumbnails on a product page. */
  galleryLabel: 'More photographs',
  /** A product with no photograph at all. Rendered as text, never as a broken frame. */
  noImage: 'No photograph',

  /** Availability, in the words a visitor needs rather than the API's keys. */
  inStock: 'In stock',
  outOfStock: 'Out of stock',
  madeToOrder: 'Made to order',

  /** On a card with nothing filed against it, and on the uncategorised group. */
  uncategorised: 'Everything else',
  /** The count under a category tile — `{n}` is the number. */
  categoryCount: '{n} products',
  categoryCountOne: '1 product',

  /* ------------------------------- filtering ------------------------------ */
  allProducts: 'Everything',
  filterLabel: 'Category',
  /** When a category filter matches nothing — only reachable from a stale link. */
  noMatches: 'Nothing here yet.',
  backToProducts: 'Back to everything',

  /** The badge on an offer card when the tenant wrote no wording and the
      platform could not compute a percentage — see `ProductItem.onOffer`. */
  offerBadge: 'Offer',
} as const;

/**
 * The cart's wording that is **not** the tenant's to write.
 *
 * The labels a business chooses — what the button says, what the basket is
 * called, what it promises about delivery — all come from the API, because they
 * are the parts a shop has opinions about. What is left here is the machinery:
 * the word for a quantity stepper, the line that says a basket is empty, the
 * error shown when somebody presses Send with no phone number in the box. A
 * tenant has no view on those and should not be asked for one.
 */
export const ORDERS_COPY = {
  /** The header button, and its label for screen readers. */
  cartLabel: 'Basket',
  cartOpen: 'Open your basket',
  /** `{n}` is the number of items. Announced, not printed. */
  cartCount: '{n} items in your basket',
  cartCountOne: '1 item in your basket',

  empty: 'Your basket is empty.',
  emptyHint: 'Add something from the catalogue and it will appear here.',
  close: 'Close',

  /* -------------------------------- lines -------------------------------- */
  remove: 'Remove',
  removeOne: 'Remove {name}',
  increase: 'One more',
  decrease: 'One fewer',
  quantity: 'Quantity',
  /** On a line whose product is priced in words, so it has no number to total. */
  priceOnRequest: 'Price on request',

  /* -------------------------------- totals ------------------------------- */
  subtotal: 'Total',
  /**
   * The line under the total whenever anything in the basket is priced in
   * words. The total is then genuinely incomplete, and saying so is the only
   * honest thing to print beside it.
   */
  totalPartial: 'Some items are priced on request and are not in this total.',
  /** `{amount}` is the tenant's minimum, formatted in their own currency. */
  belowMinimum: 'Orders start at {amount}. Add a little more to send this one.',

  /* ------------------------------- the form ------------------------------ */
  detailsTitle: 'Your details',
  name: 'Your name',
  phone: 'Phone number',
  address: 'Delivery address',
  /** Above the saved-address picker, for a signed-in customer. */
  deliverTo: 'Deliver to',
  /** The last option in it: a one-off delivery somewhere not on the list. */
  addressElsewhere: 'Somewhere else — I will type it',

  /* ------------------------- signed in, or not ------------------------- */
  /** `{name}` is the account holder. Said once instead of two disabled boxes. */
  orderingAs: 'Ordering as {name}.',
  notYou: 'Not you?',
  /** On a shop that takes orders only from account holders. */
  signInToOrder: 'Sign in to place this order',
  signInWhy: 'Your basket will be waiting when you come back.',
  notes: 'Anything else we should know',
  notesHint: 'Optional',
  required: 'Required',
  /** Shown under a phone box holding something that is not a phone number. */
  phoneInvalid: 'That does not look like a phone number.',

  /* ------------------------------- sending ------------------------------- */
  /** While the order is being written down. It is a round trip, so it is said. */
  placing: 'Placing your order…',
  sendHint: 'We will write this down and then open WhatsApp so you can send it.',
  payHint: 'We will write this down and then open your payment app.',

  /**
   * The confirmation. It says **placed**, not sent, and the difference is the
   * whole of it: the order is recorded in the shop's own order book whether or
   * not the message that follows is ever sent.
   */
  placed: 'Your order is placed.',
  placedHint: 'Send us the message below so we can confirm it straight away.',
  /**
   * In `whatsapp` mode, where WhatsApp has been opened for them.
   *
   * It names the button as well as the tab, because the tab is the one part of
   * this that a browser is allowed to refuse - and somebody reading "it is open"
   * with nothing open in front of them is worse served than by one extra line.
   */
  placedHintOpened: 'WhatsApp should be open with your order — press send there. If it did not open, use the button below.',
  /** When the shop publishes no number, so there is no message to send. */
  placedHintQuiet: 'We have it, and we will be in touch to confirm.',
  /** The step after payment, in `payment` mode with a number published. */
  sendAfterPay: 'Send the order on WhatsApp',
  payNow: 'Pay now',
  startAnother: 'Start another order',

  /* -------------------------------- buttons ------------------------------ */
  /** Replaces the tenant's Add-to-cart label once the thing is in the basket. */
  added: 'In your basket',
  /** On a product the tenant has marked not orderable, or that is out of stock. */
  unavailable: 'Not available to order',
} as const;

/**
 * How many of each the home page shows before its *View all* link takes over.
 *
 * These are the template's own ceilings on top of the API's. The API already
 * slices `home` to its own limits; these clamp again so a theme that wants a
 * tighter home page can have one without the platform changing for everybody.
 * Whichever is smaller wins, which is the safe direction.
 */
export const CATALOGUE_HOME_LIMITS = { categories: 6, products: 8, offers: 4 } as const;

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
