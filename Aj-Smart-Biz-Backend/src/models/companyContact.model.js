'use strict';

const { DataTypes } = require('sequelize');
const { CONTACT_FORM_TARGET, CONTACT_FORM_TARGET_VALUES } = require('../constants');

/**
 * How the Contact page presents itself, for one company or one of its branches.
 *
 * Deliberately **not** gated behind a plan functionality, unlike About, Team and
 * Gallery. A contact page is not an optional extra — a website you cannot be
 * reached through is not a website — so every tenant gets one, and this row
 * only decides how it reads. The addresses, phone numbers and opening hours on
 * it still come from the company profile and its branches.
 *
 * Branch-aware on the same rule as everything else: `branch_id = NULL` is the
 * company-wide copy, and a branch with none of its own inherits it.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyContact',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this copy is for; NULL means the whole company. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /** Small line above the heading, e.g. "Contact". */
      /**
       * What this page is called in the website's menu. Null uses the
       * template's default — see `NAV_PAGES`. Branch-scoped like the rest of
       * the row, so a branch site can name it differently.
       */
      navLabel: { type: DataTypes.STRING(40), allowNull: true },
      eyebrow: { type: DataTypes.STRING(80), allowNull: true },
      /** `{company}` is filled in by the website. */
      title: { type: DataTypes.STRING(160), allowNull: true },
      lead: { type: DataTypes.STRING(400), allowNull: true },

      /**
       * The enquiry form.
       *
       * It has no server behind it and is not meant to: the visitor fills it in
       * and the button hands the composed message to WhatsApp or their mail
       * app. That keeps the platform out of the business of storing other
       * people's enquiries, and means a message never sits unread in a table
       * nobody has built a screen for.
       */
      showForm: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      formTarget: {
        type: DataTypes.ENUM(...CONTACT_FORM_TARGET_VALUES),
        allowNull: false,
        defaultValue: CONTACT_FORM_TARGET.EMAIL,
      },
      /** Small print under the form, e.g. a response-time promise. */
      formNote: { type: DataTypes.STRING(300), allowNull: true },

      /** Whether the branch list and its map links appear on the page. */
      showLocations: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_contact',
      indexes: [{ fields: ['company_id'] }, { fields: ['branch_id'] }],
    }
  );
