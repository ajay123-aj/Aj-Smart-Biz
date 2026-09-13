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

/* ------------------------------ orders ------------------------------ */

/**
 * Where an order has got to.
 *
 * A queue a person works down, not a state machine a system drives — every step
 * is something somebody *did*. Forward or cancelled, never backward: an order
 * that has been dispatched has left the building, and a console that could put it
 * back to `packed` would be one where the stock ledger and the order list tell
 * different stories about the same box.
 */
export type OrderStatus = 'pending' | 'confirmed' | 'packed' | 'dispatched' | 'delivered' | 'cancelled';

/**
 * Whether the money has arrived, tracked apart from where the order is.
 *
 * Two axes rather than one list, because they genuinely move independently: cash
 * on delivery dispatches unpaid every day of the week, and UPI up front pays for
 * an order nobody has packed.
 */
export type OrderPaymentStatus = 'unpaid' | 'paid' | 'refunded';

/** One step, named and coloured by the API so no console invents its own words. */
export interface OrderStatusMeta {
  key: OrderStatus | OrderPaymentStatus;
  name: string;
  summary?: string;
  /** `info` | `brand` | `success` | `warn` | `danger` — what it should read as. */
  tone: string;
  sequence: number;
}

/**
 * One line of an order — a product, a quantity, and what it cost **that day**.
 *
 * Everything about the product is copied onto the row rather than joined: an
 * order is a historical fact and a catalogue is not, so a line showing today's
 * price against last March's sale would be wrong in the one place a business
 * cannot afford it. `productId` may be null, because the product can be deleted
 * and the record of having sold it must not go with it.
 *
 * `unitPrice` is null on a product priced in words, and a null is **not a zero**:
 * it is a line that cannot be added up, which is what `unpricedItems` on the
 * order counts.
 */
export interface OrderItem {
  id: number;
  orderId: number;
  productId?: number | null;
  productName: string;
  productSku?: string | null;
  productSlug?: string | null;
  quantity: number;
  unitPrice: number | null;
  /** The normal price, where the line was bought on offer. For the record. */
  listPrice: number | null;
  /** What the card printed instead of a number, where it printed one. */
  priceLabel?: string | null;
  lineTotal: number | null;
}

/**
 * One order, as the console reads it.
 *
 * `nextStatuses` and `nextPaymentStatuses` come from the API rather than being
 * worked out here, for the reason the functionality switches do: a console that
 * decided its own buttons would eventually offer one the API refuses, and the
 * person pressing it would be told off for something the screen invited.
 */
export interface CompanyOrder {
  /**
   * **Not `AuditFields`**, and that is deliberate.
   *
   * Every other row on the platform carries an active/inactive `status`. An
   * order is *cancelled*, and `status` below is already that field — a second
   * one would give a console two ways to make an order go away and two different
   * meanings for a list that looks complete.
   */
  id: number;
  createdAt?: string;
  updatedAt?: string;

  companyId: number;
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;

  /** `ORD-00012`. What the customer reads back down the phone. */
  orderNo: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentReference?: string | null;
  /** The order route at the time, snapshotted. See `OrderMode`. */
  mode?: OrderMode | null;

  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerNote?: string | null;

  itemCount: number;
  /** Lines the platform could not price. Why `subtotal` is not the whole order. */
  unpricedItems: number;
  subtotal: number;
  /** Delivery, a discount agreed on the phone, a rounding. Signed. */
  adjustment: number;
  adjustmentNote?: string | null;
  total: number;
  currency: string;

  warehouseId?: number | null;
  warehouse?: { id: number; name: string; code: string } | null;
  /** Whether this order is currently holding stock, and whether it has taken it. */
  stockReserved: boolean;
  stockIssued: boolean;

  sentToWhatsapp: boolean;
  sourceUrl?: string | null;
  internalNote?: string | null;
  cancelReason?: string | null;

  confirmedAt?: string | null;
  packedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;

  items?: OrderItem[];
  /** The moves this order may still make. Decided by the API, never here. */
  nextStatuses: OrderStatus[];
  nextPaymentStatuses: OrderPaymentStatus[];
}

/** `GET /my-company/orders/summary` — the strip above the list. */
export interface OrderSummary {
  byStatus: Record<OrderStatus, number>;
  /** Everything still owed to somebody. Unwindowed: an old open order counts. */
  open: number;
  today: number;
  unpaid: { orders: number; amount: number };
  statuses: OrderStatusMeta[];
  paymentStatuses: OrderStatusMeta[];
}

/* ---------------------------- warehouse ---------------------------- */

/**
 * Somewhere stock physically is.
 *
 * **Not a branch.** A branch is a place the business trades from; a warehouse is
 * a place things are kept, and the two are not the same cardinality — three
 * shops can run out of one central store. `branchId` says which shop a store
 * serves where that is true; null means it serves the whole company.
 */
