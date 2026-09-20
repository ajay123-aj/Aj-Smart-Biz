'use strict';

/**
 * The API, assembled from one module per consumer.
 *
 * There are exactly four things that talk to this API, and each one has a
 * prefix of its own:
 *
 *   /theme        a tenant's public site      — unauthenticated, host-scoped
 *   /website      our own marketing site      — unauthenticated, not scoped
 *   /admin        the company workspace       — admin token, tenant-scoped
 *   /super-admin  the platform console        — super-admin token, unscoped
 *
 * `/theme` and `/website` are both public and are easy to confuse, so: `/theme`
 * serves the site belonging to a *customer* of ours, and which customer is
 * decided by the host the browser asked for. `/website` serves
 * ajsmartbiz's own marketing site — one site, no tenant, the same answer for
 * everybody. It was called `/website` because that is what the Technology site
 * is; the tenant one was renamed to `/theme` because a theme is what it
 * actually serves.
 *
 * plus `shared`, for the handful of routes all of them use — see that file for
 * why they are not duplicated into each module.
 *
 * **The guard belongs to the module, not to the route.** `authenticate` and the
 * scope check are applied once, here, so a route added inside a module cannot
 * be reachable by the wrong consumer through an omission. That is the property
 * the split is for: previously every mount carried its own pair of guards, and
 * the only thing stopping a new one from carrying the wrong pair — or none —
 * was whoever read the diff.
 *
 * A client therefore needs one base URL and its own prefix, and nothing else:
 * everything it may call lives under that prefix, and everything under that
 * prefix is something it may call.
 */
const router = require('express').Router();
const { authenticate, adminOnly, superAdminOnly } = require('../middlewares/auth');

const sharedRoutes = require('./shared/shared.routes');
const themeRoutes = require('./theme/theme.routes');
const websiteRoutes = require('./website/website.routes');
const adminRoutes = require('./admin/admin.routes');
const superAdminRoutes = require('./superadmin/superadmin.routes');

/* Health, auth, masters, uploads — see `shared/shared.routes`. */
router.use('/', sharedRoutes);

/* Public. No token by design; the host names the tenant. */
router.use('/theme', themeRoutes);

/* Also public, and not scoped to anything: our own marketing site. */
router.use('/website', websiteRoutes);

/* One tenant's own workspace. */
router.use('/admin', authenticate, adminOnly, adminRoutes);

/* The platform console. */
router.use('/super-admin', authenticate, superAdminOnly, superAdminRoutes);

module.exports = router;
