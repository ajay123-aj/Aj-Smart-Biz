'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { generateInvoiceNo } = require('./code.service');
const {
  BILLING_CYCLE_DAYS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_TRANSITIONS,
  SUBSCRIPTION_CHANGE_TYPE,
  SUBSCRIPTION_EVENT,
  OCCUPYING_SUBSCRIPTION_STATUSES,
  EXPIRY_WARNING_DAYS,
  TRANSACTION_STATUS,
  PAYMENT_MODE,
} = require('../constants');

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ *
 * Dates
 *
 * `start_date` / `end_date` are DATEONLY, so everything here works in
 * local calendar days. Formatting via toISOString() would shift the day
 * either side of midnight in +05:30, which is exactly the window where
 * an expiry timer is being watched.
 * ------------------------------------------------------------------ */

const toDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const startOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
};

/** The last instant of a calendar day - a term ends when its end date is over, not when it begins. */
const endOfDay = (value) => {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const addDays = (value, days) => {
  const date = value instanceof Date ? new Date(value) : startOfDay(value);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
};

const dayDiff = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

const money = (value) => Number.parseFloat(Number(value || 0).toFixed(2));

/* ------------------------------------------------------------------ *
 * Read helpers
 * ------------------------------------------------------------------ */

/** Full graph the detail screen renders. */
const subscriptionInclude = () => [
  {
    model: db.Plan,
    as: 'plan',
    attributes: [
      'id', 'name', 'code', 'price', 'discountPrice', 'currency', 'billingCycle',
      'durationDays', 'trialDays', 'maxBranches', 'maxAdmins', 'maxUsers', 'storageMb',
      'features', 'status',
    ],
  },
  { model: db.Company, as: 'company', attributes: ['id', 'name', 'code', 'email', 'phone', 'logo', 'status', 'currency'] },
];

/**
 * Adds everything the expiry timer and the progress bar need, computed once on
 * the server so both consoles agree on what "3 days left" means.
 */
function decorate(subscription) {
  if (!subscription) return null;
  const plain = typeof subscription.toJSON === 'function' ? subscription.toJSON() : { ...subscription };

  const graceDays = Number(plain.graceDays || 0);
  const expiresAt = endOfDay(plain.endDate);
  const graceEndsAt = graceDays > 0 ? endOfDay(addDays(plain.endDate, graceDays)) : expiresAt;
  const now = new Date();

  const termDays = Math.max(1, dayDiff(plain.startDate, plain.endDate));
  const elapsedDays = Math.min(termDays, Math.max(0, dayDiff(plain.startDate, now)));
  const daysRemaining = dayDiff(now, plain.endDate);
  const isLive = OCCUPYING_SUBSCRIPTION_STATUSES.includes(plain.status);

  plain.timer = {
    startsAt: startOfDay(plain.startDate).toISOString(),
    expiresAt: expiresAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    /** Milliseconds the front end counts down from; negative once the term is over. */
    msRemaining: expiresAt.getTime() - now.getTime(),
    daysRemaining,
    termDays,
    elapsedDays,
    percentUsed: Math.min(100, Math.round((elapsedDays / termDays) * 100)),
    hasStarted: now >= startOfDay(plain.startDate),
    isExpired: isLive && now > graceEndsAt,
    inGrace: isLive && now > expiresAt && now <= graceEndsAt,
    isExpiringSoon: isLive && daysRemaining >= 0 && daysRemaining <= EXPIRY_WARNING_DAYS,
  };

  return plain;
}

/** What this subscription is allowed to do next, so the UI never offers a dead button. */
function availableTransitions(status) {
  return SUBSCRIPTION_TRANSITIONS[status] ?? [];
}

/* ------------------------------------------------------------------ *
 * Write helpers
 * ------------------------------------------------------------------ */

async function logEvent(payload, transaction) {
  return db.SubscriptionEvent.create(
    {
      companyId: payload.companyId,
      subscriptionId: payload.subscriptionId ?? null,
      type: payload.type,
      fromStatus: payload.fromStatus ?? null,
      toStatus: payload.toStatus ?? null,
      fromPlanId: payload.fromPlanId ?? null,
      toPlanId: payload.toPlanId ?? null,
      amount: payload.amount ?? null,
      effectiveAt: payload.effectiveAt ?? new Date(),
      reason: payload.reason ?? null,
      meta: payload.meta ?? null,
      actorId: payload.actor?.id ?? payload.actorId ?? null,
      actorName: payload.actor?.name ?? null,
      createdBy: payload.actor?.id ?? payload.actorId ?? null,
    },
    { transaction }
  );
}

/**
 * Rewrites the denormalised pointers on the company row from whatever is
 * actually occupying its subscription slot. Every path that changes a status
 * ends here, so the two can never drift.
 */
async function syncCompanyPointer(companyId, actorId, transaction) {
  const current = await db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    order: [['startDate', 'DESC'], ['id', 'DESC']],
    transaction,
  });

  await db.Company.update(
    {
      currentSubscriptionId: current ? current.id : null,
      subscriptionEndDate: current ? current.endDate : null,
      updatedBy: actorId ?? null,
    },
    { where: { id: companyId }, transaction }
  );

  return current;
}

