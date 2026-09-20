'use strict';

const { Joi, id, idParam, listQuery, status } = require('./common');
const ApiError = require('../utils/ApiError');
const {
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  WHATSAPP_TYPE_VALUES,
  SOCIAL_PLATFORM_VALUES,
  SHARE_CHANNEL_VALUES,
  STAT_MODE,
  STAT_MODE_VALUES,
  STAT_UNIT_VALUES,
  CONTACT_FORM_TARGET_VALUES,
  TESTIMONIAL_MODE_VALUES,
  TESTIMONIAL_REVIEW_TARGET,
  TESTIMONIAL_REVIEW_TARGET_VALUES,
  TESTIMONIAL_MODERATION_VALUES,
  TESTIMONIAL_SOURCE_VALUES,
  TESTIMONIAL_RATING_MAX,
  FEATURE_ICON_KEYS,
  SERVICE_HIGHLIGHTS_MAX,
  SERVICE_HIGHLIGHT_LENGTH,
  SERVICE_ENQUIRY_TARGET_VALUES,
  SERVICE_CTA_MAX,
  PRODUCT_PRICE_MAX,
  ORDER_PAYMENT_STATUS_VALUES,
  ANALYTICS_RANGES,
  ORDER_MODE_VALUES,
  ORDER_LABEL_MAX,
  ORDER_NOTE_MAX,
  LEAD_STAGE_VALUES,
  NAV_LABEL_MAX,
  SERVICE_DURATION_MAX,
  SERVICE_SLOT_CAPACITY_MAX,
  BOOKING_STATUS_VALUES,
  BOOKING_SLOT_MINUTES,
  BOOKING_LEAD_HOURS_MAX,
  BOOKING_HORIZON_MAX,
  SLUG_MAX,
  CATEGORY_DEPTH_MAX,
} = require('../constants');

/** `:key` in the functionality routes — one of the catalogue's keys. */
const keyParam = Joi.object({
  key: Joi.string()
    .valid(...FUNCTIONALITY_VALUES)
    .required(),
});

const toggle = {
  params: keyParam,
  // Absent means "flip it", which is what the switch in the console sends.
  body: Joi.object({ status }),
};

/**
 * Settings are validated per functionality rather than as one loose object, so
 * a client cannot park arbitrary JSON on a tenant's row.
 */
