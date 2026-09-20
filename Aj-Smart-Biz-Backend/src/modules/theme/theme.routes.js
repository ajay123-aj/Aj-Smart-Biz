'use strict';

/**
 * The **website** module — everything a tenant's public site consumes.
 *
 * Mounted at `/theme`. Unauthenticated in full: these are the only routes on
 * the platform a stranger can reach, which is why the module exists as its own
 * surface rather than as a corner of a larger one. Anything added here is
 * public by definition, and that should take a deliberate act.
 *
 * The tenant is always resolved from the **host** the request arrived on, never
 * from the body or a query parameter a caller could aim — see
 * `controllers/theme.controller`. So there is no company id anywhere in this
 * file, and no route that could be pointed at a company the caller never
 * visited.
 *
 * Rate limits are per-route rather than module-wide because the routes are not
 * alike: rendering a page is cheap and frequent, writing a review is neither.
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const controller = require('../../controllers/public.controller');
const validate = require('../../middlewares/validate');
const schema = require('../../validators/functionality.validator');
const leadSchema = require('../../validators/lead.validator');
const orderSchema = require('../../validators/order.validator');
const customerSchema = require('../../validators/customer.validator');
const blogSchema = require('../../validators/blog.validator');
const customerController = require('../../controllers/customerAuth.controller');
const { authenticate, authenticateOptional, customerOnly } = require('../../middlewares/auth');
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
 * /theme/leads:
 *   post:
 *     tags: [Theme]
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
 * /theme/branding:
 *   get:
 *     tags: [Theme]
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
 * /theme/company-details:
 *   get:
 *     tags: [Theme]
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
 * @openapi
 * /theme/blog:
 *   get:
 *     tags: [Theme]
 *     summary: A tenant's blog archive, a page at a time
 *     description: |
 *       **The one paged public list on the platform**, and it exists because a
 *       blog is the one thing here that grows without limit. Services and
 *       products ride whole in `/company-details` because they are as long as the
 *       business is wide; a tenant writing weekly has two hundred articles in
 *       four years, and shipping all of them with every page render would make
 *       the home page pay for the archive forever.
 *
 *       So `features.blog.items` carries the latest handful for the band on the
 *       home page, and the rest is asked for here, by the page that shows it.
 *
 *       **Bodies are not in this response.** A listing prints a title, a picture
 *       and a line or two; the article itself comes from `/theme/blog/{slug}`.
 *
 *       404 when this tenant has no blog today - the plan does not grant it, the
 *       switch is off, or the term has lapsed. The same answer the archive page
 *       gives, and for the same reason the Services page 404s.
 *     security: []
 *     responses:
 *       200:
 *         description: One page of posts, newest first, with the usual meta.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
/**
 * @openapi
 * /theme/services/{slug}/slots:
 *   get:
 *     tags: [Theme]
 *     summary: One day of a service's diary, and the next days with anything free
 *     description: |
 *       Answered by the **same generator** the booking route checks against, so a
 *       time this endpoint paints is a time that endpoint will accept - and one it
 *       greys out is one that would have been refused. Two implementations of "is
 *       ten o'clock free" is how a site comes to offer a slot that does not exist.
 *
 *       Every slot in the day comes back, with a `reason` on anything
 *       unavailable - `closed`, `past`, `full` or `overrun`. A row of greyed
 *       times tells a visitor the shop is busy; a short list of three tells them
 *       nothing.
 *
 *       `openDays` is the next fortnight that has anything left, so a salon
 *       closed Sunday and Monday and full on Tuesday does not make somebody click
 *       through three empty days to find Wednesday.
 *
 *       404 when this tenant is not taking bookings, or when the service is not
 *       one that can be booked: there is no diary here, which is a different fact
 *       from a diary with nothing in it.
 *     security: []
 *     responses:
 *       200:
 *         description: The day, the open days, and whether a sign-in is needed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/services/:slug/slots', readLimit, controller.serviceSlots);

router.get('/blog', readLimit, validate(blogSchema.publicList), controller.blogList);

/**
 * @openapi
 * /theme/blog/{slug}:
 *   get:
 *     tags: [Theme]
 *     summary: One article, with the two beside it
 *     description: |
 *       The slug is matched **within the tenant the host resolved to**, never
 *       globally: two companies can both have a post called `how-we-work`, and
 *       each site must see its own.
 *
 *       Carries `previous` and `next` - the articles either side of this one by
 *       date - so the page can offer the next read without a second request. Both
 *       ignore `featured`: next and previous mean *in time*.
 *
 *       A post that exists but is not published yet is a **404**, not a 403. It is
 *       the truthful answer - there is no such page on this website today - and
 *       anything else would let a stranger with the URL confirm that a tenant has
 *       an article scheduled.
 *     security: []
 *     responses:
 *       200:
 *         description: The article, the section's wording, and its neighbours.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get('/blog/:slug', readLimit, validate(blogSchema.publicOne), controller.blogPost);

/**
 * A customer leaving a review on a tenant's website.
 *
 * The only unauthenticated **write** on the platform, so it gets a far tighter
 * budget than the reads above. Five per hour per IP: a person writes one
 * review; nobody writes six.
 */
