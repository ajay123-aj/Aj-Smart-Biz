'use strict';

const { Op, fn, col } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const customerService = require('../services/customer.service');
const orderService = require('../services/order.service');
const { AUTH_SCOPE, STATUS, ORDER_STATUS } = require('../constants');

/**
 * The tenant's customer list.
 *
 * Pinned to one company the way the rest of this module is: a company admin's
 * token names their tenant, so `:companyId` is ignored for them and cross-tenant
 * access is impossible by construction.
 *
 * **There is no create here, and there is no password to reset.** A customer
 * account is made by the person it belongs to, signing in to the website with
 * their own number — an account a shop could manufacture would be a row nobody
 * consented to, attached to somebody's phone number. What a shop legitimately
 * does is read the list, correct a name or an email, write itself a note, and bar
 * somebody who is abusing the service.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const actorOf = (req) => (req.auth?.scope === AUTH_SCOPE.ADMIN ? req.auth.id ?? null : null);

/**
 * The customer as **the shop** reads them — the public shape plus what the shop
 * is entitled to know: their own notes, and what this person is worth.
 *
 * `notes` is deliberately absent from `publicCustomer`, which is what the
 * customer's own profile page reads. It is the shop's private opinion of them,
 * and a profile that printed it is a support ticket a week later.
 */
const adminCustomer = (row, totals) => ({
  ...customerService.publicCustomer(row),
  status: row.status,
  notes: row.notes ?? null,
  lastLoginAt: row.lastLoginAt ?? null,
  /**
   * What they have actually spent, cancellations excluded — the same rule every
   * revenue figure on the platform follows. A "best customer" list that counted
   * refunded money would rank the person who cancelled the most.
   */
  orders: totals?.orders ?? 0,
  spent: totals?.spent ?? 0,
  lastOrderAt: totals?.lastOrderAt ?? null,
});

/**
 * Order totals per customer, for one page of them.
 *
 * One grouped query for the whole page rather than three per row: this is the
 * screen where somebody decides who to ring, and a list of names with no numbers
 * on it does not help them decide.
 */
