'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const cardResource = require('./cardResource.factory');
const { assertOfferIsAnOffer } = require('./catalogue.controller');
const functionalityService = require('../services/functionality.service');
const {
  AUTH_SCOPE,
  FUNCTIONALITY,
  STATUS,
  TESTIMONIAL_SOURCE,
  TESTIMONIAL_MODERATION,
} = require('../constants');

/**
 * The website content a tenant writes: the band of figures, the Team section,
 * the Gallery and the Features / Benefits cards.
 *
 * All of them are ordered lists of cards the company adds, edits, reorders and
 * deletes, so all of them are the same factory with a different model — see
 * `cardResource.factory`. The About section's *prose* is not here: it is a
 * singleton blob, so it rides on the functionality's own `settings` and is
 * saved through `PUT /my-company/functionalities/about_us/settings`. The
 * Features section's heading works the same way.
 */

/*
 * Gated on `figures` rather than `about_us`: the band is its own functionality,
 * bought and switched on separately, and it is shown in places the About page's
 * copy never reaches — the home page most of all.
 */
const stats = cardResource({
  model: db.CompanyStat,
  functionality: FUNCTIONALITY.FIGURES,
  label: 'Figure',
  searchFields: ['label'],
});

const team = cardResource({
  model: db.CompanyTeamMember,
  functionality: FUNCTIONALITY.TEAM,
  label: 'Team member',
  searchFields: ['name', 'role'],
  imageFields: ['photo'],
});

const gallery = cardResource({
  model: db.CompanyGalleryItem,
  functionality: FUNCTIONALITY.GALLERY,
  label: 'Gallery image',
  searchFields: ['title', 'caption'],
  imageFields: ['image'],
});

/**
 * The Features / Benefits cards — what the business offers, and what each one
 * is worth to the person reading.
 *
 * Nothing special: it is the plainest card list of the set, which is the point.
 * The section used to be six paragraphs of template copy identical on every
 * site the platform served; this is what makes it the tenant's, and it needed
 * no machinery the About stat band did not already have.
 *
 * No `imageFields`: a card's picture is a glyph chosen by name from
 * `FEATURE_ICONS`, not an upload, so there is no file to clean up when one is
 * swapped for another.
 */
const features = cardResource({
  model: db.CompanyFeature,
  functionality: FUNCTIONALITY.FEATURES,
  label: 'Benefit',
  searchFields: ['title', 'body'],
});

/**
 * The services a company sells.
 *
 * `imageFields` is what makes this different from the benefit cards next to it:
 * a service may carry a photograph, so a replaced picture has a file to clean
 * up — the same bargain Team and Gallery make. The icon needs no such handling,
 * being a name rather than an upload.
 */
const services = cardResource({
  model: db.CompanyService,
  functionality: FUNCTIONALITY.SERVICES,
  label: 'Service',
  searchFields: ['title', 'summary'],
  imageFields: ['image'],
  /**
   * A service has a page of its own now, so it needs an address. Built from the
   * title and never rewritten when the title changes - see the factory.
   */
  slugFrom: 'title',
  /** A service may only be filed under one of its own company's categories. */
  owned: [{ field: 'categoryId', model: () => db.CompanyServiceCategory, label: 'category' }],
  include: [
    { model: db.CompanyServiceCategory, as: 'category', attributes: ['id', 'name', 'slug'], required: false },
  ],
  /**
   * An offer has to be below the price, checked against the **stored** row.
   *
   * The schema catches a body carrying both numbers; a body carrying only one -
   * "put this on offer at 1,999", against a price already saved - has nothing to
   * compare until the row is loaded. The same function the catalogue uses, so a
   * service and a product cannot disagree about what an offer is.
   */
  check: (patch, row) => assertOfferIsAnOffer(row ?? {}, patch),
});

/**
 * How a business sorts the work it sells.
 *
 * A card list rather than the catalogue's tree controller, with one addition the
 * factory now provides: a slug, because a category is a filter with an address -
 * `/services?category=bridal`. The *nesting* is a `parentId` on the row, checked
 * by `serviceCategory.controller`, which is what this router's write routes go
 * through for the checks a schema cannot make: a parent from another company, a
 * parent that is the row's own descendant, and a tree pushed past its depth.
 */
const serviceCategories = cardResource({
  model: db.CompanyServiceCategory,
  functionality: FUNCTIONALITY.SERVICES,
  label: 'Service category',
  searchFields: ['name', 'description'],
  imageFields: ['image'],
  slugFrom: 'name',
});

