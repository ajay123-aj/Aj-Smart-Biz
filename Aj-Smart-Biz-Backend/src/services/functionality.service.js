'use strict';

const { Op, fn, col, where: sqlWhere } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { resolveServiceState, runningSubscription } = require('./serviceState.service');
/* Safe at the top level: stock.service reaches only for the models, so there is
   no cycle back to this file. `order.service` is the one that has to require
   lazily, and it says so where it does. */
const stockService = require('./stock.service');
/* The diary. Reaches only for the models and the constants, so no cycle. */
const bookingService = require('./booking.service');
const {
  STATUS,
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  FUNCTIONALITY_CATALOGUE,
  WHATSAPP_TYPE_CATALOGUE,
  SOCIAL_PLATFORM_CATALOGUE,
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
  SERVICE_DEFAULTS,
  SERVICE_ENQUIRY_TARGET,
  SERVICE_ENQUIRY_TARGET_VALUES,
  NAV_LABEL_SOURCE,
  TEAM_DEFAULTS,
  GALLERY_DEFAULTS,
  PRODUCT_DEFAULTS,
  PRODUCT_STOCK,
  PRODUCT_STOCK_VALUES,
  CATALOGUE_HOME_LIMITS,
  ORDER_MODE,
  ORDER_MODE_VALUES,
  ORDER_DEFAULTS,
  ORDER_QTY_MAX,
  ORDER_LINES_MAX,
  BLOG_DEFAULTS,
  BLOG_HOME_LIMIT,
  BLOG_TAGS_MAX,
  BLOG_READ_WPM,
  SERVICE_HOME_LIMITS,
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

/**
 * Why a functionality is not on the website. `null` when it is.
 *
 * `EMPTY` is the odd one out and the reason it exists is worth stating. The
 * other four are about entitlement: the plan, the switch, the term. `EMPTY`
 * means all three are satisfied and the section *still* does not appear,
 * because the company has not written anything into it — and several sections
 * are absent rather than empty by design, so switching one on publishes exactly
 * nothing until a card is added.
 *
 * Without it the console said "On your website" the moment a switch was
 * flipped, while the website showed no such section. That is precisely the
 * disagreement this service exists to prevent, and a tenant meeting it
 * reasonably concludes the feature is broken.
 */
const BLOCK_REASON = {
  NOT_IN_PLAN: 'not_in_plan',
  DISABLED: 'disabled',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  NO_PLAN: 'no_plan',
  EMPTY: 'empty',
};

const MESSAGES = {
  [BLOCK_REASON.NOT_IN_PLAN]: 'Your plan does not include this functionality. Upgrade your plan to switch it on.',
  [BLOCK_REASON.DISABLED]: 'This functionality is switched off, so it does not appear on your website.',
  [BLOCK_REASON.EXPIRED]: 'Your plan has expired, so this functionality is not being served. Renew it to bring it back.',
  [BLOCK_REASON.SUSPENDED]: 'Your plan is suspended, so this functionality is not being served.',
  [BLOCK_REASON.NO_PLAN]: 'No plan is active for this company, so this functionality is not being served.',
  [BLOCK_REASON.EMPTY]: 'This is switched on, but you have not added anything to it yet — the section stays off your website until you do.',
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
 * Normalises whatever is stored for `services` into a complete block of
 * wording, plus the name the page carries in the menu.
 *
 * `navLabel` is null rather than defaulted, the same way About's and Contact's
 * are: the console shows the platform's name as a placeholder, and has to be
 * able to tell "they typed the standard name" from "they never opened the
 * field". `publicNav` falls back for it.
 */
function serviceSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};

  return {
    navLabel: settings.navLabel || null,
    eyebrow: settings.eyebrow || SERVICE_DEFAULTS.eyebrow,
    title: settings.title || SERVICE_DEFAULTS.title,
    lead: settings.lead || SERVICE_DEFAULTS.lead,
    ctaLabel: settings.ctaLabel || SERVICE_DEFAULTS.ctaLabel,
    /**
     * Validated rather than trusted on the way out, the same way the
     * testimonial mode is and for the same reason: this value decides whether
     * the public internet can write rows into a tenant's database, so a blob
     * that somehow holds nonsense must fail closed rather than open. An
     * unrecognised value lands on the default.
     */
    enquiryTarget: SERVICE_ENQUIRY_TARGET_VALUES.includes(settings.enquiryTarget)
      ? settings.enquiryTarget
      : SERVICE_DEFAULTS.enquiryTarget,
    formTitle: settings.formTitle || SERVICE_DEFAULTS.formTitle,
    formNote: settings.formNote || SERVICE_DEFAULTS.formNote,

    /* The categories band and the offers band, each making its own argument -
       the same three-blocks-of-copy arrangement the catalogue has, and for the
       same reason: "what kind of work we do" and "what is reduced this month"
       are different sentences. */
    categoriesEyebrow: settings.categoriesEyebrow || SERVICE_DEFAULTS.categoriesEyebrow,
    categoriesTitle: settings.categoriesTitle || SERVICE_DEFAULTS.categoriesTitle,
    categoriesLead: settings.categoriesLead || SERVICE_DEFAULTS.categoriesLead,
    offersEyebrow: settings.offersEyebrow || SERVICE_DEFAULTS.offersEyebrow,
    offersTitle: settings.offersTitle || SERVICE_DEFAULTS.offersTitle,
    offersLead: settings.offersLead || SERVICE_DEFAULTS.offersLead,
    /** The button on a bookable card, where "Enquire" is the wrong word. */
    bookLabel: settings.bookLabel || SERVICE_DEFAULTS.bookLabel,

    /**
     * The diary. Normalised by the service that owns it rather than here, so
     * the hours the website paints and the hours the booking route enforces are
     * the same object - see `booking.service`.
     */
    booking: bookingService.bookingSettings(settings.booking),
  };
}

/**
 * The catalogue's three blocks of copy, plus the name its page carries in the
 * menu — normalised the same way `serviceSettings` normalises its own.
 *
 * Three blocks rather than one because the catalogue puts three bands on a site
 * and each makes a different argument; see `PRODUCT_DEFAULTS`. `navLabel` stays
 * null rather than defaulted, so the console can tell "they typed the standard
 * name" from "they never opened the field".
 */
function productSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};

  return {
    navLabel: settings.navLabel || null,
    eyebrow: settings.eyebrow || PRODUCT_DEFAULTS.eyebrow,
    title: settings.title || PRODUCT_DEFAULTS.title,
    lead: settings.lead || PRODUCT_DEFAULTS.lead,
    categoriesEyebrow: settings.categoriesEyebrow || PRODUCT_DEFAULTS.categoriesEyebrow,
    categoriesTitle: settings.categoriesTitle || PRODUCT_DEFAULTS.categoriesTitle,
    categoriesLead: settings.categoriesLead || PRODUCT_DEFAULTS.categoriesLead,
    offersEyebrow: settings.offersEyebrow || PRODUCT_DEFAULTS.offersEyebrow,
    offersTitle: settings.offersTitle || PRODUCT_DEFAULTS.offersTitle,
    offersLead: settings.offersLead || PRODUCT_DEFAULTS.offersLead,
    ctaLabel: settings.ctaLabel || PRODUCT_DEFAULTS.ctaLabel,
  };
}

/**
 * The blog's wording, plus the name its page carries in the menu - normalised
 * the same way the services and catalogue blobs are.
 *
 * `showAuthor` uses `??` rather than `||`, like every other boolean on the
 * platform: `false` is a deliberate choice - a company that writes as itself and
 * wants no bylines - and `||` would quietly put them back on every article.
 */
function blogSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};

  return {
    navLabel: settings.navLabel || null,
    eyebrow: settings.eyebrow || BLOG_DEFAULTS.eyebrow,
    title: settings.title || BLOG_DEFAULTS.title,
    lead: settings.lead || BLOG_DEFAULTS.lead,
    ctaLabel: settings.ctaLabel || BLOG_DEFAULTS.ctaLabel,
    showAuthor: settings.showAuthor ?? BLOG_DEFAULTS.showAuthor,
  };
}

/**
 * The cart's wording and terms, normalised the way every other settings blob
 * on the platform is.
 *
 * `mode` and `whatsappType` are validated on the way out as well as on the way
 * in — the same double check the testimonial mode and the service enquiry
 * target get, and for the same reason. This value decides whether a stranger is
 * shown a button that asks them for money, so a blob that somehow holds
 * nonsense has to fail closed onto the default rather than open.
 *
 * The labels are trimmed before they are tested, so a field holding three
 * spaces asks for the platform's wording back rather than rendering a button
 * with nothing on it.
 */
function orderSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};
  const text = (value, fallback) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || fallback;
  };

  /** Null unless it is a real, positive number — a floor of zero is no floor. */
  const minimum = Number(settings.minOrderAmount);
  const minOrderAmount = Number.isFinite(minimum) && minimum > 0 ? minimum : null;

  return {
    mode: ORDER_MODE_VALUES.includes(settings.mode) ? settings.mode : ORDER_DEFAULTS.mode,
    cart: settings.cart === undefined || settings.cart === null ? ORDER_DEFAULTS.cart : Boolean(settings.cart),

    addToCartLabel: text(settings.addToCartLabel, ORDER_DEFAULTS.addToCartLabel),
    buyNowLabel: text(settings.buyNowLabel, ORDER_DEFAULTS.buyNowLabel),
    submitLabel: text(settings.submitLabel, ORDER_DEFAULTS.submitLabel),
    cartTitle: text(settings.cartTitle, ORDER_DEFAULTS.cartTitle),
    cartNote: text(settings.cartNote, ORDER_DEFAULTS.cartNote),

    whatsappType: WHATSAPP_TYPE_CATALOGUE.some((entry) => entry.key === settings.whatsappType)
      ? settings.whatsappType
      : ORDER_DEFAULTS.whatsappType,
    messageIntro: text(settings.messageIntro, ORDER_DEFAULTS.messageIntro),

    requireName:
      settings.requireName === undefined || settings.requireName === null
        ? ORDER_DEFAULTS.requireName
        : Boolean(settings.requireName),
    requirePhone:
      settings.requirePhone === undefined || settings.requirePhone === null
        ? ORDER_DEFAULTS.requirePhone
        : Boolean(settings.requirePhone),
    requireAddress: Boolean(settings.requireAddress),

    minOrderAmount,

    upiId: text(settings.upiId, '') || null,
    payeeName: text(settings.payeeName, '') || null,
    paymentUrl: text(settings.paymentUrl, '') || null,
    paymentLabel: text(settings.paymentLabel, ORDER_DEFAULTS.paymentLabel),
    paymentNote: text(settings.paymentNote, ORDER_DEFAULTS.paymentNote),
  };
}

/**
 * What the cart can actually do on this tenant's site today — or `null`, which
 * is the whole of "this site does not take orders".
 *
 * The one place that decides it, called by the public payload, so a button a
 * visitor can press and a route the API would honour can never disagree. Four
 * ways to end up with nothing, and the website tells none of them apart:
 *
 *   no catalogue    a cart with nothing to put in it. The `orders` grant sits
 *                   on top of `products` rather than beside it, so this block
 *                   is withheld whenever that one is — including when the
 *                   tenant simply has not published a product yet.
 *   mode `none`     the tenant's own choice, and a real one: the labels, the
 *                   number and the payment details are all kept, so turning
 *                   orders back on next month sets nothing up again.
 *   `whatsapp`, no number
 *                   an order composed for nobody. The same line `publicServices`
 *                   takes on its enquiry button, for the same reason.
 *   `payment`, no UPI id and no link
 *                   a Pay button that leads nowhere, which is worse in this
 *                   position than no button at all.
 *
 * The WhatsApp number is taken from the block already resolved for the page
 * rather than queried again — which also means orders degrade correctly when
 * the WhatsApp functionality itself is not live, without this having to ask.
 */
function publicOrders(settings, whatsappFeature) {
  if (settings.mode === ORDER_MODE.NONE) return null;

  const whatsapp =
    whatsappFeature?.byType?.[settings.whatsappType] ?? whatsappFeature?.primary ?? null;

  /**
   * Something to pay *into*. UPI first because that is what the tenants here
   * use and what a phone can open without a browser; a hosted link is the
   * answer for a business taking cards. Either is enough, and a tenant with
   * both gets both — the website offers the two side by side rather than
   * choosing for the payer.
   */
  const payment =
    settings.upiId || settings.paymentUrl
      ? {
        upiId: settings.upiId,
        /* Falls back on the website to the company's own name. Sent as null
           rather than guessed here: this service has no company row in hand. */
        payeeName: settings.payeeName,
        url: settings.paymentUrl,
        label: settings.paymentLabel,
        note: settings.paymentNote,
      }
      : null;

  if (settings.mode === ORDER_MODE.WHATSAPP && !whatsapp) return null;
  if (settings.mode === ORDER_MODE.PAYMENT && !payment) return null;

  return {
    mode: settings.mode,
    cart: settings.cart,

    addToCartLabel: settings.addToCartLabel,
    buyNowLabel: settings.buyNowLabel,
    submitLabel: settings.submitLabel,
    cartTitle: settings.cartTitle,
    cartNote: settings.cartNote,
    messageIntro: settings.messageIntro,

    requireName: settings.requireName,
    requirePhone: settings.requirePhone,
    requireAddress: settings.requireAddress,
    minOrderAmount: settings.minOrderAmount,

    /**
     * The number the order goes to, even in `payment` mode. A payment with no
     * idea what was bought is not an order, so where a tenant taking payment
     * has published a number the website sends the basket there as well.
     * `null` when they have not, and the payment then stands alone.
     */
    whatsapp,
    payment,

    /** The platform's caps, sent so the template enforces the same numbers. */
    quantityMax: ORDER_QTY_MAX,
    linesMax: ORDER_LINES_MAX,
  };
}

/**
 * What the enquiry button can actually do on this tenant's site today, given
 * where they pointed it and whether they have published a number for it.
 *
 * One function, called by the website's payload and by the public write route,
 * so the button a visitor sees and the request the API accepts are decided by
 * the same answer. Three outcomes:
 *
 *   `null`          no button at all. Only reachable by pointing the form at
 *                   WhatsApp and publishing no number — a chat with nobody is
 *                   worse than no button, exactly as the Contact page's form
 *                   hides itself in the same position.
 *   `admin`         the enquiry is recorded and nothing leaves the platform.
 *   `whatsapp`      handed to WhatsApp and not recorded.
 *   `both`          recorded and handed over. Degrades to `admin` where there
 *                   is no number, because the record is the half worth keeping.
 */
