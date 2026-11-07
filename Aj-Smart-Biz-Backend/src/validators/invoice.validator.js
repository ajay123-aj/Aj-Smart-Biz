'use strict';

const { Joi, id, email } = require('./common');
const {
  INVOICE_STATUS_VALUES,
  INVOICE_PAYMENT_STATUS_VALUES,
  INVOICE_PAYMENT_MODE_VALUES,
  DISCOUNT_TYPE_VALUES,
  INVOICE_ITEMS_MAX,
  INVOICE_QTY_MAX,
  PRODUCT_PRICE_MAX,
} = require('../constants');

/**
 * Invoices are written by the tenant's own signed-in staff, so unlike the
 * website's cart these bodies may carry prices and discounts. Every figure is
 * still recomputed on the server — the totals a browser sends are ignored.
 */

const money = Joi.number().min(0).max(PRODUCT_PRICE_MAX).precision(2);
const optionalText = (max) => Joi.string().trim().max(max).allow('', null);

const line = Joi.object({
  productId: id.required(),
  quantity: Joi.number().integer().min(1).max(INVOICE_QTY_MAX).required(),
  /** Omit to bill at the catalogue's selling price. */
  unitPrice: money.allow(null, ''),
  discountType: Joi.string().valid(...DISCOUNT_TYPE_VALUES).allow(null, ''),
  discountValue: money.default(0),
  taxPercent: Joi.number().min(0).max(100).precision(2).default(0),
});

const invoiceBody = Joi.object({
  branchId: id.allow(null),
  warehouseId: id.allow(null),
  customerId: id.allow(null),
  invoiceDate: Joi.date().iso().raw().allow(null, ''),
  dueDate: Joi.date().iso().raw().allow(null, ''),

  customerName: optionalText(160),
  customerPhone: Joi.string().trim().pattern(/^[0-9+\-\s()]{6,20}$/).allow('', null)
    .messages({ 'string.pattern.base': 'customerPhone must be a valid phone number' }),
  customerEmail: email.allow('', null),
  customerAddress: optionalText(500),
  customerGstin: optionalText(20),

  items: Joi.array().items(line).min(1).max(INVOICE_ITEMS_MAX).required(),

  billDiscountType: Joi.string().valid(...DISCOUNT_TYPE_VALUES).allow(null, ''),
  billDiscountValue: money.default(0),
  roundOff: Joi.boolean().default(true),

  amountPaid: money.default(0),
  paymentMode: Joi.string().valid(...INVOICE_PAYMENT_MODE_VALUES).allow(null, ''),
  paymentReference: optionalText(120),
  notes: optionalText(1000),

  /** `true` saves and issues in one step: numbered, locked, stock deducted. */
  issue: Joi.boolean().default(false),
});

const idParam = Joi.object({ id: id.required() });

module.exports = {
  listQuery: {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(200).default(20),
      search: Joi.string().allow('', null).max(150),
      status: Joi.string().valid(...INVOICE_STATUS_VALUES),
      paymentStatus: Joi.string().valid(...INVOICE_PAYMENT_STATUS_VALUES),
      branchId: id,
      from: Joi.date().iso(),
      to: Joi.date().iso(),
      /* `mine` (default) or `all` — everyone's, which needs the All invoices permission. */
      scope: Joi.string().valid('mine', 'all').default('mine'),
      /* With `scope=all`: only this admin's invoices. */
      createdBy: id,
      sortBy: Joi.string().valid('invoice_date', 'grand_total', 'invoice_no', 'created_at'),
      sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
    }),
  },
  analysisQuery: {
    query: Joi.object({
      from: Joi.date().iso(),
      to: Joi.date().iso(),
      scope: Joi.string().valid('mine', 'all').default('mine'),
      createdBy: id,
      branchId: id,
    }),
  },
  productQuery: {
    query: Joi.object({
      search: Joi.string().allow('', null).max(150),
      warehouseId: id,
      branchId: id,
      limit: Joi.number().integer().min(1).max(50).default(20),
    }),
  },
  create: { body: invoiceBody },
  update: { params: idParam, body: invoiceBody },
  idParam: { params: idParam },
  payment: {
    params: idParam,
    body: Joi.object({
      amountPaid: money.required(),
      paymentMode: Joi.string().valid(...INVOICE_PAYMENT_MODE_VALUES).allow(null, ''),
      paymentReference: optionalText(120),
    }),
  },
  cancel: {
    params: idParam,
    body: Joi.object({ reason: optionalText(500) }),
  },
};
