'use strict';

/**
 * Managing our own marketing site: the writing on it, its FAQ, and the
 * enquiries it takes.
 *
 * Mounted under `/super-admin/marketing`, so `authenticate` + `superAdminOnly`
 * are already applied by the module — see `modules/index.js`. Nothing in this
 * file re-checks a token, on purpose: the guard belongs to the module, and a
 * route that carries its own is a route that can be moved somewhere it no
 * longer holds.
 *
 * The public half of the same data lives in `modules/website/website.routes.js`.
 */
const express = require('express');
const controller = require('../controllers/marketing.controller');
const leadController = require('../controllers/marketingLead.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/marketing.validator');
const leadSchema = require('../validators/marketingLead.validator');

const router = express.Router();

/* ------------------------------ the writing ----------------------------- */

/**
 * @openapi
 * /super-admin/marketing/content:
 *   get:
 *     tags: [Super Admin]
 *     summary: Every block of writing on the marketing site
 *     description: |
 *       Includes blocks with `status: inactive`, which is the difference from
 *       the public `GET /website/content` — the console has to be able to show
 *       a section that is currently off in order to switch it back on.
 *     responses:
 *       200: { description: Every section, active or not. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/content', controller.adminContentList);

/**
 * @openapi
 * /super-admin/marketing/content/{key}:
 *   get:
 *     tags: [Super Admin]
 *     summary: One block of writing
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string, example: hero }
 *         description: One of the whitelisted section keys. Anything else is a 400.
 *     responses:
 *       200: { description: The section. }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Super Admin]
 *     summary: Save one block of writing
 *     description: |
 *       An upsert, not a create/update pair. The set of keys is a fixed
 *       whitelist in the backend's `constants`, so a section always
 *       conceptually exists; whether a row has been written for it yet is an
 *       implementation detail the console should not have to ask about first.
 *
 *       **`payload` is not validated beyond being an object.** Each section has
 *       its own shape — `hero` is a headline and two buttons, `steps` is four
 *       cards — and nothing here checks that what is saved still matches what
 *       the page reads. The site treats every field as optional and keeps its
 *       own fallback, so a section that loses a field renders without it
 *       rather than failing. The key *is* checked, because a typo there would
 *       otherwise create a row nothing ever renders.
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string, example: hero }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MarketingContentUpsert' }
 *     responses:
 *       200: { description: Saved over an existing section. }
 *       201: { description: Written for the first time. }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 */
router.get('/content/:key', validate(schema.contentKeyParam), controller.adminContentGet);
router.put('/content/:key', validate(schema.contentUpsert), controller.adminContentUpsert);

/* -------------------------------- the FAQ ------------------------------- */

/**
 * @openapi
 * /super-admin/marketing/faqs:
 *   get:
 *     tags: [Super Admin]
 *     summary: Every FAQ entry, in page order
 *     responses:
 *       200: { description: The questions, inactive ones included. }
 *   post:
 *     tags: [Super Admin]
 *     summary: Add a question
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MarketingFaqCreate' }
 *     responses:
 *       201: { description: Added. }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 */
router.get('/faqs', controller.adminFaqList);
router.post('/faqs', validate(schema.faqCreate), controller.adminFaqCreate);

/**
 * @openapi
 * /super-admin/marketing/faqs/{id}:
 *   put:
 *     tags: [Super Admin]
 *     summary: Edit a question
 *     description: |
 *       Partial: send only what changed. Every field is optional and at least
 *       one is required, so an empty body is a 400 rather than a no-op that
 *       looks like a save.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MarketingFaqUpdate' }
 *     responses:
 *       200: { description: Saved. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Super Admin]
 *     summary: Remove a question
 *     description: |
 *       A soft delete — every model on this platform is `paranoid`, so the row
 *       stays with a `deleted_at` and drops out of every read. Nothing
 *       references an FAQ entry, so nothing breaks either way.
 *
 *       To take a question off the site while keeping it visible in the
 *       console, set `status` to `inactive` instead. That is the reversible
 *       one; this is not, short of going into the database.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Removed. }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put('/faqs/:id', validate(schema.faqUpdate), controller.adminFaqUpdate);
router.delete('/faqs/:id', validate({ params: schema.idParam }), controller.adminFaqRemove);

/* ------------------------------ the enquiries ---------------------------- */

/**
 * @openapi
 * /super-admin/marketing/enquiries:
 *   get:
 *     tags: [Super Admin]
 *     summary: People who have asked us to build them a website
 *     description: |
 *       Newest first, because this is a callback list and the useful end is the
 *       one nobody has rung yet.
 *
 *       These are **not** leads. A lead belongs to a tenant and is somebody who
 *       wants to buy from them; these people want to buy from us and have no
 *       company on the platform yet — which is why there is no `companyId` to
 *       filter by.
 *
 *       Everything on a row is a stranger's typing. `businessName` is not a
 *       business that exists and `email` is not an address anybody has
 *       confirmed.
 *     parameters:
 *       - in: query
 *         name: kind
 *         schema: { type: string, enum: [demo, contact] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [new, contacted, converted, closed] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches name, business, phone, email or city.
 *     responses:
 *       200: { description: A page of enquiries. }
 */
