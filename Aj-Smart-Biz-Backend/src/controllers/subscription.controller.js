'use strict';

const { Op, fn, col } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const service = require('../services/subscription.service');
const quotaService = require('../services/quota.service');
const {
  SUBSCRIPTION_STATUS,
  OCCUPYING_SUBSCRIPTION_STATUSES,
  TERMINAL_SUBSCRIPTION_STATUSES,
  EXPIRY_WARNING_DAYS,
  PLAN_REQUEST_STATUS,
  TRANSACTION_STATUS,
} = require('../constants');

const SORT_FIELDS = ['start_date', 'end_date', 'total_amount', 'status', 'created_at'];

/** Who made the change, for the event trail. */
const actorOf = (req) => ({ id: req.auth?.id ?? null, name: req.auth?.name ?? null });

const findCompanyOrFail = async (id, transaction) => {
  const company = await db.Company.findByPk(id, { transaction });
  if (!company) throw ApiError.notFound('Company not found');
  return company;
};

const findSubscriptionOrFail = async (id, options = {}) => {
  const subscription = await db.CompanySubscription.findByPk(id, options);
  if (!subscription) throw ApiError.notFound('Subscription not found');
  return subscription;
};

/** Attaches the timer block plus the moves this row is allowed to make next. */
const present = (subscription) => {
  const plain = service.decorate(subscription);
  if (plain) plain.allowedTransitions = service.availableTransitions(plain.status);
  return plain;
};

/**
 * Same, but reloaded with its plan and company first. A row just created inside
 * a transaction carries no associations, and the caller renders the plan name.
 */
const presentFresh = async (subscription) =>
  present(await db.CompanySubscription.findByPk(subscription.id, { include: service.subscriptionInclude() }));

/* ------------------------------------------------------------------ *
 * Console: every company's plan in one place
 * ------------------------------------------------------------------ */

/** GET /subscriptions */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const q = req.query;

  const dateFilter = {};
  if (q.fromDate) dateFilter[Op.gte] = service.toDateOnly(q.fromDate);
  if (q.toDate) dateFilter[Op.lte] = service.toDateOnly(q.toDate);

  // "Expiring in N days" means a live term whose end date lands between today
  // and today + N - the window the renewal team actually works from.
  let endDateFilter = null;
  if (q.expiringInDays !== undefined) {
    const today = service.toDateOnly(new Date());
    const until = service.toDateOnly(service.addDays(new Date(), Number(q.expiringInDays)));
    endDateFilter = { endDate: { [Op.between]: [today, until] } };
  } else if (q.expiredOnly === true || q.expiredOnly === 'true') {
    endDateFilter = { endDate: { [Op.lt]: service.toDateOnly(new Date()) } };
  }

  const statusFilter = q.status
    ? { status: Array.isArray(q.status) ? { [Op.in]: q.status } : q.status }
    : null;
  // The expiry window only makes sense against terms that are still running.
  const impliedLive = endDateFilter && !statusFilter
    ? { status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } }
    : null;

  const where = mergeWhere(
    statusFilter,
    impliedLive,
    endDateFilter,
    q.companyId ? { companyId: q.companyId } : null,
    q.planId ? { planId: q.planId } : null,
    q.changeType ? { changeType: q.changeType } : null,
    q.isTrial !== undefined ? { isTrial: q.isTrial } : null,
    q.autoRenew !== undefined ? { autoRenew: q.autoRenew } : null,
    Object.getOwnPropertySymbols(dateFilter).length ? { startDate: dateFilter } : null
  );

  const companyWhere = buildSearch(q.search, ['name', 'code', 'email']);

  const result = await db.CompanySubscription.findAndCountAll({
    where,
    include: [
      {
        model: db.Company,
        as: 'company',
        attributes: ['id', 'name', 'code', 'email', 'phone', 'logo', 'status', 'currency'],
        required: Boolean(companyWhere),
        where: companyWhere || undefined,
      },
      {
        model: db.Plan,
        as: 'plan',
        attributes: ['id', 'name', 'code', 'price', 'discountPrice', 'currency', 'billingCycle', 'maxBranches', 'maxAdmins', 'maxUsers', 'status'],
      },
    ],
    order: getSort(req.query, SORT_FIELDS, [['endDate', 'ASC'], ['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  return paginated(
    res,
    { rows: result.rows.map(present), count: result.count },
    { page, limit },
    'Subscriptions fetched successfully'
  );
});

/**
 * GET /subscriptions/summary
 * The counters across the top of the plan console, plus the plan-by-plan split.
 */
const summary = asyncHandler(async (req, res) => {
  const today = service.toDateOnly(new Date());
  const in7 = service.toDateOnly(service.addDays(new Date(), 7));
  const in30 = service.toDateOnly(service.addDays(new Date(), EXPIRY_WARNING_DAYS));

  const live = { status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } };

  const [
    active, suspended, pending, expired, cancelled, superseded,
    expiringIn7, expiringIn30, inGrace, autoRenewOn, trials,
    companiesWithoutPlan, pendingRequests, byPlan, revenue,
  ] = await Promise.all([
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.ACTIVE } }),
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.SUSPENDED } }),
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.PENDING } }),
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.EXPIRED } }),
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.CANCELLED } }),
    db.CompanySubscription.count({ where: { status: SUBSCRIPTION_STATUS.SUPERSEDED } }),
    db.CompanySubscription.count({ where: { ...live, endDate: { [Op.between]: [today, in7] } } }),
    db.CompanySubscription.count({ where: { ...live, endDate: { [Op.between]: [today, in30] } } }),
    db.CompanySubscription.count({ where: { ...live, endDate: { [Op.lt]: today } } }),
    db.CompanySubscription.count({ where: { ...live, autoRenew: true } }),
    db.CompanySubscription.count({ where: { ...live, isTrial: true } }),
    db.Company.count({ where: { currentSubscriptionId: null } }),
    db.PlanRequest.count({ where: { status: PLAN_REQUEST_STATUS.PENDING } }),
    db.CompanySubscription.findAll({
      where: live,
      attributes: ['planId', [fn('COUNT', col('CompanySubscription.id')), 'total']],
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'currency', 'billingCycle', 'status'] }],
      group: ['CompanySubscription.plan_id', 'plan.id'],
      raw: true,
      nest: true,
    }),
    db.Transaction.findOne({
      where: { status: TRANSACTION_STATUS.SUCCESS },
      attributes: [[fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total']],
      raw: true,
    }),
  ]);

  return success(res, {
    message: 'Subscription summary fetched successfully',
    data: {
      statuses: { active, suspended, pending, expired, cancelled, superseded },
      attention: { expiringIn7, expiringIn30, inGrace, companiesWithoutPlan, pendingRequests },
      flags: { autoRenewOn, trials },
      byPlan: byPlan.map((row) => ({
        planId: row.planId,
        planName: row.plan?.name || 'Unknown',
        planStatus: row.plan?.status || null,
        price: Number(row.plan?.price || 0),
        billingCycle: row.plan?.billingCycle || null,
        currency: row.plan?.currency || 'INR',
        companies: Number(row.total),
      })),
      revenue: { collected: Number(revenue?.total || 0), currency: 'INR' },
    },
  });
});

