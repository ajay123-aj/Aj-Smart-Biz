'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { resolveServiceState, runningSubscription } = require('./serviceState.service');
const {
  STATUS,
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  FUNCTIONALITY_CATALOGUE,
  WHATSAPP_TYPE_CATALOGUE,
  WHATSAPP_FALLBACK_TYPE,
  SHARE_CHANNEL_VALUES,
  SHARE_LINK_DEFAULTS,
  STAT_MODE,
  STAT_UNIT,
  ABOUT_DEFAULTS,
  STATS_DEFAULTS,
  NAV_PAGES,
  CONTACT_DEFAULTS,
  TESTIMONIAL_MODE,
  TESTIMONIAL_MODE_VALUES,
  TESTIMONIAL_REVIEW_TARGET,
  TESTIMONIAL_REVIEW_TARGET_VALUES,
  TESTIMONIAL_FEED_LIMIT,
  TESTIMONIAL_MODERATION,
  TESTIMONIAL_DEFAULTS,
  FEATURE_DEFAULTS,
  FEATURE_ICON_KEYS,
  FEATURE_ICON_FALLBACK,
  TEAM_DEFAULTS,
  GALLERY_DEFAULTS,
} = require('../constants');

/**
 * Optional functionality: who granted it, who switched it on, and whether it is
 * therefore live.
 *
 * This is the only place that answers that question. The admin console renders
 * what it returns rather than deciding for itself, the write routes guard on it,
 * and the public endpoint embeds it — so a toggle the tenant can see, a request
 * the API accepts and a button the website paints can never disagree.
 *
 * Three conditions, all of which must hold:
 *
 *   granted   the plan lists the key — read from the subscription SNAPSHOT
 *             first, exactly as `quota.service` reads limits, so editing a plan
 *             never changes what a running term was sold
 *   enabled   the company's own switch is `active`
 *   served    the plan has not expired and is not suspended
 *
 * `active = granted && enabled && served`. Anything less and the public API
 * omits the feature entirely, which is what stops it reaching a website.
 */

/** Why a functionality is not live. `null` when it is. */
const BLOCK_REASON = {
  NOT_IN_PLAN: 'not_in_plan',
  DISABLED: 'disabled',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  NO_PLAN: 'no_plan',
};

const MESSAGES = {
  [BLOCK_REASON.NOT_IN_PLAN]: 'Your plan does not include this functionality. Upgrade your plan to switch it on.',
  [BLOCK_REASON.DISABLED]: 'This functionality is switched off, so it does not appear on your website.',
  [BLOCK_REASON.EXPIRED]: 'Your plan has expired, so this functionality is not being served. Renew it to bring it back.',
  [BLOCK_REASON.SUSPENDED]: 'Your plan is suspended, so this functionality is not being served.',
  [BLOCK_REASON.NO_PLAN]: 'No plan is active for this company, so this functionality is not being served.',
};

/**
 * The keys a subscription grants.
 *
 * Snapshot first, live plan second — the same rule and the same reason as
 * `quota.service.limitOf`. A term written before this column existed has
 * neither, and grants nothing.
 */
function grantedKeys(subscription) {
  const snapshot = subscription?.planSnapshot?.functionalities;
  const source = Array.isArray(snapshot) ? snapshot : subscription?.plan?.functionalities;
  if (!Array.isArray(source)) return [];
  return source.filter((key) => FUNCTIONALITY_VALUES.includes(key));
}

/** Normalises whatever is stored for `share_link` into a complete config. */
function shareSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};
  const channels = Array.isArray(settings.channels)
    ? settings.channels.filter((channel) => SHARE_CHANNEL_VALUES.includes(channel))
    : null;

  return {
    headline: settings.headline || SHARE_LINK_DEFAULTS.headline,
    message: settings.message || SHARE_LINK_DEFAULTS.message,
    // An empty array is a real choice — "no channels" — but a missing key is not.
    channels: channels ?? [...SHARE_LINK_DEFAULTS.channels],
  };
}

