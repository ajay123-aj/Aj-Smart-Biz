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

// Permission matrix for a role
router.get('/:roleId/permissions', requirePermission(PERMISSION_MENU, 'canView'), controller.getPermissions);
router.put(
  '/:roleId/permissions',
  requirePermission(PERMISSION_MENU, 'canEdit'),
  validate(schema.permissionSync),
  controller.syncPermissions
);

module.exports = router;
