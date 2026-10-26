'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, TEMPLATE_DESIGN, TEMPLATE_DESIGN_VALUES } = require('../constants');

/**
 * One entry in the marketing site's **template showcase**: a real demo
 * company, shown in the design that serves it, so a visitor can see what a
 * site for a business like theirs looks like before they ask for one.
 *
 * Deliberately thin. Everything a card shows (the business type, the colours,
 * the hero headline, the services and the sections that are switched on) is
 * read live from the company it points at, so the showcase cannot drift from
 * the demo it advertises. What lives here is only what the company cannot say
 * about itself: which design serves it, where the live demo is, and, when the
 * demo company's own name or description is not how it should be introduced,
 * a title and summary for this page.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'MarketingTemplate',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Which tenant site template serves the demo: `default`, `midnight` or
       * `atelier`. Not derivable from the company. The template is a
       * deployment, and the same company could be served by any of them.
       */
      design: {
        type: DataTypes.ENUM(...TEMPLATE_DESIGN_VALUES),
        allowNull: false,
        defaultValue: TEMPLATE_DESIGN.DEFAULT,
      },
      /** Shown instead of the company's name. Optional. */
      title: { type: DataTypes.STRING(150), allowNull: true },
      /** Shown instead of the company's description. Optional. */
      summary: { type: DataTypes.STRING(400), allowNull: true },
      /**
       * Where the live demo is. Optional: without it the API offers the
       * company's own primary domain, when that is a public one.
       */
      demoUrl: { type: DataTypes.STRING(255), allowNull: true },
      /** Featured entries lead the list and are the ones the home page shows. */
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'marketing_templates',
      indexes: [{ fields: ['company_id'] }, { fields: ['status'] }, { fields: ['sequence'] }],
    }
  );
