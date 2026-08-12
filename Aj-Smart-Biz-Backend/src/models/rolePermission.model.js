'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'RolePermission',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      menuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      canView: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      canCreate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      canEdit: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      canDelete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      canExport: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'role_permissions',
      indexes: [{ fields: ['role_id'] }, { fields: ['menu_id'] }, { fields: ['company_id'] }],
    }
  );