/** GET /subscriptions/:id - one term with its full transition trail. */
const getById = asyncHandler(async (req, res) => {
  const subscription = await findSubscriptionOrFail(req.params.id, {
    include: [
      ...service.subscriptionInclude(),
      { model: db.Transaction, as: 'transactions' },
      { model: db.CompanySubscription, as: 'previousSubscription', attributes: ['id', 'planId', 'startDate', 'endDate', 'status'] },
    ],
  });

  const [events, siblings] = await Promise.all([
    db.SubscriptionEvent.findAll({
      where: { subscriptionId: subscription.id },
      include: [
        { model: db.Plan, as: 'fromPlan', attributes: ['id', 'name'] },
        { model: db.Plan, as: 'toPlan', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    }),
    db.CompanySubscription.findAll({
      where: { companyId: subscription.companyId },
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name'] }],
      order: [['startDate', 'DESC'], ['id', 'DESC']],
      limit: 50,
    }),
  ]);

  const plain = present(subscription);
  plain.events = events;
  plain.companyTimeline = siblings.map(present);

  return success(res, { message: 'Subscription fetched successfully', data: plain });
});

/** GET /subscriptions/:id/events */
const listEvents = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const result = await db.SubscriptionEvent.findAndCountAll({
    where: { subscriptionId: req.params.id },
    include: [
      { model: db.Plan, as: 'fromPlan', attributes: ['id', 'name'] },
      { model: db.Plan, as: 'toPlan', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return paginated(res, result, { page, limit }, 'Subscription events fetched successfully');
});

/* ------------------------------------------------------------------ *
 * Transitions
 * ------------------------------------------------------------------ */

/** POST /subscriptions/:id/transition - the guarded, generic status move. */
const transition = asyncHandler(async (req, res) => {
  const subscription = await findSubscriptionOrFail(req.params.id);
  await db.sequelize.transaction((t) =>
    service.transitionStatus({
      subscription,
      to: req.body.status,
      reason: req.body.reason ?? null,
      actorId: req.auth?.id,
      actor: actorOf(req),
      transaction: t,
    })
  );

  const fresh = await findSubscriptionOrFail(subscription.id, { include: service.subscriptionInclude() });
  return success(res, { message: `Subscription marked ${req.body.status}`, data: present(fresh) });
});

/** Named shortcuts, so the console reads as verbs rather than status strings. */
const shortcut = (to, message) =>
  asyncHandler(async (req, res) => {
    const subscription = await findSubscriptionOrFail(req.params.id);
    await db.sequelize.transaction((t) =>
      service.transitionStatus({
        subscription,
        to,
        reason: req.body?.reason ?? null,
        actorId: req.auth?.id,
        actor: actorOf(req),
        transaction: t,
      })
    );
    const fresh = await findSubscriptionOrFail(subscription.id, { include: service.subscriptionInclude() });
    return success(res, { message, data: present(fresh) });
  });

const suspend = shortcut(SUBSCRIPTION_STATUS.SUSPENDED, 'Subscription suspended');
const resume = shortcut(SUBSCRIPTION_STATUS.ACTIVE, 'Subscription resumed');
const cancel = shortcut(SUBSCRIPTION_STATUS.CANCELLED, 'Subscription cancelled');
const expire = shortcut(SUBSCRIPTION_STATUS.EXPIRED, 'Subscription expired');
/** Starting a queued term ahead of its date re-bases it on today. */
const startNow = shortcut(SUBSCRIPTION_STATUS.ACTIVE, 'Scheduled plan started');

/** POST /subscriptions/:id/reactivate - a fresh term on a finished subscription. */
const reactivate = asyncHandler(async (req, res) => {
  const subscription = await findSubscriptionOrFail(req.params.id);
  if (!TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    throw ApiError.badRequest('Only an expired, cancelled or superseded subscription can be reactivated');
  }

  const result = await db.sequelize.transaction(async (t) => {
    const company = await findCompanyOrFail(subscription.companyId, t);
    return service.reactivate({
      company,
      subscription,
      payload: req.body,
      actorId: req.auth?.id,
      actor: actorOf(req),
      transaction: t,
    });
  });

  return created(res, 'Subscription reactivated successfully', {
    subscription: await presentFresh(result.subscription),
    transaction: result.transaction,
  });
});

/** POST /subscriptions/:id/extend */
const extend = asyncHandler(async (req, res) => {
  const subscription = await findSubscriptionOrFail(req.params.id);
  await db.sequelize.transaction((t) =>
    service.extendTerm({
      subscription,
      days: req.body.days,
      reason: req.body.reason ?? null,
      actorId: req.auth?.id,
      actor: actorOf(req),
      transaction: t,
    })
  );

  const fresh = await findSubscriptionOrFail(subscription.id, { include: service.subscriptionInclude() });
  return success(res, { message: `Term extended by ${req.body.days} day(s)`, data: present(fresh) });
});

/** PATCH /subscriptions/:id/auto-renew */
const autoRenew = asyncHandler(async (req, res) => {
  const subscription = await findSubscriptionOrFail(req.params.id);
  await db.sequelize.transaction((t) =>
    service.setAutoRenew({
      subscription,
      autoRenew: req.body.autoRenew,
      actorId: req.auth?.id,
      actor: actorOf(req),
      transaction: t,
    })
  );
  return success(res, {
    message: req.body.autoRenew ? 'Auto renew switched on' : 'Auto renew switched off',
    data: { id: subscription.id, autoRenew: req.body.autoRenew },
  });
});

/** POST /subscriptions/run-due - runs the expiry/activation sweep on demand. */
const runDue = asyncHandler(async (req, res) => {
  const result = await service.runDueSubscriptions({ actorId: req.auth?.id, actor: actorOf(req) });
  return success(res, { message: 'Subscription sweep completed', data: result });
});

/* ------------------------------------------------------------------ *
 * Per-company actions
 * ------------------------------------------------------------------ */

/** POST /companies/:id/subscriptions/renew - renew now, or queue a pre-renewal. */
const renew = asyncHandler(async (req, res) => {
  const result = await db.sequelize.transaction(async (t) => {
    const company = await findCompanyOrFail(req.params.id, t);
    return service.renewSubscription({
      company,
      payload: req.body,
      actorId: req.auth?.id,
      actor: actorOf(req),
      transaction: t,
    });
  });

  return created(
    res,
    result.scheduled
      ? `Renewal scheduled - it starts on ${result.subscription.startDate}`
      : 'Plan renewed successfully',
    {
      subscription: await presentFresh(result.subscription),
      transaction: result.transaction,
      scheduled: result.scheduled,
    }
  );
});

/** POST /companies/:id/subscriptions/change-plan - upgrade or downgrade mid-term. */
const changePlan = asyncHandler(async (req, res) => {
  const result = await db.sequelize.transaction(async (t) => {
    const company = await findCompanyOrFail(req.params.id, t);
    return service.changePlan({
      company,
      payload: req.body,
      actorId: req.auth?.id,
      actor: actorOf(req),
      transaction: t,
    });
  });

  return created(res, `Plan ${result.changeType}d successfully`, {
    subscription: await presentFresh(result.subscription),
    transaction: result.transaction,
    changeType: result.changeType,
    creditApplied: result.creditApplied,
    proration: result.proration,
  });
});

/** GET /companies/:id/subscriptions/change-preview?planId= - proration, before committing. */
const changePreview = asyncHandler(async (req, res) => {
  await findCompanyOrFail(req.params.id);
  const data = await service.previewPlanChange({
    companyId: Number(req.params.id),
    planId: Number(req.query.planId),
    applyCredit: req.query.applyCredit !== false && req.query.applyCredit !== 'false',
  });
  return success(res, { message: 'Plan change preview generated', data });
});

/** GET /companies/:id/plan - the company's plan at a glance, timer included. */
const companyPlan = asyncHandler(async (req, res) => {
  const company = await findCompanyOrFail(req.params.id);

  const [current, scheduled, history] = await Promise.all([
    db.CompanySubscription.findOne({
      where: { companyId: company.id, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
      include: service.subscriptionInclude(),
      order: [['id', 'DESC']],
    }),
    db.CompanySubscription.findOne({
      where: { companyId: company.id, status: SUBSCRIPTION_STATUS.PENDING },
      include: service.subscriptionInclude(),
      order: [['startDate', 'ASC']],
    }),
    db.CompanySubscription.findAll({
      where: { companyId: company.id },
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'currency', 'billingCycle'] }],
      order: [['startDate', 'DESC'], ['id', 'DESC']],
      limit: 50,
    }),
  ]);

  const events = await db.SubscriptionEvent.findAll({
    where: { companyId: company.id },
    include: [
      { model: db.Plan, as: 'fromPlan', attributes: ['id', 'name'] },
      { model: db.Plan, as: 'toPlan', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 100,
  });

  return success(res, {
    message: 'Company plan fetched successfully',
    data: {
      company: { id: company.id, name: company.name, code: company.code, currency: company.currency, status: company.status },
      current: present(current),
      scheduled: present(scheduled),
      history: history.map(present),
      events,
      // Lets the super admin's screens grey out "Add branch" for the same reason
      // the tenant's own does.
      quota: await quotaService.getQuota(company.id),
    },
  });
});

/**
 * GET /my-company/plan
 * The tenant's own read-only view: what it is on, how long is left, what the
 * limits are and what has been paid. Scoped to the token's company, never a
 * path parameter, so one tenant cannot read another's billing.
 */
const myPlan = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;
  const company = await findCompanyOrFail(companyId);

  const [current, scheduled, history, transactions, totals] = await Promise.all([
    db.CompanySubscription.findOne({
      where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
      include: service.subscriptionInclude(),
      order: [['id', 'DESC']],
    }),
    db.CompanySubscription.findOne({
      where: { companyId, status: SUBSCRIPTION_STATUS.PENDING },
      include: service.subscriptionInclude(),
      order: [['startDate', 'ASC']],
    }),
    db.CompanySubscription.findAll({
      where: { companyId },
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'currency', 'billingCycle'] }],
      order: [['startDate', 'DESC'], ['id', 'DESC']],
      limit: 50,
    }),
    db.Transaction.findAll({
      where: { companyId },
      include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name'] }],
      order: [['paidAt', 'DESC'], ['id', 'DESC']],
      limit: 100,
    }),
    db.Transaction.findOne({
      where: { companyId, status: TRANSACTION_STATUS.SUCCESS },
      attributes: [
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'totalPaid'],
        [fn('COUNT', col('id')), 'transactionCount'],
      ],
      raw: true,
    }),
  ]);

  // The same numbers the create buttons are greyed out from, so "3 of 5 admins"
  // on this screen and a refused create can never tell different stories.
  const quota = await quotaService.getQuota(companyId);

  return success(res, {
    message: 'Plan fetched successfully',
    data: {
      company: { id: company.id, name: company.name, code: company.code, currency: company.currency },
      current: service.decorate(current),
      scheduled: service.decorate(scheduled),
      history: history.map(service.decorate),
      transactions,
      /** Per-metric usage, plus why creating more is blocked when it is. */
      quota,
      usage: quota.metrics,
      planLimits: quota.planLimits,
      billing: {
        totalPaid: Number(totals?.totalPaid || 0),
        transactionCount: Number(totals?.transactionCount || 0),
        currency: company.currency,
      },
    },
  });
});

module.exports = {
  list,
  summary,
  myPlan,
  getById,
  listEvents,
  transition,
  suspend,
  resume,
  cancel,
  expire,
  startNow,
  reactivate,
  extend,
  autoRenew,
  runDue,
  renew,
  changePlan,
  changePreview,
  companyPlan,
};
