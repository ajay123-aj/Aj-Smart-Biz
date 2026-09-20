'use strict';

const { Joi, idParam, listQuery, statusBody, status } = require('./common');
const {
  MARKETING_CONTENT_KEY_VALUES,
  MARKETING_ENQUIRY_KIND_VALUES,
  MARKETING_ENQUIRY_STATUS_VALUES,
} = require('../constants');

/**
 * The marketing site: the writing on it, its FAQ, and the enquiries it takes.
 *
 * The enquiry schema is the only one here that a stranger can reach, so it is
 * the only one written defensively. The rest are behind a super-admin token and
 * are shaped to catch a mistake rather than an attack.
 */

/* ------------------------------------------------------------------ *
 * The enquiry form — open to the internet
 * ------------------------------------------------------------------ */

/**
 * What the demo and contact forms may send.
 *
 * **A name, and at least one way to answer.** That pair is the whole rule, and
 * `.or()` is how it is stated rather than making both required: a shop owner
 * who wants a phone call should not have to invent an email address, and an
 * enquiry nobody can reply to is not an enquiry. It mirrors `canSend` on the
 * site, so the form and the API refuse the same submissions.
 *
 * Lengths are capped at the column widths rather than at what looks reasonable.
 * A 400-character "city" is somebody probing, and truncating it silently would
 * store a row that reads as if it were typed.
 */
const enquiryCreate = {
  body: Joi.object({
    kind: Joi.string()
      .valid(...MARKETING_ENQUIRY_KIND_VALUES)
      .default('demo'),
    name: Joi.string().trim().min(2).max(150).required(),
    businessName: Joi.string().trim().allow('', null).max(200),
    /**
     * Not `common.phone`. That one validates an Indian mobile because it is
     * used where we then *send* to the number; this is a stranger telling us
     * how to reach them, and refusing a landline, an extension or a country
     * code we did not anticipate loses the enquiry rather than cleaning it.
     */
    phone: Joi.string().trim().allow('', null).max(30),
    email: Joi.string().trim().lowercase().email().allow('', null).max(200),
    city: Joi.string().trim().allow('', null).max(120),
    /** Free text: what they typed is the useful part. See the model. */
    businessType: Joi.string().trim().allow('', null).max(150),
    plan: Joi.string().trim().allow('', null).max(120),
    message: Joi.string().trim().allow('', null).max(4000),
    source: Joi.string().trim().allow('', null).max(120),
    /**
     * The browser-held id from the tracker, where the page had one.
     *
     * Optional, and unverified: it only ever *attributes* an enquiry to
     * traffic we already recorded. A wrong one costs a line in a report; it
     * cannot reach another visitor's data, because the only thing done with
     * it is a lookup that either matches one of our own rows or does not.
     */
    deviceId: Joi.string().trim().allow('', null).max(64),
  })
    .or('phone', 'email')
    .messages({
      'object.missing': 'A phone number or an email address is required so we can reply',
    }),
};

/* ------------------------------------------------------------------ *
 * Managing it — super admin only
 * ------------------------------------------------------------------ */

/**
 * `GET /super-admin/marketing/enquiries`.
 *
 * `status` overrides the one `listQuery` supplies. Every other table on the
 * platform is active/inactive; an enquiry moves along a callback list instead,
 * so the shared filter would reject the only values this one can hold.
 */
const enquiryList = {
  query: listQuery({
    kind: Joi.string().valid(...MARKETING_ENQUIRY_KIND_VALUES),
    status: Joi.string().valid(...MARKETING_ENQUIRY_STATUS_VALUES),
  }),
};

/** Moving one along the callback list, with whatever we noted on the call. */
const enquiryUpdate = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid(...MARKETING_ENQUIRY_STATUS_VALUES),
    note: Joi.string().trim().allow('', null).max(4000),
  }).min(1),
};

/**
 * One block of writing, addressed by key.
 *
 * `payload` is `Joi.object()` with no inner shape, and that is the honest
 * description of what this column is — see the model's note on why the writing
 * lives as JSON. The key is checked against the whitelist precisely because the
 * payload cannot be: if neither were, a typo would create a row that nothing
 * renders and nobody notices.
 */
const contentUpsert = {
  params: Joi.object({
    key: Joi.string()
      .valid(...MARKETING_CONTENT_KEY_VALUES)
      .required(),
  }),
  body: Joi.object({
    label: Joi.string().trim().allow('', null).max(150),
    payload: Joi.object().required(),
    status,
  }),
};

const contentKeyParam = {
  params: Joi.object({
    key: Joi.string()
      .valid(...MARKETING_CONTENT_KEY_VALUES)
      .required(),
  }),
};

const faqFields = {
  question: Joi.string().trim().min(5).max(300),
  answer: Joi.string().trim().min(5).max(8000),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const faqCreate = {
  body: Joi.object({
    ...faqFields,
    question: faqFields.question.required(),
    answer: faqFields.answer.required(),
  }),
};

/** Partial by design — see the note at the top of `master.validator`. */
const faqUpdate = {
  params: idParam,
  body: Joi.object(faqFields).min(1),
};

module.exports = {
  enquiryCreate,
  enquiryList,
  enquiryUpdate,
  contentUpsert,
  contentKeyParam,
  faqCreate,
  faqUpdate,
  idParam,
  statusBody,
  listQuery,
};
