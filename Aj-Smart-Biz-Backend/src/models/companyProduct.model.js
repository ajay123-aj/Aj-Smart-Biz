'use strict';

const { DataTypes } = require('sequelize');
const {
  STATUS,
  STATUS_VALUES,
  SLUG_MAX,
  PRODUCT_STOCK,
  PRODUCT_STOCK_VALUES,
} = require('../constants');

/**
 * One product in a company's catalogue.
 *
 * **Not a service.** A service is work the business does, priced as free text
 * because a decimal column would be wrong for everyone who quotes per job. A
 * product is a *thing*, and a thing has a number on it — which is what lets the
 * platform do the one piece of arithmetic this whole feature turns on: what
 * percentage a visitor is saving today. `company_services.priceLabel` cannot
 * answer that, and pretending it could is how an "offers" page ends up showing
 * things that are not reduced.
 *
 * ### Price, offer price, and the label over both
 *
 * Three fields, and the order they are read in is the point:
 *
 *  - `price` is what the thing normally costs.
 *  - `offerPrice` is what it costs today, when that is less. The discount is
 *    computed from the pair rather than typed, so a card can never advertise
 *    "30% off" next to two numbers that are 12% apart.
 *  - `priceLabel` **overrides the display entirely** when it is set — `From
 *    ₹4,999`, `₹1,200/metre`, `On request`. A business that genuinely cannot
 *    publish one number keeps the catalogue; what it gives up is the maths, and
 *    that is its own choice rather than the platform's.
 *
 * `onOffer` exists for exactly that case. Usually an offer is *derived* — there
 * is an `offerPrice` below the `price` — but a tenant pricing in free text has
 * no pair to derive from and still runs offers. Either one puts a product on the
 * offers page; see `isOnOffer` in the functionality service, which is the only
 * place that decides it.
 *
 * ### Images
 *
 * `images` is an ordered JSON array of upload paths, and the first is the one
 * every card in the catalogue shows. JSON rather than a child table for the
 * reason `company_services.highlights` gives: they are never queried, never
 * ordered independently of their product, and reach nothing but the one gallery
 * that prints them. A join and a second set of CRUD routes would buy nothing.
 * The count is capped by `PRODUCT_IMAGES_MAX`.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyProduct',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this belongs to; NULL is the company-wide product. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * The category this sits in — the deepest one, not the main one. The
       * ancestry is walked from `company_categories.parentId`, so a product
       * filed under "Dining tables" is found by a visitor browsing "Furniture"
       * without anyone having to file it twice.
       *
       * Nullable, and deliberately: a company with nine products and no wish to
       * sort them should not be forced to invent a category first. Those show
       * in the catalogue under no heading, which is the honest rendering of it.
       */
      categoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      name: { type: DataTypes.STRING(200), allowNull: false },
      /** `/products/solid-oak-dining-table`. Unique per tenant; see the category model. */
      slug: { type: DataTypes.STRING(SLUG_MAX), allowNull: false },

      /** The tenant's own reference. Shown on the detail page when set. */
      sku: { type: DataTypes.STRING(60), allowNull: true },

      /** One or two lines, printed on the card. */
      summary: { type: DataTypes.STRING(600), allowNull: true },
      /** The full description, printed on the detail page. */
      description: { type: DataTypes.TEXT, allowNull: true },

      /**
       * Ordered upload paths, first one is the card image. See the note above
       * for why this is JSON rather than a table.
       */
      images: { type: DataTypes.JSON, allowNull: true },

      /** What is included or worth knowing, as a short tick list. */
      highlights: { type: DataTypes.JSON, allowNull: true },

      /**
       * `[{ label, value }]` — the comparison table on the detail page. JSON for
       * the same reason `highlights` is, and capped the same way.
       */
      specs: { type: DataTypes.JSON, allowNull: true },

      /** What it normally costs. Null on a product priced only in words. */
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      /** What it costs today, when that is less than `price`. */
      offerPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      /**
       * Overrides both when set. The escape hatch for a business that does not
       * price in single numbers — and the reason `onOffer` exists.
       */
      priceLabel: { type: DataTypes.STRING(60), allowNull: true },

      /**
       * Puts the product on the offers page without an `offerPrice` to derive it
       * from. For tenants pricing in free text, and for a genuine offer that is
       * not a reduction — "free fitting this month".
       */
      onOffer: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /**
       * What the badge says, overriding the computed `-25%`. Free text, because
       * "2 for 1" and "Free delivery" are offers a percentage cannot express.
       */
      offerLabel: { type: DataTypes.STRING(60), allowNull: true },

      /** Whether it can be had today. Never a count — see `PRODUCT_STOCK`. */
      stockStatus: {
        type: DataTypes.ENUM(...PRODUCT_STOCK_VALUES),
        allowNull: false,
        defaultValue: PRODUCT_STOCK.IN_STOCK,
      },

      /**
       * This product's own button label, overriding the section's. Null on most
       * rows, so changing the section's label still changes every card that was
       * never deliberately overridden — the rule `company_services` follows.
       */
      ctaLabel: { type: DataTypes.STRING(40), allowNull: true },

      /**
       * Whether the warehouse decides this product’s availability, rather than
       * the flag above it.
       *
       * Off by default, and that default is the whole design. `stockStatus` is a
       * flag somebody remembers to set; switching this on hands the answer to the
       * stock ledger instead, and the website then says *out of stock* the moment
       * the last one leaves the building with nobody having to remember anything.
       *
       * It is per product because a catalogue is rarely uniform: the shop counts
       * its lamps and does not count its made-to-order tables, and forcing it to
       * do both is how a stock system gets abandoned. A product switched on with
       * no stock rows anywhere reads as zero — which is correct, and is why the
       * console warns before it lets somebody switch it on for a product nobody
       * has counted yet.
       *
       * Means nothing at all unless the `warehouse` functionality is live. See
       * `availabilityOf` in the stock service, which is the one place that reads
       * this and the levels together.
       */
      trackInventory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      /** Read this one first. The home page's product band shows these. */
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      /**
       * Whether this one can go in a basket, when the tenant is taking orders
       * at all.
       *
       * Defaults to true, so switching the cart on puts a button on everything
       * rather than on nothing. It is the exception that is worth setting: the
       * made-to-measure item in an otherwise ordinary catalogue, the thing
       * priced `On request`, the display piece that is not for sale. Those are
       * products a shop genuinely wants listed and genuinely cannot let someone
       * buy unattended, and the alternative to this column is hiding them.
       *
       * Not the whole answer on its own — an out-of-stock product is never
       * orderable whatever this says, and none of it matters when the `orders`
       * functionality is not live. See `publicProduct` and `publicOrders`.
       */
      orderable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_products',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['category_id'] },
        { fields: ['slug'] },
        { fields: ['status'] },
        { fields: ['featured'] },
        { fields: ['sequence'] },
      ],
    }
  );
