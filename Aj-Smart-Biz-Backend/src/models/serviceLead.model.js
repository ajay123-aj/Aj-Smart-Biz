'use strict';

const { DataTypes } = require('sequelize');
const { LEAD_STAGE, LEAD_STAGE_VALUES } = require('../constants');

/**
 * Someone who asked about a service, and what happened next.
 *
 * The platform's first **inbox**. Everything else a visitor can send either
 * goes straight out to WhatsApp or an email client (the Contact page's form) or
 * waits to be published (a testimonial); this is the first thing a stranger
 * writes that a company is expected to come back to and work through. That is
 * the whole reason it is a table and a screen rather than another composed
 * `wa.me` link.
 *
 * ## Not the same thing as a `Lead`
 *
 * `leads` is one row per **device** that has opened the website — traffic,
 * assembled from tracking, with a stage bolted on so a salesperson can work it.
 * Nobody in that table ever asked to be contacted.
 *
 * This is the opposite: a person who typed their name and number into a form
 * because they want a call about a specific service. One row per **asking**,
 * not per person — the same customer enquiring about framing in March and
 * about restoration in June is two enquiries, and collapsing them would lose
 * the second request behind the first one's stage.
 *
 * They share `LEAD_STAGE` deliberately. A company should not have to learn two
 * vocabularies for "I have rung them" depending on which screen it is looking
 * at.
 *
 * ## Only what was asked for
 *
 * A name and a number. No email, no address, no message box: the form is a
 * callback request rather than a brief, and every extra field on it is another
 * reason to abandon it. What the enquiry is *about* comes from the card it was
 * sent from, which the visitor has already read.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'ServiceLead',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * The branch whose domain the enquiry was sent from; NULL on a
       * company-wide host. Stamped from the host, never from the body, so an
       * enquiry raised on the Surat site belongs to Surat.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * The service asked about. Nullable, and deliberately not the only record
       * of what was asked — see `serviceTitle`.
       */
      serviceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /**
       * What that service was **called at the time**, copied rather than joined.
       *
       * Services are edited, renamed and deleted; an enquiry is a thing that
       * happened. Reading the title through the join would silently rewrite
       * history when a company renamed a service, and would empty the column
       * altogether when one was deleted — leaving a row that says somebody
       * wanted something, but not what.
       */
      serviceTitle: { type: DataTypes.STRING(150), allowNull: true },

      name: { type: DataTypes.STRING(150), allowNull: false },
      /**
       * Digits only, as typed, with any country code the visitor included.
       *
       * Not split into a country code and a subscriber number the way
       * `company_whatsapp_numbers` is: that column is dialled by the platform,
       * so it has to be exact, and this one is dialled by a person reading it
       * off a screen. Normalising a stranger's number into a shape it may not
       * fit loses more than it gains.
       */
      phone: { type: DataTypes.STRING(20), allowNull: false },

      /**
       * Where this enquiry has got to. The same five stages Lead Management
       * uses, so a company has one vocabulary rather than two.
       */
      stage: {
        type: DataTypes.ENUM(...LEAD_STAGE_VALUES),
        allowNull: false,
        defaultValue: LEAD_STAGE.NEW,
      },
      /** Whatever the company wants to remember about it. Theirs, not the visitor's. */
      note: { type: DataTypes.TEXT, allowNull: true },

      /**
       * Whether the visitor was also handed the message to send on WhatsApp.
       *
       * Recorded because it changes what the row means: on `both` the company
       * may well have heard from this person already, and a screen that showed
       * every enquiry as untouched would have them ringing people who messaged
       * them ten minutes ago.
       */
      sentToWhatsapp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      /** The page it was sent from, for a company wondering where these come from. */
      sourceUrl: { type: DataTypes.STRING(500), allowNull: true },
      submittedIp: { type: DataTypes.STRING(64), allowNull: true },

      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'service_leads',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['service_id'] },
        { fields: ['stage'] },
        { fields: ['created_at'] },
      ],
    }
  );
