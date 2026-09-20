'use strict';

/**
 * The OpenAPI document, assembled at boot.
 *
 * Two halves, and the split is the point:
 *
 *  - **Prose** — what a route is for, who may call it, what it answers with —
 *    is written as JSDoc `@openapi` blocks next to the routes themselves, so it
 *    sits where somebody editing the route will see it.
 *  - **Shapes** — every request body and query string — are compiled from the
 *    **Joi validators the API already enforces**, by `joi-to-swagger`. Not
 *    written out again here.
 *
 * That second half is the whole reason to build the spec this way. Hand-written
 * schemas are a second description of the same thing, and the moment a
 * validator gains a field the documentation is wrong and nothing says so. Here
 * the documented shape *is* the enforced shape: if `testimonialSubmit` stops
 * accepting `authorRole`, the docs stop showing it on the next boot, because
 * they are reading the same object the middleware runs.
 */
const swaggerJsdoc = require('swagger-jsdoc');
const { scanRoutes } = require('./routeScanner');
const j2s = require('joi-to-swagger');
const path = require('path');
const config = require('../config/env');
const logger = require('../utils/logger');

const authValidator = require('../validators/auth.validator');
const companyValidator = require('../validators/company.validator');
const functionalityValidator = require('../validators/functionality.validator');
const sliderValidator = require('../validators/slider.validator');
const orderValidator = require('../validators/order.validator');
const warehouseValidator = require('../validators/warehouse.validator');
const subscriptionValidator = require('../validators/subscription.validator');
const planRequestValidator = require('../validators/planRequest.validator');
const masterValidator = require('../validators/master.validator');
const marketingValidator = require('../validators/marketing.validator');
const leadValidator = require('../validators/lead.validator');

/**
 * Every validator worth naming in the spec, as `SchemaName -> Joi object`.
 *
 * A validator in this project is `{ body?, query?, params? }`; only the `body`
 * is a component schema, because query and path parameters belong to the
 * operation rather than to a reusable object. `pick` takes whichever part is
 * asked for and skips anything that turns out not to exist, so a validator
 * renamed elsewhere degrades to a missing schema rather than to a boot crash.
 */
const pick = (validator, key = 'body') => validator?.[key] ?? null;

