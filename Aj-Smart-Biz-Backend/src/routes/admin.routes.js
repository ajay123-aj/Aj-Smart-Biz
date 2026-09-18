'use strict';

/**
 * Mounted twice: under `/admin/admins` for the company workspace, and under
 * `/super-admin/companies/:companyId/admins` for the platform console — the
 * same pairing branches, domains and sliders already use.
 *
 * `mergeParams` is what carries `:companyId` through to the controller, which
 * reads it only for a super-admin token; an admin token is pinned to its own
 * tenant regardless of what the path says. `requirePermission` lets a super
 * admin straight through, so the tenant's own menu matrix stays the gate for
 * the tenant's own staff and nothing more.
 */
const router = require('express').Router({ mergeParams: true });
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
