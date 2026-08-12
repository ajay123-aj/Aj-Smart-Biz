'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { slugify } = require('../services/code.service');
const { STATUS, PERMISSION_ACTIONS } = require('../constants');

const findOrFail = async (req, options = {}) => {
  const role = await db.Role.findOne({ where: { id: req.params.id, companyId: req.auth.companyId }, ...options });
  if (!role) throw ApiError.notFound('Role not found');
  return role;
};

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = mergeWhere(
    { companyId: req.auth.companyId },
    req.query.status ? { status: req.query.status } : null,
    buildSearch(req.query.search, ['name', 'description'])
  );

  const result = await db.Role.findAndCountAll({
    where,
    order: getSort(req.query, ['name', 'created_at'], [['isSystem', 'DESC'], ['id', 'ASC']]),
    limit,
    offset,
  });

  // Admin counts make the list actionable ("can I delete this role?").
  const counts = await db.Admin.findAll({
    where: { companyId: req.auth.companyId },
    attributes: ['roleId', [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'total']],
    group: ['roleId'],
    raw: true,
  });
  const byRole = counts.reduce((acc, row) => ({ ...acc, [row.roleId]: Number(row.total) }), {});

  const rows = result.rows.map((row) => ({ ...row.toJSON(), adminCount: byRole[row.id] || 0 }));
  return paginated(res, { rows, count: result.count }, { page, limit }, 'Role list fetched successfully');
});

/** Lightweight list for the "assign role" dropdown. */
const dropdown = asyncHandler(async (req, res) => {
  const rows = await db.Role.findAll({
    where: { companyId: req.auth.companyId, status: STATUS.ACTIVE },
    attributes: ['id', 'name'],
    order: [['name', 'ASC']],
  });
  return success(res, { message: 'Role options fetched successfully', data: rows });
});

const getById = asyncHandler(async (req, res) => {
  const role = await findOrFail(req, {
    include: [
      {
        model: db.RolePermission,
        as: 'permissions',
        include: [{ model: db.Menu, as: 'menu', attributes: ['id', 'name', 'slug', 'parentId', 'sequence'] }],
      },
    ],
  });
  return success(res, { message: 'Role fetched successfully', data: role });
});

const create = asyncHandler(async (req, res) => {
  const { permissions, ...data } = req.body;
  const companyId = req.auth.companyId;

  const clash = await db.Role.findOne({ where: { companyId, name: data.name } });
  if (clash) throw ApiError.conflict('A role with this name already exists');

  const role = await db.sequelize.transaction(async (transaction) => {
    const row = await db.Role.create(
      { ...data, companyId, slug: data.slug || slugify(data.name), createdBy: req.auth.id },
      { transaction }
    );

    if (permissions?.length) {
      await db.RolePermission.bulkCreate(
        permissions.map((permission) => ({
          ...permission,
          roleId: row.id,
          companyId,
          createdBy: req.auth.id,
        })),
        { transaction }
      );
    }
    return row;
  });

  return created(res, 'Role created successfully', role);
});

const update = asyncHandler(async (req, res) => {
  const role = await findOrFail(req);
  if (req.body.name && req.body.name !== role.name) {
    const clash = await db.Role.findOne({
      where: { companyId: req.auth.companyId, name: req.body.name, id: { [Op.ne]: role.id } },
    });
    if (clash) throw ApiError.conflict('A role with this name already exists');
  }
  if (role.isSystem && req.body.status && req.body.status !== STATUS.ACTIVE) {
    throw ApiError.badRequest('The company admin role cannot be deactivated');
  }

  await role.update({ ...req.body, updatedBy: req.auth.id });
  return success(res, { message: 'Role updated successfully', data: role });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const role = await findOrFail(req);
  if (role.isSystem) throw ApiError.badRequest('The company admin role cannot be deactivated');
  const next = req.body?.status || (role.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await role.update({ status: next, updatedBy: req.auth.id });
  return success(res, { message: `Role marked ${next}`, data: { id: role.id, status: next } });
});

const remove = asyncHandler(async (req, res) => {
  const role = await findOrFail(req);
  if (role.isSystem) throw ApiError.badRequest('The company admin role cannot be deleted');

  const adminCount = await db.Admin.count({ where: { roleId: role.id } });
  if (adminCount > 0) throw ApiError.badRequest(`Reassign the ${adminCount} admin(s) using this role first`);

  await db.sequelize.transaction(async (transaction) => {
    await db.RolePermission.destroy({ where: { roleId: role.id }, transaction });
    await role.destroy({ transaction });
  });

  return success(res, { message: 'Role deleted successfully', data: { id: role.id } });
});

/* ---------------- Permission matrix ---------------- */

/** GET /roles/:roleId/permissions - every visible menu with its current flags. */
const getPermissions = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;
  const role = await db.Role.findOne({ where: { id: req.params.roleId, companyId } });
  if (!role) throw ApiError.notFound('Role not found');

  const [menus, permissions] = await Promise.all([
    db.Menu.findAll({
      where: { companyId: { [Op.or]: [null, companyId] }, status: STATUS.ACTIVE },
      order: [['sequence', 'ASC'], ['id', 'ASC']],
    }),
    db.RolePermission.findAll({ where: { roleId: role.id, companyId } }),
  ]);

  const byMenu = permissions.reduce((acc, row) => ({ ...acc, [row.menuId]: row }), {});
  const matrix = menus.map((menu) => ({
    menuId: menu.id,
    parentId: menu.parentId,
    name: menu.name,
    slug: menu.slug,
    icon: menu.icon,
    route: menu.route,
    sequence: menu.sequence,
    ...PERMISSION_ACTIONS.reduce(
      (acc, action) => ({ ...acc, [action]: byMenu[menu.id]?.[action] ?? false }),
      {}
    ),
  }));

  return success(res, {
    message: 'Permissions fetched successfully',
    data: { role: { id: role.id, name: role.name, isSystem: role.isSystem }, permissions: matrix },
  });
});

/**
 * PUT /roles/:roleId/permissions - replaces the whole matrix in one write, which
 * is what the checkbox grid in the UI submits.
 */
const syncPermissions = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;
  const role = await db.Role.findOne({ where: { id: req.params.roleId, companyId } });
  if (!role) throw ApiError.notFound('Role not found');
  if (role.isSystem) throw ApiError.badRequest('The company admin role always has full access');

  const menuIds = req.body.permissions.map((p) => p.menuId);
  if (menuIds.length) {
    const valid = await db.Menu.count({
      where: { id: menuIds, companyId: { [Op.or]: [null, companyId] } },
    });
    if (valid !== new Set(menuIds).size) throw ApiError.badRequest('One or more menus do not exist');
  }

  await db.sequelize.transaction(async (transaction) => {
    await db.RolePermission.destroy({ where: { roleId: role.id }, force: true, transaction });
    if (req.body.permissions.length) {
      await db.RolePermission.bulkCreate(
        req.body.permissions.map((permission) => ({
          ...permission,
          roleId: role.id,
          companyId,
          createdBy: req.auth.id,
        })),
        { transaction }
      );
    }
  });

  return success(res, { message: 'Permissions updated successfully', data: { roleId: role.id } });
});

module.exports = {
  list,
  dropdown,
  getById,
  create,
  update,
  toggleStatus,
  remove,
  getPermissions,
  syncPermissions,
};