function serviceEnquiryTarget(settings, whatsappNumber) {
  const wanted = settings.enquiryTarget;
  if (whatsappNumber) return wanted;

  if (wanted === SERVICE_ENQUIRY_TARGET.WHATSAPP) return null;
  return SERVICE_ENQUIRY_TARGET.ADMIN;
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
  if (key === FUNCTIONALITY.SERVICES) return serviceSettings(stored);
  if (key === FUNCTIONALITY.PRODUCTS) return productSettings(stored);
  if (key === FUNCTIONALITY.BLOG) return blogSettings(stored);
  /* Team, Gallery and Figures keep only the words above their cards. */
  if (key === FUNCTIONALITY.TEAM) return sectionCopy(stored, TEAM_DEFAULTS);
  if (key === FUNCTIONALITY.GALLERY) return sectionCopy(stored, GALLERY_DEFAULTS);
  if (key === FUNCTIONALITY.FIGURES) return sectionCopy(stored, STATS_DEFAULTS);
  /**
   * `orders` is **deliberately not** normalised here, unlike every key above it.
   *
   * Its console screen shows the platform's wording as placeholders and needs to
   * tell "they typed the standard label" from "they never opened the field" —
   * the same distinction `navLabel` stays null for. Filling the blob on the way
   * out would hand that screen a form pre-filled with defaults and lose it.
   * The website reads `orderSettings` directly (see `publicFeatures`), so the
   * defaults still apply everywhere they are actually rendered.
   */
  return stored ?? {};
}

/**
 * The sections that are **absent rather than empty**: entitled, switched on and
 * with nothing written is a section the website does not render at all.
 *
 * One entry per card-backed feature, naming the table its content lives in and
 * what counts as published there. It is the same rule each `publicX` function
 * applies on the way out — this is the console's side of it, so the switch and
 * the site agree about whether anything is actually being shown.
 *
 * About, Figures, WhatsApp and the rest are deliberately absent from this list.
 * About falls back to the company profile, Figures seeds its own cards, and
 * WhatsApp's own emptiness is already reported by the numbers screen.
 */
const CONTENT_SOURCES = {
  [FUNCTIONALITY.SERVICES]: { model: () => db.CompanyService, where: { status: STATUS.ACTIVE } },
  [FUNCTIONALITY.TEAM]: { model: () => db.CompanyTeamMember, where: { status: STATUS.ACTIVE } },
  [FUNCTIONALITY.GALLERY]: { model: () => db.CompanyGalleryItem, where: { status: STATUS.ACTIVE } },
  [FUNCTIONALITY.FEATURES]: { model: () => db.CompanyFeature, where: { status: STATUS.ACTIVE } },
  /**
   * Products, not categories. A tenant that has built a category tree and filed
   * nothing in it has published a set of empty shelves, and the console saying
   * "on your website" over that is the exact disagreement this list exists to
   * prevent — the catalogue band, the products page and the nav entry all wait
   * on a product, so this counts the same thing they do.
   */
  [FUNCTIONALITY.PRODUCTS]: { model: () => db.CompanyProduct, where: { status: STATUS.ACTIVE } },
  /**
   * Posts, and only the ones a reader could actually be looking at.
   *
   * The only entry in this list whose `where` is about **time** rather than
   * status, and it has to be: a tenant with four articles scheduled for next
   * month has published nothing today, and a console saying "on your website"
   * over an archive that 404s is the exact disagreement this list exists to
   * prevent. It counts what `publicBlog` counts.
   */
  [FUNCTIONALITY.BLOG]: {
    model: () => db.CompanyBlogPost,
    where: { status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: new Date() } },
  },
  /**
   * Only an approved review is published, so a queue of pending ones still
   * counts as nothing on the website — which is exactly what the tenant needs
   * telling. `skip` exempts a `dynamic` wall: it survives being empty because
   * the review form is the point of it, and calling that "nothing published"
   * would be wrong.
   */
  [FUNCTIONALITY.TESTIMONIALS]: {
    model: () => db.CompanyTestimonial,
    where: { status: STATUS.ACTIVE, moderation: TESTIMONIAL_MODERATION.APPROVED },
    skip: (row) => testimonialSettings(row?.settings).mode !== TESTIMONIAL_MODE.STATIC,
  },
};

/**
 * How many published rows each live, card-backed feature has.
 *
 * Only asked for the features that are actually live — a switched-off section
 * has nothing to report and the count would be a query for nothing — and only
 * when the caller wants it. The public website path calls `getFunctionalities`
 * on every request and decides emptiness for itself from the rows it is already
 * loading, so it would be paying for five counts it never reads.
 */
async function contentCounts(companyId, liveKeys, rowsByKey) {
  const wanted = liveKeys.filter((key) => {
    const source = CONTENT_SOURCES[key];
    return source && !(source.skip && source.skip(rowsByKey.get(key)));
  });
  if (!wanted.length) return new Map();

  const counts = await Promise.all(
    wanted.map((key) =>
      CONTENT_SOURCES[key].model().count({ where: { companyId, ...CONTENT_SOURCES[key].where } })
    )
  );

  return new Map(wanted.map((key, index) => [key, counts[index]]));
}

/**
 * The whole functionality picture for one company: every key in the catalogue,
 * whether the plan grants it, whether the tenant switched it on, whether it is
 * therefore live, and the reason when it is not.
 *
 * `withContent` additionally reports, for the card-backed sections, how many
 * rows each is publishing — see `CONTENT_SOURCES`. The consoles ask for it so a
 * switch cannot claim to be on the website while the section is empty; the
 * public path does not, because it resolves emptiness from the rows it loads
 * anyway.
 */
