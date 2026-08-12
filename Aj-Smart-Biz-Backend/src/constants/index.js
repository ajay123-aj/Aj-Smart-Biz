'use strict';

const STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' };
const STATUS_VALUES = Object.values(STATUS);

const AUTH_SCOPE = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin' };

const SUPER_ADMIN_ROLE = { SUPER_ADMIN: 'super_admin', STAFF: 'staff' };

const BILLING_CYCLE = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  HALF_YEARLY: 'half_yearly',
  YEARLY: 'yearly',
  LIFETIME: 'lifetime',
};
const BILLING_CYCLE_DAYS = {
  monthly: 30,
  quarterly: 90,
  half_yearly: 180,
  yearly: 365,
  lifetime: 36500,
};

/**
 * Subscription lifecycle.
 *
 *   pending    scheduled ahead of time - starts on its own start date
 *   active     running
 *   suspended  paused by the platform; the term keeps its dates but access stops
 *   expired    the term ran out
 *   cancelled  ended early on purpose
 *   superseded replaced mid-term by an upgrade or downgrade
 */
const SUBSCRIPTION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUPERSEDED: 'superseded',
};
const SUBSCRIPTION_STATUS_VALUES = Object.values(SUBSCRIPTION_STATUS);

/** Statuses that still occupy the company's one-subscription-at-a-time slot. */
const OCCUPYING_SUBSCRIPTION_STATUSES = [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.SUSPENDED];

/** Statuses nothing can move out of - a new subscription is the only way forward. */
const TERMINAL_SUBSCRIPTION_STATUSES = [
  SUBSCRIPTION_STATUS.EXPIRED,
  SUBSCRIPTION_STATUS.CANCELLED,
  SUBSCRIPTION_STATUS.SUPERSEDED,
];

/**
 * Manual status transitions the API accepts, keyed by the current status.
 * Anything not listed here is rejected before it reaches the database.
 *
 * `superseded` is deliberately absent: it is what a plan change *does* to the
 * term it replaces, always alongside a replacement. Offering it as a standalone
 * move would let an operator strand a company with no plan and no record of why.
 */
const SUBSCRIPTION_TRANSITIONS = {
  [SUBSCRIPTION_STATUS.PENDING]: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.CANCELLED],
  [SUBSCRIPTION_STATUS.ACTIVE]: [
    SUBSCRIPTION_STATUS.SUSPENDED,
    SUBSCRIPTION_STATUS.CANCELLED,
    SUBSCRIPTION_STATUS.EXPIRED,
  ],
  [SUBSCRIPTION_STATUS.SUSPENDED]: [
    SUBSCRIPTION_STATUS.ACTIVE,
    SUBSCRIPTION_STATUS.CANCELLED,
    SUBSCRIPTION_STATUS.EXPIRED,
  ],
  [SUBSCRIPTION_STATUS.EXPIRED]: [],
  [SUBSCRIPTION_STATUS.CANCELLED]: [],
  [SUBSCRIPTION_STATUS.SUPERSEDED]: [],
};

/** How a subscription came to exist - drives the wording and the proration rules. */
const SUBSCRIPTION_CHANGE_TYPE = {
  NEW: 'new',
  RENEWAL: 'renewal',
  UPGRADE: 'upgrade',
  DOWNGRADE: 'downgrade',
  CROSSGRADE: 'crossgrade',
  REACTIVATION: 'reactivation',
  TRIAL: 'trial',
};
const SUBSCRIPTION_CHANGE_TYPE_VALUES = Object.values(SUBSCRIPTION_CHANGE_TYPE);

/** Every transition is appended to `subscription_events` under one of these. */
const SUBSCRIPTION_EVENT = {
  CREATED: 'created',
  ACTIVATED: 'activated',
  SCHEDULED: 'scheduled',
  RENEWED: 'renewed',
  UPGRADED: 'upgraded',
  DOWNGRADED: 'downgraded',
  CROSSGRADED: 'crossgraded',
  SUSPENDED: 'suspended',
  RESUMED: 'resumed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REACTIVATED: 'reactivated',
  SUPERSEDED: 'superseded',
  TERM_EXTENDED: 'term_extended',
  AUTO_RENEW_ON: 'auto_renew_on',
  AUTO_RENEW_OFF: 'auto_renew_off',
  PAYMENT_RECORDED: 'payment_recorded',
};
const SUBSCRIPTION_EVENT_VALUES = Object.values(SUBSCRIPTION_EVENT);

/** A subscription inside this many days of its end date counts as "expiring soon". */
const EXPIRY_WARNING_DAYS = 30;

/**
 * A tenant asking to be moved onto a different plan.
 *
 * Tenants cannot change their own subscription - that would let a company grant
 * itself higher limits without anyone collecting the money - so the "upgrade"
 * button in the company workspace raises one of these instead, and a super admin
 * approves it, which is what actually writes the subscription.
 */
const PLAN_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};
const PLAN_REQUEST_STATUS_VALUES = Object.values(PLAN_REQUEST_STATUS);

/** What the tenant is asking for, classified from the plan it is on today. */
const PLAN_REQUEST_TYPE = {
  NEW: 'new',
  UPGRADE: 'upgrade',
  DOWNGRADE: 'downgrade',
  RENEWAL: 'renewal',
};
const PLAN_REQUEST_TYPE_VALUES = Object.values(PLAN_REQUEST_TYPE);

const TRANSACTION_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const PAYMENT_MODE = {
  CASH: 'cash',
  UPI: 'upi',
  CARD: 'card',
  NET_BANKING: 'net_banking',
  CHEQUE: 'cheque',
  BANK_TRANSFER: 'bank_transfer',
  OTHER: 'other',
};

/** Permission actions stored per (role, menu) pair. */
const PERMISSION_ACTIONS = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canExport'];

module.exports = {
  STATUS,
  STATUS_VALUES,
  AUTH_SCOPE,
  SUPER_ADMIN_ROLE,
  BILLING_CYCLE,
  BILLING_CYCLE_DAYS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  OCCUPYING_SUBSCRIPTION_STATUSES,
  TERMINAL_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_TRANSITIONS,
  SUBSCRIPTION_CHANGE_TYPE,
  SUBSCRIPTION_CHANGE_TYPE_VALUES,
  SUBSCRIPTION_EVENT,
  SUBSCRIPTION_EVENT_VALUES,
  EXPIRY_WARNING_DAYS,
  PLAN_REQUEST_STATUS,
  PLAN_REQUEST_STATUS_VALUES,
  PLAN_REQUEST_TYPE,
  PLAN_REQUEST_TYPE_VALUES,
  TRANSACTION_STATUS,
  PAYMENT_MODE,
  PERMISSION_ACTIONS,
};
