'use strict';

const router = require('express').Router();
const controller = require('../controllers/company.controller');
const subscriptionController = require('../controllers/subscription.controller');
const planRequestController = require('../controllers/planRequest.controller');
const planRequestSchema = require('../validators/planRequest.validator');
const branchRoutes = require('./branch.routes');
const domainRoutes = require('./companyDomain.routes');
const sliderRoutes = require('./slider.routes');
const functionalityRoutes = require('./functionality.routes');
const validate = require('../middlewares/validate');
const schema = require('../validators/company.validator');
const { companyAdminOnly, requirePermission } = require('../middlewares/auth');

// The company profile itself: readable by anyone with the menu permission,
// editable by the main admin only.
router.get('/', requirePermission('company-details', 'canView'), controller.getMyCompany);
router.put('/', companyAdminOnly, validate(schema.companyUpdateSelf), controller.updateMyCompany);

/**
 * The tenant's own plan screen. Read-only by design: plans are sold and changed
 * by the platform, so this menu carries no write route at all.
 */
router.get('/plan', requirePermission('my-plan', 'canView'), subscriptionController.myPlan);

/**
 * Upgrading is a request, not a purchase: the tenant picks a plan and the
 * platform decides. Nothing here writes a subscription, so a company can never
 * raise its own limits.
 */
router.get('/plans', requirePermission('my-plan', 'canView'), planRequestController.availablePlans);
router.get('/plan-requests', requirePermission('my-plan', 'canView'), planRequestController.myRequests);
router.post(
  '/plan-requests',
  requirePermission('my-plan', 'canView'),
  validate(planRequestSchema.create),
  planRequestController.createRequest
);
router.post(
  '/plan-requests/:id/cancel',
  requirePermission('my-plan', 'canView'),
  planRequestController.cancelMyRequest
);

router.get('/subscriptions', requirePermission('company-details', 'canView'), (req, res, next) => {
  req.params.id = req.auth.companyId;
  return controller.listSubscriptions(req, res, next);
});

router.get('/transactions', requirePermission('company-details', 'canView'), (req, res, next) => {
  req.params.id = req.auth.companyId;
  return controller.listTransactions(req, res, next);
});

// Branches + branch contacts of the caller's own company. The per-action
// checks live in the branch controller; the menu gate is applied here.
router.use('/branches', requirePermission('branch-management', 'canView'), branchRoutes);

/**
 * Hero slides for the company's public website. Gated by its own menu, so a
 * role can be given the website content without the rest of the company
 * settings. Per-action rights are enforced below.
 */
router.use('/sliders', requirePermission('slider-management', 'canView'), sliderRoutes);

/**
 * Optional functionality — WhatsApp, the share button — and the typed WhatsApp
 * numbers that go with it. They live on a tab of Company Details rather than a
 * menu of their own, so they are gated by that menu.
 *
 * Reading is open to anyone who can view the company; writing changes what the
 * tenant publishes to the public internet, so it is the main admin's alone —
 * the same split the domain manager below uses, and for the same reason.
 */
const websiteSettingsGuard = [
  requirePermission('company-details', 'canView'),
  (req, res, next) => (req.method === 'GET' ? next() : companyAdminOnly(req, res, next)),
];

router.use('/functionalities', ...websiteSettingsGuard, functionalityRoutes.functionalities);
router.use('/whatsapp-numbers', ...websiteSettingsGuard, functionalityRoutes.whatsapp);
/** The About copy, its stat band, the Team section and the Gallery — same guard, same reason. */
router.use('/about', ...websiteSettingsGuard, functionalityRoutes.about);
router.use('/contact', ...websiteSettingsGuard, functionalityRoutes.contact);
router.use('/stats', ...websiteSettingsGuard, functionalityRoutes.stats);
router.use('/team', ...websiteSettingsGuard, functionalityRoutes.team);
router.use('/gallery', ...websiteSettingsGuard, functionalityRoutes.gallery);

/**
 * Domains that resolve to this company (and optionally one of its branches).
 * Anyone who can view the company may read them, but changing them changes the
 * tenant's identity, so writes are restricted to the main admin - the same rule
 * `PUT /my-company` follows.
 */
router.use(
  '/domains',
  requirePermission('company-details', 'canView'),
  (req, res, next) => (req.method === 'GET' ? next() : companyAdminOnly(req, res, next)),
  domainRoutes
);

module.exports = router;
