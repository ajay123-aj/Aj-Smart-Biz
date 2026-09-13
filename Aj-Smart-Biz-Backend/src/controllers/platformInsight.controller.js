'use strict';

const { Op, fn, col } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const customerService = require('../services/customer.service');
const analyticsService = require('../services/analytics.service');
const functionalityService = require('../services/functionality.service');
const {
  STATUS,
  ORDER_STATUS,
  OPEN_ORDER_STATUSES,
  ORDER_PAYMENT_STATUS,
  LEAD_STAGE,
  FUNCTIONALITY,
} = require('../constants');

/**
 * What the platform can see across its tenants: who is buying, and what each
 * company is actually doing.
 *
 * ### Why this is its own controller
 *
 * Every other read on the platform is pinned to **one** company by a token that
 * names it. These are not: a super admin legitimately needs to look across all of
 * them, which is a different question and deserves to be somewhere a reader can
 * find rather than hidden behind an optional parameter on a tenant endpoint.
 *
 * Keeping them apart also keeps the tenant endpoints honest. `resolveCompanyId`
 * over there reads `req.params.companyId` **only** for a super-admin token; if
 * cross-tenant reads had been bolted onto those handlers, every one of them would
 * be one missing check away from serving another company's data to an admin.
 *
 * ### What a super admin is not shown
 *
 * A customer's own addresses and order lines are absent from the list here. The
 * platform operator has a legitimate interest in *how many* customers a tenant
 * has and how much they are worth — that is billing and support. Where a
 * particular person lives is the tenant's business with their customer, and
 * nothing about running the platform requires reading it.
 */

/* ------------------------------------------------------------------ *
 * Customers, across every tenant
 * ------------------------------------------------------------------ */

/**
 * GET /super-admin/customers
 *
 * Every customer on the platform, newest first, each with the company they
 * belong to and what they have spent there.
 *
 * `companyId` narrows it to one tenant, which is what the company detail screen
 * uses. `search` covers the name, the email and the phone — normalised first,
 * so a support call that starts "they say their number is +91 98250 11223" finds
 * the row stored as `9825011223`.
 */
const customers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const scope = {};
  if (req.query.companyId) scope.companyId = Number(req.query.companyId);
  if (req.query.status) scope.status = req.query.status;

  const term = String(req.query.search ?? '').trim();
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
    include: [{ model: db.Company, as: 'company', attributes: ['id', 'name', 'code'], required: false }],
    order: getSort(req.query, ['name', 'created_at', 'last_login_at'], [['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  /**
   * What each has spent, in one grouped query for the page rather than one per
   * row — the same arrangement the tenant's own customer list uses, and for the
   * same reason: a list of names with no numbers does not help anybody decide
   * who to look at.
   */
  const ids = result.rows.map((row) => row.id);
  const totals = new Map();

  if (ids.length) {
    const rows = await db.CompanyOrder.findAll({
      where: { customerId: { [Op.in]: ids }, status: { [Op.ne]: ORDER_STATUS.CANCELLED } },
      attributes: [
        'customerId',
        [fn('COUNT', col('id')), 'orders'],
        [fn('COALESCE', fn('SUM', col('total')), 0), 'spent'],
      ],
      group: ['customer_id'],
      raw: true,
    });
    rows.forEach((row) => {
      totals.set(row.customerId, { orders: Number(row.orders || 0), spent: Number(row.spent || 0) });
    });
  }

  return paginated(
    res,
    {
      rows: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email ?? null,
        status: row.status,
        phoneVerified: row.phoneVerified,
        lastLoginAt: row.lastLoginAt ?? null,
        createdAt: row.createdAt,
        company: row.company ? { id: row.company.id, name: row.company.name, code: row.company.code } : null,
        orders: totals.get(row.id)?.orders ?? 0,
        spent: totals.get(row.id)?.spent ?? 0,
      })),
      count: result.count,
    },
    { page, limit },
    'Customers fetched successfully'
  );
});

/** GET /super-admin/customers/summary — the strip above that list. */
const customerSummary = asyncHandler(async (req, res) => {
  const scope = {};
  if (req.query.companyId) scope.companyId = Number(req.query.companyId);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [total, active, joined, companies] = await Promise.all([
    db.Customer.count({ where: scope }),
    db.Customer.count({ where: { ...scope, status: STATUS.ACTIVE } }),
    db.Customer.count({ where: { ...scope, createdAt: { [Op.gte]: monthAgo } } }),
    /* How many tenants actually have any — the number that says whether the
       feature is being used or merely sold. */
    db.Customer.count({ distinct: true, col: 'company_id', where: scope }),
  ]);

  return success(res, {
    message: 'Customer summary fetched successfully',
    data: { total, active, inactive: total - active, joinedLast30: joined, companies },
  });
});

/* ------------------------------------------------------------------ *
 * One company, in full
 * ------------------------------------------------------------------ */

/**
 * GET /super-admin/companies/:id/insights
 *
 * Everything the platform knows about how one tenant is doing, in one request:
 * what they sell, what they have sold, what they are owed, what is on their
 * shelves, and how many people have accounts with them.
 *
 * ### Absent rather than zero
 *
 * Each block is `null` unless that functionality is **live for this tenant** —
 * the same rule the tenant's own dashboard follows. A company that has not bought
 * the warehouse showing a row of noughts reads as a company with no stock rather
 * than one that never bought stock control, and those are very different things
 * to a person deciding what to sell them next.
 *
 * That makes this screen useful for the thing a platform operator actually does
 * with it: seeing at a glance which tenants are using what they pay for.
 */
