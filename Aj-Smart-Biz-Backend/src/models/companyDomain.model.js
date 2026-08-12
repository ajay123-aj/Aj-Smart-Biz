'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * Hosts that resolve to a tenant. A domain always belongs to a company and may
 * additionally point at one of its branches, so `surat.acme.com` can serve the
 * Surat branch's own logo and favicon while `acme.com` serves the company's.
 *
 * `domain` is unique across every tenant - a host can only ever mean one thing.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyDomain',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this host is dedicated to; NULL means the whole company. */
      subCompanyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      domain: {
        type: DataTypes.STRING(255),
        allowNull: false,
        set(value) {
          // Hosts are case-insensitive; store them folded so lookups are exact.
          this.setDataValue('domain', value ? String(value).trim().toLowerCase() : value);
        },
      },
      /** The host the login screen defaults to for this company. */
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_domain',
      indexes: [{ fields: ['domain'] }, { fields: ['company_id'] }, { fields: ['sub_company_id'] }],
    }
  );
