'use strict';

/**
 * The **shared** module — the routes that belong to no single consumer.
 *
 * Deliberately not folded into the three consumer modules, and the test for
 * what lands here is simple: would putting it in one module force the others to
 * reach across into that module's namespace? Signing in, reading master data
 * and uploading a file are all used by both consoles, so `/admin/auth/login`
 * and `/super-admin/auth/login` would be the same endpoint written twice under
 * two prefixes, and `/admin/masters/states` would be a path the platform
 * console has to know about.
 *
 * So these keep flat, unprefixed paths, and the module boundary means what it
 * says: everything under `/admin`, `/super-admin` and `/website` is that
 * consumer's alone.
 *
 * Authorisation still differs inside them — `/masters` is readable by anyone
 * signed in and writable only by a super admin, which the resource router
 * enforces per verb.
 */
const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const authRoutes = require('../../routes/auth.routes');
const masterRoutes = require('../../routes/master.routes');
const uploadRoutes = require('../../routes/upload.routes');

/** Liveness. No token, no database — this must answer even when nothing else does. */
router.get('/health', (req, res) =>
  res.json({
    success: true,
    message: 'Aj Smart Biz API is running',
    env: process.env.NODE_ENV,
    time: new Date(),
  })
);

/** Signing in, refreshing, and the profile behind whichever token you hold. */
router.use('/auth', authRoutes);

/** Reference data both consoles render: states, themes, plans, business types. */
router.use('/masters', authenticate, masterRoutes);

/** File uploads, for both consoles. */
router.use('/uploads', authenticate, uploadRoutes);

module.exports = router;
