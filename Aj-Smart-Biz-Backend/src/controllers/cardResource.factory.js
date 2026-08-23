'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { mergeWhere } = require('../utils/query');
const { removeUploadedFile } = require('../middlewares/upload');
const functionalityService = require('../services/functionality.service');
const { AUTH_SCOPE, STATUS } = require('../constants');

/**
 * The seven handlers a tenant-owned, ordered list of cards needs: list, create,
 * update, toggle, reorder, delete — plus the two rules every one of them shares.
 *
 * Stat cards, team members and gallery images are the same shape of thing, and
 * writing them out three times is how the three drift apart. What differs is
 * only the model, the label and which files a row owns.
 *
 * The two shared rules:
 *
 *  - **Pinned to one company.** A company admin's token already names their
 *    tenant, so `:companyId` is ignored for them and cross-tenant access is
 *    impossible by construction — the same rule the slider controller follows.
 *  - **Gated on the plan's grant**, not on the feature being live. A company
 *    whose plan includes Team must still be able to fix a typo while the
 *    section is switched off, or while the plan is briefly suspended. What it
 *    may not do is fill in something it was never sold.
 *
 * @param {object} options
 * @param {import('sequelize').ModelStatic} options.model
 * @param {string} options.functionality  Key from `FUNCTIONALITY` that gates writes.
 * @param {string} options.label          Singular, lower case — used in messages.
 * @param {string[]} [options.searchFields]
 * @param {string[]} [options.imageFields] Upload paths to discard when replaced.
 */
module.exports = ({ model, functionality, label, searchFields = [], imageFields = [] }) => {
  const resolveCompanyId = (req) => {
    if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
    const companyId = Number(req.params.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
    return companyId;
  };

  const assertGranted = (companyId) => functionalityService.assertGranted(companyId, functionality);

  const findOrFail = async (companyId, id) => {
    const row = await model.findOne({ where: { id, companyId } });
    if (!row) throw ApiError.notFound(`${label[0].toUpperCase()}${label.slice(1)} not found`);
    return row;
  };

  const ORDER = [['sequence', 'ASC'], ['id', 'ASC']];

  const BRANCH_INCLUDE = { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false };

  /**
   * A card may only be pinned to a branch of its own company. Without this a
   * tenant could park one on someone else's branch id — the same guard the
   * slider controller applies, for the same reason.
   */
  const assertBranchBelongsToCompany = async (branchId, companyId) => {
    if (branchId === undefined || branchId === null || branchId === '') return null;
    const branch = await db.Branch.findOne({ where: { id: branchId, companyId }, attributes: ['id'] });
    if (!branch) throw ApiError.badRequest('That branch does not belong to this company');
    return branch.id;
  };

  /**
   * `?branchId=` filters to one branch, `?branchId=none` to the company-wide
   * cards. Absent, every card is listed — which is what the management screen
   * wants by default.
   */
  const branchFilter = (query) => {
    if (query.branchId === 'none' || query.branchId === 'null') return { branchId: null };
    if (query.branchId) return { branchId: Number(query.branchId) };
    return null;
  };

  /**
   * Unpaginated on purpose: these are short, ordered lists a tenant edits as a
   * whole and reorders by hand, not tables anyone pages through.
   */
  const list = asyncHandler(async (req, res) => {
    const companyId = resolveCompanyId(req);
    const rows = await model.findAll({
      where: mergeWhere(
        { companyId },
        branchFilter(req.query),
        req.query.status ? { status: req.query.status } : null,
        req.query.search && searchFields.length
          ? require('../utils/query').buildSearch(req.query.search, searchFields)
          : null
      ),
      include: [BRANCH_INCLUDE],
      order: ORDER,
    });
    return success(res, { message: `${label} list fetched successfully`, data: { items: rows } });
  });

  const create = asyncHandler(async (req, res) => {
    const companyId = resolveCompanyId(req);
    await assertGranted(companyId);
    const branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);

    /**
     * Appended to the end of its OWN list, like slides: a branch's cards and the
     * company-wide ones are ordered independently, so a new branch card starting
     * at the company-wide list's length would leave a gap.
     */
    const sequence =
      req.body.sequence ??
      ((await model.max('sequence', { where: { companyId, branchId: branchId ?? null } })) || 0) + 1;

    const row = await model.create({
      ...req.body,
      companyId,
      branchId: branchId ?? null,
      sequence,
      createdBy: req.auth?.id ?? null,
    });

    return created(res, `${label} added successfully`, row);
  });

  const update = asyncHandler(async (req, res) => {
    const companyId = resolveCompanyId(req);
    await assertGranted(companyId);

    const row = await findOrFail(companyId, req.params.id);
    const patch = { ...req.body, updatedBy: req.auth?.id ?? null };

    // Moving a card between scopes is allowed; moving it to someone else's
    // branch is not. `null` is a real value here — it means "company-wide".
    if ('branchId' in req.body) {
      patch.branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
    }

    // A replaced image leaves its file behind otherwise.
    const previous = {};
    imageFields.forEach((field) => {
      previous[field] = row[field];
    });

    await row.update(patch);

    imageFields.forEach((field) => {
      if (previous[field] && patch[field] !== undefined && patch[field] !== previous[field]) {
        removeUploadedFile(previous[field]);
      }
    });

    return success(res, { message: `${label} updated successfully`, data: row });
  });

  const toggleStatus = asyncHandler(async (req, res) => {
    const companyId = resolveCompanyId(req);
    await assertGranted(companyId);

    const row = await findOrFail(companyId, req.params.id);
    const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
    await row.update({ status: next, updatedBy: req.auth?.id ?? null });

    return success(res, { message: `${label} marked ${next}`, data: { id: row.id, status: next } });
  });

  /**
   * The whole ordered list in one call, so a drag that shuffles several
   * positions cannot be left half-applied if a request fails midway.
   */
  const reorder = asyncHandler(async (req, res) => {
    const companyId = resolveCompanyId(req);
    await assertGranted(companyId);

    const ids = req.body.ids ?? [];
    const owned = await model.findAll({ where: { id: ids, companyId }, attributes: ['id'] });
    if (owned.length !== ids.length) throw ApiError.badRequest('One or more items do not belong to this company');

    await db.sequelize.transaction(async (transaction) =>
      Promise.all(
        ids.map((id, index) =>
          model.update(
            { sequence: index + 1, updatedBy: req.auth?.id ?? null },
            { where: { id, companyId }, transaction }
          )
        )
      )
    );

    return success(res, { message: `${label} order updated successfully`, data: { ids } });
  });

  const remove = asyncHandler(async (req, res) => {
    const companyId = resolveCompanyId(req);
    await assertGranted(companyId);

    const row = await findOrFail(companyId, req.params.id);
    await row.update({ updatedBy: req.auth?.id ?? null });
    await row.destroy();
    return success(res, { message: `${label} deleted successfully`, data: { id: row.id } });
  });

  return { list, create, update, toggleStatus, reorder, remove };
};
