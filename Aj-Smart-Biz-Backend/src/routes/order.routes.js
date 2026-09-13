'use strict';

const express = require('express');
const controller = require('../controllers/order.controller');
const schema = require('../validators/order.validator');
const master = require('../validators/master.validator');
const validate = require('../middlewares/validate');

/**
 * The order book, mounted under `/my-company/orders`.
 *
 * Read and write are split by menu permission rather than by admin-only, the
 * way Service Leads and Lead Management are: packing orders is the job of the
 * staff who pack orders, and a shop should be able to give somebody the queue
 * without also giving them the company's domains and prices.
 *
 * `canEdit` covers moving an order along **and** marking it paid. They are
 * different axes but they are the same job, done by the same person at the same
 * counter, and a third permission between them would be one nobody sets.
 *
 * There is deliberately **no POST and no DELETE**. The only writer is the public
 * website; an order that could be typed in would make this list a place where
 * "somebody bought this" and "somebody typed this in" are indistinguishable, and
 * an order that could be deleted would make every sales figure provisional.
 * Cancelling is what "this is not happening" means here, and it leaves the
 * record — and the stock it gave back — visible.
 */
const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * /admin/company/orders:
 *   get:
 *     tags: [Admin]
 *     summary: List orders
 *     description: |
 *       One page of the order book, newest first, with the branch and warehouse
 *       resolved on each row.
 *
 *       Filters: `status`, `paymentStatus`, `branchId`, `warehouseId`, a `from`
 *       and `to` pair of dates, and `search` across the order number, the
 *       customer's name and their phone. `open=true` is shorthand for everything
 *       still owed to somebody — pending, confirmed, packed or dispatched — and
 *       is ignored when an explicit `status` is given, because somebody who asked
 *       for "dispatched" meant dispatched.
 *
 *       `to` is inclusive of the whole day. An order placed at two in the
 *       afternoon is inside a range ending on its own date, which is what
 *       everybody means and what a naive comparison gets wrong.
 *     responses:
 *       200:
 *         description: A page of orders.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', validate(schema.listQuery), controller.list);

/**
 * Both before `/:id`, or Express reads "summary" and "analytics" as order ids
 * and the route 404s on a word.
 */
router.get('/summary', controller.summary);

/**
 * @openapi
 * /admin/company/orders/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Sales analytics
 *     description: |
 *       What the shop has been trading, over one of the offered windows —
 *       `days` is 7, 30, 90 or 365 and anything else falls back to 30.
 *
 *       **Cancelled orders are not counted as sales.** Every revenue figure here
 *       excludes them; the `byStatus` breakdown includes them, because that one
 *       has to add up to what actually arrived.
 *
 *       **A total that cannot include everything says so.** `unpricedItems`
 *       counts the lines whose product is priced in words — `From ₹4,999`, `On
 *       request` — which are real parts of real orders that cannot be added up.
 *       Nothing here treats a missing price as zero.
 *
 *       The daily series is **gap-filled**: every day in the window is present,
 *       with zeroes where nothing happened, so a chart drawn straight from it
 *       shows the shape of the week rather than four bars in a row.
 *     responses:
 *       200:
 *         description: Totals, a daily series, the status and payment breakdowns, and the best sellers.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/analytics', validate(schema.analyticsQuery), controller.analytics);

router.get('/:id', validate(master.idParam), controller.getById);

/**
 * @openapi
 * /admin/company/orders/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Move an order along
 *     description: |
 *       Forward, or cancelled. Never backward — an order that has been dispatched
 *       has left the building, and a console that could put it back to `packed`
 *       would be one where the stock ledger and the order list tell different
 *       stories about the same box. A mistake is fixed by cancelling and
 *       re-entering.
 *
 *       **What it does to stock**, where the company has the warehouse feature
 *       live and the order has a warehouse:
 *
 *       | To | Stock |
 *       | --- | --- |
 *       | `confirmed` | Reserves the tracked lines. Refuses the whole move if the stock is not there, rather than promising part of an order. Picks the default warehouse if none was chosen. |
 *       | `dispatched` | Releases the reservation and writes the `sale` movements — this is where stock actually comes off. |
 *       | `cancelled` | Gives it back: a release before dispatch, a `return` movement after it. |
 *
 *       All of it happens in one transaction with the status change, so a
 *       reservation that cannot be met leaves the order exactly where it was.
 *     responses:
 *       200:
 *         description: Moved. Returns the order with its new `nextStatuses`.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: Not a move this order can make, or not enough stock to reserve.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch('/:id/status', validate(schema.statusUpdate), controller.updateStatus);

router.patch('/:id/payment', validate(schema.paymentUpdate), controller.updatePayment);
router.put('/:id', validate(schema.orderUpdate), controller.update);

module.exports = router;
