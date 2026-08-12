'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'Company',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(180), allowNull: false },
      /** Human readable tenant code, generated from the name when not supplied. */
      code: { type: DataTypes.STRING(40), allowNull: false },
      legalName: { type: DataTypes.STRING(200), allowNull: true },
      /** Tagline shown on the tenant's login screen. */
      description: { type: DataTypes.TEXT, allowNull: true },
      // Hosts live in `company_domain` — one company can have several, and each
      // may be pinned to a branch. See CompanyDomain.
      businessTypeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      themeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      stateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      email: { type: DataTypes.STRING(160), allowNull: false, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(20), allowNull: false },
      alternatePhone: { type: DataTypes.STRING(20), allowNull: true },
      website: { type: DataTypes.STRING(180), allowNull: true },
      gstNumber: { type: DataTypes.STRING(20), allowNull: true },
      panNumber: { type: DataTypes.STRING(20), allowNull: true },
      addressLine1: { type: DataTypes.STRING(255), allowNull: true },
      addressLine2: { type: DataTypes.STRING(255), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: true },
      pincode: { type: DataTypes.STRING(12), allowNull: true },
      logo: { type: DataTypes.STRING(255), allowNull: true },
      /** Browser tab icon; ICO only, enforced on upload. */
      favicon: { type: DataTypes.STRING(255), allowNull: true },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },
      timezone: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Asia/Kolkata' },
      /** Denormalised pointer to the currently running subscription, kept in sync by the service. */
      currentSubscriptionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      subscriptionEndDate: { type: DataTypes.DATEONLY, allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'companies',
      indexes: [
        { fields: ['code'] },
        { fields: ['email'] },
        { fields: ['status'] },
        { fields: ['business_type_id'] },
      ],
    }
  );
