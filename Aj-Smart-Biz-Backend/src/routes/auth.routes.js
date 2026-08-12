'use strict';

const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const schema = require('../validators/auth.validator');

// Public
router.post('/super-admin/login', validate(schema.login), controller.superAdminLogin);
router.post('/admin/login', validate(schema.login), controller.adminLogin);
router.post('/refresh', validate(schema.refresh), controller.refresh);

// Authenticated - works for both portals
router.get('/me', authenticate, controller.me);
router.patch('/profile', authenticate, validate(schema.updateProfile), controller.updateProfile);
router.post('/change-password', authenticate, validate(schema.changePassword), controller.changePassword);
router.post('/logout', authenticate, controller.logout);

module.exports = router;
