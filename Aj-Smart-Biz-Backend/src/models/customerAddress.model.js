'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * One place a customer wants things delivered.
 *
 * **Several per customer, because people have several.** Home and work is the
 * ordinary case; a parent's address at the weekend is the one that makes a
 * single-address design annoying. The whole point of the account is not having
 * to type it again, and that only pays off if all of them are kept.
 *
 * ### It is copied onto the order, not referenced by it
 *
 * `company_orders.customer_address` is text, written at the moment the order is
 * placed. An address is edited — people move, or correct a typo in a pincode —
 * and an order that resolved its address through a join would silently start
 * claiming it was delivered somewhere it never went. So the id picks it at
 * checkout and the text is what survives, which is the rule every other thing on
 * an order already follows.
 *
 * Which also means deleting an address is safe and needs no cascade guard: the
 * orders that went there still say so.
 *
 * ### The name and phone on it are not the account's
 *
 * A delivery to a parent, an office reception, a gift to a friend — the person
 * receiving it is often not the person who ordered. Both fall back to the
 * customer's own when left empty, so the ordinary case is still three fields.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CustomerAddress',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      /**
       * Carried alongside `customerId` so every query is pinned to one tenant
       * without a join — the rule this platform applies to every child table.
       */
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

      /** `Home`, `Work`, `Other` — see `ADDRESS_LABELS`. One word, for a picker. */
      label: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Home' },

      /** Who is receiving it, where that is not the account holder. */
      contactName: { type: DataTypes.STRING(120), allowNull: true },
      contactPhone: { type: DataTypes.STRING(20), allowNull: true },

      /**
       * Two lines rather than one box, and rather than five.
       *
       * One box loses the shape a courier reads; five (house, street, area,
       * landmark, …) is a form people abandon. Two lines plus a city and a
       * pincode is what a delivery label actually carries in this market.
       */
      line1: { type: DataTypes.STRING(200), allowNull: false },
      line2: { type: DataTypes.STRING(200), allowNull: true },
      /** "Opposite the petrol pump" — the line that actually gets things found. */
      landmark: { type: DataTypes.STRING(150), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: false },
      stateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },

      /**
       * The one the checkout starts on. Exactly one per customer, held by the
       * controller: the first address saved becomes it, and promoting another
       * demotes the incumbent in the same transaction.
       */
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'customer_addresses',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['customer_id'] },
        { fields: ['status'] },
      ],
    }
  );
