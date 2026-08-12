'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const service = require('../services/subscription.service');
const {
  STATUS,
  PLAN_REQUEST_STATUS,
  PLAN_REQUEST_TYPE,
  SUBSCRIPTION_CHANGE_TYPE,
  OCCUPYING_SUBSCRIPTION_STATUSES,
} = require('../constants');

const PLAN_ATTRIBUTES = [
  'id', 'name', 'code', 'description', 'price', 'discountPrice', 'currency', 'billingCycle',
  'durationDays', 'trialDays', 'maxBranches', 'maxAdmins', 'maxUsers', 'storageMb',
  'features', 'isPopular', 'sequence', 'status',
];

const requestInclude = () => [
  { model: db.Company, as: 'company', attributes: ['id', 'name', 'code', 'email', 'logo', 'status'] },
  { model: db.Plan, as: 'requestedPlan', attributes: PLAN_ATTRIBUTES },
  { model: db.Plan, as: 'currentPlan', attributes: ['id', 'name', 'price', 'currency', 'billingCycle'] },
];

/** The subscription the company is living on right now, if any. */
const runningSubscription = (companyId, transaction) =>
  db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    include: [{ model: db.Plan, as: 'plan' }],
    order: [['id', 'DESC']],
    transaction,
  });

/* ------------------------------------------------------------------ *
 * Tenant side
 * ------------------------------------------------------------------ */

/**
 * GET /my-company/plans
 * The catalogue a tenant may ask to move to, each one already compared against
 * what it is on today so the workspace can label the buttons honestly.
 */
const availablePlans = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;

  const [plans, current, pending] = await Promise.all([
    db.Plan.findAll({
      where: { status: STATUS.ACTIVE },
      attributes: PLAN_ATTRIBUTES,
      order: [['sequence', 'ASC'], ['price', 'ASC']],
    }),
    runningSubscription(companyId),
    db.PlanRequest.findOne({
      where: { companyId, status: PLAN_REQUEST_STATUS.PENDING },
      include: [{ model: db.Plan, as: 'requestedPlan', attributes: ['id', 'name'] }],
    }),
  ]);

  const currentPlan = current?.plan ?? null;
  const rows = plans.map((plan) => {
    const isCurrent = currentPlan ? Number(plan.id) === Number(currentPlan.id) : false;
    return {
      ...plan.toJSON(),
      isCurrent,
      // Same daily-value comparison the platform uses, so "upgrade" means the
      // same thing on both sides of the product.
      change: isCurrent ? null : service.classifyChange(currentPlan, plan),
    };
  });

  return success(res, {
    message: 'Plans fetched successfully',
    data: {
      plans: rows,
      currentPlanId: currentPlan?.id ?? null,
      currentSubscription: service.decorate(current),
      pendingRequest: pending,
    },
  });
});

/** GET /my-company/plan-requests */
const myRequests = asyncHandler(async (req, res) => {
  const rows = await db.PlanRequest.findAll({
    where: { companyId: req.auth.companyId },
    include: [
      { model: db.Plan, as: 'requestedPlan', attributes: ['id', 'name', 'price', 'currency', 'billingCycle'] },
      { model: db.Plan, as: 'currentPlan', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 50,
  });
  return success(res, { message: 'Plan requests fetched successfully', data: rows });
});

/**
 * POST /my-company/plan-requests
 * Raises the request. Deliberately writes nothing to the subscription - the
 * company is asking, not buying.
 */
const createRequest = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;

  const plan = await db.Plan.findByPk(req.body.planId);
  if (!plan) throw ApiError.notFound('Plan not found');
  if (plan.status !== STATUS.ACTIVE) throw ApiError.badRequest('That plan is not available');

  const open = await db.PlanRequest.findOne({
    where: { companyId, status: PLAN_REQUEST_STATUS.PENDING },
  });
  if (open) {
    throw ApiError.badRequest('You already have a plan request awaiting a decision');
  }

  const current = await runningSubscription(companyId);
  if (current && Number(current.planId) === Number(plan.id)) {
    throw ApiError.badRequest('You are already on this plan');
  }

  const type = current?.plan
    ? service.classifyChange(current.plan, plan)
    : PLAN_REQUEST_TYPE.NEW;

  const request = await db.PlanRequest.create({
    companyId,
    requestedPlanId: plan.id,
    currentPlanId: current?.planId ?? null,
    // A like-for-like swap is still an upgrade request as far as the desk is concerned.
    type: [PLAN_REQUEST_TYPE.UPGRADE, PLAN_REQUEST_TYPE.DOWNGRADE].includes(type)
      ? type
      : current
        ? PLAN_REQUEST_TYPE.UPGRADE
        : PLAN_REQUEST_TYPE.NEW,
    status: PLAN_REQUEST_STATUS.PENDING,
    note: req.body.note ?? null,
    requestedById: req.auth.id,
    requestedByName: req.auth.name ?? null,
    createdBy: req.auth.id,
  });

  const fresh = await db.PlanRequest.findByPk(request.id, {
    include: [
      { model: db.Plan, as: 'requestedPlan', attributes: ['id', 'name', 'price', 'currency', 'billingCycle'] },
      { model: db.Plan, as: 'currentPlan', attributes: ['id', 'name'] },
    ],
  });

  return created(res, 'Plan request sent - your account manager will be in touch', fresh);
});

