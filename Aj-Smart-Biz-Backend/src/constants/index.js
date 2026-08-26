'use strict';

const STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' };
const STATUS_VALUES = Object.values(STATUS);

const AUTH_SCOPE = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin' };

const SUPER_ADMIN_ROLE = { SUPER_ADMIN: 'super_admin', STAFF: 'staff' };

const BILLING_CYCLE = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  HALF_YEARLY: 'half_yearly',
  YEARLY: 'yearly',
  LIFETIME: 'lifetime',
};
const BILLING_CYCLE_DAYS = {
  monthly: 30,
  quarterly: 90,
  half_yearly: 180,
  yearly: 365,
  lifetime: 36500,
};

/**
 * Subscription lifecycle.
 *
 *   pending    scheduled ahead of time - starts on its own start date
 *   active     running
 *   suspended  paused by the platform; the term keeps its dates but access stops
 *   expired    the term ran out
 *   cancelled  ended early on purpose
 *   superseded replaced mid-term by an upgrade or downgrade
 */
const SUBSCRIPTION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUPERSEDED: 'superseded',
};
const SUBSCRIPTION_STATUS_VALUES = Object.values(SUBSCRIPTION_STATUS);

/** Statuses that still occupy the company's one-subscription-at-a-time slot. */
const OCCUPYING_SUBSCRIPTION_STATUSES = [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.SUSPENDED];

/** Statuses nothing can move out of - a new subscription is the only way forward. */
const TERMINAL_SUBSCRIPTION_STATUSES = [
  SUBSCRIPTION_STATUS.EXPIRED,
  SUBSCRIPTION_STATUS.CANCELLED,
  SUBSCRIPTION_STATUS.SUPERSEDED,
];

/**
 * Manual status transitions the API accepts, keyed by the current status.
 * Anything not listed here is rejected before it reaches the database.
 *
 * `superseded` is deliberately absent: it is what a plan change *does* to the
 * term it replaces, always alongside a replacement. Offering it as a standalone
 * move would let an operator strand a company with no plan and no record of why.
 */
const SUBSCRIPTION_TRANSITIONS = {
  [SUBSCRIPTION_STATUS.PENDING]: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.CANCELLED],
  [SUBSCRIPTION_STATUS.ACTIVE]: [
    SUBSCRIPTION_STATUS.SUSPENDED,
    SUBSCRIPTION_STATUS.CANCELLED,
    SUBSCRIPTION_STATUS.EXPIRED,
  ],
  [SUBSCRIPTION_STATUS.SUSPENDED]: [
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.CANCELLED,
    SUBSCRIPTION_STATUS.EXPIRED,
  ],
  [SUBSCRIPTION_STATUS.EXPIRED]: [],
  [SUBSCRIPTION_STATUS.CANCELLED]: [],
  [SUBSCRIPTION_STATUS.SUPERSEDED]: [],
};

/** How a subscription came to exist - drives the wording and the proration rules. */
const SUBSCRIPTION_CHANGE_TYPE = {
  NEW: 'new',
  RENEWAL: 'renewal',
  UPGRADE: 'upgrade',
  DOWNGRADE: 'downgrade',
  CROSSGRADE: 'crossgrade',
  REACTIVATION: 'reactivation',
  TRIAL: 'trial',
};
const SUBSCRIPTION_CHANGE_TYPE_VALUES = Object.values(SUBSCRIPTION_CHANGE_TYPE);

/** Every transition is appended to `subscription_events` under one of these. */
const SUBSCRIPTION_EVENT = {
  CREATED: 'created',
  ACTIVATED: 'activated',
  SCHEDULED: 'scheduled',
  RENEWED: 'renewed',
  UPGRADED: 'upgraded',
  DOWNGRADED: 'downgraded',
  CROSSGRADED: 'crossgraded',
  SUSPENDED: 'suspended',
  RESUMED: 'resumed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REACTIVATED: 'reactivated',
  SUPERSEDED: 'superseded',
  TERM_EXTENDED: 'term_extended',
  AUTO_RENEW_ON: 'auto_renew_on',
  AUTO_RENEW_OFF: 'auto_renew_off',
  PAYMENT_RECORDED: 'payment_recorded',
};
const SUBSCRIPTION_EVENT_VALUES = Object.values(SUBSCRIPTION_EVENT);

/** A subscription inside this many days of its end date counts as "expiring soon". */
const EXPIRY_WARNING_DAYS = 30;

/**
 * A tenant asking to be moved onto a different plan.
 *
 * Tenants cannot change their own subscription - that would let a company grant
 * itself higher limits without anyone collecting the money - so the "upgrade"
 * button in the company workspace raises one of these instead, and a super admin
 * approves it, which is what actually writes the subscription.
 */
const PLAN_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};
const PLAN_REQUEST_STATUS_VALUES = Object.values(PLAN_REQUEST_STATUS);

/** What the tenant is asking for, classified from the plan it is on today. */
const PLAN_REQUEST_TYPE = {
  NEW: 'new',
  UPGRADE: 'upgrade',
  DOWNGRADE: 'downgrade',
  RENEWAL: 'renewal',
};
const PLAN_REQUEST_TYPE_VALUES = Object.values(PLAN_REQUEST_TYPE);

const TRANSACTION_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const PAYMENT_MODE = {
  CASH: 'cash',
  UPI: 'upi',
  CARD: 'card',
  NET_BANKING: 'net_banking',
  CHEQUE: 'cheque',
  BANK_TRANSFER: 'bank_transfer',
  OTHER: 'other',
};
const PAYMENT_MODE_VALUES = Object.values(PAYMENT_MODE);

/**
 * The payment modes with the wording a console should show, served from the
 * catalogue endpoint.
 *
 * The list was written out in the platform console instead — twice, in two
 * components — so adding a mode here would have left both offering the old set
 * and neither saying so. A label is presentation, but it is presentation of a
 * value this file owns, and the two belong together.
 */
