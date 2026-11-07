'use strict';

const { DataTypes } = require('sequelize');
const { DISCOUNT_TYPE_VALUES } = require('../constants');

/**
 * One line of an invoice: a product, how many, at what price, less what
 * discount, plus what tax.
 *
 * The product is copied onto the line — name, SKU, unit price — and `productId`
 * is kept only as a nullable pointer, exactly like `company_order_items`. A
 * product renamed or deleted next month must not rewrite a bill already printed.
 *
 *   gross       unitPrice × quantity
 *   discount    gross × value% (percent) or the flat value (amount), capped at gross
 *   taxable     gross − discount
 *   tax         taxable × taxPercent%
 *   lineTotal   taxable + tax
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyInvoiceItem',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      invoiceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      productName: { type: DataTypes.STRING(200), allowNull: false },
      productSku: { type: DataTypes.STRING(60), allowNull: true },

      quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      /** The catalogue's normal price on the day, for the "you saved" line. */
      listPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      gross: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      discountType: { type: DataTypes.ENUM(...DISCOUNT_TYPE_VALUES), allowNull: true },
      discountValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      taxable: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      taxPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      tax: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      lineTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

      /** Whether issuing took this line off the shelf. */
      stockDeducted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      sequence: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },

      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_invoice_items',
      /* Lines live and die with their invoice; no soft delete of their own. */
      paranoid: false,
      indexes: [{ fields: ['invoice_id'] }, { fields: ['company_id'] }, { fields: ['product_id'] }],
    }
  );
