'use strict';

const { Op, fn, col } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const companyService = require('../services/company.service');
const subscriptionService = require('../services/subscription.service');
const { activateSubscription } = subscriptionService;
const { generateInvoiceNo } = require('../services/code.service');
const { removeUploadedFile } = require('../middlewares/upload');
const {
  STATUS,
  SUBSCRIPTION_STATUS,
  OCCUPYING_SUBSCRIPTION_STATUSES,
  TRANSACTION_STATUS,
} = require('../constants');

/** The subscription a company is living on right now - running or suspended. */
const pickCurrent = (subscriptions = []) =>
  subscriptions.find((s) => OCCUPYING_SUBSCRIPTION_STATUSES.includes(s.status)) || null;

/** Image columns whose old file is discarded when a new one replaces it. */
const COMPANY_IMAGE_FIELDS = ['logo', 'favicon'];

const SEARCH_FIELDS = ['name', 'code', 'email', 'phone', 'gstNumber', 'city'];
const SORT_FIELDS = ['name', 'code', 'created_at', 'status', 'subscription_end_date'];

const findCompanyOrFail = async (id, options = {}) => {
  const company = await db.Company.findByPk(id, options);
  if (!company) throw ApiError.notFound('Company not found');
  return company;
};

/** GET /companies */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = mergeWhere(
    req.query.status ? { status: req.query.status } : null,
    req.query.businessTypeId ? { businessTypeId: req.query.businessTypeId } : null,
    req.query.stateId ? { stateId: req.query.stateId } : null,
    buildSearch(req.query.search, SEARCH_FIELDS)
  );

  const subscriptionWhere = mergeWhere(
    req.query.planId ? { planId: req.query.planId } : null,
    req.query.subscriptionStatus ? { status: req.query.subscriptionStatus } : null
  );
  const filterBySubscription = Object.keys(subscriptionWhere).length > 0;

  const result = await db.Company.findAndCountAll({
    where,
    include: [
      { model: db.BusinessType, as: 'businessType', attributes: ['id', 'name'] },
      { model: db.State, as: 'state', attributes: ['id', 'name'] },
      { model: db.Theme, as: 'theme', attributes: ['id', 'name', 'primaryColor'] },
      {
        model: db.CompanySubscription,
        as: 'subscriptions',
        required: filterBySubscription,
        where: filterBySubscription ? subscriptionWhere : undefined,
        include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'billingCycle'] }],
      },
    ],
    order: getSort(req.query, SORT_FIELDS),
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  // Only the running subscription is interesting in a list view, and it carries
  // its expiry timer so the list can count down without a second request.
  const rows = result.rows.map((row) => {
    const plain = row.toJSON();
    plain.activeSubscription = subscriptionService.decorate(pickCurrent(plain.subscriptions));
    plain.scheduledSubscription = subscriptionService.decorate(
      (plain.subscriptions || []).find((s) => s.status === SUBSCRIPTION_STATUS.PENDING) || null
    );
    delete plain.subscriptions;
    return plain;
  });

  return paginated(res, { rows, count: result.count }, { page, limit }, 'Company list fetched successfully');
});

/** GET /companies/:id - everything the detail screen renders. */
const getById = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id, { include: companyService.companyDetailInclude() });

  const [transactions, admins, totals] = await Promise.all([
    db.Transaction.findAll({
      where: { companyId: company.id },
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name'] }],
      order: [['paidAt', 'DESC'], ['id', 'DESC']],
      limit: 100,
    }),
    db.Admin.findAll({
      where: { companyId: company.id },
      attributes: ['id', 'name', 'email', 'phone', 'isCompanyAdmin', 'status', 'lastLoginAt'],
      include: [{ model: db.Role, as: 'role', attributes: ['id', 'name'] }],
      order: [['isCompanyAdmin', 'DESC'], ['id', 'ASC']],
    }),
    db.Transaction.findOne({
      where: { companyId: company.id, status: TRANSACTION_STATUS.SUCCESS },
      attributes: [
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'totalPaid'],
        [fn('COUNT', col('id')), 'transactionCount'],
      ],
      raw: true,
    }),
  ]);

  const plain = company.toJSON();
  plain.subscriptions = (plain.subscriptions || []).map(subscriptionService.decorate);
  plain.activeSubscription = pickCurrent(plain.subscriptions);
  plain.scheduledSubscription =
    plain.subscriptions.find((s) => s.status === SUBSCRIPTION_STATUS.PENDING) || null;
  plain.transactions = transactions;
  plain.admins = admins;
  plain.summary = {
    totalBranches: (plain.branches || []).length,
    activeBranches: (plain.branches || []).filter((b) => b.status === STATUS.ACTIVE).length,
    totalAdmins: admins.length,
    totalPaid: Number(totals?.totalPaid || 0),
    transactionCount: Number(totals?.transactionCount || 0),
  };

  return success(res, { message: 'Company fetched successfully', data: plain });
});

