'use strict';

const db = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');
const defaultMenus = require('./defaultMenus');
const defaultSliders = require('./defaultSliders');
const { SUPER_ADMIN_ROLE, STATUS, PERMISSION_ACTIONS } = require('../constants');

/**
 * Runs on every boot: if no root super admin exists it is created from the
 * SUPER_ADMIN_* environment variables. An existing root account is never
 * overwritten - only reactivated if someone disabled it.
 */
async function ensureSuperAdmin() {
  const existing = await db.SuperAdmin.findOne({
    where: { email: config.superAdmin.email },
    paranoid: false,
  });

  if (existing) {
    const patch = {};
    if (existing.deletedAt) await existing.restore();
    if (existing.status !== STATUS.ACTIVE) patch.status = STATUS.ACTIVE;
    if (!existing.isRoot) patch.isRoot = true;
    if (existing.role !== SUPER_ADMIN_ROLE.SUPER_ADMIN) patch.role = SUPER_ADMIN_ROLE.SUPER_ADMIN;
    if (Object.keys(patch).length) {
      await existing.update(patch);
      logger.info(`Root super admin restored/re-activated: ${existing.email}`);
    } else {
      logger.info(`Root super admin already present: ${existing.email}`);
    }
    return existing;
  }

  const superAdmin = await db.SuperAdmin.create({
    name: config.superAdmin.name,
    email: config.superAdmin.email,
    phone: config.superAdmin.phone,
    password: config.superAdmin.password, // hashed by the model hook
    role: SUPER_ADMIN_ROLE.SUPER_ADMIN,
    isRoot: true,
    status: STATUS.ACTIVE,
  });

  logger.info('==================================================');
  logger.info(' Root super admin created from environment config');
  logger.info(` email    : ${superAdmin.email}`);
  logger.info(` password : ${config.isProd ? '(see SUPER_ADMIN_PASSWORD)' : config.superAdmin.password}`);
  logger.info('==================================================');
  return superAdmin;
}

/**
 * Inserts any missing system menu and reconciles the presentation of the ones
 * already there, so a change to `defaultMenus` reaches existing installs.
 * `status` is deliberately left alone - disabling a menu is an operator choice.
 */
async function ensureSystemMenus() {
  let inserted = 0;
  let updated = 0;

  for (const menu of defaultMenus) {
    // eslint-disable-next-line no-await-in-loop
    const [row, created] = await db.Menu.findOrCreate({
      where: { slug: menu.slug, companyId: null },
      defaults: { ...menu, companyId: null, isSystem: true, status: STATUS.ACTIVE },
    });
    if (created) {
      inserted += 1;
      continue;
    }

    const patch = {};
    ['name', 'icon', 'route', 'sequence'].forEach((field) => {
      const next = menu[field] ?? null;
      if ((row[field] ?? null) !== next) patch[field] = next;
    });
    if (!row.isSystem) patch.isSystem = true;

    if (Object.keys(patch).length) {
      // eslint-disable-next-line no-await-in-loop
      await row.update(patch);
      updated += 1;
    }
  }

  if (inserted) logger.info(`Seeded ${inserted} system menu(s)`);
  if (updated) logger.info(`Updated ${updated} system menu(s)`);
}

/**
 * Gives every tenant's built-in "Company Admin" role full rights on any system
 * menu added since that tenant was created.
 *
 * Without this, adding a menu leaves existing companies unable to reach it: the
 * main admin bypasses permission checks and would see it, but anyone else on the
 * system role would not, which looks like the feature shipped broken. Only
 * `is_system` roles are touched - roles the company built itself are its own
 * business, and stay exactly as configured.
 */
