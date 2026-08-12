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
