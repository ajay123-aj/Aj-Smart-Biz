'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const {
  STATUS,
  PRODUCT_STOCK,
  STOCK_MOVEMENT_TYPE,
  STOCK_REASON,
  STOCK_QUANTITY_MAX,
} = require('../constants');

/**
 * Stock: the level, the ledger, and the one function that changes either.
 *
 * ### Everything goes through `applyMovement`
 *
 * There is exactly one function in this file that writes, and every other thing
 * the platform does to stock — receiving a delivery, dispatching an order,
 * correcting a count, moving a pallet between units — is a call to it with a
 * different `reason`. That is not tidiness. A running total and an append-only
 * ledger have to agree forever, and they can only be guaranteed to if there is a
 * single place that touches both, inside one transaction, every time.
 *
 * Which is also why **every function here takes a transaction and none of them
 * starts one.** Stock never moves on its own: it moves because an order was
 * confirmed, or dispatched, or cancelled, and the caller owns the boundary that
 * has to include both halves. A helper that opened its own transaction would
 * quietly commit a stock movement for an order that then failed to save.
 *
 * ### Reserved is not moved
 *
 * Confirming an order reserves; dispatching it issues. Only the second writes a
 * movement, because only the second is a thing that physically happened. A
 * reservation is an intention, it lives in a column on the level, and a ledger
 * that recorded intentions alongside facts would stop being a record of what
 * happened. See `company_stock`.
 */

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * The warehouse an order should be filled from when nobody has said.
 *
 * The branch's own unit first, then the company default, then anything active —
 * the same "yours, then the company's, then whatever there is" fallback the
 * sliders and every other branch-aware thing on the platform uses. `null` when a
 * tenant has the feature and has not set a warehouse up yet, which is an
 * ordinary state and not an error: the order is taken, and confirming it simply
 * reserves nothing.
 */
async function defaultWarehouse(companyId, branchId = null, options = {}) {
  const active = { companyId, status: STATUS.ACTIVE };

  if (branchId) {
    const own = await db.CompanyWarehouse.findOne({
      where: { ...active, branchId },
      order: [['isDefault', 'DESC'], ['sequence', 'ASC'], ['id', 'ASC']],
      ...options,
    });
    if (own) return own;
  }

  return db.CompanyWarehouse.findOne({
    where: active,
    order: [['isDefault', 'DESC'], ['sequence', 'ASC'], ['id', 'ASC']],
    ...options,
  });
}

/**
 * The level row for one (warehouse, product), created at zero if it has never
 * existed.
 *
 * `findOrCreate` rather than a read followed by a write: two people receiving
 * the same delivery at the same moment would otherwise both find nothing and
 * both insert, and the unique index would reject the loser with an error about a
 * constraint rather than a number.
 */
async function levelFor(companyId, warehouseId, productId, transaction) {
  const [row] = await db.CompanyStock.findOrCreate({
    where: { warehouseId, productId },
    defaults: { companyId, warehouseId, productId, quantity: 0, reserved: 0 },
    transaction,
  });
  return row;
}

/** What is on hand, promised, and genuinely sellable, for one tenant's products. */
async function availabilityFor(companyId, productIds = null, options = {}) {
  const where = { companyId };
  if (Array.isArray(productIds)) {
    if (!productIds.length) return new Map();
    where.productId = { [Op.in]: productIds };
  }

  const rows = await db.CompanyStock.findAll({
    where,
    attributes: ['productId', 'quantity', 'reserved'],
    ...options,
  });

  /**
   * Summed **across warehouses**, and that is the right answer for the question
   * the website asks. A visitor wants to know whether the business can supply
   * one, not which shelf it is on; a shop with the last one in its overflow unit
   * has one. Which unit fills the order is a decision made later, by a person or
   * by the default, and it is not the customer's problem.
   */
  const totals = new Map();
  rows.forEach((row) => {
    const current = totals.get(row.productId) ?? { onHand: 0, reserved: 0, available: 0 };
    current.onHand += row.quantity;
    current.reserved += row.reserved;
    current.available = current.onHand - current.reserved;
    totals.set(row.productId, current);
  });

  return totals;
}

/**
 * What a tracked product's availability should say, given the levels.
 *
 * Still one of the three `PRODUCT_STOCK` words rather than a number, which is
 * the platform's long-standing position and not an oversight: the website tells
 * a visitor whether to ring up, and a count it cannot keep true is worse there
 * than no count. What tracking changes is that the word is now *derived* instead
 * of remembered.
 *
 * `made_to_order` is left alone. A tenant that has said a thing is made when it
 * is ordered has said something about how it is supplied, not about how many are
 * on the shelf, and a stock level of zero is exactly what that product is
 * supposed to look like.
 */
function availabilityOf(product, totals) {
  if (!product.trackInventory) return product.stockStatus;
  if (product.stockStatus === PRODUCT_STOCK.MADE_TO_ORDER) return PRODUCT_STOCK.MADE_TO_ORDER;

  const found = totals?.get(product.id) ?? null;
  return found && found.available > 0 ? PRODUCT_STOCK.IN_STOCK : PRODUCT_STOCK.OUT_OF_STOCK;
}