export interface Warehouse extends AuditFields {
  companyId: number;
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  name: string;
  /** `MAIN`, `WH-2`. Unique per tenant, upper-cased, goes on a pick list. */
  code: string;
  addressLine?: string | null;
  city?: string | null;
  stateId?: number | null;
  state?: { id: number; name: string } | null;
  pincode?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  /** Where an order goes when nobody said. Exactly one per company. */
  isDefault: boolean;
  notes?: string | null;
  sequence: number;
  /** What is in it right now, sent alongside the row by the list endpoint. */
  stock?: { onHand: number; reserved: number; available: number; lines: number };
}

/**
 * How many of one product are in one warehouse.
 *
 * `available` is `quantity - reserved` and it is the number that matters: a box
 * that is physically present and already promised to a confirmed order is not
 * one anybody else can have. `isLow` and `isOut` are the API's answers, so the
 * console, the reports and any future theme agree about what low means.
 */
export interface StockLevel {
  id: number;
  companyId: number;
  warehouseId: number;
  warehouse?: { id: number; name: string; code: string } | null;
  productId: number;
  product?: {
    id: number;
    name: string;
    sku?: string | null;
    slug?: string | null;
    price?: number | string | null;
    offerPrice?: number | string | null;
    trackInventory?: boolean;
    status?: Status;
    categoryId?: number | null;
  } | null;
  quantity: number;
  reserved: number;
  available: number;
  /** Zero means do not warn me, which is the honest default. */
  reorderLevel: number;
  binLocation?: string | null;
  lastMovementAt?: string | null;
  isLow: boolean;
  isOut: boolean;
}

export type StockMovementType = 'in' | 'out' | 'adjust';
export type StockReason = 'opening' | 'purchase' | 'sale' | 'return' | 'damage' | 'correction' | 'transfer';

/** One reason, and which way it moves stock. `null` means it can go either way. */
export interface StockReasonMeta {
  key: StockReason;
  name: string;
  direction: StockMovementType | null;
  summary: string;
  sequence: number;
}

/**
 * One movement — the ledger.
 *
 * Append-only: there is no update and no delete, by design. A mistake is
 * corrected by a `correction` movement that says a count disagreed, which leaves
 * both the error and the fix visible. That is the whole difference between a
 * stock system and a number in a spreadsheet.
 *
 * `createdBy` is filled in even on the movements the platform writes, because a
 * person still caused them — dispatching an order is somebody pressing a button.
 * Null means no signed-in actor was behind it at all, which nothing does today.
 */
export interface StockMovement {
  id: number;
  companyId: number;
  warehouseId: number;
  warehouse?: { id: number; name: string; code: string } | null;
  productId: number;
  product?: { id: number; name: string; sku?: string | null } | null;
  type: StockMovementType;
  reason: StockReason;
  /** Always positive. The type carries the direction. */
  quantity: number;
  /** What the level read once this had been applied. */
  balanceAfter: number;
  unitCost?: number | string | null;
  orderId?: number | null;
  order?: { id: number; orderNo: string } | null;
  counterWarehouseId?: number | null;
  reference?: string | null;
  note?: string | null;
  createdBy?: number | null;
  createdAt: string;
}

/* ---------------------------- analytics ---------------------------- */

/** One day of a series. Gap-filled by the API, so every day in the window is here. */
export interface DayPoint {
  day: string;
  orders?: number;
  revenue?: number;
  in?: number;
  out?: number;
  adjust?: number;
}

/**
 * How the shop has been trading.
 *
 * **Cancelled orders are not sales** — every revenue figure here excludes them,
 * while `byStatus` includes them because that one has to add up to what arrived.
 * **`unpricedItems` is not zero** — it counts lines whose product is priced in
 * words, which are real parts of real orders that cannot be added up.
 */
export interface SalesAnalytics {
  range: { days: number; from: string; to: string };
  totals: {
    orders: number;
    revenue: number;
    units: number;
    unpricedItems: number;
    averageOrderValue: number;
    cancelled: number;
    open: number;
    awaitingPayment: number;
  };
  lifetime: { orders: number; revenue: number };
  byStatus: Record<OrderStatus, number>;
  byPayment: Record<OrderPaymentStatus, { orders: number; amount: number }>;
  daily: DayPoint[];
  topProducts: { productId: number | null; name: string; units: number; revenue: number }[];
  recent: Partial<CompanyOrder>[];
}

/**
 * What is on the shelves.
 *
 * **Two valuations, and both are needed.** `retailValue` is the stock at what the
 * catalogue sells it for; `costValue` is what it was bought for. `costCoverage`
 * is the share of stock that actually has a cost behind it, reported so nobody
 * reads the second as complete when half the shelf arrived before anyone started
 * typing costs in.
 */
