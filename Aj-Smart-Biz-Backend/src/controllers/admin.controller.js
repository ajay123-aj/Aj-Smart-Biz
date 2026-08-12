'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const passwordUtil = require('../utils/password');
const quota = require('../services/quota.service');
const { STATUS } = require('../constants');

const findOrFail = async (req, options = {}) => {
  const admin = await db.Admin.findOne({ where: { id: req.params.id, companyId: req.auth.companyId }, ...options });
  if (!admin) throw ApiError.notFound('Admin not found');
  return admin;
};

/**
 * Blocks admin creation against the running plan's quota. Shares its rules and
 * its wording with the quota the UI greys the "Add admin" button from.
 */
const assertAdminQuota = (companyId) => quota.assertCanCreate(companyId, 'admins');

/** GET /admins/quota - what the list screen disables its button with. */
const adminQuota = asyncHandler(async (req, res) => {
  const data = await quota.getQuota(req.auth.companyId);
  return success(res, { message: 'Quota fetched successfully', data });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = mergeWhere(
    { companyId: req.auth.companyId },
    req.query.status ? { status: req.query.status } : null,
    req.query.roleId ? { roleId: req.query.roleId } : null,
    req.query.branchId ? { branchId: req.query.branchId } : null,
    buildSearch(req.query.search, ['name', 'email', 'phone'])
  );

  const result = await db.Admin.findAndCountAll({
    where,
    include: [
      { model: db.Role, as: 'role', attributes: ['id', 'name'] },
      { model: db.Branch, as: 'branch', attributes: ['id', 'name'] },
    ],
    order: getSort(req.query, ['name', 'email', 'created_at'], [['isCompanyAdmin', 'DESC'], ['id', 'ASC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Admin list fetched successfully');
});

const getById = asyncHandler(async (req, res) => {
  const admin = await findOrFail(req, {
    include: [
      { model: db.Role, as: 'role', attributes: ['id', 'name'] },
      { model: db.Branch, as: 'branch', attributes: ['id', 'name'] },
    ],
  });
  return success(res, { message: 'Admin fetched successfully', data: admin });
});

const create = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;
  await assertAdminQuota(companyId);

  const email = req.body.email.toLowerCase();
  const exists = await db.Admin.findOne({ where: { email } });
  if (exists) throw ApiError.conflict('An admin with this email already exists');

  const role = await db.Role.findOne({ where: { id: req.body.roleId, companyId } });
  if (!role) throw ApiError.badRequest('Role not found for this company');
  if (role.isSystem) throw ApiError.badRequest('The company admin role cannot be assigned manually');

  if (req.body.branchId) {
    const branch = await db.Branch.findOne({ where: { id: req.body.branchId, companyId } });
    if (!branch) throw ApiError.badRequest('Branch not found for this company');
  }

  const generatedPassword = req.body.password ? null : passwordUtil.random(12);
  const admin = await db.Admin.create({
    ...req.body,
    email,
    companyId,
    password: req.body.password || generatedPassword,
    isCompanyAdmin: false,
    createdBy: req.auth.id,
  });

  const { password, ...safe } = admin.toJSON();
  // The generated password is shown once so it can be handed over.
  return created(res, 'Admin created successfully', { ...safe, generatedPassword });
});

const update = asyncHandler(async (req, res) => {
  const admin = await findOrFail(req);
  const companyId = req.auth.companyId;

  if (req.body.email && req.body.email.toLowerCase() !== admin.email) {
    const clash = await db.Admin.findOne({
      where: { email: req.body.email.toLowerCase(), id: { [Op.ne]: admin.id } },
    });
    if (clash) throw ApiError.conflict('Another admin already uses this email');
  }
  if (req.body.roleId) {
    const role = await db.Role.findOne({ where: { id: req.body.roleId, companyId } });
    if (!role) throw ApiError.badRequest('Role not found for this company');
    if (admin.isCompanyAdmin && !role.isSystem) {
      throw ApiError.badRequest('The main admin must keep the company admin role');
    }
  }
  if (req.body.branchId) {
    const branch = await db.Branch.findOne({ where: { id: req.body.branchId, companyId } });
    if (!branch) throw ApiError.badRequest('Branch not found for this company');
  }
  if (admin.isCompanyAdmin && req.body.status && req.body.status !== STATUS.ACTIVE) {
    throw ApiError.badRequest('The main admin cannot be deactivated');
  }

  await admin.update({ ...req.body, updatedBy: req.auth.id });
  return success(res, { message: 'Admin updated successfully', data: admin });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const admin = await findOrFail(req);
  if (admin.isCompanyAdmin) throw ApiError.badRequest('The main admin cannot be deactivated');
  if (admin.id === req.auth.id) throw ApiError.badRequest('You cannot change your own status');

  const next = req.body?.status || (admin.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await admin.update({ status: next, updatedBy: req.auth.id });
  return success(res, { message: `Admin marked ${next}`, data: { id: admin.id, status: next } });
});

const remove = asyncHandler(async (req, res) => {
  const admin = await findOrFail(req);
  if (admin.isCompanyAdmin) throw ApiError.badRequest('The main admin cannot be deleted');
  if (admin.id === req.auth.id) throw ApiError.badRequest('You cannot delete your own account');

  await admin.destroy();
  return success(res, { message: 'Admin deleted successfully', data: { id: admin.id } });
});

/** PATCH /admins/:id/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const admin = await db.Admin.scope('withPassword').findOne({
    where: { id: req.params.id, companyId: req.auth.companyId },
  });
  if (!admin) throw ApiError.notFound('Admin not found');

  await admin.update({
    password: req.body.newPassword,
    mustChangePassword: req.body.mustChangePassword ?? true,
    updatedBy: req.auth.id,
  });
  return success(res, { message: 'Password reset successfully', data: { id: admin.id } });
});

module.exports = { list, getById, adminQuota, create, update, toggleStatus, remove, resetPassword };
