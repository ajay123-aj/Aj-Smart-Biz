'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');
const password = require('../utils/password');

module.exports = (sequelize) => {
  const Admin = sequelize.define(
    'Admin',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** NULL = access to every branch of the company. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: false, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      avatar: { type: DataTypes.STRING(255), allowNull: true },
      /** The main admin auto-created with the company: cannot be deleted. */
      isCompanyAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'admins',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['role_id'] },
        { fields: ['email'] },
        { fields: ['status'] },
      ],
      defaultScope: { attributes: { exclude: ['password'] } },
      scopes: { withPassword: { attributes: {} } },
      hooks: {
        beforeSave: async (instance) => {
          if (instance.changed('password')) {
            instance.password = await password.hash(instance.password);
          }
          if (instance.changed('email') && instance.email) {
            instance.email = instance.email.toLowerCase().trim();
          }
        },
      },
    }
  );

  Admin.prototype.verifyPassword = function verifyPassword(plain) {
    return password.compare(plain, this.password);
  };

  return Admin;
};
