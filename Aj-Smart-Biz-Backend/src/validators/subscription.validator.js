'use strict';

const { Joi, id, idParam, listQuery } = require('./common');
const {
  PAYMENT_MODE,
  TRANSACTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  SUBSCRIPTION_CHANGE_TYPE_VALUES,
} = require('../constants');

const payment = Joi.object({
  paymentMode: Joi.string().valid(...Object.values(PAYMENT_MODE)).default(PAYMENT_MODE.OTHER),
  paymentReference: Joi.string().allow('', null).max(120),
  status: Joi.string().valid(...Object.values(TRANSACTION_STATUS)).default(TRANSACTION_STATUS.SUCCESS),
  paidAt: Joi.date().iso(),
  remarks: Joi.string().allow('', null).max(1000),
});

/** Money and dates shared by every "give this company a term" endpoint. */
const termFields = {
  startDate: Joi.date().iso(),
  durationDays: Joi.number().integer().min(1).max(36500),
  amount: Joi.number().min(0),
  discount: Joi.number().min(0).default(0),
  taxAmount: Joi.number().min(0).default(0),
  autoRenew: Joi.boolean(),
  isTrial: Joi.boolean(),
  graceDays: Joi.number().integer().min(0).max(90),
  remarks: Joi.string().allow('', null).max(1000),
  payment: payment.optional(),
};

/** POST /companies/:id/subscriptions/renew */
const renew = {
  params: idParam,
  body: Joi.object({
    ...termFields,
    // Omit to renew onto the plan the company is already on.
    planId: id,
    /** Start now and close the running term, instead of queueing behind it. */
    immediate: Joi.boolean().default(false),
  }),
};

/** POST /companies/:id/subscriptions/change-plan */
const changePlan = {
  params: idParam,
  body: Joi.object({
    ...termFields,
    planId: id.required(),
    /** Carry the unused value of the running term across as a credit. */
    applyCredit: Joi.boolean().default(true),
    creditApplied: Joi.number().min(0),
  }),
};

/** GET /companies/:id/subscriptions/change-preview?planId= */
const changePreview = {
  params: idParam,
  query: Joi.object({
    planId: id.required(),
    applyCredit: Joi.boolean().default(true),
  }),
};

/** POST /subscriptions/:id/transition */
const transition = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid(...SUBSCRIPTION_STATUS_VALUES).required(),
    reason: Joi.string().allow('', null).max(1000),
  }),
};

/** POST /subscriptions/:id/reactivate */
const reactivate = {
  params: idParam,
  body: Joi.object({ ...termFields, planId: id }),
};

/** POST /subscriptions/:id/extend */
const extend = {
  params: idParam,
  body: Joi.object({
    days: Joi.number().integer().min(1).max(365).required(),
    reason: Joi.string().allow('', null).max(1000),
  }),
};

/** PATCH /subscriptions/:id/auto-renew */
const autoRenew = {
  params: idParam,
  body: Joi.object({ autoRenew: Joi.boolean().required() }),
};

/** GET /subscriptions */
const list = {
  query: listQuery({
    status: Joi.alternatives().try(
      Joi.string().valid(...SUBSCRIPTION_STATUS_VALUES),
      Joi.array().items(Joi.string().valid(...SUBSCRIPTION_STATUS_VALUES))
    ),
    companyId: id,
    planId: id,
    changeType: Joi.string().valid(...SUBSCRIPTION_CHANGE_TYPE_VALUES),
    isTrial: Joi.boolean(),
    autoRenew: Joi.boolean(),
    /** Only terms ending within this many days - drives the "expiring soon" view. */
    expiringInDays: Joi.number().integer().min(0).max(365),
    expiredOnly: Joi.boolean(),
    fromDate: Joi.date().iso(),
    toDate: Joi.date().iso(),
  }),
};

const events = {
  params: idParam,
  query: listQuery(),
};

module.exports = {
  renew,
  changePlan,
  changePreview,
  transition,
  reactivate,
  extend,
  autoRenew,
  list,
  events,
};
