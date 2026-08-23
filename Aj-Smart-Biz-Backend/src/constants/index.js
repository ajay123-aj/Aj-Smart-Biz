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
  ABOUT_US: 'about_us',
  TEAM: 'team',
  GALLERY: 'gallery',
  CONTACT_PAGE: 'contact_page',
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
    key: FUNCTIONALITY.ABOUT_US,
    name: 'About us',
    icon: 'file-text',
    summary: 'Write your own About section, with your own numbers.',
    description:
      'Replaces the template’s About copy with your own heading, introduction and paragraphs, plus a band of figures you define — some fixed, some counted from a date so "Years in business" is never out of date.',
    sequence: 3,
  },
  {
    key: FUNCTIONALITY.TEAM,
    name: 'Team',
    icon: 'users',
    summary: 'A Team section listing the people behind the business.',
    description:
      'Adds a Team section to the website with a card per person — photo, name, role and a short line about them.',
    sequence: 4,
  },
  {
    key: FUNCTIONALITY.GALLERY,
    name: 'Gallery',
    icon: 'image',
    summary: 'A Gallery section for photographs of your work.',
    description:
      'Adds a Gallery section to the website — an ordered grid of images, each with an optional title and caption.',
    sequence: 5,
  },
  {
    key: FUNCTIONALITY.CONTACT_PAGE,
    name: 'Contact page',
    icon: 'mail',
    summary: 'A Contact page with your own wording and an enquiry form.',
    description:
      'Adds a Contact page to the website — your own heading and introduction, an enquiry form that reaches you by email or WhatsApp, and a card per branch with its address, phone and opening hours.',
    sequence: 6,
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
 * Adding a page later means adding a row here: the API builds the menu from
 * this list, and the website renders whatever the API sends, so neither has to
 * be taught about it separately.
 */
const NAV_PAGES = [
  { key: 'home', href: '/', label: 'Home', settings: null, functionality: null },
  { key: 'about', href: '/about', label: 'About us', settings: 'about', functionality: null },
  { key: 'contact', href: '/contact', label: 'Contact', settings: 'contact', functionality: 'contact_page' },
];

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
 * The stat band every company gets when it first switches About on, so the
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
  DEFAULT_STATS,
  CONTACT_FORM_TARGET,
  CONTACT_FORM_TARGET_VALUES,
  CONTACT_DEFAULTS,
  NAV_PAGES,
  NAV_LABEL_MAX,
};
