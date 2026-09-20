'use strict';

const { Joi, id, idParam, listQuery, status } = require('./common');
const {
  FEATURE_ICON_KEYS,
  PRODUCT_IMAGES_MAX,
  PRODUCT_HIGHLIGHTS_MAX,
  PRODUCT_HIGHLIGHT_LENGTH,
  PRODUCT_SPECS_MAX,
  PRODUCT_SPEC_LABEL_LENGTH,
  PRODUCT_SPEC_VALUE_LENGTH,
  PRODUCT_STOCK_VALUES,
  PRODUCT_PRICE_MAX,
  SLUG_MAX,
} = require('../constants');

/**
 * What a tenant may send about its catalogue.
 *
 * The two lists differ from every other card list on the platform in one way
 * that shapes this whole file: they carry **numbers people will act on**. A
 * benefit card that is nonsense is embarrassing; a price that is nonsense is a
 * customer arriving with the wrong money. So the price fields are checked
 * against each other here rather than only for shape, and the offer maths is
 * refused at the door instead of producing a negative discount later.
 */

/** `null` is a real value — it means company-wide. */
const branchId = Joi.alternatives().try(id, Joi.valid(null));

/**
 * The slug, when a tenant insists on writing it themselves.
 *
 * Optional everywhere: left out, the controller generates one from the name and
 * makes it unique. Sent, it is still put through the same generator, so a person
 * typing `Dining Tables!!` into the field gets `dining-tables` rather than a URL
 * with punctuation in it. Which is why this only has to be loose enough to
 * accept what people type.
 */
const slug = Joi.string().trim().allow('', null).max(SLUG_MAX);

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/**
 * What one category may carry.
 *
 * `parentId` is what makes this a tree, and `null` is meaningful rather than
 * absent: it is how a subcategory is promoted back to being a main category.
 * The depth cap and the cycle check cannot live here — both need to read the
 * rest of the tenant's tree — so they are enforced in the controller.
 *
 * `icon` is constrained to the platform's closed library for the reason the
 * benefit cards give: the website draws these itself and falls back to `spark`
 * for a name it does not know, so an unchecked field would let a tenant save
 * something that silently renders as the wrong picture.
 */
