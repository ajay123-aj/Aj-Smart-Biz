'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, FEATURE_ICON_FALLBACK } = require('../constants');

/**
 * One card in the website's Features / Benefits band — a capability the
 * business offers, and what it is worth to the person reading.
 *
 * The band used to be the template's own copy, the same six cards on every site
 * the platform served. This table is what makes it the tenant's: the words are
 * theirs, the order is theirs, and the icon is theirs to pick. What stays the
 * platform's is the *drawing* — see `FEATURE_ICONS` — so a company choosing its
 * own glyphs still gets a set that looks like one set.
 *
 * The section's heading and lede are not here. They are one short block per
 * company rather than a list, so they ride on the functionality's own
 * `settings` blob the way `share_link`'s configuration does.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyFeature',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * Same rule the sliders follow: a branch-pinned domain shows the branch's
       * own cards, and falls back to the company-wide ones when it has none —
       * so a new branch site is never blank and an existing one is never
       * silently replaced.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * A key from `FEATURE_ICONS`, e.g. `shield`.
       *
       * A plain string rather than an ENUM on purpose. The library is expected
       * to grow — that is the point of having one — and an ENUM would turn
       * every new glyph into a schema migration on every tenant's database. The
       * validator is what refuses an unknown name on the way in, and every
       * renderer falls back to `spark` on the way out, so a row can never
       * produce a blank card even if one got past both.
       */
      icon: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: FEATURE_ICON_FALLBACK,
      },
      /** The benefit itself, as the card's heading — "Delivered when we said". */
      title: { type: DataTypes.STRING(150), allowNull: false },
      /** A sentence or two under it. Optional: a good heading can stand alone. */
      body: { type: DataTypes.STRING(600), allowNull: true },

      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_features',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
