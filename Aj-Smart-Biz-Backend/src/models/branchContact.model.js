'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'BranchContact',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      designation: { type: DataTypes.STRING(120), allowNull: true },
      department: { type: DataTypes.STRING(120), allowNull: true },
      email: { type: DataTypes.STRING(160), allowNull: true, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(20), allowNull: false },
      alternatePhone: { type: DataTypes.STRING(20), allowNull: true },
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'branch_contacts',
      indexes: [{ fields: ['branch_id'] }, { fields: ['company_id'] }],
    }
  );
