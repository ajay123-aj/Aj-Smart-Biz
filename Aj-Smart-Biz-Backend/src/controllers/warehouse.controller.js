'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const stockService = require('../services/stock.service');
const analyticsService = require('../services/analytics.service');
const {
  AUTH_SCOPE,
  STATUS,
  STOCK_MOVEMENT_TYPE,
  STOCK_REASON,
  STOCK_REASON_CATALOGUE,
  STOCK_MANUAL_REASONS,
} = require('../constants');

/**
 * Warehouses, what is in them, and everything that has moved.
 *
 * Pinned to one company the way the rest of this module is: a company admin's
 * token names their tenant, so `:companyId` is ignored for them and cross-tenant
 * access is impossible by construction.
 *
 * **Every write in here goes through `stock.service`.** There is no route that
 * sets a quantity directly — the closest thing is a `correction` movement, which
 * records that a count disagreed rather than quietly replacing the number. That
 * is the whole difference between a stock system and a cell in a spreadsheet,
 * and it is worth the extra endpoint.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const actorOf = (req) => (req.auth?.scope === AUTH_SCOPE.ADMIN ? req.auth.id ?? null : null);

/** One of this tenant's warehouses, or a 404 that says nothing about anyone else's. */
async function findWarehouse(companyId, id, transaction) {
  const row = await db.CompanyWarehouse.findOne({ where: { id, companyId }, transaction });
  if (!row) throw ApiError.notFound('Warehouse not found');
  return row;
}

/** Refuses a product that is not this tenant's — the check every write shares. */
async function assertProduct(companyId, productId, transaction) {
  const product = await db.CompanyProduct.findOne({
    where: { id: productId, companyId },
    attributes: ['id', 'name'],
    transaction,
  });
  if (!product) throw ApiError.badRequest('That product is not one of yours');
  return product;
}

/* ------------------------------------------------------------------ *
 * Warehouses
 * ------------------------------------------------------------------ */

const listWarehouses = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };
  if (req.query.branchId === 'none' || req.query.branchId === 'null') scope.branchId = null;
  else if (req.query.branchId) scope.branchId = Number(req.query.branchId);
  if (req.query.status) scope.status = req.query.status;

  const where = mergeWhere(scope, buildSearch(req.query.search, ['name', 'code', 'city']));

  const result = await db.CompanyWarehouse.findAndCountAll({
    where,
    include: [
      { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false },
      { model: db.State, as: 'state', attributes: ['id', 'name'], required: false },
    ],
    order: getSort(req.query, ['name', 'code', 'sequence', 'created_at'], [
      ['isDefault', 'DESC'],
      ['sequence', 'ASC'],
      ['id', 'ASC'],
    ]),
    limit,
    offset,
    distinct: true,
  });

  /**
   * How much is in each, alongside the row.
   *
   * One grouped query for the whole page rather than a count per warehouse: the
   * list is the screen where somebody decides which unit to open, and a list of
   * names with no quantities on it does not help them decide.
   */
  const totals = await db.CompanyStock.findAll({
    where: { companyId },
    attributes: [
      'warehouseId',
      [db.Sequelize.fn('COALESCE', db.Sequelize.fn('SUM', db.Sequelize.col('quantity')), 0), 'onHand'],
      [db.Sequelize.fn('COALESCE', db.Sequelize.fn('SUM', db.Sequelize.col('reserved')), 0), 'reserved'],
      [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'lines'],
    ],
    group: ['warehouse_id'],
    raw: true,
  });

  const byWarehouse = new Map(totals.map((row) => [row.warehouseId, row]));

  const rows = result.rows.map((row) => {
    const found = byWarehouse.get(row.id);
    return {
      ...row.toJSON(),
      stock: {
        onHand: Number(found?.onHand || 0),
        reserved: Number(found?.reserved || 0),
        available: Number(found?.onHand || 0) - Number(found?.reserved || 0),
        lines: Number(found?.lines || 0),
      },
    };
  });

  return paginated(res, { rows, count: result.count }, { page, limit }, 'Warehouses fetched successfully');
});

/**
 * POST /my-company/warehouses
 *
 * The first warehouse a company creates becomes its default whether it asked or
 * not — confirming an order has to reserve stock somewhere, and a company with
 * one unit should never have to answer a question with one answer.
 */
