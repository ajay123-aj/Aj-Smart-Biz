'use strict';

/**
 * Optional functionality for one tenant: the on/off switches and their
 * settings, plus the typed WhatsApp numbers the `whatsapp` feature publishes.
 *
 * Mounted under `/my-company/functionalities`, `/my-company/whatsapp-numbers`
 * and `/my-company/social-links`
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
const serviceCategoryController = require('../controllers/serviceCategory.controller');
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
 *       | `services` | Heading, lede, the button label, and the name the Services page carries in the website's menu. The services themselves are their own rows. |
 *       | `testimonials` | The static/dynamic mode, the headings, and the wording of the review form. |
 *       | `share_link` | Headline, message and which channels to offer. |
 *       | `products` | The three blocks of copy over the catalogue, the offers band and the categories band, plus the name the Products page carries in the menu. The products and categories are their own rows. |
 *       | `orders` | Where an order goes — `whatsapp`, `payment` or `none` — plus the cart's labels, what the customer is asked for, any minimum, and the UPI id or payment link. See `OrdersSettings`. |
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
 *           enum: [whatsapp, share_link, services, about_us, figures, team, gallery, contact_page, testimonials, features_benefits, products, orders]
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
 *               - $ref: '#/components/schemas/ProductsSettings'
 *               - $ref: '#/components/schemas/OrdersSettings'
 *           examples:
 *             team:
 *               summary: Rename the Team section
 *               value: { eyebrow: 'The people', title: 'Who you will actually be dealing with', lead: '' }
 *             gallery:
 *               summary: Rename the Gallery
 *               value: { eyebrow: 'Our work', title: 'A few jobs we are proud of' }
 *             orders:
 *               summary: Take orders on WhatsApp, with a minimum
 *               value: { mode: 'whatsapp', cart: true, whatsappType: 'orders', minOrderAmount: 500, requirePhone: true }
 *             ordersPayment:
 *               summary: Take payment directly, one product at a time
 *               value: { mode: 'payment', cart: false, upiId: 'yourshop@okaxis', payeeName: 'Your Shop' }
 *             ordersOff:
 *               summary: Switch ordering off and keep the setup
 *               value: { mode: 'none' }
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
 * The services a company sells. The same seven verbs as every other card list —
 * what it carries on top (a picture, a price line, a list of inclusions) is the
 * row's business, not the router's.
 */
const services = cardRouter(content.services, schema.serviceCreate, schema.serviceUpdate);

/**
 * Service categories.
 *
 * Not `cardRouter`, because a tree is not a list: the write routes go through
 * `serviceCategory.controller` for the three checks a schema cannot make - a
 * parent from another company, a cycle, and a tree pushed past its depth - and
 * its delete promotes the children rather than taking them with it.
 *
 * `/reorder` before `/:id`, or Express reads "reorder" as an id.
 */
const serviceCategories = express.Router({ mergeParams: true });
serviceCategories.get('/', validate(schema.serviceCategoryListQuery), serviceCategoryController.list);
serviceCategories.patch('/reorder', validate(schema.reorder), serviceCategoryController.reorder);
serviceCategories.post('/', validate(schema.serviceCategoryCreate), serviceCategoryController.create);
serviceCategories.put('/:id', validate(schema.serviceCategoryUpdate), serviceCategoryController.update);
serviceCategories.patch('/:id/status', validate(master.statusBody), serviceCategoryController.toggleStatus);
serviceCategories.delete('/:id', validate(master.idParam), serviceCategoryController.remove);

/**
 * The social profiles the website footer renders.
 *
 * `/reorder` before `/:id`, or Express reads "reorder" as an id — the same
 * ordering hazard every list here carries.
 */
const socialLinks = express.Router({ mergeParams: true });
socialLinks.get('/', validate(schema.socialListQuery), content.socialLinks.list);
socialLinks.patch('/reorder', validate(schema.socialReorder), content.socialLinks.reorder);
socialLinks.post('/', validate(schema.socialCreate), content.socialLinks.create);
socialLinks.put('/:id', validate(schema.socialUpdate), content.socialLinks.update);
socialLinks.patch('/:id/status', validate(master.statusBody), content.socialLinks.toggleStatus);
socialLinks.delete('/:id', validate(master.idParam), content.socialLinks.remove);

/**
 * Exported as separate routers rather than one: the caller mounts each under
 * its own path with its own guards, and an Express middleware attached to a
 * pathless `use` would otherwise run on every request to the parent router.
 */
module.exports = {
  serviceCategories,
  socialLinks,
  functionalities,
  whatsapp,
  about,
  contact,
  stats,
  team,
  gallery,
  testimonials,
  features,
  services,
};