async function getFunctionalities(companyId, { withContent = false } = {}) {
  const subscription = await runningSubscription(companyId, {
    include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'functionalities'] }],
  });

  const [rows, service] = await Promise.all([
    db.CompanyFunctionality.findAll({ where: { companyId } }),
    resolveServiceState(companyId, subscription),
  ]);

  const granted = new Set(grantedKeys(subscription));
  const byKey = new Map(rows.map((row) => [row.key, row]));

  /**
   * The features that clear all three gates. Their content is counted below;
   * anything short of live has nothing to publish and is not asked about.
   */
  const liveKeys = service.active
    ? FUNCTIONALITY_CATALOGUE.map((entry) => entry.key).filter(
      (key) => granted.has(key) && byKey.get(key)?.status === STATUS.ACTIVE
    )
    : [];

  const counts = withContent ? await contentCounts(companyId, liveKeys, byKey) : new Map();

  const items = FUNCTIONALITY_CATALOGUE.map((entry) => {
    const row = byKey.get(entry.key) ?? null;
    const isGranted = granted.has(entry.key);
    const isEnabled = row?.status === STATUS.ACTIVE;
    const isActive = isGranted && isEnabled && service.active;

    /**
     * How many rows this section is publishing, or `null` when it is not the
     * kind of section that has any — and when the caller did not ask.
     */
    const contentCount = counts.has(entry.key) ? counts.get(entry.key) : null;

    // Ordered so the most fundamental problem is the one reported: a feature
    // the plan never included should not read "switched off", and one that is
    // simply empty should not read as anything worse than that.
    let reason = null;
    if (!isGranted) reason = BLOCK_REASON.NOT_IN_PLAN;
    else if (!isEnabled) reason = BLOCK_REASON.DISABLED;
    else if (!service.active) reason = service.reason;
    else if (contentCount === 0) reason = BLOCK_REASON.EMPTY;

    return {
      ...entry,
      granted: isGranted,
      enabled: isEnabled,
      /**
       * Entitlement only, and deliberately unchanged by emptiness: the write
       * guards and `activeKeys` are built on it, and a tenant must be able to
       * add the first service to a section that is by definition empty until
       * they do. Whether anything is actually on the website is `published`.
       */
      active: isActive,
      /**
       * Live **and** carrying something. False on a switched-on section with
       * nothing in it — which is a section the website does not render, so a
       * console saying otherwise would be lying. `null` when the caller did not
       * ask for content counts.
       */
      published: withContent ? isActive && contentCount !== 0 : null,
      contentCount,
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
async function getFunctionality(companyId, key, options) {
  if (!FUNCTIONALITY_VALUES.includes(key)) throw ApiError.notFound('Unknown functionality');
  const { items } = await getFunctionalities(companyId, options);
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

/* -------------------------------- services ------------------------------- */

/**
 * One service as the website receives it.
 *
 * The icon is checked rather than trusted, exactly as a benefit card's is: a
 * name the platform no longer draws becomes `spark` on the way out, so the
 * worst an unknown glyph can do is pick the wrong picture.
 *
 * `highlights` is normalised hard. It is the one field on the platform that
 * arrives as free-form JSON, so it is coerced to an array of non-empty strings
 * here rather than being handed to a template that would then have to guard
 * every `.map` on it. A row written before the validator existed, or by hand,
 * cannot break a page from this side.
 */
const publicService = (row, { categoryPath = [], bookingLive = false } = {}) => ({
  id: row.id,
  /** The address of its own page - `/services/bridal-makeup`. */
  slug: row.slug,
  icon: FEATURE_ICON_KEYS.includes(row.icon) ? row.icon : FEATURE_ICON_FALLBACK,
  image: row.image ?? null,
  title: row.title,
  summary: row.summary ?? null,
  /** The long version, for the service's own page. Plain text, never markup. */
  description: row.description ?? null,
  /**
   * Where it is filed, as a finished path - `Hair > Colour`. Sent rather than
   * an id, so a breadcrumb costs no second request and no tree-walking in the
   * template.
   */
  category: categoryPath.length ? categoryPath[categoryPath.length - 1] : null,
  categoryPath,
  highlights: Array.isArray(row.highlights)
    ? row.highlights.map((line) => String(line).trim()).filter(Boolean)
    : [],
  /**
   * The price, **only where the tenant is publishing it**.
   *
   * A shop that switched `showPrice` off wants the figure recorded and quotable
   * on the phone, not sitting on a public page for a competitor to read.
   * Withheld here rather than hidden by the template, so a theme that forgets to
   * check cannot leak it — the rule every other gated thing in this payload
   * follows: absence, not a flag.
   */
  priceLabel: row.showPrice === false ? null : row.priceLabel ?? null,

  /**
   * The numbers, withheld on exactly the same condition as the words.
   *
   * A shop that switched `showPrice` off wants its figures recorded and
   * quotable, not sitting on a public page - and that has to cover the price
   * column as well as the label, or the switch would hide the prose and publish
   * the number. Absence, not a flag: a theme that forgets to check cannot leak
   * it.
   */
  price: row.showPrice === false || row.price === null || row.price === undefined ? null : Number(row.price),
  offerPrice:
    row.showPrice === false || row.offerPrice === null || row.offerPrice === undefined
      ? null
      : Number(row.offerPrice),
  /* Whether it is on offer is not a price and is not hidden with them: a salon
     running a promotion still wants the badge on a card whose figure it does not
     publish. Decided by the one function the catalogue uses. */
  onOffer: isOnOffer(row),
  discountPercent: row.showPrice === false ? null : discountPercent(row),

  /** How long it takes. Null where the business genuinely cannot say. */
  durationMinutes: row.durationMinutes ?? null,
  /**
   * Whether a visitor may pick a time for this one.
   *
   * Both halves have to be true: the company takes bookings **and** this service
   * is one that can be booked. A salon takes appointments for a haircut and
   * enquiries about a wedding party, and the second must not offer a 30-minute
   * slot.
   */
  bookable: Boolean(row.bookable) && bookingLive,
  /**
   * This service's own button label, or null to use the section's. Resolved by
   * the website rather than filled in here so a company that changes the
   * section's label still changes every card that never overrode it.
   */
  ctaLabel: row.ctaLabel ?? null,
  featured: Boolean(row.featured),
});

/**
 * The Services section for one host, or `null` when there is nothing to show.
 *
 * Empty means absent, the rule Team, Gallery and the benefit cards all follow,
 * and it decides the Services *page* as well as the band on the home page: a
 * route that exists but lists nothing is worse than a route that 404s. The nav
 * entry is dropped on the same signal — see `publicNav`, which reads the same
 * `activeKeys` — so nothing on the site links to a page that is not there.
 *
 * There is deliberately no fallback wording for the items themselves. The
 * platform holds a company's name, trade and address; it holds nothing about
 * what that company actually sells, and a service nobody offers is worse on a
 * website than no list at all. See `SERVICE_DEFAULTS`.
 */
/**
 * @param {string[]} activeKeys  What this tenant is entitled to **today**. The
 *   enquiry button and the diary are grants of their own now, sold on top of
 *   Services, so the section cannot decide either for itself.
 */
async function publicServices(companyId, branchId, settings, whatsappNumber = null, activeKeys = []) {
  const [rows, categoryRows] = await Promise.all([
    branchScoped(db.CompanyService, companyId, branchId, { status: STATUS.ACTIVE }),
    branchScoped(db.CompanyServiceCategory, companyId, branchId, { status: STATUS.ACTIVE }),
  ]);
  if (!rows.length) return null;

  const target = serviceEnquiryTarget(settings, whatsappNumber);

  /**
   * Booking needs somewhere for the booking to **go**.
   *
   * A company that points its button at WhatsApp alone records nothing, so a
   * confirmed appointment would exist only in a chat thread - there would be no
   * row to accept, no status to show the customer, and no diary to keep the next
   * person out of the slot. So the diary is live only where the enquiry is
   * recorded, and a tenant that switches to WhatsApp-only loses the times and
   * keeps the button.
   */
  /**
   * Whether a visitor may take a time, and whether they may ask a question.
   *
   * Both are **grants** rather than settings: a platform sells a price list, a
   * price list with an inbox, or a price list with a diary, and a tenant gets
   * what it paid for. The tenant's own switch is the functionality's status, so
   * `activeKeys` already means granted, switched on and still served.
   *
   * The diary additionally needs somewhere for a booking to **land**. On a
   * WhatsApp-only site nothing is recorded, so there would be no row to accept,
   * no status to show the customer and no diary to keep the next person out of
   * the slot.
   */
  const enquiryLive = activeKeys.includes(FUNCTIONALITY.SERVICE_ENQUIRY);
  const bookingLive =
    activeKeys.includes(FUNCTIONALITY.SERVICE_BOOKING) &&
    Boolean(target) &&
    target !== SERVICE_ENQUIRY_TARGET.WHATSAPP;

  /* The path to each category, resolved once for the whole section. */
  const byId = new Map(categoryRows.map((row) => [row.id, row]));
  const pathOf = (categoryId) => {
    const path = [];
    let current = byId.get(categoryId);
    const seen = new Set();

    /* `seen` is not tidiness: the write path refuses to make a cycle, but this
       runs over whatever is in the table, and a loop here would hang the page. */
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift({ id: current.id, slug: current.slug, name: current.name });
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return path;
  };

  const items = rows.map((row) => publicService(row, { categoryPath: pathOf(row.categoryId), bookingLive }));

  /**
   * How many published services sit at or below each category.
   *
   * The same rule the catalogue applies: a heading that leads to nothing is
   * worse than no heading, so a category with nothing under it is dropped from
   * the tree entirely rather than shown as an empty shelf.
   */
  const totals = new Map();
  const countUp = (categoryId) => {
    let current = byId.get(categoryId);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      totals.set(current.id, (totals.get(current.id) ?? 0) + 1);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
  };
  rows.forEach((row) => row.categoryId && countUp(row.categoryId));

  const nodeOf = (row, seen) => {
    if (seen.has(row.id)) return null;
    const branch = new Set(seen).add(row.id);

    const children = categoryRows
      .filter((child) => child.parentId === row.id)
      .map((child) => nodeOf(child, branch))
      .filter(Boolean);

    const count = totals.get(row.id) ?? 0;
    if (!count) return null;

    return publicCategory(row, { serviceCount: count, children });
  };

  const categories = categoryRows
    .filter((row) => !row.parentId || !byId.has(row.parentId))
    .map((row) => nodeOf(row, new Set()))
    .filter(Boolean);

  /**
   * The offered services - the band a salon wants read first.
   *
   * Featured first, and otherwise in the order the tenant arranged, so this is a
   * stable partition of `items` rather than a second sort.
   */
  const offers = [...items.filter((item) => item.onOffer)].sort(
    (a, b) => Number(b.featured) - Number(a.featured)
  );
  const featured = items.filter((item) => item.featured);

  return {
    eyebrow: settings.eyebrow,
    title: settings.title,
    lead: settings.lead,
    /** The button on each card, unless the card carries one of its own. */
    ctaLabel: settings.ctaLabel,
    /**
     * What the button does. `null` when it cannot do anything — the tenant
     * pointed it at WhatsApp and published no number — and the website then
     * renders no button at all rather than a dialog that goes nowhere.
     *
     * `whatsapp` carries the digits rather than a finished `wa.me` link,
     * because the message is composed from what the visitor types and cannot
     * exist until they have typed it. It is the one place the website builds a
     * WhatsApp URL itself; everywhere else the API sends a finished one.
     */
    /**
     * The enquiry button, withheld entirely when the tenant has switched it off.
     *
     * Absence, not a flag - the same rule every gated thing in this payload
     * follows, so a theme that forgets to check cannot paint a button the shop
     * does not want. With the diary off as well, a card has no action at all and
     * the section is a price list, which is a legitimate thing for a business to
     * publish.
     */
    enquiry: enquiryLive && target
      ? {
        target,
        /** True when a submission is recorded on the platform. */
        records: target !== SERVICE_ENQUIRY_TARGET.WHATSAPP,
        /** True when the visitor is handed the message to send. */
        opensWhatsapp: target !== SERVICE_ENQUIRY_TARGET.ADMIN,
        title: settings.formTitle,
        note: settings.formNote,
        whatsapp: whatsappNumber
          ? { number: whatsappNumber.number, countryCode: whatsappNumber.countryCode }
          : null,
      }
      : null,

    /* The categories band and the filter on the services page. */
    categoriesEyebrow: settings.categoriesEyebrow,
    categoriesTitle: settings.categoriesTitle,
    categoriesLead: settings.categoriesLead,

    /* The offers band - the services a company is promoting this month. */
    offersEyebrow: settings.offersEyebrow,
    offersTitle: settings.offersTitle,
    offersLead: settings.offersLead,

    /**
     * The diary, or null when this tenant is not taking appointments today.
     *
     * Absent rather than a flag, like everything else in this payload: the
     * template paints a booking panel when there is one and asks no questions
     * about why there is not.
     */
    booking: bookingLive
      ? {
        label: settings.bookLabel,
        note: settings.booking.note,
        /** The grid, so the page can say what it is offering. */
        slotMinutes: settings.booking.slotMinutes,
        /**
         * How many bookings one slot holds company-wide.
         *
         * Sent so a page can say "up to 3 per slot" without asking for a day
         * first. A service that overrides it reports its own number on its own
         * diary, which is where it actually matters.
         */
        slotCapacity: settings.booking.slotCapacity,
        leadHours: settings.booking.leadHours,
        horizonDays: settings.booking.horizonDays,
        /** Which weekdays are open, 0-6 with Sunday at 0. Matches `getDay()`. */
        days: settings.booking.days,
        openTime: settings.booking.openTime,
        closeTime: settings.booking.closeTime,
        /**
         * Whether somebody has to sign in before they can take a slot.
         *
         * True exactly when the tenant runs customer accounts, and it is the
         * API's answer rather than the template's: an appointment is a promise
         * with a name on it, and a shop that has a customer list should be able
         * to find the person who booked. Filled in by `publicFeatures`, which is
         * the only place that knows about the other functionality.
         */
        requiresSignIn: false,
      }
      : null,

    items,
    categories,
    offers,

    /**
     * What the home page's three bands show before their *View all* links take
     * over. Sliced here rather than in the template, so every theme shows the
     * same tenant the same number of the same things.
     */
    home: {
      services: (featured.length ? featured : items).slice(0, SERVICE_HOME_LIMITS.services),
      offers: offers.slice(0, SERVICE_HOME_LIMITS.offers),
      categories: categories.slice(0, SERVICE_HOME_LIMITS.categories),
    },

    /** Totals for the *View all* links, which say what they lead to. */
    counts: {
      services: items.length,
      categories: categories.length,
      offers: offers.length,
    },
  };
}

/* ------------------------------ the catalogue ----------------------------- */

/**
 * Is this product on offer?
 *
 * **The one place that decides it**, which is the whole point of it being a
 * function. The offers band on the home page, the `/offers` page, the badge on
 * every card and the console's Offers tab all ask this, so a product cannot be
 * on the offers page without a badge, or badged on a page it is missing from.
 *
 * Two ways to be true, and the second is not a shortcut:
 *
 *  - a reduced price — `offerPrice` below `price`, which is the ordinary case
 *  - `onOffer` ticked by hand, which is the *only* way for a tenant pricing in
 *    free text ("From ₹4,999") to run an offer at all, and the only way to
 *    express one that is not a reduction ("free fitting this month")
 */
const isOnOffer = (row) => {
  if (row.onOffer) return true;
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  const offer = row.offerPrice === null || row.offerPrice === undefined ? null : Number(row.offerPrice);
  return price !== null && offer !== null && offer < price;
};

/**
 * What a visitor is saving, as a whole percentage — or `null` when the platform
 * cannot honestly say.
 *
 * Rounded rather than truncated, and only produced from two real numbers. A
 * product on offer by the `onOffer` flag alone has no pair to compare, so this
 * is null and the card shows the tenant's own `offerLabel` instead. That is the
 * bargain the free-text price makes: the catalogue still works, the arithmetic
 * does not.
 */
const discountPercent = (row) => {
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  const offer = row.offerPrice === null || row.offerPrice === undefined ? null : Number(row.offerPrice);
  if (price === null || offer === null || price <= 0 || offer >= price) return null;
  return Math.round(((price - offer) / price) * 100);
};

/**
 * One product, as the website reads it.
 *
 * `images` is normalised hard, the way `highlights` is on a service and for the
 * same reason: it arrives as free-form JSON, so it is coerced to an array of
 * non-empty strings here rather than handed to a gallery that would have to
 * guard every `.map` on it. `image` is the first of them, named separately
 * because every card in the catalogue wants exactly that and should not have to
 * reach into an array to get it.
 *
 * The prices are returned as **numbers**, not the strings a DECIMAL column hands
 * back. A template doing `product.price - product.offerPrice` on two strings
 * gets a concatenation on one side of the language and NaN on the other, and
 * neither shows up until a real price is on a real page.
 */
const publicProduct = (row, categoryPath = [], availability = null) => {
  const images = Array.isArray(row.images)
    ? row.images.map((path) => String(path).trim()).filter(Boolean)
    : [];

  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  const offerPrice = row.offerPrice === null || row.offerPrice === undefined ? null : Number(row.offerPrice);

  /* The column, unless the warehouse is answering for this one. See below. */
  const stored = PRODUCT_STOCK_VALUES.includes(row.stockStatus) ? row.stockStatus : PRODUCT_STOCK.IN_STOCK;
  const resolvedStock = availability
    ? stockService.availabilityOf(
      { id: row.id, trackInventory: row.trackInventory, stockStatus: stored },
      availability
    )
    : stored;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku || null,
    summary: row.summary ?? null,
    description: row.description ?? null,

    images,
    /** The card image — the first photograph, or null for a product with none. */
    image: images[0] ?? null,

    highlights: Array.isArray(row.highlights)
      ? row.highlights.map((line) => String(line).trim()).filter(Boolean)
      : [],
    specs: Array.isArray(row.specs)
      ? row.specs
        .filter((spec) => spec && typeof spec === 'object')
        .map((spec) => ({ label: String(spec.label ?? '').trim(), value: String(spec.value ?? '').trim() }))
        .filter((spec) => spec.label && spec.value)
      : [],

    price,
    offerPrice,
    /** Set means "print this instead of the numbers". See the model. */
    priceLabel: row.priceLabel || null,
    /** What the visitor actually pays today. Null on a free-text price. */
    effectivePrice: offerPrice ?? price,

    onOffer: isOnOffer(row),
    discountPercent: discountPercent(row),
    /** The tenant's own badge wording, overriding the computed percentage. */
    offerLabel: row.offerLabel || null,

    /**
     * What the visitor is told about availability.
     *
     * Still one of the three `PRODUCT_STOCK` words rather than a number — the
     * platform’s long-standing position, and not an oversight: the website tells
     * somebody whether to ring up, and a count it cannot keep true is worse there
     * than no count.
     *
     * What the warehouse feature changes is where the word comes from. Without
     * it, `stockStatus` is a flag somebody remembered to set. With it, on a
     * product marked `trackInventory`, the answer is resolved from the shelf by
     * `availabilityOf` — so the site says *out of stock* the moment the last one
     * leaves the building, with nobody having to remember anything.
     *
     * `availability` is null on every tenant that has not bought it, and on
     * every product that is not tracked, which is why the fallback is the
     * column and not an error.
     */
    stockStatus: resolvedStock,
    inStock: resolvedStock !== PRODUCT_STOCK.OUT_OF_STOCK,

    /**
     * Whether this one may go in a basket — the tenant's own flag AND the
     * stock answering for it. Resolved into one boolean here rather than left
     * as two for the template to remember to check together, which is how a
     * site ends up taking money for something it has already said it has not
     * got. Means nothing at all when `features.orders` is absent; see
     * `publicOrders`, which is what decides whether there is a cart.
     */
    orderable: row.orderable !== false && resolvedStock !== PRODUCT_STOCK.OUT_OF_STOCK,

    /** This product's own button label, or null to use the section's. */
    ctaLabel: row.ctaLabel ?? null,
    featured: Boolean(row.featured),

    /**
     * The category this is filed in, and everything above it — `[Furniture,
     * Tables, Dining tables]`. Sent as the finished path rather than an id, so
     * the detail page can print a breadcrumb without a second request and
     * without the template learning how to walk a tree.
     */
    category: categoryPath.length ? categoryPath[categoryPath.length - 1] : null,
    categoryPath,
  };
};

/** One category, as the website reads it. */
const publicCategory = (row, extra = {}) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description ?? null,
  image: row.image ?? null,
  icon: FEATURE_ICON_KEYS.includes(row.icon) ? row.icon : FEATURE_ICON_FALLBACK,
  featured: Boolean(row.featured),
  ...extra,
});

/**
 * The whole catalogue for one host, or `null` when there is nothing to show.
 *
 * Empty means absent — the rule Team, Gallery, the benefit cards and Services
 * all follow — and here it is decided by **products**, not categories. A tenant
 * with a category tree and nothing filed in it has built a set of empty shelves,
 * and a Products page listing three headings and no products is worse than no
 * Products page. The nav entry drops on the same signal, so nothing on the site
 * links at it.
 *
 * What comes back is everything the four pages need, in one payload:
 *
 *  - `items` — every published product, so `/products` and every category
 *    filter on it are answered without another request
 *  - `categories` — the tree, each node carrying the number of products at or
 *    below it, so a heading never claims a section that turns out to be empty
 *  - `offers` — the subset on offer today, already ordered
 *  - `home` — the counts the home page's three bands actually render, so the
 *    template does not have to know where to slice
 *
 * One payload rather than four endpoints because `/theme/company-details` is
 * already one request that returns the whole site, and a catalogue this size —
 * one small business's range — costs less to send whole than four round trips
 * cost to make.
 */
async function publicCatalogue(companyId, branchId, settings, availability = null) {
  const [productRows, categoryRows] = await Promise.all([
    branchScoped(db.CompanyProduct, companyId, branchId, { status: STATUS.ACTIVE }),
    branchScoped(db.CompanyCategory, companyId, branchId, { status: STATUS.ACTIVE }),
  ]);

  if (!productRows.length) return null;

  /**
   * The ancestry of every category, resolved once.
   *
   * A product carries the *deepest* category it belongs to, so a visitor
   * browsing "Furniture" has to find things filed under "Dining tables" without
   * anyone filing them twice. Walking the parents once here and handing each
   * product its finished path is what makes that possible on the template side
   * without a tree walk per card.
   */
  const byId = new Map(categoryRows.map((row) => [row.id, row]));

  const pathOf = (categoryId) => {
    const path = [];
    const seen = new Set();
    let current = byId.get(categoryId);

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift({ id: current.id, slug: current.slug, name: current.name });
      current = current.parentId ? byId.get(current.parentId) : null;
    }

    return path;
  };

  const items = productRows.map((row) => publicProduct(row, pathOf(row.categoryId), availability));

  /**
   * How many products sit at or below each category, counted from the paths
   * above rather than from a query. Every product's whole ancestry is already in
   * hand, so incrementing each ancestor is the same answer a recursive count
   * would give and costs nothing.
   */
  const totals = new Map();
  items.forEach((product) => {
    product.categoryPath.forEach((node) => {
      totals.set(node.id, (totals.get(node.id) ?? 0) + 1);
    });
  });

  /**
   * The tree, with the empty branches pruned.
   *
   * A category nothing is filed under is a heading that leads to an empty page,
   * and the *View all categories* page is exactly where a visitor would meet a
   * row of them. So a node survives only if something is under it — which, given
   * `totals` counts descendants too, keeps a parent whose own products are all
   * in its children.
   */
  /**
   * `seen` is not defensive tidiness. The write path refuses to create a cycle,
   * but this is the read path, and it runs over whatever is in the table —
   * including rows written before that check existed. A cycle here would recurse
   * until the stack gave out, taking down the request for every other section on
   * the page with it.
   */
  const nodeOf = (row, seen) => {
    if (seen.has(row.id)) return null;
    const branch = new Set(seen).add(row.id);

    const children = categoryRows
      .filter((child) => child.parentId === row.id)
      .map((child) => nodeOf(child, branch))
      .filter(Boolean);

    const count = totals.get(row.id) ?? 0;
    if (!count) return null;

    return publicCategory(row, { productCount: count, children });
  };

  const categories = categoryRows
    .filter((row) => !row.parentId || !byId.has(row.parentId))
    .map((row) => nodeOf(row, new Set()))
    .filter(Boolean);

  /**
   * Offers, featured first. `sequence` already ordered `items`, so this is a
   * stable partition of that order rather than a re-sort — a tenant that
   * arranged its catalogue has arranged its offers page too.
   */
  const offers = [...items.filter((product) => product.onOffer)].sort(
    (a, b) => Number(b.featured) - Number(a.featured)
  );

  const featured = items.filter((product) => product.featured);

  return {
    /* The catalogue band and the /products page. */
    eyebrow: settings.eyebrow,
    title: settings.title,
    lead: settings.lead,
    ctaLabel: settings.ctaLabel,

    /* The categories band and the /categories page. */
    categoriesEyebrow: settings.categoriesEyebrow,
    categoriesTitle: settings.categoriesTitle,
    categoriesLead: settings.categoriesLead,

    /* The offers band and the /offers page. */
    offersEyebrow: settings.offersEyebrow,
    offersTitle: settings.offersTitle,
    offersLead: settings.offersLead,

    items,
    categories,
    offers,

    /**
     * What the home page's three bands show before their *View all* links take
     * over. Sliced here rather than in the template so the counts are the
     * platform's — a template that decided for itself would have every theme
     * showing a different number of the same tenant's products.
     *
     * The product band prefers the featured ones and falls back to the top of
     * the catalogue, so a tenant that has featured nothing still gets a band
     * rather than a heading over nothing.
     */
    home: {
      categories: categories.slice(0, CATALOGUE_HOME_LIMITS.categories),
      products: (featured.length ? featured : items).slice(0, CATALOGUE_HOME_LIMITS.products),
      offers: offers.slice(0, CATALOGUE_HOME_LIMITS.offers),
    },

    /** Totals for the *View all* links, which say what they lead to. */
    counts: {
      products: items.length,
      categories: categories.length,
      offers: offers.length,
    },
  };
}

