'use strict';

/**
 * Mounted twice: under `/companies/:companyId/sliders` for the super admin
 * portal and under `/my-company/sliders` for the company admin portal.
 * `mergeParams` keeps `:companyId` reachable from the controller.
 *
 * Each verb carries its own permission rather than the whole router sharing
 * `canView`, so a role granted "view sliders" cannot create or delete one. The
 * check waves super admins and the tenant's main admin straight through, which
 * is why it is safe on the shared router.
 */
const router = require('express').Router({ mergeParams: true });
const controller = require('../controllers/slider.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/slider.validator');
const master = require('../validators/master.validator');
const { requirePermission } = require('../middlewares/auth');

const may = (action) => requirePermission('slider-management', action);

router.get('/', may('canView'), validate(schema.listQuery), controller.list);
/** Before `/:id`, or "reorder" would be read as a slide id. */
router.patch('/reorder', may('canEdit'), validate(schema.reorder), controller.reorder);
router.post('/', may('canCreate'), validate(schema.create), controller.create);
router.get('/:id', may('canView'), validate(master.idParam), controller.getById);
router.put('/:id', may('canEdit'), validate(schema.update), controller.update);
router.patch('/:id/status', may('canEdit'), validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', may('canDelete'), validate(master.idParam), controller.remove);

module.exports = router;