const createWarehouse = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const actorId = actorOf(req);

  const row = await db.sequelize.transaction(async (transaction) => {
    const clash = await db.CompanyWarehouse.findOne({
      where: { companyId, code: req.body.code },
      transaction,
    });
    if (clash) throw ApiError.badRequest(`You already have a warehouse with the code ${req.body.code}`);

    if (req.body.branchId) {
      const branch = await db.Branch.findOne({
        where: { id: req.body.branchId, companyId },
        transaction,
      });
      if (!branch) throw ApiError.badRequest('That branch is not one of yours');
    }

    const existing = await db.CompanyWarehouse.count({ where: { companyId }, transaction });
    const isDefault = req.body.isDefault === true || existing === 0;

    /* Exactly one default per company, held here rather than by a constraint —
       a partial unique index is not portable across the three dialects this
       runs on, and the invariant is one line either way. */
    if (isDefault && existing) {
      await db.CompanyWarehouse.update(
        { isDefault: false },
        { where: { companyId, isDefault: true }, transaction }
      );
    }

    return db.CompanyWarehouse.create(
      { ...req.body, companyId, isDefault, createdBy: actorId },
      { transaction }
    );
  });

  return created(res, 'Warehouse created successfully', row);
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const actorId = actorOf(req);

  const row = await db.sequelize.transaction(async (transaction) => {
    const warehouse = await findWarehouse(companyId, Number(req.params.id), transaction);

    if (req.body.code && req.body.code !== warehouse.code) {
      const clash = await db.CompanyWarehouse.findOne({
        where: { companyId, code: req.body.code, id: { [Op.ne]: warehouse.id } },
        transaction,
      });
      if (clash) throw ApiError.badRequest(`You already have a warehouse with the code ${req.body.code}`);
    }

    if (req.body.branchId) {
      const branch = await db.Branch.findOne({ where: { id: req.body.branchId, companyId }, transaction });
      if (!branch) throw ApiError.badRequest('That branch is not one of yours');
    }

    if (req.body.isDefault === true) {
      await db.CompanyWarehouse.update(
        { isDefault: false },
        { where: { companyId, isDefault: true }, transaction }
      );
    }

    /**
     * Switching a unit off means *stop sending things here*, not *forget what is
     * in it*. It keeps its stock and its ledger, because a unit being wound down
     * still has things on its shelves and the count has to stay right until they
     * have been moved out. What it loses is being pickable, which is what the
     * `status: active` filter on every picker already does.
     */
    await warehouse.update({ ...req.body, updatedBy: actorId }, { transaction });
    return warehouse;
  });

  return success(res, { message: 'Warehouse updated successfully', data: row });
});

/**
 * DELETE /my-company/warehouses/:id
 *
 * Refused while anything is still in it, and refused while an open order is
 * pointed at it. Both are recoverable states a person can fix in a minute, and
 * both would otherwise become a stock level nobody can see and an order nobody
 * can fill — the two failures that are invisible until somebody goes looking for
 * a box.
 */
const removeWarehouse = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const warehouse = await findWarehouse(companyId, Number(req.params.id));

  const held = await db.CompanyStock.sum('quantity', { where: { warehouseId: warehouse.id } });
  if (Number(held || 0) > 0) {
    throw ApiError.badRequest(
      `${warehouse.name} still holds ${held} items. Move them out or write them off first.`
    );
  }

  const openOrders = await db.CompanyOrder.count({
    where: {
      companyId,
      warehouseId: warehouse.id,
      status: { [Op.notIn]: ['delivered', 'cancelled'] },
    },
  });
  if (openOrders) {
    throw ApiError.badRequest(
      `${openOrders} open order(s) are being filled from here. Re-assign them first.`
    );
  }

  await warehouse.destroy();

  /* The company must not be left with warehouses and no default: the next order
     confirmed would have nowhere obvious to go. */
  if (warehouse.isDefault) {
    const next = await db.CompanyWarehouse.findOne({
      where: { companyId, status: STATUS.ACTIVE },
      order: [['sequence', 'ASC'], ['id', 'ASC']],
    });
    if (next) await next.update({ isDefault: true });
  }

  return success(res, { message: 'Warehouse deleted successfully', data: { id: warehouse.id } });
});

/* ------------------------------------------------------------------ *
 * Stock levels
 * ------------------------------------------------------------------ */

/**
 * GET /my-company/stock
 *
 * What is on the shelves, one page at a time, across every unit or within one.
 *
 * `low` and `out` are resolved **here** rather than in the browser, because they
 * are the two questions the screen exists to answer and a browser filtering a
 * page would be filtering a page — the product that ran out is on page four.
 * `available` is the comparison in both cases, not `quantity`: a box that is
 * physically present and already promised to a confirmed order is not one
 * anybody else can have.
 */
