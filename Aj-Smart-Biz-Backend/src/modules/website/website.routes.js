'use strict';

/**
 * The **website** module — everything a tenant's public site consumes.
 *
 * Mounted at `/website`. Unauthenticated in full: these are the only routes on
 * the platform a stranger can reach, which is why the module exists as its own
 * surface rather than as a corner of a larger one. Anything added here is
 * public by definition, and that should take a deliberate act.
 *
 * The tenant is always resolved from the **host** the request arrived on, never
 * from the body or a query parameter a caller could aim — see
 * `controllers/website.controller`. So there is no company id anywhere in this
 * file, and no route that could be pointed at a company the caller never
 * visited.
 *
 * Rate limits are per-route rather than module-wide because the routes are not
 * alike: rendering a page is cheap and frequent, writing a review is neither.
 */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../../controllers/public.controller');
const validate = require('../../middlewares/validate');
const schema = require('../../validators/functionality.validator');
const leadSchema = require('../../validators/lead.validator');
const config = require('../../config/env');

/** The shared budget for reads. Sized for a site rendering pages. */
const readLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: config.isProd ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again shortly' },
});

/**
 * A tenant's website reporting that someone opened it.
 *
 * Its own budget rather than the read one: that is sized for a visitor
 * *rendering pages*, so five page views would spend five of it and an office
 * behind one NAT address would spend it between them — and the tenant would
 * silently stop receiving its own traffic data. Still per-IP and still finite:
 * high enough that no real visitor approaches it, low enough that a script
 * cannot write rows all afternoon.
 *
 * Exceeding it returns 429, which the tracker treats the way it treats every
 * other failure — silently. Nothing a visitor came for depends on this call.
 */
/**
 * @openapi
 * /website/leads:
 *   post:
 *     tags: [Website]
 *     summary: Report that someone opened a tenant's site
 *     description: |
 *       Traffic reporting from a tenant's own website. The tenant is resolved
 *       from the host, like everything else in this module.
 *
 *       It carries its own rate budget rather than sharing the read one, which
 *       is sized for a site *rendering pages*: five page views would spend five
 *       of that, and an office behind one NAT address would spend it between
 *       them, so the tenant would silently stop receiving its own data.
 *
 *       A 429 here is not an error worth surfacing — the tracker treats it the
 *       way it treats every other failure, silently. Nothing a visitor came for
 *       depends on this call.
 *     security: []
 *     responses:
 *       200:
 *         description: Recorded.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/leads',
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: config.isProd ? 300 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again shortly' },
  }),
  validate(leadSchema.track),
  controller.trackLead
);

/** Branding only — what a login screen needs. Both consoles use this too. */
/**
 * @openapi
 * /website/branding:
 *   get:
 *     tags: [Website]
 *     summary: Branding for a host
 *     description: |
 *       The little a login screen needs to look like the tenant's: name, logo,
 *       favicon and theme colours. Both admin consoles call this before anyone
 *       has signed in, which is why it carries no contact details, no plan and
 *       no counts.
 *
 *       An unknown or inactive host gets the **platform defaults** with
 *       `resolved: false` rather than a 404, so the endpoint cannot be walked to
 *       find out which tenants exist.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 *         example: acme.test
 *         description: |
 *           Overrides the request host, for local development where a dev server
 *           has no tenant subdomain. In production the `Host` (or
 *           `X-Forwarded-Host`) header answers this and the parameter is unused.
 *     responses:
 *       200:
 *         description: Branding, the tenant's or the platform's.
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
 *                         resolved: { type: boolean, example: true }
 *                         host: { type: string, example: acme.test }
 *                         name: { type: string, example: Acme Trading }
 *                         logo: { type: string, nullable: true }
 *                         favicon: { type: string, nullable: true }
 *                         theme: { type: object, nullable: true }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/branding', readLimit, controller.branding);

/** The full public profile — what a customer-facing website launches with. */
/**
 * @openapi
 * /website/company-details:
 *   get:
 *     tags: [Website]
 *     summary: Everything a tenant's website renders from
 *     description: |
 *       The one call a public site makes at launch. It answers with the whole of
 *       what a business publishes about itself: name, tagline, logo, theme,
 *       contact details, address, branches, hero slides, the menu, and the
 *       optional features it is entitled to today.
 *
 *       Three rules govern it:
 *
 *       * **Only what a company prints on its own letterhead.** No GST or PAN
 *         number, no plan, subscription or transaction data, no counts.
 *       * **An unknown host is indistinguishable from a real one that resolved
 *         to nothing** — both get `resolved: false` and platform defaults,
 *         never an error.
 *       * **`features` carries only what is live.** A key is `null` unless the
 *         plan granted it, the company switched it on, *and* the plan is still
 *         being served. The site renders on presence alone and never has to ask
 *         why something is missing.
 *
 *       `service.active` is false when the platform has stopped serving the
 *       tenant, which is a site's cue to show a holding page instead of content.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 *         example: acme.test
 *         description: Overrides the request host, for local development.
 *     responses:
 *       200:
 *         description: The tenant's public profile, or the platform's defaults.
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
 *                         resolved: { type: boolean }
 *                         name: { type: string, example: Acme Trading }
 *                         branch:
 *                           type: object
 *                           nullable: true
 *                           description: The branch this domain is pinned to; null on a company-wide host.
 *                         sliders:
 *                           type: array
 *                           items: { type: object }
 *                           description: Active hero slides, already ordered and resolved branch-wise.
 *                         nav:
 *                           type: array
 *                           description: The menu, named by the tenant, with withheld pages already removed.
 *                           items:
 *                             type: object
 *                             properties:
 *                               key: { type: string, example: about }
 *                               href: { type: string, example: /about }
 *                               label: { type: string, example: About us }
 *                         features:
 *                           type: object
 *                           description: Optional functionality that is live right now. A key is null when it is not.
 *                           properties:
 *                             whatsapp: { type: object, nullable: true }
 *                             shareLink: { type: object, nullable: true }
 *                             about: { type: object, nullable: true }
 *                             team: { type: object, nullable: true }
 *                             gallery: { type: object, nullable: true }
 *                             testimonials:
 *                               type: object
 *                               nullable: true
 *                               properties:
 *                                 mode: { type: string, enum: [static, dynamic] }
 *                                 canSubmit:
 *                                   type: boolean
 *                                   description: Whether this site is collecting reviews. The only cue to render a form.
 *                                 items: { type: array, items: { type: object } }
 *                                 total: { type: integer }
 *                                 averageRating: { type: number, nullable: true, example: 4.6 }
 *                         service:
 *                           type: object
 *                           properties:
 *                             active: { type: boolean }
 *                             reason: { type: string, nullable: true, enum: [expired, suspended, no_plan] }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/company-details', readLimit, controller.companyDetails);

/**
 * A customer leaving a review on a tenant's website.
 *
 * The only unauthenticated **write** on the platform, so it gets a far tighter
 * budget than the reads above. Five per hour per IP: a person writes one
 * review; nobody writes six.
 */
