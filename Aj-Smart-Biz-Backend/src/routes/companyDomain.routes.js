'use strict';

/**
 * Mounted twice: under `/companies/:companyId/domains` for the super admin
 * portal and under `/my-company/domains` for the company admin portal.
 */
const router = require('express').Router({ mergeParams: true });
const controller = require('../controllers/companyDomain.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/company.validator');
const master = require('../validators/master.validator');

router.get('/', controller.list);
router.post('/', validate(schema.domainCreate), controller.create);
router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.domainUpdate), controller.update);
router.patch('/:id/status', validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', validate(master.idParam), controller.remove);

module.exports = router;