router.get('/enquiries', validate(schema.enquiryList), controller.adminEnquiryList);

/**
 * @openapi
 * /super-admin/marketing/enquiries/{id}:
 *   get:
 *     tags: [Super Admin]
 *     summary: One enquiry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: The enquiry. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Super Admin]
 *     summary: Move an enquiry along, or note what was said
 *     description: |
 *       Status and our own note, and nothing else. What the sender typed stays
 *       as they typed it — correcting it here would turn a message into a
 *       record that reads as if they had said something they did not.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MarketingEnquiryUpdate' }
 *     responses:
 *       200: { description: Updated. }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/enquiries/:id', validate({ params: schema.idParam }), controller.adminEnquiryGet);
router.patch('/enquiries/:id', validate(schema.enquiryUpdate), controller.adminEnquiryUpdate);

/* ------------------------------ the traffic ----------------------------- */

/**
 * Lead management for our own site.
 *
 * `/summary` and `/analytics` are declared **before** `/:id`. Express matches
 * in order, so the other way round "analytics" would be read as a lead id and
 * answered with a 400 from the id validator — the same ordering hazard the
 * tenant lead routes carry a note about.
 */

/**
 * @openapi
 * /super-admin/marketing/leads:
 *   get:
 *     tags: [Super Admin]
 *     summary: Everyone who has visited our marketing site
 *     description: |
 *       One row per device, newest activity first — not one per page load. The
 *       tenant equivalent is `GET /super-admin/leads`; this is the same screen
 *       over our own traffic, with no company or branch to scope by.
 *
 *       **Crawlers are excluded unless `includeBots` is set.** They are stored
 *       — traffic that jumps overnight deserves to show why — but a lead list
 *       is a list of people.
 *
 *       `utmSource` / `utmCampaign` filter on **first touch**: the campaign
 *       that produced the lead, not the last one it clicked.
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer }
 *         description: Look back this many days. Wins over `from`/`to`.
 *       - in: query
 *         name: enquiredOnly
 *         schema: { type: boolean }
 *         description: Only leads that went on to send the demo or contact form.
 *       - in: query
 *         name: includeBots
 *         schema: { type: boolean, default: false }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches name, email, phone, device, city, country or campaign.
 *     responses:
 *       200: { description: A page of leads. }
 */
router.get('/leads', validate(leadSchema.list), leadController.list);

/**
 * @openapi
 * /super-admin/marketing/leads/summary:
 *   get:
 *     tags: [Super Admin]
 *     summary: The counters above the leads table
 *     description: |
 *       Totals under whatever filters are set, including `conversionRate` —
 *       the share of leads that went on to send an enquiry, which is the one
 *       number here that says whether the site is working rather than how busy
 *       it is.
 *     responses:
 *       200: { description: The counters. }
 */
router.get('/leads/summary', validate(leadSchema.summary), leadController.summary);

/**
 * @openapi
 * /super-admin/marketing/leads/analytics:
 *   get:
 *     tags: [Super Admin]
 *     summary: Where the traffic came from — the campaign report
 *     description: |
 *       Top-N breakdowns by `utm_source`, `utm_medium`, `utm_campaign`,
 *       `utm_term` and `utm_content`, plus referrers, landing pages, geography,
 *       browser and OS, and a 90-day trend.
 *
 *       **First touch throughout**, so a visitor who arrives from an ad and
 *       returns later by typing the address still counts for the ad. That is
 *       what a campaign report has to mean.
 *
 *       `campaignEnquiries` is the one to read next to `utm.campaign`: the
 *       first is how much traffic a campaign brought, the second is how many
 *       of those people actually wrote in. A campaign can win the first and
 *       lose the second, and that is exactly the thing worth knowing.
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *         description: How many rows each top-N list returns.
 *     responses:
 *       200: { description: The report. }
 */
router.get('/leads/analytics', validate(leadSchema.analytics), leadController.analytics);

/**
 * @openapi
 * /super-admin/marketing/leads/{id}:
 *   get:
 *     tags: [Super Admin]
 *     summary: One lead, with the enquiry it produced
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: The lead. }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Super Admin]
 *     summary: Set a lead's stage, or note what we learned
 *     description: |
 *       Stage, notes, and who they turned out to be. **Nothing the browser
 *       reported is editable** — the traffic is a record of what happened, and
 *       correcting a campaign here would quietly falsify the report that
 *       campaign is judged by.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated. }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/leads/:id', validate(leadSchema.detail), leadController.detail);
router.patch('/leads/:id', validate(leadSchema.update), leadController.update);

/**
 * @openapi
 * /super-admin/marketing/leads/{id}/visits:
 *   get:
 *     tags: [Super Admin]
 *     summary: Every visit behind one lead
 *     description: |
 *       Newest first, paged — the one list whose length is set by how
 *       interested somebody is rather than by anything we control.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: A page of visits. }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/leads/:id/visits', validate(leadSchema.visits), leadController.visits);

module.exports = router;
