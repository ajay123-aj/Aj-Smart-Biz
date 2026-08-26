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
const leadRoutes = require('./lead.routes');
const serviceLeadController = require('../controllers/serviceLead.controller');
const functionalitySchema = require('../validators/functionality.validator');
const masterSchema = require('../validators/master.validator');
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
/** The About copy, the figures, the Team section and the Gallery — same guard, same reason. */
router.use('/about', ...websiteSettingsGuard, functionalityRoutes.about);
router.use('/contact', ...websiteSettingsGuard, functionalityRoutes.contact);
router.use('/stats', ...websiteSettingsGuard, functionalityRoutes.stats);
router.use('/team', ...websiteSettingsGuard, functionalityRoutes.team);
router.use('/gallery', ...websiteSettingsGuard, functionalityRoutes.gallery);
/**
 * The Features / Benefits cards. Same guard as the rest of the section: what
 * they say is what the website says about the business, so writing them is the
 * main admin's.
 */
router.use('/features', ...websiteSettingsGuard, functionalityRoutes.features);
/**
 * The services the company sells. Same guard again — this is the list a
 * visitor reads before deciding to call, and its prices are on it, so changing
 * it is the main admin's rather than anyone with the menu.
 */
router.use('/services', ...websiteSettingsGuard, functionalityRoutes.services);
/**
 * Testimonials. Same guard as the rest of the section — reading open to anyone
 * who can view the company, writing to the main admin — which is what puts
 * approving a stranger's review in the same hands as changing the domain it
 * would be published on.
 */
router.use('/testimonials', ...websiteSettingsGuard, functionalityRoutes.testimonials);

/**
 * Service enquiries — the people who filled in the form on a service card.
 *
 * Its own menu rather than a corner of Company Details, because it is a
 * different job: that section is the company describing itself, and this is a
 * queue somebody works through. It is the first inbox on the platform.
 *
 * Reading needs `canView` on the menu and moving one along needs `canEdit`,
 * the same split Lead Management uses — which is what lets a company give its
 * sales staff the list without also giving them the ability to clear it.
 */
router.get(
  '/service-leads',
  requirePermission('service-leads', 'canView'),
  validate(functionalitySchema.serviceLeadList),
  serviceLeadController.list
);
/** Before `/:id`, or "summary" would be read as an enquiry id. */
router.get('/service-leads/summary', requirePermission('service-leads', 'canView'), serviceLeadController.summary);
router.patch(
  '/service-leads/:id',
  requirePermission('service-leads', 'canEdit'),
  validate(functionalitySchema.serviceLeadUpdate),
  serviceLeadController.update
);
router.delete(
  '/service-leads/:id',
  requirePermission('service-leads', 'canDelete'),
  validate(masterSchema.idParam),
  serviceLeadController.remove
);

/**
 * Website visitors, and what is known about each of them.
 *
 * Its own menu rather than a tab of Company Details: the rest of that section
 * is the company describing itself, and this is the company reading about
 * other people — a different job, done by different staff. The per-action
 * rights are checked inside the router, so a role can be given the list
 * without the ability to move a lead along.
 */
router.use('/leads', leadRoutes.admin);

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
