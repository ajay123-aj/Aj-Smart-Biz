'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'Theme',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(60), allowNull: true },
      primaryColor: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#2563eb' },
      secondaryColor: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#0f172a' },
      accentColor: { type: DataTypes.STRING(20), allowNull: true },
      textColor: { type: DataTypes.STRING(20), allowNull: true },
      backgroundColor: { type: DataTypes.STRING(20), allowNull: true },
      sidebarColor: { type: DataTypes.STRING(20), allowNull: true },
      fontFamily: { type: DataTypes.STRING(120), allowNull: true },
      mode: { type: DataTypes.ENUM('light', 'dark'), allowNull: false, defaultValue: 'light' },
      previewImage: { type: DataTypes.STRING(255), allowNull: true },
      /** Free-form extra tokens so the UI can grow without a migration. */
      config: { type: DataTypes.JSON, allowNull: true },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'themes',
      indexes: [{ fields: ['name'] }, { fields: ['status'] }],
    }
  );