const SETTINGS_SCHEMA = {
  [FUNCTIONALITY.SHARE_LINK]: Joi.object({
    headline: Joi.string().allow('', null).max(120),
    // `{company}` is filled in by the website; the rest is the tenant's copy.
    message: Joi.string().allow('', null).max(300),
    // An empty array is allowed and meaningful: share, but offer no channels
    // beyond the phone's own share sheet.
    channels: Joi.array()
      .items(Joi.string().valid(...SHARE_CHANNEL_VALUES))
      .unique()
      .max(SHARE_CHANNEL_VALUES.length),
  }),
  // About's copy is branch-aware, so it lives in `company_about` and is saved
  // through `PUT /my-company/about`, not here.
  [FUNCTIONALITY.ABOUT_US]: Joi.object({}),
  // WhatsApp keeps its configuration in its own table, so its switch row has
  // nothing to store. Written out rather than omitted so an unexpected body is
  // refused instead of silently saved.
  [FUNCTIONALITY.WHATSAPP]: Joi.object({}),

  /**
   * Team and Gallery store the words above their cards, and nothing else — the
   * people and the pictures are rows in their own tables.
   *
   * Every field is optional and may be blank: clearing one is how a tenant goes
   * back to the platform's wording, which `sectionCopy` fills in on the way out.
   */
  [FUNCTIONALITY.TEAM]: Joi.object({
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
  }),
  [FUNCTIONALITY.GALLERY]: Joi.object({
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
  }),
  /**
   * Figures keeps the words above the band and nothing else. The numbers are
   * branch-aware rows in `company_stats` — a list the tenant adds to, reorders
   * and pins to branches — and none of that belongs in a settings blob.
   */
  [FUNCTIONALITY.FIGURES]: Joi.object({
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
  }),
  /**
   * Testimonials is the one card list whose switch row does carry settings: the
   * static/dynamic mode belongs to the feature as a whole, not to any one
   * review, and it is what decides whether the public website carries a form.
   *
   * The mode is `.valid()`-constrained here as well as normalised in the
   * service. Both are deliberate — this refuses a bad write, the service
   * survives a bad read — because the value decides whether the public internet
   * can write rows into a tenant's database.
   */
  [FUNCTIONALITY.TESTIMONIALS]: Joi.object({
    mode: Joi.string().valid(...TESTIMONIAL_MODE_VALUES),
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
    /**
     * Where the review button goes — our own form, or somewhere else
     * entirely. See `TESTIMONIAL_REVIEW_TARGET`.
     */
    reviewTarget: Joi.string().valid(...TESTIMONIAL_REVIEW_TARGET_VALUES),
    /**
     * The destination, when there is one, and the only field on the platform a
     * tenant supplies that ends up in an `href` on its own public website.
     *
     * `http`/`https` only, and never relative. Joi's default scheme list is
     * "anything that parses", which includes `javascript:` — a scheme that in
     * an `href` is script execution on the tenant's own domain rather than a
     * link. A relative URL is refused for a quieter reason: it would resolve
     * against whichever site rendered it, so the same setting would point
     * somewhere different on every host a tenant owns.
     *
     * Required when the button is set to `link`, because the alternative is a
     * button on a live website that goes nowhere. The check reads the sibling
     * value rather than the stored one, which is safe here: settings are
     * replaced whole by `updateSettings`, so `reviewTarget` is always in the
     * same body when it matters.
     */
    reviewUrl: Joi.string()
      .uri({ scheme: ['http', 'https'], allowRelative: false })
      .max(500)
      .allow('', null)
      .when('reviewTarget', {
        is: TESTIMONIAL_REVIEW_TARGET.LINK,
        then: Joi.string().required().disallow('', null).messages({
          'any.required': 'reviewUrl is required when the review button opens a link',
          'any.invalid': 'reviewUrl is required when the review button opens a link',
        }),
      }),
    formTitle: Joi.string().allow('', null).max(120),
    formNote: Joi.string().allow('', null).max(300),
    showRating: Joi.boolean(),
  }),
  /**
   * Features / Benefits keeps the section's own wording here — the heading,
   * the lede and the label on the button under it. The cards themselves are
   * rows, not settings; see `featureCreate` below.
   *
   * Every field is optional and may be cleared. An empty one is not a blank
   * heading on the website: the service fills it from `FEATURE_DEFAULTS`, so
   * clearing a field is how a tenant asks for the platform's wording back.
   */
  [FUNCTIONALITY.FEATURES]: Joi.object({
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
    ctaLabel: Joi.string().allow('', null).max(60),
  }),
  /**
   * Services keeps the section's wording here, plus the name its page carries
   * in the website's menu.
   *
   * `navLabel` is the only settings field on the platform that ends up in the
   * nav bar. It is capped to the column's own width — a menu is a row of short
   * words, and a forty-character entry is what wraps the bar onto two lines on
   * a laptop. Blank asks for the platform's name back, like every other copy
   * field here.
   */
  [FUNCTIONALITY.SERVICES]: Joi.object({
    navLabel: Joi.string().trim().allow('', null).max(NAV_LABEL_MAX),
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
    ctaLabel: Joi.string().allow('', null).max(60),
    /**
     * Where a submitted enquiry goes — WhatsApp, the console, or both.
     *
     * `.valid()`-constrained here as well as normalised in the service, and
     * both are deliberate: this refuses a bad write, the service survives a bad
     * read. The value decides whether the public internet can write rows into
     * this tenant's database, which is the same reason the testimonial mode is
     * checked twice.
     */
    enquiryTarget: Joi.string().valid(...SERVICE_ENQUIRY_TARGET_VALUES),
    formTitle: Joi.string().allow('', null).max(120),
    formNote: Joi.string().allow('', null).max(300),

    /* The categories band and the offers band, each with its own wording - the
       same three-blocks arrangement the catalogue has. */
    categoriesEyebrow: Joi.string().allow('', null).max(80),
    categoriesTitle: Joi.string().allow('', null).max(160),
    categoriesLead: Joi.string().allow('', null).max(400),
    offersEyebrow: Joi.string().allow('', null).max(80),
    offersTitle: Joi.string().allow('', null).max(160),
    offersLead: Joi.string().allow('', null).max(400),
    bookLabel: Joi.string().allow('', null).max(60),

    /**
     * The diary.
     *
     * Every field here decides what a stranger is **promised** - a slot somebody
     * picks at 7pm on a Sunday is one a person has to turn up for - so this is
     * the most tightly checked settings block on the platform. `slotMinutes` is
     * constrained to a list rather than a range because the grid has to divide a
     * working day sensibly, and 37 minutes does not.
     *
     * It is still only *shape*. Whether the diary can actually run - whether
     * enquiries are recorded at all - is decided on the way out by
     * `publicServices`, which withholds the whole block rather than painting a
     * booking form whose bookings would go nowhere.
     */
    booking: Joi.object({
      /** 0-6, Sunday at 0 - the same numbering `Date.getDay()` uses. */
      days: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7),
      openTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).message('openTime must be HH:mm'),
      closeTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).message('closeTime must be HH:mm'),
      slotMinutes: Joi.number().valid(...BOOKING_SLOT_MINUTES),
      /* How many bookings one slot holds, for the whole company. A service may
         set its own; see `serviceFields.slotCapacity`. */
      slotCapacity: Joi.number().integer().min(1).max(SERVICE_SLOT_CAPACITY_MAX),
      leadHours: Joi.number().integer().min(0).max(BOOKING_LEAD_HOURS_MAX),
      horizonDays: Joi.number().integer().min(1).max(BOOKING_HORIZON_MAX),
      note: Joi.string().allow('', null).max(300),
    }),
  }),
  /**
   * The catalogue keeps three blocks of copy here rather than one, because it
   * puts three different bands on a site and they make three different
   * arguments — see `PRODUCT_DEFAULTS`. Plus the name the Products page carries
   * in the menu, on the same terms Services' does.
   *
   * The categories and the products themselves are branch-aware rows in their
   * own tables; nothing about them belongs in a settings blob.
   */
  [FUNCTIONALITY.PRODUCTS]: Joi.object({
    navLabel: Joi.string().trim().allow('', null).max(NAV_LABEL_MAX),
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
    categoriesEyebrow: Joi.string().allow('', null).max(80),
    categoriesTitle: Joi.string().allow('', null).max(160),
    categoriesLead: Joi.string().allow('', null).max(400),
    offersEyebrow: Joi.string().allow('', null).max(80),
    offersTitle: Joi.string().allow('', null).max(160),
    offersLead: Joi.string().allow('', null).max(400),
    ctaLabel: Joi.string().allow('', null).max(60),
  }),
  /**
   * The cart's wording and its terms.
   *
   * `mode` is the one field here that is not cosmetic, and it is
   * `.valid()`-constrained as well as normalised in the service for the reason
   * the service enquiry target is: this refuses a bad write, the service
   * survives a bad read. It decides whether a stranger is shown a button that
   * takes money.
   *
   * The payment fields are checked for shape rather than for existence. A
   * tenant filling the screen in over two sittings must be able to save a UPI
   * id before it has typed the note that goes beside it — whether the mode can
   * actually run is decided on the way *out*, by `publicOrders`, which
   * withholds the whole block rather than publishing a Pay button that leads
   * nowhere.
   */
  [FUNCTIONALITY.ORDERS]: Joi.object({
    mode: Joi.string().valid(...ORDER_MODE_VALUES),
    cart: Joi.boolean(),

    addToCartLabel: Joi.string().trim().allow('', null).max(ORDER_LABEL_MAX),
    buyNowLabel: Joi.string().trim().allow('', null).max(ORDER_LABEL_MAX),
    submitLabel: Joi.string().trim().allow('', null).max(ORDER_LABEL_MAX),
    cartTitle: Joi.string().trim().allow('', null).max(120),
    cartNote: Joi.string().trim().allow('', null).max(ORDER_NOTE_MAX),

    /* Which published number an order reaches. Falls back to `contact` on the
       way out like every other typed number. */
    whatsappType: Joi.string().valid(...WHATSAPP_TYPE_VALUES),
    messageIntro: Joi.string().trim().allow('', null).max(300),

    requireName: Joi.boolean(),
    requirePhone: Joi.boolean(),
    requireAddress: Joi.boolean(),

    /* Null clears the minimum. Capped at the same ceiling a price is, so a
       typo cannot set a floor no basket can reach. */
    minOrderAmount: Joi.number().min(0).max(PRODUCT_PRICE_MAX).allow(null),

    /**
     * `name@bank`. Checked against UPI's own shape rather than left free text:
     * a malformed id produces a `upi://pay` link the payer's app rejects with
     * an error the tenant never sees, having tested nothing.
     */
    upiId: Joi.string()
      .trim()
      .lowercase()
      .allow('', null)
      .max(80)
      .pattern(/^[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{1,}$/i)
      .message('upiId must look like name@bank'),
    payeeName: Joi.string().trim().allow('', null).max(80),
    /* https only. A payment page reached over http is one a browser warns
       about at the exact moment a stranger is deciding whether to trust it. */
    paymentUrl: Joi.string().trim().allow('', null).max(500).uri({ scheme: ['https'] }),
    paymentLabel: Joi.string().trim().allow('', null).max(ORDER_LABEL_MAX),
    paymentNote: Joi.string().trim().allow('', null).max(ORDER_NOTE_MAX),
  }),
  /**
   * The blog keeps the section's wording here, plus the name its archive carries
   * in the menu - the same shape Services and the catalogue use.
   *
   * `showAuthor` is the only field here that is not copy. It is a company-wide
   * choice rather than a per-post one on purpose: a business writing as itself
   * turns bylines off once, instead of remembering to clear the author box on
   * every article it ever writes.
   *
   * The posts themselves are branch-aware rows in their own table; nothing about
   * them belongs in a settings blob.
   */
  [FUNCTIONALITY.BLOG]: Joi.object({
    navLabel: Joi.string().trim().allow('', null).max(NAV_LABEL_MAX),
    eyebrow: Joi.string().allow('', null).max(80),
    title: Joi.string().allow('', null).max(160),
    lead: Joi.string().allow('', null).max(400),
    ctaLabel: Joi.string().allow('', null).max(60),
    showAuthor: Joi.boolean(),
  }),
};