const SCHEMA_SOURCES = {
  /* ------------------------------- auth ------------------------------- */
  Login: pick(authValidator.login),
  RefreshToken: pick(authValidator.refresh),
  ChangePassword: pick(authValidator.changePassword),

  /* ------------------------------- theme ------------------------------ */
  TestimonialSubmission: pick(functionalityValidator.testimonialSubmit),

  /* ------------------------------ website ----------------------------- */
  MarketingEnquiryCreate: pick(marketingValidator.enquiryCreate),
  MarketingContentUpsert: pick(marketingValidator.contentUpsert),
  MarketingFaqCreate: pick(marketingValidator.faqCreate),
  MarketingFaqUpdate: pick(marketingValidator.faqUpdate),
  MarketingEnquiryUpdate: pick(marketingValidator.enquiryUpdate),
  /**
   * The tracking beacon, shared by `/theme/leads` and `/website/track`.
   *
   * One schema because it is literally one schema — `marketingLead.validator`
   * re-exports this rather than declaring a second copy, since the payload a
   * marketing page sends and the payload a tenant's page sends are the same.
   */
  LeadTrack: pick(leadValidator.track),

  /* ------------------------------- admin ------------------------------ */
  CompanySelfUpdate: pick(companyValidator.companyUpdateSelf),
  BranchCreate: pick(companyValidator.branchCreate),
  BranchUpdate: pick(companyValidator.branchUpdate),
  BranchContactCreate: pick(companyValidator.contactCreate),
  DomainCreate: pick(companyValidator.domainCreate),
  FunctionalityToggle: pick(functionalityValidator.toggle),
  /**
   * Settings are validated per functionality rather than by one schema, so
   * these come from `SETTINGS_SCHEMA` inside the validator rather than from a
   * `{ body }` pair like everything else. `settingsSchema` reaches in for one.
   */
  TeamSectionCopy: functionalityValidator.settingsSchema?.('team') ?? null,
  GallerySectionCopy: functionalityValidator.settingsSchema?.('gallery') ?? null,
  TestimonialsSettings: functionalityValidator.settingsSchema?.('testimonials') ?? null,
  ShareLinkSettings: functionalityValidator.settingsSchema?.('share_link') ?? null,
  ProductsSettings: functionalityValidator.settingsSchema?.('products') ?? null,
  OrdersSettings: functionalityValidator.settingsSchema?.('orders') ?? null,
  WhatsappNumberCreate: pick(functionalityValidator.whatsappCreate),
  WhatsappNumberUpdate: pick(functionalityValidator.whatsappUpdate),
  AboutCopySave: pick(functionalityValidator.aboutSave),
  ContactSettingsSave: pick(functionalityValidator.contactSave),
  StatCardCreate: pick(functionalityValidator.statCreate),
  TeamMemberCreate: pick(functionalityValidator.teamCreate),
  GalleryImageCreate: pick(functionalityValidator.galleryCreate),
  TestimonialCreate: pick(functionalityValidator.testimonialCreate),
  TestimonialUpdate: pick(functionalityValidator.testimonialUpdate),
  TestimonialModerate: pick(functionalityValidator.testimonialModerate),
  CardReorder: pick(functionalityValidator.reorder),
  /**
   * Orders and stock. The public `OrderSubmit` is listed beside the console's
   * schemas deliberately: the difference between them is the whole security
   * story of this module — one carries ids and quantities, the other carries the
   * money, and no schema lets a stranger name a price.
   */
  OrderSubmit: pick(orderValidator.submit),
  OrderStatusUpdate: pick(orderValidator.statusUpdate),
  OrderPaymentUpdate: pick(orderValidator.paymentUpdate),
  OrderUpdate: pick(orderValidator.orderUpdate),
  WarehouseCreate: pick(warehouseValidator.warehouseCreate),
  WarehouseUpdate: pick(warehouseValidator.warehouseUpdate),
  StockMovementCreate: pick(warehouseValidator.movementCreate),
  StockTransferCreate: pick(warehouseValidator.transferCreate),
  StockSettingsSave: pick(warehouseValidator.stockSettings),
  SliderCreate: pick(sliderValidator.create),
  SliderUpdate: pick(sliderValidator.update),
  PlanRequestCreate: pick(planRequestValidator.create),

  /* ---------------------------- super admin --------------------------- */
  CompanyCreate: pick(companyValidator.companyCreate),
  CompanyUpdate: pick(companyValidator.companyUpdate),
  SubscriptionCreate: pick(companyValidator.subscriptionCreate),
  SubscriptionRenew: pick(subscriptionValidator.renew),
  SubscriptionChangePlan: pick(subscriptionValidator.changePlan),
  SubscriptionTransition: pick(subscriptionValidator.transition),
  TransactionCreate: pick(companyValidator.transactionCreate),
  StateCreate: pick(masterValidator.stateCreate),
  BusinessTypeCreate: pick(masterValidator.businessTypeCreate),
  ThemeCreate: pick(masterValidator.themeCreate),
  PlanCreate: pick(masterValidator.planCreate),
  PlanUpdate: pick(masterValidator.planUpdate),
};

/** Compiles the Joi objects above into OpenAPI schemas, skipping any that fail. */
function schemasFromValidators() {
  const schemas = {};

  Object.entries(SCHEMA_SOURCES).forEach(([name, joi]) => {
    if (!joi || typeof joi.describe !== 'function') return;
    try {
      schemas[name] = j2s(joi).swagger;
    } catch (error) {
      // A schema that will not compile is worth one line in the log and no
      // more: the API still runs, and the rest of the document is still right.
      logger.warn(`OpenAPI: could not compile ${name} — ${error.message}`);
    }
  });

  return schemas;
}