/**
 * Normalises whatever is stored for `testimonials` into a complete config.
 *
 * The mode is validated rather than trusted: an unrecognised value falls back
 * to `static`, which is the safe end of the switch — it publishes nothing the
 * company did not type itself and puts no form on the website. A blob written
 * by an older build, or by hand, therefore degrades to "curated" rather than to
 * "open to the public internet".
 *
 * `reviewTarget` is validated the same way and for the same reason, with one
 * extra rule: `link` with nothing to link to falls back to `form`. The stored
 * blob should never be in that state — the validator refuses the write — but a
 * read that survives it degrades to a button that works rather than to one that
 * goes nowhere, and it is the reason nothing downstream has to check the URL
 * before rendering the link.
 *
 * `showRating` uses `??` for the reason the contact settings do: `false` is a
 * deliberate choice — a section with no stars — and `||` would turn it back on.
 */
function testimonialSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};
  const mode = TESTIMONIAL_MODE_VALUES.includes(settings.mode)
    ? settings.mode
    : TESTIMONIAL_DEFAULTS.mode;

  const reviewUrl = typeof settings.reviewUrl === 'string' ? settings.reviewUrl.trim() : '';
  const wantsLink =
    TESTIMONIAL_REVIEW_TARGET_VALUES.includes(settings.reviewTarget)
      ? settings.reviewTarget === TESTIMONIAL_REVIEW_TARGET.LINK
      : TESTIMONIAL_DEFAULTS.reviewTarget === TESTIMONIAL_REVIEW_TARGET.LINK;

  return {
    mode,
    reviewTarget:
      wantsLink && reviewUrl ? TESTIMONIAL_REVIEW_TARGET.LINK : TESTIMONIAL_REVIEW_TARGET.FORM,
    reviewUrl,
    eyebrow: settings.eyebrow || TESTIMONIAL_DEFAULTS.eyebrow,
    title: settings.title || TESTIMONIAL_DEFAULTS.title,
    lead: settings.lead || TESTIMONIAL_DEFAULTS.lead,
    formTitle: settings.formTitle || TESTIMONIAL_DEFAULTS.formTitle,
    formNote: settings.formNote || TESTIMONIAL_DEFAULTS.formNote,
    showRating: settings.showRating ?? TESTIMONIAL_DEFAULTS.showRating,
  };
}

/**
 * Normalises whatever is stored for `features_benefits` into a complete block
 * of wording.
 *
 * Only the section's own copy lives here — heading, lede, the label on the
 * button. The cards are rows in `company_features`, because they are a list the
 * tenant adds to, reorders and pins to branches, and none of that belongs in a
 * JSON blob.
 */
function featureSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};

  return {
    eyebrow: settings.eyebrow || FEATURE_DEFAULTS.eyebrow,
    title: settings.title || FEATURE_DEFAULTS.title,
    lead: settings.lead || FEATURE_DEFAULTS.lead,
    ctaLabel: settings.ctaLabel || FEATURE_DEFAULTS.ctaLabel,
  };
}

/**
 * The heading block a section shows above its cards, with the platform's
 * wording filling anything the tenant left blank.
 *
 * One function for Team, Gallery and Figures because they are the same three
 * fields; only the defaults differ, and those are passed in. Team and Gallery
 * were the last sections whose headings a company could not change — About,
 * Contact, Testimonials and Features all already let it — so every business on
 * the platform introduced its own staff with the same sentence. The band of
 * figures had no heading at all until it became a section of its own.
 */
function sectionCopy(stored, defaults) {
  const settings = stored && typeof stored === 'object' ? stored : {};
  return {
    eyebrow: settings.eyebrow || defaults.eyebrow,
    title: settings.title || defaults.title,
    lead: settings.lead || defaults.lead,
  };
}

/**
 * A `company_about` row as a complete block of copy, with the template's
 * defaults filling any field the tenant left empty. Also accepts a plain object,
 * which is how the legacy `settings` blob is read during the boot backfill.
 */
function aboutCopy(row) {
  const stored = row && typeof row === 'object' ? row : {};
  return {
    /** Null rather than the default: the console shows the default as a
        placeholder, and needs to know the tenant has not set one. */
    navLabel: stored.navLabel || null,
    eyebrow: stored.eyebrow || ABOUT_DEFAULTS.eyebrow,
    title: stored.title || ABOUT_DEFAULTS.title,
    lead: stored.lead || ABOUT_DEFAULTS.lead,
    body: stored.body || ABOUT_DEFAULTS.body,
  };
}

/**
 * A `company_contact` row as a complete block of settings, with the template's
 * defaults filling anything the tenant left empty.
 *
 * Booleans use `??` rather than `||`: `false` is a deliberate choice here —
 * switching the enquiry form off — and `||` would quietly turn it back on.
 */
