'use strict';

const { Joi, id, idParam, listQuery, email, phone } = require('./common');
const { LEAD_STAGE_VALUES, DEVICE_TYPE_VALUES, LEAD_TRACKING_LIMITS } = require('../constants');

/**
 * Two very different jobs in one file.
 *
 * The console's reads and its one write are validated the way everything else
 * in this codebase is — a closed schema, unknown keys stripped.
 *
 * `track` is not. It is the only schema here that faces the open internet from
 * a browser, and it deliberately accepts shapes it does not enumerate: the
 * whole point of "etc, all possible" is that a template starts reporting
 * something new without the API having to be taught about it first. So the
 * blobs are `unknown(true)` and the real defence is `lead.service`, which
 * coerces, truncates and caps every value on the way to the database. What is
 * enforced here is only what would be *expensive* to let through — the size of
 * the strings and the depth of nothing — not the vocabulary.
 */

/** Anything the browser wants to say, capped by count and by length. */
const openObject = Joi.object()
  .unknown(true)
  .max(LEAD_TRACKING_LIMITS.extraKeys * 2);

const track = {
  body: Joi.object({
    /**
     * Which tenant. Only honoured in development, where the website runs on
     * localhost and has no tenant hostname of its own — exactly as
     * `/public/company-details` already treats `?domain=`.
     */
    domain: Joi.string().allow('', null).max(255),

    /**
     * The visitor's browser-held id. Optional: a client that sends none gets a
     * synthetic one derived from IP and user agent, so a crawler or a private
     * window still collapses into a single row rather than one per page load.
     */
    deviceId: Joi.string().allow('', null).max(64),
    sessionId: Joi.string().allow('', null).max(64),

    /** The push token, where the visitor granted notifications. */
    fcmToken: Joi.string().allow('', null).max(512),

    /**
     * Whether this beacon is a page being looked at. Absent means yes, which is
     * what every ordinary page load sends.
     *
     * The website sends `false` on the one call that is not a page view: the
     * follow-up that carries coordinates after a visitor granted the location
     * permission. See `recordVisit`, which is where it decides anything.
     */
    pageView: Joi.boolean(),

    /* The page. */
    url: Joi.string().allow('', null).max(500),
    path: Joi.string().allow('', null).max(500),
    title: Joi.string().allow('', null).max(255),
    host: Joi.string().allow('', null).max(255),
    referrer: Joi.string().allow('', null).max(500),

    /**
     * Campaign parameters, as an object of `utm_*` keys — or `query`, the whole
     * query string parsed. Either is accepted; the service keeps the `utm_*`
     * keys and the recognised click ids out of whichever arrived, and reads the
     * URL as well so a launch that sent neither still attributes.
     */
    utm: openObject,
    query: openObject,

    /* Screen, hardware, and whatever else `navigator` reported. */
    device: openObject,
    /** `navigator.userAgentData`, which is the truth Chromium hides from the UA string. */
    clientHints: openObject,
    /* Timezone, and coordinates only where the permission was already granted. */
    location: openObject,
    /** Anything this template records that the schema has no column for. */
    extra: openObject,

    language: Joi.string().allow('', null).max(40),
    languages: Joi.array().items(Joi.string().max(40)).max(10),
    timezone: Joi.string().allow('', null).max(64),

    /**
     * Who they are, if the page already knows — a visitor who filled in a form
     * earlier in the session. Only ever *fills in* a blank field on the lead:
     * a public request can never rename a lead someone has identified.
     */
    name: Joi.string().allow('', null).max(150),
    email: Joi.string().allow('', null).max(160),
    phone: Joi.string().allow('', null).max(20),
  })
    /**
     * Unknown top-level keys are stripped rather than refused. A newer version
     * of the tracker deployed against an older API must degrade to storing
     * less, not to a 400 that loses the visit entirely.
     */
    .unknown(false),
};

/* ------------------------------------------------------------------ *
 * The console
 * ------------------------------------------------------------------ */

/** `none` asks for leads that arrived on the company-wide host. */
const branchFilter = Joi.alternatives().try(id, Joi.string().valid('none', 'null'));

/** Filters every lead list shares, tenant-side and platform-side alike. */
const leadFilters = {
  branchId: branchFilter,
  stage: Joi.string().valid(...LEAD_STAGE_VALUES),
  deviceType: Joi.string().valid(...DEVICE_TYPE_VALUES),
  utmSource: Joi.string().max(160),
  utmMedium: Joi.string().max(160),
  utmCampaign: Joi.string().max(160),
  country: Joi.string().max(80),
  city: Joi.string().max(80),
  /**
   * Whether crawlers are included. Default `false` — a lead list is a list of
   * people — but they are stored, so the filter can show them.
   */
  includeBots: Joi.boolean().default(false),
  /** ISO dates, inclusive, applied to when the lead was last seen. */
  from: Joi.date().iso(),
  to: Joi.date().iso(),
};

const list = { query: listQuery(leadFilters) };

/** The same list, plus the two dimensions only the platform can filter on. */
const superList = {
  query: listQuery({ ...leadFilters, companyId: id }),
};

const analytics = {
  query: Joi.object({
    companyId: id,
    branchId: branchFilter,
    includeBots: Joi.boolean().default(false),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    /** How many rows each "top N" list returns. */
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),
};

/**
 * The console's only write.
 *
 * Everything a visit reports is a fact and is not editable; what a company
 * *learned* is. `.min(1)` because a PATCH that changes nothing is a mistake
 * worth reporting rather than a no-op worth pretending to have done.
 */
const update = {
  params: idParam,
  body: Joi.object({
    stage: Joi.string().valid(...LEAD_STAGE_VALUES),
    name: Joi.string().trim().allow('', null).max(150),
    email: email.allow('', null),
    phone: phone.allow('', null),
    notes: Joi.string().allow('', null).max(4000),
  }).min(1),
};

const visits = {
  params: idParam,
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(50),
  }),
};

module.exports = { track, list, superList, analytics, update, visits, detail: { params: idParam } };