/**
 * Testimonials are a card list like the other three — added, edited, reordered
 * and deleted the same way — so they come from the same factory. What they have
 * on top is a moderation queue, because half the rows are written by strangers;
 * that is `listTestimonials` and `moderateTestimonial` below, not something the
 * factory should learn about for one caller.
 *
 * `create` here is the console's own route, so the row is the company's own
 * copy: `source: admin`, published on sight. A visitor's review is created by
 * `POST /public/testimonials` instead, which is the only writer that can
 * produce `source: visitor` and always parks it as `pending`.
 */
const testimonialCards = cardResource({
  model: db.CompanyTestimonial,
  functionality: FUNCTIONALITY.TESTIMONIALS,
  label: 'Testimonial',
  searchFields: ['authorName', 'authorRole', 'body'],
  imageFields: ['photo'],
});

/* ------------------------------------------------------------------ *
 * About copy
 * ------------------------------------------------------------------ */

const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

/**
 * `?branchId=` names the scope being edited: absent or `none` is the
 * company-wide copy, an id is that branch's own. Deliberately explicit — an
 * admin editing "Surat" must not silently overwrite the company-wide copy.
 */
const scopeOf = async (req, companyId) => {
  const raw = req.query.branchId ?? req.body?.branchId;
  if (raw === undefined || raw === null || raw === '' || raw === 'none' || raw === 'null') return null;

  const branchId = Number(raw);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest('A valid branchId is required');

  const branch = await db.Branch.findOne({ where: { id: branchId, companyId }, attributes: ['id'] });
  if (!branch) throw ApiError.badRequest('That branch does not belong to this company');
  return branch.id;
};

/**
 * GET /my-company/about[?branchId=]
 *
 * The copy for one scope, and — when a branch is asked for — whether that
 * branch has any of its own. The console shows that plainly: a branch with no
 * row of its own is *inheriting* the company-wide copy, not sitting empty, and
 * saying so is the difference between "nothing here" and "the same as everyone".
 */
const getAbout = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const branchId = await scopeOf(req, companyId);

  const [own, companyWide, branches] = await Promise.all([
    branchId ? db.CompanyAbout.findOne({ where: { companyId, branchId } }) : null,
    db.CompanyAbout.findOne({ where: { companyId, branchId: null } }),
    db.Branch.findAll({ where: { companyId }, attributes: ['id', 'name', 'code'], order: [['isMain', 'DESC'], ['name', 'ASC']] }),
  ]);

  const row = branchId ? own : companyWide;

  return success(res, {
    message: 'About copy fetched successfully',
    data: {
      branchId,
      /** False when this branch is inheriting rather than overriding. */
      overridden: branchId ? Boolean(own) : true,
      copy: functionalityService.aboutCopy(row),
      /** What the site would show here if the branch override were removed. */
      inherited: branchId ? functionalityService.aboutCopy(companyWide) : null,
      branches,
    },
  });
});

/** PUT /my-company/about[?branchId=] — replaces the copy for that one scope. */
const saveAbout = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.ABOUT_US);

  const branchId = await scopeOf(req, companyId);
  const { navLabel = null, eyebrow = null, title = null, lead = null, body = null } = req.body ?? {};

  // findOrCreate on (company, branch) is what keeps this to one row per scope;
  // the table carries no unique index because it is paranoid like the rest.
  const [row] = await db.CompanyAbout.findOrCreate({
    where: { companyId, branchId },
    defaults: { companyId, branchId, createdBy: req.auth?.id ?? null },
  });
  await row.update({ navLabel, eyebrow, title, lead, body, updatedBy: req.auth?.id ?? null });

  return success(res, {
    message: branchId ? 'Branch About copy saved' : 'About copy saved',
    data: { branchId, overridden: true, copy: functionalityService.aboutCopy(row) },
  });
});

/**
 * DELETE /my-company/about?branchId=
 *
 * Drops a branch's override so it goes back to inheriting the company-wide
 * copy. Refused without a branch: there is nothing above the company-wide copy
 * to fall back to, and deleting it would leave the page with the template's
 * defaults rather than anything the tenant wrote.
 */
const clearAbout = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.ABOUT_US);

  const branchId = await scopeOf(req, companyId);
  if (!branchId) throw ApiError.badRequest('Pick a branch — the company-wide copy has nothing to fall back to');

  const row = await db.CompanyAbout.findOne({ where: { companyId, branchId } });
  if (row) await row.destroy();

  return success(res, {
    message: 'Branch now inherits the company-wide About copy',
    data: { branchId, overridden: false },
  });
});

/* ------------------------------------------------------------------ *
 * Contact page
 * ------------------------------------------------------------------ */

