'use strict';

const express = require('express');
const controller = require('../controllers/warehouse.controller');
const schema = require('../validators/warehouse.validator');
const master = require('../validators/master.validator');
const validate = require('../middlewares/validate');

/**
 * Two routers, mounted separately, because they are two screens and two jobs.
 *
 * `warehouses` is set-up — where the units are, who to ring, which one is the
 * default. It changes rarely and it is the kind of thing a manager does once.
 *
 * `stock` is the daily work: booking a delivery in, writing off a breakage,
 * moving a pallet, looking at what is about to run out. Different people, opened
 * at different frequencies, so they get different routers and the permission
 * matrix can tell them apart if a tenant ever wants it to.
 */

/* ------------------------------------------------------------------ *
 * Warehouses
 * ------------------------------------------------------------------ */

const warehouses = express.Router({ mergeParams: true });

/**
 * @openapi
 * /admin/company/warehouses:
 *   get:
 *     tags: [Admin]
 *     summary: List warehouses
 *     description: |
 *       Every unit, default first, each carrying what is currently in it —
 *       `onHand`, `reserved` and the `available` difference between them.
 *
 *       The quantities come from one grouped query for the whole page rather
 *       than a count per row: this is the screen somebody uses to decide which
 *       unit to open, and a list of names with no numbers on it does not help
 *       them decide.
 *     responses:
 *       200:
 *         description: A page of warehouses, each with its stock totals.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   post:
 *     tags: [Admin]
 *     summary: Add a warehouse
 *     description: |
 *       `code` is the tenant's own short reference — `MAIN`, `WH-2` — unique
 *       within the company and upper-cased on the way in, because it goes on a
 *       printed pick list and gets said out loud.
 *
 *       **The first warehouse a company creates becomes its default** whether it
 *       asked or not: confirming an order has to reserve stock somewhere, and a
 *       company with one unit should never be asked a question with one answer.
 *       Sending `isDefault: true` promotes this one and demotes the incumbent in
 *       the same transaction. There is no way to send `false` — a company with
 *       warehouses always has exactly one default, and demotion happens by
 *       promoting something else.
 *     responses:
 *       201:
 *         description: Created.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: The code is already in use, or the branch is not this tenant's.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
warehouses.get('/', validate(schema.warehouseListQuery), controller.listWarehouses);
warehouses.post('/', validate(schema.warehouseCreate), controller.createWarehouse);
warehouses.put('/:id', validate(schema.warehouseUpdate), controller.updateWarehouse);

/**
 * @openapi
 * /admin/company/warehouses/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a warehouse
 *     description: |
 *       Refused while anything is still in it, and refused while an open order is
 *       being filled from it. Both are states a person can fix in a minute, and
 *       both would otherwise become the two failures nobody notices until they go
 *       looking for a box: a stock level no screen shows, and an order nobody can
 *       fill.
 *
 *       Deleting the default promotes the next active unit, so a company is never
 *       left with warehouses and nowhere for the next order to go.
 *     responses:
 *       200:
 *         description: Deleted.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: It still holds stock, or open orders point at it.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
warehouses.delete('/:id', validate(master.idParam), controller.removeWarehouse);

/* ------------------------------------------------------------------ *
 * Stock
 * ------------------------------------------------------------------ */

const stock = express.Router({ mergeParams: true });

/**
 * @openapi
 * /admin/company/stock:
 *   get:
 *     tags: [Admin]
 *     summary: Stock levels
 *     description: |
 *       What is on the shelves, across every unit or within one. Each row carries
 *       `available` (`quantity - reserved`) alongside `isLow` and `isOut`, said by
 *       the API so the console, the reports and any future theme all agree about
 *       what "low" means.
 *
 *       `low=true` and `out=true` are resolved **here**, not in the browser: they
 *       are the two questions the screen exists to answer, and a browser filtering
 *       a page would be filtering a page — the product that ran out is on page
 *       four.
 *
 *       Both compare `available` rather than `quantity`. A box that is physically
 *       present and already promised to a confirmed order is not one anybody else
 *       can have. A `reorderLevel` of zero means *do not warn me*, so a product
 *       with no level set is never low however few of it there are.
 *     responses:
 *       200:
 *         description: A page of stock levels.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
stock.get('/', validate(schema.stockListQuery), controller.listStock);

/** Before `/movements/:id` would ever exist, and before any `/:id` route. */
stock.get('/movements', validate(schema.movementListQuery), controller.listMovements);

