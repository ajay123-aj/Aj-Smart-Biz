'use strict';

const { Joi, idParam, listQuery, email, phone } = require('./common');
const { LEAD_STAGE_VALUES, DEVICE_TYPE_VALUES } = require('../constants');
const leadValidator = require('./lead.validator');

/**
 * Traffic on our own marketing site.
 *
 * The tenant twin is `lead.validator`, and the two differ in exactly the way
 * the tables do: nothing here takes a `companyId` or a `branchId`, because
 * there is no tenant to scope by.
 *
 * **`track` is reused outright**, not re-declared. It is the schema that faces
 * the open internet, it is the one whose bounds actually matter, and two copies
 * of it would drift the first time one learned about a new field. The payload a
 * marketing page sends and the payload a tenant's page sends are the same
 * payload.
 */
const track = leadValidator.track;

/** Filters the list and the analytics share. */
const leadFilters = {
  stage: Joi.string().valid(...LEAD_STAGE_VALUES),
  deviceType: Joi.string().valid(...DEVICE_TYPE_VALUES),
  utmSource: Joi.string().max(160),
  utmMedium: Joi.string().max(160),
  utmCampaign: Joi.string().max(160),
  country: Joi.string().max(80),
  city: Joi.string().max(80),
  /** Only leads that went on to send the demo or contact form. */
  enquiredOnly: Joi.boolean().default(false),
  /**
   * Whether crawlers are included. Default `false` — a lead list is a list of
   * people — but they are stored, so the filter can show them.
   */
  includeBots: Joi.boolean().default(false),
  /** ISO dates, inclusive, applied to when the lead was last seen. */
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  /** The console's range buttons. Wins over `from`/`to` — see the controller. */
  days: Joi.number().integer().min(1).max(3650),
};

const list = { query: listQuery(leadFilters) };

const summary = { query: Joi.object(leadFilters) };

const analytics = {
  query: Joi.object({
    ...leadFilters,
    /** How many rows each "top N" list returns. */
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),
};

/**
 * The console's only write.
 *
 * Everything a visit reported is a fact and is not editable; what we *learned*
 * is. `.min(1)` because a PATCH that changes nothing is a mistake worth
 * reporting rather than a no-op worth pretending to have done.
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

module.exports = { track, list, summary, analytics, update, visits, detail: { params: idParam } };
