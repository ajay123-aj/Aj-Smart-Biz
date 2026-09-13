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
       * Which part of the business this belongs to - `Hair`, `Bridal`.
       *
       * Nullable, and most tenants will leave it so: a builder with five
       * services has no use for a taxonomy. What it is for is the shop that
       * sells forty - a salon, a clinic - where an unsorted list is unreadable
       * and the categories are how a visitor finds the one thing they came for.
       */
      categoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * The address this service is reached at - `/services/bridal-makeup`.
       *
       * Generated from the title and unique within the tenant, and **not**
       * rewritten when the title changes: the same rule a product's slug and a
       * blog post's follow, and for the same reason - it is what other people
       * have linked to.
       */
      slug: { type: DataTypes.STRING(160), allowNull: false },

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
       * What it costs, as a **number** this time.
       *
       * Added beside `priceLabel` rather than instead of it, because the two
       * answer different businesses. A surveyor quotes per job and can honestly
       * only write "From \u20b94,999"; a salon charges \u20b9300 for a haircut and has
       * always known that. Forcing the second into free text means its prices
       * cannot be added up, compared, discounted, or put on a bill.
       *
       * Read in the same order a product's are, by one function the website and
       * the console both use: `priceLabel` overrides everything, then the offer
       * pair, then this. So a tenant that wants words still gets words.
       */
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      /**
       * Today's price, when it is lower. The "offered service" a shop wants read
       * first - see `onOffer`, which is the other way to be on offer.
       */
      offerPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      /**
       * On offer, said by hand.
       *
       * The only way a service priced in words can run one at all, and the only
       * way to express an offer that is not a reduction - "free consultation this
       * month". Exactly the flag `company_products.on_offer` is, read by the same
       * `isOnOffer` function, so a service and a product cannot disagree about
       * what an offer is.
       */
      onOffer: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      /**
       * The long version, for the service's own page.
       *
       * `summary` is the line on a card; this is what somebody reads once they
       * have clicked it - what the appointment involves, what to bring, how long
       * the results last. Plain text with blank lines between paragraphs, never
       * HTML, for the reason a blog post's body is: nothing a tenant pastes in can
       * become live markup on a page a stranger is reading.
       */
      description: { type: DataTypes.TEXT, allowNull: true },

      /**
       * How long it takes, in minutes.
       *
       * Shown on the card, and - when the company takes bookings - what decides
       * how much of the diary one appointment occupies. Nullable, because most
       * service businesses genuinely cannot say: a kitchen fitting is four days
       * and a leak is however long the leak takes.
       */
      durationMinutes: { type: DataTypes.INTEGER, allowNull: true },

      /**
       * Whether a visitor may pick a time for this, rather than only ask about it.
       *
       * Per service and not only per company, because one business has both: a
       * salon takes bookings for a haircut and takes *enquiries* about a wedding
       * party, and offering a 30-minute slot for the second is a promise nobody
       * meant to make. Off by default, like the company-wide switch above it.
       */
      bookable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      /**
       * How many people can hold the same slot for this service.
       *
       * **Null means "use the company's limit"**, which is the ordinary case: a
       * salon has three chairs and says so once, on the booking settings, rather
       * than on all forty treatments. See `capacityFor`.
       *
       * A number here is an override for the service whose constraint is the
       * work rather than the business - one colourist in a shop with three
       * chairs, one van, one treatment room - and it wins even when it is
       * smaller than the company's.
       */
      slotCapacity: { type: DataTypes.INTEGER, allowNull: true },

      /**
       * Whether the website actually prints that price.
       *
       * On by default, because a business that typed a price meant it to be read.
       * What this is for is the opposite case, which is common enough to deserve a
       * switch rather than an instruction to clear the field: a shop that wants
       * the figure **recorded** — so it can be quoted on the phone, put on the
       * enquiry, and counted in what services are earning — without it sitting on
       * a public page where a competitor reads it.
       *
       * Clearing `priceLabel` would hide it too, and lose it. This hides it and
       * keeps it, which is the difference between a pricing decision and a
       * publishing one.
       */
      showPrice: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

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
        { fields: ['category_id'] },
        { fields: ['slug'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
