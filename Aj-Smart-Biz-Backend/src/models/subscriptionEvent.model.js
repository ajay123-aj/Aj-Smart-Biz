'use strict';

const { DataTypes } = require('sequelize');
const { SUBSCRIPTION_EVENT_VALUES, SUBSCRIPTION_STATUS_VALUES } = require('../constants');

/**
 * Append-only trail of every subscription transition.
 *
 * The subscription row only ever shows where a company stands today; this table
 * answers how it got there - who upgraded it, when it was suspended, what a
 * renewal was priced at - which is the part an audit actually asks for.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'SubscriptionEvent',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      subscriptionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      type: { type: DataTypes.ENUM(...SUBSCRIPTION_EVENT_VALUES), allowNull: false },
      fromStatus: { type: DataTypes.ENUM(...SUBSCRIPTION_STATUS_VALUES), allowNull: true },
      toStatus: { type: DataTypes.ENUM(...SUBSCRIPTION_STATUS_VALUES), allowNull: true },
      fromPlanId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      toPlanId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** Money that moved with the transition, if any. */
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      /** When the change takes effect - not always when it was recorded. */
      effectiveAt: { type: DataTypes.DATE, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      /** Free-form extras: term dates, proration workings, sweeper marker. */
      meta: { type: DataTypes.JSON, allowNull: true },
      /** Null when the platform itself made the change (the expiry sweeper). */
      actorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      actorName: { type: DataTypes.STRING(150), allowNull: true },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'subscription_events',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['subscription_id'] },
        { fields: ['type'] },
        { fields: ['created_at'] },
      ],
    }
  );
