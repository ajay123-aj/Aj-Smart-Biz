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

/* -------------------------------- website ------------------------------- */

/**
 * A hero slide on the company's public website.
 *
 * `branchId` null means the slide belongs to the whole company and shows on
 * every site the tenant serves; set, it belongs to that branch alone.
 */
export interface Slider extends AuditFields {
  companyId: number;
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  /** Wide artwork for desktop. */
  image?: string | null;
  /** Optional portrait crop for phones; falls back to `image` when empty. */
  mobileImage?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sequence: number;
}

/* --------------------------- optional functionality --------------------------- */

/** A key the platform implements. Mirrors `FUNCTIONALITY` in the API. */
export type FunctionalityKey =
  | 'whatsapp'
  | 'share_link'
  | 'about_us'
  | 'figures'
  | 'team'
  | 'gallery'
  | 'contact_page'
  | 'testimonials'
  | 'features_benefits';

/** What a WhatsApp number is for, and therefore which button it lands on. */
export type WhatsappType = 'inquiry' | 'contact' | 'support' | 'orders';

export type ShareChannel = 'copy' | 'whatsapp' | 'facebook' | 'x' | 'linkedin' | 'telegram' | 'email';

/** Why a functionality is not live. `null` when it is. */
export type FunctionalityBlockReason = 'not_in_plan' | 'disabled' | 'expired' | 'suspended' | 'no_plan';

export interface WhatsappTypeMeta {
  key: WhatsappType;
  name: string;
  /** Where on the website a number of this type is used. */
  placement: string;
  defaultMessage: string;
  sequence: number;
}

/** One entry of the platform's own functionality list. */
export interface FunctionalityMeta {
  key: FunctionalityKey;
  name: string;
  icon: string;
  summary: string;
  description: string;
  sequence: number;
}

/**
 * `GET /masters/functionalities`. Read rather than hard-coded, so a key added to
 * the platform gets a name here without this app changing.
 */
export interface FunctionalityCatalogue {
  functionalities: FunctionalityMeta[];
  whatsappTypes: WhatsappTypeMeta[];
  shareChannels: ShareChannel[];
  shareDefaults: ShareLinkSettings;
  statModes: StatMode[];
  statUnits: StatUnit[];
  /** The glyphs a benefit card may carry, with the artwork to draw them. */
  featureIcons: FeatureIconMeta[];
}

/**
 * One glyph from the platform's icon library.
 *
 * Read from the API rather than kept here, so the picker offers exactly what
 * the website can draw — a list hard-coded in this app would go stale the
 * first time a glyph was added, and would offer a tenant an icon their site
 * would then render as a spark.
 *
 * `paths` is the drawing itself: `d` attributes for a 24-unit box, stroked
 * rather than filled. The picker renders them as-is.
 */
export interface FeatureIconMeta {
  key: string;
  label: string;
  /** What the picker groups it under, e.g. "Trust and quality". */
  group: string;
  paths: string[];
}

/** The share button's copy and the channels it offers. */
export interface ShareLinkSettings {
  headline: string;
  /** `{company}` is filled in by the website. */
  message: string;
  channels: ShareChannel[];
}

/** The About section's prose. Its stat band is a separate list of cards. */
export interface AboutSettings {
  /**
   * What this page is called in the website's menu. Blank keeps the template's
   * name — see the placeholder on the field.
   */
  navLabel: string | null;
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  /** Blank lines separate paragraphs. */
  body: string;
}

/** Where the enquiry form hands its message off. There is no server behind it. */
export type ContactFormTarget = 'email' | 'whatsapp';

/** How the Contact page reads. Never gated — every tenant gets the page. */
export interface ContactSettings {
  navLabel: string | null;
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  showForm: boolean;
  formTarget: ContactFormTarget;
  formNote: string;
  showLocations: boolean;
}

/** `GET /my-company/contact[?branchId=]` — the settings for one scope. */
export interface ContactView {
  branchId: number | null;
  overridden: boolean;
  settings: ContactSettings;
  /** What the site would show if the branch override were removed. */
  inherited: ContactSettings | null;
  branches: { id: number; name: string; code: string }[];
}

/**
 * How a stat card produces its figure.
 *
 *   fixed       whatever the company typed — "250+", "98%"
 *   since_date  counted from a date every time the page renders, so
 *               "Years in business" is right next year on its own
 */
export type StatMode = 'fixed' | 'since_date';
export type StatUnit = 'years' | 'months' | 'days';

