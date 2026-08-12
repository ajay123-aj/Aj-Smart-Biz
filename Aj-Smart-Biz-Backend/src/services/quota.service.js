'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const subscriptionService = require('./subscription.service');
const { SUBSCRIPTION_STATUS, OCCUPYING_SUBSCRIPTION_STATUSES } = require('../constants');

/**
 * Plan limits, what is actually using them, and whether anything more may be
 * created. One place, so the API's answer and the button's disabled state can
 * never drift apart - the UI reads the same numbers the guard enforces.
 */

/** Why creation is blocked. `null` means it is not. */
const BLOCK_REASON = {
  NO_PLAN: 'no_plan',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  LIMIT_REACHED: 'limit_reached',
};

/** The countable resources a plan caps. */
const METRICS = {
  branches: { limitField: 'maxBranches', label: 'branch', plural: 'branches' },
  admins: { limitField: 'maxAdmins', label: 'admin', plural: 'admins' },
};

/**
 * Reads limits from the snapshot first: it is what the company was actually
 * sold, and editing a plan later must not silently change what an existing
 * term allows. The live plan is only a fallback for rows written before
 * snapshots existed.
 */
const limitOf = (subscription, field) => {
  const snapshot = subscription?.planSnapshot?.[field];
  if (snapshot !== undefined && snapshot !== null) return Number(snapshot);
  const live = subscription?.plan?.[field];
  return live === undefined || live === null ? null : Number(live);
};

/**
 * The whole quota picture for one company.
 *
 * A company with no running term is deliberately treated as blocked rather than
 * unlimited - "no plan" must never be the cheapest way to get infinite branches.
 */
async function getQuota(companyId) {
  const subscription = await db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    include: [{ model: db.Plan, as: 'plan' }],
    order: [['id', 'DESC']],
  });

  const [branchCount, adminCount, lastEnded] = await Promise.all([
    db.Branch.count({ where: { companyId } }),
    db.Admin.count({ where: { companyId } }),
    // Only interesting when nothing is running: it tells the tenant whether the
    // plan lapsed or was never there at all.
    subscription
      ? null
      : db.CompanySubscription.findOne({
          where: { companyId },
          include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name'] }],
          order: [['endDate', 'DESC'], ['id', 'DESC']],
        }),
  ]);

  const decorated = subscriptionService.decorate(subscription);
  const used = { branches: branchCount, admins: adminCount };

  // A plan-wide block outranks any per-metric limit: there is no point telling
  // someone they have 3 branches left when their plan is suspended.
  let blockedBy = null;
  if (!subscription) {
    blockedBy = lastEnded ? BLOCK_REASON.EXPIRED : BLOCK_REASON.NO_PLAN;
  } else if (subscription.status === SUBSCRIPTION_STATUS.SUSPENDED) {
    blockedBy = BLOCK_REASON.SUSPENDED;
  }

  const metrics = {};
  Object.entries(METRICS).forEach(([key, meta]) => {
    const limit = limitOf(subscription, meta.limitField);
    const usedCount = used[key] ?? 0;
    // A null limit means the plan does not cap this resource at all.
    const unlimited = limit === null || limit === 0;
    const remaining = unlimited ? null : Math.max(0, limit - usedCount);
    const atLimit = !unlimited && usedCount >= limit;

    metrics[key] = {
      used: usedCount,
      limit: unlimited ? null : limit,
      remaining,
      unlimited,
      percentUsed: unlimited ? 0 : Math.min(100, Math.round((usedCount / limit) * 100)),
      atLimit,
      canCreate: !blockedBy && !atLimit,
      reason: blockedBy ?? (atLimit ? BLOCK_REASON.LIMIT_REACHED : null),
      message: messageFor(blockedBy ?? (atLimit ? BLOCK_REASON.LIMIT_REACHED : null), meta, limit),
    };
  });

  return {
    // Informational only: there is no separate user record in this system yet,
    // and reporting admins as users would overstate what is being tracked.
    planLimits: {
      maxBranches: limitOf(subscription, 'maxBranches'),
      maxAdmins: limitOf(subscription, 'maxAdmins'),
      maxUsers: limitOf(subscription, 'maxUsers'),
      storageMb: limitOf(subscription, 'storageMb'),
    },
    subscription: decorated,
    plan: subscription
      ? {
          id: subscription.planId,
          name: subscription.planSnapshot?.name ?? subscription.plan?.name ?? null,
          status: subscription.status,
          endDate: subscription.endDate,
        }
      : null,
    lastPlanName: lastEnded?.plan?.name ?? lastEnded?.planSnapshot?.name ?? null,
    blockedBy,
    blockMessage: blockedBy ? messageFor(blockedBy, null, null) : null,
    metrics,
  };
}

/** One wording for every surface, so the toast and the banner agree. */
function messageFor(reason, meta, limit) {
  switch (reason) {
    case BLOCK_REASON.NO_PLAN:
      return 'No plan is active for this company. A plan must be assigned before anything more can be created.';
    case BLOCK_REASON.EXPIRED:
      return 'Your plan has expired. Renew or upgrade it to continue.';
    case BLOCK_REASON.SUSPENDED:
      return 'Your plan is suspended. It must be reactivated before anything more can be created.';
    case BLOCK_REASON.LIMIT_REACHED:
      return meta
        ? `Your plan allows ${limit} ${limit === 1 ? meta.label : meta.plural}. Upgrade your plan to add more.`
        : 'You have reached the limit your plan allows. Upgrade your plan to add more.';
    default:
      return null;
  }
}

/**
 * The guard the create routes call. Throws the same message the UI is showing,
 * so a request that slips past a disabled button fails for a readable reason.
 */
async function assertCanCreate(companyId, metric) {
  if (!METRICS[metric]) throw new Error(`Unknown quota metric: ${metric}`);

  const quota = await getQuota(companyId);
  const line = quota.metrics[metric];
  if (line.canCreate) return quota;

  throw ApiError.badRequest(line.message, [
    { field: metric, message: line.message, reason: line.reason, used: line.used, limit: line.limit },
  ]);
}

module.exports = { getQuota, assertCanCreate, BLOCK_REASON, METRICS };
