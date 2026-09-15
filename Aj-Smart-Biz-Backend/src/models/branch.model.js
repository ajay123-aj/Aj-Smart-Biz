'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'Branch',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(180), allowNull: false },
      code: { type: DataTypes.STRING(40), allowNull: false },
      /** The head-office branch created automatically with the company. */
      isMain: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /** Relative upload paths, e.g. /uploads/branch/logo-17...png */
      logo: { type: DataTypes.STRING(255), allowNull: true },
      favicon: { type: DataTypes.STRING(255), allowNull: true },
      /**
       * This branch's **own** website colours, laid over the company's.
       *
       * Only ever consulted when a host resolved to this branch — see
       * `company_domain`, which may pin one. A company whose Surat shop has its
       * own domain can give that one site its own colours without touching the
       * others, and a branch that sets only an accent keeps the company's
       * primary and secondary.
       *
       * Same column, same shape and same rules as `companies.theme_config`; the
       * merge order is branch → company → preset and lives in one place, in
       * `services/theme.service`.
       */
      themeConfig: { type: DataTypes.JSON, allowNull: true },
      email: { type: DataTypes.STRING(160), allowNull: true, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      gstNumber: { type: DataTypes.STRING(20), allowNull: true },
      stateId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      addressLine1: { type: DataTypes.STRING(255), allowNull: true },
      addressLine2: { type: DataTypes.STRING(255), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: true },
      pincode: { type: DataTypes.STRING(12), allowNull: true },
      latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      openingTime: { type: DataTypes.TIME, allowNull: true },
      closingTime: { type: DataTypes.TIME, allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'branches',
      indexes: [{ fields: ['company_id'] }, { fields: ['code'] }, { fields: ['status'] }],
    }
  );
