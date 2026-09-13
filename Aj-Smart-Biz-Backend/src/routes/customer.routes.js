'use strict';

const express = require('express');
const controller = require('../controllers/customer.controller');
const schema = require('../validators/customer.validator');
const master = require('../validators/master.validator');
const validate = require('../middlewares/validate');

/**
 * Customer management, mounted under `/my-company/customers`.
 *
 * Read and write split by menu permission rather than by admin-only, the way
 * Orders is: looking after customers is the job of whoever answers the phone, and
 * a shop has to be able to hand somebody that list without also handing them the
 * company's domains and prices.
 *
 * **No POST.** An account is made by the person it belongs to, signing in to the
 * website with their own number — one a shop could manufacture would be a row
 * nobody consented to, attached to somebody's phone number.
 */
const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * /admin/company/customers:
 *   get:
 *     tags: [Admin]
 *     summary: List customers
 *     description: |
 *       One page of the tenant's customers, newest first, each carrying what they
 *       have actually spent — orders, total, and when they last bought something.
 *       The totals come from one grouped query for the page rather than three per
 *       row, because this is the screen somebody uses to decide who to ring.
 *
 *       **Cancelled orders are excluded from the spend**, the rule every revenue
 *       figure on the platform follows: a best-customer list that counted refunded
 *       money would rank the person who cancelled the most.
 *
 *       `search` covers the name, the email and the phone — and the phone is
 *       **normalised before searching**, so typing `+91 98250 11223` finds the
 *       customer stored as `9825011223`. Without that the one search people
 *       actually use would reliably return nothing.
 *     responses:
 *       200:
 *         description: A page of customers.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', validate(schema.listQuery), controller.list);

/** Before `/:id`, or Express reads the word as a customer id. */
router.get('/summary', controller.summary);

router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.adminUpdate), controller.update);

/**
 * @openapi
 * /admin/company/customers/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Bar a customer, or let them back
 *     description: |
 *       Switched off, they cannot sign in and cannot order. **Their orders stay
 *       exactly where they are** — barring somebody is not the same as
 *       pretending they never bought anything, and the sales figures must not
 *       move because a shop fell out with a customer.
 *
 *       An empty body flips the switch, which is what the console sends.
 *     responses:
 *       200:
 *         description: Changed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch('/:id/status', validate(schema.statusUpdate), controller.toggleStatus);
router.delete('/:id', validate(master.idParam), controller.remove);

module.exports = router;