/**
 * Only `:key` is checked by the middleware. Which body schema applies depends
 * on that param, and `validate` runs each source against its own schema in
 * isolation — a `Joi.ref` across the two has nothing to resolve against — so
 * the body is checked by `validateSettings` once the controller knows the key.
 */
const settings = { params: keyParam };

/**
 * Validates a settings body against the schema for its functionality and
 * returns the coerced value, throwing the same `Validation failed` shape the
 * middleware does so the client cannot tell where the check happened.
 */
function validateSettings(key, body) {
  const schema = SETTINGS_SCHEMA[key];
  if (!schema) throw ApiError.notFound('Unknown functionality');

  const { error, value } = schema.validate(body ?? {}, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    throw ApiError.badRequest(
      'Validation failed',
      error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
        in: 'body',
      }))
    );
  }

  return value;
}

/* ------------------------------------------------------------------ *
 * WhatsApp numbers
 * ------------------------------------------------------------------ */

const whatsappFields = {
  type: Joi.string().valid(...WHATSAPP_TYPE_VALUES),
  // Stored without the `+`; a client that sends one is not punished for it.
  countryCode: Joi.string()
    .pattern(/^\+?\d{1,5}$/)
    .message('countryCode must be 1-5 digits, e.g. 91'),
  number: Joi.string()
    .pattern(/^[\d\s()+-]{6,20}$/)
    .message('number must be a valid phone number'),
  label: Joi.string().allow('', null).max(80),
  defaultMessage: Joi.string().allow('', null).max(300),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const whatsappCreate = {
  body: Joi.object({
    ...whatsappFields,
    type: whatsappFields.type.required(),
    number: whatsappFields.number.required(),
    countryCode: whatsappFields.countryCode.default('91'),
  }),
};

/**
 * No `.default()` here, matching every other update schema: Joi injects
 * defaults for absent keys, which on a partial update would silently reset
 * columns the client never sent.
 */
const whatsappUpdate = {
  params: idParam,
  body: Joi.object(whatsappFields).min(1),
};

const whatsappReorder = {
  body: Joi.object({
    ids: Joi.array().items(Joi.number().integer().positive().required()).min(1).max(100).required(),
  }),
};

/* ------------------------------------------------------------------ *
 * Social links
 * ------------------------------------------------------------------ */

/**
 * A profile URL.
 *
 * `http(s)` only, and that is the whole security story for a field whose value
 * becomes an `href` in every visitor's footer. Without the scheme allow-list a
 * company admin could store `javascript:...` and the website would render it as
 * a link — the templates escape the value, but a `javascript:` URL is dangerous
 * precisely because escaping it changes nothing.
 *
 * The scheme is required rather than assumed: `instagram.com/acme` with no
 * scheme is a *relative* link once it reaches an `href`, and it would quietly
 * point at a page on the tenant's own site.
 */
const socialUrl = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(500)
  .messages({
    'string.uriCustomScheme': 'url must start with http:// or https://',
  });

const socialFields = {
  platform: Joi.string().valid(...SOCIAL_PLATFORM_VALUES),
  url: socialUrl,
  label: Joi.string().trim().allow('', null).max(80),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const socialCreate = {
  body: Joi.object({
    ...socialFields,
    platform: socialFields.platform.required(),
    url: socialUrl.required(),
  }),
};

/** Partial — see the note at the top of `master.validator` on why. */
const socialUpdate = {
  params: idParam,
  body: Joi.object(socialFields).min(1),
};

const socialReorder = {
  body: Joi.object({
    ids: Joi.array().items(Joi.number().integer().positive().required()).min(1).max(100).required(),
  }),
};

const socialListQuery = {
  query: listQuery({ platform: Joi.string().valid(...SOCIAL_PLATFORM_VALUES) }),
};

/* ------------------------------------------------------------------ *
 * About stat cards
 * ------------------------------------------------------------------ */

/** `null` is a real value: it is how a card is moved back to company-wide. */
const branchId = Joi.alternatives().try(id, Joi.valid(null));

const statFields = {
  branchId,
  label: Joi.string().min(1).max(120),
  mode: Joi.string().valid(...STAT_MODE_VALUES),
  value: Joi.string().allow('', null).max(40),
  sinceDate: Joi.date().iso().allow(null),
  unit: Joi.string().valid(...STAT_UNIT_VALUES),
  prefix: Joi.string().allow('', null).max(8),
  suffix: Joi.string().allow('', null).max(8),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

/**
 * Each mode needs a different field, and neither is required by the column, so
 * the pairing is enforced here rather than left to produce an empty card:
 * `fixed` without a value renders nothing, and `since_date` without a date has
 * nothing to count from.
 */
const requireModeField = (schema) =>
  schema
    .when(Joi.object({ mode: Joi.valid(STAT_MODE.FIXED) }).unknown(), {
      then: Joi.object({ value: Joi.string().min(1).max(40).required() }),
    })
    .when(Joi.object({ mode: Joi.valid(STAT_MODE.SINCE_DATE) }).unknown(), {
      then: Joi.object({ sinceDate: Joi.date().iso().required() }),
    });

const statCreate = {
  body: requireModeField(
    Joi.object({
      ...statFields,
      label: statFields.label.required(),
      mode: statFields.mode.default(STAT_MODE.FIXED),
    })
  ),
};

const statUpdate = { params: idParam, body: Joi.object(statFields).min(1) };

/* ------------------------------------------------------------------ *
 * Team members
 * ------------------------------------------------------------------ */

const teamFields = {
  branchId,
  name: Joi.string().min(1).max(150),
  role: Joi.string().allow('', null).max(120),
  bio: Joi.string().allow('', null).max(600),
  photo: Joi.string().allow('', null).max(255),
  email: Joi.string().allow('', null).max(160),
  phone: Joi.string().allow('', null).max(20),
  linkedinUrl: Joi.string().allow('', null).max(255),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const teamCreate = { body: Joi.object({ ...teamFields, name: teamFields.name.required() }) };
const teamUpdate = { params: idParam, body: Joi.object(teamFields).min(1) };

/* ------------------------------------------------------------------ *
 * Gallery
 * ------------------------------------------------------------------ */

const galleryFields = {
  branchId,
  image: Joi.string().min(1).max(255),
  title: Joi.string().allow('', null).max(150),
  caption: Joi.string().allow('', null).max(400),
  altText: Joi.string().allow('', null).max(200),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const galleryCreate = { body: Joi.object({ ...galleryFields, image: galleryFields.image.required() }) };
const galleryUpdate = { params: idParam, body: Joi.object(galleryFields).min(1) };

/* ------------------------------------------------------------------ *
 * Testimonials
 * ------------------------------------------------------------------ */

/**
 * What the console may write on a review.
 *
 * `source` is absent on purpose and cannot be set through any route: it records
 * where a row actually came from, and a console that could stamp a review
 * `visitor` would be able to pass the company's own copy off as a customer's.
 * The controller sets it, once, at creation.
 */
const testimonialFields = {
  branchId,
  authorName: Joi.string().min(1).max(150),
  authorRole: Joi.string().allow('', null).max(150),
  photo: Joi.string().allow('', null).max(255),
  authorEmail: Joi.string().allow('', null).max(160),
  authorPhone: Joi.string().allow('', null).max(20),
  rating: Joi.number().integer().min(1).max(TESTIMONIAL_RATING_MAX).allow(null),
  body: Joi.string().min(1).max(2000),
  /** The console may publish or park a review directly; see `moderate`. */
  moderation: Joi.string().valid(...TESTIMONIAL_MODERATION_VALUES),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const testimonialCreate = {
  body: Joi.object({
    ...testimonialFields,
    authorName: testimonialFields.authorName.required(),
    body: testimonialFields.body.required(),
  }),
};

const testimonialUpdate = { params: idParam, body: Joi.object(testimonialFields).min(1) };

/** PATCH /testimonials/:id/moderation — approve or reject one review. */
const testimonialModerate = {
  params: idParam,
  body: Joi.object({
    moderation: Joi.string()
      .valid(...TESTIMONIAL_MODERATION_VALUES)
      .required(),
  }),
};

/**
 * The console's list filters. `moderation` is what the pending queue is: the
 * screen asks for `?moderation=pending` and gets exactly the reviews waiting on
 * someone, rather than filtering a full list in the browser.
 */
const testimonialListQuery = {
  query: listQuery({
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    moderation: Joi.string().valid(...TESTIMONIAL_MODERATION_VALUES),
    source: Joi.string().valid(...TESTIMONIAL_SOURCE_VALUES),
  }),
};

/* ------------------------------------------------------------------ *
 * The public submission
 * ------------------------------------------------------------------ */

/**
 * `POST /public/testimonials` — the form on the tenant's own website.
 *
 * Tighter than the console's schema and deliberately so: this is the one body
 * on the platform that arrives from an unauthenticated stranger. Every field
 * that decides whether a row is published — `moderation`, `status`, `source`,
 * `sequence`, `companyId` — is absent, so no request can reach for one. What is
 * left is what a person writing a review actually types.
 *
 * `domain` is how the endpoint knows which tenant is being reviewed on a local
 * dev server, matching `?domain=` on `/public/company-details`. In production
 * the Host header answers it and the field is never sent.
 */
const testimonialSubmit = {
  body: Joi.object({
    domain: Joi.string().allow('', null).max(255),
    authorName: Joi.string().trim().min(2).max(150).required(),
    /**
     * No `authorRole` here, deliberately.
     *
     * The form on the website does not ask for one, so this body stays exactly
     * what a person writing a review types. `validate` runs with
     * `stripUnknown`, so a hand-rolled request that sends one is not refused —
     * the key is simply dropped before the controller sees it, and the row is
     * written with `authorRole` null.
     *
     * Reviews the company enters itself still carry a role: that is
     * `testimonialFields`, above, and the admin screen still offers the field.
     */
    authorEmail: Joi.string().trim().email().allow('', null).max(160),
    authorPhone: Joi.string().trim().allow('', null).max(20),
    rating: Joi.number().integer().min(1).max(TESTIMONIAL_RATING_MAX).allow(null),
    /**
     * A floor as well as a ceiling. "Good" is not a review, and a wall of
     * one-word entries is what an open form degrades into without one.
     */
    body: Joi.string().trim().min(20).max(2000).required(),
  }),
};

/* ------------------------------------------------------------------ *
 * Features / Benefits
 * ------------------------------------------------------------------ */

/**
 * What a benefit card may carry.
 *
 * `icon` is constrained to the platform's library rather than left as free
 * text. The website draws these from a closed set of its own — a name it does
 * not know falls back to `spark` — so an unchecked field would let a tenant
 * save `icon: 'flame'`, see a spark on their site, and have no way of knowing
 * why. Refusing it here is what makes the picker in the console the whole truth
 * about what is available.
 */
const featureFields = {
  branchId,
  icon: Joi.string().valid(...FEATURE_ICON_KEYS),
  title: Joi.string().trim().min(1).max(150),
  /** Optional — a good heading can stand on its own. */
  body: Joi.string().trim().allow('', null).max(600),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const featureCreate = {
  body: Joi.object({
    ...featureFields,
    title: featureFields.title.required(),
  }),
};

const featureUpdate = { params: idParam, body: Joi.object(featureFields).min(1) };

/* ------------------------------------------------------------------ *
 * Services
 * ------------------------------------------------------------------ */

/**
 * What one service may carry.
 *
 * `icon` is constrained to the same closed library the benefit cards use, and
 * for the same reason: the website draws these itself, so an unchecked name
 * would let a tenant save something that silently renders as a spark.
 *
 * `highlights` is the one array a tenant sends. It is capped in both directions
 * — how many, and how long each — because it is printed as a tick list beside
 * the card's picture, and neither twenty lines nor a paragraph masquerading as
 * a line survives that layout. Empty strings are stripped rather than refused:
 * a person filling in six boxes and using four should not get a validation
 * error for the two they left alone.
 */
const serviceFields = {
  branchId,
  icon: Joi.string().valid(...FEATURE_ICON_KEYS),
  /** An upload path from `POST /uploads/service`. Optional — the icon covers it. */
  image: Joi.string().trim().allow('', null).max(255),
  title: Joi.string().trim().min(1).max(150),
  summary: Joi.string().trim().allow('', null).max(600),
  highlights: Joi.array()
    .items(Joi.string().trim().max(SERVICE_HIGHLIGHT_LENGTH).allow(''))
    .max(SERVICE_HIGHLIGHTS_MAX)
    .allow(null)
    .custom((value) => (value ?? []).map((line) => line.trim()).filter(Boolean)),
  /**
   * Whether the website prints the price at all.
   *
   * Separate from clearing `priceLabel`, which would hide the figure and lose
   * it: this keeps it on the record for quoting and for the revenue report while
   * leaving it off the public page.
   */
  showPrice: Joi.boolean(),
  priceLabel: Joi.string().trim().allow('', null).max(60),
  /**
   * This service's own button label. Optional, and blank means "use the
   * section's" — which is why it is stored as null rather than filled in.
   */
  ctaLabel: Joi.string().trim().allow('', null).max(SERVICE_CTA_MAX),
  featured: Joi.boolean(),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
  /**
   * Where it is filed. `null` is a real value - it unfiles the service, which is
   * what a salon does when it stops grouping its treatments.
   */
  categoryId: Joi.alternatives().try(id, Joi.valid(null)),
  /** Its own page's address. Generated from the title when it is left out. */
  slug: Joi.string().trim().allow('', null).max(SLUG_MAX),
  /** The long copy for that page. Plain text; the website prints paragraphs. */
  description: Joi.string().trim().allow('', null).max(20000),

  /**
   * The numbers, beside the free-text label rather than instead of it.
   *
   * Both are optional and either may be cleared. The relationship between them -
   * an offer has to be **below** the price - cannot be checked here on a PATCH
   * that sends only one of the two, so it is enforced in the controller against
   * the stored row, exactly as the catalogue does it.
   */
  price: Joi.number().min(0).max(PRODUCT_PRICE_MAX).allow(null),
  offerPrice: Joi.number().min(0).max(PRODUCT_PRICE_MAX).allow(null),
  onOffer: Joi.boolean(),

  /** How long it takes. Null where the business genuinely cannot say. */
  durationMinutes: Joi.number().integer().min(5).max(SERVICE_DURATION_MAX).allow(null),
  /** Whether a visitor may take a time for this one, rather than only ask. */
  bookable: Joi.boolean(),
  /**
   * How many can hold the same slot for **this** service.
   *
   * `null` hands the question back to the company's own limit, which is the
   * ordinary case: the shop has three chairs and says so once. A number here is
   * for the service whose constraint is the work rather than the business - one
   * colourist, one van - and it wins even when it is smaller.
   */
  slotCapacity: Joi.number().integer().min(1).max(SERVICE_SLOT_CAPACITY_MAX).allow(null),
};

const serviceCreate = {
  body: Joi.object({
    ...serviceFields,
    title: serviceFields.title.required(),
  }),
};

const serviceUpdate = { params: idParam, body: Joi.object(serviceFields).min(1) };

/* ------------------------------------------------------------------ *
 * Service enquiries
 * ------------------------------------------------------------------ */

/**
 * What a visitor may send when they ask about a service.
 *
 * A name and a number, and nothing else. There is no `companyId` to send — the
 * tenant comes from the host, the same rule every route in the website module
 * follows — and no `serviceId` that is trusted: the controller checks the
 * service belongs to this tenant and is actually published before it writes
 * anything.
 *
 * `domain` is how the endpoint knows which tenant is being enquired at on a
 * local dev server, matching `?domain=` on `/theme/company-details`. In
 * production the Host header answers it and the field is never sent.
 */
const serviceLeadSubmit = {
  body: Joi.object({
    domain: Joi.string().allow('', null).max(255),
    serviceId: id.required(),
    /**
     * The name and the number are **not** required here, and the exception is
     * the whole reason: a signed-in customer is not asked who they are. Their
     * details come from their account inside the handler - which is also what
     * stops a signed-in visitor booking under somebody else's name by putting it
     * in the body.
     *
     * A stranger still has to give both, and the handler says so plainly when
     * they have not. Requiring them here would force the website to invent
     * values for a booking that never needed them.
     */
    name: Joi.string().trim().min(2).max(150),
    /**
     * Digits, spaces and the punctuation people actually type — `+`, `-`,
     * brackets. Kept as a pattern rather than a strict phone format because
     * this is every country's numbering plan at once, and a form that refuses
     * a real number is worse than a row that needs reading by a person.
     */
    phone: Joi.string()
      .trim()
      .pattern(/^[0-9+()\-\s]{6,20}$/)
      .messages({ 'string.pattern.base': 'Enter a valid phone number' }),
    /** The page it was sent from. Optional, and never trusted for anything. */
    sourceUrl: Joi.string().trim().allow('', null).max(500),

    /**
     * The slot, when the visitor is booking rather than asking.
     *
     * Both or neither: a date with no time is not an appointment, and a time
     * with no date is not one either. Sending them turns this request into a
     * booking, which is checked far more heavily in the controller - the company
     * has to be taking appointments, the service has to be bookable, the slot has
     * to still be free, and on a shop running customer accounts the visitor has
     * to be signed in.
     *
     * The date is a plain `YYYY-MM-DD` and the time a plain `HH:mm`, both in the
     * **company's** working day. Neither is a timestamp: turning them into one
     * would make every existing appointment move by an hour the day the country
     * changed its clocks.
     */
    bookingDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('bookingDate must be YYYY-MM-DD'),
    bookingTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).message('bookingTime must be HH:mm'),
  })
    /* Both or neither, said with `and` rather than with a pair of `when`s -
       two fields that each require the other is a circular dependency Joi
       refuses to build, and the error arrives at boot rather than in a test. */
    .and('bookingDate', 'bookingTime'),
};

/** The tenant's own enquiry list: filters, paging and search. */
const serviceLeadList = {
  query: listQuery({
    stage: Joi.string().valid(...LEAD_STAGE_VALUES),
    serviceId: id,
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    /** Who is waiting to hear about a time, and what is confirmed. */
    bookingStatus: Joi.string().valid(...BOOKING_STATUS_VALUES),
    /** True for every row that asked for a slot; false for the ones that did not. */
    bookings: Joi.boolean(),
    bookingDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('bookingDate must be YYYY-MM-DD'),
  }),
};

/**
 * What the company may change on an enquiry: where it has got to, and what
 * they want to remember about it.
 *
 * Nothing the visitor wrote is editable. A name and a number are what somebody
 * typed, and a screen that let them be rewritten would quietly turn a record of
 * what happened into a note about what someone thinks happened.
 */
const serviceLeadUpdate = {
  params: idParam,
  body: Joi.object({
    stage: Joi.string().valid(...LEAD_STAGE_VALUES),
    note: Joi.string().trim().allow('', null).max(2000),

    /**
     * What the job came to, typed by the shop once somebody has quoted it.
     *
     * Null clears it back to "not quoted yet" — a real state, and not the same
     * as a quote of zero. Capped at the column's own ceiling so a slipped finger
     * cannot overflow it.
     */
    amount: Joi.number().min(0).max(PRODUCT_PRICE_MAX).allow(null, ''),

    /* The same three words an order's payment uses. `paidAt` is stamped by the
       controller rather than accepted here: it is the moment somebody said so. */
    paymentStatus: Joi.string().valid(...ORDER_PAYMENT_STATUS_VALUES),
    paymentReference: Joi.string().trim().allow('', null).max(120),
  }).min(1),
};

/** The service revenue report. One of the windows the platform offers. */
/**
 * Confirming an appointment, or refusing it.
 *
 * Its own schema rather than a field on `serviceLeadUpdate`, because it is a
 * different act: that route moves an enquiry through the company's own pipeline,
 * and this one changes a fact the customer is waiting on. `response` is the line
 * they read beside it - the difference between "declined" and "declined, we are
 * closed that Thursday".
 */
const bookingDecision = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid(...BOOKING_STATUS_VALUES).required(),
    response: Joi.string().trim().allow('', null).max(300),
  }),
};

/** The diary: one day of appointments, in time order. */
const diaryQuery = {
  query: Joi.object({ date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('date must be YYYY-MM-DD') }),
};

/**
 * A service category. The tree rules a schema cannot express - a parent from
 * another company, a cycle, a tree pushed past its depth - are checked in the
 * controller, which has to read the rest of the tenant's tree to know.
 */
const serviceCategoryFields = {
  branchId: Joi.alternatives().try(id, Joi.valid(null)),
  parentId: Joi.alternatives().try(id, Joi.valid(null)),
  name: Joi.string().trim().min(1).max(150),
  slug: Joi.string().trim().allow('', null).max(SLUG_MAX),
  description: Joi.string().trim().allow('', null).max(600),
  image: Joi.string().trim().allow('', null).max(255),
  icon: Joi.string().valid(...FEATURE_ICON_KEYS),
  featured: Joi.boolean(),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const serviceCategoryCreate = {
  body: Joi.object({ ...serviceCategoryFields, name: serviceCategoryFields.name.required() }),
};

const serviceCategoryUpdate = { params: idParam, body: Joi.object(serviceCategoryFields).min(1) };

const serviceCategoryListQuery = {
  query: Joi.object({
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    parentId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    status,
    tree: Joi.boolean(),
  }),
};

const serviceRevenueQuery = {
  query: Joi.object({
    days: Joi.number()
      .integer()
      .valid(...ANALYTICS_RANGES),
  }),
};

/** Every card list reorders the same way: the whole order, in one call. */
const reorder = {
  body: Joi.object({
    ids: Joi.array().items(Joi.number().integer().positive().required()).min(1).max(200).required(),
  }),
};

/**
 * One functionality's settings schema, by key.
 *
 * Exported for the OpenAPI build, which documents each of them as its own
 * component — see `docs/openapi`. Reading the same object `validateSettings`
 * runs is the whole point: the documented shape is the enforced shape.
 */
const settingsSchema = (key) => SETTINGS_SCHEMA[key] ?? null;

module.exports = {
  bookingDecision,
  diaryQuery,
  serviceCategoryCreate,
  serviceCategoryUpdate,
  serviceCategoryListQuery,
  keyParam: { params: keyParam },
  settingsSchema,
  toggle,
  settings,
  validateSettings,
  whatsappCreate,
  whatsappUpdate,
  whatsappReorder,
  whatsappListQuery: {
    query: listQuery({ type: Joi.string().valid(...WHATSAPP_TYPE_VALUES) }),
  },
  socialCreate,
  socialUpdate,
  socialReorder,
  socialListQuery,
  statCreate,
  statUpdate,
  teamCreate,
  teamUpdate,
  galleryCreate,
  galleryUpdate,
  testimonialCreate,
  testimonialUpdate,
  testimonialModerate,
  testimonialListQuery,
  testimonialSubmit,
  featureCreate,
  featureUpdate,
  serviceCreate,
  serviceUpdate,
  serviceLeadSubmit,
  serviceLeadList,
  serviceLeadUpdate,
  serviceRevenueQuery,
  reorder,
  cardListQuery: {
    // `none` asks for the company-wide cards, which have no branch id at all.
    query: listQuery({ branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')) }),
  },
  aboutQuery: {
    query: Joi.object({ branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')) }),
  },
  contactQuery: {
    query: Joi.object({ branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')) }),
  },
  contactSave: {
    query: Joi.object({ branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')) }),
    body: Joi.object({
      /** What the page is called in the website menu; blank uses the default. */
      navLabel: Joi.string().allow('', null).max(NAV_LABEL_MAX),
      eyebrow: Joi.string().allow('', null).max(80),
      /** `{company}` is filled in by the website. */
      title: Joi.string().allow('', null).max(160),
      lead: Joi.string().allow('', null).max(400),
      showForm: Joi.boolean(),
      formTarget: Joi.string().valid(...CONTACT_FORM_TARGET_VALUES),
      formNote: Joi.string().allow('', null).max(300),
      showLocations: Joi.boolean(),
    }),
  },
  aboutSave: {
    query: Joi.object({ branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')) }),
    body: Joi.object({
      /** What the page is called in the website menu; blank uses the default. */
      navLabel: Joi.string().allow('', null).max(NAV_LABEL_MAX),
      eyebrow: Joi.string().allow('', null).max(80),
      // `{company}` is filled in by the website, so a tenant that never edits
      // the heading still gets its own name in it.
      title: Joi.string().allow('', null).max(160),
      lead: Joi.string().allow('', null).max(400),
      // Blank lines separate paragraphs; the website splits on them.
      body: Joi.string().allow('', null).max(4000),
    }),
  },
};
