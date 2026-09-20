'use strict';

/**
 * The **website** module — our own marketing site, the one at
 * `Aj-Smart-Biz-Technology`.
 *
 * Easy to confuse with `/theme` next door, so the distinction is worth keeping
 * in one place: `/theme` serves a site belonging to a *customer* of ours, and
 * which customer is decided by the host the browser asked for. Everything here
 * is the same for every caller, because there is one marketing site and it is
 * ours. Nothing in this module reads the request host, and nothing in it is
 * scoped to a company.
 *
 * Unauthenticated, like `/theme`, and for the same reason: it is read by the
 * public. The guard that matters here is the rate limit, not a token.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../../controllers/marketing.controller');
const validate = require('../../middlewares/validate');
const schema = require('../../validators/marketing.validator');
const leadSchema = require('../../validators/marketingLead.validator');
const config = require('../../config/env');

const router = express.Router();

/**
 * The shared budget for reads.
 *
 * Sized for a server rendering pages rather than for a browser: the Technology
 * site is server-side rendered, so these calls arrive from *its container*, not
 * from each visitor. That is the opposite of the `/theme` read limit next door,
 * and it is why this one is generous — a busy minute is one IP address making
 * every request for every visitor on the site.
 */
const readLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: config.isProd ? 600 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again shortly' },
});

/**
 * The budget for the enquiry form.
 *
 * Much tighter, and keyed differently in spirit: a read is a page being
 * rendered, a write is a stranger filling in a form. Nobody legitimately sends
 * ten of these in five minutes.
 *
 * **Caveat worth knowing before trusting it.** The site renders server-side, so
 * if it ever posts the form on the visitor's behalf every submission arrives
 * from one address and this limit becomes a cap on the whole site rather than
 * on one person. The form is submitted from the browser for exactly that
 * reason; if that changes, this has to become a check the site makes too.
 */
const enquiryLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many enquiries from this address. Please try again later.' },
});