const planTermDays = (plan, override) =>
  Number(override) || Number(plan.durationDays) || BILLING_CYCLE_DAYS[plan.billingCycle] || 30;

const planEffectivePrice = (plan) => money(plan.discountPrice ?? plan.price);

/** Daily value of a plan - the only fair way to compare a monthly against a yearly. */
const planDailyRate = (plan) => planEffectivePrice(plan) / Math.max(1, planTermDays(plan));

const snapshotOf = (plan) => ({
  id: plan.id,
  name: plan.name,
  code: plan.code,
  price: plan.price,
  discountPrice: plan.discountPrice,
  currency: plan.currency,
  billingCycle: plan.billingCycle,
  durationDays: plan.durationDays,
  trialDays: plan.trialDays,
  maxBranches: plan.maxBranches,
  maxAdmins: plan.maxAdmins,
  maxUsers: plan.maxUsers,
  storageMb: plan.storageMb,
  features: plan.features,
});

/**
 * Turns a plan plus whatever the operator typed into a priced, dated term.
 * `isTrial` zeroes the money and uses the plan's trial length.
 */
function resolveTerms({ plan, payload = {}, startFrom }) {
  const start = startOfDay(startFrom ?? payload.startDate ?? new Date());
  const isTrial = payload.isTrial ?? false;

  const durationDays = isTrial && !payload.durationDays
    ? Number(plan.trialDays) || planTermDays(plan)
    : planTermDays(plan, payload.durationDays);

  // A 30-day term that starts today ends on day 30, not day 31.
  const end = addDays(start, Math.max(1, durationDays) - 1);

  const amount = isTrial ? 0 : money(payload.amount ?? planEffectivePrice(plan));
  const discount = isTrial ? 0 : money(payload.discount);
  const taxAmount = isTrial ? 0 : money(payload.taxAmount);
  const creditApplied = money(payload.creditApplied);
  const totalAmount = money(Math.max(0, amount - discount - creditApplied + taxAmount));

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    durationDays,
    amount,
    discount,
    taxAmount,
    creditApplied,
    totalAmount,
    currency: plan.currency,
    isTrial,
  };
}

