'use strict';

const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const schema = require('../validators/auth.validator');

// Public
/**
 * @openapi
 * /auth/super-admin/login:
 *   post:
 *     tags: [Shared]
 *     summary: Sign in to the platform console
 *     description: |
 *       Issues a **super-admin** token. Its scope decides which prefix it may
 *       reach: it is accepted on `/super-admin` and refused with a 403 on
 *       `/admin`, and the reverse is true of the token below.
 *
 *       Rate limited to protect against brute force — see `app.js`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Login' }
 *     responses:
 *       200:
 *         description: Signed in.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                           description: 'Send as the Authorization header: Bearer <token>.'
 *                         refreshToken: { type: string }
 *                         expiresIn: { type: string, example: 1d }
 *                         user: { type: object }
 *       401:
 *         description: Wrong email or password. Deliberately does not say which.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/super-admin/login', validate(schema.login), controller.superAdminLogin);
/**
 * @openapi
 * /auth/admin/login:
 *   post:
 *     tags: [Shared]
 *     summary: Sign in to a company workspace
 *     description: |
 *       Issues an **admin** token, scoped to one company. Every query under
 *       `/admin` is filtered by the company it names, so there is no request a
 *       company admin can make that reaches another tenant's data.
 *
 *       Accepted on `/admin`; refused with a 403 on `/super-admin`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Login' }
 *     responses:
 *       200:
 *         description: Signed in.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         accessToken: { type: string }
 *                         refreshToken: { type: string }
 *                         user:
 *                           type: object
 *                           properties:
 *                             id: { type: integer }
 *                             name: { type: string }
 *                             companyId: { type: integer }
 *                             isCompanyAdmin: { type: boolean }
 *       401:
 *         description: Wrong email or password.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post('/admin/login', validate(schema.login), controller.adminLogin);
router.post('/refresh', validate(schema.refresh), controller.refresh);

// Authenticated - works for both portals
/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Shared]
 *     summary: The signed-in account, its permissions and its menus
 *     description: |
 *       What a console renders its sidebar and its permission checks from. Works
 *       with either kind of token and answers for whichever one was sent.
 *
 *       For an admin token the menu list is already filtered: entries the plan
 *       does not pay for are absent, so a console never has to decide what to
 *       hide.
 *     responses:
 *       200:
 *         description: The account, its permission map and its menu tree.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { type: object }
 *                         permissions:
 *                           type: object
 *                           description: Keyed by menu slug, each with canView/canCreate/canEdit/canDelete/canExport.
 *                         menus: { type: array, items: { type: object } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', authenticate, controller.me);
router.patch('/profile', authenticate, validate(schema.updateProfile), controller.updateProfile);
router.post('/change-password', authenticate, validate(schema.changePassword), controller.changePassword);
router.post('/logout', authenticate, controller.logout);

module.exports = router;