/* ---------------------------------- blog ---------------------------------- */

/**
 * Roughly how long an article takes to read.
 *
 * Computed on the way out rather than stored, so editing a post cannot leave a
 * stale number under its title - and so the estimate can be changed for every
 * article on the platform by changing one constant. Never less than a minute:
 * "0 min read" is not information.
 */
const readMinutes = (body) => {
  const words = String(body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / BLOG_READ_WPM));
};

/**
 * The opening of an article, for a card whose post has no standfirst.
 *
 * Cut at a word rather than mid-syllable, and only when there is more to come -
 * so a two-sentence post is shown whole instead of being given an ellipsis it
 * does not need.
 */
const excerptFrom = (body, limit = 180) => {
  const flat = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat || null;
  return flat.slice(0, flat.lastIndexOf(' ', limit) > 0 ? flat.lastIndexOf(' ', limit) : limit) + '\u2026';
};

/**
 * Matching one tag inside the JSON column, on both dialects, in one place.
 *
 * `tags` is a JSON attribute, so a plain `{ tags: { [Op.like]: '%x%' } }` is
 * **serialised as JSON before it reaches SQL** - the pattern arrives quoted,
 * `'"%x%"'`, and matches nothing. Wrapping the column in `LOWER()` takes the
 * comparison out of the attribute's type mapping, and buys case-insensitive
 * matching at the same time, which is what a reader following `Kitchens` from a
 * card expects of a tag somebody typed as `kitchens`.
 *
 * It matches the serialised array rather than parsing it, so it can over-match a
 * tag that is a substring of another. The cost of that is one extra card in a
 * filtered list; the alternative is a JSON function per dialect, and two queries
 * that can disagree. Wildcards are stripped so a tag containing `%` cannot turn
 * the filter into "everything".
 */