/** POST /companies - provisions branch + role + main admin + optional plan. */
const create = asyncHandler(async (req, res) => {
  const result = await companyService.createCompany(req.body, req.auth?.id);
  const company = await db.Company.findByPk(result.company.id, {
    include: companyService.companyDetailInclude(),
  });
  return created(res, 'Company created successfully', {
    company,
    mainAdmin: result.admin,
    // Only returned on creation when the API generated the password.
    mainAdminPassword: result.mainAdminPassword,
    subscription: result.subscription,
    transaction: result.transaction,
  });
});

/** PUT /companies/:id */
const update = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);

  if (req.body.email && req.body.email !== company.email) {
    const clash = await db.Company.findOne({ where: { email: req.body.email, id: { [Op.ne]: company.id } } });
    if (clash) throw ApiError.conflict('Another company already uses this email');
  }
  if (req.body.code && req.body.code !== company.code) {
    const clash = await db.Company.findOne({
      where: { code: req.body.code, id: { [Op.ne]: company.id } },
      paranoid: false,
    });
    if (clash) throw ApiError.conflict('Another company already uses this code');
  }
  // Discard the files being displaced once the new values are saved.
  const replaced = COMPANY_IMAGE_FIELDS.filter(
    (field) => field in req.body && company[field] && company[field] !== req.body[field]
  ).map((field) => company[field]);

  await company.update({ ...req.body, updatedBy: req.auth?.id ?? null });
  replaced.forEach(removeUploadedFile);

  const fresh = await db.Company.findByPk(company.id, { include: companyService.companyDetailInclude() });
  return success(res, { message: 'Company updated successfully', data: fresh });
});

/** PATCH /companies/:id/status */
const toggleStatus = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);
  const next = req.body?.status || (company.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await company.update({ status: next, updatedBy: req.auth?.id ?? null });
  return success(res, { message: `Company marked ${next}`, data: { id: company.id, status: next } });
});

/**
 * DELETE /companies/:id - soft delete. Branches, admins, roles and permissions
 * are soft deleted alongside so nothing from a removed tenant can log in.
 */
const remove = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);

  await db.sequelize.transaction(async (transaction) => {
    const scope = { where: { companyId: company.id }, transaction };
    await db.CompanyDomain.destroy(scope); // stops a removed tenant's hosts resolving
    await db.BranchContact.destroy(scope);
    await db.Branch.destroy(scope);
    await db.RolePermission.destroy(scope);
    await db.Admin.destroy(scope);
    await db.Role.destroy(scope);
    await db.Menu.destroy(scope); // company-specific menus only; system menus have company_id NULL
    await company.destroy({ transaction });
  });

  return success(res, { message: 'Company deleted successfully', data: { id: company.id } });
});

/** POST /companies/:id/restore */
const restore = asyncHandler(async (req, res) => {
  const company = await db.Company.findByPk(req.params.id, { paranoid: false });
  if (!company) throw ApiError.notFound('Company not found');

  await db.sequelize.transaction(async (transaction) => {
    await company.restore({ transaction });
    const scope = { where: { companyId: company.id }, transaction };
    await db.CompanyDomain.restore(scope);
    await db.Branch.restore(scope);
    await db.BranchContact.restore(scope);
    await db.Role.restore(scope);
    await db.RolePermission.restore(scope);
    await db.Admin.restore(scope);
    await db.Menu.restore(scope);
  });

  return success(res, { message: 'Company restored successfully', data: { id: company.id } });
});

/** POST /companies/:id/subscriptions - assign or renew a plan. */
const assignPlan = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);
  const result = await db.sequelize.transaction((transaction) =>
    activateSubscription({ company, payload: req.body, actorId: req.auth?.id, transaction })
  );
  return created(res, 'Plan activated successfully', {
    subscription: result.subscription,
    transaction: result.transaction,
  });
});

/** GET /companies/:id/subscriptions */
const listSubscriptions = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);
  const rows = await db.CompanySubscription.findAll({
    where: { companyId: company.id },
    include: [
      { model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'billingCycle', 'currency'] },
      { model: db.Transaction, as: 'transactions' },
    ],
    order: [['startDate', 'DESC'], ['id', 'DESC']],
  });
  return success(res, {
    message: 'Subscriptions fetched successfully',
    data: rows.map(subscriptionService.decorate),
  });
});

