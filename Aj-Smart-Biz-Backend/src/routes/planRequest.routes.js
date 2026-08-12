'use strict';

const router = require('express').Router();
const controller = require('../controllers/planRequest.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/planRequest.validator');

/* Platform side: the queue of tenants asking to move plan. */
router.get('/', validate(schema.list), controller.list);
router.post('/:id/approve', validate(schema.approve), controller.approve);
router.post('/:id/reject', validate(schema.reject), controller.reject);

module.exports = router;
