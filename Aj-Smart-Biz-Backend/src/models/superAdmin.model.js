'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, SUPER_ADMIN_ROLE } = require('../constants');
const password = require('../utils/password');

module.exports = (sequelize) => {
  const SuperAdmin = sequelize.define(
    'SuperAdmin',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: false, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      avatar: { type: DataTypes.STRING(255), allowNull: true },
      role: {
        type: DataTypes.ENUM(...Object.values(SUPER_ADMIN_ROLE)),
        allowNull: false,
        defaultValue: SUPER_ADMIN_ROLE.STAFF,
      },
      /** The boot-seeded root account: cannot be deleted or deactivated. */
      isRoot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'super_admins',
      indexes: [{ fields: ['email'] }, { fields: ['status'] }],
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

  SuperAdmin.prototype.verifyPassword = function verifyPassword(plain) {
    return password.compare(plain, this.password);
  };

  return SuperAdmin;
};
