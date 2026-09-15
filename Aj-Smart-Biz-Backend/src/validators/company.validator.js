'use strict';

const { Joi, id, idParam, listQuery, email, phone, password, status, hexColor } = require('./common');
const { PAYMENT_MODE, TRANSACTION_STATUS, SUBSCRIPTION_STATUS } = require('../constants');

/** An upload path returned by `POST /uploads/:folder`, or an absolute URL. */
const imagePath = Joi.string()
  .max(255)
  .pattern(/^(\/uploads\/[\w./-]+|https?:\/\/.+)$/)
  .message('must be an uploaded file path or an absolute URL');

/* ---------------- Company ---------------- */
const companyFields = {
  name: Joi.string().min(2).max(180),
  code: Joi.string().alphanum().min(2).max(40).uppercase(),
  legalName: Joi.string().allow('', null).max(200),
  description: Joi.string().allow('', null).max(2000),
  businessTypeId: id.allow(null),
  themeId: id.allow(null),
  stateId: id.allow(null),
  email,
  phone,
  alternatePhone: Joi.string().allow('', null).max(20),
  website: Joi.string().uri({ allowRelative: false }).allow('', null).max(180),
  gstNumber: Joi.string().allow('', null).max(20),
  panNumber: Joi.string().allow('', null).max(20),
  addressLine1: Joi.string().allow('', null).max(255),
  addressLine2: Joi.string().allow('', null).max(255),
  city: Joi.string().allow('', null).max(120),
  pincode: Joi.string().allow('', null).max(12),
  logo: imagePath.allow('', null),
  favicon: imagePath.allow('', null),
  currency: Joi.string().max(10),
  timezone: Joi.string().max(60),
  status,
};

/**
 * Creating a company also provisions its head-office branch, the system role
 * and the main admin, and optionally activates a plan - all in one request.
 */
const companyCreate = {
  body: Joi.object({
    ...companyFields,
    name: companyFields.name.required(),
    email: email.required(),
    phone: phone.required(),
    currency: companyFields.currency.default('INR'),
    timezone: companyFields.timezone.default('Asia/Kolkata'),

    // Convenience: seeds the tenant's primary row in `company_domain`.
    domain: Joi.string()
      .lowercase()
      .trim()
      .max(255)
      .pattern(/^(?!https?:)(?!.*\/)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/)
      .message('domain must be a bare hostname such as acme.ajsmartbiz.com')
      .allow('', null),

    mainAdmin: Joi.object({
      name: Joi.string().min(2).max(150).required(),
      email: email.required(),
      phone: Joi.string().allow('', null).max(20),
      // Omit to have the API generate one and return it once in the response.
      password: password.optional(),
    }).optional(),

    subscription: Joi.object({
      planId: id.required(),
      startDate: Joi.date().iso(),
      durationDays: Joi.number().integer().min(1),
      amount: Joi.number().min(0),
      discount: Joi.number().min(0).default(0),
      taxAmount: Joi.number().min(0).default(0),
      autoRenew: Joi.boolean().default(false),
      isTrial: Joi.boolean().default(false),
      // Days of access after the end date before the sweeper closes the term.
      graceDays: Joi.number().integer().min(0).max(90).default(0),
      remarks: Joi.string().allow('', null).max(1000),
      // When present a paid transaction is recorded alongside the subscription.
      payment: Joi.object({
        paymentMode: Joi.string().valid(...Object.values(PAYMENT_MODE)).default(PAYMENT_MODE.OTHER),
        paymentReference: Joi.string().allow('', null).max(120),
        status: Joi.string().valid(...Object.values(TRANSACTION_STATUS)).default(TRANSACTION_STATUS.SUCCESS),
        paidAt: Joi.date().iso(),
        remarks: Joi.string().allow('', null).max(1000),
      }).optional(),
    }).optional(),
  }),
};

const companyUpdate = { params: idParam, body: Joi.object(companyFields).min(1) };
/** `PUT /my-company` has no `:id` in the path - the tenant comes from the token. */
const companyUpdateSelf = { body: Joi.object(companyFields).min(1) };

/* ---------------- Website theme ---------------- */
/**
 * Which scope is being read or written. Absent, `none` or `null` all mean the
 * company-wide theme; an id means that branch's own.
 *
 * Accepted in the query *and* the body because the console sends it either way
 * depending on the verb, which is the arrangement the About and Contact
 * editors already use — see `themeScopeOf` in the company controller, which
 * reads both.
 */
const themeScope = Joi.alternatives()
  .try(id, Joi.string().valid('none', 'null', ''))
  .messages({ 'alternatives.match': 'branchId must be a branch id, or "none" for the company-wide theme' });

const themeQuery = { query: Joi.object({ branchId: themeScope }) };

/**
 * `PUT /my-company/theme[?branchId=]` - the colours one scope paints the
 * website with.
 *
 * A closed set, and only the four keys a template actually reads. The `themes`
 * table carries text, background, sidebar and font columns as well; none of
 * them is consumed by any website today, so accepting them here would be
 * storing settings that change nothing. Add one when a template starts using
 * it - see `WEBSITE_THEME_KEYS` in `services/theme.service`, which this has to
 * stay in step with.
 *
 * Every field allows `''` and `null`, and both mean the same thing: *unset*.
 * That is what makes a single field resettable - clearing the accent on a
 * branch drops it back to the company's accent rather than to no accent, and
 * the service strips blanks before they reach the column.
 *
 * `.min(1)` rather than requiring a primary colour: a caller may legitimately
 * send only `mode`, or only an accent, and the merge in `theme.service` fills
 * the rest in from the level below.
 */