const PAYMENT_MODE_CATALOGUE = [
  { value: PAYMENT_MODE.CASH, label: 'Cash' },
  { value: PAYMENT_MODE.UPI, label: 'UPI' },
  { value: PAYMENT_MODE.CARD, label: 'Card' },
  { value: PAYMENT_MODE.NET_BANKING, label: 'Net banking' },
  { value: PAYMENT_MODE.CHEQUE, label: 'Cheque' },
  { value: PAYMENT_MODE.BANK_TRANSFER, label: 'Bank transfer' },
  { value: PAYMENT_MODE.OTHER, label: 'Other' },
];

/* ------------------------------------------------------------------ *
 * Optional functionality
 * ------------------------------------------------------------------ */

/**
 * Website and workspace features that are not part of the base product.
 *
 * Three things have to line up before one of these reaches a visitor:
 *
 *   1. the **plan** lists the key   (`plans.functionalities`, snapshotted onto
 *      the subscription like every other plan term)
 *   2. the **company** switches it on (`company_functionalities.status`)
 *   3. the company's plan is still being **served** (not expired or suspended)
 *
 * Miss any one and the public API simply omits the feature, so the website has
 * nothing to render — "otherwise not show" is enforced by absence rather than
 * by a flag the template has to remember to check.
 */
const FUNCTIONALITY = {
  WHATSAPP: 'whatsapp',
  SHARE_LINK: 'share_link',
  SERVICES: 'services',
  ABOUT_US: 'about_us',
  FIGURES: 'figures',
  TEAM: 'team',
  GALLERY: 'gallery',
  CONTACT_PAGE: 'contact_page',
  TESTIMONIALS: 'testimonials',
  FEATURES: 'features_benefits',
};
const FUNCTIONALITY_VALUES = Object.values(FUNCTIONALITY);

/**
 * The catalogue both consoles render: the super admin ticks these on a plan,
 * the tenant switches on whichever of them its plan granted. Adding a feature
 * to the platform means adding one entry here — nothing else enumerates them.
 */
const FUNCTIONALITY_CATALOGUE = [
  {
    key: FUNCTIONALITY.WHATSAPP,
    name: 'WhatsApp',
    icon: 'message-circle',
    summary: 'WhatsApp buttons on the public website, per enquiry type.',
    description:
      'Adds a floating chat button and inline "WhatsApp us" actions to the website, each pointing at the number the company set for that kind of conversation.',
    sequence: 1,
  },
  {
    key: FUNCTIONALITY.SHARE_LINK,
    name: 'Share link',
    icon: 'share-2',
    summary: 'A share button so visitors can pass the website on.',
    description:
      'Adds a share action to the website — the phone’s own share sheet where it exists, and copy-link plus per-channel links everywhere else.',
    sequence: 2,
  },
  {
    key: FUNCTIONALITY.SERVICES,
    name: 'Services',
    icon: 'briefcase',
    summary: 'The services the business offers, written and priced by the company.',
    description:
      'Adds a Services section to the home page and a Services page of its own — a card per service with a picture or an icon, what is included, and an optional price line. The menu entry is renameable, so a studio can call it Work and a clinic can call it Treatments. Switched off, both the section and the page are absent from the site: the platform knows nothing about what a business actually does, so there is no wording to fall back to.',
    sequence: 3,
  },
  {
    key: FUNCTIONALITY.ABOUT_US,
    name: 'About us',
    icon: 'file-text',
    summary: 'Write your own About page, in your own words.',
    description:
      'Replaces the template’s About copy with your own heading, introduction and paragraphs, written per branch where a branch needs to say something different.',
    sequence: 4,
  },
  {
    key: FUNCTIONALITY.FIGURES,
    name: 'Figures',
    icon: 'bar-chart-3',
    summary: 'A band of your own numbers, on the home page and the About page.',
    description:
      'Adds a band of figures to the website — a card per number with your own label and wording above the set. A figure can be fixed text, or counted from a date, so "Years in business" is right next year without anyone editing it. Sold separately from About us: the band is the first thing under the slider on the home page, and a company can want it without wanting a written About page.',
    sequence: 5,
  },
  {
    key: FUNCTIONALITY.TEAM,
    name: 'Team',
    icon: 'users',
    summary: 'A Team section listing the people behind the business.',
    description:
      'Adds a Team section to the website with a card per person — photo, name, role and a short line about them.',
    sequence: 6,
  },
  {
    key: FUNCTIONALITY.GALLERY,
    name: 'Gallery',
    icon: 'image',
    summary: 'A Gallery section for photographs of your work.',
    description:
      'Adds a Gallery section to the website — an ordered grid of images, each with an optional title and caption.',
    sequence: 7,
  },
  {
    key: FUNCTIONALITY.CONTACT_PAGE,
    name: 'Contact page',
    icon: 'mail',
    summary: 'A Contact page with your own wording and an enquiry form.',
    description:
      'Adds a Contact page to the website — your own heading and introduction, an enquiry form that reaches you by email or WhatsApp, and a card per branch with its address, phone and opening hours.',
    sequence: 8,
  },
  {
    key: FUNCTIONALITY.TESTIMONIALS,
    name: 'Testimonials',
    icon: 'quote',
    summary: 'Customer reviews and feedback on the public website.',
    description:
      'Adds a Testimonials section to the website. Run it curated — only the reviews you enter yourself — or open it up so customers can write their own, which reach you for approval before anything is published.',
    sequence: 9,
  },
  {
    key: FUNCTIONALITY.FEATURES,
    name: 'Features / Benefits',
    icon: 'sparkles',
    summary: 'Say what you offer, in your own words, with an icon each.',
    description:
      'Adds a Features / Benefits band to the website \u2014 a card per capability with your own heading, wording and an icon chosen from the platform\u2019s set. Switched off, the section is absent from the site entirely rather than shown with the template\u2019s words.',
    sequence: 10,
  },
];

