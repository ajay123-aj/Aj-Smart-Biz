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
const subscriptionValidator = require('../validators/subscription.validator');
const planRequestValidator = require('../validators/planRequest.validator');
const masterValidator = require('../validators/master.validator');

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

  /* ------------------------------ website ----------------------------- */
  TestimonialSubmission: pick(functionalityValidator.testimonialSubmit),

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
};

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Aj Smart Biz API',
    version: '1.0.0',
    description: [
      'One API, three consumers. Every route lives under the prefix of the consumer it belongs to,',
      'so a client needs its base URL and its own prefix and nothing else.',
      '',
      '| Prefix | Consumer | Auth |',
      '| --- | --- | --- |',
      '| `/website` | A tenant\'s public website | None. The tenant is resolved from the request host. |',
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
    { name: 'Website', description: 'What a tenant\'s public site consumes. Unauthenticated; the host names the tenant.' },
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
  /** Everything needs a token unless it says otherwise — `/website` and `/auth` do. */
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
