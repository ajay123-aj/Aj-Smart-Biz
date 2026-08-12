'use strict';

const router = require('express').Router();
const controller = require('../controllers/superAdmin.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/identity.validator');
const master = require('../validators/master.validator');

router.get('/', validate(master.listQuery), controller.list);
router.post('/', validate(schema.superAdminCreate), controller.create);
router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.superAdminUpdate), controller.update);
router.patch('/:id/status', validate(master.statusBody), controller.toggleStatus);
router.patch('/:id/reset-password', validate(schema.superAdminResetPassword), controller.resetPassword);
router.delete('/:id', validate(master.idParam), controller.remove);

module.exports = router;
