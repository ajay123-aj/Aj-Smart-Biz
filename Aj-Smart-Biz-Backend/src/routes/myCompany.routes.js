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
const catalogueRoutes = require('./catalogue.routes');
const blogRoutes = require('./blog.routes');
const orderRoutes = require('./order.routes');
const warehouseRoutes = require('./warehouse.routes');
const leadRoutes = require('./lead.routes');
const serviceLeadController = require('../controllers/serviceLead.controller');
const functionalitySchema = require('../validators/functionality.validator');
const masterSchema = require('../validators/master.validator');
const orderController = require('../controllers/order.controller');
const orderSchema = require('../validators/order.validator');
const customerRoutes = require('./customer.routes');
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
 * How those services are sorted - `Hair`, `Bridal`, and what sits under them.
 *
 * Its own mount rather than a corner of the services router, for the reason the
 * catalogue keeps Categories and Products apart: the taxonomy is set up once and
 * touched when the business takes on a new line, and the services themselves
 * change every month. Same guard, same grant.
 */
router.use('/service-categories', ...websiteSettingsGuard, functionalityRoutes.serviceCategories);
/**
 * Testimonials. Same guard as the rest of the section — reading open to anyone
 * who can view the company, writing to the main admin — which is what puts
 * approving a stranger's review in the same hands as changing the domain it
 * would be published on.
 */
router.use('/testimonials', ...websiteSettingsGuard, functionalityRoutes.testimonials);

/**
 * The catalogue — the categories the company sorts its range into, and the
 * products themselves.
 *
 * Same guard as the rest of Company Details, and the argument for it is
 * strongest here: these rows carry prices. A visitor arrives with the money the
 * website told them to bring, so changing one is the main admin's rather than
 * anyone who happens to have the menu.
 */
router.use('/categories', ...websiteSettingsGuard, catalogueRoutes.categories);
router.use('/products', ...websiteSettingsGuard, catalogueRoutes.products);

/**
 * The blog.
 *
 * Same guard as the rest of the section, and the reasoning is the ordinary one
 * rather than the catalogue's: an article is the company speaking in public,
 * under its own name, on its own domain. Publishing one is the main admin's, the
 * way changing the About copy is.
 *
 * Gated on the `blog` grant inside the controller, so a tenant whose plan does
 * not carry it is refused at the door rather than shown an editor it cannot use.
 */
router.use('/blog', ...websiteSettingsGuard, blogRoutes);

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
/**
 * What the services are earning — quoted, won and collected, over one of the
 * platform's windows. Before `/:id` for the same reason.
 */
router.get(
  '/service-leads/revenue',
  requirePermission('service-leads', 'canView'),
  validate(functionalitySchema.serviceRevenueQuery),
  serviceLeadController.revenue
);
/**
 * What is happening, as opposed to what it earned: demand over the window, the
 * conversion rate, which services get asked about, and how much of the diary is
 * being confirmed. Before `/:id`, like the rest.
 */
router.get(
  '/service-leads/analytics',
  requirePermission('service-leads', 'canView'),
  validate(functionalitySchema.serviceRevenueQuery),
  serviceLeadController.analytics
);
/**
 * The diary: one day of appointments, in time order.
 *
 * Before `/:id` like the rest, and read-only - confirming a time is the route
 * below, and a diary that could also change things would be two screens in one.
 */
router.get(
  '/service-leads/diary',
  requirePermission('service-leads', 'canView'),
  validate(functionalitySchema.diaryQuery),
  serviceLeadController.diary
);
router.patch(
  '/service-leads/:id',
  requirePermission('service-leads', 'canEdit'),
  validate(functionalitySchema.serviceLeadUpdate),
  serviceLeadController.update
);
/**
 * Confirming an appointment, or refusing it with a line saying why.
 *
 * Its own route rather than a field on the patch above, because it is a
 * different act: that one moves an enquiry through the company's own pipeline,
 * and this one changes a fact the customer is waiting on and can see on their
 * own page. `canEdit` on the same menu - whoever works the queue answers the
 * person waiting.
 */
router.patch(
  '/service-leads/:id/booking',
  requirePermission('service-leads', 'canEdit'),
  validate(functionalitySchema.bookingDecision),
  serviceLeadController.decideBooking
);
router.delete(
  '/service-leads/:id',
  requirePermission('service-leads', 'canDelete'),
  validate(masterSchema.idParam),
  serviceLeadController.remove
);

/**
 * The order book — what people have actually bought.
 *
 * Its own menu rather than a corner of Company Details, and for the reason
 * Service Leads has one: that section is the company describing itself, and this
 * is a queue somebody works down. It is also the one screen here that a shop
 * opens every morning.
 *
 * Read and write split by menu permission rather than by admin-only, unlike the
 * catalogue above it. Packing orders is the job of the staff who pack orders,
 * and a shop has to be able to hand somebody the queue without also handing them
 * the company’s domains and prices. `canEdit` covers moving an order along and
 * marking it paid — different axes, same person, same counter.
 */
router.get('/orders', requirePermission('orders', 'canView'), validate(orderSchema.listQuery), orderController.list);
/** Both before `/:id`, or Express reads the word as an order id. */
router.get('/orders/summary', requirePermission('orders', 'canView'), orderController.summary);
router.get(
  '/orders/analytics',
  requirePermission('orders', 'canView'),
  validate(orderSchema.analyticsQuery),
  orderController.analytics
);
router.get('/orders/:id', requirePermission('orders', 'canView'), validate(masterSchema.idParam), orderController.getById);
router.patch(
  '/orders/:id/status',
  requirePermission('orders', 'canEdit'),
  validate(orderSchema.statusUpdate),
  orderController.updateStatus
);
router.patch(
  '/orders/:id/payment',
  requirePermission('orders', 'canEdit'),
  validate(orderSchema.paymentUpdate),
  orderController.updatePayment
);
router.put(
  '/orders/:id',
  requirePermission('orders', 'canEdit'),
  validate(orderSchema.orderUpdate),
  orderController.update
);

/**
 * The warehouse, and what is in it.
 *
 * Two mounts under one menu. Setting the units up and working the stock are
 * different jobs done at different frequencies, which is why they are two
 * routers — but they are one thing a tenant either bought or did not, so they
 * share a permission rather than splitting the matrix in half for a distinction
 * most shops do not make.
 *
 * `canEdit` rather than admin-only, again: booking in a delivery is warehouse
 * work, and the person doing it has no business being the only one who can also
 * change the company’s domain.
 */
router.use(
  '/warehouses',
  requirePermission('warehouse', 'canView'),
  (req, res, next) => (req.method === 'GET' ? next() : requirePermission('warehouse', 'canEdit')(req, res, next)),
  warehouseRoutes.warehouses
);
router.use(
  '/stock',
  requirePermission('warehouse', 'canView'),
  (req, res, next) => (req.method === 'GET' ? next() : requirePermission('warehouse', 'canEdit')(req, res, next)),
  warehouseRoutes.stock
);

/**
 * The people who buy — their accounts, their addresses and what they have spent.
 *
 * Its own menu, gated on the `customers` functionality: a tenant whose plan does
 * not carry it has no sign-in on its website, so there are no accounts to look
 * at and the entry is left out rather than shown leading to an empty list.
 *
 * Read and write split by menu permission rather than admin-only, the way Orders
 * is: looking after customers is the job of whoever answers the phone.
 */
router.use(
  '/customers',
  requirePermission('customers', 'canView'),
  (req, res, next) => (req.method === 'GET' ? next() : requirePermission('customers', 'canEdit')(req, res, next)),
  customerRoutes
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