/**
 * The words above the band of figures.
 *
 * The same three fields Team and Gallery keep, stored the same way — on the
 * `figures` functionality's own settings blob. The figures themselves are
 * branch-aware cards; one heading for the set is not.
 */
export type FiguresSettings = SectionCopy;

/** One figure in the band. */
export interface CompanyStat extends AuditFields {
  companyId: number;
  /**
   * Branch this belongs to; null means the whole company.
   *
   * Same rule the sliders follow: a branch-pinned site shows the branch's own,
   * and falls back to the company-wide ones when it has none.
   */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  label: string;
  mode: StatMode;
  /** The figure, for `fixed` cards. */
  value?: string | null;
  /** What a `since_date` card counts from. */
  sinceDate?: string | null;
  unit: StatUnit;
  prefix?: string | null;
  suffix?: string | null;
  sequence: number;
}

/** One person on the website's Team section. */
export interface TeamMember extends AuditFields {
  companyId: number;
  /**
   * Branch this belongs to; null means the whole company.
   *
   * Same rule the sliders follow: a branch-pinned site shows the branch's own,
   * and falls back to the company-wide ones when it has none.
   */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  name: string;
  role?: string | null;
  bio?: string | null;
  /** Upload path, e.g. `/uploads/team/asha.jpg`. */
  photo?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  sequence: number;
}

/** One image in the website's Gallery section. */
export interface GalleryItem extends AuditFields {
  companyId: number;
  /**
   * Branch this belongs to; null means the whole company.
   *
   * Same rule the sliders follow: a branch-pinned site shows the branch's own,
   * and falls back to the company-wide ones when it has none.
   */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** Upload path, e.g. `/uploads/gallery/frame.jpg`. */
  image: string;
  title?: string | null;
  caption?: string | null;
  altText?: string | null;
  sequence: number;
}

/**
 * One card in the website's Features / Benefits band.
 *
 * The plainest of the card lists: a glyph, a heading and a sentence. What the
 * screen spends its effort on is the glyph — `icon` is a key from the
 * platform's library (`FeatureIconMeta`), not an upload, so a company chooses
 * from a set the website is known to draw rather than supplying artwork.
 */
export interface FeatureCard extends AuditFields {
  companyId: number;
  /**
   * Branch this belongs to; null means the whole company.
   *
   * Same rule the sliders follow: a branch-pinned site shows the branch's own,
   * and falls back to the company-wide ones when it has none.
   */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** A key from the icon library. Anything unknown draws as `spark`. */
  icon: string;
  title: string;
  /** Optional — a good heading can stand on its own. */
  body?: string | null;
  sequence: number;
}

/**
 * The Features / Benefits section's own wording.
 *
 * Saved through the functionality's settings route rather than with the cards,
 * because it is one block per company rather than a list — the same place
 * `share_link` keeps its configuration. Clearing a field is not a blank heading
 * on the website: the API fills an empty one from the platform's defaults.
 */
export interface FeaturesSettings {
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  /** The label on the button under the lede. */
  ctaLabel: string;
}

/* ---------------------------- testimonials ---------------------------- */

/** How a company runs its wall. See `TestimonialsSettings`. */
export type TestimonialMode = 'static' | 'dynamic';

/**
 * Where the "Write a review" button goes on an open section — the platform's
 * own form, or a link off the site. Exactly one is live at a time, and `link`
 * closes the public submit endpoint as firmly as a curated wall does.
 */
export type TestimonialReviewTarget = 'form' | 'link';

/** Who wrote a review — the company itself, or one of its customers. */
export type TestimonialSource = 'admin' | 'visitor';

/** Whether a review may be published. Only `approved` reaches the website. */
export type TestimonialModeration = 'pending' | 'approved' | 'rejected';

export interface Testimonial extends AuditFields {
  companyId: number;
  /** Branch this belongs to; null means the whole company. */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  authorName: string;
  authorRole?: string | null;
  photo?: string | null;
  /**
   * How to reach whoever wrote it. Shown on this screen and nowhere else — the
   * public API does not carry either field.
   */
  authorEmail?: string | null;
  authorPhone?: string | null;
  rating?: number | null;
  body: string;
  source: TestimonialSource;
  moderation: TestimonialModeration;
  moderatedAt?: string | null;
  sequence: number;
}