/* ------------------------------------------------------------------ *
 * Contact page
 * ------------------------------------------------------------------ */

/** Where the enquiry form hands its message off to. There is no server behind it. */
/**
 * The website's menu, in order.
 *
 * One entry per page the template can show. `settings` names where the tenant
 * renames it — the About screen renames About, the Contact screen renames
 * Contact — and `functionality` is what the plan has to grant for the page to
 * exist at all. A page with neither, like Home, is always there under the
 * template's own name.
 *
 * `content` names a key in the public `features` payload that must be non-null
 * for the page to exist at all — the difference between "the plan pays for this
 * page" and "there is something on it". Services is the first page to need it:
 * a company can be entitled to the section, have it switched on, and not have
 * written a service yet, and a menu entry pointing at a page with nothing on it
 * is the one thing the whole nav-from-the-API arrangement was meant to prevent.
 *
 * Adding a page later means adding a row here: the API builds the menu from
 * this list, and the website renders whatever the API sends, so neither has to
 * be taught about it separately.
 */
const NAV_PAGES = [
  { key: 'home', href: '/', label: 'Home', settings: null, functionality: null },
  /**
   * Services. The first page whose label lives on the functionality's own
   * `settings` blob rather than in a table of its own — the section has no
   * per-scope settings row, only cards, so there was nowhere else to put it.
   * `publicNav` reads either shape; see `NAV_LABEL_SOURCE`.
   */
  { key: 'services', href: '/services', label: 'Services', settings: 'services', functionality: 'services', content: 'services' },
  { key: 'about', href: '/about', label: 'About us', settings: 'about', functionality: null },
  { key: 'contact', href: '/contact', label: 'Contact', settings: 'contact', functionality: 'contact_page' },
];

/**
 * Where each `NAV_PAGES.settings` name is actually stored.
 *
 * About and Contact each have a settings *table*, one row per scope, so their
 * label is branch-aware. Services has only cards, so its label rides on the
 * functionality's own settings blob — company-wide, like the Team and Gallery
 * headings do. `publicNav` reads both, and this is what tells it which.
 */
const NAV_LABEL_SOURCE = { about: 'row', contact: 'row', services: 'functionality' };

/** The longest a menu label may be, matching the column. */
const NAV_LABEL_MAX = 40;

const CONTACT_FORM_TARGET = { EMAIL: 'email', WHATSAPP: 'whatsapp' };
const CONTACT_FORM_TARGET_VALUES = Object.values(CONTACT_FORM_TARGET);

/** The Contact page a company starts from, before it writes its own. */
const CONTACT_DEFAULTS = {
  eyebrow: 'Contact',
  title: 'Talk to {company}',
  lead: 'Tell us what you need and we will come back with questions, a scope and a number.',
  showForm: true,
  formTarget: CONTACT_FORM_TARGET.EMAIL,
  formNote: 'We usually reply within one working day.',
  showLocations: true,
};

/* ------------------------------------------------------------------ *
 * About us
 * ------------------------------------------------------------------ */

/**
 * How a stat card produces its figure.
 *
 *   fixed       the company typed it — "250+", "98%"
 *   since_date  counted from a date at render time, so "Years in business"
 *               is right next year without anyone editing it
 */
const STAT_MODE = { FIXED: 'fixed', SINCE_DATE: 'since_date' };
const STAT_MODE_VALUES = Object.values(STAT_MODE);

/** What a `since_date` stat counts in. */
const STAT_UNIT = { YEARS: 'years', MONTHS: 'months', DAYS: 'days' };
const STAT_UNIT_VALUES = Object.values(STAT_UNIT);

/** The About copy a company starts from, before it writes its own. */
const ABOUT_DEFAULTS = {
  eyebrow: 'About us',
  title: 'Who {company} is',
  lead: '',
  body: '',
};

/**
 * The words above the figures, when a company has not written its own.
 *
 * The band used to carry none: on the home page it was a row of numbers with
 * nothing to say what they were, which reads as a widget rather than as a claim
 * the business is making.
 *
 * Stored on the `figures` functionality's own `settings`, the same place Team,
 * Gallery and Features keep theirs — one heading for the set, so it is a blob
 * on the switch row rather than a column on any table. The figures themselves
 * are branch-aware rows in `company_stats`; the heading over them is not, which
 * is the same split those three sections already make.
 */
const STATS_DEFAULTS = {
  eyebrow: 'By the numbers',
  /** `{company}` is filled in by the website, as everywhere else. */
  title: 'What {company} has to show for it',
  lead: 'A few figures that say more about the work than a page of prose would.',
};

/**
 * The stat band every company gets when it first switches Figures on, so the
 * section is never an empty row. Ordinary rows from that moment on.
 */
const DEFAULT_STATS = [
  { label: 'Years in business', mode: STAT_MODE.SINCE_DATE, unit: STAT_UNIT.YEARS, suffix: '+', sequence: 1 },
  { label: 'Projects delivered', mode: STAT_MODE.FIXED, value: '250+', sequence: 2 },
  { label: 'Clients who stay', mode: STAT_MODE.FIXED, value: '98%', sequence: 3 },
  { label: 'Typical reply time', mode: STAT_MODE.FIXED, value: '24h', sequence: 4 },
];

/**
 * WhatsApp numbers are typed rather than free-form so the website knows which
 * number belongs on which button. A company may set any subset; the site falls
 * back to `contact` for a type that was left empty, and shows nothing at all
 * when it has no numbers.
 */
const WHATSAPP_TYPE = {
  INQUIRY: 'inquiry',
  CONTACT: 'contact',
  SUPPORT: 'support',
  ORDERS: 'orders',
};
const WHATSAPP_TYPE_VALUES = Object.values(WHATSAPP_TYPE);

