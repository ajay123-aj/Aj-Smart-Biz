'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * One question on the marketing site's FAQ.
 *
 * Its own table rather than a `marketing_contents` payload because it is the
 * one part of the writing that is a *list of uniform things*: every entry is a
 * question and an answer, the order matters, and entries get added one at a
 * time. That is a table, and it means the super admin edits a question without
 * being shown the JSON of every other question at the same time.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'MarketingFaq',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      question: { type: DataTypes.STRING(300), allowNull: false },
      answer: { type: DataTypes.TEXT, allowNull: false },
      /** Low to high. The order on the page is the order questions get asked on calls. */
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'marketing_faqs',
      indexes: [{ fields: ['status'] }, { fields: ['sequence'] }],
    }
  );
