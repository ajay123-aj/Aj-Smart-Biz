'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { SUBSCRIPTION_STATUS, OCCUPYING_SUBSCRIPTION_STATUSES } = require('../constants');

/**
 * Whether a tenant's plan still entitles it to be served, and if not, why.
 *
 * The reasons are the platform's own — the identical set `quota.service` blocks
 * branch and admin creation with — so a company blocked in the console cannot
 * have its public website carry on as though nothing happened.
 *
 * Deliberately coarse: a flag and a one-word reason, nothing else. It is read
 * by a public, unauthenticated endpoint, and a company's commercial position is
 * not its customers' business.
 */

/** The running term, if there is one. `suspended` still occupies the slot. */
async function runningSubscription(companyId, options = {}) {
  return db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    order: [['id', 'DESC']],
    ...options,
  });
}

/**
 * `{ active, reason }` where reason is `expired` | `suspended` | `no_plan`, or
 * null while the tenant is being served.
 *
 * Pass the running subscription when the caller has already loaded it; that is
 * the common case and saves the query.
 */
async function resolveServiceState(companyId, subscription = undefined) {
  const running = subscription === undefined ? await runningSubscription(companyId) : subscription;

  if (running) {
    // A suspended term keeps its dates and its money; the tenant just stops
    // being served until the platform switches it back on.
    return running.status === SUBSCRIPTION_STATUS.SUSPENDED
      ? { active: false, reason: 'suspended' }
      : { active: true, reason: null };
  }

  // Nothing running. Whether a term ever existed is the difference between a
  // plan that lapsed and a company that was never put on one.
  const everHadOne = await db.CompanySubscription.findOne({
    where: { companyId },
    attributes: ['id'],
    paranoid: false,
  });

  return { active: false, reason: everHadOne ? 'expired' : 'no_plan' };
}

module.exports = { runningSubscription, resolveServiceState };
