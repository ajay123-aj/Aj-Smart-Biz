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
      /**
       * The *preset* this company started from — a row in the shared `themes`
       * catalogue the platform maintains. Set by the platform, not the tenant.
       *
       * It is no longer the last word on what the website looks like. See
       * `themeConfig` below and `services/theme.service`.
       */
      themeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /**
       * The company's **own** website colours, and the reason a tenant editing
       * its theme no longer repaints every other tenant on the same preset.
       *
       * `themes` is a shared catalogue: a dozen companies can point at one row,
       * so editing that row changes all of them. This column is per-company by
       * construction — whatever is in it wins over the preset, key by key, and
       * anything absent falls through to the preset and then to the template's
       * own defaults.
       *
       * JSON rather than four columns because the shape is the website's, not
       * the database's: what a template consumes has already changed once and
       * will change again, and a new token should not cost a migration on the
       * widest table in the schema. The keys are validated on the way in —
       * `themeSave` in `validators/company.validator` — so this is not a
       * free-for-all, it is a small closed set that is cheap to extend.
       */
      themeConfig: { type: DataTypes.JSON, allowNull: true },
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
