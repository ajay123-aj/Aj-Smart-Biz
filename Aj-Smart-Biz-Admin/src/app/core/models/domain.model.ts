export type Status = 'active' | 'inactive';

/**
 * Mirrors the API's subscription lifecycle.
 *
 *   pending    queued ahead of time — starts on its own start date
 *   active     running
 *   suspended  paused by the platform; the term keeps its dates but access stops
 *   expired    the term ran out
 *   cancelled  ended early
 *   superseded replaced mid-term by an upgrade or downgrade
 */
export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'cancelled'
  | 'superseded';

export type SubscriptionChangeType =
  | 'new'
  | 'renewal'
  | 'upgrade'
  | 'downgrade'
  | 'crossgrade'
  | 'reactivation'
  | 'trial';

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'refunded';

/** Every action a role can be granted on a menu. */
export const PERMISSION_ACTIONS = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canExport'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionFlags = Record<PermissionAction, boolean>;
/** Keyed by menu slug — what `/auth/me` returns for the signed-in admin. */
export type PermissionMap = Record<string, PermissionFlags>;

export interface AuditFields {
  id: number;
  status: Status;
  createdAt?: string;
  updatedAt?: string;
}

export interface Option {
  id: number;
  name: string;
}

/* ------------------------------- identity ------------------------------ */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  companyId: number;
  branchId?: number | null;
  roleId?: number | null;
  isCompanyAdmin: boolean;
  mustChangePassword: boolean;
  status: Status;
  lastLoginAt?: string | null;
  company?: {
    id: number;
    name: string;
    code: string;
    logo?: string | null;
    favicon?: string | null;
    description?: string | null;
  };
  /** The admin's own branch; its images outrank the company's after sign-in. */
  branch?: { id: number; name: string; code: string; logo?: string | null; favicon?: string | null };
  role?: Option;
}

export interface MenuItem {
  id: number;
  parentId?: number | null;
  name: string;
  slug: string;
  icon?: string | null;
  route?: string | null;
  sequence: number;
}

export interface Menu extends AuditFields {
  companyId?: number | null;
  parentId?: number | null;
  name: string;
  slug: string;
  icon?: string | null;
  route?: string | null;
  sequence: number;
  isSystem: boolean;
  parent?: Option | null;
}

export interface Role extends AuditFields {
  companyId: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  isSystem: boolean;
  adminCount?: number;
}

/** One row of the role permission grid. */
export interface PermissionRow extends PermissionFlags {
  menuId: number;
  parentId?: number | null;
  name: string;
  slug: string;
  icon?: string | null;
  route?: string | null;
  sequence: number;
}

export interface RolePermissionMatrix {
  role: { id: number; name: string; isSystem: boolean };
  permissions: PermissionRow[];
}

export interface CompanyAdmin extends AuditFields {
  companyId: number;
  branchId?: number | null;
  roleId?: number | null;
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  isCompanyAdmin: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  role?: Option | null;
  branch?: Option | null;
  /** Present only on the create response, shown once. */
  generatedPassword?: string | null;
}

/* -------------------------------- company ------------------------------ */
export interface Company extends AuditFields {
  name: string;
  code: string;
  legalName?: string | null;
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
  theme?: { id: number; name: string; primaryColor: string; secondaryColor: string; mode: string } | null;
  state?: Option | null;
  branches?: Branch[];
  domains?: CompanyDomain[];
  subscriptions?: Subscription[];
  activeSubscription?: Subscription | null;
}

export interface Branch extends AuditFields {
  companyId: number;
  name: string;
  code: string;
  isMain: boolean;
  /** Upload paths, e.g. `/uploads/branch/abc.png`. */
  logo?: string | null;
  favicon?: string | null;
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

/** A host that resolves to this company, optionally pinned to one of its branches. */
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
 * Everything the expiry countdown needs, computed by the API so the tenant's
 * clock and the platform console never disagree about "3 days left".
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

/** Plan terms as they were sold, frozen on the subscription at activation. */
export interface PlanTerms {
  id?: number;
  name?: string;
  code?: string | null;
  price?: number | string;
  discountPrice?: number | string | null;
  currency?: string;
  billingCycle?: string;
  durationDays?: number | null;
  trialDays?: number;
  maxBranches?: number;
  maxAdmins?: number;
  maxUsers?: number;
  storageMb?: number;
  features?: string[] | null;
  status?: Status;
}

export interface Subscription {
  id: number;
  companyId: number;
  planId: number;
  startDate: string;
  endDate: string;
  amount?: number | string;
  discount?: number | string;
  taxAmount?: number | string;
  totalAmount: number | string;
  currency: string;
  status: SubscriptionStatus;
  autoRenew: boolean;
  isTrial?: boolean;
  graceDays?: number;
  changeType?: SubscriptionChangeType;
  remarks?: string | null;
  plan?: PlanTerms | null;
  planSnapshot?: PlanTerms | null;
  timer?: SubscriptionTimer;
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

export type PlanRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PlanRequestType = 'new' | 'upgrade' | 'downgrade' | 'renewal';

/** A plan in the catalogue, already compared against the one we are on. */
export interface AvailablePlan extends PlanTerms {
  id: number;
  name: string;
  description?: string | null;
  isPopular?: boolean;
  isCurrent: boolean;
  /** null on the current plan; otherwise how the move would be classified. */
  change: 'upgrade' | 'downgrade' | 'crossgrade' | 'new' | null;
}

/**
 * The company asking to be moved onto another plan. Raising one changes nothing
 * on its own — a super admin approving it is what writes the subscription.
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
  createdAt?: string;
  requestedPlan?: PlanTerms | null;
  currentPlan?: PlanTerms | null;
}

/** `GET /my-company/plans` — the catalogue plus where we stand in it. */
export interface PlanCatalogue {
  plans: AvailablePlan[];
  currentPlanId: number | null;
  currentSubscription: Subscription | null;
  /** Only one request may be open at a time. */
  pendingRequest: PlanRequest | null;
}

/** `GET /my-company/plan` — the tenant's own read-only plan screen. */
export interface MyPlanView {
  company: { id: number; name: string; code: string; currency: string };
  current: Subscription | null;
  /** A renewal already booked to start when the current term ends. */
  scheduled: Subscription | null;
  history: Subscription[];
  transactions: Transaction[];
  quota: QuotaView;
  usage: Record<'branches' | 'admins', PlanUsageLine>;
  planLimits: QuotaView['planLimits'];
  billing: { totalPaid: number; transactionCount: number; currency: string };
}

export interface Transaction {
  id: number;
  invoiceNo: string;
  totalAmount: number | string;
  currency: string;
  paymentMode: string;
  status: TransactionStatus;
  paidAt?: string | null;
  plan?: Option | null;
}

/* ------------------------------- dashboard ----------------------------- */
export interface AdminDashboard {
  admins: { total: number; active: number; inactive: number };
  branches: { total: number; active: number };
  roles: { total: number };
  subscription: {
    planName: string | null;
    status: SubscriptionStatus;
    startDate: string;
    endDate: string;
    autoRenew: boolean;
    isTrial: boolean;
    /** Same countdown block the My Plan screen ticks from. */
    timer: SubscriptionTimer | null;
    daysRemaining: number | null;
    limits: { maxAdmins: number | null; maxBranches: number | null; maxUsers: number | null };
  } | null;
  recentAdmins: CompanyAdmin[];
}