async function recordPayment({ company, subscription, plan, terms, payment, actorId, transaction }) {
  return db.Transaction.create(
    {
      companyId: company.id,
      subscriptionId: subscription.id,
      planId: plan.id,
      invoiceNo: await generateInvoiceNo(transaction),
      amount: terms.amount,
      discount: money(terms.discount + terms.creditApplied),
      taxAmount: terms.taxAmount,
      totalAmount: terms.totalAmount,
      currency: terms.currency,
      paymentMode: payment.paymentMode || PAYMENT_MODE.OTHER,
      paymentReference: payment.paymentReference ?? null,
      status: payment.status || TRANSACTION_STATUS.SUCCESS,
      paidAt: payment.paidAt ? new Date(payment.paidAt) : new Date(),
      remarks: payment.remarks ?? null,
      createdBy: actorId ?? null,
    },
    { transaction }
  );
}

/* ------------------------------------------------------------------ *
 * Creating terms
 * ------------------------------------------------------------------ */

/**
 * Activates a plan for a company, or schedules it when the start date is still
 * ahead. Closes whatever is running, writes the new term, optionally records
 * the payment, and refreshes the company pointers.
 *
 * Always call inside a Sequelize transaction.
 */
async function activateSubscription({
  company,
  payload,
  actorId,
  actor,
  transaction,
  changeType = SUBSCRIPTION_CHANGE_TYPE.NEW,
  previousSubscription = null,
  supersedeWith = SUBSCRIPTION_STATUS.EXPIRED,
  eventType,
}) {
  const plan = await db.Plan.findByPk(payload.planId, { transaction });
  if (!plan) throw ApiError.notFound('Plan not found');

  const terms = resolveTerms({ plan, payload });
  const today = startOfDay(new Date());
  // A term that begins later waits its turn rather than cutting the current one short.
  const scheduled = startOfDay(terms.startDate) > today;
  const status = scheduled ? SUBSCRIPTION_STATUS.PENDING : SUBSCRIPTION_STATUS.ACTIVE;

  let replaced = null;
  if (!scheduled) {
    // Only one subscription may occupy the slot at a time.
    replaced = await db.CompanySubscription.findOne({
      where: { companyId: company.id, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
      order: [['id', 'DESC']],
      transaction,
    });

    if (replaced) {
      await replaced.update(
        { status: supersedeWith, endedAt: new Date(), updatedBy: actorId ?? null },
        { transaction }
      );
      await logEvent(
        {
          companyId: company.id,
          subscriptionId: replaced.id,
          type: supersedeWith === SUBSCRIPTION_STATUS.SUPERSEDED
            ? SUBSCRIPTION_EVENT.SUPERSEDED
            : SUBSCRIPTION_EVENT.EXPIRED,
          fromStatus: replaced.status,
          toStatus: supersedeWith,
          fromPlanId: replaced.planId,
          toPlanId: plan.id,
          reason: payload.remarks ?? null,
          actor,
          actorId,
        },
        transaction
      );
    }
  }

  const subscription = await db.CompanySubscription.create(
    {
      companyId: company.id,
      planId: plan.id,
      planSnapshot: snapshotOf(plan),
      startDate: terms.startDate,
      endDate: terms.endDate,
      amount: terms.amount,
      discount: terms.discount,
      taxAmount: terms.taxAmount,
      creditApplied: terms.creditApplied,
      totalAmount: terms.totalAmount,
      currency: terms.currency,
      isTrial: terms.isTrial,
      autoRenew: payload.autoRenew ?? false,
      graceDays: Number(payload.graceDays || 0),
      changeType: terms.isTrial && changeType === SUBSCRIPTION_CHANGE_TYPE.NEW
        ? SUBSCRIPTION_CHANGE_TYPE.TRIAL
        : changeType,
      previousSubscriptionId: previousSubscription?.id ?? replaced?.id ?? null,
      status,
      activatedAt: scheduled ? null : new Date(),
      remarks: payload.remarks ?? null,
      createdBy: actorId ?? null,
    },
    { transaction }
  );

  await logEvent(
    {
      companyId: company.id,
      subscriptionId: subscription.id,
      type: eventType || (scheduled ? SUBSCRIPTION_EVENT.SCHEDULED : SUBSCRIPTION_EVENT.ACTIVATED),
      fromStatus: replaced?.status ?? null,
      toStatus: status,
      fromPlanId: replaced?.planId ?? null,
      toPlanId: plan.id,
      amount: terms.totalAmount,
      effectiveAt: startOfDay(terms.startDate),
      reason: payload.remarks ?? null,
      meta: {
        changeType,
        startDate: terms.startDate,
        endDate: terms.endDate,
        durationDays: terms.durationDays,
        creditApplied: terms.creditApplied,
      },
      actor,
      actorId,
    },
    transaction
  );

  let paymentTransaction = null;
  if (payload.payment) {
    paymentTransaction = await recordPayment({
      company,
      subscription,
      plan,
      terms,
      payment: payload.payment,
      actorId,
      transaction,
    });
  }

  await syncCompanyPointer(company.id, actorId, transaction);

  return { subscription, transaction: paymentTransaction, plan, replaced, scheduled };
}

/**
 * Renews a company onto the same plan (or a different one) for another term.
 *
 * Called while the current term is still running it becomes a *pre-renewal*:
 * the new term is queued to start the day after the current one ends and the
 * sweeper switches it on by itself. Pass `immediate` to start it right away.
 */
async function renewSubscription({ company, payload = {}, actorId, actor, transaction }) {
  const current = await db.CompanySubscription.findOne({
    where: { companyId: company.id },
    order: [['startDate', 'DESC'], ['id', 'DESC']],
    transaction,
  });

  const queued = await db.CompanySubscription.findOne({
    where: { companyId: company.id, status: SUBSCRIPTION_STATUS.PENDING },
    transaction,
  });
  if (queued) {
    throw ApiError.badRequest('A renewal is already scheduled for this company - cancel it before adding another');
  }

  const planId = payload.planId ?? current?.planId;
  if (!planId) throw ApiError.badRequest('This company has never been on a plan - assign one first');

  const stillRunning = current && OCCUPYING_SUBSCRIPTION_STATUSES.includes(current.status);
  const startDate = payload.startDate
    ? toDateOnly(payload.startDate)
    : stillRunning && !payload.immediate
      ? toDateOnly(addDays(current.endDate, 1)) // pre-renewal: picks up the day the current term ends
      : toDateOnly(new Date());

  return activateSubscription({
    company,
    payload: {
      ...payload,
      planId,
      startDate,
      autoRenew: payload.autoRenew ?? current?.autoRenew ?? false,
      graceDays: payload.graceDays ?? current?.graceDays ?? 0,
    },
    actorId,
    actor,
    transaction,
    changeType: SUBSCRIPTION_CHANGE_TYPE.RENEWAL,
    previousSubscription: current,
    eventType: SUBSCRIPTION_EVENT.RENEWED,
  });
}

/**
 * Unused value left in a running term, credited against an upgrade.
 * Trials and already-finished terms are worth nothing.
 */
function prorationFor(subscription) {
  if (!subscription || subscription.isTrial) return { creditable: 0, remainingDays: 0, termDays: 0, dailyRate: 0 };

  const termDays = Math.max(1, dayDiff(subscription.startDate, subscription.endDate) + 1);
  const remainingDays = Math.max(0, dayDiff(new Date(), subscription.endDate) + 1);
  const paid = money(subscription.totalAmount);
  const dailyRate = paid / termDays;

  return {
    termDays,
    remainingDays,
    dailyRate: money(dailyRate),
    creditable: money(Math.min(paid, dailyRate * remainingDays)),
  };
}

/** Upgrade, downgrade or a like-for-like swap - decided by daily value, not sticker price. */
function classifyChange(fromPlan, toPlan) {
  if (!fromPlan) return SUBSCRIPTION_CHANGE_TYPE.NEW;
  const from = planDailyRate(fromPlan);
  const to = planDailyRate(toPlan);
  if (to > from) return SUBSCRIPTION_CHANGE_TYPE.UPGRADE;
  if (to < from) return SUBSCRIPTION_CHANGE_TYPE.DOWNGRADE;
  return SUBSCRIPTION_CHANGE_TYPE.CROSSGRADE;
}

/**
 * What an upgrade or downgrade would cost, without writing anything - so the
 * operator sees the credit and the payable before committing.
 */
async function previewPlanChange({ companyId, planId, applyCredit = true }) {
  const [target, current] = await Promise.all([
    db.Plan.findByPk(planId),
    db.CompanySubscription.findOne({
      where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
      include: [{ model: db.Plan, as: 'plan' }],
      order: [['id', 'DESC']],
    }),
  ]);
  if (!target) throw ApiError.notFound('Plan not found');

  const proration = prorationFor(current);
  const credit = applyCredit ? proration.creditable : 0;
  const price = planEffectivePrice(target);
  const terms = resolveTerms({ plan: target, payload: { creditApplied: credit } });

  return {
    changeType: classifyChange(current?.plan, target),
    currentPlan: current?.plan
      ? { id: current.plan.id, name: current.plan.name, price: current.plan.price, billingCycle: current.plan.billingCycle }
      : null,
    currentSubscription: current ? decorate(current) : null,
    targetPlan: { id: target.id, name: target.name, price: target.price, billingCycle: target.billingCycle },
    proration,
    pricing: {
      price,
      creditApplied: money(credit),
      taxAmount: 0,
      payable: terms.totalAmount,
      currency: target.currency,
      startDate: terms.startDate,
      endDate: terms.endDate,
      durationDays: terms.durationDays,
    },
    limitChanges: current?.plan
      ? {
          maxBranches: { from: current.plan.maxBranches, to: target.maxBranches },
          maxAdmins: { from: current.plan.maxAdmins, to: target.maxAdmins },
          maxUsers: { from: current.plan.maxUsers, to: target.maxUsers },
          storageMb: { from: current.plan.storageMb, to: target.storageMb },
        }
      : null,
  };
}

/**
 * Moves a company onto a different plan mid-term. The running term is marked
 * `superseded` rather than expired, because it did not run its course, and the
 * unused days come across as a credit unless the operator waives them.
 */
async function changePlan({ company, payload, actorId, actor, transaction }) {
  const current = await db.CompanySubscription.findOne({
    where: { companyId: company.id, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    include: [{ model: db.Plan, as: 'plan' }],
    order: [['id', 'DESC']],
    transaction,
  });
  if (!current) {
    throw ApiError.badRequest('This company has no running plan to change - assign or renew one instead');
  }
  if (Number(current.planId) === Number(payload.planId)) {
    throw ApiError.badRequest('The company is already on this plan');
  }

  const target = await db.Plan.findByPk(payload.planId, { transaction });
  if (!target) throw ApiError.notFound('Plan not found');

  const proration = prorationFor(current);
  const credit = payload.applyCredit === false ? 0 : money(payload.creditApplied ?? proration.creditable);
  const changeType = classifyChange(current.plan, target);

  const result = await activateSubscription({
    company,
    payload: {
      ...payload,
      creditApplied: credit,
      graceDays: payload.graceDays ?? current.graceDays,
      autoRenew: payload.autoRenew ?? current.autoRenew,
    },
    actorId,
    actor,
    transaction,
    changeType,
    previousSubscription: current,
    supersedeWith: SUBSCRIPTION_STATUS.SUPERSEDED,
    eventType:
      changeType === SUBSCRIPTION_CHANGE_TYPE.UPGRADE
        ? SUBSCRIPTION_EVENT.UPGRADED
        : changeType === SUBSCRIPTION_CHANGE_TYPE.DOWNGRADE
          ? SUBSCRIPTION_EVENT.DOWNGRADED
          : SUBSCRIPTION_EVENT.CROSSGRADED,
  });

  return { ...result, changeType, proration, creditApplied: credit, previous: current };
}

/* ------------------------------------------------------------------ *
 * Status transitions
 * ------------------------------------------------------------------ */

/**
 * `superseded` is absent on purpose - it is only ever set by `changePlan`,
 * alongside the term that replaces it, never as a move on its own.
 */
const TRANSITION_EVENT = {
  [SUBSCRIPTION_STATUS.SUSPENDED]: SUBSCRIPTION_EVENT.SUSPENDED,
  [SUBSCRIPTION_STATUS.CANCELLED]: SUBSCRIPTION_EVENT.CANCELLED,
  [SUBSCRIPTION_STATUS.EXPIRED]: SUBSCRIPTION_EVENT.EXPIRED,
};

/**
 * The single door every manual status change goes through. Illegal moves are
 * refused against `SUBSCRIPTION_TRANSITIONS` before anything is written.
 */
async function transitionStatus({ subscription, to, reason, actorId, actor, transaction }) {
  const from = subscription.status;
  if (from === to) throw ApiError.badRequest(`Subscription is already ${to}`);

  const allowed = availableTransitions(from);
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      allowed.length
        ? `Cannot move a subscription from ${from} to ${to} - allowed from here: ${allowed.join(', ')}`
        : `A ${from} subscription is final; create a new subscription instead`
    );
  }

  const now = new Date();
  const patch = { status: to, updatedBy: actorId ?? null };
  let eventType = TRANSITION_EVENT[to];

  if (to === SUBSCRIPTION_STATUS.SUSPENDED) {
    patch.suspendedAt = now;
  } else if (to === SUBSCRIPTION_STATUS.ACTIVE) {
    patch.suspendedAt = null;
    patch.activatedAt = subscription.activatedAt ?? now;
    eventType = from === SUBSCRIPTION_STATUS.SUSPENDED ? SUBSCRIPTION_EVENT.RESUMED : SUBSCRIPTION_EVENT.ACTIVATED;

    // Starting a queued term early re-bases it on today so the company gets its
    // full duration, and closes whatever it was queued behind.
    if (from === SUBSCRIPTION_STATUS.PENDING) {
      const termDays = Math.max(1, dayDiff(subscription.startDate, subscription.endDate) + 1);
      const start = startOfDay(now);
      patch.startDate = toDateOnly(start);
      patch.endDate = toDateOnly(addDays(start, termDays - 1));

      const occupying = await db.CompanySubscription.findOne({
        where: {
          companyId: subscription.companyId,
          id: { [Op.ne]: subscription.id },
          status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES },
        },
        transaction,
      });
      if (occupying) {
        await occupying.update(
          { status: SUBSCRIPTION_STATUS.EXPIRED, endedAt: now, updatedBy: actorId ?? null },
          { transaction }
        );
        await logEvent(
          {
            companyId: subscription.companyId,
            subscriptionId: occupying.id,
            type: SUBSCRIPTION_EVENT.EXPIRED,
            fromStatus: occupying.status,
            toStatus: SUBSCRIPTION_STATUS.EXPIRED,
            fromPlanId: occupying.planId,
            reason: 'Closed early because a scheduled plan was started',
            actor,
            actorId,
          },
          transaction
        );
      }
    }
  } else if (to === SUBSCRIPTION_STATUS.CANCELLED) {
    patch.cancelledAt = now;
    patch.endedAt = now;
    patch.autoRenew = false;
  } else if (to === SUBSCRIPTION_STATUS.EXPIRED) {
    patch.endedAt = now;
  }

  await subscription.update(patch, { transaction });

  await logEvent(
    {
      companyId: subscription.companyId,
      subscriptionId: subscription.id,
      type: eventType,
      fromStatus: from,
      toStatus: to,
      fromPlanId: subscription.planId,
      toPlanId: subscription.planId,
      reason: reason ?? null,
      actor,
      actorId,
    },
    transaction
  );

  await syncCompanyPointer(subscription.companyId, actorId, transaction);
  return subscription;
}

