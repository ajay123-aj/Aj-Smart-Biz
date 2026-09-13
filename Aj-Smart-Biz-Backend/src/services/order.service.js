'use strict';

const { Op, fn, col } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const stockService = require('./stock.service');
const {
  STATUS,
  PRODUCT_STOCK,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  ORDER_PAYMENT_STATUS,
  ORDER_PAYMENT_TRANSITIONS,
  ORDER_NO_PREFIX,
  ORDER_NO_PAD,
  ORDER_ITEMS_MAX,
  FUNCTIONALITY,
} = require('../constants');

/**
 * Taking an order, and moving it along.
 *
 * The rule this file exists to hold: **the price comes from the catalogue, never
 * from the request.** A cart posts product ids and quantities and nothing else
 * that matters; every figure on the resulting order is read off the tenant's own
 * products at the moment it is placed. A body that could name its own price is a
 * shop that can be bought from at a price the customer chose, and no amount of
 * validation elsewhere recovers from that.
 *
 * The second rule is the one the status machine holds: **stock and the order
 * move together or not at all.** Confirming reserves, dispatching issues,
 * cancelling gives back — each inside the transaction that changes the status,
 * so a shelf and an order list can never disagree about the same box.
 */

/* ------------------------------------------------------------------ *
 * The number on the order
 * ------------------------------------------------------------------ */

/**
 * `ORD-00001`, and the next one within this tenant.
 *
 * Counted from the tenant's own highest rather than from a sequence table, and
 * **deliberately not** from `COUNT(*)`: a deleted order would make the count
 * repeat a number that is already printed on somebody's invoice. Soft-deleted
 * rows are included in the search for the same reason.
 *
 * The race is real and it is handled by the unique index plus a retry in the
 * caller, not by locking: two orders arriving in the same millisecond is rare,
 * losing one to a deadlock on every order is not an acceptable price for it.
 */
