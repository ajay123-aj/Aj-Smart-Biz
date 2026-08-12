'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { issueTokens, verifyRefreshToken } = require('../utils/jwt');
const { AUTH_SCOPE, STATUS, PERMISSION_ACTIONS } = require('../constants');
const { Op } = require('sequelize');

const publicSuperAdmin = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  avatar: row.avatar,
  role: row.role,
  isRoot: row.isRoot,
  status: row.status,
  lastLoginAt: row.lastLoginAt,
});

const publicAdmin = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  avatar: row.avatar,
  companyId: row.companyId,
  branchId: row.branchId,
  roleId: row.roleId,
  isCompanyAdmin: row.isCompanyAdmin,
  mustChangePassword: row.mustChangePassword,
  status: row.status,
  lastLoginAt: row.lastLoginAt,
  company: row.company
    ? {
        id: row.company.id,
        name: row.company.name,
        code: row.company.code,
        logo: row.company.logo,
        favicon: row.company.favicon,
        description: row.company.description,
      }
    : undefined,
  // Carries logo/favicon so the client can brand the session with the admin's
  // own branch rather than the company as a whole.
  branch: row.branch
    ? {
        id: row.branch.id,
        name: row.branch.name,
        code: row.branch.code,
        logo: row.branch.logo,
        favicon: row.branch.favicon,
      }
    : undefined,
  role: row.role ? { id: row.role.id, name: row.role.name } : undefined,
});

/** POST /auth/super-admin/login */
const superAdminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const account = await db.SuperAdmin.scope('withPassword').findOne({ where: { email } });
  if (!account || !(await account.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (account.status !== STATUS.ACTIVE) throw ApiError.forbidden('Your account is inactive');

  await account.update({ lastLoginAt: new Date() });
  const tokens = issueTokens({ id: account.id, scope: AUTH_SCOPE.SUPER_ADMIN, role: account.role });

  return success(res, {
    message: 'Logged in successfully',
    data: { ...tokens, user: publicSuperAdmin(account) },
  });
});

/** POST /auth/admin/login */
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const account = await db.Admin.scope('withPassword').findOne({
    where: { email },
    include: [
      { model: db.Company, as: 'company' },
      { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code', 'logo', 'favicon'] },
      { model: db.Role, as: 'role', attributes: ['id', 'name', 'status'] },
    ],
  });
  if (!account || !(await account.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (account.status !== STATUS.ACTIVE) throw ApiError.forbidden('Your account is inactive');
  if (!account.company) throw ApiError.forbidden('Your company no longer exists');
  if (account.company.status !== STATUS.ACTIVE) throw ApiError.forbidden('Your company is inactive');
  if (account.role && account.role.status !== STATUS.ACTIVE) throw ApiError.forbidden('Your role is inactive');

  await account.update({ lastLoginAt: new Date() });
  const tokens = issueTokens({
    id: account.id,
    scope: AUTH_SCOPE.ADMIN,
    companyId: account.companyId,
    roleId: account.roleId,
  });

  return success(res, {
    message: 'Logged in successfully',
    data: { ...tokens, user: publicAdmin(account) },
  });
});

/** POST /auth/refresh - works for both portals, scope is carried in the token. */
const refresh = asyncHandler(async (req, res) => {
  const payload = verifyRefreshToken(req.body.refreshToken);
  const model = payload.scope === AUTH_SCOPE.SUPER_ADMIN ? db.SuperAdmin : db.Admin;
  const account = await model.findByPk(payload.id);
  if (!account || account.status !== STATUS.ACTIVE) throw ApiError.unauthorized('Account is not active');

  const tokens = issueTokens(
    payload.scope === AUTH_SCOPE.SUPER_ADMIN
      ? { id: account.id, scope: AUTH_SCOPE.SUPER_ADMIN, role: account.role }
      : { id: account.id, scope: AUTH_SCOPE.ADMIN, companyId: account.companyId, roleId: account.roleId }
  );
  return success(res, { message: 'Token refreshed', data: tokens });
});

/**
 * GET /auth/me - profile plus, for company admins, the menu tree the role can see.
 */
const me = asyncHandler(async (req, res) => {
  if (req.auth.scope === AUTH_SCOPE.SUPER_ADMIN) {
    return success(res, { message: 'Profile fetched', data: { user: publicSuperAdmin(req.user) } });
  }

  const menus = await db.Menu.findAll({
    where: { companyId: { [Op.or]: [null, req.auth.companyId] }, status: STATUS.ACTIVE },
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });

  let permissionMap = {};
  if (req.auth.isCompanyAdmin) {
    permissionMap = menus.reduce((acc, menu) => {
      acc[menu.slug] = PERMISSION_ACTIONS.reduce((p, action) => ({ ...p, [action]: true }), {});
      return acc;
    }, {});
  } else if (req.auth.roleId) {
    const rows = await db.RolePermission.findAll({
      where: { roleId: req.auth.roleId, companyId: req.auth.companyId },
      include: [{ model: db.Menu, as: 'menu', attributes: ['id', 'slug'] }],
    });
    permissionMap = rows.reduce((acc, row) => {
      if (!row.menu) return acc;
      acc[row.menu.slug] = PERMISSION_ACTIONS.reduce((p, action) => ({ ...p, [action]: row[action] }), {});
      return acc;
    }, {});
  }

  const visibleMenus = menus
    .filter((menu) => permissionMap[menu.slug]?.canView)
    .map((menu) => ({
      id: menu.id,
      parentId: menu.parentId,
      name: menu.name,
      slug: menu.slug,
      icon: menu.icon,
      route: menu.route,
      sequence: menu.sequence,
    }));

  return success(res, {
    message: 'Profile fetched',
    data: { user: publicAdmin(req.user), permissions: permissionMap, menus: visibleMenus },
  });
});

/** PATCH /auth/profile */
const updateProfile = asyncHandler(async (req, res) => {
  await req.user.update(req.body);
  const data =
    req.auth.scope === AUTH_SCOPE.SUPER_ADMIN ? publicSuperAdmin(req.user) : publicAdmin(req.user);
  return success(res, { message: 'Profile updated successfully', data });
});

/** POST /auth/change-password */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const isSuperAdmin = req.auth.scope === AUTH_SCOPE.SUPER_ADMIN;
  const model = isSuperAdmin ? db.SuperAdmin : db.Admin;
  const account = await model.scope('withPassword').findByPk(req.auth.id);
  if (!account || !(await account.verifyPassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await account.update(
    isSuperAdmin ? { password: newPassword } : { password: newPassword, mustChangePassword: false }
  );
  return success(res, { message: 'Password changed successfully' });
});

/**
 * POST /auth/logout - tokens are stateless, so this only exists so the clients
 * have a single place to call; it always succeeds.
 */
const logout = asyncHandler(async (req, res) => success(res, { message: 'Logged out successfully' }));

module.exports = {
  superAdminLogin,
  adminLogin,
  refresh,
  me,
  updateProfile,
  changePassword,
  logout,
  publicAdmin,
  publicSuperAdmin,
};