/**
 * POST /companies/:id/subscriptions/:subscriptionId/cancel
 * Goes through the shared transition guard, so the move is checked against the
 * lifecycle matrix, written to the event trail and reflected on the company row.
 */
const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await db.CompanySubscription.findOne({
    where: { id: req.params.subscriptionId, companyId: req.params.id },
  });
  if (!subscription) throw ApiError.notFound('Subscription not found');

  await db.sequelize.transaction((transaction) =>
    subscriptionService.transitionStatus({
      subscription,
      to: SUBSCRIPTION_STATUS.CANCELLED,
      reason: req.body?.reason ?? null,
      actorId: req.auth?.id,
      actor: { id: req.auth?.id ?? null, name: req.auth?.name ?? null },
      transaction,
    })
  );

  return success(res, { message: 'Subscription cancelled successfully', data: { id: subscription.id } });
});

/** GET /companies/:id/transactions */
const listTransactions = asyncHandler(async (req, res) => {
  await findCompanyOrFail(req.params.id);
  const { page, limit, offset } = getPagination(req.query);

  const dateFilter = {};
  if (req.query.fromDate) dateFilter[Op.gte] = new Date(req.query.fromDate);
  if (req.query.toDate) dateFilter[Op.lte] = new Date(req.query.toDate);

  const where = mergeWhere(
    { companyId: req.params.id },
    req.query.status ? { status: req.query.status } : null,
    Object.getOwnPropertySymbols(dateFilter).length ? { paidAt: dateFilter } : null,
    buildSearch(req.query.search, ['invoiceNo', 'paymentReference'])
  );

  const result = await db.Transaction.findAndCountAll({
    where,
    include: [
      { model: db.Plan, as: 'plan', attributes: ['id', 'name'] },
      { model: db.CompanySubscription, as: 'subscription', attributes: ['id', 'startDate', 'endDate'] },
    ],
    order: getSort(req.query, ['paid_at', 'total_amount', 'created_at'], [['paidAt', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Transactions fetched successfully');
});

/** POST /companies/:id/transactions - record a manual payment. */
const createTransaction = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);
  const amount = Number(req.body.amount);
  const discount = Number(req.body.discount || 0);
  const taxAmount = Number(req.body.taxAmount || 0);

  const row = await db.Transaction.create({
    ...req.body,
    companyId: company.id,
    invoiceNo: await generateInvoiceNo(),
    totalAmount: Number((amount - discount + taxAmount).toFixed(2)),
    paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
    createdBy: req.auth?.id ?? null,
  });

  return created(res, 'Transaction recorded successfully', row);
});

/* ------------------------------------------------------------------ *
 * Company-admin portal: only ever the caller's own company
 * ------------------------------------------------------------------ */

/** GET /my-company */
const getMyCompany = asyncHandler(async (req, res) => {
  const company = await db.Company.findByPk(req.auth.companyId, {
    include: companyService.companyDetailInclude(),
  });
  if (!company) throw ApiError.notFound('Company not found');

  const plain = company.toJSON();
  plain.subscriptions = (plain.subscriptions || []).map(subscriptionService.decorate);
  plain.activeSubscription = pickCurrent(plain.subscriptions);
  return success(res, { message: 'Company fetched successfully', data: plain });
});

/**
 * PUT /my-company - the tenant may edit its own profile but not its plan,
 * status or tenant code, so those keys are dropped before the write.
 */
const updateMyCompany = asyncHandler(async (req, res) => {
  const company = await db.Company.findByPk(req.auth.companyId);
  if (!company) throw ApiError.notFound('Company not found');

  const { status, code, currentSubscriptionId, subscriptionEndDate, ...allowed } = req.body;
  if (allowed.email && allowed.email !== company.email) {
    const clash = await db.Company.findOne({ where: { email: allowed.email, id: { [Op.ne]: company.id } } });
    if (clash) throw ApiError.conflict('Another company already uses this email');
  }

  // Same file hygiene as the super admin path: discard what is replaced.
  const replaced = COMPANY_IMAGE_FIELDS.filter(
    (field) => field in allowed && company[field] && company[field] !== allowed[field]
  ).map((field) => company[field]);

  await company.update({ ...allowed, updatedBy: req.auth?.id ?? null });
  replaced.forEach(removeUploadedFile);
  const fresh = await db.Company.findByPk(company.id, { include: companyService.companyDetailInclude() });
  return success(res, { message: 'Company updated successfully', data: fresh });
});

module.exports = {
  list,
  getById,
  create,
  update,
  toggleStatus,
  remove,
  restore,
  assignPlan,
  listSubscriptions,
  cancelSubscription,
  listTransactions,
  createTransaction,
  getMyCompany,
  updateMyCompany,
};
