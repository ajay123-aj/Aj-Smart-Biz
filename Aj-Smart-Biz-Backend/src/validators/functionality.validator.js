'use strict';

const { Joi, id, idParam, listQuery, status } = require('./common');
const ApiError = require('../utils/ApiError');
const {
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  WHATSAPP_TYPE_VALUES,
  SHARE_CHANNEL_VALUES,
  STAT_MODE,
  STAT_MODE_VALUES,
  STAT_UNIT_VALUES,
  CONTACT_FORM_TARGET_VALUES,
  NAV_LABEL_MAX,
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
  // refused instead of silently saved. Team and Gallery are the same.
  [FUNCTIONALITY.WHATSAPP]: Joi.object({}),
  [FUNCTIONALITY.TEAM]: Joi.object({}),
  [FUNCTIONALITY.GALLERY]: Joi.object({}),
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

/** Every card list reorders the same way: the whole order, in one call. */
const reorder = {
  body: Joi.object({
    ids: Joi.array().items(Joi.number().integer().positive().required()).min(1).max(200).required(),
  }),
};

module.exports = {
  keyParam: { params: keyParam },
  toggle,
  settings,
  validateSettings,
  whatsappCreate,
  whatsappUpdate,
  whatsappReorder,
  whatsappListQuery: {
    query: listQuery({ type: Joi.string().valid(...WHATSAPP_TYPE_VALUES) }),
  },
  statCreate,
  statUpdate,
  teamCreate,
  teamUpdate,
  galleryCreate,
  galleryUpdate,
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