const categoryFields = {
  branchId,
  parentId: Joi.alternatives().try(id, Joi.valid(null)),
  name: Joi.string().trim().min(1).max(150),
  slug,
  description: Joi.string().trim().allow('', null).max(600),
  /** An upload path from `POST /uploads/category`. Optional — the icon covers it. */
  image: Joi.string().trim().allow('', null).max(255),
  icon: Joi.string().valid(...FEATURE_ICON_KEYS),
  featured: Joi.boolean(),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const categoryCreate = {
  body: Joi.object({
    ...categoryFields,
    name: categoryFields.name.required(),
  }),
};

const categoryUpdate = { params: idParam, body: Joi.object(categoryFields).min(1) };

/**
 * The console's category list. `parentId=none` asks for the main categories
 * alone, which is what the tree's top level is; `tree=true` asks for the whole
 * thing nested, which is what the picker and the management screen render.
 */
const categoryListQuery = {
  query: listQuery({
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    parentId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    tree: Joi.boolean(),
  }),
};

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

/**
 * A money value. `precision(2)` rather than a raw number: a price arriving as
 * `1299.999` would be silently rounded by the column, and rounding somebody's
 * price without telling them is not something a validator should do quietly.
 */
const money = Joi.number().min(0).max(PRODUCT_PRICE_MAX).precision(2).allow(null);

/**
 * What one product may carry.
 *
 * Three of these need saying out loud:
 *
 *  - **`images` is ordered and the order is the tenant's.** The first is the
 *    card image everywhere in the catalogue, so this is not a set — it is a
 *    list, and `.unique()` only stops the same file being added twice.
 *  - **`specs` is pairs, not free JSON.** A `{label, value}` array is what the
 *    detail page prints as a table; anything else would have to be guarded at
 *    every `.map` in the template.
 *  - **`offerPrice` is checked against `price`.** An offer price at or above the
 *    normal one is not an offer, and letting it through produces a card
 *    advertising a 0% saving with a struck-through number identical to the one
 *    beside it. Refused here, where the tenant can still see what they typed.
 */
const productFields = {
  branchId,
  categoryId: Joi.alternatives().try(id, Joi.valid(null)),
  name: Joi.string().trim().min(1).max(200),
  slug,
  sku: Joi.string().trim().allow('', null).max(60),
  summary: Joi.string().trim().allow('', null).max(600),
  description: Joi.string().trim().allow('', null).max(20000),

  images: Joi.array()
    .items(Joi.string().trim().max(255))
    .max(PRODUCT_IMAGES_MAX)
    .unique()
    .allow(null)
    .custom((value) => (value ?? []).map((path) => path.trim()).filter(Boolean)),

  highlights: Joi.array()
    .items(Joi.string().trim().max(PRODUCT_HIGHLIGHT_LENGTH).allow(''))
    .max(PRODUCT_HIGHLIGHTS_MAX)
    .allow(null)
    .custom((value) => (value ?? []).map((line) => line.trim()).filter(Boolean)),

  specs: Joi.array()
    .items(
      Joi.object({
        label: Joi.string().trim().max(PRODUCT_SPEC_LABEL_LENGTH).allow(''),
        value: Joi.string().trim().max(PRODUCT_SPEC_VALUE_LENGTH).allow(''),
      })
    )
    .max(PRODUCT_SPECS_MAX)
    .allow(null)
    // A row with no label is a blank line in a table; a row with no value is a
    // question nobody answered. Both are dropped rather than refused, so a
    // person filling in ten boxes and using six is not shown an error.
    .custom((value) =>
      (value ?? [])
        .map((row) => ({ label: (row.label ?? '').trim(), value: (row.value ?? '').trim() }))
        .filter((row) => row.label && row.value)
    ),

  price: money,
  offerPrice: money,
  priceLabel: Joi.string().trim().allow('', null).max(60),
  onOffer: Joi.boolean(),
  offerLabel: Joi.string().trim().allow('', null).max(60),

  stockStatus: Joi.string().valid(...PRODUCT_STOCK_VALUES),
  /**
   * Whether this product's stock is actually counted.
   *
   * **The switch the whole warehouse feature hangs off.** `trackedLines` in the
   * stock service only looks at products where this is true, so a product with
   * it off is never reserved on confirm and never issued on dispatch — an order
   * for it moves through every status leaving the shelf untouched.
   *
   * It was missing from this list, and the effect was worse than a missing
   * field usually is: Joi strips an unknown key, so a body containing only this
   * one arrived empty and was refused with "value must have at least 1 key".
   * The column could not be turned on through the API at all, so every product
   * sat at its `false` default for ever and warehouses counted stock that no
   * order could ever spend.
   *
   * Means nothing unless the `warehouse` functionality is live — see
   * `availabilityOf` in the stock service, the one place that reads this and
   * the levels together.
   */
  trackInventory: Joi.boolean(),
  ctaLabel: Joi.string().trim().allow('', null).max(40),
  featured: Joi.boolean(),
  /** Whether it can go in a basket at all. See the column for what it is for. */
  orderable: Joi.boolean(),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

/**
 * The cross-field rule both verbs share: an offer price has to actually be an
 * offer.
 *
 * Only applied when both numbers are in the same body. On an update that sends
 * one of the pair the controller compares against what is stored, because Joi
 * cannot see a row it was never given — see `assertOfferIsAnOffer` there.
 */
const offerBelowPrice = (schema) =>
  schema.custom((value, helpers) => {
    const { price, offerPrice } = value;
    if (price === undefined || price === null) return value;
    if (offerPrice === undefined || offerPrice === null) return value;
    if (Number(offerPrice) < Number(price)) return value;
    return helpers.message('offerPrice must be lower than price — an offer at or above the normal price is not an offer');
  });

const productCreate = {
  body: offerBelowPrice(
    Joi.object({
      ...productFields,
      name: productFields.name.required(),
    })
  ),
};

const productUpdate = {
  params: idParam,
  body: offerBelowPrice(Joi.object(productFields).min(1)),
};

/**
 * The console's product list.
 *
 * This one pages, unlike every other card list on the platform, and the reason
 * is the feature: a company's team has ten people and its gallery thirty
 * pictures, but its catalogue is however many things it sells. `categoryId`
 * filters to one category — `none` to the unfiled ones — and `onOffer` is what
 * the "Offers" tab on the screen is.
 */
const productListQuery = {
  query: listQuery({
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    categoryId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    onOffer: Joi.boolean(),
    featured: Joi.boolean(),
    stockStatus: Joi.string().valid(...PRODUCT_STOCK_VALUES),
  }),
};

/** The whole order in one call, so a drag cannot be left half-applied. */
const reorder = {
  body: Joi.object({
    ids: Joi.array().items(id.required()).min(1).max(500).required(),
  }),
};

module.exports = {
  categoryCreate,
  categoryUpdate,
  categoryListQuery,
  productCreate,
  productUpdate,
  productListQuery,
  reorder,
};
