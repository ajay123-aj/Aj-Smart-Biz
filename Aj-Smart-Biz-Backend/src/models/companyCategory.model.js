'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, SLUG_MAX, FEATURE_ICON_FALLBACK } = require('../constants');

/**
 * One category in a company's catalogue — and, through `parentId`, one
 * subcategory of another.
 *
 * **One table, not two.** "Main category" and "subcategory" are the same kind of
 * thing seen from different heights: both have a name, a picture and a list of
 * products under them, and a business that starts with two levels asks for a
 * third the week it takes on a second supplier. Two tables would answer that
 * with a migration; a self-reference answers it with a dropdown. Depth is capped
 * by validation rather than by schema — see `CATEGORY_DEPTH_MAX` — because the
 * limit is about what the website can render, not about what is true.
 *
 * Re-parenting is allowed and guarded: a category may not be moved under its own
 * descendant, which is the one move that would produce a cycle no page could
 * ever finish rendering. See `assertNoCycle` in the catalogue controller.
 *
 * Branch-aware like every other content table on the platform. A branch that
 * carries a different range genuinely has different categories, and the
 * company-wide set is what a branch with none of its own falls back to.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyCategory',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this belongs to; NULL is the company-wide category. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * The category above this one; NULL makes it a main category.
       *
       * No database-level foreign key: sequelize.sync() cannot order a table
       * against itself, the same reason `previousSubscriptionId` declares
       * `constraints: false`. The controller holds the invariant instead — it
       * refuses a parent from another tenant, and refuses a cycle.
       */
      parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      name: { type: DataTypes.STRING(150), allowNull: false },

      /**
       * The half of the URL a person can read — `/products?category=dining-tables`.
       *
       * Generated from the name and made unique within the tenant, so two
       * branches of one company cannot both claim `chairs`. Stored rather than
       * derived on the way out: a tenant renaming a category must not silently
       * break every link anyone has ever shared to it.
       */
      slug: { type: DataTypes.STRING(SLUG_MAX), allowNull: false },

      description: { type: DataTypes.STRING(600), allowNull: true },

      /**
       * A photograph of the category, e.g. `/uploads/category/abc.jpg`.
       * Optional — the icon below is what a category without one falls back to,
       * so the band on the home page is never a row of empty frames.
       */
      image: { type: DataTypes.STRING(255), allowNull: true },

      /**
       * A key from `FEATURE_ICONS`, the same closed library the benefit cards
       * and the services draw from. One library across the whole site, so a
       * page carrying categories and services looks drawn by one hand.
       */
      icon: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: FEATURE_ICON_FALLBACK,
      },

      /**
       * Read this one first. The home page's category band shows the featured
       * ones ahead of the rest; `sequence` still decides the order within that.
       */
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_categories',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['parent_id'] },
        { fields: ['slug'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
