'use strict';

const { DataTypes } = require('sequelize');
const {
  LEAD_STAGE,
  LEAD_STAGE_VALUES,
  ORDER_PAYMENT_STATUS,
  ORDER_PAYMENT_STATUS_VALUES,
  BOOKING_STATUS_VALUES,
} = require('../constants');

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
      /**
       * What the service card said it cost, **copied at the moment of asking**.
       *
       * The same rule every line of an order follows, and for the same reason: a
       * price list is edited and an enquiry is a thing that happened. Somebody
       * ringing back about a quote from March needs to be told what they were
       * shown in March, not what the website says today.
       *
       * Free text, because that is what `company_services.price_label` is — "From
       * ₹4,999", "₹1,200 per hour", "On request". It is what the customer read,
       * not what the job came to; see `amount` for that.
       */
      servicePriceLabel: { type: DataTypes.STRING(60), allowNull: true },

      /**
       * What the job is actually worth, as a number.
       *
       * **Typed by the shop, never by the customer**, and nullable for as long as
       * nobody has said — which is most of an enquiry's life. A service is priced
       * in words precisely because it cannot be priced in advance; this is the
       * figure that exists once somebody has looked at the job and quoted it.
       *
       * It is the only number on this table, and everything the service revenue
       * report says is built from it. Without it, "what are our services earning"
       * is a question the platform can only answer with a shrug, because
       * `price_label` is prose and cannot be added up.
       */
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INR' },

      /**
       * Whether that money has arrived. The same three words an order uses, on
       * purpose: a shop should not have to learn two vocabularies for "paid"
       * depending on whether it sold a thing or did a job.
       *
       * Tracked apart from `stage` for the reason an order's payment is tracked
       * apart from its status — they move independently. Work is delivered and
       * invoiced later; deposits are taken before anybody starts.
       */
      paymentStatus: {
        type: DataTypes.ENUM(...ORDER_PAYMENT_STATUS_VALUES),
        allowNull: false,
        defaultValue: ORDER_PAYMENT_STATUS.UNPAID,
      },
      paymentReference: { type: DataTypes.STRING(120), allowNull: true },
      paidAt: { type: DataTypes.DATE, allowNull: true },

      /**
       * The account that asked, where one was signed in.
       *
       * Nullable and always will be: an enquiry from a stranger is the ordinary
       * case, and a shop without customer accounts has nothing else. What it buys
       * is the service history on a customer's own page — and, in the console,
       * the ability to see everything one person has ever asked about.
       */
      customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      stage: {
        type: DataTypes.ENUM(...LEAD_STAGE_VALUES),
        allowNull: false,
        defaultValue: LEAD_STAGE.NEW,
      },
      /* ---------------------------- the appointment ---------------------------- *
       *
       * Present only on rows that asked for a **time**, which is a different act
       * from asking a question: an enquiry says "ring me about this", a booking
       * says "I will be there on Thursday at ten". Most of this table is the
       * first kind, and every column here is null on those rows.
       *
       * They live on this table rather than in one of their own because a
       * booking *is* an enquiry - the same person, the same service, the same
       * queue somebody works through - and splitting them would give a company
       * two inboxes to check and two places to lose somebody.
       */

      /** The day asked for. A date, not a timestamp: a slot is local to the shop. */
      bookingDate: { type: DataTypes.DATEONLY, allowNull: true },
      /** The slot, as `HH:mm` in the company's own working day. */
      bookingTime: { type: DataTypes.STRING(5), allowNull: true },
      /**
       * How long the service was said to take **at the time of booking**, copied
       * rather than joined.
       *
       * The same rule the title and the price label follow. A salon that changes
       * a treatment from 30 minutes to 45 must not silently rewrite what
       * yesterday's diary said, because somebody has arranged their afternoon
       * around the old answer.
       */
      bookingMinutes: { type: DataTypes.INTEGER, allowNull: true },

      /**
       * Where the appointment has got to, as the customer reads it.
       *
       * Deliberately not `stage`: that is a sales pipeline a company works
       * through in private, and "qualified" is not something to show somebody
       * waiting to hear whether they have a slot on Thursday. Null means this row
       * is not a booking at all.
       */
      bookingStatus: { type: DataTypes.ENUM(...BOOKING_STATUS_VALUES), allowNull: true },

      /**
       * What the company said back - and the only field on this table a customer
       * reads that the company wrote.
       *
       * It is the difference between "declined" and "declined, we are closed that
       * Thursday, any chance of the Friday?". Optional, and shown on the
       * customer's own page beside the status.
       */
      bookingResponse: { type: DataTypes.STRING(300), allowNull: true },

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
        { fields: ['customer_id'] },
        { fields: ['payment_status'] },
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['service_id'] },
        { fields: ['stage'] },
        { fields: ['booking_status'] },
        /* The diary's own query: what is taken on a given day. */
        { fields: ['booking_date'] },
        { fields: ['created_at'] },
      ],
    }
  );
