'use strict';

const { DataTypes } = require('sequelize');
const {
  STOCK_MOVEMENT_TYPE_VALUES,
  STOCK_REASON_VALUES,
} = require('../constants');

/**
 * Everything that has ever moved, and why.
 *
 * **The ledger, and the only table on the platform that is genuinely
 * append-only.** There is no update route and no delete route — not because
 * nobody asked, but because a stock record whose history can be edited answers
 * no question worth asking. A mistake is corrected by a `correction` movement
 * that says a count disagreed, which leaves both the error and the fix visible.
 * That is the whole difference between a stock system and a number in a
 * spreadsheet.
 *
 * `quantity` is **always positive**; `type` carries the direction. A signed
 * column looks tidier right up until somebody has to write `SUM(CASE WHEN …)`
 * in every report, or explain why a receipt of minus four is in the table.
 *
 * `balanceAfter` is what `company_stock.quantity` read once this movement had
 * been applied, written in the same transaction. It makes a ledger readable
 * without re-summing it from the beginning, and it makes a drift between the
 * ledger and the running total locatable to the exact movement where the two
 * parted company.
 *
 * ### Reasons, and which of them a person may write
 *
 * The direction and the reason are separate questions — see
 * `STOCK_MOVEMENT_TYPE`. `sale` and `transfer` are refused from the manual
 * endpoint (`STOCK_MANUAL_REASONS`): both are written in pairs alongside
 * something else that has to be true at the same moment — an order that was
 * dispatched, a warehouse that received what another one sent — and a ledger
 * that lets them be typed in on their own ends up holding a sale against no
 * order.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyStockMovement',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

      /** `in`, `out` or `adjust`. The direction, never the reason. */
      type: { type: DataTypes.ENUM(...STOCK_MOVEMENT_TYPE_VALUES), allowNull: false },
      /** One of `STOCK_REASON`. The reason, never the direction. */
      reason: { type: DataTypes.ENUM(...STOCK_REASON_VALUES), allowNull: false },

      /** Always positive. See the note above. */
      quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** What the level read once this had been applied. */
      balanceAfter: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      /**
       * What one unit was worth on the way in, where anybody knows.
       *
       * The *cost*, not the selling price, and only ever filled in on a receipt —
       * which is why it is nullable and why nothing is inferred when it is
       * missing. It exists so a stock valuation can be the money actually tied up
       * on the shelf rather than the money the shop hopes to make; without it the
       * valuation falls back to the catalogue price and says so.
       */
      unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      /** The order this went out against, where it went out against one. */
      orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /**
       * The other half of a transfer — the warehouse this came from, or went to.
       * A transfer is two movements, and this is what pairs them.
       */
      counterWarehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /** A supplier invoice number, a delivery note, a stock-count reference. */
      reference: { type: DataTypes.STRING(120), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true },

      /**
       * Who did it. The one audit column on this table that is not a formality:
       * "who wrote off four of these" is the first question asked of a stock
       * discrepancy.
       *
       * Filled in even on the movements the **platform** writes, because a person
       * still caused them — dispatching an order is somebody pressing a button,
       * and both halves of a transfer are one person’s decision. Null is
       * therefore reserved for a movement with no signed-in actor behind it at
       * all, which nothing does today and which a reader should take as "nobody
       * knows" rather than "the system".
       */
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_stock_movements',
      /**
       * Append-only, so there is nothing to soft delete and no way to hide a
       * movement behind a `deletedAt` that reports would then have to remember to
       * filter out. A ledger with invisible rows is not a ledger.
       */
      paranoid: false,
      indexes: [
        { fields: ['company_id'] },
        { fields: ['warehouse_id'] },
        { fields: ['product_id'] },
        { fields: ['order_id'] },
        { fields: ['type'] },
        { fields: ['reason'] },
        /* Every report is "this warehouse, this window" or "this tenant, this
           window", and the ledger is the table here that grows without limit. */
        { fields: ['company_id', 'created_at'] },
      ],
    }
  );
