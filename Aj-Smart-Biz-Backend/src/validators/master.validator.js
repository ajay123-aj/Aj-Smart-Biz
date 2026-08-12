'use strict';

const { Joi, idParam, listQuery, statusBody, hexColor, status } = require('./common');
const { BILLING_CYCLE } = require('../constants');

/**
 * Update schemas are written without `.default()` on purpose: Joi injects
 * defaults for absent keys, which on a partial update would silently reset
 * columns the client never sent.
 */

/* ---------------- State ---------------- */
const stateCreate = {
  body: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    code: Joi.string().allow('', null).max(20),
    country: Joi.string().max(120).default('India'),
    gstCode: Joi.string().allow('', null).max(10),
    status,
  }),
};
const stateUpdate = {
  params: idParam,
  body: Joi.object({
    name: Joi.string().min(2).max(120),
    code: Joi.string().allow('', null).max(20),
    country: Joi.string().max(120),
    gstCode: Joi.string().allow('', null).max(10),
    status,
  }).min(1),
};

/* ------------- Business type ------------- */
const businessTypeFields = {
  name: Joi.string().min(2).max(150),
  slug: Joi.string().allow('', null).max(150),
  icon: Joi.string().allow('', null).max(120),
  description: Joi.string().allow('', null).max(2000),
  status,
};
const businessTypeCreate = {
  body: Joi.object({ ...businessTypeFields, name: businessTypeFields.name.required() }),
};
const businessTypeUpdate = { params: idParam, body: Joi.object(businessTypeFields).min(1) };

/* ---------------- Theme ---------------- */
const themeFields = {
  name: Joi.string().min(2).max(120),
  code: Joi.string().allow('', null).max(60),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor.allow('', null),
  textColor: hexColor.allow('', null),
  backgroundColor: hexColor.allow('', null),
  sidebarColor: hexColor.allow('', null),
  fontFamily: Joi.string().allow('', null).max(120),
  mode: Joi.string().valid('light', 'dark'),
  previewImage: Joi.string().allow('', null).max(255),
  config: Joi.object().allow(null),
  isDefault: Joi.boolean(),
  status,
};
const themeCreate = {
  body: Joi.object({
    ...themeFields,
    name: themeFields.name.required(),
    primaryColor: hexColor.required(),
    secondaryColor: hexColor.required(),
    mode: themeFields.mode.default('light'),
    isDefault: themeFields.isDefault.default(false),
  }),
};
const themeUpdate = { params: idParam, body: Joi.object(themeFields).min(1) };

/* ---------------- Plan ---------------- */
const planFields = {
  name: Joi.string().min(2).max(120),
  code: Joi.string().allow('', null).max(60),
  description: Joi.string().allow('', null).max(2000),
  price: Joi.number().min(0),
  discountPrice: Joi.number().min(0).allow(null),
  currency: Joi.string().max(10),
  billingCycle: Joi.string().valid(...Object.values(BILLING_CYCLE)),
  durationDays: Joi.number().integer().min(1).allow(null),
  trialDays: Joi.number().integer().min(0),
  maxBranches: Joi.number().integer().min(1),
  maxAdmins: Joi.number().integer().min(1),
  maxUsers: Joi.number().integer().min(1),
  storageMb: Joi.number().integer().min(1),
  features: Joi.array().items(Joi.string().max(200)).allow(null),
  isPopular: Joi.boolean(),
  sequence: Joi.number().integer(),
  status,
};
const planCreate = {
  body: Joi.object({
    ...planFields,
    name: planFields.name.required(),
    price: planFields.price.required(),
    currency: planFields.currency.default('INR'),
    billingCycle: planFields.billingCycle.default(BILLING_CYCLE.MONTHLY),
    trialDays: planFields.trialDays.default(0),
    maxBranches: planFields.maxBranches.default(1),
    maxAdmins: planFields.maxAdmins.default(1),
    maxUsers: planFields.maxUsers.default(5),
    storageMb: planFields.storageMb.default(1024),
    isPopular: planFields.isPopular.default(false),
    sequence: planFields.sequence.default(0),
  }),
};
const planUpdate = { params: idParam, body: Joi.object(planFields).min(1) };

module.exports = {
  idParam: { params: idParam },
  listQuery: { query: listQuery() },
  statusBody: { params: idParam, body: statusBody },
  stateCreate,
  stateUpdate,
  businessTypeCreate,
  businessTypeUpdate,
  themeCreate,
  themeUpdate,
  planCreate,
  planUpdate,
};