export interface StockAnalytics {
  range: { days: number; from: string; to: string };
  totals: {
    lines: number;
    products: number;
    onHand: number;
    reserved: number;
    available: number;
    lowCount: number;
    outCount: number;
    retailValue: number;
    costValue: number;
    costCoverage: number;
  };
  byWarehouse: {
    warehouseId: number;
    name: string;
    code: string | null;
    onHand: number;
    reserved: number;
    available: number;
    lines: number;
  }[];
  movements: DayPoint[];
  topMoving: { productId: number; name: string; sku: string | null; units: number }[];
  low: StockShortage[];
  out: StockShortage[];
}

/** A product that is low or out, in one warehouse. */
export interface StockShortage {
  productId: number;
  name: string;
  sku: string | null;
  warehouseId: number;
  warehouseName: string | null;
  quantity: number;
  reserved: number;
  available: number;
  reorderLevel: number;
}

/* --------------------------- optional functionality --------------------------- */

/** A key the platform implements. Mirrors `FUNCTIONALITY` in the API. */
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

/** Why a functionality is not live. `null` when it is. */
/**
 * Why a functionality is not on the website.
 *
 * `empty` is the one that is not about entitlement: the plan grants it, the
 * switch is on, the term is running — and the section still does not appear,
 * because nothing has been written into it. Several sections are absent rather
 * than empty by design, so this is an ordinary state rather than a fault.
 */
export type FunctionalityBlockReason =
  | 'not_in_plan'
  | 'disabled'
  | 'expired'
  | 'suspended'
  | 'no_plan'
  | 'empty';

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
  /** Where an order may be sent, and what each route needs to work. */
  orderModes: OrderModeMeta[];
  /** The order queue's own vocabulary — what each step is called and means. */
  orderStatuses: OrderStatusMeta[];
  orderPaymentStatuses: OrderStatusMeta[];
  /** Why stock moved, and which way each reason moves it. */
  stockReasons: StockReasonMeta[];
  /** The subset a person may write. `sale` and `transfer` are the platform's. */
  stockManualReasons: StockReason[];
  /** The windows the analytics screens may ask for. */
  analyticsRanges: number[];
  /** The cart's own wording, shown as the placeholders on its screen. */
  orderDefaults: OrdersSettings;
  /** The glyphs a benefit card may carry, with the artwork to draw them. */
  featureIcons: FeatureIconMeta[];
}

/**
 * Where an order goes when a visitor sends it.
 *
 *   whatsapp  the basket arrives as a composed message on the company's own
 *             number. Nothing is stored on the platform.
 *   payment   the visitor pays first, through the company's UPI id or payment
 *             link. The order still reaches WhatsApp alongside where a number
 *             is published — a payment with no idea what was bought is not an
 *             order.
 *   none      no cart and no order button anywhere on the site. A real setting
 *             rather than "switch the feature off": the labels, the number and
 *             the payment details are all kept, so turning orders back on next
 *             month sets none of it up again.
 *
 * `whatsapp` needs a published number and `payment` needs a UPI id or a link.
 * Without them the website withholds the cart entirely rather than painting a
 * button that leads nowhere, which is what the screen warns about.
 */
export type OrderMode = 'whatsapp' | 'payment' | 'none';

/** One entry of the platform's own list of order routes. */
export interface OrderModeMeta {
  key: OrderMode;
  name: string;
  summary: string;
  /** What the company must have published for this route to work, or null. */
  requires: string | null;
  sequence: number;
}

/**
 * The cart's wording and its terms — the `orders` functionality's settings
 * blob, which is the whole of what this feature stores.
 *
 * There is no orders *table*. An order is handed to WhatsApp or to a payment
 * app and nothing is kept on the platform, exactly as a service enquiry sent
 * with the `whatsapp` target is: the company already has an inbox and a phone,
 * and a queue nobody has open is a queue nobody packs.
 */
export interface OrdersSettings {
  mode: OrderMode;
  /**
   * Off means one product per order — the button says *Order now* and sends
   * that single line, with no basket in between. A trade counter selling one
   * large thing at a time wants that; a shop selling six small ones wants the
   * basket.
   */
  cart: boolean;

  addToCartLabel: string;
  buyNowLabel: string;
  submitLabel: string;
  cartTitle: string;
  cartNote: string;

  /** Which published number an order reaches. Falls back to `contact`. */
  whatsappType: WhatsappType;
  /** The first line of the composed message, above the basket. */
  messageIntro: string;

