'use strict';

const { Joi, id, idParam, listQuery, status, phone } = require('./common');
const {
  STOCK_MANUAL_REASONS,
  STOCK_QUANTITY_MAX,
  ANALYTICS_RANGES,
} = require('../constants');

/**
 * Warehouses, levels, and the movements that change them.
 *
 * The shape worth noticing is in `movementCreate`: **there is no `type`.** The
 * direction is implied by the reason — a receipt goes in, damage goes out, a
 * stock count is an adjustment — and asking a person for both is asking them to
 * contradict themselves. `STOCK_REASON_CATALOGUE` carries the mapping and the
 * controller applies it, so a reason added to the platform brings its direction
 * with it rather than needing this file changed.
 */

const warehouseFields = {
  branchId: Joi.alternatives().try(id, Joi.valid(null)),
  name: Joi.string().trim().min(1).max(150),
  /**
   * Upper-cased on the way in, because it is what goes on a printed pick list
   * and what somebody says out loud. Letters, digits and a dash — a code with a
   * space in it is a code that gets mistyped down the phone.
   */
  code: Joi.string()
    .trim()
    .uppercase()
    .max(30)
    .pattern(/^[A-Z0-9-]+$/)
    .message('code may use letters, numbers and dashes only'),
  addressLine: Joi.string().trim().allow('', null).max(300),
  city: Joi.string().trim().allow('', null).max(120),
  stateId: Joi.alternatives().try(id, Joi.valid(null)),
  pincode: Joi.string().trim().allow('', null).max(20),
  contactName: Joi.string().trim().allow('', null).max(120),
  contactPhone: phone.allow('', null),
  /**
   * Promoting a warehouse demotes the incumbent, in the same transaction. There
   * is no way to send `false`: a company with warehouses always has exactly one
   * default, and un-defaulting the only one would leave orders with nowhere to
   * go. Demotion happens by promoting something else.
   */
  isDefault: Joi.valid(true),
  notes: Joi.string().trim().allow('', null).max(500),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const warehouseCreate = {
  body: Joi.object({
    ...warehouseFields,
    name: warehouseFields.name.required(),
    code: warehouseFields.code.required(),
  }),
};

const warehouseUpdate = {
  params: idParam,
  body: Joi.object(warehouseFields).min(1),
};

const warehouseListQuery = {
  query: listQuery({
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
  }),
};

/**
 * The stock list, across warehouses or within one.
 *
 * `low` and `out` are the two questions this screen is opened to answer, so they
 * are filters the API resolves rather than something a browser derives from a
 * page — a page-derived count would be a count of that page, and would read zero
 * on the very filter that needed it.
 */
const stockListQuery = {
  query: listQuery({
    warehouseId: id,
    productId: id,
    categoryId: id,
    low: Joi.boolean(),
    out: Joi.boolean(),
  }),
};

/**
 * One movement, typed in by a person.
 *
 * `quantity` means different things per reason and the difference is the one
 * genuinely confusing thing about stock control: on a receipt it is *how many
 * arrived*, and on a stock count it is *how many there are now*. The console
 * says so beside the box; the service works out the delta, which is the only
 * place it can be worked out without a race.
 */
const movementCreate = {
  body: Joi.object({
    warehouseId: id.required(),
    productId: id.required(),
    /** One of the reasons a person may write. `sale` and `transfer` are not. */
    reason: Joi.string()
      .valid(...STOCK_MANUAL_REASONS)
      .required(),
    quantity: Joi.number().integer().min(0).max(STOCK_QUANTITY_MAX).required(),
    /* What one cost, on a receipt. The cost, never the selling price — it is
       what makes a stock valuation the money tied up rather than the money
       hoped for. */
    unitCost: Joi.number().min(0).max(99999999.99).allow(null),
    reference: Joi.string().trim().allow('', null).max(120),
    note: Joi.string().trim().allow('', null).max(500),
  }),
};

/** Moving stock between two of the tenant's own units. Two movements, one call. */
const transferCreate = {
  body: Joi.object({
    fromWarehouseId: id.required(),
    toWarehouseId: id.required().invalid(Joi.ref('fromWarehouseId')).messages({
      'any.invalid': 'Pick two different warehouses',
    }),
    productId: id.required(),
    quantity: Joi.number().integer().min(1).max(STOCK_QUANTITY_MAX).required(),
    note: Joi.string().trim().allow('', null).max(500),
  }),
};

/**
 * The settings that live on a level rather than on a movement — where it is kept
 * and when to warn. Not a movement, because neither of them changes how many
 * there are.
 */
const stockSettings = {
  body: Joi.object({
    warehouseId: id.required(),
    productId: id.required(),
    reorderLevel: Joi.number().integer().min(0).max(STOCK_QUANTITY_MAX),
    binLocation: Joi.string().trim().allow('', null).max(60),
  }).min(3),
};

const movementListQuery = {
  query: listQuery({
    warehouseId: id,
    productId: id,
    orderId: id,
    reason: Joi.string().max(30),
    from: Joi.date(),
    to: Joi.date(),
  }),
};

const analyticsQuery = {
  query: Joi.object({
    days: Joi.number()
      .integer()
      .valid(...ANALYTICS_RANGES),
    warehouseId: id,
  }),
};

module.exports = {
  warehouseCreate,
  warehouseUpdate,
  warehouseListQuery,
  idParam: { params: idParam },
  stockListQuery,
  movementCreate,
  movementListQuery,
  transferCreate,
  stockSettings,
  analyticsQuery,
};
