'use strict';

const { DataTypes } = require('sequelize');

/**
 * The extra roles an admin holds besides `admins.role_id`.
 *
 * `admins.role_id` stays the **primary** role — the one shown first and the one
 * every existing query, report and token still reads — and this table adds any
 * others. An admin's access is the union of all of them: a menu action is
 * allowed when any held role allows it (see `services/adminRole.service.js`).
 *
 * A link table, not history: rows are replaced wholesale when the admin's role
 * list is saved, so it is not paranoid.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'AdminRole',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      adminId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'admin_roles',
      paranoid: false,
      indexes: [{ fields: ['admin_id'] }, { fields: ['role_id'] }, { fields: ['company_id'] }],
    }
  );
