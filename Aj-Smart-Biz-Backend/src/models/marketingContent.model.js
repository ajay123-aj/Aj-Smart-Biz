'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * One block of writing on our own marketing site, addressed by `key`.
 *
 * **Why one table and not a column per heading.** The Technology site is prose:
 * a hero, four steps, six promises, a closing band, an intro on each page. Each
 * of those is a different shape, and a table per shape would be a dozen tables
 * that are only ever read together and only ever written by us. So the shape
 * lives in `payload` and the row is addressed by a key the site knows.
 *
 * The cost is real and worth stating: nothing here validates that `payload`
 * still matches what the page expects. A key that loses a field the site reads
 * renders an empty heading rather than failing, which is why the site treats
 * every field as optional and keeps its own fallback. The validator refuses an
 * unknown key so a typo cannot create a row nothing reads, but it cannot police
 * what is inside a payload it has never seen.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'MarketingContent',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      /** The section this is, e.g. `hero`. Unique: one row per section. */
      key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      /** What the section is, for whoever edits it. Never rendered. */
      label: { type: DataTypes.STRING(150), allowNull: true },
      /** The section's own shape. See the note above. */
      payload: { type: DataTypes.JSON, allowNull: false },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'marketing_contents',
      indexes: [{ fields: ['key'], unique: true }, { fields: ['status'] }],
    }
  );