async function ensureSystemRolePermissions() {
  const [systemMenus, systemRoles] = await Promise.all([
    db.Menu.findAll({ where: { companyId: null }, attributes: ['id'] }),
    db.Role.findAll({ where: { isSystem: true }, attributes: ['id', 'companyId'] }),
  ]);
  if (!systemMenus.length || !systemRoles.length) return;

  const existing = await db.RolePermission.findAll({
    where: { roleId: systemRoles.map((role) => role.id) },
    attributes: ['roleId', 'menuId'],
    raw: true,
  });
  const held = new Set(existing.map((row) => `${row.roleId}:${row.menuId}`));

  const allActions = PERMISSION_ACTIONS.reduce((acc, action) => ({ ...acc, [action]: true }), {});
  const missing = [];
  systemRoles.forEach((role) => {
    systemMenus.forEach((menu) => {
      if (held.has(`${role.id}:${menu.id}`)) return;
      missing.push({ companyId: role.companyId, roleId: role.id, menuId: menu.id, ...allActions });
    });
  });

  if (!missing.length) return;
  await db.RolePermission.bulkCreate(missing);
  logger.info(`Granted ${missing.length} missing system-menu permission(s) to company-admin roles`);
}

/** A handful of Indian states + business types so the UI is not empty on day one. */
async function ensureReferenceData() {
  const states = [
    ['Gujarat', 'GJ', '24'],
    ['Maharashtra', 'MH', '27'],
    ['Delhi', 'DL', '07'],
    ['Karnataka', 'KA', '29'],
    ['Tamil Nadu', 'TN', '33'],
    ['Rajasthan', 'RJ', '08'],
    ['Uttar Pradesh', 'UP', '09'],
    ['West Bengal', 'WB', '19'],
  ];
  for (const [name, code, gstCode] of states) {
    // eslint-disable-next-line no-await-in-loop
    await db.State.findOrCreate({ where: { name }, defaults: { name, code, gstCode, country: 'India' } });
  }

  const businessTypes = ['Retail', 'Wholesale', 'Manufacturing', 'Services', 'Restaurant', 'Healthcare', 'Education'];
  for (const name of businessTypes) {
    // eslint-disable-next-line no-await-in-loop
    await db.BusinessType.findOrCreate({
      where: { name },
      defaults: { name, slug: name.toLowerCase() },
    });
  }

  await db.Theme.findOrCreate({
    where: { name: 'Aj Default' },
    defaults: {
      name: 'Aj Default',
      code: 'aj-default',
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      accentColor: '#22c55e',
      mode: 'light',
      isDefault: true,
    },
  });
}

/**
 * Gives any company that has no slides at all the three defaults.
 *
 * New tenants get them during provisioning; this covers the ones that existed
 * before the feature did, so nobody opens Slider Management to an empty screen
 * or serves a website with no hero. A company that deleted every slide on
 * purpose would get them back, which is the trade for never leaving a site
 * blank — deactivating a slide, rather than deleting it, keeps it gone.
 */
async function ensureDefaultSliders() {
  const companies = await db.Company.findAll({ attributes: ['id', 'name'] });
  if (!companies.length) return;

  const withSliders = await db.Slider.findAll({
    attributes: ['companyId'],
    group: ['companyId'],
    raw: true,
  });
  const covered = new Set(withSliders.map((row) => row.companyId));

  const rows = [];
  companies.forEach((company) => {
    if (covered.has(company.id)) return;
    defaultSliders.forEach((slide) => {
      rows.push({
        ...slide,
        title: slide.title.replace('{company}', company.name),
        companyId: company.id,
        branchId: null,
        status: STATUS.ACTIVE,
      });
    });
  });

  if (!rows.length) return;
  await db.Slider.bulkCreate(rows);
  logger.info(`Seeded ${rows.length} default slide(s) across ${rows.length / defaultSliders.length} company(ies)`);
}

async function runBootstrap() {
  await ensureSuperAdmin();
  await ensureSystemMenus();
  await ensureSystemRolePermissions();
  await ensureReferenceData();
  await ensureDefaultSliders();
}

module.exports = {
  runBootstrap,
  ensureSuperAdmin,
  ensureSystemMenus,
  ensureSystemRolePermissions,
  ensureReferenceData,
  ensureDefaultSliders,
};
