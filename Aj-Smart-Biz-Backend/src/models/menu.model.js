'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'Menu',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      /** NULL = system menu shared by every tenant; otherwise the owning company. */
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(120), allowNull: false },
      icon: { type: DataTypes.STRING(120), allowNull: true },
      route: { type: DataTypes.STRING(180), allowNull: true },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'menus',
      indexes: [{ fields: ['company_id'] }, { fields: ['parent_id'] }, { fields: ['slug'] }, { fields: ['sequence'] }],
    }
  );