const companyInsights = asyncHandler(async (req, res) => {
  const companyId = Number(req.params.id);

  const company = await db.Company.findByPk(companyId, { attributes: ['id', 'name', 'code', 'status'] });
  if (!company) throw ApiError.notFound('Company not found');

  const { activeKeys } = await functionalityService.getFunctionalities(companyId);

  const days = Number(req.query.days);
  const window = [7, 30, 90, 365].includes(days) ? days : 30;

  /* ------------------------------- orders ------------------------------- */

  let orders = null;

  if (activeKeys.includes(FUNCTIONALITY.ORDERS)) {
    const sales = await analyticsService.salesAnalytics(companyId, { days: window });

    const [lifetimeOpen, unpaid] = await Promise.all([
      db.CompanyOrder.count({ where: { companyId, status: { [Op.in]: OPEN_ORDER_STATUSES } } }),
      db.CompanyOrder.findOne({
        where: {
          companyId,
          paymentStatus: ORDER_PAYMENT_STATUS.UNPAID,
          status: { [Op.ne]: ORDER_STATUS.CANCELLED },
        },
        attributes: [[fn('COALESCE', fn('SUM', col('total')), 0), 'amount']],
        raw: true,
      }),
    ]);

    orders = {
      window: sales.totals,
      lifetime: sales.lifetime,
      daily: sales.daily,
      byStatus: sales.byStatus,
      topProducts: sales.topProducts,
      open: lifetimeOpen,
      unpaidAmount: Number(unpaid?.amount || 0),
    };
  }

  /* ------------------------------ catalogue ----------------------------- */

  let catalogue = null;

  if (activeKeys.includes(FUNCTIONALITY.PRODUCTS)) {
    const [products, live, categories] = await Promise.all([
      db.CompanyProduct.count({ where: { companyId } }),
      db.CompanyProduct.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.CompanyCategory.count({ where: { companyId, status: STATUS.ACTIVE } }),
    ]);
    catalogue = { products, live, categories };
  }

  /* ------------------------------ warehouse ----------------------------- */

  let warehouse = null;

  if (activeKeys.includes(FUNCTIONALITY.WAREHOUSE)) {
    const stock = await analyticsService.stockAnalytics(companyId, { days: window });
    warehouse = {
      units: stock.byWarehouse.length,
      onHand: stock.totals.onHand,
      available: stock.totals.available,
      low: stock.totals.lowCount,
      out: stock.totals.outCount,
      retailValue: stock.totals.retailValue,
    };
  }

  /* ------------------------------- services ----------------------------- */

  let services = null;

  if (activeKeys.includes(FUNCTIONALITY.SERVICES)) {
    const from = new Date();
    from.setDate(from.getDate() - (window - 1));
    from.setHours(0, 0, 0, 0);

    const sum = async (where) => {
      const row = await db.ServiceLead.findOne({
        where: { companyId, createdAt: { [Op.gte]: from }, amount: { [Op.ne]: null }, ...where },
        attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
        raw: true,
      });
      return Number(row?.total || 0);
    };

    const [published, enquiries, quoted, collected] = await Promise.all([
      db.CompanyService.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.ServiceLead.count({ where: { companyId, createdAt: { [Op.gte]: from } } }),
      sum({}),
      sum({ paymentStatus: ORDER_PAYMENT_STATUS.PAID }),
    ]);

    services = { published, enquiries, quoted, collected, outstanding: Number((quoted - collected).toFixed(2)) };
  }

  /* ------------------------------ customers ----------------------------- */

  let customerBlock = null;

  if (activeKeys.includes(FUNCTIONALITY.CUSTOMERS)) {
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [total, active, joined, withOrders] = await Promise.all([
      db.Customer.count({ where: { companyId } }),
      db.Customer.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.Customer.count({ where: { companyId, createdAt: { [Op.gte]: monthAgo } } }),
      db.CompanyOrder.count({
        where: { companyId, customerId: { [Op.ne]: null }, status: { [Op.ne]: ORDER_STATUS.CANCELLED } },
        distinct: true,
        col: 'customer_id',
      }),
    ]);

    customerBlock = { total, active, joinedLast30: joined, withOrders };
  }

  /* -------------------------------- blog ---------------------------------- */

  let blog = null;

  if (activeKeys.includes(FUNCTIONALITY.BLOG)) {
    const now = new Date();

    const [posts, live, latest] = await Promise.all([
      db.CompanyBlogPost.count({ where: { companyId } }),
      db.CompanyBlogPost.count({
        where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } },
      }),
      db.CompanyBlogPost.findOne({
        where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } },
        order: [['published_at', 'DESC']],
        attributes: ['publishedAt'],
      }),
    ]);

    /* The date is the figure worth having: a tenant who bought a blog and stopped
       writing four months ago is a different conversation from one who posts
       weekly, and a post count cannot tell the two apart. */
    blog = { posts, live, lastPostedAt: latest?.publishedAt ?? null };
  }

  return success(res, {
    message: 'Company insights fetched successfully',
    data: {
      company,
      range: { days: window },
      /** What this tenant is actually entitled to, so the screen can say why a block is missing. */
      activeKeys,
      orders,
      catalogue,
      warehouse,
      services,
      customers: customerBlock,
      blog,
    },
  });
});

module.exports = { customers, customerSummary, companyInsights };
