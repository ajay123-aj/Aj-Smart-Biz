'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * One person on the website's Team section.
 *
 * Deliberately not linked to `admins`: the people a business puts on its
 * website and the people who can sign in to the workspace are different lists.
 * A founder who never logs in belongs here; a bookkeeper with a login usually
 * does not.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyTeamMember',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * Same rule the sliders follow: a branch-pinned domain shows the branch's
       * own people, and falls back to the company-wide ones when it has
       * none — so a new branch site is never blank and an existing one is never
       * silently replaced.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      /** Job title as it should read on the card, e.g. "Founder". */
      role: { type: DataTypes.STRING(120), allowNull: true },
      /** A line or two; the card clamps it rather than letting it run. */
      bio: { type: DataTypes.STRING(600), allowNull: true },
      /** Relative upload path, e.g. `/uploads/team/asha.jpg`. */
      photo: { type: DataTypes.STRING(255), allowNull: true },
      /**
       * Published contact details. Optional, and separate from the person's
       * own login: putting someone on the website must not expose their
       * account's email unless the company chooses to.
       */
      email: { type: DataTypes.STRING(160), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      linkedinUrl: { type: DataTypes.STRING(255), allowNull: true },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_team_members',
      indexes: [{ fields: ['company_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }, { fields: ['sequence'] }],
    }
  );