/* ------------------------------------------------------------------ *
 * Writing — the one door
 * ------------------------------------------------------------------ */

/**
 * Move stock, and write down that it moved.
 *
 * The only function on the platform that changes a level. It updates the running
 * total and appends the ledger row in the same transaction, and it stamps the
 * resulting balance onto the movement so the ledger can be read without being
 * re-summed from the beginning.
 *
 * `adjust` carries `quantity` as the **counted total**, not a delta — because
 * that is what the person doing it has in their hand. The difference is worked
 * out here, which is the only place it can be worked out without a race.
 *
 * Refuses to take a level below zero. A shop cannot ship four of something it
 * has three of, and a negative on a shelf is a number that will never reconcile
 * against anything physical — better a refused dispatch somebody has to look at
 * than a count nobody can trust again.
 */
async function applyMovement(
  {
    companyId,
    warehouseId,
    productId,
    type,
    reason,
    quantity,
    unitCost = null,
    orderId = null,
    counterWarehouseId = null,
    reference = null,
    note = null,
    actorId = null,
  },
  transaction
) {
  const level = await levelFor(companyId, warehouseId, productId, transaction);

  const amount = Math.trunc(Number(quantity));
  if (!Number.isFinite(amount) || amount < 0) throw ApiError.badRequest('Quantity must be a whole number');

  /**
   * A receipt or an issue of **nothing** is not a movement.
   *
   * Refused rather than recorded, because a ledger row saying "received 0" is a
   * row somebody has to read and dismiss every time they scroll past it. A
   * *count* of zero is a different thing entirely and is allowed below — that
   * one says the shelf is empty, which is a fact.
   */
  if (type !== STOCK_MOVEMENT_TYPE.ADJUST && amount === 0) {
    throw ApiError.badRequest('Enter how many actually moved');
  }

  let delta;
  if (type === STOCK_MOVEMENT_TYPE.IN) delta = amount;
  else if (type === STOCK_MOVEMENT_TYPE.OUT) delta = -amount;
  else delta = amount - level.quantity; // `adjust` — see the note above

  const next = level.quantity + delta;

  if (next < 0) {
    throw ApiError.badRequest(
      `Not enough stock: ${level.quantity} on hand, ${amount} requested`
    );
  }
  if (next > STOCK_QUANTITY_MAX) throw ApiError.badRequest('That would put the stock level over the maximum');

  /**
   * A correction that lands under what is already promised to orders is
   * refused rather than clamped. Somebody has counted fewer than the shop has
   * sold, and the thing to do is tell them — silently reducing the reservation
   * would un-promise a box a customer is already waiting for, with no record of
   * it having happened.
   */
  if (next < level.reserved) {
    throw ApiError.badRequest(
      `That would leave ${next} on hand with ${level.reserved} already promised to orders. Release those orders first.`
    );
  }

  level.quantity = next;
  level.lastMovementAt = new Date();
  level.updatedBy = actorId;
  await level.save({ transaction });

  return db.CompanyStockMovement.create(
    {
      companyId,
      warehouseId,
      productId,
      type,
      reason,
      /**
       * Always positive; the type carries the direction. An `adjust` records the
       * **size of the correction**, which is what a reader of the ledger wants to
       * see — not the total that was counted.
       *
       * Which means a count that **agrees** with the ledger records zero, and
       * that is the right answer twice over: nothing moved, and the row is still
       * worth keeping because "we counted on Tuesday and it was right" is exactly
       * the evidence a stocktake exists to leave behind.
       *
       * There is deliberately no `|| amount` fallback here. It was a defensive
       * habit and it was wrong: the only case it ever caught was a zero delta,
       * where it replaced an honest nothing with the whole counted total and made
       * the ledger claim a change that never happened.
       */
      quantity: Math.abs(delta),
      balanceAfter: next,
      unitCost,
      orderId,
      counterWarehouseId,
      reference,
      note,
      createdBy: actorId,
    },
    { transaction }
  );
}

/**
 * Move stock between two of the tenant's own warehouses.
 *
 * Two movements, paired through `counterWarehouseId`, in one transaction —
 * because a transfer that recorded only one half would be a company that had
 * either lost stock or invented it. Out first, so a transfer of more than the
 * source holds fails before anything has been added anywhere.
 */
async function transfer(
  { companyId, fromWarehouseId, toWarehouseId, productId, quantity, note = null, actorId = null },
  transaction
) {
  if (fromWarehouseId === toWarehouseId) throw ApiError.badRequest('Pick two different warehouses');

  const out = await applyMovement(
    {
      companyId,
      warehouseId: fromWarehouseId,
      productId,
      type: STOCK_MOVEMENT_TYPE.OUT,
      reason: STOCK_REASON.TRANSFER,
      quantity,
      counterWarehouseId: toWarehouseId,
      note,
      actorId,
    },
    transaction
  );

  const incoming = await applyMovement(
    {
      companyId,
      warehouseId: toWarehouseId,
      productId,
      type: STOCK_MOVEMENT_TYPE.IN,
      reason: STOCK_REASON.TRANSFER,
      quantity,
      counterWarehouseId: fromWarehouseId,
      note,
      actorId,
    },
    transaction
  );

  return { out, in: incoming };
}

