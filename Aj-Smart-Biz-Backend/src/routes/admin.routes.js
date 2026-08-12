'use strict';

const router = require('express').Router();
const controller = require('../controllers/admin.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/identity.validator');
const master = require('../validators/master.validator');
const { requirePermission } = require('../middlewares/auth');

const MENU = 'admin-management';

router.get('/', requirePermission(MENU, 'canView'), validate(schema.adminList), controller.list);
/** Before `/:id`, or "quota" would be read as an admin id. */
router.get('/quota', requirePermission(MENU, 'canView'), controller.adminQuota);
router.post('/', requirePermission(MENU, 'canCreate'), validate(schema.adminCreate), controller.create);
router.get('/:id', requirePermission(MENU, 'canView'), validate(master.idParam), controller.getById);
router.put('/:id', requirePermission(MENU, 'canEdit'), validate(schema.adminUpdate), controller.update);
router.patch('/:id/status', requirePermission(MENU, 'canEdit'), validate(master.statusBody), controller.toggleStatus);
router.patch(
  '/:id/reset-password',
  requirePermission(MENU, 'canEdit'),
  validate(schema.adminResetPassword),
  controller.resetPassword
);
router.delete('/:id', requirePermission(MENU, 'canDelete'), validate(master.idParam), controller.remove);

module.exports = router;