/**
 * @openapi
 * /website/bootstrap:
 *   get:
 *     tags: [Website]
 *     summary: Everything the marketing site renders, in one call
 *     description: |
 *       The writing, the price list, the capability catalogue, the trades we
 *       build for and the FAQ — the whole site, in one response.
 *
 *       **Prefer this over the five endpoints below when rendering a page.**
 *       The Technology site is server-rendered, so five calls would be five
 *       sequential hops between containers before a byte reaches the browser.
 *       The individual endpoints exist for the cases where one list is genuinely
 *       all that is wanted, and because each is easier to read in these docs
 *       than a slice of this one.
 *
 *       Unauthenticated and not scoped to anything. Every caller gets the same
 *       answer.
 *     responses:
 *       200:
 *         description: The site.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         content:
 *                           type: object
 *                           description: |
 *                             The writing, keyed by section — `hero`, `steps`,
 *                             `promises`, and so on. Each value's shape belongs
 *                             to that section; see `GET /website/content`.
 *                         plans:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WebsitePlan' }
 *                         capabilities:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WebsiteCapability' }
 *                         businessTypes:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WebsiteBusinessType' }
 *                         faqs:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WebsiteFaq' }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/bootstrap', readLimit, controller.bootstrap);

/**
 * @openapi
 * /website/content:
 *   get:
 *     tags: [Website]
 *     summary: The writing on the site, keyed by section
 *     description: |
 *       Every active block of copy, as an object keyed by section rather than a
 *       list — the site reads `content.hero`, and a list would make each page
 *       find its own row first.
 *
 *       **The shape of each value belongs to its section**, and is not
 *       described here because it is not the same twice: `hero` is a headline
 *       and two buttons, `steps` is four cards, `faq_intro` is two lines. The
 *       site treats every field as optional and keeps a fallback, so a section
 *       that loses a field renders without it rather than failing.
 *
 *       Sections with `status: inactive` are omitted entirely. That is how a
 *       block is taken off the site without deleting what was written.
 *     responses:
 *       200:
 *         description: The writing, keyed by section.
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/content', readLimit, controller.content);

/**
 * @openapi
 * /website/plans:
 *   get:
 *     tags: [Website]
 *     summary: The price list
 *     description: |
 *       Active plans, in `sequence` then price order — the same `plans` rows the
 *       super admin sells, mapped to what a pricing card shows.
 *
 *       **`id` is the plan's `code`, not its primary key.** The site puts it in
 *       `/demo?plan=`, and a link that survives is one built on something a
 *       human chose rather than on a number that would change if these were
 *       reseeded. A plan with no code falls back to its id so the link is never
 *       empty.
 *
 *       `includes` holds capability keys from `GET /website/capabilities`. The
 *       site drops a key it does not recognise rather than rendering it raw, so
 *       retiring a capability removes it from every card at once.
 *     responses:
 *       200:
 *         description: The plans on sale.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/WebsitePlan' }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/plans', readLimit, controller.plans);

/**
 * @openapi
 * /website/capabilities:
 *   get:
 *     tags: [Website]
 *     summary: What a website built on the platform can be made of
 *     description: |
 *       The capability catalogue, in `sequence` order.
 *
 *       **Not a table.** These are the things the platform can actually do, so
 *       the list is a property of the code rather than of the data, and it is
 *       the same list the tenant console reads when it shows a company its
 *       switches. That is what stops a plan advertising a capability no console
 *       can switch on.
 *
 *       Adding one is a change to `FUNCTIONALITY_CATALOGUE` in the backend's
 *       `constants`, and nothing else enumerates them.
 *     responses:
 *       200:
 *         description: The catalogue.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/WebsiteCapability' }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/capabilities', readLimit, controller.capabilities);

/**
 * @openapi
 * /website/business-types:
 *   get:
 *     tags: [Website]
 *     summary: The trades we build for
 *     description: |
 *       Active `business_types`, by name. The demo form offers these, and the
 *       same rows are what a company is classified as when it signs up.
 *
 *       The form also lets somebody type a trade that is not on this list, and
 *       what they type is stored verbatim on the enquiry — see
 *       `POST /website/enquiries`. Those are the trades nobody has built for
 *       yet, which is the most useful thing on the form.
 *     responses:
 *       200:
 *         description: The trades.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/WebsiteBusinessType' }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/business-types', readLimit, controller.businessTypes);

/**
 * @openapi
 * /website/faqs:
 *   get:
 *     tags: [Website]
 *     summary: The FAQ
 *     description: |
 *       Active questions in `sequence` order. The order is deliberate and is not
 *       alphabetical: it is roughly the order these get asked on a call, which
 *       is why the question about what happens when you stop paying is near the
 *       top.
 *     responses:
 *       200:
 *         description: The questions.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/WebsiteFaq' }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get('/faqs', readLimit, controller.faqs);

/**
 * @openapi
 * /website/enquiries:
 *   post:
 *     tags: [Website]
 *     summary: Somebody asking us to build them a website
 *     description: |
 *       The demo and contact forms. **Open to the internet with no token**, so
 *       it is rate limited to 10 per address per 15 minutes in production, and
 *       every field is treated as a stranger's typing: `businessName` is not a
 *       business that exists and `email` is not an address anybody has
 *       confirmed. Treat a stored row as a message, not a record.
 *
 *       **A name, and at least one way to answer.** Both `phone` and `email` are
 *       optional but one of them is required — a shop owner who wants a phone
 *       call should not have to invent an email address, and an enquiry nobody
 *       can reply to is not an enquiry. Sending neither is a 400.
 *
 *       This is not a `Lead`. A lead belongs to a tenant and is somebody who
 *       wants to buy from *them*; this is somebody who wants to buy from us and
 *       has no company yet.
 *
 *       The response carries the new id and nothing else. Echoing the row back
 *       would hand an unauthenticated caller a way to read what it just wrote.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MarketingEnquiryCreate' }
 *     responses:
 *       201:
 *         description: Stored. We will call them back.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id: { type: integer, example: 41 }
 *       400:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/enquiries', enquiryLimit, validate(schema.enquiryCreate), controller.submitEnquiry);

/**
 * @openapi
 * /website/track:
 *   post:
 *     tags: [Website]
 *     summary: Report that somebody opened a page on the marketing site
 *     description: |
 *       Traffic reporting for our own site. The same payload the tenant
 *       templates post to `POST /theme/leads`, parsed by the same code — only
 *       the table it lands in differs, because these rows belong to nobody but
 *       us.
 *
 *       **One row per device, not per page load.** Another beacon from the same
 *       device inside the 30-minute session window bumps the open visit's page
 *       count rather than writing a new visit, so "visits" means visits.
 *
 *       Attribution is stored twice: `utm_*` on the lead is **first touch**,
 *       written once and never overwritten, so somebody who arrives from an ad
 *       and returns later by typing the address still counts for the ad. The
 *       `last*` fields are where they came from most recently.
 *
 *       Its own rate budget rather than the read one, which is sized for a
 *       server rendering pages: this arrives from each visitor's browser, so
 *       the two are counted against completely different things.
 *
 *       Send `deviceId` on `POST /website/enquiries` too, and the enquiry is
 *       tied to the traffic that produced it.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LeadTrack' }
 *     responses:
 *       201:
 *         description: Recorded.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         leadId:   { type: integer, example: 12 }
 *                         visitId:  { type: integer, example: 48 }
 *                         isNewLead: { type: boolean, example: false }
 *       400:
 *         $ref: '#/components/responses/ValidationFailed'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/track',
  /**
   * Sized for browsers, not for the rendering server.
   *
   * A visitor reading six pages spends six of this, and an office behind one
   * NAT address spends it between them — so it is generous enough that real
   * traffic never reaches it and finite enough that a script cannot fill the
   * table.
   */
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: config.isProd ? 300 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again shortly' },
  }),
  validate(leadSchema.track),
  controller.track
);

module.exports = router;
