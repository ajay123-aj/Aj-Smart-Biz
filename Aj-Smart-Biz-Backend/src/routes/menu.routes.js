'use strict';

const router = require('express').Router();
const controller = require('../controllers/menu.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/identity.validator');
const master = require('../validators/master.validator');
const { requirePermission } = require('../middlewares/auth');

const MENU = 'menu-permission';

router.get('/', requirePermission(MENU, 'canView'), validate(master.listQuery), controller.list);
router.get('/tree', controller.tree);
router.post('/', requirePermission(MENU, 'canCreate'), validate(schema.menuCreate), controller.create);
router.get('/:id', requirePermission(MENU, 'canView'), validate(master.idParam), controller.getById);
router.put('/:id', requirePermission(MENU, 'canEdit'), validate(schema.menuUpdate), controller.update);
router.delete('/:id', requirePermission(MENU, 'canDelete'), validate(master.idParam), controller.remove);

module.exports = router;