/** What each type is for, and where the website puts it. */
const WHATSAPP_TYPE_CATALOGUE = [
  {
    key: WHATSAPP_TYPE.INQUIRY,
    name: 'Inquiry',
    placement: 'The enquiry buttons in the hero and the contact section.',
    defaultMessage: 'Hello, I would like to enquire about your services.',
    sequence: 1,
  },
  {
    key: WHATSAPP_TYPE.CONTACT,
    name: 'Contact',
    placement: 'The header button, the footer, and the floating chat bubble.',
    defaultMessage: 'Hello, I found you on your website and would like to get in touch.',
    sequence: 2,
  },
  {
    key: WHATSAPP_TYPE.SUPPORT,
    name: 'Support',
    placement: 'The support link in the footer.',
    defaultMessage: 'Hello, I need help with something.',
    sequence: 3,
  },
  {
    key: WHATSAPP_TYPE.ORDERS,
    name: 'Orders',
    placement: 'The order action in the contact section.',
    defaultMessage: 'Hello, I would like to place an order.',
    sequence: 4,
  },
];

/**
 * The type every other type falls back to. `contact` is the general-purpose
 * number, so a company that filled in only one still gets every button working.
 */
const WHATSAPP_FALLBACK_TYPE = WHATSAPP_TYPE.CONTACT;

/** Where a visitor may send the page. `copy` is the clipboard, not a network. */
const SHARE_CHANNEL = {
  COPY: 'copy',
  WHATSAPP: 'whatsapp',
  FACEBOOK: 'facebook',
  X: 'x',
  LINKEDIN: 'linkedin',
  TELEGRAM: 'telegram',
  EMAIL: 'email',
};
const SHARE_CHANNEL_VALUES = Object.values(SHARE_CHANNEL);

/** What a company gets before it edits anything on the share button. */
const SHARE_LINK_DEFAULTS = {
  headline: 'Share this page',
  message: 'Have a look at {company}',
  channels: [SHARE_CHANNEL.COPY, SHARE_CHANNEL.WHATSAPP, SHARE_CHANNEL.FACEBOOK, SHARE_CHANNEL.X],
};

/* ------------------------------------------------------------------ *
 * Team and Gallery section copy
 * ------------------------------------------------------------------ */

/**
 * The words above the Team and Gallery sections.
 *
 * These were the template's, hardcoded, which meant every business on the
 * platform introduced its own staff with the same sentence. A company can
 * already name its About, Contact, Testimonials and Features headings; there
 * was no reason these two were different, and every reason they should not be.
 *
 * They ride on the functionality's own `settings` blob — the same place
 * `share_link` and `testimonials` keep theirs — because they are one block per
 * tenant rather than a list, and because both sections are already gated by a
 * functionality that has a row to hang them on.
 *
 * A blank field falls back to the value here, so a tenant that never opens the
 * screen gets a section that reads properly rather than one with no heading.
 */
const TEAM_DEFAULTS = {
  eyebrow: 'Our team',
  title: 'The people you will be working with',
  lead: 'Small enough that you will know everyone by name, and reach them directly.',
};

const GALLERY_DEFAULTS = {
  eyebrow: 'Our work',
  title: 'A look at what we have made',
  lead: 'A selection of recent work. Every piece here was made for someone.',
};

/* ------------------------------------------------------------------ *
 * Testimonials
 * ------------------------------------------------------------------ */

/**
 * How a company runs its Testimonials section. The tenant picks one on the
 * Testimonials screen; it is stored on the functionality's own `settings` blob,
 * the same place `share_link` keeps its configuration.
 *
 *   static   a curated wall. Only reviews the company enters itself, in the
 *            order it arranged them. The website shows no form.
 *   dynamic  open to customers. The website carries a form, a submission
 *            arrives as `pending` and is published only once the company
 *            approves it — and the section then shows the most recent
 *            `TESTIMONIAL_FEED_LIMIT`, newest first, rather than a fixed wall.
 *
 * Switching between them never deletes anything: a company that goes back to
 * static keeps every approved visitor review, it simply stops collecting new
 * ones and returns to showing its own order.
 */
const TESTIMONIAL_MODE = { STATIC: 'static', DYNAMIC: 'dynamic' };
const TESTIMONIAL_MODE_VALUES = Object.values(TESTIMONIAL_MODE);

/**
 * Where the "Write a review" button on a `dynamic` section sends someone.
 *
 * Two destinations, and exactly one of them is live at a time — a section that
 * offered both would be asking a customer to choose where to do the company a
 * favour, which is the surest way to have them do neither.
 *
 *   form  the platform's own dialog. The review arrives as `pending`, the
 *         company approves it, and it is published on the company's own
 *         website. The company owns the words.
 *   link  a URL the company gives us — its Google Business review page, a
 *         Justdial listing, a form of its own. The button leaves the site and
 *         nothing comes back here: reviews written that way live wherever they
 *         were written, so the queue below stays empty and the wall goes on
 *         showing whatever the company has already published.
 *
 * `link` therefore closes the public write path as firmly as `static` does —
 * see `submitTestimonial`, which refuses a submission either way.
 *
 * It means nothing on a `static` section, which carries no button at all.
 */
const TESTIMONIAL_REVIEW_TARGET = { FORM: 'form', LINK: 'link' };
const TESTIMONIAL_REVIEW_TARGET_VALUES = Object.values(TESTIMONIAL_REVIEW_TARGET);

/** How many reviews a `dynamic` section shows, newest first. */
const TESTIMONIAL_FEED_LIMIT = 10;

/**
 * Who wrote a row.
 *
 *   admin    typed into the console by the company
 *   visitor  submitted through the form on the public website
 *
 * Kept separate from the moderation state because they answer different
 * questions: a company needs to know which of its published reviews are its own
 * copy and which are a customer's actual words.
 */