/**
 * The Contact page, gated by `contact_page` on the same rule as About, Team and
 * Gallery: the plan has to include it and the tenant has to have it switched on
 * before the page is served at all.
 *
 * Reading stays open, as it does for the other three. A tenant that has
 * downgraded should still be able to see the wording it wrote and get it back
 * by upgrading, rather than opening the screen to blank fields.
 *
 * What is on the page — addresses, phone numbers, opening hours — still comes
 * from the company profile and its branches. This only decides the wording and
 * which blocks appear.
 */

/** GET /my-company/contact[?branchId=] */
const getContact = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const branchId = await scopeOf(req, companyId);

  const [own, companyWide, branches] = await Promise.all([
    branchId ? db.CompanyContact.findOne({ where: { companyId, branchId } }) : null,
    db.CompanyContact.findOne({ where: { companyId, branchId: null } }),
    db.Branch.findAll({
      where: { companyId },
      attributes: ['id', 'name', 'code'],
      order: [['isMain', 'DESC'], ['name', 'ASC']],
    }),
  ]);

  const row = branchId ? own : companyWide;

  return success(res, {
    message: 'Contact settings fetched successfully',
    data: {
      branchId,
      /** False when this branch is inheriting rather than overriding. */
      overridden: branchId ? Boolean(own) : true,
      settings: functionalityService.contactSettings(row),
      inherited: branchId ? functionalityService.contactSettings(companyWide) : null,
      branches,
    },
  });
});

/** PUT /my-company/contact[?branchId=] — replaces the settings for that scope. */
const saveContact = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.CONTACT_PAGE);

  const branchId = await scopeOf(req, companyId);

  const {
    navLabel = null,
    eyebrow = null,
    title = null,
    lead = null,
    showForm,
    formTarget,
    formNote = null,
    showLocations,
  } = req.body ?? {};

  const [row] = await db.CompanyContact.findOrCreate({
    where: { companyId, branchId },
    defaults: { companyId, branchId, createdBy: req.auth?.id ?? null },
  });

  await row.update({
    navLabel,
    eyebrow,
    title,
    lead,
    // The booleans have column defaults, so only overwrite what was actually
    // sent — a partial save must not silently switch the form off.
    ...(showForm === undefined ? {} : { showForm }),
    ...(formTarget === undefined ? {} : { formTarget }),
    formNote,
    ...(showLocations === undefined ? {} : { showLocations }),
    updatedBy: req.auth?.id ?? null,
  });

  return success(res, {
    message: branchId ? 'Branch contact settings saved' : 'Contact settings saved',
    data: { branchId, overridden: true, settings: functionalityService.contactSettings(row) },
  });
});

/** DELETE /my-company/contact?branchId= — back to inheriting. */
const clearContact = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.CONTACT_PAGE);

  const branchId = await scopeOf(req, companyId);
  if (!branchId) throw ApiError.badRequest('Pick a branch — the company-wide settings have nothing to fall back to');

  const row = await db.CompanyContact.findOne({ where: { companyId, branchId } });
  if (row) await row.destroy();

  return success(res, {
    message: 'Branch now inherits the company-wide contact settings',
    data: { branchId, overridden: false },
  });
});

/* ------------------------------------------------------------------ *
 * Testimonials
 * ------------------------------------------------------------------ */

/**
 * The list, plus the counts the screen is built around.
 *
 * The factory's own `list` would do for the rows, but the Testimonials screen
 * is a queue before it is a list, and it differs from Team and Gallery in two
 * ways the factory has no business learning for one caller:
 *
 *  - **It counts.** The first thing the screen has to show is how many reviews
 *    are waiting on someone. Sending the counts with the rows keeps it to one
 *    request and, more to the point, keeps the badge honest — a count the
 *    browser derives from a filtered list is a count of that filter, and would
 *    read zero on the very tab that needed it.
 *  - **It pages.** The other card lists are short and hand-ordered, and a
 *    tenant edits them whole. This one is fed by the public internet: a busy
 *    site accumulates reviews for as long as it stays up, and a screen that
 *    fetched every one of them would get slower every month it worked.
 *
 * The counts stay in `data` and the page in `meta`, which is what each of them
 * is: the counts describe the tenant, `meta` describes this page of this query.
 * So `paginated()` is not used here — it puts the rows *as* the payload, and
 * the payload has to carry the counts.
 *
 * Ordered newest-first by default, unlike the other three. A queue is read from
 * the top, and `sequence` is meaningless for a review nobody has placed on the
 * wall yet. Wall order is available through `?sortBy=sequence` for the screen
 * that arranges a static wall; `static` mode's hand-ordering is applied when
 * the wall is *published*, by `publicTestimonials`, not here.
 */
