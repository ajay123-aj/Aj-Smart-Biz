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

  /**
   * A customer of one tenant — a member of the public, not staff.
   *
   * Reloaded on every request like the other two, so a customer the shop bars
   * loses access immediately rather than at the end of their token's life. Their
   * **company** is checked too: a tenant that is switched off has no website, so
   * it has no customers who can be signed in to it.
   *
   * `companyId` is taken from the **token**, never from the request. It is what
   * pins every `/theme/me/*` route to one tenant, and it is why a customer of
   * one shop cannot read another's orders by changing a path.
   */
  if (payload.scope === AUTH_SCOPE.CUSTOMER) {
    const customer = await db.Customer.findByPk(payload.id, {
      include: [{ model: db.Company, as: 'company', attributes: ['id', 'name', 'status'] }],
    });
    if (!customer) throw ApiError.unauthorized('Account no longer exists');
    if (customer.status !== STATUS.ACTIVE) throw ApiError.forbidden('This account is no longer active');
    if (!customer.company || customer.company.status !== STATUS.ACTIVE) {
      throw ApiError.forbidden('This website is not available at the moment');
    }

    req.auth = {
      scope: AUTH_SCOPE.CUSTOMER,
      id: customer.id,
      name: customer.name,
      companyId: customer.companyId,
    };
    req.customer = customer;
    return next();
  }

  throw ApiError.unauthorized('Invalid token scope');
});

/**
 * The same check, but a **missing token is not an error**.
 *
 * For the one route that genuinely works both ways: placing an order. A signed-in
 * customer gets their order filed against their account and their saved address
 * offered; a stranger gets exactly the checkout the site had before accounts
 * existed. Refusing the stranger to tidy a foreign key would be turning away
 * money.
 *
 * A token that is present and **bad** still fails. Somebody whose session has
 * expired mid-checkout needs to be told, not quietly demoted to a guest and left
 * wondering why the order is not in their history.
 */
const authenticateOptional = asyncHandler(async (req, res, next) => {
  if (!extractToken(req)) return next();
  return authenticate(req, res, next);
});

/** Restricts a route to one of the two portals. */
const requireScope = (...scopes) => (req, res, next) => {
  if (!req.auth) return next(ApiError.unauthorized());
  if (!scopes.includes(req.auth.scope)) return next(ApiError.forbidden('This portal cannot access the resource'));
  return next();
};

const superAdminOnly = requireScope(AUTH_SCOPE.SUPER_ADMIN);
const adminOnly = requireScope(AUTH_SCOPE.ADMIN);
/**
 * Customer routes, and **only** customer routes.
 *
 * Stated rather than assumed: `/theme/me/*` is mounted outside the admin
 * prefixes, but a staff token reaching a customer route would resolve
 * `req.auth.id` to an admin's id and read somebody else's addresses. The scope
 * check is what makes that impossible rather than merely unlikely.
 */
const customerOnly = requireScope(AUTH_SCOPE.CUSTOMER);

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
  authenticateOptional,
  requireScope,
  customerOnly,
  superAdminOnly,
  adminOnly,
  companyAdminOnly,
  requirePermission,
};