const listStock = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };
  if (req.query.warehouseId) scope.warehouseId = Number(req.query.warehouseId);
  if (req.query.productId) scope.productId = Number(req.query.productId);

  /* Unqualified on purpose: no other table in this query carries either
     column, so it is unambiguous everywhere and does not need the identifier
     quoting that differs between the three dialects this runs on. */
  const available = db.Sequelize.literal('quantity - reserved');

  const clauses = [scope];
  if (req.query.out === true || req.query.out === 'true') {
    clauses.push(db.Sequelize.where(available, { [Op.lte]: 0 }));
  } else if (req.query.low === true || req.query.low === 'true') {
    /* Low means "at or under the level somebody set", and a level of zero means
       "do not warn me" — so a product with no level set is never low, however
       few of it there are. */
    clauses.push(db.Sequelize.where(available, { [Op.gt]: 0 }));
    clauses.push({ reorderLevel: { [Op.gt]: 0 } });
    clauses.push(db.Sequelize.where(available, { [Op.lte]: db.Sequelize.literal('reorder_level') }));
  }

  const result = await db.CompanyStock.findAndCountAll({
    where: { [Op.and]: clauses },
    include: [
      {
        model: db.CompanyProduct,
        as: 'product',
        attributes: ['id', 'name', 'sku', 'slug', 'price', 'offerPrice', 'trackInventory', 'status', 'categoryId'],
        required: true,
        /* One `where`, not two spreads — a second would silently replace the
           first and drop whichever filter was written higher up. */
        where: mergeWhere(
          req.query.categoryId ? { categoryId: Number(req.query.categoryId) } : null,
          buildSearch(req.query.search, ['name', 'sku'])
        ),
      },
      { model: db.CompanyWarehouse, as: 'warehouse', attributes: ['id', 'name', 'code'], required: false },
    ],
    order: getSort(req.query, ['quantity', 'reserved', 'last_movement_at'], [['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  const rows = result.rows.map((row) => {
    const plain = row.toJSON();
    return {
      ...plain,
      available: plain.quantity - plain.reserved,
      /* Said by the API so the console, the reports and any future theme all
         agree about what "low" means. */
      isLow: plain.reorderLevel > 0 && plain.quantity - plain.reserved <= plain.reorderLevel,
      isOut: plain.quantity - plain.reserved <= 0,
    };
  });

  return paginated(res, { rows, count: result.count }, { page, limit }, 'Stock fetched successfully');
});

/**
 * PUT /my-company/stock/settings
 *
 * Where a product is kept and when to warn about it. **Not a movement** —
 * neither of these changes how many there are, and recording them in the ledger
 * would put rows in it that did not move any stock.
 */
const updateStockSettings = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const actorId = actorOf(req);

  const row = await db.sequelize.transaction(async (transaction) => {
    await findWarehouse(companyId, req.body.warehouseId, transaction);
    await assertProduct(companyId, req.body.productId, transaction);

    const level = await stockService.levelFor(
      companyId,
      req.body.warehouseId,
      req.body.productId,
      transaction
    );

    if (req.body.reorderLevel !== undefined) level.reorderLevel = req.body.reorderLevel;
    if (req.body.binLocation !== undefined) level.binLocation = req.body.binLocation || null;
    level.updatedBy = actorId;

    await level.save({ transaction });
    return level;
  });

  return success(res, { message: 'Stock settings saved', data: row });
});

/* ------------------------------------------------------------------ *
 * Movements
 * ------------------------------------------------------------------ */

/** Which way a reason moves stock. See `STOCK_REASON_CATALOGUE`. */
const DIRECTION = new Map(STOCK_REASON_CATALOGUE.map((entry) => [entry.key, entry.direction]));

/**
 * POST /my-company/stock/movements
 *
 * One movement, typed in by a person.
 *
 * **The direction comes from the reason**, not from the body: a receipt goes in,
 * damage goes out, a stock count is an adjustment. Asking for both is asking
 * somebody to contradict themselves, and a ledger holding a receipt that
 * decremented the shelf is a ledger nobody can reconcile.
 *
 * `quantity` therefore means two different things, which is the one genuinely
 * confusing thing about stock control: on a receipt it is *how many arrived*,
 * and on a stock count it is *how many there are now*. The service works out the
 * delta, which is the only place it can be done without a race.
 */