/** Brings a cancelled or expired company back on the same plan for a fresh term. */
async function reactivate({ company, subscription, payload = {}, actorId, actor, transaction }) {
  return activateSubscription({
    company,
    payload: {
      ...payload,
      planId: payload.planId ?? subscription.planId,
      graceDays: payload.graceDays ?? subscription.graceDays,
    },
    actorId,
    actor,
    transaction,
    changeType: SUBSCRIPTION_CHANGE_TYPE.REACTIVATION,
    previousSubscription: subscription,
    eventType: SUBSCRIPTION_EVENT.REACTIVATED,
  });
}

/** Pushes the end date out without charging - goodwill, or a deal still being signed. */
async function extendTerm({ subscription, days, reason, actorId, actor, transaction }) {
  if (!OCCUPYING_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    throw ApiError.badRequest('Only a running or suspended subscription can be extended');
  }
  const endDate = toDateOnly(addDays(subscription.endDate, days));
  await subscription.update({ endDate, updatedBy: actorId ?? null }, { transaction });

  await logEvent(
    {
      companyId: subscription.companyId,
      subscriptionId: subscription.id,
      type: SUBSCRIPTION_EVENT.TERM_EXTENDED,
      fromStatus: subscription.status,
      toStatus: subscription.status,
      fromPlanId: subscription.planId,
      toPlanId: subscription.planId,
      reason: reason ?? null,
      meta: { days, endDate },
      actor,
      actorId,
    },
    transaction
  );

  await syncCompanyPointer(subscription.companyId, actorId, transaction);
  return subscription;
}

