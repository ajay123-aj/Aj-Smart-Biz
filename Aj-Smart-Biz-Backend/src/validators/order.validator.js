'use strict';

const { Joi, id, idParam, listQuery } = require('./common');
const {
  ORDER_STATUS_VALUES,
  ORDER_PAYMENT_STATUS_VALUES,
  ORDER_ITEMS_MAX,
  ORDER_QTY_MAX,
  PRODUCT_PRICE_MAX,
  ANALYTICS_RANGES,
} = require('../constants');

/**
 * What may be said about an order, and by whom.
 *
 * The division that matters is between the two bodies at the top of this file
 * and everything under them. `submit` is filled in by **the public internet**;
 * the rest is a signed-in member of the tenant's own staff. So `submit` carries
 * product ids and quantities and nothing else that could possibly be a price,
 * and the console's schemas carry the money.
 */

/* ------------------------------------------------------------------ *
 * From the website
 * ------------------------------------------------------------------ */

/**
 * A cart, as posted by a stranger.
 *
 * **There is no price in here and there never will be.** The server reads every
 * figure off the tenant's own catalogue at the moment the order is placed; a
 * body that could name its own price is a shop that can be bought from at a
 * price the customer chose. The same reasoning keeps `status`, `orderNo` and
 * anything about payment out: all of them are the platform's to decide.
 *
 * Every customer field is optional here even though the tenant may have marked
 * it required, because *which* of them are required is a per-tenant setting the
 * schema cannot see. The route checks that against the company's own order
 * settings, which is the only place the answer exists.
 */
const submit = {
  body: Joi.object({
    /**
     * Which tenant’s website this came from.
     *
     * Read by `resolveHost` alongside the `Host` header, and it has to be
     * **declared here** or the validator strips it before the controller ever
     * sees it — the schemas run with `stripUnknown`, which is what stops a body
     * parking arbitrary JSON on a row. The enquiry schema carries it for the same
     * reason.
     *
     * Not trusted as identity on its own: the API resolves the host itself, and a
     * domain naming a company whose site the sender never opened resolves to a
     * tenant that must still pass every other check below.
     */
    domain: Joi.string().allow('', null).max(255),
    items: Joi.array()
      .items(
        Joi.object({
          productId: id.required(),
          quantity: Joi.number().integer().min(1).max(ORDER_QTY_MAX).required(),
        })
      )
      .min(1)
      .max(ORDER_ITEMS_MAX)
      .required(),

    name: Joi.string().trim().allow('', null).max(120),
    phone: Joi.string().trim().allow('', null).max(30),
    address: Joi.string().trim().allow('', null).max(500),
    /**
     * A saved address, for a signed-in customer.
     *
     * An **id**, checked against the sender's own addresses by the route — never
     * the address text, which would let a body name any address and read it back
     * out of its own order confirmation. Ignored entirely on a guest order, which
     * still types into `address`.
     *
     * **`null` is the ordinary case, not a malformed one.** Anybody without a
     * saved address to pick — every guest on a shop that takes guest orders, and
     * every signed-in customer who has not saved one yet — sends null here, and
     * the website has always sent the field. Refusing it failed the whole order
     * with "Validation failed" and no clue which field was meant, at the last
     * press of a finished basket.
     */
    addressId: id.allow(null),
    note: Joi.string().trim().allow('', null).max(1000),

    /* Where they were standing. Recorded, never trusted for anything. */
    sourceUrl: Joi.string().trim().allow('', null).max(500),
  }),
};

/* ------------------------------------------------------------------ *
 * From the console
 * ------------------------------------------------------------------ */

/**
 * The order list.
 *
 * `status` here is the **order's** status, not the platform's usual
 * active/inactive — an order is cancelled rather than deactivated, and this
 * table has no second switch. So `listQuery`'s own `status` is overridden
 * rather than extended, which is worth noticing when reading it next to every
 * other list schema in this folder.
 */
const listQueryOrders = {
  query: listQuery({
    status: Joi.string().valid(...ORDER_STATUS_VALUES),
    paymentStatus: Joi.string().valid(...ORDER_PAYMENT_STATUS_VALUES),
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    warehouseId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    /** Everything still owed to somebody, in one tick. See `OPEN_ORDER_STATUSES`. */
    open: Joi.boolean(),
    /* Dates rather than a window, because this is the screen somebody uses to
       answer "what did we ship in the first week of March". */
    from: Joi.date(),
    to: Joi.date(),
  }),
};

/**
 * Moving an order along.
 *
 * Only the destination is sent. Which moves are legal from where is
 * `ORDER_TRANSITIONS`, checked in the service so the rule lives in one place —
 * a `.valid()` list here would be a second copy of it that could drift.
 *
 * `reason` is asked for on a cancellation and kept on the row. A cancelled
 * order with no reason is the one somebody asks about six weeks later.
 */
const statusUpdate = {
  params: idParam,
  body: Joi.object({
    status: Joi.string()
      .valid(...ORDER_STATUS_VALUES)
      .required(),
    reason: Joi.string().trim().allow('', null).max(300),
  }),
};

const paymentUpdate = {
  params: idParam,
  body: Joi.object({
    paymentStatus: Joi.string()
      .valid(...ORDER_PAYMENT_STATUS_VALUES)
      .required(),
    /** The UPI reference or receipt number, typed in by whoever checked. */
    reference: Joi.string().trim().allow('', null).max(120),
  }),
};

/**
 * The parts of an order a person may edit after the fact.
 *
 * Deliberately short. The lines and their prices are not in it: an order is a
 * record of what was bought at what price, and a console that could rewrite that
 * would make every sales figure an opinion. What a shop legitimately needs to
 * change is where it is being filled from, the delivery or discount agreed on
 * the phone, and its own notes.
 */
const orderUpdate = {
  params: idParam,
  body: Joi.object({
    warehouseId: Joi.alternatives().try(id, Joi.valid(null)),
    /* Signed: a delivery charge adds, a discount subtracts. One figure rather
       than a column each — see the model. */
    adjustment: Joi.number().min(-PRODUCT_PRICE_MAX).max(PRODUCT_PRICE_MAX),
    adjustmentNote: Joi.string().trim().allow('', null).max(120),
    internalNote: Joi.string().trim().allow('', null).max(1000),
    customerName: Joi.string().trim().allow('', null).max(120),
    customerPhone: Joi.string().trim().allow('', null).max(30),
    customerAddress: Joi.string().trim().allow('', null).max(500),
  }).min(1),
};

/** Both analytics endpoints take the same window, from the same closed list. */
const analyticsQuery = {
  query: Joi.object({
    days: Joi.number()
      .integer()
      .valid(...ANALYTICS_RANGES),
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    warehouseId: id,
  }),
};

module.exports = {
  submit,
  listQuery: listQueryOrders,
  idParam: { params: idParam },
  statusUpdate,
  paymentUpdate,
  orderUpdate,
  analyticsQuery,
};