  requireName: boolean;
  requirePhone: boolean;
  requireAddress: boolean;
  /** Below this the order cannot be sent. Null means no minimum. */
  minOrderAmount: number | null;

  /** `name@bank`, turned into a payment link with the total already on it. */
  upiId: string | null;
  payeeName: string | null;
  /** A hosted payment page, for a company taking cards rather than UPI. */
  paymentUrl: string | null;
  paymentLabel: string;
  paymentNote: string;
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

/* -------------------------------- services -------------------------------- */

/**
 * One service the business sells.
 *
 * The closest thing to a `FeatureCard`, and deliberately not the same thing: a
 * benefit is a reason to choose the business, a service is a thing it sells,
 * and only one of the two carries a price. What this has on top is a picture,
 * a list of what is included, and a price line.
 */
export interface ServiceCard extends AuditFields {
  companyId: number;
  /** Branch this belongs to; null means the whole company. */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** A key from the same icon library the benefit cards use. */
  icon: string;
  /** Upload path, e.g. `/uploads/service/fitting.jpg`. Optional — the icon covers it. */
  image?: string | null;
  title: string;
  summary?: string | null;
  /** What is included, as a short list. Capped by the API; see `ServicesSettings`. */
  highlights?: string[] | null;
  /** Free text, never a number — `From ₹45,000`, `On request`, `£60/hour`. */
  priceLabel?: string | null;
  /**
   * Whether the website actually prints that price.
   *
   * Separate from clearing `priceLabel`, which would hide the figure and lose
   * it. This hides it and keeps it — for quoting on the phone, for the enquiry
   * it gets copied onto, and for the service revenue report. The difference
   * between a pricing decision and a publishing one.
   */
  showPrice?: boolean;
  /** This card's own button label. Blank means "use the section's". */
  ctaLabel?: string | null;

  /** Where it is filed, and the page it lives at. */
  categoryId?: number | null;
  category?: { id: number; name: string; slug: string } | null;
  /** Its own address on the website. Not rewritten when the title changes. */
  slug: string;
  /** The long copy on that page. Plain text; the website prints paragraphs. */
  description?: string | null;

  /**
   * The price as a **number**, beside the free-text label rather than instead of
   * it. A surveyor quotes per job and can only honestly write "From ₹4,999"; a
   * salon charges ₹300 for a haircut and has always known that.
   */
  price?: number | string | null;
  offerPrice?: number | string | null;
  /** On offer, ticked by hand — the only way a service priced in words can be. */
  onOffer?: boolean;

  /** How long it takes. Null where the business genuinely cannot say. */
  durationMinutes?: number | null;
  /** Whether a visitor may take a time for this one, rather than only ask. */
  bookable?: boolean;
  /**
   * How many can hold the same slot for **this** service.
   *
   * `null` hands the question back to the company's limit, which is the ordinary
   * case. A number is an override for the service whose constraint is the work
   * rather than the business — one colourist, one van — and it wins even when it
   * is smaller.
   */
  slotCapacity?: number | null;
  /** Read this one first. The website gives it the wide cell. */
  featured?: boolean;
  sequence: number;
}

/**
 * One heading a business sorts its work under - `Hair`, and `Colour` beneath it.
 *
 * Its own tree rather than a corner of the product one: they are sold
 * separately, and `/products/bridal` and `/services/bridal` are different pages
 * that would otherwise have to fight over one slug.
 */
export interface ServiceCategory extends AuditFields {
  companyId: number;
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** NULL is a main category; anything else makes this a subcategory. */
  parentId?: number | null;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  icon: string;
  featured?: boolean;
  sequence: number;
  /** Services filed **directly** here. The screen warns with it before a delete. */
  serviceCount?: number;
  /** Present only when the list was asked for as a tree. */
  children?: ServiceCategory[];
}

/**
 * When a company takes appointments.
 *
 * Kept on the services settings blob rather than in a table, because it is one
 * short block per company - the same place the section's wording lives. Off by
 * default: booking is the only thing in this section that makes a promise on the
 * company's behalf, since a slot a stranger picks is one somebody has to turn up
 * for.
 */
export interface BookingSettings {
  /*
   * No `enabled` here: whether a tenant takes appointments is the
   * `service_booking` grant, decided by the one service that decides every other
   * feature. A second switch in here would be a second answer to one question.
   */
  /** 0-6 with Sunday at 0, matching `Date.getDay()` on both sides. */
  days: number[];
  openTime: string;
  closeTime: string;
  /** The grid a day is cut into. A service longer than one slot takes several. */
  slotMinutes: number;
  /**
   * How many bookings one slot holds, for the whole company.
   *
   * The shop's own capacity - three chairs, two vans - said once rather than on
   * every service. A service may override it where the constraint is the work
   * rather than the business; see `ServiceCard.slotCapacity`.
   */
  slotCapacity: number;
  /** The least notice the company will take. */
  leadHours: number;
  /** How far ahead the diary is open. */
  horizonDays: number;
  note: string;
}

/** Where an appointment has got to, as the **customer** reads it. */
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'completed' | 'cancelled';

/**
 * The Services section's own wording, plus the name its page carries in the
 * website's menu.
 *
 * Saved through the functionality's settings route rather than with the cards,
 * because it is one block per company rather than a list. `navLabel` is here
 * for a reason of its own: Services is a page as well as a band, and it has no
 * settings table to keep a name in — unlike About and Contact, which do.
 */
export interface ServicesSettings {
  /** Blank keeps the platform's name. Shown as the field's placeholder. */
  navLabel: string | null;
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  /** The label on the button each card carries, unless the card overrides it. */
  ctaLabel: string;
  /** Where a submitted enquiry goes. */
  enquiryTarget: EnquiryTarget;
  /** The heading on the dialog the button opens, and the line under it. */
  formTitle: string;
  formNote: string;