/* ------------------------------------------------------------------ *
 * What an order does to stock
 * ------------------------------------------------------------------ */

/**
 * The lines of an order that stock actually applies to.
 *
 * A line whose product has been deleted, or was never tracked, is not a line the
 * warehouse knows anything about — and an order can legitimately mix the two, so
 * this is a filter rather than a validation. A shop selling one tracked lamp and
 * one made-to-order table has one line to reserve.
 */
async function trackedLines(order, transaction) {
  const items = order.items ?? (await order.getItems({ transaction }));
  const productIds = items.map((item) => item.productId).filter(Boolean);
  if (!productIds.length) return [];

  const products = await db.CompanyProduct.findAll({
    where: { companyId: order.companyId, id: { [Op.in]: productIds }, trackInventory: true },
    attributes: ['id'],
    transaction,
  });

  const tracked = new Set(products.map((row) => row.id));
  return items.filter((item) => item.productId && tracked.has(item.productId));
}

/**
 * Promise this order's stock to it, without moving anything.
 *
 * Refuses the whole order rather than reserving what it can. A part-reserved
 * order is one somebody has to notice, and the person best placed to decide what
 * to do about a shortage is the one looking at the confirm button — not a
 * background rule that quietly under-promised and left the picking list wrong.
 *
 * Idempotent through the order's own `stockReserved` flag, checked by the
 * caller: a double-clicked Confirm must not promise the same box twice.
 */
async function reserveForOrder(order, transaction) {
  if (!order.warehouseId) return 0;

  const lines = await trackedLines(order, transaction);
  let reserved = 0;

  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const level = await levelFor(order.companyId, order.warehouseId, line.productId, transaction);
    const available = level.quantity - level.reserved;

    if (available < line.quantity) {
      throw ApiError.badRequest(
        `Not enough ${line.productName}: ${available} available, ${line.quantity} on the order`
      );
    }

    level.reserved += line.quantity;
    // eslint-disable-next-line no-await-in-loop
    await level.save({ transaction });
    reserved += line.quantity;
  }

  return reserved;
}

/** Give back what an order was holding. Used by cancel, and by dispatch. */
async function releaseForOrder(order, transaction) {
  if (!order.warehouseId) return 0;

  const lines = await trackedLines(order, transaction);
  let released = 0;

  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const level = await levelFor(order.companyId, order.warehouseId, line.productId, transaction);
    /* Never below zero. A reservation that has already been released by some
       other route is a no-op here rather than a negative promise. */
    const giveBack = Math.min(level.reserved, line.quantity);
    level.reserved -= giveBack;
    // eslint-disable-next-line no-await-in-loop
    await level.save({ transaction });
    released += giveBack;
  }

  return released;
}

/**
 * The order left the building: turn its reservation into a real movement.
 *
 * Release first, then take the stock off. Doing it the other way round would hit
 * the `next < level.reserved` guard in `applyMovement` — the order's own
 * reservation would be sitting there arguing that the shop cannot ship what it
 * has already promised to this very order.
 */
async function issueForOrder(order, transaction, actorId = null) {
  if (!order.warehouseId) return 0;

  if (order.stockReserved) await releaseForOrder(order, transaction);

  const lines = await trackedLines(order, transaction);
  let issued = 0;

  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    await applyMovement(
      {
        companyId: order.companyId,
        warehouseId: order.warehouseId,
        productId: line.productId,
        type: STOCK_MOVEMENT_TYPE.OUT,
        reason: STOCK_REASON.SALE,
        quantity: line.quantity,
        orderId: order.id,
        note: `Order ${order.orderNo}`,
        actorId,
      },
      transaction
    );
    issued += line.quantity;
  }

  return issued;
}

/**
 * An order that had already gone out is cancelled: put the stock back.
 *
 * A `return` movement rather than deleting the sale, for the reason this whole
 * table exists — the sale happened, and a ledger that can un-happen things is a
 * spreadsheet. Two rows, and the shelf is right.
 */
async function returnForOrder(order, transaction, actorId = null) {
  const lines = await trackedLines(order, transaction);
  let returned = 0;

  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    await applyMovement(
      {
        companyId: order.companyId,
        warehouseId: order.warehouseId,
        productId: line.productId,
        type: STOCK_MOVEMENT_TYPE.IN,
        reason: STOCK_REASON.RETURN,
        quantity: line.quantity,
        orderId: order.id,
        note: `Order ${order.orderNo} cancelled after dispatch`,
        actorId,
      },
      transaction
    );
    returned += line.quantity;
  }

  return returned;
}

module.exports = {
  defaultWarehouse,
  levelFor,
  availabilityFor,
  availabilityOf,
  applyMovement,
  transfer,
  trackedLines,
  reserveForOrder,
  releaseForOrder,
  issueForOrder,
  returnForOrder,
};