const tagWhere = (tag) => {
  const needle = String(tag ?? '').trim().toLowerCase().replace(/[%_\\]/g, '');
  if (!needle) return null;
  return sqlWhere(fn('LOWER', col('CompanyBlogPost.tags')), { [Op.like]: `%${needle}%` });
};

const publicTags = (tags) =>
  Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, BLOG_TAGS_MAX)
    : [];

/**
 * One post as a **card**: everything a listing needs and nothing more.
 *
 * The body is deliberately absent. A listing prints a title, a picture and a
 * line or two, and shipping the whole of twenty articles to render that would
 * make the archive page cost more than the articles themselves. The page for one
 * post asks for it by slug and gets it; see `publicBlogPost`.
 */
const publicPostCard = (row) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  /* The tenant's standfirst, or the opening of the article - a card with a hole
     in it being the one outcome worth spending a fallback on. */
  excerpt: row.excerpt?.trim() || excerptFrom(row.body),
  coverImage: row.coverImage ?? null,
  author: row.author?.trim() || null,
  tags: publicTags(row.tags),
  publishedAt: row.publishedAt,
  readMinutes: readMinutes(row.body),
  featured: Boolean(row.featured),
});

/** One post **whole**, for its own page. The card, plus the article itself. */
const publicBlogPost = (row) => ({
  ...publicPostCard(row),
  body: row.body,
});

