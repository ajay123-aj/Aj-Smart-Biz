'use strict';

const { Op, fn, col, literal } = require('sequelize');
const db = require('../models');
const { monthExpression } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const subscriptionService = require('../services/subscription.service');
const {
  STATUS,
  TRANSACTION_STATUS,
  SUBSCRIPTION_STATUS,
  OCCUPYING_SUBSCRIPTION_STATUSES,
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