/** POST /my-company/plan-requests/:id/cancel - the tenant withdrawing its own ask. */
const cancelMyRequest = asyncHandler(async (req, res) => {
  const request = await db.PlanRequest.findOne({
    where: { id: req.params.id, companyId: req.auth.companyId },
  });
  if (!request) throw ApiError.notFound('Plan request not found');
  if (request.status !== PLAN_REQUEST_STATUS.PENDING) {
    throw ApiError.badRequest(`This request was already ${request.status}`);
  }

  await request.update({
    status: PLAN_REQUEST_STATUS.CANCELLED,
    decidedAt: new Date(),
    updatedBy: req.auth.id,
  });

  return success(res, { message: 'Plan request cancelled', data: { id: request.id } });
});

/* ------------------------------------------------------------------ *
 * Platform side
 * ------------------------------------------------------------------ */

/** GET /plan-requests */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const companyWhere = buildSearch(req.query.search, ['name', 'code', 'email']);

  const where = mergeWhere(
    req.query.status ? { status: req.query.status } : null,
    req.query.type ? { type: req.query.type } : null,
    req.query.companyId ? { companyId: req.query.companyId } : null
  );

  const result = await db.PlanRequest.findAndCountAll({
    where,
    include: [
      { ...requestInclude()[0], required: Boolean(companyWhere), where: companyWhere || undefined },
      requestInclude()[1],
      requestInclude()[2],
    ],
    order: getSort(req.query, ['created_at', 'status', 'type'], [['createdAt', 'DESC'], ['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  return paginated(res, result, { page, limit }, 'Plan requests fetched successfully');
});

/**
 * POST /plan-requests/:id/approve
 * The decision that actually moves the company: a plan change when a term is
 * running, a straight activation when there is none. The subscription it writes
 * is linked back so the two can be traced together.
 */
const approve = asyncHandler(async (req, res) => {
  const request = await db.PlanRequest.findByPk(req.params.id);
  if (!request) throw ApiError.notFound('Plan request not found');
  if (request.status !== PLAN_REQUEST_STATUS.PENDING) {
    throw ApiError.badRequest(`This request was already ${request.status}`);
  }

  const actor = { id: req.auth?.id ?? null, name: req.auth?.name ?? null };

  const result = await db.sequelize.transaction(async (transaction) => {
    const company = await db.Company.findByPk(request.companyId, { transaction });
    if (!company) throw ApiError.notFound('Company not found');

    const payload = {
      planId: request.requestedPlanId,
      applyCredit: req.body.applyCredit !== false,
      discount: req.body.discount ?? 0,
      taxAmount: req.body.taxAmount ?? 0,
      graceDays: req.body.graceDays,
      autoRenew: req.body.autoRenew,
      remarks: req.body.remarks ?? `Approved plan request #${request.id}`,
      ...(req.body.payment ? { payment: req.body.payment } : {}),
    };

    const current = await runningSubscription(company.id, transaction);
    const outcome = current
      ? await service.changePlan({ company, payload, actorId: req.auth?.id, actor, transaction })
      : await service.activateSubscription({
          company,
          payload,
          actorId: req.auth?.id,
          actor,
          transaction,
          changeType: SUBSCRIPTION_CHANGE_TYPE.NEW,
        });

    await request.update(
      {
        status: PLAN_REQUEST_STATUS.APPROVED,
        decisionNote: req.body.decisionNote ?? null,
        decidedById: req.auth?.id ?? null,
        decidedByName: actor.name,
        decidedAt: new Date(),
        resultingSubscriptionId: outcome.subscription.id,
        updatedBy: req.auth?.id ?? null,
      },
      { transaction }
    );

    return outcome;
  });

  // Reloaded with its associations: the row `activateSubscription` returns is
  // freshly created and carries no plan or company, which the caller needs.
  const [fresh, hydrated] = await Promise.all([
    db.PlanRequest.findByPk(request.id, { include: requestInclude() }),
    db.CompanySubscription.findByPk(result.subscription.id, { include: service.subscriptionInclude() }),
  ]);

  return created(res, 'Plan request approved and the plan applied', {
    request: fresh,
    subscription: service.decorate(hydrated),
    transaction: result.transaction,
  });
});

/** POST /plan-requests/:id/reject */
const reject = asyncHandler(async (req, res) => {
  const request = await db.PlanRequest.findByPk(req.params.id);
  if (!request) throw ApiError.notFound('Plan request not found');
  if (request.status !== PLAN_REQUEST_STATUS.PENDING) {
    throw ApiError.badRequest(`This request was already ${request.status}`);
  }

  await request.update({
    status: PLAN_REQUEST_STATUS.REJECTED,
    decisionNote: req.body.decisionNote ?? null,
    decidedById: req.auth?.id ?? null,
    decidedByName: req.auth?.name ?? null,
    decidedAt: new Date(),
    updatedBy: req.auth?.id ?? null,
  });

  return success(res, {
    message: 'Plan request rejected',
    data: await db.PlanRequest.findByPk(request.id, { include: requestInclude() }),
  });
});

module.exports = {
  availablePlans,
  myRequests,
  createRequest,
  cancelMyRequest,
  list,
  approve,
  reject,
};
