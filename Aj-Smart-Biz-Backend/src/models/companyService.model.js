'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, FEATURE_ICON_FALLBACK } = require('../constants');

/**
 * One service the business offers — what it is, what it includes, and roughly
 * what it costs.
 *
 * The closest table to `company_features`, and deliberately not the same one.
 * A benefit card is a *reason to choose* the business ("delivered when we
 * said"); a service is a *thing the business sells* ("kitchen fitting, from
 * ₹45,000"). Merging them would force one list to carry the other's fields —
 * a price on "people you can reach" is nonsense — and would put two different
 * arguments in one band on the website.
 *
 * What this carries that a benefit card does not:
 *
 *  - **a picture, optionally.** Services are the one section where a
 *    photograph of the actual work outsells any glyph. The icon stays as the
 *    fallback rather than the alternative, so a company that uploads nothing
 *    still gets a card that looks finished rather than a card with a hole.
 *  - **`highlights`.** What is included, as a short list. It is the question
 *    every visitor has next after the name of the service, and answering it in
 *    a paragraph buries it.
 *  - **`priceLabel`.** Free text, never a number: "From ₹4,999", "On request",
 *    "£60/hour". A decimal column would force every business into one shape of
 *    pricing and force the website to invent a currency and a period for it.
 *  - **`featured`.** One or two services a company wants read first. The
 *    website gives a featured card the wide cell; `sequence` still decides the
 *    order within that.
 *
 * The section's own heading and lede are not here. They are one short block per
 * company rather than a list, so they ride on the functionality's `settings`
 * blob — the same split Features / Benefits makes.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyService',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * The fallback every content table on the platform follows: a
       * branch-pinned domain shows the branch's own services and drops back to
       * the company-wide ones when it has none. It matters more here than
       * anywhere else — a branch that genuinely offers a different list of
       * services is the ordinary case, not the exception.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * A key from `FEATURE_ICONS`, the same closed library the benefit cards
       * draw from. One library rather than two: a site showing both sections
       * should look like it was drawn by one hand, and a second set of glyphs
       * is how that stops being true.
       *
       * A plain string rather than an ENUM, for the reason `company_features`
       * gives: the library is expected to grow, and an ENUM would make every
       * new glyph a migration on every tenant's database.
       */
      icon: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: FEATURE_ICON_FALLBACK,
      },
      /**
       * An upload path, e.g. `/uploads/service/abc.jpg`. Optional — the icon is
       * what a card without one falls back to, so this is an upgrade rather
       * than a requirement.
       */
      image: { type: DataTypes.STRING(255), allowNull: true },

      /** The service itself — "Kitchen fitting", "Annual audit". */
      title: { type: DataTypes.STRING(150), allowNull: false },
      /** A sentence or two under it. Optional: a clear name can stand alone. */
      summary: { type: DataTypes.STRING(600), allowNull: true },

      /**
       * What is included, as a short list of lines.
       *
       * JSON rather than a table of its own. They are never queried, never
       * ordered independently of their card, and never reach anything but the
       * one component that prints them — a child table would buy a join and a
       * second set of CRUD routes for no gain. The validator caps the count and
       * the length of each; see `SERVICE_HIGHLIGHTS_MAX`.
       */
      highlights: { type: DataTypes.JSON, allowNull: true },

      /**
       * Free text, never a number: "From ₹4,999", "On request", "£60/hour".
       *
       * A decimal column would have to be given a currency and a period, and
       * would then be wrong for every business that prices per job, per hour,
       * per seat or not publicly at all. The tenant writes what it would write
       * on a price list, and the website prints it.
       */
      priceLabel: { type: DataTypes.STRING(60), allowNull: true },

      /**
       * The label on this service's own button, overriding the section's.
       *
       * Null on most rows, and that is the point: a company sets one label for
       * the section and only overrides it where a service genuinely asks for
       * something else — "Book a fitting" on one card and "Get a quote" on
       * another, with "Enquire" on the rest. Falling back rather than copying
       * the section's label into every row means changing it once still
       * changes it everywhere it was not deliberately overridden.
       */
      ctaLabel: { type: DataTypes.STRING(40), allowNull: true },

      /**
       * Read this one first. The website gives a featured service the wide cell
       * and the picture more room; `sequence` still decides the order.
       */
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_services',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