/**
 * What a tenant is publishing right now.
 *
 * Two conditions, and the second is what makes scheduling work: the row is
 * active, **and** its date has passed. A post dated next Monday is saved,
 * complete, and invisible everywhere - the band, the archive, its own URL and
 * the count behind the menu entry all ask this same question.
 */
const publishedWhere = (extra = {}) => ({
  status: STATUS.ACTIVE,
  publishedAt: { [Op.ne]: null, [Op.lte]: new Date() },
  ...extra,
});

/** Featured first, then newest. The archive's order, and the band's. */
const BLOG_ORDER = [['featured', 'DESC'], ['published_at', 'DESC'], ['id', 'DESC']];

/**
 * The rows one host should see, branch-aware - the same fallback `branchScoped`
 * applies, written out here because a blog is ordered by date rather than by
 * `sequence` and cannot use it.
 */
async function blogScoped(companyId, branchId, { limit = null, offset = 0, where = {} } = {}) {
  const base = { companyId, ...publishedWhere(where) };
  const query = { order: BLOG_ORDER, ...(limit ? { limit, offset } : {}) };

  if (branchId) {
    const own = await db.CompanyBlogPost.findAndCountAll({ where: { ...base, branchId }, ...query });
    if (own.count) return own;
  }

  return db.CompanyBlogPost.findAndCountAll({ where: { ...base, branchId: null }, ...query });
}

/**
 * The Blog section for one host, or `null` when there is nothing to show.
 *
 * Empty means absent - the rule Services, Team and the benefit cards all follow
 * - and it decides the archive page and the menu entry as well as the band on
 * the home page.
 *
 * **`items` is the latest few, not everything.** This block rides in the payload
 * of every page of the site, and a blog is the one thing here that grows without
 * limit: a tenant writing weekly has two hundred articles in four years, and
 * sending all of them with every render would make the home page pay for the
 * archive forever. So the band gets what the band shows, `total` says how much
 * more there is, and the archive asks for the rest a page at a time from
 * `GET /theme/blog`.
 */
