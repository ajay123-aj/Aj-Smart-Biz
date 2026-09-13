'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * Somebody who buys from one tenant, and can sign in to say so.
 *
 * ### The phone number is the identity
 *
 * Not the email, and not a username. A shop of this kind already has a mobile
 * number for every customer, already prints it on every order, and already rings
 * it when a delivery goes wrong — so it is the one identifier that is certain to
 * be real. The email is kept because a receipt has to go somewhere, and it is
 * optional for exactly the customers who do not have one.
 *
 * **Unique per company, not per platform.** The same person buying from two
 * shops here is two customers, and that is right rather than a duplication: they
 * are two businesses, and one of them has no business knowing what the other
 * sold. It also means a tenant's customer list is theirs — leaving the platform
 * takes it with them.
 *
 * ### There is no password column
 *
 * Sign-in is a one-time code to the mobile, which is why this row carries an
 * `otpHash` and an expiry rather than a credential. A password is a thing to
 * forget, to reset over email, to store safely and to be blamed for when it
 * leaks — and the whole value of the account is remembering an address and an
 * order history. See `CUSTOMER_OTP_DEV_CODE` for what happens until an SMS
 * gateway is wired in.
 *
 * ### Orders outlive accounts
 *
 * `company_orders.customer_id` is nullable and `SET NULL`. An order taken before
 * the tenant bought customer accounts has no customer and never will; an account
 * deleted later must not take the sale with it. The customer's name and phone
 * are copied onto every order anyway, for the reason everything else on an order
 * is copied: it is a historical fact.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'Customer',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

      name: { type: DataTypes.STRING(120), allowNull: false },
      /**
       * Digits only, normalised on the way in so `+91 98250 11223` and
       * `09825011223` are the same customer rather than three.
       */
      phone: { type: DataTypes.STRING(20), allowNull: false },
      /** Optional, and lower-cased. A receipt has to go somewhere; not everyone has one. */
      email: { type: DataTypes.STRING(160), allowNull: true },

      /**
       * The live one-time code, hashed.
       *
       * Hashed rather than stored, even though it is six digits and expires in
       * ten minutes: a plain code in a column is a code that appears in a
       * database backup, a log line and a screen-share, and the cost of not doing
       * it is one `bcrypt` call on a route nobody hits in a loop.
       */
      otpHash: { type: DataTypes.STRING(255), allowNull: true },
      otpExpiresAt: { type: DataTypes.DATE, allowNull: true },
      /**
       * Wrong guesses against the live code. Cleared when a new one is sent and
       * when one is used. Five is generous for somebody typing six digits and
       * far too few to guess a million of them.
       */
      otpAttempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },

      /**
       * Whether the number has ever been proved. A registration that was never
       * completed leaves a row with this false — which is a customer the shop can
       * see and chase, rather than a gap.
       */
      phoneVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      lastLoginAt: { type: DataTypes.DATE, allowNull: true },

      /** The shop's own notes about them. Never shown to the customer. */
      notes: { type: DataTypes.STRING(1000), allowNull: true },

      /**
       * Switched off means they cannot sign in and cannot order. Their orders
       * stay exactly where they are: barring somebody is not the same as
       * pretending they never bought anything.
       */
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'customers',
      /**
       * The (company, phone) uniqueness is held by the **controller**, not by an
       * index here.
       *
       * Two reasons, and the second is the one that decides it. The first is the
       * SQLite ALTER hazard `company_stock` documents at length. The second is
       * that this table is paranoid: a customer deleted today would keep
       * occupying their own phone number forever, and the same person coming
       * back next year could not register. `findByPhone` searches including
       * soft-deleted rows and restores rather than inserting, which is the
       * behaviour a unique index would have made impossible.
       */
      indexes: [
        { fields: ['company_id'] },
        { fields: ['phone'] },
        { fields: ['email'] },
        { fields: ['status'] },
      ],
    }
  );
