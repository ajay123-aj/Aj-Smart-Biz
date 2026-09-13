'use strict';

/**
 * The **super admin** module — the platform console, for whoever runs Aj Smart
 * Biz rather than a business on it.
 *
 * Mounted at `/super-admin`, behind `authenticate` + `superAdminOnly`. That
 * guard is the whole access model for this module: the platform console has no
 * per-menu permission matrix of its own, unlike the tenant workspace, so
 * everything here is reachable by anyone who holds a super-admin token and by
 * nobody else.
 *
 * This is the only module whose routes are **not** scoped to one tenant. A
 * company id in a path or a `?companyId=` filter means what it says here, which
 * is exactly what makes it the wrong module for anything a tenant can reach.
 */
const router = require('express').Router();
const dashboard = require('../../controllers/dashboard.controller');
const companyRoutes = require('../../routes/company.routes');
const subscriptionRoutes = require('../../routes/subscription.routes');
const planRequestRoutes = require('../../routes/planRequest.routes');
const superAdminRoutes = require('../../routes/superAdmin.routes');
const leadRoutes = require('../../routes/lead.routes');
const insights = require('../../controllers/platformInsight.controller');

/** Platform-wide counts: tenants, subscriptions, revenue, expiries. */
router.get('/dashboard', dashboard.superAdminDashboard);

/** Every tenant, and everything the platform decides about one. */
router.use('/companies', companyRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/plan-requests', planRequestRoutes);

/** The platform's own operators. */
router.use('/super-admins', superAdminRoutes);

/**
 * Every tenant's website leads, and the analysis across them. The same
 * controller the tenant console reads through — the scope comes from the token,
 * so mounting it here is what makes it platform-wide.
 */
router.use('/leads', leadRoutes.superAdmin);

/**
 * Across every tenant: who is buying, and how each company is doing.
 *
 * Their own controller rather than an optional parameter on the tenant
 * endpoints — a cross-tenant read is a different question, and bolting it onto
 * handlers that are otherwise pinned to one company would leave every one of
 * them a missing check away from serving the wrong data.
 *
 * `/companies/:id/insights` is two segments, which the company CRUD router above
 * has no route for — it falls through to here rather than being read as a
 * company id of "insights". Declared after it anyway, so the ordering is a fact
 * about this file rather than a thing to be preserved by accident.
 */
router.get('/customers/summary', insights.customerSummary);
router.get('/customers', insights.customers);
router.get('/companies/:id/insights', insights.companyInsights);

module.exports = router;
