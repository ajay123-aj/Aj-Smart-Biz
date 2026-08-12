'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, BILLING_CYCLE } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'Plan',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(60), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discountPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
      billingCycle: {
        type: DataTypes.ENUM(...Object.values(BILLING_CYCLE)),
        allowNull: false,
        defaultValue: BILLING_CYCLE.MONTHLY,
      },
      /** Overrides the cycle default when a bespoke duration is needed. */
      durationDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      trialDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      maxBranches: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      maxAdmins: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      maxUsers: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 5 },
      storageMb: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1024 },
      /** e.g. ["GST billing","WhatsApp alerts"] */
      features: { type: DataTypes.JSON, allowNull: true },
      isPopular: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'plans',
      indexes: [{ fields: ['name'] }, { fields: ['status'] }, { fields: ['sequence'] }],
    }
  );
