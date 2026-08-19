'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/public.controller');
const config = require('../config/env');

/**
 * Unauthenticated routes. Rate limited on their own budget so a scraper walking
 * hostnames cannot exhaust anything the signed-in app depends on.
 */
router.use(
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: config.isProd ? 120 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again shortly' },
  })
);

// Branding only — what a login screen needs. The admin consoles use this.
router.get('/branding', controller.branding);

// The full public profile — what a customer-facing website needs.
router.get('/company-details', controller.companyDetails);

module.exports = router;
