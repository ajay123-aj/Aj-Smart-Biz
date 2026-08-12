'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { generateUniqueCode } = require('../services/code.service');
const quota = require('../services/quota.service');
const { removeUploadedFile } = require('../middlewares/upload');
const { AUTH_SCOPE, STATUS } = require('../constants');

/** Image columns whose old file is discarded when a new one replaces it. */
const IMAGE_FIELDS = ['logo', 'favicon'];

/**
 * Super admins address a company through the URL; company admins are pinned to
 * their own tenant by the token, so `:companyId` is ignored for them.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const findBranchOrFail = async (req, options = {}) => {
  const branch = await db.Branch.findOne({
    where: { id: req.params.id, companyId: resolveCompanyId(req) },
    ...options,
  });
  if (!branch) throw ApiError.notFound('Branch not found');
  return branch;
};

/**
 * Blocks branch creation against the running plan's quota.
 *
 * The rules live in the quota service so this guard and the numbers the UI
 * greys its button with come from the same place.
 */
const assertBranchQuota = (companyId) => quota.assertCanCreate(companyId, 'branches');

/** GET /companies/:companyId/branches/quota | GET /my-company/branches/quota */
const branchQuota = asyncHandler(async (req, res) => {
  const data = await quota.getQuota(resolveCompanyId(req));
  return success(res, { message: 'Quota fetched successfully', data });
});

/** GET /companies/:companyId/branches  |  GET /my-company/branches */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const where = mergeWhere(
    { companyId },
    req.query.status ? { status: req.query.status } : null,
    buildSearch(req.query.search, ['name', 'code', 'city', 'phone', 'email'])
  );

  const result = await db.Branch.findAndCountAll({
    where,
    include: [
      { model: db.State, as: 'state', attributes: ['id', 'name'] },
      { model: db.BranchContact, as: 'contacts', attributes: ['id', 'name', 'phone', 'isPrimary'] },
    ],
    order: getSort(req.query, ['name', 'code', 'created_at'], [['isMain', 'DESC'], ['id', 'ASC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Branch list fetched successfully');
});

const getById = asyncHandler(async (req, res) => {
  const branch = await findBranchOrFail(req, {
    include: [
      { model: db.State, as: 'state', attributes: ['id', 'name'] },
      { model: db.BranchContact, as: 'contacts' },
    ],
  });
  return success(res, { message: 'Branch fetched successfully', data: branch });
});

const create = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const company = await db.Company.findByPk(companyId);
  if (!company) throw ApiError.notFound('Company not found');

  await assertBranchQuota(companyId);

  const code = req.body.code || (await generateUniqueCode(db.Branch, `${company.code}${req.body.name}`, { companyId }));
  const clash = await db.Branch.findOne({ where: { companyId, code }, paranoid: false });
  if (clash) throw ApiError.conflict('A branch with this code already exists');

  // Exactly one head office per company.
  if (req.body.isMain) {
    await db.Branch.update({ isMain: false }, { where: { companyId } });
  }

  const branch = await db.Branch.create({ ...req.body, code, companyId, createdBy: req.auth?.id ?? null });
  return created(res, 'Branch created successfully', branch);
});

const update = asyncHandler(async (req, res) => {
  const branch = await findBranchOrFail(req);
  const companyId = branch.companyId;

  if (req.body.code && req.body.code !== branch.code) {
    const clash = await db.Branch.findOne({
      where: { companyId, code: req.body.code, id: { [Op.ne]: branch.id } },
      paranoid: false,
    });
    if (clash) throw ApiError.conflict('A branch with this code already exists');
  }
  if (req.body.isMain === true) {
    await db.Branch.update({ isMain: false }, { where: { companyId, id: { [Op.ne]: branch.id } } });
  }
  if (req.body.isMain === false && branch.isMain) {
    throw ApiError.badRequest('Mark another branch as head office instead of clearing this one');
  }

  // Note the images being replaced so their files can be discarded after the save.
  const replaced = IMAGE_FIELDS.filter(
    (field) => field in req.body && branch[field] && branch[field] !== req.body[field]
  ).map((field) => branch[field]);

  await branch.update({ ...req.body, updatedBy: req.auth?.id ?? null });
  replaced.forEach(removeUploadedFile);

  return success(res, { message: 'Branch updated successfully', data: branch });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const branch = await findBranchOrFail(req);
  const next = req.body?.status || (branch.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  if (branch.isMain && next === STATUS.INACTIVE) throw ApiError.badRequest('The head office cannot be deactivated');
  await branch.update({ status: next, updatedBy: req.auth?.id ?? null });
  return success(res, { message: `Branch marked ${next}`, data: { id: branch.id, status: next } });
});

/** DELETE - soft delete; the head office and branches with admins are protected. */
const remove = asyncHandler(async (req, res) => {
  const branch = await findBranchOrFail(req);
  if (branch.isMain) throw ApiError.badRequest('The head office branch cannot be deleted');

  const adminCount = await db.Admin.count({ where: { branchId: branch.id } });
  if (adminCount > 0) {
    throw ApiError.badRequest(`Reassign the ${adminCount} admin(s) of this branch before deleting it`);
  }

  await db.sequelize.transaction(async (transaction) => {
    await db.BranchContact.destroy({ where: { branchId: branch.id }, transaction });
    await branch.destroy({ transaction });
  });

  return success(res, { message: 'Branch deleted successfully', data: { id: branch.id } });
});

/* ---------------------- Branch contacts ---------------------- */

const findContactOrFail = async (req) => {
  const contact = await db.BranchContact.findOne({
    where: { id: req.params.id, companyId: resolveCompanyId(req) },
  });
  if (!contact) throw ApiError.notFound('Contact not found');
  return contact;
};

const listContacts = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const branch = await db.Branch.findOne({ where: { id: req.params.branchId, companyId } });
  if (!branch) throw ApiError.notFound('Branch not found');

  const rows = await db.BranchContact.findAll({
    where: { branchId: branch.id },
    order: [['isPrimary', 'DESC'], ['id', 'ASC']],
  });
  return success(res, { message: 'Contacts fetched successfully', data: rows });
});

const createContact = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const branch = await db.Branch.findOne({ where: { id: req.params.branchId, companyId } });
  if (!branch) throw ApiError.notFound('Branch not found');

  if (req.body.isPrimary) {
    await db.BranchContact.update({ isPrimary: false }, { where: { branchId: branch.id } });
  }

  const contact = await db.BranchContact.create({
    ...req.body,
    branchId: branch.id,
    companyId,
    createdBy: req.auth?.id ?? null,
  });
  return created(res, 'Contact added successfully', contact);
});

const updateContact = asyncHandler(async (req, res) => {
  const contact = await findContactOrFail(req);
  if (req.body.isPrimary === true) {
    await db.BranchContact.update(
      { isPrimary: false },
      { where: { branchId: contact.branchId, id: { [Op.ne]: contact.id } } }
    );
  }
  await contact.update({ ...req.body, updatedBy: req.auth?.id ?? null });
  return success(res, { message: 'Contact updated successfully', data: contact });
});

const removeContact = asyncHandler(async (req, res) => {
  const contact = await findContactOrFail(req);
  await contact.destroy();
  return success(res, { message: 'Contact deleted successfully', data: { id: contact.id } });
});

module.exports = {
  list,
  getById,
  branchQuota,
  create,
  update,
  toggleStatus,
  remove,
  listContacts,
  createContact,
  updateContact,
  removeContact,
};
