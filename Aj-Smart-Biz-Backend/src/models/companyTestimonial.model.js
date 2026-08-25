'use strict';

const { DataTypes } = require('sequelize');
const {
  STATUS,
  STATUS_VALUES,
  TESTIMONIAL_SOURCE,
  TESTIMONIAL_SOURCE_VALUES,
  TESTIMONIAL_MODERATION,
  TESTIMONIAL_MODERATION_VALUES,
} = require('../constants');

/**
 * One customer review on the website's Testimonials section.
 *
 * Two kinds of row share this table, told apart by `source`: reviews the
 * company typed into the console, and reviews a customer submitted through the
 * form on the public website. They are the same object once published — a
 * visitor should not be able to tell which is which — so they are one table
 * with one shape rather than two that have to be merged on every read.
 *
 * What differs is how a row is born, and that is `moderation`'s job:
 *
 *   admin    born `approved`. Asking a business to approve its own copy would
 *            be a queue with one person on both ends.
 *   visitor  born `pending`, always. `POST /public/testimonials` hard-codes it
 *            — there is no request body that can produce anything else — so an
 *            unreviewed review cannot reach a website even if the column
 *            default were changed.
 *
 * Only `approved` is ever published. A pending or rejected row is absent from
 * the public payload entirely rather than hidden by the template, which is the
 * rule every other feature in this schema follows.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyTestimonial',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * Same rule the sliders follow: a branch-pinned domain shows the branch's
       * own reviews, and falls back to the company-wide ones when it has none —
       * so a new branch site is never blank and an existing one is never
       * silently replaced.
       *
       * A visitor submission is stamped with the branch of the domain it was
       * sent from, so a review written on the Surat site belongs to Surat.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /** Who is speaking, as it should read on the card. */
      authorName: { type: DataTypes.STRING(150), allowNull: false },
      /** "Managing Director, Acme Traders" — optional, and free-form on purpose. */
      authorRole: { type: DataTypes.STRING(150), allowNull: true },
      /** Relative upload path, e.g. `/uploads/testimonial/asha.jpg`. */
      photo: { type: DataTypes.STRING(255), allowNull: true },

      /**
       * How to reach the person who wrote it. Collected from the form so a
       * company can verify a review or reply to it, and **never published** —
       * `publicTestimonial` does not carry it. Optional even in the form: a
       * customer who will not leave an email should still be able to say
       * something nice.
       */
      authorEmail: { type: DataTypes.STRING(160), allowNull: true },
      authorPhone: { type: DataTypes.STRING(20), allowNull: true },

      /** Out of five. Null is a written review with no star, which is fine. */
      rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
      /** The review itself. TEXT rather than a capped STRING — people write. */
      body: { type: DataTypes.TEXT, allowNull: false },

      source: {
        type: DataTypes.ENUM(...TESTIMONIAL_SOURCE_VALUES),
        allowNull: false,
        defaultValue: TESTIMONIAL_SOURCE.ADMIN,
      },
      moderation: {
        type: DataTypes.ENUM(...TESTIMONIAL_MODERATION_VALUES),
        allowNull: false,
        defaultValue: TESTIMONIAL_MODERATION.APPROVED,
      },
      /** When it was approved, and by whom — a queue with no trail is not a queue. */
      moderatedAt: { type: DataTypes.DATE, allowNull: true },
      moderatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * What the visitor's browser reported, kept for abuse handling only.
       *
       * Never published and never returned to the console's list — it is here so
       * a tenant being spammed has something to act on, not as an analytics
       * column. Nullable because an admin-entered row has no visitor behind it.
       */
      submittedIp: { type: DataTypes.STRING(45), allowNull: true },

      /**
       * Hand-ordered position, used by `static` mode. A `dynamic` section
       * ignores it and orders by recency instead — see `publicTestimonials`.
       */
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_testimonials',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
        /** The public read is always (company, moderation, status) — see `publicTestimonials`. */
        { fields: ['moderation'] },
        /** `dynamic` mode orders by recency, and the console lists pending newest-first. */
        { fields: ['created_at'] },
      ],
    }
  );
