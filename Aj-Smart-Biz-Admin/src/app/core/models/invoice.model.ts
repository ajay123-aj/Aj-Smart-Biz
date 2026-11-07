/** Counter invoices — the shapes `/admin/company/invoices` sends and accepts. */

export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid';
export type DiscountType = 'percent' | 'amount';

export interface CatalogueEntry {
  key: string;
  name: string;
  label?: string;
  tone?: string;
  sequence: number;
}

export interface InvoiceSeller {
  id: number;
  name: string;
  logo?: string | null;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  state?: { id: number; name: string } | null;
}

export interface InvoiceMeta {
  granted: boolean;
  active: boolean;
  /** True when issuing deducts stock (Warehouse & stock is live). */
  stockTracking: boolean;
  seller: InvoiceSeller | null;
  branches: { id: number; name: string; code: string }[];
  warehouses: { id: number; name: string; code: string; isDefault: boolean; branchId: number | null }[];
  statuses: CatalogueEntry[];
  paymentStatuses: CatalogueEntry[];
  paymentModes: CatalogueEntry[];
  discountTypes: CatalogueEntry[];
  taxPresets: number[];
}

export interface InvoiceProduct {
  id: number;
  name: string;
  sku: string | null;
  image: string | null;
  sellingPrice: number | null;
  listPrice: number | null;
  priceLabel: string | null;
  trackInventory: boolean;
  /** Sellable units in the invoice's warehouse; null when stock is not tracked. */
  available: number | null;
}

export interface InvoiceItem {
  id?: number;
  productId: number | null;
  productName: string;
  productSku?: string | null;
  quantity: number;
  unitPrice: number | string;
  listPrice?: number | string | null;
  gross: number | string;
  discountType: DiscountType | null;
  discountValue: number | string;
  discount: number | string;
  taxable: number | string;
  taxPercent: number | string;
  tax: number | string;
  lineTotal: number | string;
  stockDeducted?: boolean;
}

export interface Invoice {
  id: number;
  invoiceNo: string | null;
  invoiceDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  branchId: number | null;
  warehouseId: number | null;
  branch?: { id: number; name: string; code: string } | null;
  warehouse?: { id: number; name: string; code: string } | null;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerGstin: string | null;
  itemCount: number;
  subtotal: number | string;
  itemDiscount: number | string;
  taxTotal: number | string;
  billDiscountType: DiscountType | null;
  billDiscountValue: number | string;
  billDiscount: number | string;
  roundOff: number | string;
  grandTotal: number | string;
  amountPaid: number | string;
  paymentStatus: InvoicePaymentStatus;
  paymentMode: string | null;
  paymentReference: string | null;
  notes: string | null;
  stockApplied: boolean;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  /** The admin login that created it. */
  createdBy?: number | null;
  creator?: { id: number; name: string; email: string | null } | null;
  items?: InvoiceItem[];
}

export interface InvoicePeriod {
  count: number;
  total: number;
  collected: number;
  discount: number;
}

export interface InvoiceSummary {
  today: InvoicePeriod;
  month: InvoicePeriod;
  outstanding: number;
  drafts: number;
  /** Whose invoices these totals cover. */
  scope?: InvoiceScope;
}

/** `mine` — the invoices this admin created; `all` — everyone's. */
export type InvoiceScope = 'mine' | 'all';

/** `GET /admin/company/invoices/access`. */
export interface InvoiceAccess {
  me: { id: number; name: string };
  /** The "All invoices" permission (or the main admin). */
  canSeeAll: boolean;
  /** The "Invoice analysis" permission. */
  canAnalyse: boolean;
  /** For the "Created by" filter; empty unless `canSeeAll`. */
  admins: { id: number; name: string; email: string | null; status: string }[];
}

/** One row of any breakdown: how many invoices, how much, and its share of revenue. */
export interface InvoiceAnalysisLine {
  invoices: number;
  revenue: number;
  collected: number;
  /** Percentage of total revenue in the range. */
  share: number;
}

/** `GET /admin/company/invoices/analysis`. Issued invoices only. */
export interface InvoiceAnalysis {
  range: { from: string; to: string; days: number; granularity: 'day' | 'month' };
  scope: InvoiceScope;
  totals: {
    invoices: number;
    revenue: number;
    collected: number;
    outstanding: number;
    discount: number;
    tax: number;
    itemsSold: number;
    customers: number;
    averageBill: number;
    collectionRate: number;
  };
  trend: (InvoiceAnalysisLine & { period: string })[];
  byProduct: {
    productId: number | null;
    name: string;
    sku: string | null;
    quantity: number;
    revenue: number;
    discount: number;
    invoices: number;
    share: number;
  }[];
  byAdmin: (InvoiceAnalysisLine & { adminId: number | null; name: string; email: string | null; averageBill: number })[];
  byPaymentMode: (InvoiceAnalysisLine & { key: string; name: string })[];
  byPaymentStatus: (InvoiceAnalysisLine & { key: string; name: string })[];
  byBranch: (InvoiceAnalysisLine & { branchId: number | null; name: string })[];
}

export interface InvoiceLineInput {
  productId: number;
  quantity: number;
  unitPrice: number | null;
  discountType: DiscountType | null;
  discountValue: number;
  taxPercent: number;
}

export interface InvoiceInput {
  branchId: number | null;
  warehouseId: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerGstin: string;
  items: InvoiceLineInput[];
  billDiscountType: DiscountType | null;
  billDiscountValue: number;
  roundOff: boolean;
  amountPaid: number;
  paymentMode: string | null;
  paymentReference: string;
  notes: string;
  issue: boolean;
}