  /* The categories band and the offers band, each with its own wording. */
  categoriesEyebrow: string;
  categoriesTitle: string;
  categoriesLead: string;
  offersEyebrow: string;
  offersTitle: string;
  offersLead: string;
  /** The button on a bookable card, where "Enquire" is the wrong promise. */
  bookLabel: string;

  /** The diary. See `BookingSettings`. */
  booking: BookingSettings;
}

/* ---------------------------------- blog ---------------------------------- */

/**
 * Which of four states a post is in, decided by the **API** and rendered here.
 *
 *   live        active, and its date has passed
 *   scheduled   active, dated in the future. Written, saved, waiting.
 *   draft       active, with no date at all
 *   hidden      taken off the site, keeping its date
 *
 * Not derived in this app, deliberately. It is `status` and `publishedAt` read
 * together, and working the same rule out a second time in Angular is how the
 * console would come to claim a post is live on a day the website disagrees.
 */
export type BlogState = 'live' | 'scheduled' | 'draft' | 'hidden';

/** One article, as the console sees it — body included, since this is the editor. */
export interface BlogPost extends AuditFields {
  companyId: number;
  /** Branch this belongs to; null means the whole company. */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** The address it is published at. **Not** rewritten when the title changes. */
  slug: string;
  title: string;
  /** The standfirst. Blank, and the website uses the opening of the article. */
  excerpt?: string | null;
  /** Plain text, blank lines between paragraphs. Never HTML; see the API's model. */
  body: string;
  coverImage?: string | null;
  /** A name typed by hand, not a staff account. Blank means the company itself. */
  author?: string | null;
  tags?: string[] | null;
  /**
   * When it goes live, and the date printed on it. A future date schedules the
   * post; null is a draft.
   */
  publishedAt?: string | null;
  /** Pins it above the dates without changing its date. */
  featured?: boolean;
  /** The API's answer, not this app's. See `BlogState`. */
  state: BlogState;
  /** Roughly how long it takes to read. Estimated by the API from the body. */
  readMinutes: number;
}

/** The strip above the list. `lastPostedAt` is the figure that actually matters. */
export interface BlogSummary {
  total: number;
  live: number;
  scheduled: number;
  drafts: number;
  hidden: number;
  latest: { id: number; title: string; slug: string; publishedAt: string } | null;
}

/** One label a tenant has used, and how many posts carry it. */
export interface BlogTag {
  tag: string;
  count: number;
}

/**
 * The blog's own wording, plus the name its archive carries in the menu.
 *
 * Saved through the functionality's settings route rather than with the posts,
 * because it is one block per company rather than a list — the same split
 * Services makes, and for the same reason.
 */
export interface BlogSettings {
  /** Blank keeps the platform's name. Shown as the field's placeholder. */
  navLabel: string | null;
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  /** The label under each card. */
  ctaLabel: string;
  /**
   * Whether the site prints who wrote each post.
   *
   * A company-wide choice rather than a per-post one: a business writing as
   * itself turns bylines off once here, instead of clearing the author box on
   * every article it will ever write.
   */
  showAuthor: boolean;
}

/* -------------------------------- catalogue ------------------------------- */

/**
 * One category in the company's catalogue — or, with a `parentId`, one
 * subcategory of another.
 *
 * One shape for both, because "main category" and "subcategory" are the same
 * thing at different heights. The tree is built from `parentId`, capped at three
 * levels by the API, and `children` is present only on the nested form the
 * management screen asks for with `?tree=true`.
 */
export interface ProductCategory extends AuditFields {
  companyId: number;
  /** Branch this belongs to; null means the whole company. */
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** The category above this one. Null makes it a main category. */
  parentId?: number | null;
  name: string;
  /** The readable half of a URL. Generated from the name unless one is sent. */
  slug: string;
  description?: string | null;
  /** Upload path, e.g. `/uploads/category/tables.jpg`. The icon is the fallback. */
  image?: string | null;
  /** A key from the same icon library the benefit cards and services use. */
  icon: string;
  featured?: boolean;
  sequence: number;
  /**
   * How many products are filed **directly** in this category. The screen shows
   * it on the row and warns with it before a delete, because deleting a category
   * unfiles its products rather than removing them.
   */
  productCount?: number;
  /** Only on the nested form — `list({ tree: true })`. */
  children?: ProductCategory[];
}

/** Whether a product can be had today. Never a count; the platform is not a warehouse. */
export type ProductStock = 'in_stock' | 'out_of_stock' | 'made_to_order';

/**
 * One product in the catalogue.
 *
 * The closest thing to a `ServiceCard` and deliberately not the same thing: a
 * service is work, priced in words, and a product is a thing, priced in a
 * number. That number is what lets the platform compute a discount, which is
 * what the whole offers half of this feature turns on.
 *
 * Pricing is three fields read in order. `price` is normal, `offerPrice` is
 * today's when it is lower, and `priceLabel` overrides the display entirely for
 * a business that cannot publish one number. `onOffer` is the flag such a
 * business ticks to run an offer anyway — an offer with no pair to derive a
 * percentage from.
 */
export interface Product extends AuditFields {
  companyId: number;
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  /** The deepest category this is filed in, not the main one. */
  categoryId?: number | null;
  category?: { id: number; name: string; slug: string } | null;

