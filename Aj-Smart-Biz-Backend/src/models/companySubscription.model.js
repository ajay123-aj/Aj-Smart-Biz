'use strict';

const { DataTypes } = require('sequelize');
const {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  SUBSCRIPTION_CHANGE_TYPE,
  SUBSCRIPTION_CHANGE_TYPE_VALUES,
} = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'CompanySubscription',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Plan terms are snapshotted so later plan edits never rewrite history. */
      planSnapshot: { type: DataTypes.JSON, allowNull: true },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      taxAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
      /** Credit carried over from the term this one replaced, on an upgrade or downgrade. */
      creditApplied: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      isTrial: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      autoRenew: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /** Days the tenant keeps working after `endDate` before access is cut. */
      graceDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      /** How this term began: new, renewal, upgrade, downgrade, reactivation... */
      changeType: {
        type: DataTypes.ENUM(...SUBSCRIPTION_CHANGE_TYPE_VALUES),
        allowNull: false,
        defaultValue: SUBSCRIPTION_CHANGE_TYPE.NEW,
      },
      /** The term this one replaced, so a company's plan history forms a chain. */
      previousSubscriptionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      status: {
        type: DataTypes.ENUM(...SUBSCRIPTION_STATUS_VALUES),
        allowNull: false,
        defaultValue: SUBSCRIPTION_STATUS.ACTIVE,
      },
      activatedAt: { type: DataTypes.DATE, allowNull: true },
      suspendedAt: { type: DataTypes.DATE, allowNull: true },
      cancelledAt: { type: DataTypes.DATE, allowNull: true },
      endedAt: { type: DataTypes.DATE, allowNull: true },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_subscriptions',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['plan_id'] },
        { fields: ['status'] },
        { fields: ['end_date'] },
        { fields: ['start_date'] },
      ],
    }
  );
