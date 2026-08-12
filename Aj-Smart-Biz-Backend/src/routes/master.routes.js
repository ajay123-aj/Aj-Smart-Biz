'use strict';

const express = require('express');
const controller = require('../controllers/master.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/master.validator');
const { superAdminOnly } = require('../middlewares/auth');

/**
 * Master data is written by super admins only, but both portals read it
 * (branch forms need states, company forms need business types and themes),
 * so the read routes stay open to any authenticated user.
 */
const buildRouter = ({ handlers, createSchema, updateSchema }) => {
  const router = express.Router();

  router.get('/', validate(schema.listQuery), handlers.list);
  router.get('/dropdown', handlers.dropdown);
  router.get('/:id', validate(schema.idParam), handlers.getById);

  router.post('/', superAdminOnly, validate(createSchema), handlers.create);
  router.put('/:id', superAdminOnly, validate(updateSchema), handlers.update);
  router.patch('/:id/status', superAdminOnly, validate(schema.statusBody), handlers.toggleStatus);
  router.delete('/:id', superAdminOnly, validate(schema.idParam), handlers.remove);
  router.post('/:id/restore', superAdminOnly, validate(schema.idParam), handlers.restore);

  return router;
};

const router = express.Router();

router.use('/states', buildRouter({
  handlers: controller.state,
  createSchema: schema.stateCreate,
  updateSchema: schema.stateUpdate,
}));

router.use('/business-types', buildRouter({
  handlers: controller.businessType,
  createSchema: schema.businessTypeCreate,
  updateSchema: schema.businessTypeUpdate,
}));

router.use('/themes', buildRouter({
  handlers: controller.theme,
  createSchema: schema.themeCreate,
  updateSchema: schema.themeUpdate,
}));

router.use('/plans', buildRouter({
  handlers: controller.plan,
  createSchema: schema.planCreate,
  updateSchema: schema.planUpdate,
}));

module.exports = router;
