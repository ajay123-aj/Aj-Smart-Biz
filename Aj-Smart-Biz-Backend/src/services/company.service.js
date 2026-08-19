'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const passwordUtil = require('../utils/password');
const { generateUniqueCode, slugify } = require('./code.service');
const defaultSliders = require('../seeders/defaultSliders');
const { activateSubscription } = require('./subscription.service');
const { PERMISSION_ACTIONS, STATUS } = require('../constants');

const COMPANY_ADMIN_ROLE_NAME = 'Company Admin';

const assertEmailFree = async (model, email, extraWhere = {}, transaction = null) => {
  const existing = await model.findOne({ where: { ...extraWhere, email }, transaction });
  return !existing;
};

/**
 * Grants the company-admin role every action on every system menu, so a brand
 * new tenant is immediately usable.
 */
async function grantFullPermissions({ companyId, roleId, actorId, transaction }) {
  const menus = await db.Menu.findAll({
    where: { companyId: { [Op.or]: [null, companyId] }, status: STATUS.ACTIVE },
    attributes: ['id'],
    transaction,
  });
  if (!menus.length) return;

  const rows = menus.map((menu) => ({
    companyId,
    roleId,
    menuId: menu.id,
    ...PERMISSION_ACTIONS.reduce((acc, action) => ({ ...acc, [action]: true }), {}),
    createdBy: actorId ?? null,
  }));
  await db.RolePermission.bulkCreate(rows, { transaction });
}

/**
 * Creates a tenant end to end:
 *   company -> head-office branch -> "Company Admin" role (full permissions)
 *   -> main admin login -> optional plan subscription + payment transaction.
 *
 * The generated main-admin password is returned once and never stored in clear.
 */
async function createCompany(payload, actorId) {
  const { mainAdmin, subscription, domain, ...companyData } = payload;

  return db.sequelize.transaction(async (transaction) => {
    if (!(await assertEmailFree(db.Company, companyData.email, {}, transaction))) {
      throw ApiError.conflict('A company with this email already exists');
    }

    const code =
      companyData.code || (await generateUniqueCode(db.Company, companyData.name));
    const codeTaken = await db.Company.findOne({ where: { code }, paranoid: false, transaction });
    if (codeTaken) throw ApiError.conflict('A company with this code already exists');


    const company = await db.Company.create(
      { ...companyData, code, createdBy: actorId ?? null },
      { transaction }
    );

    const branch = await db.Branch.create(
      {
        companyId: company.id,
        name: `${company.name} - Head Office`,
        code: `${code}-HO`,
        isMain: true,
        email: company.email,
        phone: company.phone,
        gstNumber: company.gstNumber,
        stateId: company.stateId,
        addressLine1: company.addressLine1,
        addressLine2: company.addressLine2,
        city: company.city,
        pincode: company.pincode,
        createdBy: actorId ?? null,
      },
      { transaction }
    );

    // Optional convenience on create: the tenant's first (primary) host.
    if (domain) {
      const taken = await db.CompanyDomain.findOne({ where: { domain: domain.toLowerCase() }, transaction });
      if (taken) throw ApiError.conflict('That domain is already mapped to a company');
      await db.CompanyDomain.create(
        { companyId: company.id, domain, isPrimary: true, createdBy: actorId ?? null },
        { transaction }
      );
    }

    const role = await db.Role.create(
      {
        companyId: company.id,
        name: COMPANY_ADMIN_ROLE_NAME,
        slug: slugify(COMPANY_ADMIN_ROLE_NAME),
        description: 'Full access to every module of the company',
        isSystem: true,
        createdBy: actorId ?? null,
      },
      { transaction }
    );

    await grantFullPermissions({ companyId: company.id, roleId: role.id, actorId, transaction });

    /**
     * Three company-wide hero slides, so the tenant's website has a working
     * carousel before anyone opens Slider Management. Ordinary rows from here
     * on — the company edits or deletes them like any other.
     */
    await db.Slider.bulkCreate(
      defaultSliders.map((slide) => ({
        ...slide,
        title: slide.title.replace('{company}', company.name),
        companyId: company.id,
        branchId: null,
        createdBy: actorId ?? null,
      })),
      { transaction }
    );

    const adminEmail = (mainAdmin?.email || company.email).toLowerCase();
    if (!(await assertEmailFree(db.Admin, adminEmail, {}, transaction))) {
      throw ApiError.conflict(`An admin with email ${adminEmail} already exists`);
    }

    const generatedPassword = mainAdmin?.password ? null : passwordUtil.random(12);
    const admin = await db.Admin.create(
      {
        companyId: company.id,
        branchId: branch.id,
        roleId: role.id,
        name: mainAdmin?.name || `${company.name} Admin`,
        email: adminEmail,
        phone: mainAdmin?.phone || company.phone,
        password: mainAdmin?.password || generatedPassword || config.defaultCompanyAdminPassword,
        isCompanyAdmin: true,
        mustChangePassword: !mainAdmin?.password,
        createdBy: actorId ?? null,
      },
      { transaction }
    );

    let subscriptionResult = null;
    if (subscription?.planId) {
      subscriptionResult = await activateSubscription({
        company,
        payload: subscription,
        actorId,
        transaction,
      });
    }

    return {
      company,
      branch,
      role,
      admin: { id: admin.id, name: admin.name, email: admin.email },
      // Surfaced once so the super admin can hand it over; not persisted in clear text.
      mainAdminPassword: generatedPassword,
      subscription: subscriptionResult?.subscription ?? null,
      transaction: subscriptionResult?.transaction ?? null,
    };
  });
}

/** Detail payload used by the "view company" screen. */
const companyDetailInclude = () => [
  { model: db.BusinessType, as: 'businessType', attributes: ['id', 'name'] },
  {
    model: db.CompanyDomain,
    as: 'domains',
    include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'] }],
  },
  { model: db.Theme, as: 'theme', attributes: ['id', 'name', 'primaryColor', 'secondaryColor', 'mode'] },
  { model: db.State, as: 'state', attributes: ['id', 'name', 'code'] },
  {
    model: db.Branch,
    as: 'branches',
    include: [
      { model: db.State, as: 'state', attributes: ['id', 'name'] },
      { model: db.BranchContact, as: 'contacts' },
    ],
  },
  {
    model: db.CompanySubscription,
    as: 'subscriptions',
    include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'billingCycle', 'currency'] }],
  },
];

module.exports = {
  createCompany,
  grantFullPermissions,
  companyDetailInclude,
  COMPANY_ADMIN_ROLE_NAME,
};
