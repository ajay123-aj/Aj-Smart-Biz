'use strict';

const { Op, fn, col, literal } = require('sequelize');
const db = require('../models');
const { monthExpression } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const subscriptionService = require('../services/subscription.service');
const functionalityService = require('../services/functionality.service');
const bookingService = require('../services/booking.service');
const {
  STATUS,
  TRANSACTION_STATUS,
  SUBSCRIPTION_STATUS,
  OCCUPYING_SUBSCRIPTION_STATUSES,
  FUNCTIONALITY,
  ORDER_STATUS,
  OPEN_ORDER_STATUSES,
  ORDER_PAYMENT_STATUS,
  LEAD_STAGE,
  BOOKING_STATUS,
  BOOKING_HOLDS_SLOT,
} = require('../constants');

const startOfMonth = (offsetMonths = 0) => {
  const date = new Date();
  date.setMonth(date.getMonth() + offsetMonths, 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const sumPaid = async (where = {}) => {
  const row = await db.Transaction.findOne({
    where: { status: TRANSACTION_STATUS.SUCCESS, ...where },
    attributes: [[fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total']],
    raw: true,
  });
  return Number(row?.total || 0);
};

/**
 * GET /dashboard/super-admin
 * Company counters + income totals, plus the series/lists the cards render.
 */
const superAdminDashboard = asyncHandler(async (req, res) => {
  const thisMonth = startOfMonth(0);
  const lastMonth = startOfMonth(-1);
  const yearAgo = startOfMonth(-11);

  const [
    totalCompanies,
    activeCompanies,
    inactiveCompanies,
    deletedCompanies,
    totalPlans,
    activePlans,
    totalSuperAdmins,
    totalAdmins,
    totalBranches,
    activeSubscriptions,
    expiringSoon,
    totalIncome,
    incomeThisMonth,
    incomeLastMonth,
  ] = await Promise.all([
    db.Company.count(),
    db.Company.count({ where: { status: STATUS.ACTIVE } }),
    db.Company.count({ where: { status: STATUS.INACTIVE } }),
    db.Company.count({ where: { deletedAt: { [Op.ne]: null } }, paranoid: false }),
    db.Plan.count(),
    db.Plan.count({ where: { status: STATUS.ACTIVE } }),
    db.SuperAdmin.count(),
    db.Admin.count(),
    db.Branch.count(),
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.ACTIVE } }),
    db.CompanySubscription.count({
      where: {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { [Op.between]: [new Date(), new Date(Date.now() + 30 * 86400000)] },
      },
    }),
    sumPaid(),
    sumPaid({ paidAt: { [Op.gte]: thisMonth } }),
    sumPaid({ paidAt: { [Op.gte]: lastMonth, [Op.lt]: thisMonth } }),
  ]);

  const [monthlyIncome, companiesByPlan, recentCompanies, recentTransactions] = await Promise.all([
    db.Transaction.findAll({
      where: { status: TRANSACTION_STATUS.SUCCESS, paidAt: { [Op.gte]: yearAgo } },
      attributes: [
        [literal(monthExpression('paid_at')), 'month'],
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total'],
        [fn('COUNT', col('id')), 'count'],
      ],
      group: [literal(monthExpression('paid_at'))],
      order: [literal(`${monthExpression('paid_at')} ASC`)],
      raw: true,
    }),
    db.CompanySubscription.findAll({
      where: { status: SUBSCRIPTION_STATUS.ACTIVE },
      attributes: ['planId', [fn('COUNT', col('CompanySubscription.id')), 'total']],
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name'] }],
      group: ['CompanySubscription.plan_id', 'plan.id'],
      raw: true,
      nest: true,
    }),
    db.Company.findAll({
      attributes: ['id', 'name', 'code', 'email', 'status', 'createdAt', 'subscriptionEndDate'],
      include: [{ model: db.BusinessType, as: 'businessType', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit: 8,
    }),
    db.Transaction.findAll({
      attributes: ['id', 'invoiceNo', 'totalAmount', 'currency', 'status', 'paymentMode', 'paidAt'],
      include: [
        { model: db.Company, as: 'company', attributes: ['id', 'name', 'code'] },
        { model: db.Plan, as: 'plan', attributes: ['id', 'name'] },
      ],
      order: [['paidAt', 'DESC'], ['id', 'DESC']],
      limit: 8,
    }),
  ]);

  const growth = incomeLastMonth > 0
    ? Number((((incomeThisMonth - incomeLastMonth) / incomeLastMonth) * 100).toFixed(2))
    : null;

  return success(res, {
    message: 'Dashboard fetched successfully',
    data: {
      companies: {
        total: totalCompanies,
        active: activeCompanies,
        inactive: inactiveCompanies,
        deleted: deletedCompanies,
      },
      income: {
        total: totalIncome,
        thisMonth: incomeThisMonth,
        lastMonth: incomeLastMonth,
        growthPercent: growth,
        currency: 'INR',
      },
      counts: {
        plans: totalPlans,
        activePlans,
        superAdmins: totalSuperAdmins,
        admins: totalAdmins,
        branches: totalBranches,
        activeSubscriptions,
        expiringSoon,
      },
      monthlyIncome: monthlyIncome.map((row) => ({
        month: row.month,
        total: Number(row.total),
        count: Number(row.count),
      })),
      companiesByPlan: companiesByPlan.map((row) => ({
        planId: row.planId,
        planName: row.plan?.name || 'Unknown',
        total: Number(row.total),
      })),
      recentCompanies,
      recentTransactions,
    },
  });
});

/**
 * GET /dashboard/admin
 * Scoped to the caller's company: admin counters plus plan/branch context.
 */
const adminDashboard = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;

  const [totalAdmins, activeAdmins, inactiveAdmins, totalBranches, activeBranches, totalRoles, recentAdmins] =
    await Promise.all([
      db.Admin.count({ where: { companyId } }),
      db.Admin.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.Admin.count({ where: { companyId, status: STATUS.INACTIVE } }),
      db.Branch.count({ where: { companyId } }),
      db.Branch.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.Role.count({ where: { companyId } }),
      db.Admin.findAll({
        where: { companyId },
        attributes: ['id', 'name', 'email', 'status', 'lastLoginAt', 'createdAt'],
        include: [{ model: db.Role, as: 'role', attributes: ['id', 'name'] }],
        order: [['id', 'DESC']],
        limit: 8,
      }),
    ]);

  /**
   * The blocks that only exist where the tenant has bought them.
   *
   * **Absence is the whole design.** A shop without the catalogue should not see
   * an empty Products card sitting on its dashboard being nought forever — it
   * reads as something broken rather than something not purchased. So each block
   * is `null` unless its functionality is live, exactly as the public website
   * payload works, and the console renders on presence rather than checking a
   * flag per card.
   *
   * Resolved through the one service that decides it, so a card here and a menu
   * entry and a button on the website can never disagree about what this tenant
   * has.
   */
  const { activeKeys } = await functionalityService.getFunctionalities(companyId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  /* ------------------------------- catalogue ------------------------------ */

  let catalogue = null;

  if (activeKeys.includes(FUNCTIONALITY.PRODUCTS)) {
    const [products, live, offers, categories] = await Promise.all([
      db.CompanyProduct.count({ where: { companyId } }),
      db.CompanyProduct.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.CompanyProduct.count({ where: { companyId, status: STATUS.ACTIVE, onOffer: true } }),
      db.CompanyCategory.count({ where: { companyId, status: STATUS.ACTIVE } }),
    ]);

    /**
     * Out of stock is counted from the **flag** here rather than from the
     * shelf, and only where the shelf is not answering. A product that tracks
     * inventory gets its availability from the warehouse block below, and
     * counting it twice would put the same item in two different cards.
     */
    const outOfStock = await db.CompanyProduct.count({
      where: { companyId, status: STATUS.ACTIVE, stockStatus: 'out_of_stock' },
    });

    catalogue = { products, live, hidden: products - live, offers, categories, outOfStock };
  }

  /* --------------------------------- orders ------------------------------- */

  let orders = null;

  if (activeKeys.includes(FUNCTIONALITY.ORDERS)) {
    const [byStatus, todayCount, month, unpaid] = await Promise.all([
      db.CompanyOrder.findAll({
        where: { companyId },
        attributes: ['status', [fn('COUNT', col('id')), 'total']],
        group: ['status'],
        raw: true,
      }),
      db.CompanyOrder.count({ where: { companyId, createdAt: { [Op.gte]: today } } }),
      db.CompanyOrder.findOne({
        where: {
          companyId,
          createdAt: { [Op.gte]: monthAgo },
          /* Cancelled orders are not sales — the rule every revenue figure on
             the platform follows. */
          status: { [Op.ne]: ORDER_STATUS.CANCELLED },
        },
        attributes: [
          [fn('COUNT', col('id')), 'count'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
        ],
        raw: true,
      }),
      db.CompanyOrder.findOne({
        where: {
          companyId,
          paymentStatus: ORDER_PAYMENT_STATUS.UNPAID,
          status: { [Op.ne]: ORDER_STATUS.CANCELLED },
        },
        attributes: [
          [fn('COUNT', col('id')), 'count'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'amount'],
        ],
        raw: true,
      }),
    ]);

    const counts = {};
    byStatus.forEach((row) => {
      counts[row.status] = Number(row.total || 0);
    });

    orders = {
      byStatus: counts,
      /* What is waiting on somebody, which is the number a shop opens this page
         for. Unwindowed: an order still open from five weeks ago is the one that
         matters most. */
      open: OPEN_ORDER_STATUSES.reduce((total, key) => total + (counts[key] ?? 0), 0),
      today: todayCount,
      month: { orders: Number(month?.count || 0), revenue: Number(month?.revenue || 0) },
      unpaid: { orders: Number(unpaid?.count || 0), amount: Number(unpaid?.amount || 0) },
    };
  }

  /* -------------------------------- services ------------------------------ */

  /**
   * The service side, immediately after the order book.
   *
   * They are the two halves of what a business sells - things and work - and a
   * dashboard that shows one without the other tells a tradesman nothing. The
   * block is absent unless the tenant actually has Services, exactly like every
   * other block here.
   *
   * `awaiting` is the number this card exists for: somebody asked for a time and
   * is waiting to hear. It is the only figure on the dashboard that another
   * person is sitting at the other end of.
   */
  let services = null;

  if (activeKeys.includes(FUNCTIONALITY.SERVICES)) {
    const priced = { companyId, amount: { [Op.ne]: null } };

    const [enquiries, fresh, recent, quoted, collected, awaiting, confirmed, today] = await Promise.all([
      db.ServiceLead.count({ where: { companyId } }),
      db.ServiceLead.count({ where: { companyId, stage: LEAD_STAGE.NEW } }),
      db.ServiceLead.count({ where: { companyId, createdAt: { [Op.gte]: monthAgo } } }),

      db.ServiceLead.findOne({
        where: priced,
        attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
        raw: true,
      }),
      db.ServiceLead.findOne({
        where: { ...priced, paymentStatus: ORDER_PAYMENT_STATUS.PAID },
        attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
        raw: true,
      }),

      /* The diary's own two numbers, and the one for today - what the shop is
         actually doing when somebody opens this screen in the morning. */
      db.ServiceLead.count({ where: { companyId, bookingStatus: BOOKING_STATUS.REQUESTED } }),
      db.ServiceLead.count({ where: { companyId, bookingStatus: BOOKING_STATUS.ACCEPTED } }),
      db.ServiceLead.count({
        where: {
          companyId,
          bookingDate: bookingService.today(),
          bookingStatus: { [Op.in]: BOOKING_HOLDS_SLOT },
        },
      }),
    ]);

    const quotedTotal = Number(quoted?.total || 0);
    const collectedTotal = Number(collected?.total || 0);

    services = {
      enquiries,
      new: fresh,
      lastThirtyDays: recent,
      quoted: quotedTotal,
      collected: collectedTotal,
      /* Agreed and not yet paid - the figure somebody can act on today. */
      outstanding: Number((quotedTotal - collectedTotal).toFixed(2)),
      /** Waiting to be confirmed. Somebody is at the other end of this one. */
      awaiting,
      confirmed,
      todayBookings: today,
    };
  }

  /* ------------------------------- warehouse ------------------------------ */

  let warehouse = null;

  if (activeKeys.includes(FUNCTIONALITY.WAREHOUSE)) {
    const [units, levels] = await Promise.all([
      db.CompanyWarehouse.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.CompanyStock.findAll({
        where: { companyId },
        attributes: ['quantity', 'reserved', 'reorderLevel'],
        raw: true,
      }),
    ]);

    /**
     * Counted in JavaScript rather than in three more queries.
     *
     * A tenant's stock is its catalogue times its warehouses — a few thousand
     * rows at the outside — and *low* is a comparison between two columns that
     * every dialect spells differently. One read and a loop is cheaper than three
     * round trips and a portability problem.
     */
    let onHand = 0;
    let reserved = 0;
    let low = 0;
    let out = 0;

    levels.forEach((row) => {
      const available = row.quantity - row.reserved;
      onHand += row.quantity;
      reserved += row.reserved;
      /* Out first, so a product that is both out and under its level is counted
         once, in the card that needs acting on today. */
      if (available <= 0) out += 1;
      else if (row.reorderLevel > 0 && available <= row.reorderLevel) low += 1;
    });

    warehouse = {
      units,
      tracked: levels.length,
      onHand,
      reserved,
      available: onHand - reserved,
      low,
      out,
    };
  }

  /* ------------------------------- customers ------------------------------ */

  let customers = null;

  if (activeKeys.includes(FUNCTIONALITY.CUSTOMERS)) {
    const [total, active, joined] = await Promise.all([
      db.Customer.count({ where: { companyId } }),
      db.Customer.count({ where: { companyId, status: STATUS.ACTIVE } }),
      db.Customer.count({ where: { companyId, createdAt: { [Op.gte]: monthAgo } } }),
    ]);

    customers = { total, active, joinedLast30: joined };
  }

  /* ---------------------------------- blog -------------------------------- */

  let blog = null;

  if (activeKeys.includes(FUNCTIONALITY.BLOG)) {
    const now = new Date();

    const [posts, live, scheduled, drafts, latest] = await Promise.all([
      db.CompanyBlogPost.count({ where: { companyId } }),
      db.CompanyBlogPost.count({
        where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } },
      }),
      db.CompanyBlogPost.count({ where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.gt]: now } } }),
      db.CompanyBlogPost.count({ where: { companyId, status: STATUS.ACTIVE, publishedAt: null } }),
      db.CompanyBlogPost.findOne({
        where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } },
        order: [['published_at', 'DESC']],
        attributes: ['id', 'title', 'slug', 'publishedAt'],
      }),
    ]);

    /**
     * `lastPostedAt` rather than a count of posts this month, and it is the
     * number this card exists for. A blog's whole problem is that it goes quiet:
     * "six articles" says nothing, and "last post: 4 March" says everything, in
     * the one glance a dashboard gets.
     */
    blog = {
      posts,
      live,
      scheduled,
      drafts,
      lastPostedAt: latest?.publishedAt ?? null,
      latestTitle: latest?.title ?? null,
    };
  }

  const subscription = await db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'maxAdmins', 'maxBranches', 'maxUsers'] }],
    order: [['id', 'DESC']],
  });

  // The same timer block the super admin console counts down from, so both
  // portals agree on when the plan runs out.
  const timer = subscription ? subscriptionService.decorate(subscription).timer : null;
  const daysRemaining = timer ? Math.max(0, timer.daysRemaining) : null;

  return success(res, {
    message: 'Dashboard fetched successfully',
    data: {
      admins: { total: totalAdmins, active: activeAdmins, inactive: inactiveAdmins },
      branches: { total: totalBranches, active: activeBranches },
      roles: { total: totalRoles },
      /* Null unless the tenant bought it — see the note above. */
      catalogue,
      orders,
      /* After the order book: things sold, then work sold. */
      services,
      warehouse,
      customers,
      blog,
      subscription: subscription
        ? {
            planName: subscription.plan?.name ?? subscription.planSnapshot?.name ?? null,
            status: subscription.status,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            autoRenew: subscription.autoRenew,
            isTrial: subscription.isTrial,
            timer,
            daysRemaining,
            limits: {
              maxAdmins: subscription.plan?.maxAdmins ?? null,
              maxBranches: subscription.plan?.maxBranches ?? null,
              maxUsers: subscription.plan?.maxUsers ?? null,
            },
          }
        : null,
      recentAdmins,
    },
  });
});

module.exports = { superAdminDashboard, adminDashboard };
