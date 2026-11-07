'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { STATUS, PERMISSION_ACTIONS } = require('../constants');

/**
 * Admins with more than one role.
 *
 * An admin holds a **primary** role (`admins.role_id`, unchanged so every
 * existing read keeps working) plus any number of extra roles (`admin_roles`).
 * What they may do is the **union** of every *active* role they hold: a menu
 * action is allowed when any one of those roles allows it. An inactive role
 * simply stops contributing; the account is refused only when it holds roles
 * and none of them is active.
 *
 * Every permission decision — the route guard, the `/auth/me` menu tree, the
 * invoice "All invoices" check — goes through here, so the rule cannot drift.
 */

/** Every role id the admin holds, primary first, without duplicates. */
async function heldRoleIds({ adminId, roleId }) {
  const links = await db.AdminRole.findAll({ where: { adminId }, attributes: ['roleId'], raw: true });
  return [...new Set([roleId, ...links.map((link) => link.roleId)].filter(Boolean))];
}

/**
 * The held roles that are active, in the admin's company. Returned alongside
 * whether the admin holds any role at all, so callers can tell "no role" from
 * "every role switched off".
 */
async function activeRoleIds({ adminId, roleId, companyId }) {
  const held = await heldRoleIds({ adminId, roleId });
  if (!held.length) return { held, active: [] };
  const roles = await db.Role.findAll({
    where: { id: held, companyId, status: STATUS.ACTIVE },
    attributes: ['id'],
    raw: true,
  });
  const activeSet = new Set(roles.map((role) => role.id));
  return { held, active: held.filter((id) => activeSet.has(id)) };
}

/**
 * The signed-in admin's active role ids, memoised on `req.auth` so a request
 * that checks several permissions loads them once.
 */
async function authRoleIds(req) {
  if (!req.auth) return [];
  if (!req.auth.roleIds) {
    const { active } = await activeRoleIds({
      adminId: req.auth.id,
      roleId: req.auth.roleId,
      companyId: req.auth.companyId,
    });
    req.auth.roleIds = active;
  }
  return req.auth.roleIds;
}

/** `{ [menuSlug]: { canView, canCreate, ... } }`, OR-ed across the roles. */
async function permissionMap(companyId, roleIds) {
  if (!roleIds?.length) return {};
  const rows = await db.RolePermission.findAll({
    where: { roleId: roleIds, companyId },
    include: [{ model: db.Menu, as: 'menu', attributes: ['id', 'slug'] }],
  });
  return rows.reduce((acc, row) => {
    if (!row.menu) return acc;
    const current = acc[row.menu.slug] ?? {};
    acc[row.menu.slug] = PERMISSION_ACTIONS.reduce(
      (flags, action) => ({ ...flags, [action]: Boolean(current[action]) || row[action] === true }),
      {}
    );
    return acc;
  }, {});
}

/** Whether any of the roles grants `action` on the menu `slug`. */
async function rolesCan(companyId, roleIds, slug, action) {
  if (!roleIds?.length) return false;
  const row = await db.RolePermission.findOne({
    where: { roleId: roleIds, companyId, [action]: true },
    include: [{ model: db.Menu, as: 'menu', where: { slug }, attributes: [], required: true }],
    attributes: ['id'],
  });
  return Boolean(row);
}

/**
 * Validates a role list for an admin and returns it de-duplicated, in order.
 * Every role must belong to the company. The system "Company admin" role is
 * reserved for the main admin, who must keep it first; nobody else may hold it.
 */
async function assertAssignable(companyId, roleIds, { isCompanyAdmin = false } = {}) {
  const ids = [...new Set((roleIds ?? []).map(Number).filter(Boolean))];
  if (!ids.length) throw ApiError.badRequest('Choose at least one role');

  const roles = await db.Role.findAll({ where: { id: ids, companyId } });
  if (roles.length !== ids.length) throw ApiError.badRequest('One or more roles do not belong to this company');

  const byId = new Map(roles.map((role) => [role.id, role]));
  if (isCompanyAdmin) {
    if (!byId.get(ids[0])?.isSystem) throw ApiError.badRequest('The main admin must keep the company admin role');
  } else if (roles.some((role) => role.isSystem)) {
    throw ApiError.badRequest('The company admin role cannot be assigned manually');
  }
  return ids;
}

