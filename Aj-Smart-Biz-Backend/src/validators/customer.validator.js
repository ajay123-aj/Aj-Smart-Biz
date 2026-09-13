'use strict';

const { Joi, id, idParam, listQuery, email, status } = require('./common');
const { CUSTOMER_OTP_LENGTH, ADDRESS_LABELS } = require('../constants');

/**
 * What a customer may say, and what a shop may say about them.
 *
 * The division that matters is the same one the order schemas draw: everything
 * above `/* from the console *\/` is filled in by **the public internet**, and
 * everything below it by signed-in staff. Which is why the public half carries a
 * name, a number and an email and nothing that could possibly be a status, a
 * note, or another customer's id.
 */

/**
 * Loose on purpose — this is every country's numbering plan at once, and the
 * service normalises whatever arrives into one canonical form anyway. A form
 * that refuses a real number is worse than a row that needs reading by a person,
 * which is the line `serviceLeadSubmit` already takes.
 */
const phone = Joi.string()
  .trim()
  .pattern(/^[0-9+()\-\s]{6,20}$/)
  .messages({ 'string.pattern.base': 'Enter a valid mobile number' });

/* ------------------------------------------------------------------ *
 * From the website
 * ------------------------------------------------------------------ */

/**
 * `domain` is declared on every public body for the reason the order schema
 * documents: the schemas run with `stripUnknown`, so a field the controller
 * needs but the schema omits is silently removed before it ever sees it.
 */
const domain = Joi.string().allow('', null).max(255);

const register = {
  body: Joi.object({
    domain,
    name: Joi.string().trim().min(2).max(120).required(),
    phone: phone.required(),
    /* Optional, and it stays optional: plenty of customers of this kind of shop
       do not have one, and demanding it would cost the account rather than gain
       an email address. */
    email: email.allow('', null),
  }),
};

const requestOtp = {
  body: Joi.object({ domain, phone: phone.required() }),
};

const verify = {
  body: Joi.object({
    domain,
    phone: phone.required(),
    /**
     * Digits only and exactly the right length. Trimmed first, because a code
     * pasted from a message often arrives with a space on the end and refusing
     * that would be refusing the correct code.
     */
    code: Joi.string()
      .trim()
      .pattern(new RegExp(`^[0-9]{${CUSTOMER_OTP_LENGTH}}$`))
      .required()
      .messages({ 'string.pattern.base': `Enter the ${CUSTOMER_OTP_LENGTH}-digit code` }),
  }),
};

/** The profile. **No phone**: it is the identity — see the controller. */
const updateMe = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(120),
    email: email.allow('', null),
  }).min(1),
};

const addressFields = {
  label: Joi.string().trim().valid(...ADDRESS_LABELS),
  contactName: Joi.string().trim().allow('', null).max(120),
  contactPhone: phone.allow('', null),
  line1: Joi.string().trim().min(3).max(200),
  line2: Joi.string().trim().allow('', null).max(200),
  landmark: Joi.string().trim().allow('', null).max(150),
  city: Joi.string().trim().min(2).max(120),
  stateId: Joi.alternatives().try(id, Joi.valid(null)),
  pincode: Joi.string().trim().allow('', null).max(20),
  /**
   * Only ever `true`. A customer with addresses always has exactly one default,
   * and un-defaulting the only one would open the checkout on nothing — so
   * demotion happens by promoting something else, the rule the warehouses follow.
   */
  isDefault: Joi.valid(true),
};

const addressCreate = {
  body: Joi.object({
    ...addressFields,
    line1: addressFields.line1.required(),
    city: addressFields.city.required(),
  }),
};

const addressUpdate = {
  params: idParam,
  body: Joi.object(addressFields).min(1),
};

/* ------------------------------------------------------------------ *
 * From the console
 * ------------------------------------------------------------------ */

const listQueryCustomers = {
  query: listQuery({}),
};

/**
 * A correction and a note.
 *
 * **No phone and no status here.** The number is the identity and is not
 * editable at all; the status has its own route, because barring somebody is a
 * decision worth being a deliberate act rather than a field somebody tabs past.
 */
const adminUpdate = {
  params: idParam,
  body: Joi.object({
    name: Joi.string().trim().min(2).max(120),
    email: email.allow('', null),
    notes: Joi.string().trim().allow('', null).max(1000),
  }).min(1),
};

const statusUpdate = {
  params: idParam,
  /* Absent means "flip it", which is what the switch in the console sends. */
  body: Joi.object({ status }),
};

module.exports = {
  register,
  requestOtp,
  verify,
  updateMe,
  addressCreate,
  addressUpdate,
  idParam: { params: idParam },
  listQuery: listQueryCustomers,
  adminUpdate,
  statusUpdate,
};