const TESTIMONIAL_SOURCE = { ADMIN: 'admin', VISITOR: 'visitor' };
const TESTIMONIAL_SOURCE_VALUES = Object.values(TESTIMONIAL_SOURCE);

/**
 * Whether a row may be published.
 *
 * Only `approved` ever reaches the public API — a pending or rejected review is
 * absent from `/public/company-details` entirely rather than hidden by the
 * template, which is the same rule every other feature here follows.
 *
 * Anything the company types itself is born `approved`: asking a business to
 * approve its own copy would be a queue with one person on both ends. A visitor
 * submission is born `pending`, always, and no public route can create anything
 * else — see `publicSubmitTestimonial`.
 */
const TESTIMONIAL_MODERATION = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };
const TESTIMONIAL_MODERATION_VALUES = Object.values(TESTIMONIAL_MODERATION);

/** Ratings are out of five, and optional — a written review with no star is fine. */
const TESTIMONIAL_RATING_MAX = 5;

/** What a company gets on the Testimonials screen before it changes anything. */
const TESTIMONIAL_DEFAULTS = {
  eyebrow: 'Testimonials',
  title: 'What our customers say',
  lead: '',
  mode: TESTIMONIAL_MODE.STATIC,
  /**
   * The button on a `dynamic` section, and where it goes. `formTitle` is its
   * label whichever destination is chosen, so a company that switches to a
   * Google link keeps the wording it wrote.
   */
  reviewTarget: TESTIMONIAL_REVIEW_TARGET.FORM,
  /** Read only when `reviewTarget` is `link`; empty is what "not set" is. */
  reviewUrl: '',
  /** Wording above the form, shown only in `dynamic` mode. */
  formTitle: 'Write a review',
  formNote: 'Your review reaches us first and appears here once we have published it.',
  /** Whether the form asks for a star rating at all. */
  showRating: true,
};

/* ------------------------------------------------------------------ *
 * Lead management
 * ------------------------------------------------------------------ */

/**
 * Where a lead has got to.
 *
 * A visit is a fact — it happened, and nothing a company does changes it — so
 * the stage lives on the **lead**, not on any one visit. Every lead is born
 * `new`; moving it along is the only thing the console writes to this table,
 * which is why `PATCH /leads/:id` is the one write route the feature has.
 *
 * `lost` is deliberately not a delete. A device that stopped converting still
 * counts in the analytics, and the same person coming back six months later
 * should show up as a returning lead rather than a first-time visitor.
 */
const LEAD_STAGE = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  CONVERTED: 'converted',
  LOST: 'lost',
};
const LEAD_STAGE_VALUES = Object.values(LEAD_STAGE);

/** What kind of machine the visit came from, parsed from the user agent. */
const DEVICE_TYPE = {
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
  BOT: 'bot',
  UNKNOWN: 'unknown',
};
const DEVICE_TYPE_VALUES = Object.values(DEVICE_TYPE);

/**
 * The five campaign parameters that get their own columns.
 *
 * Every `utm_*` key the URL carried is kept in the visit's `utm` JSON — a
 * marketing team invents its own the week after you ship — but these five are
 * what "which campaign produced this lead" is actually grouped by, so they are
 * denormalised onto both tables where an index can reach them.
 */
const UTM_COLUMNS = ['source', 'medium', 'campaign', 'term', 'content'];

/**
 * Attribution parameters that mean the same thing as a `utm_*` key but are not
 * spelled like one. Ad platforms append these themselves, so a campaign can
 * arrive carrying nothing but one of these and no `utm_` at all.
 */
const CLICK_ID_PARAMS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'twclid',
  'li_fat_id',
  'igshid',
  'dclid',
  'yclid',
];

/** Caps on what one visit may park in a JSON column, so a crafted URL cannot. */
const LEAD_TRACKING_LIMITS = {
  /** Distinct `utm_*` / click-id keys kept per visit. */
  utmKeys: 40,
  /** Longest value kept for any one of them. */
  utmValue: 400,
  /** Entries kept in the free-form `extra` blob a template may send. */
  extraKeys: 40,
  extraValue: 500,
};

/**
 * How long two requests from one device stay the same **visit**.
 *
 * The site fires the tracking call on every launch, and a launch is any page
 * load — so a visitor reading four pages would otherwise be four visits, and
 * "visits" would measure page views under a different name. Inside this window
 * the existing visit row is updated rather than a new one written; outside it,
 * the person came back, and that is worth a row.
 *
 * Thirty minutes is the session length every analytics product settled on, and
 * for the same reason: it is longer than reading a page and shorter than a
 * lunch break.
 */
const LEAD_VISIT_SESSION_MINUTES = 30;

/* ------------------------------------------------------------------ *
 * Features / Benefits
 * ------------------------------------------------------------------ */

/**
 * The glyph a benefit card carries.
 *
 * A **closed** set, and the platform's rather than the tenant's: the icons are
 * drawn by whatever renders them — the website draws its own, the console draws
 * the picker's — so a company chooses a name from this list instead of
 * uploading artwork. That is what keeps six benefit cards looking like one set
 * on every site the platform serves, and costs the website no request.
 *
 * This list is the contract. `key` is what is stored on the row and sent to the
 * website; `paths` is the drawing, shipped so the console's picker has
 * something to show without keeping a second copy of the artwork in step. A
 * renderer that meets a key it does not know falls back to `spark` rather than
 * leaving a hole in the card, so an entry may be added here before the website
 * has learnt to draw it.
 *
 * Every path is stroked, never filled, inside a 24-unit box — see the website's
 * `FeaturesSection`, which sets one line weight, cap and join for all of them.
 */