  name: string;
  slug: string;
  sku?: string | null;
  summary?: string | null;
  description?: string | null;

  /** Ordered upload paths. The first is the card image everywhere. */
  images?: string[] | null;
  highlights?: string[] | null;
  /** `[{ label, value }]` — the comparison table on the detail page. */
  specs?: { label: string; value: string }[] | null;

  price?: number | string | null;
  offerPrice?: number | string | null;
  /** Set means "print this instead of the numbers". */
  priceLabel?: string | null;
  onOffer?: boolean;
  /** What the badge says, overriding the computed percentage. */
  offerLabel?: string | null;

  stockStatus: ProductStock;
  /** This card's own button label. Blank means "use the section's". */
  ctaLabel?: string | null;
  featured?: boolean;
  /**
   * Whether it may go in a basket, when the company is taking orders at all.
   *
   * On by default, so switching the cart on puts a button on everything rather
   * than on nothing. It is the exception that is worth setting — the
   * made-to-measure item, the thing priced `On request`, the display piece that
   * is not for sale. Never the whole answer: an out-of-stock product is not
   * orderable whatever this says, and none of it matters unless the `orders`
   * functionality is live.
   */
  orderable?: boolean;
  sequence: number;
}

/**
 * The catalogue's own wording — three blocks of it, plus the name its page
 * carries in the menu.
 *
 * Three rather than one because the catalogue puts three bands on a site and
 * they make three different arguments: categories answer *what kind of thing do
 * you sell*, the product band answers *show me some*, and offers answer *why buy
 * today*. One heading over all three would be wrong above at least two.
 */
export interface ProductsSettings {
  /** Blank keeps the platform's name. Shown as the field's placeholder. */
  navLabel: string | null;
  eyebrow: string;
  /** `{company}` is filled in by the website. */
  title: string;
  lead: string;
  categoriesEyebrow: string;
  categoriesTitle: string;
  categoriesLead: string;
  offersEyebrow: string;
  offersTitle: string;
  offersLead: string;
  /** The label on every product card, unless the card overrides it. */
  ctaLabel: string;
}

/**
 * Where a service enquiry goes when a visitor submits it.
 *
 *   whatsapp  straight into WhatsApp, composed and ready to send. Nothing is
 *             stored on the platform.
 *   admin     recorded as a row in Service Leads. Nothing leaves the platform.
 *   both      recorded *and* handed to WhatsApp. The default, because it is the
 *             only one that loses nothing.
 *
 * `whatsapp` needs a published number to be worth offering; without one the API
 * degrades `both` to `admin` and withholds the button entirely on `whatsapp`.
 */
export type EnquiryTarget = 'whatsapp' | 'admin' | 'both';

/**
 * One person who filled in the enquiry form on a service card.
 *
 * Not a `Lead`. That table is one row per device that opened the website —
 * traffic, with a stage bolted on. This is somebody who typed their name and
 * number in because they want a call about a specific service, and it is one
 * row per asking rather than per person.
 */
export interface ServiceLead extends AuditFields {
  /**
   * What the card said it cost **when they asked**, copied onto the enquiry.
   *
   * Free text, because that is what a service price is. It is what the customer
   * read, not what the job came to — see `amount`.
   */
  servicePriceLabel?: string | null;