function contactSettings(row) {
  const stored = row && typeof row === 'object' ? row : {};
  return {
    navLabel: stored.navLabel || null,
    eyebrow: stored.eyebrow || CONTACT_DEFAULTS.eyebrow,
    title: stored.title || CONTACT_DEFAULTS.title,
    lead: stored.lead || CONTACT_DEFAULTS.lead,
    showForm: stored.showForm ?? CONTACT_DEFAULTS.showForm,
    formTarget: stored.formTarget || CONTACT_DEFAULTS.formTarget,
    formNote: stored.formNote || CONTACT_DEFAULTS.formNote,
    showLocations: stored.showLocations ?? CONTACT_DEFAULTS.showLocations,
  };
}

/**
 * Per-key normalisation of the functionality's own settings blob.
 *
 * About is deliberately absent: its copy is branch-aware, so it lives in
 * `company_about` rather than in a single blob per tenant. Everything else that
 * has no settings gets `{}`.
 */
function settingsFor(key, stored) {
  if (key === FUNCTIONALITY.SHARE_LINK) return shareSettings(stored);
  if (key === FUNCTIONALITY.TESTIMONIALS) return testimonialSettings(stored);
  if (key === FUNCTIONALITY.FEATURES) return featureSettings(stored);
  /* Team, Gallery and Figures keep only the words above their cards. */
  if (key === FUNCTIONALITY.TEAM) return sectionCopy(stored, TEAM_DEFAULTS);
  if (key === FUNCTIONALITY.GALLERY) return sectionCopy(stored, GALLERY_DEFAULTS);
  if (key === FUNCTIONALITY.FIGURES) return sectionCopy(stored, STATS_DEFAULTS);
  return stored ?? {};
}

/**
 * The whole functionality picture for one company: every key in the catalogue,
 * whether the plan grants it, whether the tenant switched it on, whether it is
 * therefore live, and the reason when it is not.
 */
async function getFunctionalities(companyId) {
  const subscription = await runningSubscription(companyId, {
    include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'functionalities'] }],
  });

  const [rows, service] = await Promise.all([
    db.CompanyFunctionality.findAll({ where: { companyId } }),
    resolveServiceState(companyId, subscription),
  ]);

  const granted = new Set(grantedKeys(subscription));
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const items = FUNCTIONALITY_CATALOGUE.map((entry) => {
    const row = byKey.get(entry.key) ?? null;
    const isGranted = granted.has(entry.key);
    const isEnabled = row?.status === STATUS.ACTIVE;

    // Ordered so the most fundamental problem is the one reported: a feature
    // the plan never included should not read "switched off".
    let reason = null;
    if (!isGranted) reason = BLOCK_REASON.NOT_IN_PLAN;
    else if (!isEnabled) reason = BLOCK_REASON.DISABLED;
    else if (!service.active) reason = service.reason;

    return {
      ...entry,
      granted: isGranted,
      enabled: isEnabled,
      active: isGranted && isEnabled && service.active,
      // Never configured is different from configured-and-empty for the console,
      // which shows "not set up yet" on the first, so the raw row is reported.
      configured: Boolean(row),
      settings: settingsFor(entry.key, row?.settings),
      reason,
      message: reason ? MESSAGES[reason] ?? null : null,
    };
  });

  return {
    items,
    service,
    plan: subscription
      ? {
          id: subscription.planId,
          name: subscription.planSnapshot?.name ?? subscription.plan?.name ?? null,
          status: subscription.status,
          endDate: subscription.endDate,
        }
      : null,
    /** Just the live keys, for callers that only need to ask "is X on?". */
    activeKeys: items.filter((item) => item.active).map((item) => item.key),
  };
}

/** One entry from `getFunctionalities`, or a 404 for a key nobody defined. */
async function getFunctionality(companyId, key) {
  if (!FUNCTIONALITY_VALUES.includes(key)) throw ApiError.notFound('Unknown functionality');
  const { items } = await getFunctionalities(companyId);
  return items.find((item) => item.key === key);
}

/**
 * The guard the write routes call before letting a tenant configure a feature.
 *
 * Deliberately checks `granted` rather than `active`: a company whose plan
 * includes WhatsApp must still be able to fix a wrong number while the feature
 * is switched off, or while the plan is briefly suspended. What it may not do
 * is configure something it was never sold.
 */