const listTestimonials = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };
  if (req.query.branchId === 'none' || req.query.branchId === 'null') scope.branchId = null;
  else if (req.query.branchId) scope.branchId = Number(req.query.branchId);

  const where = mergeWhere(
    scope,
    req.query.moderation ? { moderation: req.query.moderation } : null,
    req.query.source ? { source: req.query.source } : null,
    req.query.status ? { status: req.query.status } : null,
    /**
     * The review itself is searchable, not only the name on it. A tenant
     * looking for "the one about the delivery" has the words, not the author.
     */
    buildSearch(req.query.search, ['authorName', 'authorRole', 'body'])
  );

  const [result, pending, approved, rejected] = await Promise.all([
    db.CompanyTestimonial.findAndCountAll({
      where,
      include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false }],
      order: getSort(
        req.query,
        ['created_at', 'sequence', 'rating', 'author_name'],
        [['createdAt', 'DESC'], ['id', 'DESC']]
      ),
      limit,
      offset,
      distinct: true,
    }),
    /** Always the whole scope, never the filter — see the note above. */
    db.CompanyTestimonial.count({ where: { ...scope, moderation: TESTIMONIAL_MODERATION.PENDING } }),
    db.CompanyTestimonial.count({ where: { ...scope, moderation: TESTIMONIAL_MODERATION.APPROVED } }),
    db.CompanyTestimonial.count({ where: { ...scope, moderation: TESTIMONIAL_MODERATION.REJECTED } }),
  ]);

  return success(res, {
    message: 'Testimonial list fetched successfully',
    data: { items: result.rows, counts: { pending, approved, rejected } },
    meta: {
      total: result.count,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(result.count / limit) : 1,
      hasNext: limit > 0 && page * limit < result.count,
    },
  });
});

/**
 * PATCH /my-company/testimonials/:id/moderation
 *
 * Approve or reject one review. This is the only thing standing between a
 * stranger's typing and a tenant's public website, so it is a route of its own
 * rather than a field on the general update: it is the action the screen
 * actually performs, and it is the one worth having a trail for.
 *
 * Approving appends to the end of the wall. That only matters in `static` mode,
 * where the order is the company's own — `dynamic` orders by recency and
 * ignores `sequence` entirely — but it costs nothing and means a company that
 * switches modes later finds its reviews in a sensible order rather than all
 * sharing position zero.
 *
 * Rejecting is not deleting. The row stays, out of the public payload and out
 * of the way, so a tenant can look again at what it turned down — and so the
 * same person resubmitting is visible rather than looking like a first offence.
 */
const moderateTestimonial = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.TESTIMONIALS);

  const row = await db.CompanyTestimonial.findOne({ where: { id: req.params.id, companyId } });
  if (!row) throw ApiError.notFound('Testimonial not found');

  const { moderation } = req.body;
  const patch = {
    moderation,
    moderatedAt: new Date(),
    moderatedBy: req.auth?.id ?? null,
    updatedBy: req.auth?.id ?? null,
  };

  // Only on the way in, and only once: a re-approval must not shuffle a review
  // the company has already placed on its wall by hand.
  if (moderation === TESTIMONIAL_MODERATION.APPROVED && !row.sequence) {
    const max = await db.CompanyTestimonial.max('sequence', {
      where: { companyId, branchId: row.branchId ?? null },
    });
    patch.sequence = (max || 0) + 1;
  }

  await row.update(patch);

  return success(res, {
    message:
      moderation === TESTIMONIAL_MODERATION.APPROVED
        ? 'Testimonial published'
        : moderation === TESTIMONIAL_MODERATION.REJECTED
          ? 'Testimonial rejected — it stays here but is not published'
          : 'Testimonial moved back to pending',
    data: { id: row.id, moderation, sequence: row.sequence },
  });
});

/**
 * POST /my-company/testimonials — the console's own create.
 *
 * Wraps the factory so the two columns a client must never choose are set here
 * instead: a review the company typed is its own copy (`source: admin`) and is
 * published on sight (`moderation: approved`). The validator already refuses
 * `source` in the body; this is what fills it in.
 */
const createTestimonial = (req, res, next) => {
  req.body = {
    ...req.body,
    source: TESTIMONIAL_SOURCE.ADMIN,
    moderation: req.body?.moderation ?? TESTIMONIAL_MODERATION.APPROVED,
  };
  return testimonialCards.create(req, res, next);
};

const testimonials = {
  ...testimonialCards,
  list: listTestimonials,
  create: createTestimonial,
  moderate: moderateTestimonial,
};

module.exports = {
  stats,
  team,
  gallery,
  testimonials,
  features,
  services,
  serviceCategories,
  getAbout,
  saveAbout,
  clearAbout,
  getContact,
  saveContact,
  clearContact,
};
