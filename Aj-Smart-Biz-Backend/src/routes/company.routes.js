'use strict';

const router = require('express').Router();
const controller = require('../controllers/company.controller');
const branchRoutes = require('./branch.routes');
const domainRoutes = require('./companyDomain.routes');
const sliderRoutes = require('./slider.routes');
const adminRoutes = require('./admin.routes');
const subscriptionController = require('../controllers/subscription.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/company.validator');
const subscriptionSchema = require('../validators/subscription.validator');
const master = require('../validators/master.validator');

router.get('/', validate(schema.companyList), controller.list);
router.post('/', validate(schema.companyCreate), controller.create);

/**
 * @openapi
 * /super-admin/companies/samples:
 *   post:
 *     tags: [Super Admin]
 *     summary: Create the five sample companies
 *     description: |
 *       Creates whichever of the five sample companies are missing: an
 *       electronics shop with repairs, an event management firm, an
 *       e-commerce store, an informational consulting website, and a full
 *       commercial store with a deep product tree, services and orders. Each
 *       comes with its own domain (`*.sample.localhost`), main admin, website
 *       content and catalogue, on a free, hidden plan that grants every
 *       feature.
 *
 *       A sample whose code already exists (even deleted) is left alone, so
 *       the button can be pressed any number of times. `samples` reports each
 *       one as `created`, `exists` or `failed`; a created one carries its
 *       admin login, with the generated password shown this once.
 */
router.post('/samples', controller.createSamples);

router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.companyUpdate), controller.update);
router.patch('/:id/status', validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', validate(master.idParam), controller.remove);
router.post('/:id/restore', validate(master.idParam), controller.restore);

/**
 * @openapi
 * /super-admin/companies/{id}/duplicate:
 *   post:
 *     tags: [Super Admin]
 *     summary: Create a new company as a copy of this one
 *     description: |
 *       Takes the same body as creating a company (its own name, email, code,
 *       domain, main admin and plan, since those are unique or personal), plus
 *       `include`: which of company `{id}`'s sections to copy. `website`,
 *       `services`, `products`, `blog`, `branches` and `roles` by default;
 *       `testimonials` only when asked, and then only approved reviews without
 *       the reviewer's contact details.
 *
 *       Admins, customers, orders, leads, stock, subscriptions and payments are
 *       never copied. Uploaded images are copied as new files, so neither
 *       company can break the other's pictures. Branches are copied up to the
 *       new plan's branch limit.
 *
 *       All or nothing: the new company and its copied content are written in
 *       one transaction. The response is the create response plus `copied`
 *       (rows written, by kind) and `skipped` (what was left out and why).
 */
router.post('/:id/duplicate', validate(schema.companyDuplicate), controller.duplicate);

// Plans & billing
router.get('/:id/plan', validate(master.idParam), subscriptionController.companyPlan);
router.get('/:id/subscriptions', validate(master.idParam), controller.listSubscriptions);
router.post('/:id/subscriptions', validate(schema.subscriptionCreate), controller.assignPlan);

// Renewal (immediate or queued ahead of the current term) and plan changes.
// These sit before `/:subscriptionId/...` so the literal paths win the match.
router.post('/:id/subscriptions/renew', validate(subscriptionSchema.renew), subscriptionController.renew);
router.post(
  '/:id/subscriptions/change-plan',
  validate(subscriptionSchema.changePlan),
  subscriptionController.changePlan
);
router.get(
  '/:id/subscriptions/change-preview',
  validate(subscriptionSchema.changePreview),
  subscriptionController.changePreview
);

router.post('/:id/subscriptions/:subscriptionId/cancel', controller.cancelSubscription);
router.get('/:id/transactions', validate(schema.transactionList), controller.listTransactions);
router.post('/:id/transactions', validate(schema.transactionCreate), controller.createTransaction);

/**
 * @openapi
 * /super-admin/companies/{id}/ai-content:
 *   post:
 *     tags: [Super Admin]
 *     summary: Write the company's website content with AI
 *     description: |
 *       Claude writes the content the tenant's website renders from `prompt`, a
 *       description of the business, plus the company's own profile: hero
 *       slides, About and Contact pages, benefit cards, figures and team
 *       (`site`), the service menu (`services`), the product catalogue
 *       (`products`) and articles (`blog`). Pick any of them with `modules`;
 *       all four by default.
 *
 *       Only content is written, as ordinary rows the company can edit, and
 *       nothing that already exists is overwritten, so running it again only
 *       fills what is missing. Customer reviews are never generated.
 *
 *       Answers **202** at once with the job; the writing takes a minute or
 *       three. Poll the job below. `apiKey` is a Claude API key used for this
 *       one job and never stored; it may be omitted when the server has
 *       `ANTHROPIC_API_KEY` set. One job per company at a time (409).
 *
 * /super-admin/companies/{id}/ai-content/{jobId}:
 *   get:
 *     tags: [Super Admin]
 *     summary: How an AI content job is going
 *     description: |
 *       `status` is `running`, then `completed`, `partial` (some modules
 *       failed; see `failed`) or `failed`. `created` counts the rows written.
 *       `notLive` lists sections that now have content but are still kept off
 *       the website by the plan or the subscription. Jobs are kept for an hour
 *       after they finish.
 */
router.post('/:id/ai-content', validate(schema.aiContentStart), controller.startAiContent);
router.get('/:id/ai-content/:jobId', validate(schema.aiContentJob), controller.aiContentStatus);

// Branches and domains of a company
router.use('/:companyId/branches', branchRoutes);
router.use('/:companyId/domains', domainRoutes);
router.use('/:companyId/sliders', sliderRoutes);

/**
 * The company's admin logins, from the platform console.
 *
 * The same router the tenant reaches at `/admin/admins`, so the two consoles
 * cannot drift on what editing an admin means — the main admin keeps its role,
 * cannot be deactivated or deleted, and an email stays unique across tenants,
 * because those rules live in the controller rather than in either UI.
 */
router.use('/:companyId/admins', adminRoutes);

module.exports = router;