/**
 * @openapi
 * /admin/company/stock/movements:
 *   post:
 *     tags: [Admin]
 *     summary: Record a stock movement
 *     description: |
 *       **There is no `type` in the body.** The direction comes from the reason —
 *       a receipt goes in, damage goes out, a stock count is an adjustment — and
 *       asking for both is asking somebody to contradict themselves. A ledger
 *       holding a receipt that decremented the shelf is a ledger nobody can
 *       reconcile.
 *
 *       `quantity` therefore means two different things, which is the one
 *       genuinely confusing thing about stock control:
 *
 *       | Reason | `quantity` is |
 *       | --- | --- |
 *       | `opening`, `purchase`, `return` | how many arrived |
 *       | `damage` | how many are gone |
 *       | `correction` | **how many there are now** — the counted total, not the difference |
 *
 *       `sale` and `transfer` are refused: both are written by the platform
 *       alongside something else that has to be true at the same moment — an
 *       order that was dispatched, a unit that received what another one sent.
 *       Use the order's status route and `POST /stock/transfer`.
 *
 *       `unitCost` is the **cost**, never the selling price, and only makes sense
 *       on a receipt. It is what lets a stock valuation report the money actually
 *       tied up rather than the money the shop hopes to make.
 *     responses:
 *       201:
 *         description: Recorded. Returns the movement with the resulting balance.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Not enough stock, a reason the platform writes, or a product that is not this tenant's.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
stock.post('/movements', validate(schema.movementCreate), controller.createMovement);

/**
 * @openapi
 * /admin/company/stock/transfer:
 *   post:
 *     tags: [Admin]
 *     summary: Move stock between two warehouses
 *     description: |
 *       Two movements, paired and written in one transaction — a transfer that
 *       recorded only one half would be a company that had either lost stock or
 *       invented it. Out first, so a transfer of more than the source holds fails
 *       before anything has been added anywhere.
 *     responses:
 *       201:
 *         description: Transferred. Returns both movements.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Not enough stock, the same warehouse twice, or one that is switched off.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
stock.post('/transfer', validate(schema.transferCreate), controller.createTransfer);

/**
 * Where a product is kept and when to warn about it. **Not a movement** —
 * neither changes how many there are, and putting them in the ledger would fill
 * it with rows that moved no stock.
 */
stock.put('/settings', validate(schema.stockSettings), controller.updateStockSettings);

/**
 * @openapi
 * /admin/company/stock/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Stock analytics
 *     description: |
 *       What is on the shelves, what is about to run out, and what has been
 *       moving. `days` is 7, 30, 90 or 365.
 *
 *       **Two valuations, and both are needed.** `retailValue` is the stock at
 *       what the catalogue sells it for; `costValue` is the stock at what it was
 *       bought for, from the `unitCost` typed onto receipts. They answer different
 *       questions — what this is worth to sell, and how much money is tied up —
 *       and `costCoverage` reports what share of the stock actually has a cost
 *       behind it, so nobody reads the second as complete when half the shelf
 *       arrived before anyone started typing costs in.
 *
 *       The movement series is gap-filled the way the sales one is.
 *     responses:
 *       200:
 *         description: Totals, per-warehouse breakdown, movement series, and the low and out lists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
stock.get('/analytics', validate(schema.analyticsQuery), controller.analytics);

module.exports = { warehouses, stock };