/**
 * Saves the admin's roles: the first becomes the primary `roleId`, the rest
 * replace their `admin_roles` rows. Call inside the caller's transaction.
 */
async function setRoles({ admin, roleIds, actorId, transaction }) {
  const [primary, ...extra] = roleIds;
  if (admin.roleId !== primary) await admin.update({ roleId: primary, updatedBy: actorId }, { transaction });
  await db.AdminRole.destroy({ where: { adminId: admin.id }, transaction });
  if (extra.length) {
    await db.AdminRole.bulkCreate(
      extra.map((roleId) => ({ companyId: admin.companyId, adminId: admin.id, roleId, createdBy: actorId })),
      { transaction }
    );
  }
}

/**
 * Adds `roles: [{ id, name, status, primary }]` and `roleIds` to plain admin
 * rows (primary first), in two queries for the whole page.
 */
async function attachRoles(companyId, admins) {
  if (!admins.length) return admins;
  const links = await db.AdminRole.findAll({
    where: { adminId: admins.map((admin) => admin.id) },
    attributes: ['adminId', 'roleId'],
    raw: true,
  });
  const extraByAdmin = links.reduce((acc, link) => {
    (acc[link.adminId] ??= []).push(link.roleId);
    return acc;
  }, {});
  const allIds = [...new Set([...admins.map((admin) => admin.roleId), ...links.map((link) => link.roleId)].filter(Boolean))];
  const roles = allIds.length
    ? await db.Role.findAll({ where: { id: allIds, companyId }, attributes: ['id', 'name', 'status'], raw: true })
    : [];
  const roleById = new Map(roles.map((role) => [role.id, role]));

  return admins.map((admin) => {
    const ids = [...new Set([admin.roleId, ...(extraByAdmin[admin.id] ?? [])].filter(Boolean))];
    return {
      ...admin,
      roleIds: ids,
      roles: ids
        .map((id, index) => (roleById.has(id) ? { ...roleById.get(id), primary: index === 0 } : null))
        .filter(Boolean),
    };
  });
}

/** Admin ids holding `roleId`, as primary or extra — for list filters. */
async function adminIdsWithRole(companyId, roleId) {
  const [primary, extra] = await Promise.all([
    db.Admin.findAll({ where: { companyId, roleId }, attributes: ['id'], raw: true }),
    db.AdminRole.findAll({ where: { companyId, roleId }, attributes: ['adminId'], raw: true }),
  ]);
  return [...new Set([...primary.map((row) => row.id), ...extra.map((row) => row.adminId)])];
}

/** `{ [roleId]: number of admins holding it }`, primary or extra, each admin once per role. */
async function adminCountsByRole(companyId) {
  const [primary, extra] = await Promise.all([
    db.Admin.findAll({ where: { companyId, roleId: { [Op.ne]: null } }, attributes: ['id', 'roleId'], raw: true }),
    db.AdminRole.findAll({
      where: { companyId },
      attributes: ['adminId', 'roleId'],
      include: [{ model: db.Admin, as: 'admin', attributes: [], required: true }],
      raw: true,
    }),
  ]);
  const pairs = new Set([
    ...primary.map((row) => `${row.roleId}:${row.id}`),
    ...extra.map((row) => `${row.roleId}:${row.adminId}`),
  ]);
  const counts = {};
  for (const pair of pairs) {
    const roleId = pair.split(':')[0];
    counts[roleId] = (counts[roleId] || 0) + 1;
  }
  return counts;
}

module.exports = {
  heldRoleIds,
  activeRoleIds,
  authRoleIds,
  permissionMap,
  rolesCan,
  assertAssignable,
  setRoles,
  attachRoles,
  adminIdsWithRole,
  adminCountsByRole,
};