/**
 * @openapi
 * /theme/testimonials:
 *   post:
 *     tags: [Theme]
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
 * /theme/service-leads:
 *   post:
 *     tags: [Theme]
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
  /* Optional: a signed-in customer gets the enquiry filed against their account
     so it shows in their own service history, and a stranger is taken exactly as
     before. An enquiry is a question — refusing one from somebody not signed in
     would turn away the conversation the form exists to start. */
  authenticateOptional,
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

/**
 * @openapi
 * /theme/orders:
 *   post:
 *     tags: [Theme]
 *     summary: Place an order from a tenant's cart
 *     description: |
 *       The cart on a tenant's own website, turned into a record. The tenant is
 *       resolved from the host, like everything else in this module.
 *
 *       **Nothing about money is read from the body.** It carries product ids and
 *       quantities; every price on the resulting order comes from the tenant's own
 *       catalogue at the moment it is placed. A body that could name its own price
 *       is a shop that can be bought from at a price the customer chose.
 *
 *       Accepted only when the plan grants both `orders` and `products`, the
 *       tenant has switched orders on, the mode is not off, and the route it
 *       chose has something behind it — a published WhatsApp number, or a UPI id
 *       or payment link. The same four conditions the cart on the website hangs
 *       off, resolved by the same function, so a button a visitor can press and a
 *       request this route accepts can never disagree.
 *
 *       Which customer details are required is the **tenant's** setting, so it is
 *       checked here rather than in the schema, which cannot know.
 *
 *       Refused with one message however it failed, exactly as the testimonial and
 *       enquiry endpoints are: a distinct "no such company" would turn a POST into
 *       a way of enumerating tenants.
 *
 *       Its own hourly budget, sized for a real shopper rather than a script. An
 *       order is a row somebody has to work through, so this is the tightest
 *       write budget in the module after the testimonials'.
 *     security: []
 *     responses:
 *       201:
 *         description: |
 *           Recorded. Returns the order number — which only exists now, and which
 *           the page puts into the WhatsApp message it composes — the total, and
 *           the number to open where the tenant publishes one.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post(
  '/orders',
  /* Optional on purpose: a signed-in customer gets the order filed against their
     account and their saved address offered; a stranger gets exactly the checkout
     the site had before accounts existed. A token that is present and *bad* still
     fails, so an expired session mid-checkout is told rather than quietly demoted. */
  authenticateOptional,
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.isProd ? 15 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'You have placed several orders already — please try again later',
    },
  }),
  validate(orderSchema.submit),
  controller.submitOrder
);

/* ------------------------------------------------------------------ *
 * Customer accounts
 * ------------------------------------------------------------------ */

/**
 * The sign-in budget.
 *
 * Tighter than the read one and separate from the write one, because this is the
 * route somebody would use to work through phone numbers looking for accounts, or
 * to make a shop send a hundred messages. Per IP, generous for a person who
 * mistyped their number twice and useless for a script.
 */
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts — please try again in a few minutes' },
});

