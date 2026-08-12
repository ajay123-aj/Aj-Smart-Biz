'use strict';

const { Joi, id, idParam, listQuery } = require('./common');
const {
  PAYMENT_MODE,
  TRANSACTION_STATUS,
  PLAN_REQUEST_STATUS_VALUES,
  PLAN_REQUEST_TYPE_VALUES,
} = require('../constants');

/** POST /my-company/plan-requests */
const create = {
  body: Joi.object({
    planId: id.required(),
    note: Joi.string().allow('', null).max(1000),
  }),
};

/** GET /plan-requests */
const list = {
  query: listQuery({
    status: Joi.string().valid(...PLAN_REQUEST_STATUS_VALUES),
    type: Joi.string().valid(...PLAN_REQUEST_TYPE_VALUES),
    companyId: id,
  }),
};

/**
 * POST /plan-requests/:id/approve
 * The approval carries the commercial terms, because the price agreed on the
 * phone is rarely the sticker price.
 */
const approve = {
  params: idParam,
  body: Joi.object({
    applyCredit: Joi.boolean().default(true),
    discount: Joi.number().min(0).default(0),
    taxAmount: Joi.number().min(0).default(0),
    graceDays: Joi.number().integer().min(0).max(90),
    autoRenew: Joi.boolean(),
    remarks: Joi.string().allow('', null).max(1000),
    decisionNote: Joi.string().allow('', null).max(1000),
    payment: Joi.object({
      paymentMode: Joi.string().valid(...Object.values(PAYMENT_MODE)).default(PAYMENT_MODE.OTHER),
      paymentReference: Joi.string().allow('', null).max(120),
      status: Joi.string().valid(...Object.values(TRANSACTION_STATUS)).default(TRANSACTION_STATUS.SUCCESS),
      paidAt: Joi.date().iso(),
      remarks: Joi.string().allow('', null).max(1000),
    }).optional(),
  }),
};

const reject = {
  params: idParam,
  body: Joi.object({ decisionNote: Joi.string().allow('', null).max(1000) }),
};

module.exports = { create, list, approve, reject };
