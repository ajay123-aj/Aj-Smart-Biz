'use strict';

const { DataTypes } = require('sequelize');
const {
  INVOICE_STATUS,
  INVOICE_STATUS_VALUES,
  INVOICE_PAYMENT_STATUS,
  INVOICE_PAYMENT_STATUS_VALUES,
  INVOICE_PAYMENT_MODE_VALUES,
  DISCOUNT_TYPE_VALUES,
} = require('../constants');

/**
 * A bill raised at the counter by the tenant's own staff.
 *
 * Not an order. An order is a stranger buying from the website and arrives
 * `pending`; an invoice is a sale that has already happened in front of the
 * person writing it. That is why it carries prices the staff may set, and
 * discounts, and why issuing it takes stock straight off the shelf instead of
 * reserving it first.
 *
 * Every money figure is stored rather than computed on the way out, for the
 * same reason `company_orders` stores them: a printed invoice is a historical
 * fact, and a total recomputed later under different rounding rules would
 * disagree with the paper the customer took home.
 *
 *   subtotal        Σ unit price × quantity, before any discount
 *   itemDiscount    Σ line discounts
 *   taxTotal        Σ tax on each line's discounted amount
 *   billDiscount    the discount on the whole bill, applied after line tax
 *   roundOff        what rounding to the rupee added or took away
 *   grandTotal      what the customer owes
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyInvoice',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** The unit stock is taken from when issued. Null = company default. */
      warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** Linked when the buyer has a customer account. Never relied on for display. */
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /** `INV-00001`. Null while a draft — a number is given only on issue. */
      invoiceNo: { type: DataTypes.STRING(30), allowNull: true },
      invoiceDate: { type: DataTypes.DATEONLY, allowNull: false },
      dueDate: { type: DataTypes.DATEONLY, allowNull: true },

      status: {
        type: DataTypes.ENUM(...INVOICE_STATUS_VALUES),
        allowNull: false,
        defaultValue: INVOICE_STATUS.DRAFT,
      },

      /* The buyer, copied onto the invoice as it was billed. */
      customerName: { type: DataTypes.STRING(160), allowNull: true },
      customerPhone: { type: DataTypes.STRING(20), allowNull: true },
      customerEmail: { type: DataTypes.STRING(160), allowNull: true },
      customerAddress: { type: DataTypes.STRING(500), allowNull: true },
      customerGstin: { type: DataTypes.STRING(20), allowNull: true },

      itemCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      itemDiscount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      taxTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      /** The bill-level discount as entered, and what it came to. */
      billDiscountType: { type: DataTypes.ENUM(...DISCOUNT_TYPE_VALUES), allowNull: true },
      billDiscountValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      billDiscount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      roundOff: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
      grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      amountPaid: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      paymentStatus: {
        type: DataTypes.ENUM(...INVOICE_PAYMENT_STATUS_VALUES),
        allowNull: false,
        defaultValue: INVOICE_PAYMENT_STATUS.UNPAID,
      },
      paymentMode: { type: DataTypes.ENUM(...INVOICE_PAYMENT_MODE_VALUES), allowNull: true },
      paymentReference: { type: DataTypes.STRING(120), allowNull: true },

      notes: { type: DataTypes.STRING(1000), allowNull: true },

      /** True when issuing wrote stock movements, so cancelling knows to return them. */
      stockApplied: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      issuedAt: { type: DataTypes.DATE, allowNull: true },
      issuedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      cancelledAt: { type: DataTypes.DATE, allowNull: true },
      cancelledBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      cancelReason: { type: DataTypes.STRING(500), allowNull: true },

      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_invoices',
      indexes: [
        /* Drafts have no number; MySQL allows many NULLs under a unique index. */
        { unique: true, fields: ['company_id', 'invoice_no'] },
        { fields: ['company_id', 'status'] },
        { fields: ['company_id', 'invoice_date'] },
        { fields: ['customer_id'] },
      ],
    }
  );