  /**
   * What the job is actually worth, as a number. Typed by the shop once somebody
   * has quoted it; null for as long as nobody has, which is most of an enquiry's
   * life. Everything the revenue report says is built from this.
   */
  amount?: number | string | null;
  currency?: string;

  /** The same three words an order's payment uses. */
  paymentStatus?: OrderPaymentStatus;
  paymentReference?: string | null;
  paidAt?: string | null;

  /** The account that asked, where one was signed in. */
  customerId?: number | null;

  companyId: number;
  branchId?: number | null;
  branch?: { id: number; name: string; code: string } | null;
  serviceId?: number | null;
  service?: { id: number; title: string; icon: string } | null;
  /**
   * What the service was called when the enquiry was raised, copied onto the
   * row rather than joined — services get renamed and deleted, and an enquiry
   * is a thing that happened.
   */
  serviceTitle?: string | null;
  name: string;
  phone: string;
  /** The same five stages Lead Management uses, so there is one vocabulary. */
  stage: LeadStage;
  /** Whatever the company wants to remember. Theirs, not the visitor's. */
  note?: string | null;
  /** True when the visitor was also handed the message to send on WhatsApp. */
  sentToWhatsapp: boolean;
  sourceUrl?: string | null;

  /* ---------------------------- the appointment --------------------------- */
  /*
   * Present only on rows that asked for a **time**, which is a different act
   * from asking a question. Null on every other row.
   */
  /** The day and the slot, in the **company's** own working day. */
  bookingDate?: string | null;
  bookingTime?: string | null;
  /** How long the service was said to take when it was booked. Copied, not joined. */
  bookingMinutes?: number | null;
  /** Where the appointment has got to. Not `stage`: that is the sales pipeline. */
  bookingStatus?: BookingStatus | null;
  /** What the company said back - the one field here the customer reads. */
  bookingResponse?: string | null;
}

/** `GET /my-company/service-leads` — the page, the counts and the filters. */
export interface ServiceLeadView {
  items: ServiceLead[];
  /**
   * Counts for the whole scope, never the open filter: a count the browser
   * derived from a filtered page would read zero on the very tab that needed it.
   */
  counts: Record<LeadStage | 'total', number> & {
    /**
     * The appointments, beside the stages rather than among them.
     *
     * A booking's status and an enquiry's stage are different axes — a confirmed
     * appointment can still be `new` in the company's own pipeline — so adding
     * these into the total would count the same row twice. Absent on an API too
     * old to send them, which is why they are optional.
     */
    awaitingBooking?: number;
    confirmedBooking?: number;
  };
  /** Every service, including switched-off ones — an enquiry against one still
      has to be findable. */
  services: { id: number; title: string; status: Status }[];
  stages: LeadStage[];
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
  /**
   * granted && enabled && the plan is still being served.
   *
   * Entitlement only. A section can be `active` and still show nothing on the
   * website, because several of them are absent rather than empty when the
   * company has written nothing into them — that is `published`.
   */
  active: boolean;
  /**
   * Live **and** actually carrying something.
   *
   * False on a switched-on section with nothing in it, which is a section the
   * website does not render at all. `null` on the endpoints that do not count
   * content, and on the features that have none to count.
   */
  published: boolean | null;
  /** How many rows this section publishes, where it is that kind of section. */
  contentCount: number | null;
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

  /**
   * The blocks that only exist where the tenant has bought them.
   *
   * **`null` means not purchased, and the dashboard renders on that.** A shop
   * without the catalogue should not get an empty Products card sitting there
   * being nought forever — that reads as something broken rather than something
   * not bought. The API decides, exactly as it does for the public website.
   */
  catalogue: {
    products: number;
    live: number;
    hidden: number;
    offers: number;
    categories: number;
    /** Counted from the flag, for the products the warehouse is not answering for. */
    outOfStock: number;
  } | null;

  orders: {
    byStatus: Partial<Record<OrderStatus, number>>;
    /** Everything still owed to somebody. Unwindowed — an old open order counts most. */
    open: number;
    today: number;
    month: { orders: number; revenue: number };
    unpaid: { orders: number; amount: number };
  } | null;

  warehouse: {
    units: number;
    /** Distinct (warehouse, product) pairs anybody has counted. */
    tracked: number;
    onHand: number;
    reserved: number;
    available: number;
    low: number;
    out: number;
  } | null;

  customers: { total: number; active: number; joinedLast30: number } | null;

