'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const adminRoles = require('../services/adminRole.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { slugify } = require('../services/code.service');
const { STATUS, PERMISSION_ACTIONS } = require('../constants');
const { MENU_INHERITS_PARENT } = require('../seeders/defaultMenus');

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
  // Counts primary and extra holders alike — see adminRole.service.
  const byRole = await adminRoles.adminCountsByRole(req.auth.companyId);

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

  /* The same check `syncPermissions` makes: a permission may only name a system
     menu or one of this company's own. Without it a role could be created
     pointing at another company's private menus, and reading the role back
     would reveal their names. */
  const menuIds = (permissions ?? []).map((permission) => permission.menuId);
  if (menuIds.length) {
    const valid = await db.Menu.count({ where: { id: menuIds, companyId: { [Op.or]: [null, companyId] } } });
    if (valid !== new Set(menuIds).size) throw ApiError.badRequest('One or more menus do not exist');
  }

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

  const adminCount = (await adminRoles.adminIdsWithRole(role.companyId, role.id)).length;
  if (adminCount > 0) throw ApiError.badRequest(`Reassign the ${adminCount} admin(s) using this role first`);

  await db.sequelize.transaction(async (transaction) => {
    await db.RolePermission.destroy({ where: { roleId: role.id }, transaction });
    await db.AdminRole.destroy({ where: { roleId: role.id }, transaction });
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
  /**
   * Submenus that follow their parent are left out: they are parts of one
   * screen, and a checkbox that cannot actually deny anything is worse than no
   * checkbox. Branches keeps its row — it has always been grantable on its own.
   */
  const matrix = menus
    .filter((menu) => !MENU_INHERITS_PARENT.has(menu.slug))
    .map((menu) => ({
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

/* ---------------- Admins holding a role ---------------- */

/**
 * GET /roles/:id/admins - every admin of the company (except the main admin,
 * whose role is fixed) with whether they hold this role and how: `primary`,
 * `extra`, or not at all. What the "Assign admins" dialog renders.
 */
const getAdmins = asyncHandler(async (req, res) => {
  const role = await findOrFail(req);
  if (role.isSystem) throw ApiError.badRequest('The company admin role belongs to the main admin only');

  const admins = await db.Admin.findAll({
    where: { companyId: role.companyId, isCompanyAdmin: false },
    attributes: ['id', 'name', 'email', 'status', 'roleId'],
    order: [['name', 'ASC']],
    raw: true,
  });
  const withRoles = await adminRoles.attachRoles(role.companyId, admins);
  const data = withRoles.map((admin) => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    status: admin.status,
    roles: admin.roles,
    holds: admin.roleIds.includes(role.id),
    holdsAs: admin.roleId === role.id ? 'primary' : admin.roleIds.includes(role.id) ? 'extra' : null,
  }));
  return success(res, { message: 'Role admins fetched successfully', data: { role: { id: role.id, name: role.name }, admins: data } });
});

/**
 * PUT /roles/:id/admins - `{ adminIds }` is the complete list of admins who
 * should hold this role. Newly ticked admins get it as an extra role (or as
 * their primary role when they had none); unticked ones lose it. An admin whose
 * only role this is cannot be unticked — every admin keeps at least one role —
 * and when it was their primary role, their next role becomes primary.
 */
const syncAdmins = asyncHandler(async (req, res) => {
  const role = await findOrFail(req);
  if (role.isSystem) throw ApiError.badRequest('The company admin role belongs to the main admin only');

  const wanted = new Set(req.body.adminIds.map(Number));
  const admins = await db.Admin.findAll({ where: { companyId: role.companyId, isCompanyAdmin: false } });
  const known = new Set(admins.map((admin) => admin.id));
  const unknown = [...wanted].filter((id) => !known.has(id));
  if (unknown.length) throw ApiError.badRequest('One or more admins do not belong to this company');

  const withRoles = await adminRoles.attachRoles(role.companyId, admins.map((admin) => admin.toJSON()));
  const plan = withRoles.map((admin) => {
    const has = admin.roleIds.includes(role.id);
    const want = wanted.has(admin.id);
    if (has === want) return null;
    const next = want ? [...admin.roleIds, role.id] : admin.roleIds.filter((id) => id !== role.id);
    return { admin, next };
  }).filter(Boolean);

  const stranded = plan.filter((step) => !step.next.length).map((step) => step.admin.name);
  if (stranded.length) {
    throw ApiError.badRequest(`${stranded.join(', ')} would be left with no role — give them another role first`);
  }

  const byId = new Map(admins.map((admin) => [admin.id, admin]));
  await db.sequelize.transaction(async (transaction) => {
    for (const step of plan) {
      // eslint-disable-next-line no-await-in-loop
      await adminRoles.setRoles({ admin: byId.get(step.admin.id), roleIds: step.next, actorId: req.auth.id, transaction });
    }
  });

  return success(res, {
    message: 'Role assignments updated successfully',
    data: { roleId: role.id, changed: plan.length },
  });
});

module.exports = {
  getAdmins,
  syncAdmins,
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