async function assertGranted(companyId, key) {
  const item = await getFunctionality(companyId, key);
  if (!item?.granted) throw ApiError.badRequest(MESSAGES[BLOCK_REASON.NOT_IN_PLAN]);
  return item;
}

/* ------------------------------------------------------------------ *
 * The public shape
 * ------------------------------------------------------------------ */

/** `+91 98765 43210` or `091-98765` becomes `919876543210`, which is what wa.me wants. */
const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * The subscriber half of whatever was typed into the number field.
 *
 * The column holds the national number and the country code separately, but
 * nobody types them that way: people paste the number exactly as it appears on
 * a card — `+91 76230 38598` — and leave the country code at its default, which
 * would otherwise be concatenated in front of a number that already carries it
 * and produce `wa.me/91917623038598`.
 *
 * So two prefixes are dropped, and only these two, because both are
 * unambiguous statements of intent rather than guesses about length:
 *
 *   `+91…` / `0091…`  an explicitly international number whose country code is
 *                     the one this row is being saved with
 *   `0…`              the national trunk prefix, which is never dialled abroad
 *
 * A bare `919876543210` is left alone: without a `+` there is nothing to say
 * the leading `91` is a country code rather than the start of the number.
 */
function subscriberNumber(raw, countryCode) {
  const text = String(raw ?? '').trim();
  const cc = digitsOnly(countryCode);
  const international = /^(?:\+|00)/.test(text);

  let digits = digitsOnly(text);
  if (international) {
    // `00` survives digitsOnly where `+` does not, so it has to come off before
    // the country code underneath it can be recognised.
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (cc && digits.startsWith(cc)) digits = digits.slice(cc.length);
  }
  return digits.replace(/^0+/, '');
}

