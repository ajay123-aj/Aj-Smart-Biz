'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, FUNCTIONALITY_VALUES } = require('../constants');

/**
 * A company's switch for one optional functionality, plus whatever that
 * functionality needs configuring.
 *
 * A missing row means "never switched on" — the tenant enabling a feature is
 * what creates it. That keeps provisioning and backfills out of the picture
 * entirely: a company added before a feature existed is indistinguishable from
 * one that simply has not turned it on.
 *
 * The row is only half the answer. What the website actually gets is the plan's
 * grant AND this switch AND the plan still being served — see
 * `services/functionality.service.js`, which is the only place that decides.
 * A company keeps its row (and its settings) when a plan stops granting the
 * feature, so a downgrade followed by an upgrade does not lose the setup.
 */
/**
 * The (company, key) uniqueness, but only where the dialect can keep it.
 *
 * SQLite has no real ALTER, so sequelize emulates one by copying the table —
 * and it does not carry a composite unique across that copy faithfully. It has
 * been observed to drop it, and worse, to re-emit it as a unique on `key`
 * alone, which rejects the second feature any company switches on and makes the
 * database unbootable. Declaring it only on MySQL keeps the constraint where it
 * works and keeps the SQLite dev path alive; `findOrCreate` in the controller is
 * what actually holds the invariant on both.
 */
const compositeUnique = (sequelize) =>
  sequelize.getDialect() === 'sqlite' ? undefined : 'company_functionality';

module.exports = (sequelize) =>
  sequelize.define(
    'CompanyFunctionality',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      /** One switch row per (company, feature) — see `compositeUnique`. */
      companyId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: compositeUnique(sequelize),
      },
      /** One of `FUNCTIONALITY` — `whatsapp`, `share_link`, … */
      key: {
        type: DataTypes.ENUM(...FUNCTIONALITY_VALUES),
        allowNull: false,
        unique: compositeUnique(sequelize),
      },
      /**
       * Per-functionality configuration. `share_link` keeps its headline,
       * message and channels here; `whatsapp` keeps its numbers in their own
       * table because they are a list the tenant edits row by row.
       */
      settings: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_functionalities',
      /**
       * The one table in the schema that is not paranoid, deliberately.
       *
       * It holds exactly one switch row per (company, feature) — and a
       * soft-deleted row would keep occupying that slot while being invisible
       * to every query, so re-enabling a feature would fail on a duplicate key
       * nobody can see. Nothing deletes these rows anyway: switching a feature
       * off sets `status`, which is what "off" means here.
       */
      paranoid: false,
      indexes: [{ fields: ['status'] }],
    }
  );
