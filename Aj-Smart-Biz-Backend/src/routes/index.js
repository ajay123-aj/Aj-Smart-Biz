'use strict';

const router = require('express').Router();
const { authenticate, superAdminOnly, adminOnly } = require('../middlewares/auth');
const dashboard = require('../controllers/dashboard.controller');

const authRoutes = require('./auth.routes');
const masterRoutes = require('./master.routes');
const companyRoutes = require('./company.routes');
const subscriptionRoutes = require('./subscription.routes');
const planRequestRoutes = require('./planRequest.routes');
const superAdminRoutes = require('./superAdmin.routes');
const myCompanyRoutes = require('./myCompany.routes');
const roleRoutes = require('./role.routes');
const menuRoutes = require('./menu.routes');
const adminRoutes = require('./admin.routes');
const uploadRoutes = require('./upload.routes');
const publicRoutes = require('./public.routes');

router.get('/health', (req, res) =>
  res.json({ success: true, message: 'Aj Smart Biz API is running', env: process.env.NODE_ENV, time: new Date() })
);

router.use('/auth', authRoutes);

/* ---------------- Public (no token): login-screen branding ---------------- */
router.use('/public', publicRoutes);

/* ---------------- Master data (shared, writes are super-admin only) ---------------- */
router.use('/masters', authenticate, masterRoutes);

/* ---------------- File uploads (both portals) ---------------- */
router.use('/uploads', authenticate, uploadRoutes);

/* ---------------- Super admin portal ---------------- */
router.get('/dashboard/super-admin', authenticate, superAdminOnly, dashboard.superAdminDashboard);
router.use('/companies', authenticate, superAdminOnly, companyRoutes);
router.use('/subscriptions', authenticate, superAdminOnly, subscriptionRoutes);
router.use('/plan-requests', authenticate, superAdminOnly, planRequestRoutes);
router.use('/super-admins', authenticate, superAdminOnly, superAdminRoutes);

/* ---------------- Company admin portal ---------------- */
router.get('/dashboard/admin', authenticate, adminOnly, dashboard.adminDashboard);
router.use('/my-company', authenticate, adminOnly, myCompanyRoutes);
router.use('/roles', authenticate, adminOnly, roleRoutes);
router.use('/menus', authenticate, adminOnly, menuRoutes);
router.use('/admins', authenticate, adminOnly, adminRoutes);

module.exports = router;