/**
 * The section's own settings, on the functionality's `settings` blob.
 *
 * `mode` is the one that matters: `static` is a curated wall the company fills
 * itself, `dynamic` opens a form on the website and shows the ten most recent
 * approved reviews. Switching between them never deletes anything.
 */
export interface TestimonialsSettings {
  mode: TestimonialMode;
  /** Only meaningful in `dynamic` mode; a curated wall has no button at all. */
  reviewTarget: TestimonialReviewTarget;
  /** `http`/`https`, absolute. Read only when `reviewTarget` is `link`. */
  reviewUrl: string;
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  /**
   * The label on the review button, and the heading of the dialog when the
   * button opens one. Kept across a switch of `reviewTarget`, so a company that
   * renamed it does not lose the wording by pointing it at Google.
   */
  formTitle: string;
  formNote: string;
  /** Whether the form asks for a star rating at all. */
  showRating: boolean;
}

/**
 * `GET /my-company/testimonials` — the rows, and the counts the screen is built
 * around.
 *
 * The counts come from the API rather than being derived here on purpose: a
 * count the browser works out from a filtered list is a count of that filter,
 * and the pending badge has to be right whatever tab is open.
 */
export interface TestimonialListView {
  items: Testimonial[];
  counts: { pending: number; approved: number; rejected: number };
}

/**
 * The words above a section's cards, on the functionality's `settings` blob.
 *
 * Shared by Team, Gallery and Figures, which store nothing else there. The API
 * resolves
 * them on read — its own wording fills anything the tenant left blank — so
 * these are never empty coming back, and a blank field going out means "use the
 * standard wording".
 */
export interface SectionCopy {
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
}

/** Every card list answers with the same envelope. */
export interface CardList<T> {
  items: T[];
}

/**
 * `GET /my-company/about[?branchId=]` — the copy for one scope.
 *
 * `overridden` is the distinction the screen turns on: a branch with no row of
 * its own is *inheriting* the company-wide copy, not sitting empty, and saying
 * which is the difference between "nothing here" and "the same as everyone".
 */
export interface AboutView {
  branchId: number | null;
  overridden: boolean;
  copy: AboutSettings;
  /** What the site would show if the branch override were removed. */
  inherited: AboutSettings | null;
  branches: { id: number; name: string; code: string }[];
}

/**
 * One functionality as it stands for this company: whether the plan grants it,
 * whether the company switched it on, and whether it is therefore live.
 *
 * `active` is the API's own answer — the switch renders it rather than working
 * it out, so a toggle, a refused request and a website button always agree.
 */
export interface Functionality {
  key: FunctionalityKey;
  name: string;
  icon: string;
  summary: string;
  description: string;
  sequence: number;
  /** The plan includes it. Without this the switch is locked. */
  granted: boolean;
  /** The company's own switch is on. */
  enabled: boolean;
  /** granted && enabled && the plan is still being served. */
  active: boolean;
  /** False until the company has touched this feature at all. */
  configured: boolean;
  settings: ShareLinkSettings | AboutSettings | Record<string, unknown>;
  reason: FunctionalityBlockReason | null;
  /** Ready to show — the same wording the API refuses with. */
  message: string | null;
}

/** `GET /my-company/functionalities`. */
export interface FunctionalityView {
  items: Functionality[];
  service: { active: boolean; reason: 'expired' | 'suspended' | 'no_plan' | null };
  plan: { id: number; name: string | null; status: SubscriptionStatus; endDate: string } | null;
  activeKeys: FunctionalityKey[];
}

/** One WhatsApp number the company publishes, tagged with what it is for. */
export interface WhatsappNumber extends AuditFields {
  companyId: number;
  type: WhatsappType;
  /** Digits only, no `+`. */
  countryCode: string;
  /** National subscriber number, digits only. */
  number: string;
  /** Overrides the type's name on the button. */
  label?: string | null;
  defaultMessage?: string | null;
  sequence: number;
}

/** `GET /my-company/whatsapp-numbers` — unpaginated; it is a short list. */
export interface WhatsappNumberView {
  items: WhatsappNumber[];
  types: WhatsappTypeMeta[];
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
  /** Marketing copy for the pricing table — free text, one line each. */
  features?: string[] | null;
  /**
   * Optional functionality the plan grants, as `FunctionalityKey`s. Enforced,
   * unlike `features`, and frozen here at activation so a later plan edit never
   * revokes what this term was sold.
   */
  functionalities?: FunctionalityKey[] | null;
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