/**
 * The envelope every route answers in.
 *
 * Written by hand because it comes from `utils/response`, not from a validator
 * — it is the shape of what goes *out*, and nothing validates that.
 */
const ENVELOPES = {
  ApiSuccess: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Fetched successfully' },
      data: { description: 'The payload. Shape depends on the endpoint.' },
    },
  },
  ApiError: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Validation failed' },
      errors: {
        type: 'array',
        description: 'Present on a 400 from the validation middleware.',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', example: 'body' },
            message: { type: 'string', example: 'body length must be at least 20 characters long' },
            in: { type: 'string', enum: ['body', 'query', 'params'] },
          },
        },
      },
    },
  },
  Paged: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer', example: 42 },
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 20 },
    },
  },

  /* ------------------------------------------------------------------ *
   * What the marketing site reads
   * ------------------------------------------------------------------ */

  /**
   * These four are hand-written for the same reason as the envelopes above:
   * they describe what goes *out*, and nothing validates a response. They are
   * the mapped shapes from `marketing.controller`, not the table columns — a
   * `plans` row carries entitlement fields a pricing card has no business
   * showing, and the mapper is what decides which ones reach the page.
   */
  WebsitePlan: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        example: 'starter',
        description: "The plan's `code`, not its primary key — it appears in `/demo?plan=`.",
      },
      name: { type: 'string', example: 'Starter' },
      tagline: { type: 'string', example: 'One business, one website, live tomorrow.' },
      price: { type: 'number', example: 499 },
      discountPrice: {
        type: 'number',
        nullable: true,
        description: 'Absent unless the plan is discounted; the card then shows the saving.',
      },
      currency: { type: 'string', example: 'INR' },
      billingCycle: { type: 'string', example: 'monthly' },
      limits: {
        type: 'object',
        properties: {
          branches: { type: 'integer', example: 1 },
          logins: { type: 'integer', example: 1 },
          storageMb: { type: 'integer', example: 1024, description: 'Rendered as GB above 1024.' },
        },
      },
      highlights: {
        type: 'array',
        items: { type: 'string' },
        description: 'Prose, ticked on the card.',
      },
      includes: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Capability keys from `GET /website/capabilities`. The site drops one it does not recognise.',
      },
      isPopular: { type: 'boolean', example: false },
    },
  },
  WebsiteCapability: {
    type: 'object',
    properties: {
      key: { type: 'string', example: 'whatsapp' },
      name: { type: 'string', example: 'WhatsApp' },
      icon: { type: 'string', nullable: true, example: 'message-circle' },
      summary: { type: 'string', example: 'WhatsApp buttons on the public website, per enquiry type.' },
      description: { type: 'string' },
      sequence: { type: 'integer', example: 1 },
    },
  },
  WebsiteBusinessType: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 3 },
      name: { type: 'string', example: 'Salon' },
      slug: { type: 'string', nullable: true, example: 'salon' },
      icon: { type: 'string', nullable: true },
      description: { type: 'string', nullable: true },
    },
  },
  WebsiteFaq: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 2 },
      question: { type: 'string', example: 'What happens if I stop the recharge?' },
      answer: { type: 'string' },
    },
  },
};

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Aj Smart Biz API',
    version: '1.0.0',
    description: [
      'One API, four consumers. Every route lives under the prefix of the consumer it belongs to,',
      'so a client needs its base URL and its own prefix and nothing else.',
      '',
      '| Prefix | Consumer | Auth |',
      '| --- | --- | --- |',
      '| `/theme` | A tenant\'s public website | None. The tenant is resolved from the request host. |',
      '| `/website` | Our own marketing site | None. One site, not scoped to any tenant. |',
      '| `/admin` | The company workspace | Admin token. Every query is scoped to the token\'s company. |',
      '| `/super-admin` | The platform console | Super-admin token. Not scoped to any tenant. |',
      '',
      'Signing in, master data and uploads sit outside those prefixes because both consoles use them.',
      '',
      '**Request shapes on this page are generated from the Joi validators the API actually runs**,',
      'so they cannot drift from what it accepts.',
    ].join('\n'),
  },
  servers: [
    { url: config.apiPrefix, description: 'This server' },
    { url: `http://localhost:${config.port}${config.apiPrefix}`, description: 'Local development' },
  ],
  tags: [
    { name: 'Shared', description: 'Health, signing in, master data and uploads — used by every consumer.' },
    { name: "Theme", description: "What a tenant's public site consumes. Unauthenticated; the host names the tenant." },
    { name: 'Website', description: 'What the Aj Smart Biz Technology marketing site consumes. Unauthenticated, and the same for every caller — there is no tenant.' },
    { name: 'Admin', description: 'The company workspace. Scoped to the signed-in admin\'s own tenant.' },
    { name: 'Super Admin', description: 'The platform console. Spans every tenant.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'The `accessToken` from `/auth/admin/login` or `/auth/super-admin/login`. ' +
          'Its scope decides which prefix it may reach: an admin token is refused on `/super-admin` and vice versa.',
      },
    },
    schemas: { ...ENVELOPES, ...schemasFromValidators() },
    responses: {
      Unauthorized: {
        description: 'No token, or a token that has expired.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      Forbidden: {
        description: 'A valid token of the wrong scope, or a menu permission the role lacks.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      ValidationFailed: {
        description: 'The request did not match the endpoint\'s schema.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      NotFound: {
        description: 'No such record, or none belonging to the caller.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      TooManyRequests: {
        description: 'A rate limit was exceeded. See the endpoint for its budget.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
    },
  },
  /** Everything needs a token unless it says otherwise — `/theme` and `/auth` do. */
  security: [{ bearerAuth: [] }],
};

