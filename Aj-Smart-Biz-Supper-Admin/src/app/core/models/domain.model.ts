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
  /** Marketing copy for the pricing table — free text, one line each. */
  features?: string[] | null;
  /**
   * Optional functionality this plan GRANTS, as `FunctionalityKey`s.
   *
   * Unlike `features`, these are enforced: a company can only switch on what its
   * plan lists here, and the value is frozen onto the subscription at
   * activation, so editing a plan never revokes a feature a running term was
   * sold.
   */
  functionalities?: FunctionalityKey[] | null;
  isPopular: boolean;
  sequence: number;
  /** Attached by the API so the plan list can show what each plan is carrying. */
  usage?: { companies: number; expiringSoon: number };
}

/* --------------------------- optional functionality --------------------------- */

/** A key the platform implements. Mirrors `FUNCTIONALITY` in the API. */
/* --------------------------- platform insight --------------------------- */

/**
 * One customer of one tenant, as the **platform** sees them.
 *
 * Thinner than the tenant's own view on purpose. Their addresses and the lines
 * of their orders are absent: the operator has a legitimate interest in how many
 * customers a company has and what they are worth — that is billing and support
 * — and none at all in where a particular person lives.
 */
export interface PlatformCustomer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  status: Status;
  phoneVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  company: { id: number; name: string; code: string } | null;
  orders: number;
  /** Cancellations excluded, the rule every revenue figure here follows. */
  spent: number;
}

export interface PlatformCustomerSummary {
  total: number;
  active: number;
  inactive: number;
  joinedLast30: number;
  /** How many tenants have any at all — whether the feature is used or just sold. */
  companies: number;
}

/**
 * How one tenant is actually doing.
 *
 * **Every block is `null` unless that functionality is live for them.** A company
 * that never bought the warehouse showing a row of noughts reads as a company
 * with no stock rather than one that never bought stock control, and those are
 * very different things to somebody deciding what to sell them next.
 */
export interface CompanyInsights {
  company: { id: number; name: string; code: string; status: Status };
  range: { days: number };
  /** What they are entitled to, so the screen can say why a block is missing. */
  activeKeys: FunctionalityKey[];

  orders: {
    window: {
      orders: number;
      revenue: number;
      units: number;
      unpricedItems: number;
      averageOrderValue: number;
      cancelled: number;
    };
    lifetime: { orders: number; revenue: number };
    daily: { day: string; orders?: number; revenue?: number }[];
    byStatus: Record<string, number>;
    topProducts: { name: string; units: number; revenue: number }[];
    open: number;
    unpaidAmount: number;
  } | null;

  catalogue: { products: number; live: number; categories: number } | null;

  warehouse: {
    units: number;
    onHand: number;
    available: number;
    low: number;
    out: number;
    retailValue: number;
  } | null;

  services: {
    published: number;
    enquiries: number;
    quoted: number;
    collected: number;
    outstanding: number;
  } | null;

  customers: { total: number; active: number; joinedLast30: number; withOrders: number } | null;

  /**
   * The blog, and `lastPostedAt` is the field this block exists for.
   *
   * A tenant who bought a blog and stopped writing four months ago is a
   * different conversation from one who posts weekly, and a post count cannot
   * tell the two apart.
   */
  blog: { posts: number; live: number; lastPostedAt: string | null } | null;
}

export type FunctionalityKey =
  | 'whatsapp'
  | 'share_link'
  | 'services'
  | 'about_us'
  | 'figures'
  | 'team'
  | 'gallery'
  | 'contact_page'
  | 'testimonials'
  | 'features_benefits'
  | 'products'
  | 'orders'
  | 'warehouse'
  | 'customers'
  | 'blog'
  | 'service_enquiry'
  | 'service_booking';

/** What a WhatsApp number is for, and therefore which button it lands on. */
export type WhatsappType = 'inquiry' | 'contact' | 'support' | 'orders';

export type ShareChannel = 'copy' | 'whatsapp' | 'facebook' | 'x' | 'linkedin' | 'telegram' | 'email';

/**
 * One way a payment may be recorded, as the platform names it.
 *
 * From the catalogue endpoint rather than written out here: the values are a
 * backend enum, and a copy in the browser goes stale the first time one is
 * added — silently, because a select with a missing option looks fine.
 */
export interface PaymentModeOption {
  value: string;
  label: string;
}

/** One entry of `GET /masters/functionalities` — the platform's own list. */
export interface FunctionalityMeta {
  key: FunctionalityKey;
  name: string;
  icon: string;
  summary: string;
  description: string;
  sequence: number;
}

export interface WhatsappTypeMeta {
  key: WhatsappType;
  name: string;
  /** Where on the website this number is used. */
  placement: string;
  defaultMessage: string;
  sequence: number;
}

/**
 * `GET /masters/functionalities` — read by both consoles so neither hard-codes a
 * list that could drift from the API's.
 */
