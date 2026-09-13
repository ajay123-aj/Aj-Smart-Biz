'use strict';

const { DataTypes } = require('sequelize');
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_PAYMENT_STATUS,
  ORDER_PAYMENT_STATUS_VALUES,
  ORDER_MODE_VALUES,
} = require('../constants');

/**
 * One order, as the thing that actually happened.
 *
 * ### Why this table exists now, and did not before
 *
 * The cart shipped without one, deliberately: an order was composed into a
 * WhatsApp message or a payment link and nothing was kept, on the same bargain
 * the service enquiry form makes — the shop already has a phone, and a queue
 * nobody has open is a queue nobody packs. That bargain holds right up until
 * somebody asks *how many did we sell last month*, and then it does not hold at
 * all: a chat thread cannot be counted, filtered, or reconciled against stock.
 *
 * So an order is now **always recorded**, and the mode decides only what happens
 * *next* — the message, the payment, or both. The record is the record; the
 * message is the notification. That is the same conclusion `SERVICE_ENQUIRY_TARGET`
 * reached with `both` as its default, for the same reason: it is the only
 * arrangement that loses nothing.
 *
 * ### Everything is copied, nothing is joined
 *
 * `customerName`, the product names, the prices — all written onto the order and
 * its items rather than resolved through a join when somebody opens it. An order
 * is a historical fact. The product it was placed against will be renamed,
 * re-priced and eventually deleted, and an order screen that showed today's price
 * against last March's sale would be quietly wrong in the one place a business
 * cannot afford it. `productId` is kept anyway, nullable, because "what else did
 * this product sell" is a real question — but nothing on the screen depends on it
 * resolving.
 *
 * ### The totals, and the one thing they cannot include
 *
 * `subtotal` is the sum of the lines that **had a number**. A catalogue may price
 * in words (`From ₹4,999`, `On request`), and those lines are real parts of a
 * real order that cannot be added up. `unpricedItems` counts them, so every
 * screen and every report can say "₹18,400 plus 2 items to be quoted" instead of
 * printing a total that quietly under-counts. Nothing anywhere is allowed to
 * treat a missing price as zero.
 *
 * **Prices are never taken from the request body.** The public endpoint reads
 * them off the tenant's own products at the moment the order is placed. A body
 * that could name its own price is a shop that can be bought from at a price the
 * customer chose.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyOrder',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * The branch whose site the order was placed on; NULL on a company-wide
       * host. Stamped from the host, never from the body, so an order raised on
       * the Surat site belongs to Surat.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * `ORD-00001`, unique within the tenant and never reused.
       *
       * What the customer reads back down the phone, so it is short and
       * sequential per company rather than a global id — a shop's third order
       * should be 3, and one tenant must not be able to infer another's volume
       * from its own numbers.
       */
      orderNo: { type: DataTypes.STRING(30), allowNull: false },

      /** Where the order is in the queue. See `ORDER_TRANSITIONS`. */
      status: {
        type: DataTypes.ENUM(...ORDER_STATUS_VALUES),
        allowNull: false,
        defaultValue: ORDER_STATUS.PENDING,
      },
      /**
       * Whether the money has arrived, tracked apart from the status above
       * because the two genuinely move independently — cash on delivery
       * dispatches unpaid, UPI up front pays before anything is packed.
       */
      paymentStatus: {
        type: DataTypes.ENUM(...ORDER_PAYMENT_STATUS_VALUES),
        allowNull: false,
        defaultValue: ORDER_PAYMENT_STATUS.UNPAID,
      },
      /** The UPI reference or receipt number, typed in by whoever checked. */
      paymentReference: { type: DataTypes.STRING(120), allowNull: true },

      /**
       * How the order was taken — the `orders` mode **at the time**, snapshotted
       * the way a subscription snapshots its plan. A shop that switches from
       * WhatsApp to card payments next month must not have last month's orders
       * silently re-labelled.
       */
      mode: { type: DataTypes.ENUM(...ORDER_MODE_VALUES), allowNull: true },

      /* ------------------------------ customer ------------------------------ */

      /**
       * The account that placed it, where one was signed in.
       *
       * **Nullable, and it always will be.** A tenant without customer accounts
       * takes every order from a stranger; a tenant with them still takes orders
       * from people who did not sign in, and refusing those would be turning
       * away money to tidy a foreign key. `SET NULL` on delete, because removing
       * an account must not remove the sale.
       *
       * The fields below are copied regardless, even when this is set. They are
       * what the order *was*, and a customer who later changes their name or
       * moves house has not changed what was delivered where.
       */
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * Whatever the cart asked for, and only that. The tenant decides which of
       * these the form collects, so any of them may be empty — including the
       * name, on a shop that asks for nothing and takes one-press orders.
       */
      customerName: { type: DataTypes.STRING(120), allowNull: true },
      customerPhone: { type: DataTypes.STRING(30), allowNull: true },
      customerAddress: { type: DataTypes.STRING(500), allowNull: true },
      /** Whatever they typed in the notes box. Theirs, not the shop's. */
      customerNote: { type: DataTypes.STRING(1000), allowNull: true },

      /* ------------------------------- money -------------------------------- */

      /** How many things, counting quantities. Denormalised: every list shows it. */
      itemCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      /**
       * How many lines carried no price at all. See the note above — this is
       * what stops `subtotal` from being read as the whole order.
       */
      unpricedItems: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },

      /** The sum of the lines that had a number. */
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      /**
       * Delivery, a discount the shop gave on the phone, a rounding — one signed
       * figure rather than a column each, because the platform cannot know which
       * of those a given business uses and a form with four boxes on it is a form
       * where three are always empty. `adjustmentNote` says what it was.
       */
      adjustment: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      adjustmentNote: { type: DataTypes.STRING(120), allowNull: true },
      /** `subtotal + adjustment`, recomputed by the API and never by a client. */
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      /** The tenant's own currency at the time, so an old order still reads right. */
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },

      /* ----------------------------- fulfilment ----------------------------- */

      /**
       * Which warehouse is filling it. NULL until somebody says — and NULL
       * forever on a tenant without the warehouse feature, which is most of them.
       * Confirming an order picks the default warehouse when none was chosen.
       */
      warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * Whether this order currently holds a reservation against stock.
       *
       * A flag rather than something derived, and it is what makes the stock
       * arithmetic safe to run twice. Confirming reserves and sets it; dispatching
       * and cancelling release it and clear it. Without it, a double-clicked
       * Confirm reserves the same box twice and the shelf is wrong until somebody
       * counts it.
       */
      stockReserved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /** Whether the stock has actually left. Same guard, for the same reason. */
      stockIssued: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      /* ------------------------------ provenance ---------------------------- */

      /** Whether the visitor was handed a composed WhatsApp message to send. */
      sentToWhatsapp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /** The page the order was placed from, for whoever wonders. */
      sourceUrl: { type: DataTypes.STRING(500), allowNull: true },
      submittedIp: { type: DataTypes.STRING(64), allowNull: true },

      /** The shop's own notes about the order. Never shown to the customer. */
      internalNote: { type: DataTypes.STRING(1000), allowNull: true },
      /** Why it was cancelled, asked for at the moment somebody cancels it. */
      cancelReason: { type: DataTypes.STRING(300), allowNull: true },

      /**
       * When each step happened. Stamped rather than inferred from an audit log,
       * because "how long do we take to dispatch" is the question a shop asks of
       * this table first and it should not need a join to answer.
       */
      confirmedAt: { type: DataTypes.DATE, allowNull: true },
      packedAt: { type: DataTypes.DATE, allowNull: true },
      dispatchedAt: { type: DataTypes.DATE, allowNull: true },
      deliveredAt: { type: DataTypes.DATE, allowNull: true },
      cancelledAt: { type: DataTypes.DATE, allowNull: true },

      /**
       * **No `status` column in the platform's usual sense.** Every other table
       * here carries an active/inactive switch; an order is *cancelled*, and
       * `status` above is already that field. A second one would give a console
       * two ways to make an order go away and two different meanings for a list
       * that looks complete. Soft delete (`deletedAt`) is still there, for the
       * order somebody entered against the wrong shop.
       */
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_orders',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['warehouse_id'] },
        { fields: ['order_no'] },
        { fields: ['status'] },
        { fields: ['payment_status'] },
        /* Every list and every report is "this company, newest first" or "this
           company, between these dates", so the pair is worth an index. */
        { fields: ['company_id', 'created_at'] },
      ],
    }
  );