async function publicBlog(companyId, branchId, settings) {
  const { rows, count } = await blogScoped(companyId, branchId, { limit: BLOG_HOME_LIMIT });
  if (!count) return null;

  return {
    eyebrow: settings.eyebrow,
    title: settings.title,
    lead: settings.lead,
    ctaLabel: settings.ctaLabel,
    /* Whether the site prints a byline. A company-wide choice, not a per-post
       one, so a tenant writing as itself clears them all at once. */
    showAuthor: settings.showAuthor,
    /** Everything published, not just what is in `items`. The archive's count. */
    total: count,
    items: rows.map(publicPostCard),
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
async function publicNav(companyId, branchId, activeKeys, features = {}) {
  const needsSettings = NAV_PAGES.some((page) => page.settings);

  /**
   * A page is in the menu when the plan pays for it **and**, where the page
   * says so, when there is something on it. The second half is `content`, and
   * it is answered from the very payload the website will render — not from a
   * second count of the same rows, which is how the two would come to disagree.
   *
   * Services is the page that needs it: entitled, switched on and empty is an
   * ordinary state for a tenant on its first afternoon, and a Services link
   * leading to a page with nothing on it is worse than no link.
   */
  const published = (page) => !page.content || Boolean(features[page.content]);

  /**
   * Only the pages actually in this tenant's menu are asked about. A company
   * without the Services grant has no Services entry to name, and reading its
   * settings row to find that out would be a query for a label nobody will see.
   */
  const wanted = new Set(
    NAV_PAGES.filter(
      (page) => page.settings && (!page.functionality || activeKeys.includes(page.functionality)) && published(page)
    ).map((page) => page.settings)
  );

  const [aboutRow, contactRow, servicesRow, productsRow, blogRow] = needsSettings
    ? await Promise.all([
        wanted.has('about') ? resolveAboutRow(companyId, branchId) : null,
        wanted.has('contact')
          ? branchId
            ? db.CompanyContact.findOne({ where: { companyId, branchId } }).then(
                (own) => own ?? db.CompanyContact.findOne({ where: { companyId, branchId: null } })
              )
            : db.CompanyContact.findOne({ where: { companyId, branchId: null } })
          : null,
        /**
         * Services keeps its label on the switch row's settings blob rather
         * than in a settings table, because it has no settings table — see
         * `NAV_LABEL_SOURCE`. Company-wide, therefore, where About's and
         * Contact's are branch-aware: a branch can offer a different list of
         * services, but calling the page something else on one host and not
         * another is a difference nobody asked for.
         */
        wanted.has('services')
          ? db.CompanyFunctionality.findOne({ where: { companyId, key: FUNCTIONALITY.SERVICES } })
          : null,
        /** Products keeps its label the same way and for the same reason. */
        wanted.has('products')
          ? db.CompanyFunctionality.findOne({ where: { companyId, key: FUNCTIONALITY.PRODUCTS } })
          : null,
        /** And the blog, which has no settings table either. */
        wanted.has('blog')
          ? db.CompanyFunctionality.findOne({ where: { companyId, key: FUNCTIONALITY.BLOG } })
          : null,
      ])
    : [null, null, null, null, null];

  const labels = {
    about: aboutRow?.navLabel,
    contact: contactRow?.navLabel,
    services: NAV_LABEL_SOURCE.services === 'functionality' ? servicesRow?.settings?.navLabel : null,
    products: NAV_LABEL_SOURCE.products === 'functionality' ? productsRow?.settings?.navLabel : null,
    blog: NAV_LABEL_SOURCE.blog === 'functionality' ? blogRow?.settings?.navLabel : null,
  };

  return NAV_PAGES.filter(
    (page) => (!page.functionality || activeKeys.includes(page.functionality)) && published(page)
  ).map(
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
    services: null,
    products: null,
    orders: null,
    customers: null,
    blog: null,
    social: null,
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

  /**
   * The footer's social icons.
   *
   * Omitted entirely rather than sent empty when there is nothing to show: the
   * templates render the row on presence, so `null` is what keeps a footer from
   * carrying an empty strip of nothing. A company that has the feature but has
   * added no links yet is exactly that case.
   *
   * `platform` reaches the site as-is and the template maps it to a glyph, so a
   * platform the template has never heard of falls back to its generic link
   * icon rather than rendering blank.
   */
  if (activeKeys.includes(FUNCTIONALITY.SOCIAL_MEDIA)) {
    const rows = await db.CompanySocialLink.findAll({
      where: { companyId, status: STATUS.ACTIVE },
      order: [['sequence', 'ASC'], ['id', 'ASC']],
    });

    if (rows.length) {
      features.social = {
        links: rows.map((row) => ({
          id: row.id,
          platform: row.platform,
          url: row.url,
          /** The accessible name. Falls back to the platform's own name. */
          label: row.label || SOCIAL_PLATFORM_CATALOGUE.find((p) => p.key === row.platform)?.name || row.platform,
        })),
      };
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

  if (activeKeys.includes(FUNCTIONALITY.SERVICES)) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.SERVICES },
    });
    /**
     * The enquiry number, taken from the block resolved above rather than
     * queried again — which also means it is `null` whenever the WhatsApp
     * feature itself is not live, and the enquiry form degrades accordingly.
     * An enquiry is an inquiry, so it uses that type and inherits its fallback
     * to `contact`.
     */
    features.services = await publicServices(
      companyId,
      branchId,
      serviceSettings(row?.settings),
      features.whatsapp?.byType?.inquiry ?? null,
      activeKeys
    );

    /**
     * Whether a slot needs a name attached to it.
     *
     * Decided here rather than inside `publicServices`, because it depends on a
     * **different functionality**: a tenant running customer accounts takes
     * bookings from account holders, exactly as it takes orders from them. The
     * same rule, stated once, in the payload the website renders and enforced
     * again by the write route.
     */
    if (features.services?.booking) {
      features.services.booking.requiresSignIn = activeKeys.includes(FUNCTIONALITY.CUSTOMERS);
    }
  }

  /**
   * The catalogue. Absent — rather than empty — when the tenant has published no
   * products, which is what drops the Products page and its nav entry with it.
   */
  if (activeKeys.includes(FUNCTIONALITY.PRODUCTS)) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.PRODUCTS },
    });

    /**
     * The shelf, read **once** for the whole catalogue rather than per product.
     *
     * Only where the tenant has actually bought the warehouse feature — on every
     * other tenant this is null and every product falls back to the flag on its
     * own row, which is exactly what it did before any of this existed.
     *
     * One query for every level this company holds: a small business’s
     * catalogue times its units is a few thousand rows at the outside, and the
     * alternative is a query per card on a page that renders twenty of them.
     */
    const availability = activeKeys.includes(FUNCTIONALITY.WAREHOUSE)
      ? await stockService.availabilityFor(companyId)
      : null;

    features.products = await publicCatalogue(
      companyId,
      branchId,
      productSettings(row?.settings),
      availability
    );
  }

  /**
   * The cart, resolved last because it depends on two blocks above it.
   *
   * **`features.products` first.** The `orders` grant sits on top of the
   * catalogue rather than beside it: a cart with nothing to put in it is a
   * button leading to an empty basket, and that is as true of a tenant who has
   * not published a product yet as of one whose plan never carried Products at
   * all. One condition covers both, the way `publicCatalogue` covering "no
   * products" already drops the Products page and its menu entry.
   *
   * **Then the WhatsApp block**, passed rather than queried, so an order route
   * pointed at a number the tenant has stopped publishing — or at a WhatsApp
   * feature their plan no longer grants — withholds the cart instead of
   * printing a button that composes a message for nobody.
   */
  if (activeKeys.includes(FUNCTIONALITY.ORDERS) && features.products) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.ORDERS },
    });
    features.orders = publicOrders(orderSettings(row?.settings), features.whatsapp);
  }

  /**
   * Whether this site has a sign-in.
   *
   * A flag and nothing else — deliberately the thinnest block in this payload.
   * The website needs to know whether to paint an Account link and whether to
   * offer a saved address at checkout; it does not need, and must never be sent,
   * anything about who the customers are. A public endpoint that leaked a count
   * would be telling every visitor how many people shop here.
   */
  if (activeKeys.includes(FUNCTIONALITY.CUSTOMERS)) {
    features.customers = { enabled: true };
  }

  /**
   * The blog. Absent - rather than empty - when the tenant has published
   * nothing, which is what drops the archive page and its nav entry with it.
   *
   * A post dated in the future counts as nothing, exactly as it should: writing
   * next week's article today must not put a Blog link in the menu leading to a
   * page that says there is nothing here.
   */
  if (activeKeys.includes(FUNCTIONALITY.BLOG)) {
    const row = await db.CompanyFunctionality.findOne({
      where: { companyId, key: FUNCTIONALITY.BLOG },
    });
    features.blog = await publicBlog(companyId, branchId, blogSettings(row?.settings));
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
  serviceSettings,
  serviceEnquiryTarget,
  publicServices,
  publicService,
  productSettings,
  publicCatalogue,
  orderSettings,
  publicOrders,
  blogSettings,
  publicBlog,
  publicBlogPost,
  publicPostCard,
  blogScoped,
  publishedWhere,
  tagWhere,
  readMinutes,
  isOnOffer,
  discountPercent,
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