async function nextOrderNo(companyId, transaction) {
  const latest = await db.CompanyOrder.findOne({
    where: { companyId },
    attributes: ['orderNo'],
    order: [['id', 'DESC']],
    paranoid: false,
    transaction,
  });

  const current = latest?.orderNo ? Number(String(latest.orderNo).replace(/\D/g, '')) : 0;
  const next = (Number.isFinite(current) ? current : 0) + 1;

  return `${ORDER_NO_PREFIX}-${String(next).padStart(ORDER_NO_PAD, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Placing one
 * ------------------------------------------------------------------ */

/**
 * The price a line is actually sold at, resolved in the catalogue's one true
 * order — the free-text label wins outright, then the offer price, then the
 * normal one. The same order `priceOf` uses on the website, so the number on the
 * order is the number the customer read on the card.
 */
function priceOfProduct(product) {
  if (product.priceLabel && String(product.priceLabel).trim()) {
    return { unitPrice: null, listPrice: null, priceLabel: String(product.priceLabel).trim() };
  }

  const price = product.price === null || product.price === undefined ? null : Number(product.price);
  const offer =
    product.offerPrice === null || product.offerPrice === undefined ? null : Number(product.offerPrice);

  const unitPrice = offer !== null && price !== null && offer < price ? offer : price;

  return {
    unitPrice,
    /* Only where it says something the unit price does not. */
    listPrice: unitPrice !== null && price !== null && unitPrice < price ? price : null,
    priceLabel: null,
  };
}

/**
 * Turn a cart into an order, with every figure taken from the catalogue.
 *
 * The lines arriving are `{ productId, quantity }` and nothing else is read off
 * them. Each product is loaded **scoped to this tenant** and checked for being
 * published and orderable, because a body naming another company's product id
 * would otherwise file that company's goods against this one's order.
 *
 * A line naming something that cannot be ordered is refused rather than dropped.
 * Silently shortening somebody's order is the one outcome worse than telling
 * them it cannot be placed: they find out when the box arrives.
 */
async function buildLines(companyId, lines, transaction) {
  if (!Array.isArray(lines) || !lines.length) throw ApiError.badRequest('The order has nothing in it');
  if (lines.length > ORDER_ITEMS_MAX) throw ApiError.badRequest('That is more lines than one order can carry');

  const wanted = new Map();
  lines.forEach((line) => {
    const id = Number(line.productId);
    const quantity = Math.trunc(Number(line.quantity) || 0);
    if (!Number.isInteger(id) || id <= 0 || quantity <= 0) return;
    /* The same product twice in one cart is one line with the quantities added,
       not two lines that a picker has to notice are the same thing. */
    wanted.set(id, (wanted.get(id) ?? 0) + quantity);
  });

  if (!wanted.size) throw ApiError.badRequest('The order has nothing in it');

  const products = await db.CompanyProduct.findAll({
    where: { companyId, id: { [Op.in]: [...wanted.keys()] }, status: STATUS.ACTIVE },
    transaction,
  });

  if (products.length !== wanted.size) {
    throw ApiError.badRequest('Something in your order is no longer available');
  }

  const items = [];
  let subtotal = 0;
  let itemCount = 0;
  let unpricedItems = 0;

  for (const product of products) {
    if (!product.orderable || product.stockStatus === PRODUCT_STOCK.OUT_OF_STOCK) {
      throw ApiError.badRequest(`${product.name} cannot be ordered at the moment`);
    }

    const quantity = wanted.get(product.id);
    const { unitPrice, listPrice, priceLabel } = priceOfProduct(product);
    const lineTotal = unitPrice === null ? null : Number((unitPrice * quantity).toFixed(2));

    if (lineTotal === null) unpricedItems += 1;
    else subtotal += lineTotal;

    itemCount += quantity;

    items.push({
      companyId,
      productId: product.id,
      /* Copied, never joined. An order is a historical fact — see the model. */
      productName: product.name,
      productSku: product.sku ?? null,
      productSlug: product.slug ?? null,
      quantity,
      unitPrice,
      listPrice,
      priceLabel,
      lineTotal,
    });
  }

  return { items, subtotal: Number(subtotal.toFixed(2)), itemCount, unpricedItems };
}

/**
 * Place an order, lines and all, in one transaction.
 *
 * It does **not** reserve stock. An order arrives as `pending` — nobody has
 * looked at it, and the shop has not agreed to supply anything yet. Reserving on
 * arrival would let a stranger empty a shelf by filling a cart, which is a
 * denial of service with a postcode attached. Stock is promised at `confirmed`,
 * by a person.
 */
async function placeOrder({ company, branchId, lines, customer, mode, account = null, meta = {} }, transaction) {
  const built = await buildLines(company.id, lines, transaction);

  const order = await db.CompanyOrder.create(
    {
      companyId: company.id,
      branchId: branchId ?? null,
      orderNo: await nextOrderNo(company.id, transaction),

      status: ORDER_STATUS.PENDING,
      paymentStatus: ORDER_PAYMENT_STATUS.UNPAID,
      mode: mode ?? null,

      /**
       * The account that placed it, where one was signed in. Null on a guest
       * order, which stays a first-class case — see the model.
       */
      customerId: account?.id ?? null,

      /**
       * Copied **even when there is an account**, and that is the point. These
       * are what the order *was*: a customer who later changes their name or
       * moves house has not changed what was delivered where, and an order screen
       * that resolved them through a join would quietly start saying otherwise.
       *
       * The account fills in whatever the form left blank, so a signed-in
       * customer does not retype what the shop already knows.
       */
      customerName: customer.name || account?.name || null,
      customerPhone: customer.phone || account?.phone || null,
      customerAddress: customer.address || null,
      customerNote: customer.note || null,

      itemCount: built.itemCount,
      unpricedItems: built.unpricedItems,
      subtotal: built.subtotal,
      adjustment: 0,
      total: built.subtotal,
      currency: company.currency || 'INR',

      /* Not fields a body may carry. */
      sentToWhatsapp: Boolean(meta.sentToWhatsapp),
      sourceUrl: meta.sourceUrl || null,
      submittedIp: meta.ip || null,
      createdBy: null,
    },
    { transaction }
  );

  await db.CompanyOrderItem.bulkCreate(
    built.items.map((item) => ({ ...item, orderId: order.id })),
    { transaction }
  );

  order.items = built.items;
  return order;
}

/* ------------------------------------------------------------------ *
 * Moving it along
 * ------------------------------------------------------------------ */

/** Whether a move is one the machine allows, said in the console's words. */
function assertTransition(from, to) {
  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      allowed.length
        ? `An order that is ${from} can only move to ${allowed.join(' or ')}`
        : `An order that is ${from} has finished — nothing can change it now`
    );
  }
}

/** Whether the tenant has the warehouse feature live right now. */
async function warehouseLive(companyId) {
  const functionalityService = require('./functionality.service');
  const { activeKeys } = await functionalityService.getFunctionalities(companyId);
  return activeKeys.includes(FUNCTIONALITY.WAREHOUSE);
}

/**
 * Move an order to its next status, and do to stock whatever that step means.
 *
 * One function for every move, and the stock side effects hang off the
 * destination rather than being the caller's job — which is what stops a route
 * added later from advancing an order and forgetting the shelf.
 *
 *   confirmed   reserve. Refuses the whole order if the stock is not there.
 *   dispatched  issue: release the reservation, write the movement.
 *   cancelled   give back — a release before dispatch, a return after it.
 *
 * Everything happens inside the transaction the caller passes, so a reservation
 * that fails leaves the order exactly where it was.
 */
async function moveStatus(order, to, { actorId = null, reason = null, transaction }) {
  assertTransition(order.status, to);

  const tracking = await warehouseLive(order.companyId);
  const now = new Date();

  if (to === ORDER_STATUS.CONFIRMED) {
    /* Nobody chose a warehouse, so the platform picks the one the order would
       obviously come from. Still null on a tenant with the feature and no units
       set up, and confirming then reserves nothing — which is correct, not a
       failure: the order is real whether or not anyone is counting. */
    if (tracking && !order.warehouseId) {
      const warehouse = await stockService.defaultWarehouse(order.companyId, order.branchId, { transaction });
      order.warehouseId = warehouse?.id ?? null;
    }

    if (tracking && order.warehouseId && !order.stockReserved) {
      await stockService.reserveForOrder(order, transaction);
      order.stockReserved = true;
    }

    order.confirmedAt = now;
  }

  if (to === ORDER_STATUS.PACKED) order.packedAt = now;

  if (to === ORDER_STATUS.DISPATCHED) {
    if (tracking && order.warehouseId && !order.stockIssued) {
      await stockService.issueForOrder(order, transaction, actorId);
      order.stockReserved = false;
      order.stockIssued = true;
    }
    order.dispatchedAt = now;
  }

  if (to === ORDER_STATUS.DELIVERED) order.deliveredAt = now;

  if (to === ORDER_STATUS.CANCELLED) {
    if (tracking && order.warehouseId) {
      /* Two different situations, and telling them apart is the whole of it: a
         reservation is given back by dropping it, and stock that has already
         left has to come back as a movement — the sale happened, and a ledger
         that can un-happen things is a spreadsheet. */
      if (order.stockIssued) {
        await stockService.returnForOrder(order, transaction, actorId);
        order.stockIssued = false;
      } else if (order.stockReserved) {
        await stockService.releaseForOrder(order, transaction);
        order.stockReserved = false;
      }
    }
    order.cancelReason = reason || order.cancelReason;
    order.cancelledAt = now;
  }

  order.status = to;
  order.updatedBy = actorId;
  await order.save({ transaction });

  return order;
}

/** The payment axis, which moves on its own. See `ORDER_PAYMENT_TRANSITIONS`. */
function assertPaymentTransition(from, to) {
  const allowed = ORDER_PAYMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      allowed.length
        ? `Payment that is ${from} can only move to ${allowed.join(' or ')}`
        : `Payment that is ${from} cannot be changed`
    );
  }
}

/**
 * Re-total an order after somebody has edited it by hand.
 *
 * `subtotal` is always the sum of the lines and is never typed; `adjustment` is
 * the one figure a person sets, and `total` is derived from the pair. Doing the
 * arithmetic here rather than in a controller is what stops an order screen and
 * a sales report from disagreeing about the same order.
 */
async function retotal(order, transaction) {
  const rows = await db.CompanyOrderItem.findAll({
    where: { orderId: order.id },
    attributes: [
      [fn('COALESCE', fn('SUM', col('line_total')), 0), 'subtotal'],
      [fn('COALESCE', fn('SUM', col('quantity')), 0), 'itemCount'],
    ],
    raw: true,
    transaction,
  });

  const unpriced = await db.CompanyOrderItem.count({
    where: { orderId: order.id, lineTotal: null },
    transaction,
  });

  const subtotal = Number(rows[0]?.subtotal || 0);
  order.subtotal = subtotal;
  order.itemCount = Number(rows[0]?.itemCount || 0);
  order.unpricedItems = unpriced;
  order.total = Number((subtotal + Number(order.adjustment || 0)).toFixed(2));

  await order.save({ transaction });
  return order;
}

/**
 * One order as a client reads it — the row, its lines, and the moves it may
 * still make.
 *
 * `nextStatuses` is sent rather than derived in the browser for the reason the
 * functionality switches are: a console that worked out its own buttons would
 * eventually offer one the API refuses, and the person pressing it would be told
 * off for something the screen invited them to do.
 */
function publicOrder(order) {
  const plain = typeof order.toJSON === 'function' ? order.toJSON() : order;

  return {
    ...plain,
    subtotal: Number(plain.subtotal ?? 0),
    adjustment: Number(plain.adjustment ?? 0),
    total: Number(plain.total ?? 0),
    items: (plain.items ?? []).map((item) => ({
      ...item,
      unitPrice: item.unitPrice === null || item.unitPrice === undefined ? null : Number(item.unitPrice),
      listPrice: item.listPrice === null || item.listPrice === undefined ? null : Number(item.listPrice),
      lineTotal: item.lineTotal === null || item.lineTotal === undefined ? null : Number(item.lineTotal),
    })),
    nextStatuses: ORDER_TRANSITIONS[plain.status] ?? [],
    nextPaymentStatuses: ORDER_PAYMENT_TRANSITIONS[plain.paymentStatus] ?? [],
  };
}

module.exports = {
  nextOrderNo,
  priceOfProduct,
  buildLines,
  placeOrder,
  assertTransition,
  assertPaymentTransition,
  moveStatus,
  retotal,
  publicOrder,
};