async function totalsFor(companyId, customerIds) {
  if (!customerIds.length) return new Map();

  const rows = await db.CompanyOrder.findAll({
    where: {
      companyId,
      customerId: { [Op.in]: customerIds },
      status: { [Op.ne]: ORDER_STATUS.CANCELLED },
    },
    attributes: [
      'customerId',
      [fn('COUNT', col('id')), 'orders'],
      [fn('COALESCE', fn('SUM', col('total')), 0), 'spent'],
      [fn('MAX', col('created_at')), 'lastOrderAt'],
    ],
    group: ['customer_id'],
    raw: true,
  });

  return new Map(
    rows.map((row) => [
      row.customerId,
      { orders: Number(row.orders || 0), spent: Number(row.spent || 0), lastOrderAt: row.lastOrderAt },
    ])
  );
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * GET /my-company/customers
 *
 * One page, newest first, each row carrying what they have spent.
 *
 * `search` covers the name, the phone and the email, because all three are how a
 * shop looks somebody up — and the phone is **normalised before searching**, so
 * typing `+91 98250 11223` finds the customer stored as `9825011223`. Without
 * that the one search people actually use would reliably return nothing.
 */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };
  if (req.query.status) scope.status = req.query.status;

  const term = String(req.query.search ?? '').trim();
  /* A search that looks like a number is also tried as a normalised one. */
  const digits = customerService.normalisePhone(term);

  const where = mergeWhere(
    scope,
    term
      ? {
        [Op.or]: [
          { name: { [Op.like]: `%${term}%` } },
          { email: { [Op.like]: `%${term}%` } },
          { phone: { [Op.like]: `%${digits || term}%` } },
        ],
      }
      : null
  );

  const result = await db.Customer.findAndCountAll({
    where,
    order: getSort(req.query, ['name', 'created_at', 'last_login_at'], [['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  const totals = await totalsFor(companyId, result.rows.map((row) => row.id));

  return paginated(
    res,
    {
      rows: result.rows.map((row) => adminCustomer(row, totals.get(row.id))),
      count: result.count,
    },
    { page, limit },
    'Customers fetched successfully'
  );
});

/**
 * GET /my-company/customers/summary
 *
 * The strip above the list. Its own call rather than a field on the page, so the
 * counts do not change when somebody filters.
 */
const summary = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [total, active, recent, withOrders] = await Promise.all([
    db.Customer.count({ where: { companyId } }),
    db.Customer.count({ where: { companyId, status: STATUS.ACTIVE } }),
    db.Customer.count({ where: { companyId, createdAt: { [Op.gte]: monthAgo } } }),
    /**
     * How many have actually bought something. The gap between this and `total`
     * is the number worth watching: accounts that registered and never ordered
     * are a checkout somebody abandoned.
     */
    db.CompanyOrder.count({
      where: { companyId, customerId: { [Op.ne]: null }, status: { [Op.ne]: ORDER_STATUS.CANCELLED } },
      distinct: true,
      col: 'customer_id',
    }),
  ]);

  return success(res, {
    message: 'Customer summary fetched successfully',
    data: { total, active, inactive: total - active, joinedLast30: recent, withOrders },
  });
});

/**
 * GET /my-company/customers/:id
 *
 * One customer, their addresses, and their orders. Everything a person needs
 * before picking up the phone, in one request rather than three.
 */
const getById = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const id = Number(req.params.id);

  const customer = await db.Customer.findOne({ where: { id, companyId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  const [addresses, orders, totals] = await Promise.all([
    db.CustomerAddress.findAll({
      where: { companyId, customerId: id },
      include: [{ model: db.State, as: 'state', attributes: ['id', 'name'], required: false }],
      order: [['isDefault', 'DESC'], ['id', 'ASC']],
    }),
    db.CompanyOrder.findAll({
      where: { companyId, customerId: id },
      include: [{ model: db.CompanyOrderItem, as: 'items', required: false, separate: true, order: [['id', 'ASC']] }],
      order: [['id', 'DESC']],
      limit: 50,
    }),
    totalsFor(companyId, [id]),
  ]);

  return success(res, {
    message: 'Customer fetched successfully',
    data: {
      customer: adminCustomer(customer, totals.get(id)),
      addresses: addresses.map(customerService.publicAddress),
      orders: orders.map(orderService.publicOrder),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * PUT /my-company/customers/:id
 *
 * A correction and a note. **Not the phone number** — it is the identity, and a
 * shop editing it would move the account to a different person and take their
 * order history with it. It is also how that person signs in, so changing it
 * would lock them out of an account they still hold the number for.
 */
const update = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const customer = await db.Customer.findOne({ where: { id: Number(req.params.id), companyId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  await customer.update({
    name: req.body.name !== undefined ? String(req.body.name).trim() : customer.name,
    email:
      req.body.email !== undefined
        ? (req.body.email ? String(req.body.email).toLowerCase() : null)
        : customer.email,
    notes: req.body.notes !== undefined ? req.body.notes || null : customer.notes,
    updatedBy: actorOf(req),
  });

  const totals = await totalsFor(companyId, [customer.id]);
  return success(res, { message: 'Customer updated', data: adminCustomer(customer, totals.get(customer.id)) });
});

/**
 * PATCH /my-company/customers/:id/status
 *
 * Barring somebody, and letting them back. Switched off they cannot sign in and
 * cannot order; **their orders stay exactly where they are**, because barring
 * somebody is not the same as pretending they never bought anything.
 */
const toggleStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const customer = await db.Customer.findOne({ where: { id: Number(req.params.id), companyId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  const next =
    req.body.status ?? (customer.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);

  await customer.update({ status: next, updatedBy: actorOf(req) });

  return success(res, {
    message: next === STATUS.ACTIVE ? 'Customer can sign in again' : 'Customer barred from signing in',
    data: { id: customer.id, status: customer.status },
  });
});

/**
 * DELETE /my-company/customers/:id
 *
 * Soft, like everything else here. Their orders survive with `customerId` set to
 * null and the name and phone still copied onto each — so the sales figures do
 * not move when somebody asks to be removed, which is both what the shop needs
 * and what the request actually meant.
 *
 * Registering the same number later **restores this row** rather than making a
 * second one; see `findByPhone`.
 */
const remove = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const customer = await db.Customer.findOne({ where: { id: Number(req.params.id), companyId } });
  if (!customer) throw ApiError.notFound('Customer not found');

  await customer.destroy();
  return success(res, { message: 'Customer removed', data: { id: customer.id } });
});

module.exports = { list, summary, getById, update, toggleStatus, remove };