async function setAutoRenew({ subscription, autoRenew, actorId, actor, transaction }) {
  await subscription.update({ autoRenew, updatedBy: actorId ?? null }, { transaction });
  await logEvent(
    {
      companyId: subscription.companyId,
      subscriptionId: subscription.id,
      type: autoRenew ? SUBSCRIPTION_EVENT.AUTO_RENEW_ON : SUBSCRIPTION_EVENT.AUTO_RENEW_OFF,
      fromStatus: subscription.status,
      toStatus: subscription.status,
      fromPlanId: subscription.planId,
      actor,
      actorId,
    },
    transaction
  );
  return subscription;
}

/* ------------------------------------------------------------------ *
 * The sweeper
 * ------------------------------------------------------------------ */

/**
 * Moves time forward: starts terms that were queued for today, and closes terms
 * whose end date (plus grace) has passed - auto-renewing the ones that asked
 * for it. Runs on boot, on a timer, and on demand from the console, so a
 * countdown that hits zero is followed by the status actually changing.
 */
async function runDueSubscriptions({ actorId = null, actor = null } = {}) {
  const now = new Date();
  const today = toDateOnly(now);
  const result = { activated: 0, expired: 0, renewed: 0, checkedAt: now.toISOString() };

  /* 1. Terms whose start date has arrived. */
  const due = await db.CompanySubscription.findAll({
    where: { status: SUBSCRIPTION_STATUS.PENDING, startDate: { [Op.lte]: today } },
    order: [['startDate', 'ASC'], ['id', 'ASC']],
  });

  for (const subscription of due) {
    // eslint-disable-next-line no-await-in-loop
    await db.sequelize.transaction(async (transaction) => {
      const occupying = await db.CompanySubscription.findOne({
        where: {
          companyId: subscription.companyId,
          id: { [Op.ne]: subscription.id },
          status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES },
        },
        transaction,
      });
      if (occupying) {
        await occupying.update(
          { status: SUBSCRIPTION_STATUS.EXPIRED, endedAt: now, updatedBy: actorId },
          { transaction }
        );
        await logEvent(
          {
            companyId: occupying.companyId,
            subscriptionId: occupying.id,
            type: SUBSCRIPTION_EVENT.EXPIRED,
            fromStatus: occupying.status,
            toStatus: SUBSCRIPTION_STATUS.EXPIRED,
            fromPlanId: occupying.planId,
            reason: 'Term ended; the scheduled renewal took over',
            actor,
            actorId,
          },
          transaction
        );
        result.expired += 1;
      }

      await subscription.update(
        { status: SUBSCRIPTION_STATUS.ACTIVE, activatedAt: now, updatedBy: actorId },
        { transaction }
      );
      await logEvent(
        {
          companyId: subscription.companyId,
          subscriptionId: subscription.id,
          type: SUBSCRIPTION_EVENT.ACTIVATED,
          fromStatus: SUBSCRIPTION_STATUS.PENDING,
          toStatus: SUBSCRIPTION_STATUS.ACTIVE,
          toPlanId: subscription.planId,
          reason: 'Scheduled start date reached',
          actor,
          actorId,
        },
        transaction
      );
      await syncCompanyPointer(subscription.companyId, actorId, transaction);
      result.activated += 1;
    });
  }

  /* 2. Terms that have run out - renewed when asked for, otherwise expired. */
  const running = await db.CompanySubscription.findAll({
    where: { status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES }, endDate: { [Op.lt]: today } },
    include: [{ model: db.Company, as: 'company' }],
    order: [['endDate', 'ASC'], ['id', 'ASC']],
  });

  for (const subscription of running) {
    if (now <= endOfDay(addDays(subscription.endDate, subscription.graceDays))) continue; // still inside grace

    // eslint-disable-next-line no-await-in-loop
    await db.sequelize.transaction(async (transaction) => {
      const fresh = await db.CompanySubscription.findByPk(subscription.id, { transaction });
      if (!fresh || !OCCUPYING_SUBSCRIPTION_STATUSES.includes(fresh.status)) return;

      await fresh.update(
        { status: SUBSCRIPTION_STATUS.EXPIRED, endedAt: now, updatedBy: actorId },
        { transaction }
      );
      await logEvent(
        {
          companyId: fresh.companyId,
          subscriptionId: fresh.id,
          type: SUBSCRIPTION_EVENT.EXPIRED,
          fromStatus: subscription.status,
          toStatus: SUBSCRIPTION_STATUS.EXPIRED,
          fromPlanId: fresh.planId,
          reason: fresh.graceDays > 0 ? 'Term and grace period ended' : 'Term ended',
          actor,
          actorId,
        },
        transaction
      );
      result.expired += 1;

      const company = subscription.company;
      if (fresh.autoRenew && company) {
        await activateSubscription({
          company,
          payload: {
            planId: fresh.planId,
            startDate: toDateOnly(now),
            autoRenew: true,
            graceDays: fresh.graceDays,
            remarks: 'Renewed automatically at the end of the term',
          },
          actorId,
          actor,
          transaction,
          changeType: SUBSCRIPTION_CHANGE_TYPE.RENEWAL,
          previousSubscription: fresh,
          eventType: SUBSCRIPTION_EVENT.RENEWED,
        });
        result.renewed += 1;
      } else {
        await syncCompanyPointer(fresh.companyId, actorId, transaction);
      }
    });
  }

  if (result.activated || result.expired || result.renewed) {
    logger.info(
      `Subscription sweep: ${result.activated} started, ${result.expired} expired, ${result.renewed} auto-renewed`
    );
  }
  return result;
}

module.exports = {
  activateSubscription,
  renewSubscription,
  changePlan,
  previewPlanChange,
  prorationFor,
  classifyChange,
  transitionStatus,
  reactivate,
  extendTerm,
  setAutoRenew,
  runDueSubscriptions,
  syncCompanyPointer,
  availableTransitions,
  subscriptionInclude,
  resolveTerms,
  decorate,
  logEvent,
  addDays,
  toDateOnly,
  startOfDay,
  endOfDay,
  dayDiff,
  money,
};