/**
 * Route prose is read from the module files, which is where the `@openapi`
 * blocks live. Absolute paths, because the process is not always started from
 * the project root.
 */
/**
 * Forward slashes, always. `path.join` produces `\` on Windows and glob
 * treats a backslash as an escape character, so a joined path silently matches
 * nothing there — the spec builds, reports zero documented paths, and gives no
 * clue why.
 */
const glob = (relative) => path.join(__dirname, relative).split(path.sep).join('/');

const apis = [glob('../modules/**/*.js'), glob('../routes/*.js')];

let cached = null;

/**
 * The finished document.
 *
 * Three sources, merged in order of how much each one actually knows:
 *
 *   1. **the router** — every mounted route, so coverage is complete by
 *      construction rather than by anyone remembering (see `routeScanner`),
 *   2. **the JSDoc blocks** — prose about the routes worth explaining, which
 *      overwrite the scanned entry for the same path and method,
 *   3. **the validators** — every request shape, as components.
 *
 * Built once. None of the three can change while the process is running.
 */
function openapiSpec(router) {
  if (cached) return cached;

  const fromJsdoc = swaggerJsdoc({ definition, apis });
  const scanned = router ? scanRoutes(router) : {};

  /**
   * Merged per method, not per path: a path with one documented verb and three
   * scanned ones should keep all four, and a naive object spread at the path
   * level would drop the three.
   */
  const paths = { ...scanned };
  Object.entries(fromJsdoc.paths ?? {}).forEach(([path, operations]) => {
    paths[path] = { ...(paths[path] ?? {}), ...operations };
  });

  cached = { ...fromJsdoc, paths };

  const total = Object.values(paths).reduce((sum, ops) => sum + Object.keys(ops).length, 0);
  const described = Object.values(fromJsdoc.paths ?? {}).reduce(
    (sum, ops) => sum + Object.keys(ops).length,
    0
  );
  logger.info(
    `OpenAPI: ${total} operation(s) across ${Object.keys(paths).length} path(s), ` +
      `${described} with written prose, ${Object.keys(cached.components?.schemas ?? {}).length} schema(s)`
  );

  return cached;
}

module.exports = { openapiSpec };
