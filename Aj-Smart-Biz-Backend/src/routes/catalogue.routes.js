'use strict';

/**
 * The catalogue: a tenant's categories and the products in them.
 *
 * Two routers rather than one, mounted separately by the caller, for the reason
 * `functionality.routes` gives: a middleware attached to a pathless `use` on a
 * combined router would run on every request to the parent.
 *
 * Both follow the same order rule the other card routers do — the literal paths
 * (`/reorder`) come before `/:id`, or Express reads "reorder" as an id.
 */
const express = require('express');
const controller = require('../controllers/catalogue.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/catalogue.validator');
const master = require('../validators/master.validator');

const categories = express.Router({ mergeParams: true });

/**
 * @openapi
 * /admin/company/categories:
 *   get:
 *     tags: [Admin]
 *     summary: The company's product categories
 *     description: |
 *       Every category, flat by default and nested when `tree=true` — which is
 *       what the management screen and the parent picker render.
 *
 *       Unpaginated, unlike the products beside it: a category list is a menu
 *       somebody reads, and one long enough to page through is one nobody uses.
 *
 *       Each row carries `productCount`, the number of products filed directly
 *       in it. The screen shows it on the row and warns with it before a delete,
 *       because deleting a category unfiles its products rather than removing
 *       them.
 *
 *       `branchId` narrows to one branch's own categories, or to the
 *       company-wide ones with `none`. `parentId=none` asks for the main
 *       categories alone.
 *   post:
 *     tags: [Admin]
 *     summary: Add a category
 *     description: |
 *       `parentId` is what makes this a subcategory; omitting it makes a main
 *       category. The parent has to belong to the same company, and the tree may
 *       not be pushed past three levels — both are refused with a message
 *       naming what went wrong.
 *
 *       The slug is generated from the name and made unique within the tenant.
 *       Send one to choose it yourself; it is still normalised, so
 *       `Dining Tables!!` is stored as `dining-tables`.
 *
 *       Requires the plan to *grant* `products` — not for the feature to be
 *       switched on. A company must be able to build its catalogue before it
 *       publishes it.
 */
categories.get('/', validate(schema.categoryListQuery), controller.categories.list);
categories.patch('/reorder', validate(schema.reorder), controller.categories.reorder);
categories.post('/', validate(schema.categoryCreate), controller.categories.create);
/**
 * @openapi
 * /admin/company/categories/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Edit a category, or move it in the tree
 *     description: |
 *       Sending `parentId` re-parents the category and everything under it.
 *       Three things are refused: a parent from another company, a parent that
 *       is the category itself or one of its own subcategories (a cycle), and a
 *       move that would push the deepest leaf below it past three levels.
 *
 *       The slug is **not** rewritten when the name changes. Renaming a category
 *       would otherwise break every link anyone has shared to it, silently. Send
 *       `slug` explicitly to change it.
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a category
 *     description: |
 *       Deletes the category and nothing else. Its subcategories are promoted to
 *       where it was, and its products fall back to being uncategorised — the
 *       response says how many of each were touched.
 *
 *       Done in one transaction, and by hand rather than by the database: these
 *       tables are paranoid, so the delete is an UPDATE and `ON DELETE SET NULL`
 *       never fires.
 */
categories.put('/:id', validate(schema.categoryUpdate), controller.categories.update);
categories.patch('/:id/status', validate(master.statusBody), controller.categories.toggleStatus);
categories.delete('/:id', validate(master.idParam), controller.categories.remove);

const products = express.Router({ mergeParams: true });

/**
 * @openapi
 * /admin/company/products:
 *   get:
 *     tags: [Admin]
 *     summary: The company's products, paged
 *     description: |
 *       The one paginated list in the website-content half of the API. A team
 *       has ten people and a gallery thirty pictures; a catalogue is however
 *       many things the business sells, so this one pages and searches.
 *
 *       Filters: `categoryId` (or `none` for the unfiled), `branchId`,
 *       `stockStatus`, `featured`, `status`, and `onOffer` — which is what the
 *       Offers tab on the screen is. `onOffer=true` matches a product with an
 *       offer price below its normal price **or** one the tenant has ticked by
 *       hand, which is the same rule the website applies.
 *   post:
 *     tags: [Admin]
 *     summary: Add a product
 *     description: |
 *       `images` is an ordered list of upload paths from `POST /uploads/product`,
 *       and the first is the card image everywhere in the catalogue — so the
 *       order is the tenant's, not a set.
 *
 *       Pricing is three fields read in order: `price` is the normal one,
 *       `offerPrice` is today's when it is lower, and `priceLabel` overrides the
 *       display entirely for a business that cannot publish a single number. An
 *       `offerPrice` at or above `price` is refused — that is not an offer, and
 *       accepting it would produce a card advertising a 0% saving.
 */
products.get('/', validate(schema.productListQuery), controller.products.list);
products.patch('/reorder', validate(schema.reorder), controller.products.reorder);
products.post('/', validate(schema.productCreate), controller.products.create);
products.get('/:id', validate(master.idParam), controller.products.get);
products.put('/:id', validate(schema.productUpdate), controller.products.update);
products.patch('/:id/status', validate(master.statusBody), controller.products.toggleStatus);
products.delete('/:id', validate(master.idParam), controller.products.remove);

module.exports = { categories, products };
