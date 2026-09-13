'use strict';

const { DataTypes } = require('sequelize');
const { STOCK_REORDER_DEFAULT } = require('../constants');

/**
 * How many of one product are in one warehouse, right now.
 *
 * ### Why a level as well as a ledger
 *
 * `company_stock_movements` is the truth: every receipt, issue and correction,
 * in order, never edited. This table is the *running total* of it — and keeping
 * both is a deliberate redundancy rather than a lapse.
 *
 * Summing the ledger would be correct and would get slower every week, on the
 * one query the platform runs most: *is this in stock*, asked once per product
 * per page load by a public website. So the level is written in the same
 * transaction as the movement that changes it, always, and `balanceAfter` on
 * each movement records what this said at the time — which means a disagreement
 * between the two is not only detectable but locatable to the movement where it
 * started.
 *
 * ### On hand, reserved, and what is actually available
 *
 * `quantity` is what is on the shelf. `reserved` is the part of it already
 * promised to confirmed orders that have not gone out yet. **Available is
 * `quantity - reserved`**, and it is what the website asks about — because a box
 * that is physically present and already sold to somebody else is not one a
 * stranger can buy.
 *
 * Reserving does not move stock, which is why it is a column here and not a
 * movement: nothing has left the building, and a ledger that recorded intentions
 * alongside facts would stop being a record of what happened. Dispatch is what
 * writes the movement, and it decrements both at once.
 *
 * A missing row means zero, and means nobody has ever counted this product into
 * this warehouse. Rows are created on first movement rather than provisioned for
 * every (warehouse × product) pair, which for a three-hundred-product catalogue
 * across four units would be twelve hundred rows of nothing.
 */
/**
 * The (warehouse, product) uniqueness, but only where the dialect can keep it.
 *
 * The same trap `company_functionalities` documents, met again and for the same
 * reason: SQLite has no real ALTER, so sequelize emulates one by copying the
 * table — and it does not carry a composite unique across that copy faithfully.
 * It re-emits it as a unique on `warehouse_id` **alone**, which then rejects the
 * second product ever counted into a warehouse and makes the database unbootable
 * on the next sync.
 *
 * Declaring it only on MySQL keeps the constraint where it works and keeps the
 * SQLite dev path alive. `findOrCreate` in `levelFor` is what actually holds the
 * invariant on both, and it is the only route by which a level is ever created.
 */
const uniquePair = (sequelize) =>
  sequelize.getDialect() === 'sqlite'
    ? []
    : [{ unique: true, fields: ['warehouse_id', 'product_id'] }];

module.exports = (sequelize) =>
  sequelize.define(
    'CompanyStock',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

      /** What is physically there, reservations included. */
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      /** The part of it already promised to confirmed orders. Never exceeds it. */
      reserved: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      /**
       * Below this, the product is reported as low and appears on the warehouse
       * screen's own list. Per warehouse rather than per product, because the
       * level you want in the shop and the level you want in the overflow unit
       * are different numbers about the same thing.
       *
       * Zero means do not warn me, which is the honest default: the platform has
       * no idea how fast anything sells until it has watched for a while.
       */
      reorderLevel: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: STOCK_REORDER_DEFAULT,
      },

      /** Aisle, bay, shelf — whatever the tenant writes on the label. */
      binLocation: { type: DataTypes.STRING(60), allowNull: true },

      /**
       * When a movement last touched this pair. Denormalised from the ledger so
       * the stock screen can sort by *what moved recently* without a join to a
       * table that grows forever.
       */
      lastMovementAt: { type: DataTypes.DATE, allowNull: true },

      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_stock',
      /**
       * One level per (warehouse, product), and never a second.
       *
       * Not paranoid, for the reason `company_functionalities` is not: a
       * soft-deleted row would keep occupying the unique slot while being
       * invisible to every query, so a product counted back into a warehouse it
       * had once been emptied out of would fail on a duplicate nobody can see.
       * There is nothing to delete anyway — a product that has left is a level of
       * zero, which is a fact worth keeping and not an absence.
       */
      paranoid: false,
      indexes: [
        ...uniquePair(sequelize),
        { fields: ['company_id'] },
        { fields: ['warehouse_id'] },
        { fields: ['product_id'] },
      ],
    }
  );
