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
/**
 * @openapi
 * /admin/company/functionalities/{key}/settings:
 *   put:
 *     tags: [Admin]
 *     summary: Save one functionality's settings
 *     description: |
 *       The configuration that belongs to a feature as a whole rather than to
 *       any one row in it. What the body may contain depends entirely on `key`,
 *       and each shape is validated separately — a body that fits one
 *       functionality is refused for another.
 *
 *       | key | What it stores |
 *       | --- | --- |
 *       | `team` | The words above the Team section — `eyebrow`, `title`, `lead`. See `TeamSectionCopy`. |
 *       | `gallery` | The same three for the Gallery. See `GallerySectionCopy`. |
 *       | `features_benefits` | Heading, lede and the button label. The cards are their own rows. |
 *       | `testimonials` | The static/dynamic mode, the headings, and the wording of the review form. |
 *       | `share_link` | Headline, message and which channels to offer. |
 *       | `whatsapp`, `about_us`, `contact_page` | Nothing — their configuration lives elsewhere. A body is refused. |
 *
 *       **Blank means "use the platform's wording".** Every copy field is
 *       optional and may be sent empty; the read path fills anything blank with
 *       the default, so clearing a field is how a tenant goes back rather than
 *       how it ends up with a section that has no heading.
 *
 *       Requires the plan to *grant* the functionality — not for it to be
 *       switched on. A company whose plan includes Team must still be able to
 *       fix a typo while the section is off, or while its plan is suspended.
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *           enum: [whatsapp, share_link, about_us, team, gallery, contact_page, testimonials, features_benefits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/TeamSectionCopy'
 *               - $ref: '#/components/schemas/GallerySectionCopy'
 *               - $ref: '#/components/schemas/TestimonialsSettings'
 *               - $ref: '#/components/schemas/ShareLinkSettings'
 *           examples:
 *             team:
 *               summary: Rename the Team section
 *               value: { eyebrow: 'The people', title: 'Who you will actually be dealing with', lead: '' }
 *             gallery:
 *               summary: Rename the Gallery
 *               value: { eyebrow: 'Our work', title: 'A few jobs we are proud of' }
 *     responses:
 *       200:
 *         description: Saved. Returns the functionality with its settings resolved.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiSuccess' }
 *       400:
 *         description: The body did not match this key's schema, or the plan does not grant it.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
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
 * The card lists behind About, Team, Gallery and Features / Benefits. Identical
 * shape, so they are built the same way — see `cardResource.factory`.
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

/**
 * Testimonials: the card list, plus the two verbs a moderated list needs that
 * the others do not. Built by hand rather than through `cardRouter` because its
 * `list` takes different filters and its `create` is wrapped — see the
 * controller — and because `/:id/moderation` has no equivalent anywhere else.
 */
const testimonials = express.Router({ mergeParams: true });
testimonials.get('/', validate(schema.testimonialListQuery), content.testimonials.list);
/** Before `/:id`, or "reorder" would be read as an id. */
testimonials.patch('/reorder', validate(schema.reorder), content.testimonials.reorder);
testimonials.post('/', validate(schema.testimonialCreate), content.testimonials.create);
testimonials.put('/:id', validate(schema.testimonialUpdate), content.testimonials.update);
/** Approve or reject — the one gate between a stranger's typing and the website. */
testimonials.patch('/:id/moderation', validate(schema.testimonialModerate), content.testimonials.moderate);
testimonials.patch('/:id/status', validate(master.statusBody), content.testimonials.toggleStatus);
testimonials.delete('/:id', validate(master.idParam), content.testimonials.remove);

const stats = cardRouter(content.stats, schema.statCreate, schema.statUpdate);
const team = cardRouter(content.team, schema.teamCreate, schema.teamUpdate);
const gallery = cardRouter(content.gallery, schema.galleryCreate, schema.galleryUpdate);
const features = cardRouter(content.features, schema.featureCreate, schema.featureUpdate);

/**
 * Exported as separate routers rather than one: the caller mounts each under
 * its own path with its own guards, and an Express middleware attached to a
 * pathless `use` would otherwise run on every request to the parent router.
 */
module.exports = {
  functionalities,
  whatsapp,
  about,
  contact,
  stats,
  team,
  gallery,
  testimonials,
  features,
};
