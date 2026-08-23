'use strict';

const { DataTypes } = require('sequelize');

/**
 * The About page's prose, for one company or one of its branches.
 *
 * This used to ride on `company_functionalities.settings`, which was fine while
 * there was exactly one About per tenant. Making it branch-aware means there
 * can be several, so it needs rows of its own — a JSON blob keyed by branch
 * would be a table with extra steps. Existing settings are copied into a
 * company-wide row on boot; see `ensureAboutRows` in the bootstrap seeder.
 *
 * `branch_id = NULL` is the company-wide copy: it shows on every site the
 * tenant serves unless that branch has written its own. The same fallback the
 * sliders, and now the stats, team and gallery, all follow.
 *
 * No unique index on (company_id, branch_id): the table is paranoid like the
 * rest of the schema, and a soft-deleted row would hold the slot invisibly.
 * The write path is a `findOrCreate` on that pair, which is what actually keeps
 * it to one row per scope.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyAbout',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this copy is for; NULL means the whole company. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** Small line above the heading, e.g. "Our story". */
      /**
       * What this page is called in the website's menu. Null uses the
       * template's default — see `NAV_PAGES`. Branch-scoped like the rest of
       * the row, so a branch site can name it differently.
       */
      navLabel: { type: DataTypes.STRING(40), allowNull: true },
      eyebrow: { type: DataTypes.STRING(80), allowNull: true },
      /** `{company}` is filled in by the website, so the default carries the name. */
      title: { type: DataTypes.STRING(160), allowNull: true },
      /** One sentence, set larger than the body. */
      lead: { type: DataTypes.STRING(400), allowNull: true },
      /** Blank lines separate paragraphs; the website splits on them. */
      body: { type: DataTypes.TEXT, allowNull: true },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_about',
      indexes: [{ fields: ['company_id'] }, { fields: ['branch_id'] }],
    }
  );