/**
 * @openapi
 * /website/testimonials:
 *   post:
 *     tags: [Website]
 *     summary: Leave a review on a tenant's website
 *     description: |
 *       The only unauthenticated **write** on the platform, and every rule here
 *       exists to keep that narrow:
 *
 *       * **The tenant comes from the host, never from the body.** There is no
 *         company id to send, so a review cannot be aimed at a business whose
 *         site the writer never visited.
 *       * **Only when the tenant is collecting.** The `testimonials` feature has
 *         to be live *and* its mode has to be `dynamic`. A company running a
 *         curated wall has no form and no open endpoint, which are the same fact.
 *       * **Always pending.** Nothing a stranger sends reaches a website until
 *         somebody at the company approves it. There is no field that can
 *         change this.
 *       * **Branch-stamped from the domain**, so a review written on the Surat
 *         site belongs to Surat.
 *
 *       Rate limited to 5 per hour per IP. The reply is the same whether or not
 *       the review was the first that day: it reports receipt and nothing else.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TestimonialSubmission' }
 *     responses:
 *       201:
 *         description: Received, and waiting for the company to publish it.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Thank you — your review has been sent to us for publishing
 *                     data:
 *                       type: object
 *                       properties:
 *                         received: { type: boolean, example: true }
 *       400:
 *         description: |
 *           The review failed validation, **or** this website is not accepting
 *           reviews. Both answer the same way on purpose — a distinct "no such
 *           company" would let the endpoint be walked to enumerate tenants.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/testimonials',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.isProd ? 5 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'You have sent several reviews already — please try again later',
    },
  }),
  validate(schema.testimonialSubmit),
  controller.submitTestimonial
);

/**
 * @openapi
 * /website/service-leads:
 *   post:
 *     tags: [Website]
 *     summary: Ask a tenant to call you back about one of its services
 *     description: |
 *       The enquiry form behind a service card's button. The tenant is resolved
 *       from the host, like everything else in this module, and the service is
 *       checked against that tenant before anything is written.
 *
 *       Refused, with one message however it failed, unless the tenant is
 *       actually collecting: the Services functionality live, the service
 *       published, and the enquiry form pointed somewhere the platform records
 *       — a company that sends its enquiries only to WhatsApp has no inbox
 *       here, and this endpoint is shut with it.
 *
 *       Its own rate budget, sized between the review form and the tracker: a
 *       person enquiring about three services in an afternoon is ordinary,
 *       filling in thirty is not.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, name, phone]
 *             properties:
 *               serviceId: { type: integer }
 *               name: { type: string, maxLength: 150 }
 *               phone: { type: string, maxLength: 20 }
 *               sourceUrl: { type: string, maxLength: 500 }
 *               domain: { type: string, description: Local development only. }
 *     responses:
 *       201:
 *         description: Received. Carries the WhatsApp number to open where the tenant sends enquiries to both.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/service-leads',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.isProd ? 12 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'You have sent several enquiries already — please try again later',
    },
  }),
  validate(schema.serviceLeadSubmit),
  controller.submitServiceLead
);

module.exports = router;
