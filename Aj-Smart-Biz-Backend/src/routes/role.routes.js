'use strict';

const router = require('express').Router();
const controller = require('../controllers/role.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/identity.validator');
const master = require('../validators/master.validator');
const { requirePermission } = require('../middlewares/auth');

const MENU = 'role-management';
const PERMISSION_MENU = 'menu-permission';

router.get('/', requirePermission(MENU, 'canView'), validate(master.listQuery), controller.list);
router.get('/dropdown', controller.dropdown);
router.post('/', requirePermission(MENU, 'canCreate'), validate(schema.roleCreate), controller.create);
router.get('/:id', requirePermission(MENU, 'canView'), validate(master.idParam), controller.getById);
router.put('/:id', requirePermission(MENU, 'canEdit'), validate(schema.roleUpdate), controller.update);
router.patch('/:id/status', requirePermission(MENU, 'canEdit'), validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', requirePermission(MENU, 'canDelete'), validate(master.idParam), controller.remove);

/**
 * @openapi
 * /admin/roles/{id}/admins:
 *   get:
 *     tags: [Admin]
 *     summary: Admins and whether they hold this role
 *     description: Every admin except the main admin, with `holds` and `holdsAs` (`primary`, `extra` or null) and all their `roles`.
 *     responses:
 *       200: { description: Admins., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *   put:
 *     tags: [Admin]
 *     summary: Set which admins hold this role
 *     description: |
 *       `{ adminIds }` is the full list. Ticked admins gain the role as an extra
 *       role (primary if they had none); unticked admins lose it, and if it was
 *       their primary role their next role becomes primary. Refused when an
 *       admin would be left with no role. An admin's access is the union of all
 *       their active roles. Needs Edit on Role Management and on Admin Management.
 *     responses:
 *       200: { description: Saved., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/:id/admins', requirePermission(MENU, 'canView'), validate(master.idParam), controller.getAdmins);
router.put(
  '/:id/admins',
  requirePermission(MENU, 'canEdit'),
  requirePermission('admin-management', 'canEdit'),
  validate(schema.roleAdminsSync),
  controller.syncAdmins
);

// Permission matrix for a role
router.get('/:roleId/permissions', requirePermission(PERMISSION_MENU, 'canView'), controller.getPermissions);
router.put(
  '/:roleId/permissions',
  requirePermission(PERMISSION_MENU, 'canEdit'),
  validate(schema.permissionSync),
  controller.syncPermissions
);

module.exports = router;