/**
 * @openapi
 * /theme/auth/register:
 *   post:
 *     tags: [Theme]
 *     summary: Register a customer, or ask for a sign-in code
 *     description: |
 *       A name, a mobile number and an email. **No password** — sign-in is a
 *       one-time code to the mobile, because a password is a thing to forget, to
 *       reset over email and to be blamed for when it leaks, and the whole value
 *       of the account is remembering an address and an order history.
 *
 *       **Registering a number that already has an account is not an error.**
 *       Somebody who signed up six months ago and has forgotten is not doing
 *       anything wrong, and telling them the number is taken would both annoy them
 *       and confirm that it has an account here. They are simply sent a code. Their
 *       name is left alone, so a stranger cannot rename somebody else's account by
 *       registering their number.
 *
 *       Available only where the plan grants `customers`, the tenant has switched
 *       it on and the plan is still being served.
 *
 *       While **no SMS gateway is connected** the response carries the code as
 *       `devCode`, labelled as such. Without it nobody could sign in at all on
 *       such an install, which would make the feature untestable rather than
 *       secure. See `sendOtp`, the one place that decides.
 *     security: []
 *     responses:
 *       201:
 *         description: A code was issued.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/auth/register', authLimit, validate(customerSchema.register), customerController.register);

/**
 * @openapi
 * /theme/auth/request-otp:
 *   post:
 *     tags: [Theme]
 *     summary: Ask for a sign-in code
 *     description: |
 *       Returns `registered`, so the website can carry somebody new straight into
 *       the sign-up form with their number already filled in rather than telling
 *       them a code is coming and leaving them waiting for a message that is never
 *       sent.
 *
 *       **That is a deliberate trade.** This route originally answered identically
 *       either way, which meant it could not be used to test which numbers a shop
 *       has. It can now. Three things keep that bounded: the rate limit on this
 *       route, the fact that it reveals only *that* an account exists — never a
 *       name, an email or an order, all of which still need a code from that
 *       person's own phone — and that a **barred** customer is reported as
 *       registered, so the answer cannot be used to work out who a shop has shut
 *       out.
 *
 *       `verify` is unchanged and still says the same thing for a wrong code, an
 *       expired one and a number with no account.
 *     security: []
 *     responses:
 *       200:
 *         description: |
 *           `registered` says whether an account exists. `sent` says whether a code
 *           actually went — false for an unknown number, and false for a barred
 *           account, which also carries `blocked`.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/auth/request-otp', authLimit, validate(customerSchema.requestOtp), customerController.requestOtp);

/**
 * @openapi
 * /theme/auth/verify:
 *   post:
 *     tags: [Theme]
 *     summary: Exchange a code for a session
 *     description: |
 *       Every failure says the same thing — no account, wrong code and expired
 *       code are indistinguishable from outside, for the reason the request route
 *       gives.
 *
 *       The code is **spent** on success, so a second use of the same six digits
 *       finds nothing to compare against. Five wrong guesses burn it rather than
 *       leaving it to be guessed at leisure.
 *
 *       The token carries the **company** as well as the customer, which is what
 *       pins every later request to one tenant without trusting a path or a body.
 *     security: []
 *     responses:
 *       200:
 *         description: Signed in. Returns the tokens and the customer.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401:
 *         description: Not right, or expired.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/auth/verify', authLimit, validate(customerSchema.verify), customerController.verify);

/**
 * Everything below needs a **customer** token, and only a customer token.
 *
 * `customerOnly` is stated rather than assumed: these routes live outside the
 * admin prefixes, but a staff token reaching one would resolve `req.auth.id` to
 * an admin's id and read somebody else's addresses. The scope check makes that
 * impossible rather than merely unlikely.
 */
const mine = express.Router();
mine.use(authenticate, customerOnly);

mine.get('/', customerController.me);
mine.put('/', validate(customerSchema.updateMe), customerController.updateMe);

mine.post('/addresses', validate(customerSchema.addressCreate), customerController.addAddress);
mine.put('/addresses/:id', validate(customerSchema.addressUpdate), customerController.updateAddress);
mine.delete('/addresses/:id', validate(customerSchema.idParam), customerController.removeAddress);

/**
 * @openapi
 * /theme/me/orders:
 *   get:
 *     tags: [Theme]
 *     summary: A customer's own order history
 *     description: |
 *       Their orders, newest first, with the lines on each — a history that only
 *       showed a total is one nobody can check against what arrived.
 *
 *       Scoped by the customer id **in the token**, so there is no path a customer
 *       can change to read somebody else's. The shop's private notes and the
 *       order's provenance are stripped: harmless-looking, and none of the
 *       customer's business.
 *     responses:
 *       200:
 *         description: Their orders.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
mine.get('/orders', customerController.myOrders);

/** The service half of the same history. See `myServices`. */
mine.get('/services', customerController.myServices);

router.use('/me', mine);

module.exports = router;
