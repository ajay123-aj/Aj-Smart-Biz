'use strict';

/**
 * Mounted twice: under `/companies/:companyId/branches` for the super admin
 * portal and under `/my-company/branches` for the company admin portal.
 * `mergeParams` keeps `:companyId` reachable from the controller.
 */
const router = require('express').Router({ mergeParams: true });
const controller = require('../controllers/branch.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/company.validator');
const master = require('../validators/master.validator');

router.get('/', validate(master.listQuery), controller.list);
/** Before `/:id`, or "quota" would be read as a branch id. */
router.get('/quota', controller.branchQuota);
router.post('/', validate(schema.branchCreate), controller.create);
router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.branchUpdate), controller.update);
router.patch('/:id/status', validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', validate(master.idParam), controller.remove);

// Branch contacts
router.get('/:branchId/contacts', controller.listContacts);
router.post('/:branchId/contacts', validate(schema.contactCreate), controller.createContact);
router.put('/:branchId/contacts/:id', validate(schema.contactUpdate), controller.updateContact);
router.delete('/:branchId/contacts/:id', validate(master.idParam), controller.removeContact);

module.exports = router;
