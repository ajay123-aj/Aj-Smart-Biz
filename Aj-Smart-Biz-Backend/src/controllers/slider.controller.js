'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { removeUploadedFile } = require('../middlewares/upload');
const { AUTH_SCOPE, STATUS } = require('../constants');

/**
 * Hero slides for the tenant's public website.
 *
 * Every query is pinned to one company. Super admins address a company through
 * the URL; a company admin's token already names their tenant, so `:companyId`
 * is ignored for them and cross-tenant access is impossible by construction —
 * the same rule the branch controller follows.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const findSliderOrFail = async (req, options = {}) => {
  const slider = await db.Slider.findOne({
    where: { id: req.params.id, companyId: resolveCompanyId(req) },
    ...options,
  });
  if (!slider) throw ApiError.notFound('Slide not found');
  return slider;
};

/**
 * A slide may only be pinned to a branch of its own company. Without this a
 * tenant could park a slide on someone else's branch id.
 */
const assertBranchBelongsToCompany = async (branchId, companyId) => {
  if (branchId === undefined || branchId === null || branchId === '') return null;
  const branch = await db.Branch.findOne({ where: { id: branchId, companyId }, attributes: ['id'] });
  if (!branch) throw ApiError.badRequest('That branch does not belong to this company');
  return branch.id;
};

const BRANCH_INCLUDE = { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false };

/** GET /my-company/sliders | GET /companies/:companyId/sliders */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  /**
   * `?branchId=` filters to one branch, and `?branchId=none` to the
   * company-wide slides. Absent, every slide is listed — which is what the
   * management screen wants by default.
   */
  let branchFilter = null;
  if (req.query.branchId === 'none' || req.query.branchId === 'null') {
    branchFilter = { branchId: null };
  } else if (req.query.branchId) {
    branchFilter = { branchId: Number(req.query.branchId) };
  }

  const where = mergeWhere(
    { companyId },
    branchFilter,
    req.query.status ? { status: req.query.status } : null,
    buildSearch(req.query.search, ['title', 'eyebrow', 'subtitle'])
  );

  const result = await db.Slider.findAndCountAll({
    where,
    include: [BRANCH_INCLUDE],
    order: getSort(req.query, ['title', 'sequence', 'created_at'], [['sequence', 'ASC'], ['id', 'ASC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Slide list fetched successfully');
});

const getById = asyncHandler(async (req, res) => {
  const slider = await findSliderOrFail(req, { include: [BRANCH_INCLUDE] });
  return success(res, { message: 'Slide fetched successfully', data: slider });
});

const create = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);

  /** Appended to the end of its own list unless a position was given. */
  const sequence =
    req.body.sequence ??
    ((await db.Slider.max('sequence', { where: { companyId, branchId: branchId ?? null } })) || 0) + 1;

  const slider = await db.Slider.create({
    ...req.body,
    companyId,
    branchId: branchId ?? null,
    sequence,
    createdBy: req.auth?.id ?? null,
  });

  return created(res, 'Slide created successfully', slider);
});

const update = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const slider = await findSliderOrFail(req);

  const patch = { ...req.body, updatedBy: req.auth?.id ?? null };
  if ('branchId' in req.body) {
    patch.branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
  }

  // A replaced image leaves its file behind otherwise — both artworks.
  const previous = { image: slider.image, mobileImage: slider.mobileImage };
  await slider.update(patch);
  ['image', 'mobileImage'].forEach((field) => {
    if (previous[field] && patch[field] !== undefined && patch[field] !== previous[field]) {
      removeUploadedFile(previous[field]);
    }
  });

  return success(res, { message: 'Slide updated successfully', data: slider });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const slider = await findSliderOrFail(req);
  const next = req.body?.status || (slider.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await slider.update({ status: next, updatedBy: req.auth?.id ?? null });
  return success(res, { message: `Slide marked ${next}`, data: { id: slider.id, status: next } });
});

/**
 * PATCH .../sliders/reorder — the whole ordered list in one call.
 *
 * Sent as a list rather than per-row moves so a drag that shuffles several
 * positions cannot leave the order half-applied.
 */
const reorder = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const ids = req.body.ids ?? [];

  const owned = await db.Slider.findAll({ where: { id: ids, companyId }, attributes: ['id'] });
  if (owned.length !== ids.length) throw ApiError.badRequest('One or more slides do not belong to this company');

  await db.sequelize.transaction(async (transaction) =>
    Promise.all(
      ids.map((id, index) =>
        db.Slider.update(
          { sequence: index + 1, updatedBy: req.auth?.id ?? null },
          { where: { id, companyId }, transaction }
        )
      )
    )
  );

  return success(res, { message: 'Slide order updated successfully', data: { ids } });
});

const remove = asyncHandler(async (req, res) => {
  const slider = await findSliderOrFail(req);
  await slider.update({ updatedBy: req.auth?.id ?? null });
  await slider.destroy();
  return success(res, { message: 'Slide deleted successfully', data: { id: slider.id } });
});

module.exports = { list, getById, create, update, toggleStatus, reorder, remove };
