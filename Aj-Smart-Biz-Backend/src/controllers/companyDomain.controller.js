'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { AUTH_SCOPE, STATUS } = require('../constants');

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

const normalise = (value) => String(value || '').trim().toLowerCase();

/** A host may only ever point at one tenant, so uniqueness is global. */
const assertDomainFree = async (domain, excludeId = null) => {
  const where = { domain: normalise(domain) };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const existing = await db.CompanyDomain.findOne({ where });
  if (existing) throw ApiError.conflict('That domain is already mapped to a company');
};

/** A pinned branch has to belong to the same company. */
const assertBranchBelongs = async (companyId, subCompanyId) => {
  if (!subCompanyId) return;
  const branch = await db.Branch.findOne({ where: { id: subCompanyId, companyId } });
  if (!branch) throw ApiError.badRequest('That branch does not belong to this company');
};

const findOrFail = async (req) => {
  const row = await db.CompanyDomain.findOne({
    where: { id: req.params.id, companyId: resolveCompanyId(req) },
    include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'] }],
  });
  if (!row) throw ApiError.notFound('Domain not found');
  return row;
};

/** Exactly one primary host per company. */
const clearOtherPrimaries = async (companyId, keepId = null, transaction = null) => {
  const where = { companyId, isPrimary: true };
  if (keepId) where.id = { [Op.ne]: keepId };
  await db.CompanyDomain.update({ isPrimary: false }, { where, transaction });
};

/** GET /companies/:companyId/domains | GET /my-company/domains */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db.CompanyDomain.findAll({
    where: { companyId },
    include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'] }],
    order: [['isPrimary', 'DESC'], ['domain', 'ASC']],
  });
  return success(res, { message: 'Domains fetched successfully', data: rows });
});

const getById = asyncHandler(async (req, res) =>
  success(res, { message: 'Domain fetched successfully', data: await findOrFail(req) })
);

const create = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const company = await db.Company.findByPk(companyId);
  if (!company) throw ApiError.notFound('Company not found');

  await assertDomainFree(req.body.domain);
  await assertBranchBelongs(companyId, req.body.subCompanyId);

  const row = await db.sequelize.transaction(async (transaction) => {
    // The first host a company gets is automatically its primary.
    const existingCount = await db.CompanyDomain.count({ where: { companyId }, transaction });
    const isPrimary = req.body.isPrimary || existingCount === 0;
    if (isPrimary) await clearOtherPrimaries(companyId, null, transaction);

    return db.CompanyDomain.create(
      { ...req.body, companyId, isPrimary, createdBy: req.auth?.id ?? null },
      { transaction }
    );
  });

  const fresh = await db.CompanyDomain.findByPk(row.id, {
    include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'] }],
  });
  return created(res, 'Domain added successfully', fresh);
});

const update = asyncHandler(async (req, res) => {
  const row = await findOrFail(req);
  const companyId = row.companyId;

  if (req.body.domain && normalise(req.body.domain) !== row.domain) {
    await assertDomainFree(req.body.domain, row.id);
  }
  if ('subCompanyId' in req.body) await assertBranchBelongs(companyId, req.body.subCompanyId);
  if (req.body.isPrimary === false && row.isPrimary) {
    throw ApiError.badRequest('Mark another domain as primary instead of clearing this one');
  }

  await db.sequelize.transaction(async (transaction) => {
    if (req.body.isPrimary === true) await clearOtherPrimaries(companyId, row.id, transaction);
    await row.update({ ...req.body, updatedBy: req.auth?.id ?? null }, { transaction });
  });

  const fresh = await db.CompanyDomain.findByPk(row.id, {
    include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'] }],
  });
  return success(res, { message: 'Domain updated successfully', data: fresh });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const row = await findOrFail(req);
  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  if (row.isPrimary && next === STATUS.INACTIVE) {
    throw ApiError.badRequest('The primary domain cannot be deactivated');
  }
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });
  return success(res, { message: `Domain marked ${next}`, data: { id: row.id, status: next } });
});

const remove = asyncHandler(async (req, res) => {
  const row = await findOrFail(req);

  const remaining = await db.CompanyDomain.count({ where: { companyId: row.companyId } });
  if (row.isPrimary && remaining > 1) {
    throw ApiError.badRequest('Make another domain primary before deleting this one');
  }

  await row.destroy();
  return success(res, { message: 'Domain deleted successfully', data: { id: row.id } });
});

module.exports = { list, getById, create, update, toggleStatus, remove };
