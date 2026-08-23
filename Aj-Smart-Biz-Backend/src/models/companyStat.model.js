'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, STAT_MODE, STAT_MODE_VALUES, STAT_UNIT, STAT_UNIT_VALUES } = require('../constants');

/**
 * One figure in the About section's stat band — `12+ Years in business`.
 *
 * The label is the company's, not the template's, so a business that counts
 * something else entirely ("Frames delivered", "Cities served") is not stuck
 * with headings that do not describe it.
 *
 * `mode` is what makes the band worth having. A `fixed` card is whatever the
 * company typed. A `since_date` card counts from a date every time the page is
 * rendered, so "Years in business" is correct next year without anyone
 * remembering to edit it — the thing a hardcoded "12+" always gets wrong.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyStat',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * Same rule the sliders follow: a branch-pinned domain shows the branch's
       * own figures, and falls back to the company-wide ones when it has
       * none — so a new branch site is never blank and an existing one is never
       * silently replaced.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** The wording under the figure, e.g. "Years in business". */
      label: { type: DataTypes.STRING(120), allowNull: false },
      mode: {
        type: DataTypes.ENUM(...STAT_MODE_VALUES),
        allowNull: false,
        defaultValue: STAT_MODE.FIXED,
      },
      /** The figure itself, for `fixed` cards. Ignored by `since_date` ones. */
      value: { type: DataTypes.STRING(40), allowNull: true },
      /** What a `since_date` card counts from. Ignored by `fixed` ones. */
      sinceDate: { type: DataTypes.DATEONLY, allowNull: true },
      unit: {
        type: DataTypes.ENUM(...STAT_UNIT_VALUES),
        allowNull: false,
        defaultValue: STAT_UNIT.YEARS,
      },
      /** Wrapped around the computed number, e.g. `` / `+` -> "14+". */
      prefix: { type: DataTypes.STRING(8), allowNull: true },
      suffix: { type: DataTypes.STRING(8), allowNull: true },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_stats',
      indexes: [{ fields: ['company_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }, { fields: ['sequence'] }],
    }
  );