const FEATURE_ICONS = [
  /* ------------------------------- general ------------------------------- */
  {
    key: 'spark',
    label: 'Spark',
    group: 'General',
    paths: [
      'M12 3.2 13.9 9a3.2 3.2 0 0 0 2.1 2.1L21.8 13l-5.8 1.9A3.2 3.2 0 0 0 13.9 17L12 22.8 10.1 17A3.2 3.2 0 0 0 8 14.9L2.2 13 8 11.1A3.2 3.2 0 0 0 10.1 9Z',
    ],
  },
  {
    key: 'star',
    label: 'Star',
    group: 'General',
    paths: ['m12 3.5 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z'],
  },
  {
    key: 'check',
    label: 'Tick',
    group: 'General',
    paths: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'm8.2 12.3 2.6 2.6 5-5.4'],
  },
  {
    key: 'lightbulb',
    label: 'Idea',
    group: 'General',
    paths: [
      'M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z',
      'M9.5 18.4h5M10.4 21h3.2',
    ],
  },
  {
    key: 'target',
    label: 'Target',
    group: 'General',
    paths: [
      'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
      'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
      'M13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    ],
  },
  {
    key: 'layers',
    label: 'Range',
    group: 'General',
    paths: ['m12 3 8.5 4.6L12 12.2 3.5 7.6Z', 'm3.5 12 8.5 4.6 8.5-4.6', 'm3.5 16.4 8.5 4.6 8.5-4.6'],
  },

  /* --------------------------- trust and quality -------------------------- */
  {
    key: 'shield',
    label: 'Guarantee',
    group: 'Trust and quality',
    paths: ['M12 2.8 20 6v6c0 4.6-3.2 7.9-8 9.2-4.8-1.3-8-4.6-8-9.2V6Z', 'm8.8 12 2.3 2.4 4.1-4.6'],
  },
  {
    key: 'award',
    label: 'Award',
    group: 'Trust and quality',
    paths: ['M17.5 9a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z', 'm8.6 13.2-1.4 7.6L12 18.6l4.8 2.2-1.4-7.6'],
  },
  {
    key: 'lock',
    label: 'Secure',
    group: 'Trust and quality',
    paths: [
      'M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z',
      'M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7',
    ],
  },
  {
    key: 'heart',
    label: 'Care',
    group: 'Trust and quality',
    paths: ['M12 20.4S3.8 15.6 3.8 9.9A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8.2 2.3c0 5.7-8.2 10.5-8.2 10.5Z'],
  },

  /* -------------------------- service and support ------------------------- */
  {
    key: 'headset',
    label: 'Support',
    group: 'Service and support',
    paths: [
      'M4.2 14v-2a7.8 7.8 0 0 1 15.6 0v2',
      'M4.2 13.4h1.9a1.4 1.4 0 0 1 1.4 1.4v2.6a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4ZM19.8 13.4h-1.9a1.4 1.4 0 0 0-1.4 1.4v2.6a1.4 1.4 0 0 0 1.4 1.4h.5a1.4 1.4 0 0 0 1.4-1.4Z',
      'M18.4 18.8v.6a2.4 2.4 0 0 1-2.4 2.4h-2.6',
    ],
  },
  {
    key: 'people',
    label: 'Team',
    group: 'Service and support',
    paths: [
      'M12.8 8.5a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0Z',
      'M3.4 20a6.2 6.2 0 0 1 12.2 0',
      'M16.4 5.6a3.3 3.3 0 0 1 0 6.4M17.6 14.4a6.2 6.2 0 0 1 3 5.6',
    ],
  },
  {
    key: 'phone',
    label: 'Phone',
    group: 'Service and support',
    paths: [
      'M20.4 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 2.7 5.5a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8 10.5a14 14 0 0 0 5.3 5.3l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.6 1.9Z',
    ],
  },
  {
    key: 'message',
    label: 'Conversation',
    group: 'Service and support',
    paths: ['M20.5 12a8 8 0 0 1-11.9 7l-4.1 1.5 1.5-4.1A8 8 0 1 1 20.5 12Z'],
  },
  {
    key: 'calendar',
    label: 'Scheduling',
    group: 'Service and support',
    paths: [
      'M5.6 5.4h12.8a1.6 1.6 0 0 1 1.6 1.6v11.4a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18.4V7a1.6 1.6 0 0 1 1.6-1.6Z',
      'M8.4 3.2v4M15.6 3.2v4M4 10.4h16',
    ],
  },

  /* -------------------------- speed and delivery -------------------------- */
  {
    key: 'clock',
    label: 'On time',
    group: 'Speed and delivery',
    paths: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5.3l3.4 2'],
  },
  {
    key: 'rocket',
    label: 'Launch',
    group: 'Speed and delivery',
    paths: [
      'M12 3.4c3 2.2 4.8 5.6 4.8 9.3l-2.4 2.4H9.6l-2.4-2.4c0-3.7 1.8-7.1 4.8-9.3Z',
      'M9.6 15.1 7.4 20l3-1.3M14.4 15.1l2.2 4.9-3-1.3',
      'M13.4 10.2a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0Z',
    ],
  },
  {
    key: 'zap',
    label: 'Fast',
    group: 'Speed and delivery',
    paths: ['M13.4 2.8 4.6 13.6h6.2l-.2 7.6 8.8-10.8h-6.2Z'],
  },
  {
    key: 'truck',
    label: 'Delivery',
    group: 'Speed and delivery',
    paths: [
      'M3.4 6.6h9.2v10.2H3.4Z',
      'M12.6 10.2h3.6l3 3v3.6h-6.6Z',
      'M8.4 18.6a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0ZM19.2 18.6a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z',
    ],
  },
  {
    key: 'refresh',
    label: 'Ongoing',
    group: 'Speed and delivery',
    paths: [
      'M20.4 11.4A8.4 8.4 0 0 0 6.2 6.8L3.6 9.2',
      'M3.6 4.6v4.6h4.6',
      'M3.6 12.6a8.4 8.4 0 0 0 14.2 4.6l2.6-2.4',
      'M20.4 19.4v-4.6h-4.6',
    ],
  },

  /* --------------------------- value and pricing -------------------------- */
  {
    key: 'wallet',
    label: 'Value',
    group: 'Value and pricing',
    paths: [
      'M4.4 7.6h13.2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4.4Z',
      'M4.4 7.6V6a1.6 1.6 0 0 1 1.6-1.6h9.4',
      'M16.6 13.6h3',
    ],
  },
  {
    key: 'tag',
    label: 'Price',
    group: 'Value and pricing',
    paths: [
      'm11.2 3.6 8.4 8.4a1.8 1.8 0 0 1 0 2.5l-5.1 5.1a1.8 1.8 0 0 1-2.5 0L3.6 11.2V3.6Z',
      'M8 8a.9.9 0 1 1-1.8 0A.9.9 0 0 1 8 8Z',
    ],
  },

  /* --------------------------- results and reach -------------------------- */
  {
    key: 'chart',
    label: 'Growth',
    group: 'Results and reach',
    paths: ['M3.6 20.4h16.8', 'M7 20.4v-5.2M12 20.4V9.6M17 20.4V5.2'],
  },
  {
    key: 'globe',
    label: 'Reach',
    group: 'Results and reach',
    paths: [
      'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
      'M3.4 12h17.2',
      'M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z',
    ],
  },
  {
    key: 'map-pin',
    label: 'Local',
    group: 'Results and reach',
    paths: [
      'M19 10.2c0 5.4-7 11-7 11s-7-5.6-7-11a7 7 0 0 1 14 0Z',
      'M14.4 10a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z',
    ],
  },
  {
    key: 'leaf',
    label: 'Sustainable',
    group: 'Results and reach',
    paths: [
      'M20.2 4.4C10.6 3.6 4.6 8 4.6 14.4a5.4 5.4 0 0 0 5.4 5.4c6 0 10.2-6 10.2-15.4Z',
      'M4.6 20.4c2.6-4.6 6.2-7.8 10.6-9.6',
    ],
  },
  {
    key: 'tools',
    label: 'Craft',
    group: 'Results and reach',
    paths: [
      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z',
    ],
  },
];

