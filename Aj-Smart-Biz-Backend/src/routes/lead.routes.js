'use strict';

/**
 * Lead management, for both consoles.
 *
 * Two routers over one controller, because the routes are the same shape and
 * only the guard differs — the controller scopes every query from the token, so
 * there is no request a company admin can make that reaches another tenant's
 * leads. Splitting them here rather than branching inside the controller keeps
 * the mounting explicit at `routes/index.js`, which is where the reader looks
 * to find out who can reach what.
 *
 * `/analytics` and `/summary` are declared before `/:id` in both. Express
 * matches in order, so the other way round "analytics" would be read as a lead
 * id and answered with a 400 from the id validator.
 */
const express = require('express');
const controller = require('../controllers/lead.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/lead.validator');
const { requirePermission } = require('../middlewares/auth');

/**
 * The tenant's own leads, mounted under `/my-company/leads`.
 *
 * Reads need `canView` on the Lead Management menu; moving a lead along its
 * stages needs `canEdit`. That is the same split the rest of the console uses,
 * and it is what lets a company give its sales staff the list without also
 * giving them the ability to rewrite it.
 */
const admin = express.Router({ mergeParams: true });

admin.get('/', requirePermission('lead-management', 'canView'), validate(schema.list), controller.list);
admin.get('/summary', requirePermission('lead-management', 'canView'), validate(schema.list), controller.summary);
admin.get(
  '/analytics',
  requirePermission('lead-management', 'canView'),
  validate(schema.analytics),
  controller.analytics
);
admin.get('/:id', requirePermission('lead-management', 'canView'), validate(schema.detail), controller.detail);
admin.get('/:id/visits', requirePermission('lead-management', 'canView'), validate(schema.visits), controller.visits);
admin.patch('/:id', requirePermission('lead-management', 'canEdit'), validate(schema.update), controller.update);

/**
 * Every tenant's leads, mounted under `/leads`.
 *
 * Already behind `superAdminOnly` where it is mounted, so no per-route guard —
 * the platform console has no permission matrix of its own. `?companyId=`
 * narrows it; without one the list and the analytics span the whole platform,
 * which is what the company-wise breakdown is for.
 */
const superAdmin = express.Router();

superAdmin.get('/', validate(schema.superList), controller.list);
superAdmin.get('/summary', validate(schema.superList), controller.summary);
superAdmin.get('/analytics', validate(schema.analytics), controller.analytics);
superAdmin.get('/:id', validate(schema.detail), controller.detail);
superAdmin.get('/:id/visits', validate(schema.visits), controller.visits);

module.exports = { admin, superAdmin };
