export type Status = 'active' | 'inactive';
export type BillingCycle = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'lifetime';

/**
 * Mirrors the API's subscription lifecycle.
 *
 *   pending    queued ahead of time — starts on its own start date
 *   active     running
 *   suspended  paused; the term keeps its dates but access stops
 *   expired    the term ran out
 *   cancelled  ended early on purpose
 *   superseded replaced mid-term by an upgrade or downgrade
 */
export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'cancelled'
  | 'superseded';

/** How a term came to exist. */
export type SubscriptionChangeType =
  | 'new'
  | 'renewal'
  | 'upgrade'
  | 'downgrade'
  | 'crossgrade'
  | 'reactivation'
  | 'trial';

export type SubscriptionEventType =
  | 'created' | 'activated' | 'scheduled' | 'renewed'
  | 'upgraded' | 'downgraded' | 'crossgraded'
  | 'suspended' | 'resumed' | 'cancelled' | 'expired'
  | 'reactivated' | 'superseded' | 'term_extended'
  | 'auto_renew_on' | 'auto_renew_off' | 'payment_recorded';

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'refunded';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'net_banking' | 'cheque' | 'bank_transfer' | 'other';

export interface AuditFields {
  id: number;
  status: Status;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

/* ------------------------------- masters ------------------------------- */
export interface State extends AuditFields {
  name: string;
  code?: string | null;
  country: string;
  gstCode?: string | null;
}

export interface BusinessType extends AuditFields {
  name: string;
  slug?: string | null;
  icon?: string | null;
  description?: string | null;
}

export interface Theme extends AuditFields {
  name: string;
  code?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  textColor?: string | null;
  backgroundColor?: string | null;
  sidebarColor?: string | null;
  fontFamily?: string | null;
  mode: 'light' | 'dark';
  previewImage?: string | null;
  isDefault: boolean;
}

export interface Plan extends AuditFields {
  name: string;
  code?: string | null;
  description?: string | null;
  price: number | string;
  discountPrice?: number | string | null;
  currency: string;
  billingCycle: BillingCycle;
  durationDays?: number | null;
  trialDays: number;
  maxBranches: number;
  maxAdmins: number;
  maxUsers: number;
  storageMb: number;
  features?: string[] | null;
  isPopular: boolean;
  sequence: number;
  /** Attached by the API so the plan list can show what each plan is carrying. */
  usage?: { companies: number; expiringSoon: number };
}

export interface Option {
  id: number;
  name: string;
}

/* ------------------------------ companies ------------------------------ */
export interface Company extends AuditFields {
  name: string;
  code: string;
  legalName?: string | null;
  /** Tagline shown on the tenant's login screen. */
  description?: string | null;
  favicon?: string | null;
  businessTypeId?: number | null;
  themeId?: number | null;
  stateId?: number | null;
  email: string;
  phone: string;
  alternatePhone?: string | null;
  website?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  logo?: string | null;
  currency: string;
  timezone: string;
  subscriptionEndDate?: string | null;

