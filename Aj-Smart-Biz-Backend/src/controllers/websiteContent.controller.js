'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const cardResource = require('./cardResource.factory');
const functionalityService = require('../services/functionality.service');
const { AUTH_SCOPE, FUNCTIONALITY } = require('../constants');

/**
 * The website content a tenant writes: the About section's stat band, the Team
 * section and the Gallery.
 *
 * All three are ordered lists of cards the company adds, edits, reorders and
 * deletes, so all three are the same factory with a different model — see
 * `cardResource.factory`. The About section's *prose* is not here: it is a
 * singleton blob, so it rides on the functionality's own `settings` and is
 * saved through `PUT /my-company/functionalities/about_us/settings`.
 */

const stats = cardResource({
  model: db.CompanyStat,
  functionality: FUNCTIONALITY.ABOUT_US,
  label: 'Stat',
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

module.exports = {
  stats,
  team,
  gallery,
  getAbout,
  saveAbout,
  clearAbout,
  getContact,
  saveContact,
  clearContact,
};
