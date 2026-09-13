'use strict';

const { DataTypes } = require('sequelize');

/**
 * One line of one order — a product, a quantity, and what it cost **that day**.
 *
 * Everything about the product is copied onto the row rather than joined: the
 * name, the SKU, the slug and the price. See `company_orders` for the argument
 * in full; the short version is that an order is a historical fact and a
 * catalogue is not, so a line that resolved today's price against last March's
 * sale would be wrong in the one place a business cannot afford it.
 *
 * `productId` survives anyway, nullable and with no cascade. "What else did this
 * product sell" is a real question worth being able to ask, and a product that is
 * later deleted must not take the record of having sold it with it.
 *
 * ### Price, and the absence of one
 *
 * `unitPrice` is what one of them cost — the offer price where there was one,
 * because that is what the customer actually saw and paid. It is **nullable**,
 * and a null is not a zero: a catalogue may price in words (`From ₹4,999`, `On
 * request`), and those lines are real parts of a real order that simply cannot be
 * added up. `priceLabel` keeps whatever was printed on the card instead, so the
 * order screen can show the line exactly as the customer read it, and the order's
 * `unpricedItems` counts them so no total ever passes itself off as complete.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyOrderItem',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      /**
       * Carried on the line as well as on its order.
       *
       * Redundant through `orderId`, and worth it: every analytics query here is
       * "this tenant's best sellers" or "this tenant's units shipped", and
       * without this column each of them needs a join to `company_orders` purely
       * to find out whose line it is.
       */
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

      /** The product, if it still exists. Never relied on for display. */
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /** What it was called, what it was referenced by, and where it lived. */
      productName: { type: DataTypes.STRING(200), allowNull: false },
      productSku: { type: DataTypes.STRING(60), allowNull: true },
      /** So the console can still link to the product page where it is published. */
      productSlug: { type: DataTypes.STRING(160), allowNull: true },

      quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },

      /** What one cost on the day. Null on a product priced in words. */
      unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      /** The normal price, where the line was bought on offer. For the record. */
      listPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      /** What the card printed instead of a number, where it printed one. */
      priceLabel: { type: DataTypes.STRING(60), allowNull: true },

      /**
       * `unitPrice * quantity`, stored rather than computed on the way out.
       *
       * A line total is read far more often than it is written, it is what every
       * sum in the analytics adds up, and storing it means a report and an order
       * screen cannot round differently. Null wherever `unitPrice` is.
       */
      lineTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_order_items',
      indexes: [
        { fields: ['order_id'] },
        { fields: ['company_id'] },
        { fields: ['product_id'] },
      ],
    }
  );
