'use strict';

const router = require('express').Router();
const controller = require('../controllers/company.controller');
const branchRoutes = require('./branch.routes');
const domainRoutes = require('./companyDomain.routes');
const sliderRoutes = require('./slider.routes');
const subscriptionController = require('../controllers/subscription.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/company.validator');
const subscriptionSchema = require('../validators/subscription.validator');
const master = require('../validators/master.validator');

router.get('/', validate(schema.companyList), controller.list);
router.post('/', validate(schema.companyCreate), controller.create);

router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.companyUpdate), controller.update);
router.patch('/:id/status', validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', validate(master.idParam), controller.remove);
router.post('/:id/restore', validate(master.idParam), controller.restore);

// Plans & billing
router.get('/:id/plan', validate(master.idParam), subscriptionController.companyPlan);
router.get('/:id/subscriptions', validate(master.idParam), controller.listSubscriptions);
router.post('/:id/subscriptions', validate(schema.subscriptionCreate), controller.assignPlan);

// Renewal (immediate or queued ahead of the current term) and plan changes.
// These sit before `/:subscriptionId/...` so the literal paths win the match.
router.post('/:id/subscriptions/renew', validate(subscriptionSchema.renew), subscriptionController.renew);
router.post(
  '/:id/subscriptions/change-plan',
  validate(subscriptionSchema.changePlan),
  subscriptionController.changePlan
);
router.get(
  '/:id/subscriptions/change-preview',
  validate(subscriptionSchema.changePreview),
  subscriptionController.changePreview
);

router.post('/:id/subscriptions/:subscriptionId/cancel', controller.cancelSubscription);
router.get('/:id/transactions', validate(schema.transactionList), controller.listTransactions);
router.post('/:id/transactions', validate(schema.transactionCreate), controller.createTransaction);

// Branches and domains of a company
router.use('/:companyId/branches', branchRoutes);
router.use('/:companyId/domains', domainRoutes);
router.use('/:companyId/sliders', sliderRoutes);

module.exports = router;