export interface FunctionalityCatalogue {
  /** How a payment may be recorded — see `PaymentModeOption`. */
  paymentModes?: PaymentModeOption[];
  functionalities: FunctionalityMeta[];
  whatsappTypes: WhatsappTypeMeta[];
  shareChannels: ShareChannel[];
  shareDefaults: { headline: string; message: string; channels: ShareChannel[] };
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
  /** The shared preset this company starts from. Not the last word — see below. */
  themeId?: number | null;
  /**
   * The company's **own** website colours, which win over the preset key by key.
   *
   * Present and non-empty means this company has been recoloured by its own
   * admin, so the preset named beside it is no longer what the website looks
   * like. Anything reading `theme.primaryColor` to draw a swatch has to check
   * here first or it will show a colour the site does not use.
   */
  themeConfig?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    mode?: 'light' | 'dark' | null;
  } | null;
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
  /** The company's own roles, for the admin edit form. */
  roles?: CompanyRole[];
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
  /** NULL = every branch of the company. */
  branchId?: number | null;
  roleId?: number | null;
  isCompanyAdmin: boolean;
  status: Status;
  lastLoginAt?: string | null;
  role?: Option | null;
}

/**
 * A role the company defined, as the detail payload carries it.
 *
 * `isSystem` marks the auto-created "Company Admin" role: the main admin has to
 * keep it and nobody else may be given it, which the API enforces and the edit
 * form reflects rather than re-decides.
 */
export interface CompanyRole {
  id: number;
  name: string;
  isSystem: boolean;
  status: Status;
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

/* --------------------------------- leads -------------------------------- */

/**
 * Where a lead has got to. Mirrors `LEAD_STAGE` in the API.
 *
 * `lost` is not a delete: the visits behind it still count in the analytics,
 * and the same device coming back six months later is a returning lead rather
 * than a brand new one.
 */
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export const LEAD_STAGES: readonly LeadStage[] = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';

/**
 * One device that has opened the company's public website.
 *
 * **One row per device, never one per visit.** Someone who has been back four
 * times is a single lead with `visitCount: 4`; the four visits themselves are
 * `LeadVisit[]`, loaded by the detail screen. That is the whole reason the two
 * shapes are separate — see the API's `lead.model.js`.
 */
export interface Lead {
  id: number;
  companyId: number;
  branchId: number | null;
  /** The visitor's browser-held id; `anon_…` when the server had to derive one. */
  deviceId: string;
  stage: LeadStage;

  /** Filled in only once someone identifies them. Empty for a pure browser. */
  name: string | null;
  email: string | null;
  phone: string | null;
  notes?: string | null;

  /** Present only where the visitor granted notifications. */
  fcmToken: string | null;

  visitCount: number;
  pageViewCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;

  deviceType: DeviceType;
  deviceVendor: string | null;
  deviceModel: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;

  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  language?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;

  /** First touch — the campaign that produced this lead, never overwritten. */
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  firstUtm?: Record<string, string> | null;
  firstReferrerHost: string | null;
  firstLandingUrl?: string | null;

  /** Last touch — where they came from most recently. */
  lastReferrerHost: string | null;
  lastLandingUrl?: string | null;
  lastUtm?: Record<string, string> | null;

  isBot: boolean;
  status: Status;
  createdAt?: string;

  branch?: Option | null;
  company?: Option | null;
}

/** One visit behind a lead — several page loads inside one session. */
export interface LeadVisit {
  id: number;
  leadId: number;
  branchId: number | null;
  sessionId: string | null;
  visitedAt: string;
  lastActivityAt: string | null;
  pageViewCount: number;

  pageUrl: string | null;
  path: string | null;
  pageTitle: string | null;
  host: string | null;
  referrer: string | null;
  referrerHost: string | null;

  /** Every `utm_*` key and click id the landing URL carried. */
  utm: Record<string, string> | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;

  fcmToken: string | null;
  userAgent: string | null;
  deviceType: DeviceType;
  deviceVendor: string | null;
  deviceModel: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  engine: string | null;
  isBot: boolean;

  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  pixelRatio: string | number | null;
  orientation: string | null;
  /** The long tail the schema has no column for — cores, memory, connection. */
  device: Record<string, unknown> | null;

  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  timezoneOffset: number | null;
  language: string | null;
  languages: string[] | null;
  latitude: string | number | null;
  longitude: string | number | null;
  locationAccuracy: number | null;
  locationSource: string | null;
  location: Record<string, unknown> | null;

  extra: Record<string, unknown> | null;

  branch?: Option | null;
}

export interface LeadDetail {
  lead: Lead;
  visits: LeadVisit[];
}

/** The counter strip above the table. */
export interface LeadSummary {
  total: number;
  today: number;
  thisWeek: number;
  withPushToken: number;
  totalVisits: number;
  stages: Record<LeadStage, number>;
  devices: { label: string; total: number }[];
}

/** One bar in any of the analytics breakdowns. */
export interface LeadTally {
  label: string;
  total: number;
}

export interface LeadAnalytics {
  totals: { leads: number; visits: number; visitsPerLead: number };
  stages: Record<LeadStage, number>;
  devices: LeadTally[];
  sources: LeadTally[];
  mediums: LeadTally[];
  campaigns: LeadTally[];
  referrers: LeadTally[];
  cities: LeadTally[];
  countries: LeadTally[];
  browsers: LeadTally[];
  operatingSystems: LeadTally[];
  daily: { day: string; total: number }[];
  /** Empty in the tenant console — only the platform sees across companies. */
  companies: { companyId: number; name: string; code: string | null; total: number; visits: number }[];
  branches: { branchId: number | null; name: string; code: string | null; total: number }[];
}