const createMovement = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const actorId = actorOf(req);

  if (!STOCK_MANUAL_REASONS.includes(req.body.reason)) {
    throw ApiError.badRequest('That reason is written by the platform, not by hand');
  }

  const movement = await db.sequelize.transaction(async (transaction) => {
    const warehouse = await findWarehouse(companyId, req.body.warehouseId, transaction);
    if (warehouse.status !== STATUS.ACTIVE) {
      throw ApiError.badRequest(`${warehouse.name} is switched off, so nothing can be booked into it`);
    }
    await assertProduct(companyId, req.body.productId, transaction);

    const direction = DIRECTION.get(req.body.reason);

    return stockService.applyMovement(
      {
        companyId,
        warehouseId: req.body.warehouseId,
        productId: req.body.productId,
        /* A reason with no fixed direction is a stock count, and a stock count
           is an adjustment by definition. */
        type: direction ?? STOCK_MOVEMENT_TYPE.ADJUST,
        reason: req.body.reason,
        quantity: req.body.quantity,
        unitCost: req.body.unitCost ?? null,
        reference: req.body.reference || null,
        note: req.body.note || null,
        actorId,
      },
      transaction
    );
  });

  return created(res, 'Stock movement recorded', movement);
});

/** POST /my-company/stock/transfer — two movements, one call, one transaction. */
const createTransfer = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const actorId = actorOf(req);

  const result = await db.sequelize.transaction(async (transaction) => {
    const from = await findWarehouse(companyId, req.body.fromWarehouseId, transaction);
    const to = await findWarehouse(companyId, req.body.toWarehouseId, transaction);
    if (to.status !== STATUS.ACTIVE) {
      throw ApiError.badRequest(`${to.name} is switched off, so nothing can be moved into it`);
    }
    await assertProduct(companyId, req.body.productId, transaction);

    return stockService.transfer(
      {
        companyId,
        fromWarehouseId: from.id,
        toWarehouseId: to.id,
        productId: req.body.productId,
        quantity: req.body.quantity,
        note: req.body.note || null,
        actorId,
      },
      transaction
    );
  });

  return created(res, 'Stock transferred', result);
});

/**
 * GET /my-company/stock/movements
 *
 * The ledger. Newest first, because the question is almost always "what happened
 * to this recently" — and there is no update or delete route to go with it, by
 * design. See the model.
 */
const listMovements = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };
  if (req.query.warehouseId) scope.warehouseId = Number(req.query.warehouseId);
  if (req.query.productId) scope.productId = Number(req.query.productId);
  if (req.query.orderId) scope.orderId = Number(req.query.orderId);
  if (req.query.reason) scope.reason = req.query.reason;

  if (req.query.from || req.query.to) {
    scope.createdAt = {
      ...(req.query.from ? { [Op.gte]: new Date(req.query.from) } : {}),
      ...(req.query.to ? { [Op.lte]: new Date(new Date(req.query.to).setHours(23, 59, 59, 999)) } : {}),
    };
  }

  const result = await db.CompanyStockMovement.findAndCountAll({
    where: scope,
    include: [
      {
        model: db.CompanyProduct,
        as: 'product',
        attributes: ['id', 'name', 'sku'],
        required: false,
        /* The product may have been deleted since; the movement still happened
           and still has to be readable. */
        paranoid: false,
      },
      { model: db.CompanyWarehouse, as: 'warehouse', attributes: ['id', 'name', 'code'], required: false, paranoid: false },
      { model: db.CompanyOrder, as: 'order', attributes: ['id', 'orderNo'], required: false, paranoid: false },
    ],
    order: [['id', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Stock movements fetched successfully');
});

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

/** GET /my-company/stock/analytics — what is low, what is out, what is moving. */
const analytics = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  return success(res, {
    message: 'Stock analytics fetched successfully',
    data: await analyticsService.stockAnalytics(companyId, {
      days: req.query.days,
      warehouseId: req.query.warehouseId,
    }),
  });
});

/** GET /masters/stock-reasons — the reasons a person may write, named. */
const reasonCatalogue = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Stock reasons fetched successfully',
    data: {
      reasons: STOCK_REASON_CATALOGUE,
      /* Which of them a form may offer. `sale` and `transfer` are written by
         the platform alongside something else that has to be true. */
      manual: STOCK_MANUAL_REASONS,
    },
  })
);

module.exports = {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
  listStock,
  updateStockSettings,
  createMovement,
  createTransfer,
  listMovements,
  analytics,
  reasonCatalogue,
};