/** Just the names — what a row may store, and what the validator checks against. */
const FEATURE_ICON_KEYS = FEATURE_ICONS.map((icon) => icon.key);

/** Where an unrecognised name lands. A blank card is never the answer. */
const FEATURE_ICON_FALLBACK = 'spark';

/**
 * The Features / Benefits section's own wording, before a company changes it.
 *
 * Kept on the functionality's `settings` blob rather than in a table of its
 * own, the same way `share_link` keeps its configuration: it is one short block
 * per company, not something a branch overrides. The *cards* are a table, and
 * those are branch-aware — see `CompanyFeature`.
 */
const FEATURE_DEFAULTS = {
  eyebrow: 'What you get',
  title: 'Why people work with {company}',
  lead: 'The short version of how we work, and what it means for you once the job is underway.',
  /** Sends the reader to the Contact page. Rendered only when that page exists. */
  ctaLabel: 'Talk it through',
};

/**
 * The cards a company gets the first time it switches Features on, so the
 * section is never an empty band.
 *
 * Six of them because the website lays the grid out two-up and six divides it —
 * five would leave a card alone on the last row. Ordinary rows from that moment
 * on: a company that deletes them all does not get them back, and one that
 * rewrites every word keeps nothing of these but the order.
 */
const DEFAULT_FEATURE_ITEMS = [
  {
    icon: 'spark',
    title: 'One team, start to finish',
    body: 'From the first conversation to the finished job it is the same people throughout — nothing is handed off to someone you have never spoken to.',
    sequence: 1,
  },
  {
    icon: 'shield',
    title: 'Priced once, in writing',
    body: 'You get a scope and a number before anything begins, and the number at the end is the one you agreed to at the start.',
    sequence: 2,
  },
  {
    icon: 'clock',
    title: 'Delivered when we said',
    body: 'Dates are committed to only once the work is properly understood. That is the whole reason we are able to keep them.',
    sequence: 3,
  },
  {
    icon: 'people',
    title: 'People you can reach',
    body: 'Small enough that you will know who is working on your job by name, and reach them directly rather than through a queue.',
    sequence: 4,
  },
  {
    icon: 'headset',
    title: 'Answers, not ticket numbers',
    body: 'A question on a Tuesday afternoon gets an answer on a Tuesday afternoon. Support is part of the work, not a separate contract.',
    sequence: 5,
  },
  {
    icon: 'chart',
    title: 'Built to keep working',
    body: 'Handed over documented and maintainable, so what you have on the last day still serves you a year after we finished.',
    sequence: 6,
  },
];

/* ------------------------------------------------------------------ *
 * Services
 * ------------------------------------------------------------------ */

/**
 * The Services section's own wording, before a company changes it.
 *
 * Kept on the functionality's `settings` blob, like Team's and Gallery's
 * headings and Features' copy: it is one short block per tenant, not a list.
 * The services themselves are branch-aware rows in `company_services`.
 *
 * `navLabel` is the odd one out and lives here for the same reason. Services is
 * a page as well as a band, so it needs a name in the menu, and it has no
 * settings table of its own to keep one in — see `NAV_LABEL_SOURCE`. Blank
 * keeps the platform's name, exactly as About's and Contact's do.
 */
const SERVICE_DEFAULTS = {
  eyebrow: 'What we do',
  /** `{company}` is filled in by the website. */
  title: 'How {company} can help',
  lead: 'What we take on, what is included, and roughly what it costs. Ask about anything that is not here — most of our work starts as a question.',
  /**
   * The button on every service card, unless the service overrides it with one
   * of its own — see `company_services.cta_label`. A repair shop's "Get a
   * quote" and a clinic's "Book a slot" are the same button doing the same
   * job, and neither of them is "Enquire".
   */
  ctaLabel: 'Enquire',

  /** Where a submitted enquiry goes. See `SERVICE_ENQUIRY_TARGET`. */
  enquiryTarget: 'both',
  /** The heading on the dialog the button opens. */
  formTitle: 'Book an enquiry',
  /** The line under it, and the tenant's chance to set expectations. */
  formNote: 'Leave your name and number and we will call you back — usually the same day.',
};

