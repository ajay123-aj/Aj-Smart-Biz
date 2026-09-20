'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

module.exports = (sequelize) =>
  sequelize.define(
    'BusinessType',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      slug: { type: DataTypes.STRING(150), allowNull: true },
      icon: { type: DataTypes.STRING(120), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      /**
       * Whether this trade is offered on our own marketing site's demo form.
       *
       * Same reasoning as `Plan.isPublic`, and the same default. This table
       * holds both the coarse types a company is classified by ("Retail",
       * "Services") and the richer ones the marketing site advertises ("Retail
       * shop", with an icon and a line of copy). Showing all of them put near
       * duplicates next to each other on the form.
       */
      isPublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'business_types',
      indexes: [{ fields: ['name'] }, { fields: ['status'] }],
    }
  );
