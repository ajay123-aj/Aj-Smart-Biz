'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * Somewhere stock physically is.
 *
 * **Not a branch.** A branch is a place the business trades from — it has a
 * website, an address on the Contact page, its own team and its own catalogue.
 * A warehouse is a place things are *kept*, and the two are not the same
 * cardinality: a company can run three shops out of one central store, or one
 * shop with a stockroom out the back and an overflow unit across town. Modelling
 * the store as a branch would put it on the website; modelling the branch as a
 * warehouse would lose everything else a branch is.
 *
 * They are related, and loosely on purpose. `branchId` says *this store belongs
 * to the Surat shop* where that is true, which is what lets an order placed on
 * the Surat site default to the right shelf. NULL means it serves the whole
 * company, which is the ordinary case and the one a business with one unit
 * should never have to think about.
 *
 * ### The default
 *
 * Exactly one warehouse per company is `isDefault`, held by the controller
 * rather than by a constraint — the first one created becomes it, and promoting
 * another demotes the incumbent in the same transaction. It matters because
 * confirming an order has to reserve stock *somewhere*, and asking a shop with
 * one unit to pick it every time is asking a question with one answer.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyWarehouse',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** The branch this store serves; NULL is company-wide. See the note above. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      name: { type: DataTypes.STRING(150), allowNull: false },
      /**
       * The tenant's own short reference — `MAIN`, `WH-2`, `SURAT`.
       *
       * Unique within the company and upper-cased on the way in, because it is
       * what goes on a printed pick list and what somebody says out loud. Two
       * warehouses called `main` in different cases is a conversation nobody
       * wants to have.
       */
      code: { type: DataTypes.STRING(30), allowNull: false },

      addressLine: { type: DataTypes.STRING(300), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: true },
      stateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      pincode: { type: DataTypes.STRING(20), allowNull: true },

      /** Who to ring about a delivery to this address. */
      contactName: { type: DataTypes.STRING(120), allowNull: true },
      contactPhone: { type: DataTypes.STRING(30), allowNull: true },

      /** Where an order goes when nobody said. Exactly one per company. */
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      notes: { type: DataTypes.STRING(500), allowNull: true },

      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      /**
       * Switched off means *stop sending things here* — it is left out of the
       * pickers and cannot be chosen for a new order. It keeps its stock and its
       * ledger: a unit being closed still has things in it, and the count has to
       * stay right until they have been moved out.
       */
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_warehouses',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['code'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
