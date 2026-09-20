'use strict';

const { DataTypes } = require('sequelize');
const { MARKETING_ENQUIRY_KIND, MARKETING_ENQUIRY_KIND_VALUES,
        MARKETING_ENQUIRY_STATUS, MARKETING_ENQUIRY_STATUS_VALUES } = require('../constants');

/**
 * Somebody asking us to build them a website.
 *
 * This is a *sales* enquiry about the platform, and it is deliberately not a
 * `Lead`: a lead belongs to a tenant and is somebody who wants to buy from
 * them. This row has no company, because the person filling it in does not have
 * one with us yet — that is the whole point of the form.
 *
 * **Nothing here is trusted.** The form is open to the internet with no token,
 * so every field is whatever a stranger typed. The validator caps lengths and
 * checks shapes, but `businessName` is not a business that exists and `email`
 * is not an address anybody has confirmed. Treat a row as a message, not a
 * record.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'MarketingEnquiry',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      /** Which form it came from. Only changes how we read it, not what we store. */
      kind: {
        type: DataTypes.ENUM(...MARKETING_ENQUIRY_KIND_VALUES),
        allowNull: false,
        defaultValue: MARKETING_ENQUIRY_KIND.DEMO,
      },
      name: { type: DataTypes.STRING(150), allowNull: false },
      businessName: { type: DataTypes.STRING(200), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      email: { type: DataTypes.STRING(200), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: true },
      /**
       * The trade, as text rather than a `business_types` foreign key.
       *
       * The form lets somebody type a trade that is not on the list, and what
       * they type is the most useful thing on the row — it is the list of
       * trades nobody has built for yet. A foreign key would have to throw that
       * away or invent a master row for it.
       */
      businessType: { type: DataTypes.STRING(150), allowNull: true },
      /** The plan they were looking at, by name. Blank when undecided. */
      plan: { type: DataTypes.STRING(120), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: true },
      /** Which page the form was on, for telling the demo form from the contact one. */
      source: { type: DataTypes.STRING(120), allowNull: true },
      status: {
        type: DataTypes.ENUM(...MARKETING_ENQUIRY_STATUS_VALUES),
        allowNull: false,
        defaultValue: MARKETING_ENQUIRY_STATUS.NEW,
      },
      /** Whatever we noted after calling back. Ours, never the sender's. */
      note: { type: DataTypes.TEXT, allowNull: true },
      ipAddress: { type: DataTypes.STRING(64), allowNull: true },
      userAgent: { type: DataTypes.STRING(400), allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'marketing_enquiries',
      /* Column names, not attribute names: `underscored` is on for every model. */
      indexes: [{ fields: ['status'] }, { fields: ['kind'] }, { fields: ['created_at'] }],
    }
  );