const themeSave = {
  query: Joi.object({ branchId: themeScope }),
  body: Joi.object({
    branchId: themeScope,
    primaryColor: hexColor.allow('', null),
    secondaryColor: hexColor.allow('', null),
    accentColor: hexColor.allow('', null),
    mode: Joi.string().valid('light', 'dark').allow('', null),
  }).min(1),
};

const companyList = {
  query: listQuery({
    businessTypeId: id,
    stateId: id,
    planId: id,
    subscriptionStatus: Joi.string().valid(...Object.values(SUBSCRIPTION_STATUS)),
  }),
};

/* ---------------- Branch ---------------- */
const branchFields = {
  name: Joi.string().min(2).max(180),
  code: Joi.string().alphanum().min(2).max(40).uppercase(),
  logo: imagePath.allow('', null),
  favicon: imagePath.allow('', null),
  email: email.allow('', null),
  phone: Joi.string().allow('', null).max(20),
  gstNumber: Joi.string().allow('', null).max(20),
  stateId: id.allow(null),
  addressLine1: Joi.string().allow('', null).max(255),
  addressLine2: Joi.string().allow('', null).max(255),
  city: Joi.string().allow('', null).max(120),
  pincode: Joi.string().allow('', null).max(12),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  openingTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow('', null),
  closingTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow('', null),
  isMain: Joi.boolean(),
  status,
};
const branchCreate = { body: Joi.object({ ...branchFields, name: branchFields.name.required() }) };
const branchUpdate = { params: idParam, body: Joi.object(branchFields).min(1) };

/* ------------- Branch contact ------------- */
const contactFields = {
  name: Joi.string().min(2).max(150),
  designation: Joi.string().allow('', null).max(120),
  department: Joi.string().allow('', null).max(120),
  email: email.allow('', null),
  phone: Joi.string().max(20),
  alternatePhone: Joi.string().allow('', null).max(20),
  isPrimary: Joi.boolean(),
  notes: Joi.string().allow('', null).max(2000),
  status,
};
const contactCreate = {
  body: Joi.object({
    ...contactFields,
    name: contactFields.name.required(),
    phone: contactFields.phone.required(),
  }),
};
const contactUpdate = { params: idParam, body: Joi.object(contactFields).min(1) };

/* ------------- Subscription / transaction ------------- */
const subscriptionCreate = {
  params: idParam,
  body: Joi.object({
    planId: id.required(),
    startDate: Joi.date().iso(),
    durationDays: Joi.number().integer().min(1),
    amount: Joi.number().min(0),
    discount: Joi.number().min(0).default(0),
    taxAmount: Joi.number().min(0).default(0),
    autoRenew: Joi.boolean().default(false),
    isTrial: Joi.boolean().default(false),
    graceDays: Joi.number().integer().min(0).max(90).default(0),
    remarks: Joi.string().allow('', null).max(1000),
    payment: Joi.object({
      paymentMode: Joi.string().valid(...Object.values(PAYMENT_MODE)).default(PAYMENT_MODE.OTHER),
      paymentReference: Joi.string().allow('', null).max(120),
      status: Joi.string().valid(...Object.values(TRANSACTION_STATUS)).default(TRANSACTION_STATUS.SUCCESS),
      paidAt: Joi.date().iso(),
      remarks: Joi.string().allow('', null).max(1000),
    }).optional(),
  }),
};

const transactionCreate = {
  params: idParam,
  body: Joi.object({
    subscriptionId: id.allow(null),
    planId: id.allow(null),
    amount: Joi.number().min(0).required(),
    discount: Joi.number().min(0).default(0),
    taxAmount: Joi.number().min(0).default(0),
    currency: Joi.string().max(10).default('INR'),
    paymentMode: Joi.string().valid(...Object.values(PAYMENT_MODE)).default(PAYMENT_MODE.OTHER),
    paymentReference: Joi.string().allow('', null).max(120),
    status: Joi.string().valid(...Object.values(TRANSACTION_STATUS)).default(TRANSACTION_STATUS.SUCCESS),
    paidAt: Joi.date().iso(),
    remarks: Joi.string().allow('', null).max(1000),
  }),
};

const transactionList = {
  params: idParam,
  query: listQuery({
    status: Joi.string().valid(...Object.values(TRANSACTION_STATUS)),
    fromDate: Joi.date().iso(),
    toDate: Joi.date().iso(),
  }),
};

/* ------------------------ Company domains ------------------------ */
/** Bare hostname: no scheme, no port, no path. */
const hostname = Joi.string()
  .lowercase()
  .trim()
  .max(255)
  .pattern(/^(?!https?:)(?!.*\/)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/)
  .message('domain must be a bare hostname such as acme.ajsmartbiz.com');

const domainFields = {
  domain: hostname,
  /** Optional branch this host is dedicated to. */
  subCompanyId: id.allow(null),
  isPrimary: Joi.boolean(),
  status,
};
const domainCreate = { body: Joi.object({ ...domainFields, domain: hostname.required() }) };
const domainUpdate = { params: idParam, body: Joi.object(domainFields).min(1) };

module.exports = {
  companyCreate,
  companyUpdate,
  domainCreate,
  domainUpdate,
  companyUpdateSelf,
  themeQuery,
  themeSave,
  companyList,
  branchCreate,
  branchUpdate,
  contactCreate,
  contactUpdate,
  subscriptionCreate,
  transactionCreate,
  transactionList,
};
