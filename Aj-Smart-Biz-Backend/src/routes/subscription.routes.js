'use strict';

const router = require('express').Router();
const controller = require('../controllers/subscription.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/subscription.validator');
const master = require('../validators/master.validator');

/* Console: every company's plan, in one list. */
router.get('/', validate(schema.list), controller.list);
router.get('/summary', controller.summary);
router.post('/run-due', controller.runDue);

router.get('/:id', validate(master.idParam), controller.getById);
router.get('/:id/events', validate(schema.events), controller.listEvents);

/* Transitions. The generic route is guarded by the same matrix as the shortcuts. */
router.post('/:id/transition', validate(schema.transition), controller.transition);
router.post('/:id/suspend', validate(master.idParam), controller.suspend);
router.post('/:id/resume', validate(master.idParam), controller.resume);
router.post('/:id/cancel', validate(master.idParam), controller.cancel);
router.post('/:id/expire', validate(master.idParam), controller.expire);
router.post('/:id/start-now', validate(master.idParam), controller.startNow);
router.post('/:id/reactivate', validate(schema.reactivate), controller.reactivate);
router.post('/:id/extend', validate(schema.extend), controller.extend);
router.patch('/:id/auto-renew', validate(schema.autoRenew), controller.autoRenew);

module.exports = router;
