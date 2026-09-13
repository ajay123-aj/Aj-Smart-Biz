'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const orderService = require('../services/order.service');
const analyticsService = require('../services/analytics.service');
const {
  AUTH_SCOPE,
  ORDER_STATUS,
  ORDER_STATUS_CATALOGUE,
  ORDER_PAYMENT_STATUS_CATALOGUE,
  OPEN_ORDER_STATUSES,
} = require('../constants');

/**
 * The tenant's order book.
 *
 * Every query is pinned to one company the way the rest of this module does it:
 * a company admin's token names their tenant, so `:companyId` is ignored for
 * them and cross-tenant access is impossible by construction.
 *
 * **There is no create here.** The only writer is the public website — see
 * `submitOrder` — and a console route that could manufacture orders would make
 * this list a place where "somebody bought this" and "somebody typed this in"
 * are indistinguishable, which is exactly what a sales report must never be.
 * The same reasoning keeps the lines read-only: an order records what was bought
 * at what price, and a console that could rewrite that would turn every revenue
 * figure into an opinion.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const actorOf = (req) => (req.auth?.scope === AUTH_SCOPE.ADMIN ? req.auth.id ?? null : null);

const BRANCH_INCLUDE = {
  model: db.Branch,
  as: 'branch',
  attributes: ['id', 'name', 'code'],
  required: false,
};

const WAREHOUSE_INCLUDE = {
  model: db.CompanyWarehouse,
  as: 'warehouse',
  attributes: ['id', 'name', 'code'],
  required: false,
  /* The unit may have been closed and deleted since; the order still knows
     where it was going to be filled from. */
  paranoid: false,
};

const ITEMS_INCLUDE = {
  model: db.CompanyOrderItem,
  as: 'items',
  required: false,
  separate: true,
  order: [['id', 'ASC']],
};

/** One order of this tenant's, or a 404 that says nothing about other tenants'. */
async function findOrder(companyId, id, { withItems = true } = {}) {
  const order = await db.CompanyOrder.findOne({
    where: { id, companyId },
    include: [BRANCH_INCLUDE, WAREHOUSE_INCLUDE, ...(withItems ? [ITEMS_INCLUDE] : [])],
  });
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * GET /my-company/orders
 *
 * One page of orders, plus the counts the screen is built around.
 *
 * The counts are the API's, not a tally of the page: a browser that counted what
 * it had been sent would report the size of the current filter, and would show
 * zero waiting on the very tab somebody opened to find out. They are also
 * **unwindowed** — an order still open from five weeks ago is the one that
 * matters most, and a count that dropped it because of a date filter would be
 * the opposite of useful.
 *
 * Newest first. This is a queue; `sequence` means nothing to a row nobody placed
 * anywhere.
 */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };

  if (req.query.branchId === 'none' || req.query.branchId === 'null') scope.branchId = null;
  else if (req.query.branchId) scope.branchId = Number(req.query.branchId);

  if (req.query.warehouseId === 'none' || req.query.warehouseId === 'null') scope.warehouseId = null;
  else if (req.query.warehouseId) scope.warehouseId = Number(req.query.warehouseId);

  if (req.query.status) scope.status = req.query.status;
  /* `open` and an explicit status are not combined — a person who asked for
     "dispatched" meant dispatched, and silently intersecting the two would show
     them a filter they did not choose. */
  else if (req.query.open === true || req.query.open === 'true') scope.status = { [Op.in]: OPEN_ORDER_STATUSES };

  if (req.query.paymentStatus) scope.paymentStatus = req.query.paymentStatus;

  if (req.query.from || req.query.to) {
    scope.createdAt = {
      ...(req.query.from ? { [Op.gte]: new Date(req.query.from) } : {}),
      /* `to` is a day, and a day the person means to include. Without this an
         order placed at two in the afternoon falls outside a range ending on
         its own date, which reads as data loss. */
      ...(req.query.to ? { [Op.lte]: new Date(new Date(req.query.to).setHours(23, 59, 59, 999)) } : {}),
    };
  }

  const where = mergeWhere(
    scope,
    buildSearch(req.query.search, ['order_no', 'customer_name', 'customer_phone'])
  );

  const result = await db.CompanyOrder.findAndCountAll({
    where,
    include: [BRANCH_INCLUDE, WAREHOUSE_INCLUDE],
    order: getSort(req.query, ['created_at', 'total', 'order_no'], [['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(
    res,
    { rows: result.rows.map(orderService.publicOrder), count: result.count },
    { page, limit },
    'Orders fetched successfully'
  );
});

/**
 * GET /my-company/orders/summary
 *
 * The strip above the list: what is waiting, what is owed, what came in today.
 * Its own endpoint rather than a field on the list, so it does not change when
 * somebody filters.
 */
const summary = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counts = await db.CompanyOrder.findAll({
    where: { companyId },
    attributes: ['status', [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'total']],
    group: ['status'],
    raw: true,
  });

  const byStatus = Object.fromEntries(ORDER_STATUS_CATALOGUE.map((entry) => [entry.key, 0]));
  counts.forEach((row) => {
    byStatus[row.status] = Number(row.total || 0);
  });

  const [todayCount, unpaid] = await Promise.all([
    db.CompanyOrder.count({ where: { companyId, createdAt: { [Op.gte]: today } } }),
    db.CompanyOrder.findOne({
      where: {
        companyId,
        paymentStatus: 'unpaid',
        status: { [Op.ne]: ORDER_STATUS.CANCELLED },
      },
      attributes: [
        [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'orders'],
        [db.Sequelize.fn('COALESCE', db.Sequelize.fn('SUM', db.Sequelize.col('total')), 0), 'amount'],
      ],
      raw: true,
    }),
  ]);

  return success(res, {
    message: 'Order summary fetched successfully',
    data: {
      byStatus,
      open: OPEN_ORDER_STATUSES.reduce((total, key) => total + (byStatus[key] ?? 0), 0),
      today: todayCount,
      unpaid: { orders: Number(unpaid?.orders || 0), amount: Number(unpaid?.amount || 0) },
      statuses: ORDER_STATUS_CATALOGUE,
      paymentStatuses: ORDER_PAYMENT_STATUS_CATALOGUE,
    },
  });
});