  businessType?: Option | null;
  theme?: Partial<Theme> | null;
  state?: Option | null;
  branches?: Branch[];
  domains?: CompanyDomain[];
  subscriptions?: Subscription[];
  transactions?: Transaction[];
  admins?: CompanyAdmin[];
  activeSubscription?: Subscription | null;
  /** A renewal queued to start when the running term ends. */
  scheduledSubscription?: Subscription | null;
  summary?: CompanySummary;
}

export interface CompanySummary {
  totalBranches: number;
  activeBranches: number;
  totalAdmins: number;
  totalPaid: number;
  transactionCount: number;
}

export interface Branch extends AuditFields {
  companyId: number;
  name: string;
  code: string;
  isMain: boolean;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  stateId?: number | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
  state?: Option | null;
  contacts?: BranchContact[];
}

/** A host that resolves to a company, optionally pinned to one of its branches. */
export interface CompanyDomain extends AuditFields {
  companyId: number;
  /** Branch this host is dedicated to; null means the whole company. */
  subCompanyId?: number | null;
  domain: string;
  isPrimary: boolean;
  branch?: Option | null;
}

export interface BranchContact extends AuditFields {
  branchId: number;
  companyId: number;
  name: string;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  phone: string;
  alternatePhone?: string | null;
  isPrimary: boolean;
  notes?: string | null;
}

/**
 * Everything the expiry countdown needs, computed by the API so both consoles
 * agree on what "3 days left" means regardless of the browser's clock zone.
 */
export interface SubscriptionTimer {
  startsAt: string;
  expiresAt: string;
  graceEndsAt: string;
  /** Milliseconds left at the moment of the response; the UI ticks on from here. */
  msRemaining: number;
  daysRemaining: number;
  termDays: number;
  elapsedDays: number;
  percentUsed: number;
  hasStarted: boolean;
  isExpired: boolean;
  inGrace: boolean;
  isExpiringSoon: boolean;
}

export interface Subscription {
  id: number;
  companyId: number;
  planId: number;
  startDate: string;
  endDate: string;
  amount: number | string;
  discount: number | string;
  taxAmount: number | string;
  creditApplied?: number | string;
  totalAmount: number | string;
  currency: string;
  isTrial: boolean;
  autoRenew: boolean;
  graceDays?: number;
  changeType?: SubscriptionChangeType;
  previousSubscriptionId?: number | null;
  status: SubscriptionStatus;
  activatedAt?: string | null;
  suspendedAt?: string | null;
  cancelledAt?: string | null;
  endedAt?: string | null;
  remarks?: string | null;
  plan?: Partial<Plan> | null;
  planSnapshot?: Partial<Plan> | null;
  company?: Partial<Company> | null;
  transactions?: Transaction[];
  events?: SubscriptionEvent[];
  previousSubscription?: Partial<Subscription> | null;
  companyTimeline?: Subscription[];
  timer?: SubscriptionTimer;
  /** Statuses this row may move to next — the UI offers nothing else. */
  allowedTransitions?: SubscriptionStatus[];
}

/** One entry in a subscription's transition trail. */
export interface SubscriptionEvent {
  id: number;
  companyId: number;
  subscriptionId?: number | null;
  type: SubscriptionEventType;
  fromStatus?: SubscriptionStatus | null;
  toStatus?: SubscriptionStatus | null;
  fromPlanId?: number | null;
  toPlanId?: number | null;
  amount?: number | string | null;
  effectiveAt?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
  actorId?: number | null;
  actorName?: string | null;
  createdAt?: string;
  fromPlan?: Option | null;
  toPlan?: Option | null;
}

export type PlanRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PlanRequestType = 'new' | 'upgrade' | 'downgrade' | 'renewal';

/**
 * A tenant asking to be moved onto a different plan. Raising one writes nothing;
 * approving it is what creates the subscription.
 */
export interface PlanRequest {
  id: number;
  companyId: number;
  requestedPlanId: number;
  currentPlanId?: number | null;
  type: PlanRequestType;
  status: PlanRequestStatus;
  note?: string | null;
  decisionNote?: string | null;
  requestedByName?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  resultingSubscriptionId?: number | null;
  createdAt?: string;
  company?: Partial<Company> | null;
  requestedPlan?: Partial<Plan> | null;
  currentPlan?: Partial<Plan> | null;
}

/** Counters across the top of the plan console. */
export interface SubscriptionSummary {
  statuses: Record<'active' | 'suspended' | 'pending' | 'expired' | 'cancelled' | 'superseded', number>;
  attention: {
    expiringIn7: number;
    expiringIn30: number;
    inGrace: number;
    companiesWithoutPlan: number;
    /** Tenants waiting on a decision — the queue on this screen. */
    pendingRequests: number;
  };
  flags: { autoRenewOn: number; trials: number };
  byPlan: {
    planId: number;
    planName: string;
    planStatus: Status | null;
    price: number;
    billingCycle: BillingCycle | null;
    currency: string;
    companies: number;
  }[];
  revenue: { collected: number; currency: string };
}

/** What an upgrade or downgrade would cost, before anything is written. */
export interface PlanChangePreview {
  changeType: SubscriptionChangeType;
  currentPlan: Partial<Plan> | null;
  currentSubscription: Subscription | null;
  targetPlan: Partial<Plan>;
  proration: { termDays: number; remainingDays: number; dailyRate: number; creditable: number };
  pricing: {
    price: number;
    creditApplied: number;
    taxAmount: number;
    payable: number;
    currency: string;
    startDate: string;
    endDate: string;
    durationDays: number;
  };
  limitChanges: Record<'maxBranches' | 'maxAdmins' | 'maxUsers' | 'storageMb', { from: number; to: number }> | null;
}

/** Why creating more is refused. `null` means it is not. */
export type QuotaBlockReason = 'no_plan' | 'expired' | 'suspended' | 'limit_reached';

/**
 * One plan limit against what is actually using it. `canCreate` is the API's
 * own answer, so a disabled button and a refused request always agree.
 */
export interface PlanUsageLine {
  used: number;
  /** null when the plan does not cap this resource. */
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  percentUsed: number;
  atLimit: boolean;
  canCreate: boolean;
  reason: QuotaBlockReason | null;
  /** Ready to show — the same wording the API refuses with. */
  message: string | null;
}

/** Everything the create buttons need to decide whether they are allowed. */
export interface QuotaView {
  planLimits: {
    maxBranches: number | null;
    maxAdmins: number | null;
    maxUsers: number | null;
    storageMb: number | null;
  };
  subscription: Subscription | null;
  plan: { id: number; name: string | null; status: SubscriptionStatus; endDate: string } | null;
  lastPlanName: string | null;
  /** A plan-wide block (no plan, expired, suspended) outranks any per-metric limit. */
  blockedBy: QuotaBlockReason | null;
  blockMessage: string | null;
  metrics: Record<'branches' | 'admins', PlanUsageLine>;
}

/** `GET /companies/:id/plan` — the whole plan picture for one tenant. */
export interface CompanyPlanView {
  company: { id: number; name: string; code: string; currency: string; status: Status };
  current: Subscription | null;
  scheduled: Subscription | null;
  history: Subscription[];
  events: SubscriptionEvent[];
  quota: QuotaView;
}

export interface Transaction {
  id: number;
  companyId: number;
  subscriptionId?: number | null;
  planId?: number | null;
  invoiceNo: string;
  amount: number | string;
  discount: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  currency: string;
  paymentMode: PaymentMode;
  paymentReference?: string | null;
  status: TransactionStatus;
  paidAt?: string | null;
  remarks?: string | null;
  plan?: Option | null;
  company?: Partial<Company> | null;
  subscription?: Partial<Subscription> | null;
}

export interface CompanyAdmin {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  isCompanyAdmin: boolean;
  status: Status;
  lastLoginAt?: string | null;
  role?: Option | null;
}

/** Returned once when a company is created; carries the generated password. */
export interface CompanyCreateResult {
  company: Company;
  mainAdmin: { id: number; name: string; email: string };
  mainAdminPassword: string | null;
  subscription: Subscription | null;
  transaction: Transaction | null;
}

/* ----------------------------- super admins ---------------------------- */
export interface SuperAdmin extends AuditFields {
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  role: 'super_admin' | 'staff';
  isRoot: boolean;
  lastLoginAt?: string | null;
}

/* ------------------------------ dashboard ------------------------------ */
export interface SuperAdminDashboard {
  companies: { total: number; active: number; inactive: number; deleted: number };
  income: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growthPercent: number | null;
    currency: string;
  };
  counts: {
    plans: number;
    activePlans: number;
    superAdmins: number;
    admins: number;
    branches: number;
    activeSubscriptions: number;
    expiringSoon: number;
  };
  monthlyIncome: { month: string; total: number; count: number }[];
  companiesByPlan: { planId: number; planName: string; total: number }[];
  recentCompanies: Company[];
  recentTransactions: Transaction[];
}
