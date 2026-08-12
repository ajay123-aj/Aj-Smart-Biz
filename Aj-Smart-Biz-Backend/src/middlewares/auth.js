'use strict';

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/jwt');
const { AUTH_SCOPE, STATUS } = require('../constants');
const db = require('../models');

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/**
 * Verifies the JWT and reloads the principal from the database, so a
 * deactivated or soft-deleted account loses access immediately.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication token is missing');

  const payload = verifyAccessToken(token);

  if (payload.scope === AUTH_SCOPE.SUPER_ADMIN) {
    const superAdmin = await db.SuperAdmin.findByPk(payload.id);
    if (!superAdmin) throw ApiError.unauthorized('Account no longer exists');
    if (superAdmin.status !== STATUS.ACTIVE) throw ApiError.forbidden('Account is inactive');

    // `name` rides along so audit trails can record who acted without reloading.
    req.auth = {
      scope: AUTH_SCOPE.SUPER_ADMIN,
      id: superAdmin.id,
      name: superAdmin.name,
      role: superAdmin.role,
      companyId: null,
    };
    req.user = superAdmin;
    return next();
  }

  if (payload.scope === AUTH_SCOPE.ADMIN) {
    const admin = await db.Admin.findByPk(payload.id, {
      include: [
        {
          model: db.Company,
          as: 'company',
          attributes: ['id', 'name', 'code', 'status', 'themeId', 'logo', 'favicon', 'description'],
        },
        // The admin's own branch outranks the company for branding.
        { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code', 'logo', 'favicon', 'status'] },
        { model: db.Role, as: 'role', attributes: ['id', 'name', 'status'] },
      ],
    });
    if (!admin) throw ApiError.unauthorized('Account no longer exists');
    if (admin.status !== STATUS.ACTIVE) throw ApiError.forbidden('Account is inactive');
    if (!admin.company || admin.company.status !== STATUS.ACTIVE) {
      throw ApiError.forbidden('Company is inactive, please contact support');
    }

    req.auth = {
      scope: AUTH_SCOPE.ADMIN,
      id: admin.id,
      name: admin.name,
      companyId: admin.companyId,
      branchId: admin.branchId,
      roleId: admin.roleId,
      isCompanyAdmin: admin.isCompanyAdmin,
    };
    req.user = admin;
    return next();
  }

  throw ApiError.unauthorized('Invalid token scope');
});

/** Restricts a route to one of the two portals. */
const requireScope = (...scopes) => (req, res, next) => {
  if (!req.auth) return next(ApiError.unauthorized());
  if (!scopes.includes(req.auth.scope)) return next(ApiError.forbidden('This portal cannot access the resource'));
  return next();
};

const superAdminOnly = requireScope(AUTH_SCOPE.SUPER_ADMIN);
const adminOnly = requireScope(AUTH_SCOPE.ADMIN);

/** Company-admin-only routes (role management, admin management, company profile). */
const companyAdminOnly = (req, res, next) => {
  if (req.auth?.scope !== AUTH_SCOPE.ADMIN) return next(ApiError.forbidden());
  if (!req.auth.isCompanyAdmin) return next(ApiError.forbidden('Only the company main admin can perform this action'));
  return next();
};

/**
 * Menu-level permission check for company admins.
 * The main admin implicitly has every permission.
 */
const requirePermission = (menuSlug, action = 'canView') =>
  asyncHandler(async (req, res, next) => {
    if (req.auth?.scope === AUTH_SCOPE.SUPER_ADMIN) return next();
    if (req.auth?.isCompanyAdmin) return next();
    if (!req.auth?.roleId) throw ApiError.forbidden('No role assigned to this account');

    const permission = await db.RolePermission.findOne({
      where: { roleId: req.auth.roleId, companyId: req.auth.companyId },
      include: [{ model: db.Menu, as: 'menu', where: { slug: menuSlug }, attributes: ['id', 'slug'] }],
    });

    if (!permission || permission[action] !== true) {
      throw ApiError.forbidden(`Missing "${action}" permission for "${menuSlug}"`);
    }
    return next();
  });

module.exports = {
  authenticate,
  requireScope,
  superAdminOnly,
  adminOnly,
  companyAdminOnly,
  requirePermission,
};
