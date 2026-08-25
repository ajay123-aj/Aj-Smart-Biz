'use strict';

/**
 * The **admin** module — the company workspace, for one tenant's own staff.
 *
 * Mounted at `/admin`, behind `authenticate` + `adminOnly`, applied once here
 * rather than route by route. Every controller under it scopes its queries from
 * `req.auth.companyId`, so there is no request a company admin can make that
 * reaches another tenant's data — the token names the tenant and nothing in a
 * URL or a body can override it.
 *
 * Per-menu rights (`requirePermission`) are applied inside the resource routers
 * where they differ; this file only establishes *who* may be here at all.
 *
 * `/company` is the tenant's own record and everything hanging off it —
 * branches, domains, website content, plan. It reads as a possessive because it
 * is one: there is exactly one company at the end of it, and it is the caller's.
 */
const router = require('express').Router();
const dashboard = require('../../controllers/dashboard.controller');
const companyRoutes = require('../../routes/myCompany.routes');
const roleRoutes = require('../../routes/role.routes');
const menuRoutes = require('../../routes/menu.routes');
const adminRoutes = require('../../routes/admin.routes');

/** What the workspace opens on: counts, quota and the plan's state. */
router.get('/dashboard', dashboard.adminDashboard);

/** The company itself, its branches, its website content and its plan. */
router.use('/company', companyRoutes);

/** Who may sign in to this workspace, and what each of them may do. */
router.use('/roles', roleRoutes);
router.use('/menus', menuRoutes);
router.use('/admins', adminRoutes);

module.exports = router;