  /**
   * The service side, immediately after the order book — the two halves of
   * what a business sells, things and work. `null` unless the tenant has
   * Services, like every other block here.
   */
  services: {
    enquiries: number;
    new: number;
    lastThirtyDays: number;
    quoted: number;
    collected: number;
    /** Agreed and not yet paid. */
    outstanding: number;
    /** Waiting to be confirmed — somebody is at the other end of this one. */
    awaiting: number;
    confirmed: number;
    todayBookings: number;
  } | null;
}

/* ------------------------------- customers ------------------------------ */

/**
 * Somebody who buys from this tenant and can sign in to say so.
 *
 * **The phone number is the identity** — unique per company, normalised by the
 * API, and not editable from here: changing it would move the account to a
 * different person and take their order history with it. There is no password to
 * reset either; sign-in is a one-time code to that number.
 *
 * `spent` excludes cancelled orders, the rule every revenue figure on the
 * platform follows: a best-customer list that counted refunded money would rank
 * the person who cancelled the most.
 */
export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  phoneVerified: boolean;
  status: Status;
  /** The shop's own note. Never shown to the customer. */
  notes: string | null;
  lastLoginAt: string | null;
  createdAt?: string;

  orders: number;
  spent: number;
  lastOrderAt: string | null;
}

/** One place a customer wants things delivered. See the API's model. */
export interface CustomerAddress {
  id: number;
  label: string;
  contactName: string | null;
  contactPhone: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: { id: number; name: string } | null;
  pincode: string | null;
  isDefault: boolean;
  /** The whole thing as one block, formatted by the API. Printed, never re-joined. */
  formatted: string;
}

/** `GET /my-company/customers/summary` — the strip above the list. */
export interface CustomerSummary {
  total: number;
  active: number;
  inactive: number;
  joinedLast30: number;
  /**
   * How many have actually bought something. The gap between this and `total` is
   * the number worth watching: accounts that registered and never ordered are a
   * checkout somebody abandoned.
   */
  withOrders: number;
}

/** Everything the detail screen needs, in one request. */
export interface CustomerDetail {
  customer: Customer;
  addresses: CustomerAddress[];
  orders: CompanyOrder[];
}

/**
 * What the services are earning.
 *
 * **Three numbers, because one would be a lie.** An enquiry becomes a sale
 * somewhere between arriving and being paid for, and a single "revenue" figure
 * would have to pick a moment and pretend the others do not exist:
 *
 *   quoted     every enquiry with a figure on it, whatever stage it is at
 *   won        quoted *and* converted — work the shop has been given
 *   collected  paid — money in the bank
 *
 * The gap between `won` and `collected` is `outstanding`: the invoice nobody has
 * chased, and the most useful number here.
 *
 * `unquoted` counts the enquiries with no figure at all, so an average job value
 * is not quietly dragged towards zero by rows nobody has priced.
 */
export interface ServiceRevenue {
  range: { days: number; from: string; to: string };
  quoted: { count: number; total: number };
  won: { count: number; total: number };
  collected: { count: number; total: number };
  outstanding: number;
  unquoted: number;
  averageQuote: number;
  byStage: Record<LeadStage, number>;
  byService: { service: string; enquiries: number; total: number }[];
}

/**
 * How the service side of the business is doing, over one window.
 *
 * Beside `ServiceRevenue` rather than replacing it, and the split is the same one
 * the API makes: revenue answers *what are the services earning*, which somebody
 * opens on a Friday, and this answers *what is happening* — demand, conversion,
 * which services get asked about, and how much of the diary is being confirmed.
 *
 * Shaped like `SalesAnalytics` and `StockAnalytics` on purpose, so one screen can
 * draw all three the same way.
 */
export interface ServiceAnalytics {
  range: { days: number; from: string };

  totals: {
    enquiries: number;
    /** The ones that asked for a slot rather than only asking a question. */
    bookings: number;
    /** Nobody has put a figure on these yet. Never counted as zero. */
    unquoted: number;
    quoted: number;
    won: number;
    collected: number;
    /** Agreed and not yet paid — the figure somebody can act on today. */
    outstanding: number;
    /** Over the quoted rows only, so unpriced enquiries cannot drag it down. */
    averageQuote: number;
    /** Converted as a percentage of **every** enquiry, not just the quoted ones. */
    conversion: number;
  };

  byStage: Record<LeadStage, number>;
  byBooking: Record<BookingStatus, number>;
  /** How many requested slots were confirmed, as a percentage. */
  bookingAcceptance: number;

  /** The day people **asked**: demand, and what it was worth. */
  daily: { day: string; enquiries: number; amount: number }[];
  /** The day people want to **come in**: what the shop has to staff. */
  bookingDaily: { day: string; bookings: number }[];

  topServices: { title: string; enquiries: number; amount: number }[];
  lifetime: { enquiries: number; quoted: number };
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
