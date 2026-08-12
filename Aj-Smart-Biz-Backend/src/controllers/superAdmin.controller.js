'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { STATUS, SUPER_ADMIN_ROLE } = require('../constants');

const findOrFail = async (id) => {
  const row = await db.SuperAdmin.findByPk(id);
  if (!row) throw ApiError.notFound('Super admin not found');
  return row;
};

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = mergeWhere(
    req.query.status ? { status: req.query.status } : null,
    buildSearch(req.query.search, ['name', 'email', 'phone'])
  );

  const result = await db.SuperAdmin.findAndCountAll({
    where,
    order: getSort(req.query, ['name', 'email', 'created_at'], [['isRoot', 'DESC'], ['id', 'ASC']]),
    limit,
    offset,
  });
  return paginated(res, result, { page, limit }, 'Super admin list fetched successfully');
});

const getById = asyncHandler(async (req, res) =>
  success(res, { message: 'Super admin fetched successfully', data: await findOrFail(req.params.id) })
);

const create = asyncHandler(async (req, res) => {
  const exists = await db.SuperAdmin.findOne({ where: { email: req.body.email } });
  if (exists) throw ApiError.conflict('A super admin with this email already exists');

  const row = await db.SuperAdmin.create({ ...req.body, createdBy: req.auth?.id ?? null });
  const { password, ...safe } = row.toJSON();
  return created(res, 'Super admin created successfully', safe);
});

const update = asyncHandler(async (req, res) => {
  const row = await findOrFail(req.params.id);

  if (req.body.email && req.body.email !== row.email) {
    const clash = await db.SuperAdmin.findOne({ where: { email: req.body.email, id: { [Op.ne]: row.id } } });
    if (clash) throw ApiError.conflict('Another super admin already uses this email');
  }
  // The root account keeps its privileges and stays enabled.
  if (row.isRoot) {
    if (req.body.status && req.body.status !== STATUS.ACTIVE) {
      throw ApiError.badRequest('The root super admin cannot be deactivated');
    }
    if (req.body.role && req.body.role !== SUPER_ADMIN_ROLE.SUPER_ADMIN) {
      throw ApiError.badRequest('The root super admin role cannot be changed');
    }
  }

  await row.update({ ...req.body, updatedBy: req.auth?.id ?? null });
  return success(res, { message: 'Super admin updated successfully', data: row });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const row = await findOrFail(req.params.id);
  if (row.isRoot) throw ApiError.badRequest('The root super admin cannot be deactivated');
  if (row.id === req.auth.id) throw ApiError.badRequest('You cannot change your own status');

  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });
  return success(res, { message: `Super admin marked ${next}`, data: { id: row.id, status: next } });
});

const remove = asyncHandler(async (req, res) => {
  const row = await findOrFail(req.params.id);
  if (row.isRoot) throw ApiError.badRequest('The root super admin cannot be deleted');
  if (row.id === req.auth.id) throw ApiError.badRequest('You cannot delete your own account');

  await row.destroy();
  return success(res, { message: 'Super admin deleted successfully', data: { id: row.id } });
});

/** PATCH /super-admins/:id/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const row = await db.SuperAdmin.scope('withPassword').findByPk(req.params.id);
  if (!row) throw ApiError.notFound('Super admin not found');
  await row.update({ password: req.body.newPassword, updatedBy: req.auth?.id ?? null });
  return success(res, { message: 'Password reset successfully', data: { id: row.id } });
});

module.exports = { list, getById, create, update, toggleStatus, remove, resetPassword };
