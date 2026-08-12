'use strict';

const { DataTypes } = require('sequelize');
const {
  PLAN_REQUEST_STATUS,
  PLAN_REQUEST_STATUS_VALUES,
  PLAN_REQUEST_TYPE,
  PLAN_REQUEST_TYPE_VALUES,
} = require('../constants');

/**
 * A tenant's request to move onto a different plan.
 *
 * The company workspace can raise one; only a super admin approving it writes an
 * actual subscription. That keeps limits and money on the platform's side of the
 * line while still giving the tenant an "upgrade" button that does something.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'PlanRequest',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      requestedPlanId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** The plan the company was on when it asked, for context after the fact. */
      currentPlanId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      type: {
        type: DataTypes.ENUM(...PLAN_REQUEST_TYPE_VALUES),
        allowNull: false,
        defaultValue: PLAN_REQUEST_TYPE.UPGRADE,
      },
      status: {
        type: DataTypes.ENUM(...PLAN_REQUEST_STATUS_VALUES),
        allowNull: false,
        defaultValue: PLAN_REQUEST_STATUS.PENDING,
      },
      /** What the tenant wrote when asking. */
      note: { type: DataTypes.TEXT, allowNull: true },
      /** What the super admin wrote when deciding. */
      decisionNote: { type: DataTypes.TEXT, allowNull: true },
      requestedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      requestedByName: { type: DataTypes.STRING(150), allowNull: true },
      decidedById: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      decidedByName: { type: DataTypes.STRING(150), allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      /** The subscription an approval produced, so the two can be traced together. */
      resultingSubscriptionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'plan_requests',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['requested_plan_id'] },
        { fields: ['status'] },
        { fields: ['created_at'] },
      ],
    }
  );