/** A whole wa.me link, message and all, so no template has to build one. */
function whatsappHref(row, message) {
  const phone = `${digitsOnly(row.countryCode)}${digitsOnly(row.number)}`;
  const text = message ?? row.defaultMessage;
  return text ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/${phone}`;
}

const TYPE_META = new Map(WHATSAPP_TYPE_CATALOGUE.map((entry) => [entry.key, entry]));

/** The public half of one number — no ids beyond its own, no audit columns. */
const publicNumber = (row) => {
  const meta = TYPE_META.get(row.type) ?? null;
  return {
    type: row.type,
    label: row.label || meta?.name || row.type,
    /** Printable, e.g. `+91 9876543210`. */
    display: `+${digitsOnly(row.countryCode)} ${digitsOnly(row.number)}`,
    number: digitsOnly(row.number),
    countryCode: digitsOnly(row.countryCode),
    defaultMessage: row.defaultMessage || meta?.defaultMessage || null,
    href: whatsappHref(row, row.defaultMessage || meta?.defaultMessage),
  };
};

/* ------------------------------- stat cards ------------------------------- */

/**
 * Whole units elapsed between two dates.
 *
 * Calendar-aware rather than `ms / 31_536_000_000`: a business founded on 29
 * February, or spanning a leap year, would otherwise tick over a day early or
 * late. Years and months step back through the calendar; only days are a plain
 * difference, where that is exactly what is wanted.
 */
function elapsed(from, unit, now = new Date()) {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  if (start > now) return 0;

  if (unit === STAT_UNIT.DAYS) {
    return Math.floor((now - start) / 86400000);
  }

  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  // The current month has not completed until the day-of-month is reached.
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);

  return unit === STAT_UNIT.MONTHS ? months : Math.floor(months / 12);
}

/**
 * The figure a stat card should show, as a finished string.
 *
 * A `since_date` card is computed here, on every request, which is the whole
 * point of the mode: "Years in business" is right next year without anyone
 * editing it. `cache: 'no-store'` on the website's fetch is what keeps that
 * true in production.
 */
function statDisplay(row, now = new Date()) {
  const core =
    row.mode === STAT_MODE.SINCE_DATE
      ? String(elapsed(row.sinceDate, row.unit, now))
      : String(row.value ?? '');

  if (!core) return '';
  return `${row.prefix ?? ''}${core}${row.suffix ?? ''}`;
}

/** The public half of a stat card — the finished figure and its label. */
const publicStat = (row, now) => ({
  id: row.id,
  label: row.label,
  display: statDisplay(row, now),
});

/* ------------------------------- testimonials ------------------------------- */

/** The public half of a review. No email, no phone, no IP — see the model. */
const publicTestimonial = (row) => ({
  id: row.id,
  authorName: row.authorName,
  authorRole: row.authorRole ?? null,
  photo: row.photo ?? null,
  rating: row.rating ?? null,
  body: row.body,
  /**
   * Whether a customer wrote it or the company did.
   *
   * Sent, but nothing in the white theme draws it today — the badge that did
   * was removed. It stays in the payload because it is the one fact about a
   * review a template might legitimately want to surface, and withholding it
   * would mean a schema change the first time one does. It is not sensitive:
   * it says which of two legitimate routes the words arrived by, and nothing
   * about who wrote them.
   */
  source: row.source,
  /** ISO date, for "reviewed in March". The time of day is nobody's business. */
  submittedAt: row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : null,
});

/**
 * Which reviews a host should show.
 *
 * Deliberately **not** the branch → company fallback the other card lists use,
 * and this is the one place in the schema that departs from it.
 *
 * That rule says a branch with rows of its own shows those *instead of* the
 * company-wide ones, which is right for a gallery: a branch that uploads its
 * own photographs has chosen to replace the company set, and a tenant did the
 * choosing. Reviews are not chosen. A single customer typing into the form on
 * the Surat site would, under that rule, be enough to wipe every curated review
 * off that site — replacing a wall of nine with a wall of one, silently, on the
 * say-so of a stranger.
 *
 * So a branch-pinned host shows its own reviews **and** the company-wide ones.
 * Reviews accumulate rather than override, which is what they do everywhere
 * else in the world. A company-wide host still shows only company-wide rows: a
 * visitor to `acme.com` should not be reading the Surat branch's feedback.
 */
const testimonialScope = (branchId) =>
  branchId ? { [Op.or]: [{ branchId }, { branchId: null }] } : { branchId: null };

/**
 * The Testimonials block for one host, or `null` when there is nothing to show.
 *
 * The mode decides both which reviews appear and in what order, and the two
 * halves of that are the whole point of the setting:
 *
 *   static   the company's own wall, in the order it arranged by hand.
 *   dynamic  a feed, newest first, whoever wrote it — a customer's review
 *            posted this morning belongs at the top, which is the reason to run
 *            it this way.
 *
 * Both are capped at `TESTIMONIAL_FEED_LIMIT`. The website shows them in a
 * slider, and a slider is a thing you page through rather than a wall you scan:
 * past ten cards nobody reaches the end, and the payload grows for reviews no
 * visitor will ever see. `total` still reports every approved review, so the
 * section can say what it is showing out of what it has.
 *
 * Admin-entered reviews are not excluded in `dynamic` mode. The company's own
 * seed reviews are what stop a newly-opened wall being empty, and they age out
 * naturally as customers write.
 *
 * The block is returned even with no reviews when the mode is `dynamic` — the
 * button is the point, and a section that says "be the first to review us" is a
 * real section. That holds whichever destination the button has: an empty wall
 * with a link to the company's Google page is still worth rendering. An empty
 * `static` wall is omitted entirely, exactly like Team and Gallery: there is
 * nothing to look at and no way to add anything.
 */
async function publicTestimonials(companyId, branchId, settings) {
  const dynamic = settings.mode === TESTIMONIAL_MODE.DYNAMIC;
  /**
   * The two destinations for the button, resolved here so the website never
   * has to. They are mutually exclusive by construction rather than by
   * convention: `form` and `reviewLink` cannot both be non-null, so a template
   * that renders whichever it finds cannot end up showing two review buttons
   * however the settings are edited.
   */
  const collecting = dynamic && settings.reviewTarget === TESTIMONIAL_REVIEW_TARGET.FORM;
  const linking = dynamic && settings.reviewTarget === TESTIMONIAL_REVIEW_TARGET.LINK;

  const where = {
    companyId,
    ...testimonialScope(branchId),
    status: STATUS.ACTIVE,
    moderation: TESTIMONIAL_MODERATION.APPROVED,
  };

  const [rows, total, ratingSum, ratingCount] = await Promise.all([
    db.CompanyTestimonial.findAll({
      where,
      order: dynamic ? [['createdAt', 'DESC'], ['id', 'DESC']] : CARD_ORDER,
      limit: TESTIMONIAL_FEED_LIMIT,
    }),
    db.CompanyTestimonial.count({ where }),
    /**
     * Aggregated over every approved review in scope, not over the ten in the
     * slider. "4.8 from 37 reviews" has to be the truth about 37 reviews.
     * Unrated rows are excluded from both halves so they cannot drag an average
     * down to zero.
     */
    db.CompanyTestimonial.sum('rating', { where }),
    db.CompanyTestimonial.count({ where: { ...where, rating: { [Op.ne]: null } } }),
  ]);

  if (!rows.length && !dynamic) return null;

  return {
    mode: settings.mode,
    eyebrow: settings.eyebrow,
    title: settings.title,
    lead: settings.lead,
    /**
     * The website renders the form on this alone and never on the mode, so
     * closing submissions later is one flag rather than a rule the template has
     * to keep in step.
     */
    canSubmit: collecting,
    form: collecting
      ? { title: settings.formTitle, note: settings.formNote, showRating: Boolean(settings.showRating) }
      : null,
    /**
     * The other half of the same switch: a button that leaves the site.
     *
     * `label` is `formTitle` — the same field that titles the dialog — because
     * from the visitor's side it is the same button, and a company that renamed
     * it to "Rate us" should not have that wording disappear because it now
     * points at Google. `url` is non-empty by the time it gets here —
     * `testimonialSettings` drops back to `form` otherwise — and the validator
     * is what refused any scheme but `http`/`https` on the way in.
     */
    reviewLink: linking ? { label: settings.formTitle, url: settings.reviewUrl } : null,
    items: rows.map(publicTestimonial),
    /** Every approved review in scope, not just the ones sent. */
    total,
    /** One decimal place, e.g. `4.8`; null when nobody has left a star. */
    averageRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    ratingCount,
  };
}

/* ---------------------------- features / benefits --------------------------- */

/**
 * One benefit card as the website receives it.
 *
 * The icon is checked here rather than trusted. A name the platform no longer
 * draws — a glyph retired from `FEATURE_ICONS`, or a row written before the
 * validator existed — becomes `spark` on the way out, so the worst an unknown
 * name can do is pick the wrong picture rather than leave a card with a hole in
 * it. Every renderer falls back the same way; this is the belt to their braces.
 */
const publicFeatureCard = (row) => ({
  id: row.id,
  icon: FEATURE_ICON_KEYS.includes(row.icon) ? row.icon : FEATURE_ICON_FALLBACK,
  title: row.title,
  body: row.body ?? null,
});

/**
 * The Features / Benefits band for one host, or `null` when there is nothing to
 * show.
 *
 * Empty means absent, exactly as Team and Gallery do it: a heading over no
 * cards is not a section, it is a blank strip with a title on it. That is also
 * what the switch buys — the band appeared on every site the platform served
 * when it was the template's copy, and now appears only where a company has
 * turned it on and written something.
 */
async function publicBenefits(companyId, branchId, settings) {
  const rows = await branchScoped(db.CompanyFeature, companyId, branchId, { status: STATUS.ACTIVE });
  if (!rows.length) return null;

  return {
    eyebrow: settings.eyebrow,
    title: settings.title,
    lead: settings.lead,
    /** The button under the lede. The website renders it only where it has a
        Contact page to send the reader to. */
    ctaLabel: settings.ctaLabel,
    items: rows.map(publicFeatureCard),
  };
}

/* --------------------------- branch resolution --------------------------- */

const CARD_ORDER = [['sequence', 'ASC'], ['id', 'ASC']];

/**
 * The rows one host should see, branch-aware.
 *
 * The same fallback the sliders have always used, and now the only one in the
 * product: a branch-pinned domain shows that branch's own rows, and a branch
 * that has none falls back to the company-wide ones (`branch_id IS NULL`). So a
 * new branch site is never blank, and turning one branch's gallery on does not
 * silently empty every other site.
 *
 * A company-wide host only ever sees company-wide rows — a visitor to
 * `acme.com` should not be shown the Surat branch's team.
 */
async function branchScoped(model, companyId, branchId, extra = {}) {
  const where = { companyId, ...extra };

  if (branchId) {
    const own = await model.findAll({ where: { ...where, branchId }, order: CARD_ORDER });
    if (own.length) return own;
  }

  return model.findAll({ where: { ...where, branchId: null }, order: CARD_ORDER });
}

/** The About copy for one host: the branch's own, else the company-wide one. */
async function resolveAboutRow(companyId, branchId) {
  if (branchId) {
    const own = await db.CompanyAbout.findOne({ where: { companyId, branchId } });
    if (own) return own;
  }
  return db.CompanyAbout.findOne({ where: { companyId, branchId: null } });
}

/**
 * The Contact page settings for one host, resolved the same way.
 *
 * `null` when the tenant is not showing a Contact page today — either its plan
 * does not include the functionality or it has the switch off. The website
 * drops the page and its nav link entirely rather than serving an empty one,
 * so a withheld page is absent rather than hidden.
 *
 * A tenant that has the functionality but never opened the screen still gets a
 * working page: the row is optional, the defaults fill it in.
 */
async function publicContact(companyId, branchId) {
  const { activeKeys } = await getFunctionalities(companyId);
  if (!activeKeys.includes(FUNCTIONALITY.CONTACT_PAGE)) return null;

  let row = null;
  if (branchId) row = await db.CompanyContact.findOne({ where: { companyId, branchId } });
  if (!row) row = await db.CompanyContact.findOne({ where: { companyId, branchId: null } });
  return contactSettings(row);
}

/**
 * What `/public/company-details` embeds under `features`.
 *
 * A key is present only when it is live, and `whatsapp` is additionally omitted
 * when the company has switched the feature on but never added a number — a
 * chat button that opens nothing is worse than no button. The website therefore
 * renders on presence alone and needs no rules of its own.
 */
/**
 * The website's menu for one host.
 *
 * Built here rather than in the template so that a page's name is the tenant's
 * to set and a page they are not entitled to never appears. Each entry in
 * `NAV_PAGES` names the settings row it takes its label from; an entry with no
 * `settings` keeps the template's name, and one whose `functionality` is not
 * live is left out entirely.
 *
 * Adding a page in future is a row in `NAV_PAGES` and a `navLabel` on whatever
 * settings table it has. Nothing here or in the website changes.
 */
async function publicNav(companyId, branchId, activeKeys) {
  const needsSettings = NAV_PAGES.some((page) => page.settings);

  const [aboutRow, contactRow] = needsSettings
    ? await Promise.all([
        resolveAboutRow(companyId, branchId),
        branchId
          ? db.CompanyContact.findOne({ where: { companyId, branchId } }).then(
              (own) => own ?? db.CompanyContact.findOne({ where: { companyId, branchId: null } })
            )
          : db.CompanyContact.findOne({ where: { companyId, branchId: null } }),
      ])
    : [null, null];

  const labels = { about: aboutRow?.navLabel, contact: contactRow?.navLabel };

  return NAV_PAGES.filter((page) => !page.functionality || activeKeys.includes(page.functionality)).map(
    (page) => ({
      key: page.key,
      href: page.href,
      // Trimmed because a label of spaces would render as a gap in the bar.
      label: (page.settings && labels[page.settings]?.trim()) || page.label,
    })
  );
}

async function publicFeatures(companyId, branchId = null) {
  const { activeKeys } = await getFunctionalities(companyId);
  const features = {
    whatsapp: null,
    shareLink: null,
    about: null,
    figures: null,
    team: null,
    gallery: null,
    testimonials: null,
    benefits: null,
  };
  if (!activeKeys.length) return features;

  if (activeKeys.includes(FUNCTIONALITY.WHATSAPP)) {
    const rows = await db.CompanyWhatsapp.findAll({
      where: { companyId, status: STATUS.ACTIVE },
      order: [['sequence', 'ASC'], ['id', 'ASC']],
    });

    if (rows.length) {
      const numbers = rows.map(publicNumber);
      /**
       * First active number wins its type, and every type the company left
       * empty falls back to `contact` — so filling in one number is enough to
       * make every button on the site work.
       */
      const byType = {};
      numbers.forEach((entry) => {
        if (!byType[entry.type]) byType[entry.type] = entry;
      });
      const fallback = byType[WHATSAPP_FALLBACK_TYPE] ?? numbers[0];
      WHATSAPP_TYPE_CATALOGUE.forEach((entry) => {
        byType[entry.key] = byType[entry.key] ?? fallback;
      });

      features.whatsapp = { numbers, byType, primary: fallback };
    }
  }

  if (activeKeys.includes(FUNCTIONALITY.SHARE_LINK)) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.SHARE_LINK },
    });
    features.shareLink = shareSettings(row?.settings);
  }

  /**
   * About is the one block with a fallback rather than an absence: the section
   * is part of the template, so a tenant without the feature still gets one
   * built from its company profile (see the website's `AboutSection`). What the
   * feature buys is writing it yourself.
   */
  if (activeKeys.includes(FUNCTIONALITY.ABOUT_US)) {
    features.about = aboutCopy(await resolveAboutRow(companyId, branchId));
  }

  /**
   * The figures, as their own block — they used to ride on `about`, and that
   * was never where they belonged. The band opens the home page, which shows
   * nothing else from the About row, and a company can reasonably want its
   * numbers on show without buying a written About page. Sold, switched on and
   * absent independently, like every other section.
   *
   * Omitted entirely when every figure resolves to nothing: the band is the
   * tenant's own numbers or it is not there, never a heading over empty tiles.
   */
  if (activeKeys.includes(FUNCTIONALITY.FIGURES)) {
    const [row, statRows] = await Promise.all([
      db.CompanyFunctionality.findOne({ where: { companyId, key: FUNCTIONALITY.FIGURES } }),
      branchScoped(db.CompanyStat, companyId, branchId, { status: STATUS.ACTIVE }),
    ]);

    const now = new Date();
    // A card whose figure comes out empty is dropped rather than rendered as a
    // blank tile — a `fixed` card can be saved with its value cleared.
    const items = statRows.map((stat) => publicStat(stat, now)).filter((stat) => stat.display);

    if (items.length) {
      features.figures = { ...sectionCopy(row?.settings, STATS_DEFAULTS), items };
    }
  }

  if (activeKeys.includes(FUNCTIONALITY.TEAM)) {
    const rows = await branchScoped(db.CompanyTeamMember, companyId, branchId, { status: STATUS.ACTIVE });
    // An empty Team section is worse than none, so it is omitted entirely.
    if (rows.length) {
      /**
       * The heading the company wrote, or the platform's. Read only when there
       * is a section to head: a tenant with no team members gets no block at
       * all, so fetching its wording would be a query for nothing.
       */
      const settingsRow = await db.CompanyFunctionality.findOne({
        where: { companyId, key: FUNCTIONALITY.TEAM },
      });

      features.team = {
        ...sectionCopy(settingsRow?.settings, TEAM_DEFAULTS),
        members: rows.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role ?? null,
          bio: row.bio ?? null,
          photo: row.photo ?? null,
          email: row.email ?? null,
          phone: row.phone ?? null,
          linkedinUrl: row.linkedinUrl ?? null,
        })),
      };
    }
  }

  if (activeKeys.includes(FUNCTIONALITY.GALLERY)) {
    const rows = await branchScoped(db.CompanyGalleryItem, companyId, branchId, { status: STATUS.ACTIVE });
    if (rows.length) {
      /* The company's own heading, or the platform's. Same rule as Team above. */
      const settingsRow = await db.CompanyFunctionality.findOne({
        where: { companyId, key: FUNCTIONALITY.GALLERY },
      });

      features.gallery = {
        ...sectionCopy(settingsRow?.settings, GALLERY_DEFAULTS),
        items: rows.map((row) => ({
          id: row.id,
          image: row.image,
          title: row.title ?? null,
          caption: row.caption ?? null,
          // Falls back to the title; an image with neither is decorative and
          // gets an empty alt rather than a meaningless one.
          altText: row.altText || row.title || '',
        })),
      };
    }
  }

  if (activeKeys.includes(FUNCTIONALITY.TESTIMONIALS)) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.TESTIMONIALS },
    });
    features.testimonials = await publicTestimonials(
      companyId,
      branchId,
      testimonialSettings(row?.settings)
    );
  }

  if (activeKeys.includes(FUNCTIONALITY.FEATURES)) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.FEATURES },
    });
    features.benefits = await publicBenefits(companyId, branchId, featureSettings(row?.settings));
  }

  return features;
}

module.exports = {
  BLOCK_REASON,
  MESSAGES,
  grantedKeys,
  shareSettings,
  sectionCopy,
  testimonialSettings,
  publicTestimonials,
  featureSettings,
  publicBenefits,
  aboutCopy,
  contactSettings,
  publicContact,
  publicNav,
  settingsFor,
  resolveAboutRow,
  branchScoped,
  elapsed,
  statDisplay,
  getFunctionalities,
  getFunctionality,
  assertGranted,
  publicFeatures,
  whatsappHref,
  digitsOnly,
  subscriberNumber,
};