/**
 * Where a service enquiry goes when a visitor submits it.
 *
 *   whatsapp  straight into the company's WhatsApp, composed and ready to
 *             send. Nothing is stored on the platform — the same bargain the
 *             Contact page's form makes, and for the same reason: the tenant
 *             already has an inbox and a phone.
 *   admin     recorded as a row the company works through in Service Leads.
 *             Nothing leaves the platform.
 *   both      recorded **and** handed to WhatsApp. The default, because it is
 *             the only one that loses nothing: the row is the record, the
 *             message is the notification.
 *
 * `whatsapp` needs a number to be worth offering. Where the tenant has not
 * published one the API degrades `both` to `admin` and withholds the button
 * entirely on `whatsapp` — see `publicServices`. A button that opens a chat
 * with nobody is worse than no button.
 */
const SERVICE_ENQUIRY_TARGET = { WHATSAPP: 'whatsapp', ADMIN: 'admin', BOTH: 'both' };
const SERVICE_ENQUIRY_TARGET_VALUES = Object.values(SERVICE_ENQUIRY_TARGET);

/** The longest a service's own button label may be, matching the column. */
const SERVICE_CTA_MAX = 40;

/**
 * There are deliberately **no default services**.
 *
 * Every other seeded list on the platform replaces wording the template used to
 * invent — six benefit cards, four figures — and seeding them gives a tenant
 * something to edit rather than a blank screen. This one has no such history
 * and, more to the point, no honest content to seed: a figure the platform made
 * up is a wrong number, but a *service* the platform made up is the business
 * advertising work it may not do. So the section stays absent until the company
 * writes its first card, and `publicServices` returns null until then.
 */

/** The most bullet points one service card may carry, and how long each may be. */
const SERVICE_HIGHLIGHTS_MAX = 6;
const SERVICE_HIGHLIGHT_LENGTH = 120;

/** Permission actions stored per (role, menu) pair. */
const PERMISSION_ACTIONS = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canExport'];

module.exports = {
  STATUS,
  STATUS_VALUES,
  AUTH_SCOPE,
  SUPER_ADMIN_ROLE,
  BILLING_CYCLE,
  BILLING_CYCLE_DAYS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  OCCUPYING_SUBSCRIPTION_STATUSES,
  TERMINAL_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_TRANSITIONS,
  SUBSCRIPTION_CHANGE_TYPE,
  SUBSCRIPTION_CHANGE_TYPE_VALUES,
  SUBSCRIPTION_EVENT,
  SUBSCRIPTION_EVENT_VALUES,
  EXPIRY_WARNING_DAYS,
  PLAN_REQUEST_STATUS,
  PLAN_REQUEST_STATUS_VALUES,
  PLAN_REQUEST_TYPE,
  PLAN_REQUEST_TYPE_VALUES,
  TRANSACTION_STATUS,
  PAYMENT_MODE,
  PAYMENT_MODE_VALUES,
  PAYMENT_MODE_CATALOGUE,
  PERMISSION_ACTIONS,
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  FUNCTIONALITY_CATALOGUE,
  WHATSAPP_TYPE,
  WHATSAPP_TYPE_VALUES,
  WHATSAPP_TYPE_CATALOGUE,
  WHATSAPP_FALLBACK_TYPE,
  SHARE_CHANNEL,
  SHARE_CHANNEL_VALUES,
  SHARE_LINK_DEFAULTS,
  STAT_MODE,
  STAT_MODE_VALUES,
  STAT_UNIT,
  STAT_UNIT_VALUES,
  ABOUT_DEFAULTS,
  STATS_DEFAULTS,
  DEFAULT_STATS,
  FEATURE_ICONS,
  FEATURE_ICON_KEYS,
  FEATURE_ICON_FALLBACK,
  FEATURE_DEFAULTS,
  DEFAULT_FEATURE_ITEMS,
  SERVICE_DEFAULTS,
  SERVICE_ENQUIRY_TARGET,
  SERVICE_ENQUIRY_TARGET_VALUES,
  SERVICE_CTA_MAX,
  SERVICE_HIGHLIGHTS_MAX,
  SERVICE_HIGHLIGHT_LENGTH,
  CONTACT_FORM_TARGET,
  CONTACT_FORM_TARGET_VALUES,
  CONTACT_DEFAULTS,
  TEAM_DEFAULTS,
  GALLERY_DEFAULTS,
  TESTIMONIAL_MODE,
  TESTIMONIAL_MODE_VALUES,
  TESTIMONIAL_REVIEW_TARGET,
  TESTIMONIAL_REVIEW_TARGET_VALUES,
  TESTIMONIAL_FEED_LIMIT,
  TESTIMONIAL_SOURCE,
  TESTIMONIAL_SOURCE_VALUES,
  TESTIMONIAL_MODERATION,
  TESTIMONIAL_MODERATION_VALUES,
  TESTIMONIAL_RATING_MAX,
  TESTIMONIAL_DEFAULTS,
  NAV_PAGES,
  NAV_LABEL_SOURCE,
  NAV_LABEL_MAX,
  LEAD_STAGE,
  LEAD_STAGE_VALUES,
  DEVICE_TYPE,
  DEVICE_TYPE_VALUES,
  UTM_COLUMNS,
  CLICK_ID_PARAMS,
  LEAD_TRACKING_LIMITS,
  LEAD_VISIT_SESSION_MINUTES,
};
