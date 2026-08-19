'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * Hero slides shown on a tenant's public website.
 *
 * A slide belongs to a company and may additionally be pinned to one of its
 * branches. `branch_id = NULL` means "the whole company" — that slide shows on
 * every site the tenant serves. A branch that has slides of its own shows those
 * instead, the same fallback the logo and favicon already follow, so
 * `surat.acme.com` can run its own campaign without the head office losing its.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'Slider',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this slide is for; NULL means every branch of the company. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      title: { type: DataTypes.STRING(180), allowNull: false },
      /** Small line above the title, e.g. "Welcome". */
      eyebrow: { type: DataTypes.STRING(120), allowNull: true },
      subtitle: { type: DataTypes.TEXT, allowNull: true },
      /**
       * Wide artwork for desktop, as a relative upload path
       * (`/uploads/slider/hero-17...jpg`).
       */
      image: { type: DataTypes.STRING(255), allowNull: true },
      /**
       * Optional portrait crop for narrow screens. A wide hero photo loses its
       * subject when a phone crops it to the middle, so the company can supply a
       * second file instead. Left empty, phones simply use `image`.
       */
      mobileImage: { type: DataTypes.STRING(255), allowNull: true },
      /** Button text and target. Both must be set for the button to render. */
      ctaLabel: { type: DataTypes.STRING(80), allowNull: true },
      ctaUrl: { type: DataTypes.STRING(255), allowNull: true },
      /** Low numbers first; ties broken by id so the order is never ambiguous. */
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'sliders',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