/** GET /my-company/orders/:id — the order, its lines, and the moves it may make. */
const getById = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const order = await findOrder(companyId, Number(req.params.id));

  return success(res, {
    message: 'Order fetched successfully',
    data: orderService.publicOrder(order),
  });
});

/* ------------------------------------------------------------------ *
 * Moving it along
 * ------------------------------------------------------------------ */

/**
 * PATCH /my-company/orders/:id/status
 *
 * The whole move — the transition check, the timestamps and whatever it means
 * for stock — happens inside one transaction in `moveStatus`. A reservation that
 * cannot be met leaves the order exactly where it was, which is the only
 * behaviour that keeps a shelf and an order list telling the same story.
 */
const updateStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const order = await db.sequelize.transaction(async (transaction) => {
    const row = await db.CompanyOrder.findOne({
      where: { id: Number(req.params.id), companyId },
      include: [ITEMS_INCLUDE],
      transaction,
      /* Locked for the duration: two people pressing Dispatch at the same
         moment must not both issue the same stock. The `stockIssued` flag is
         the other half of that guard. */
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw ApiError.notFound('Order not found');

    return orderService.moveStatus(row, req.body.status, {
      actorId: actorOf(req),
      reason: req.body.reason,
      transaction,
    });
  });

  const fresh = await findOrder(companyId, order.id);

  return success(res, {
    message: `Order ${fresh.orderNo} is now ${fresh.status}`,
    data: orderService.publicOrder(fresh),
  });
});

/** PATCH /my-company/orders/:id/payment — the other axis. See the model. */
const updatePayment = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const order = await findOrder(companyId, Number(req.params.id), { withItems: false });

  orderService.assertPaymentTransition(order.paymentStatus, req.body.paymentStatus);

  order.paymentStatus = req.body.paymentStatus;
  if (req.body.reference !== undefined) order.paymentReference = req.body.reference || null;
  order.updatedBy = actorOf(req);
  await order.save();

  const fresh = await findOrder(companyId, order.id);

  return success(res, {
    message: `Payment marked ${fresh.paymentStatus}`,
    data: orderService.publicOrder(fresh),
  });
});

/**
 * PUT /my-company/orders/:id
 *
 * The few things a person may legitimately change after the fact — where it is
 * being filled from, what was agreed on the phone, the shop's own notes. The
 * lines are not among them; see the note at the top of this file.
 *
 * Re-assigning the warehouse is refused once stock has moved. The reservation or
 * the issue is against a specific shelf, and pointing the order somewhere else
 * afterwards would leave the first unit short by exactly the amount nobody would
 * notice until they counted.
 */
const update = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const order = await db.sequelize.transaction(async (transaction) => {
    const row = await db.CompanyOrder.findOne({
      where: { id: Number(req.params.id), companyId },
      transaction,
    });
    if (!row) throw ApiError.notFound('Order not found');

    if (req.body.warehouseId !== undefined) {
      if (row.stockReserved || row.stockIssued) {
        throw ApiError.badRequest(
          'This order already holds stock in its warehouse. Cancel it and re-enter it to fill it from somewhere else.'
        );
      }

      if (req.body.warehouseId !== null) {
        const warehouse = await db.CompanyWarehouse.findOne({
          where: { id: req.body.warehouseId, companyId },
          transaction,
        });
        if (!warehouse) throw ApiError.badRequest('That warehouse is not one of yours');
      }

      row.warehouseId = req.body.warehouseId;
    }

    ['adjustmentNote', 'internalNote', 'customerName', 'customerPhone', 'customerAddress'].forEach(
      (field) => {
        if (req.body[field] !== undefined) row[field] = req.body[field] || null;
      }
    );

    if (req.body.adjustment !== undefined) row.adjustment = req.body.adjustment;

    row.updatedBy = actorOf(req);
    await row.save({ transaction });

    /* The total is derived from the lines and the adjustment, never typed, so
       it is recomputed here rather than trusted from anywhere. */
    await orderService.retotal(row, transaction);
    return row;
  });

  const fresh = await findOrder(companyId, order.id);

  return success(res, {
    message: 'Order updated successfully',
    data: orderService.publicOrder(fresh),
  });
});

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

/** GET /my-company/orders/analytics — how the shop is trading. */
const analytics = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  return success(res, {
    message: 'Sales analytics fetched successfully',
    data: await analyticsService.salesAnalytics(companyId, {
      days: req.query.days,
      branchId: req.query.branchId,
    }),
  });
});

module.exports = { list, summary, getById, updateStatus, updatePayment, update, analytics };
