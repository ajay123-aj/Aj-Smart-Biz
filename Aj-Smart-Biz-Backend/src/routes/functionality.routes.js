'use strict';

/**
 * Optional functionality for one tenant: the on/off switches and their
 * settings, plus the typed WhatsApp numbers the `whatsapp` feature publishes.
 *
 * Mounted under `/my-company/functionalities` and `/my-company/whatsapp-numbers`
 * with `mergeParams`, so the same router could be hung off a super-admin
 * `/companies/:companyId/...` path later without changing the controller.
 *
 * Reading is open to anyone with the Company Details menu — the switches sit on
 * a tab of that screen. Writing changes what the tenant publishes to the public
 * internet, so it is restricted to the main admin, exactly as the domain
 * manager is: `PUT /my-company` and the domain routes follow the same rule.
 */
const express = require('express');
const controller = require('../controllers/functionality.controller');
const content = require('../controllers/websiteContent.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/functionality.validator');
const master = require('../validators/master.validator');

const functionalities = express.Router({ mergeParams: true });
functionalities.get('/', controller.list);
functionalities.get('/:key', validate(schema.keyParam), controller.getByKey);
functionalities.patch('/:key/status', validate(schema.toggle), controller.toggleStatus);
functionalities.put('/:key/settings', validate(schema.settings), controller.updateSettings);

const whatsapp = express.Router({ mergeParams: true });
whatsapp.get('/', validate(schema.whatsappListQuery), controller.listNumbers);
/** Before `/:id`, or "reorder" would be read as a number's id. */
whatsapp.patch('/reorder', validate(schema.whatsappReorder), controller.reorderNumbers);
whatsapp.post('/', validate(schema.whatsappCreate), controller.createNumber);
whatsapp.put('/:id', validate(schema.whatsappUpdate), controller.updateNumber);
whatsapp.patch('/:id/status', validate(master.statusBody), controller.toggleNumberStatus);
whatsapp.delete('/:id', validate(master.idParam), controller.removeNumber);

/**
 * The three card lists behind About, Team and Gallery. Identical shape, so they
 * are built the same way — see `cardResource.factory`.
 */
const cardRouter = (handlers, createSchema, updateSchema) => {
  const router = express.Router({ mergeParams: true });
  router.get('/', validate(schema.cardListQuery), handlers.list);
  /** Before `/:id`, or "reorder" would be read as an id. */
  router.patch('/reorder', validate(schema.reorder), handlers.reorder);
  router.post('/', validate(createSchema), handlers.create);
  router.put('/:id', validate(updateSchema), handlers.update);
  router.patch('/:id/status', validate(master.statusBody), handlers.toggleStatus);
  router.delete('/:id', validate(master.idParam), handlers.remove);
  return router;
};

/**
 * The About prose. Not a card list — one row per scope — so it has its own
 * three verbs rather than going through `cardRouter`.
 */
const about = express.Router({ mergeParams: true });
about.get('/', validate(schema.aboutQuery), content.getAbout);
about.put('/', validate(schema.aboutSave), content.saveAbout);
/** Drops a branch's override so it inherits the company-wide copy again. */
about.delete('/', validate(schema.aboutQuery), content.clearAbout);

/**
 * The Contact page settings. One row per scope like About, so it has its own
 * three verbs rather than going through `cardRouter`. The `contact_page` grant
 * is checked in the controller, on the writes only.
 */
const contact = express.Router({ mergeParams: true });
contact.get('/', validate(schema.contactQuery), content.getContact);
contact.put('/', validate(schema.contactSave), content.saveContact);
contact.delete('/', validate(schema.contactQuery), content.clearContact);

const stats = cardRouter(content.stats, schema.statCreate, schema.statUpdate);
const team = cardRouter(content.team, schema.teamCreate, schema.teamUpdate);
const gallery = cardRouter(content.gallery, schema.galleryCreate, schema.galleryUpdate);

/**
 * Exported as separate routers rather than one: the caller mounts each under
 * its own path with its own guards, and an Express middleware attached to a
 * pathless `use` would otherwise run on every request to the parent router.
 */
module.exports = { functionalities, whatsapp, about, contact, stats, team, gallery };
