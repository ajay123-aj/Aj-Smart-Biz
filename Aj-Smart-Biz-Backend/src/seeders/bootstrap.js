'use strict';

const db = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');
const { menus: defaultMenus } = require('./defaultMenus');
const defaultSliders = require('./defaultSliders');
const { SUPER_ADMIN_ROLE, STATUS, PERMISSION_ACTIONS, FUNCTIONALITY } = require('../constants');

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
  const rows = new Map();

  for (const menu of defaultMenus) {
    // `parent` is a slug, not a column; it is resolved to `parentId` below,
    // once every row is guaranteed to exist.
    const { parent, ...columns } = menu;

    // eslint-disable-next-line no-await-in-loop
    const [row, created] = await db.Menu.findOrCreate({
      where: { slug: menu.slug, companyId: null },
      defaults: { ...columns, companyId: null, isSystem: true, status: STATUS.ACTIVE },
    });
    rows.set(menu.slug, row);

    if (created) {
      inserted += 1;
      continue;
    }

    const patch = {};
    ['name', 'icon', 'route', 'sequence'].forEach((field) => {
      const next = columns[field] ?? null;
      if ((row[field] ?? null) !== next) patch[field] = next;
    });
    if (!row.isSystem) patch.isSystem = true;

    if (Object.keys(patch).length) {
      // eslint-disable-next-line no-await-in-loop
      await row.update(patch);
      updated += 1;
    }
  }

  /**
   * Nesting, in a second pass. Doing it here rather than inline means a child
   * may be listed before its parent, and means an install that predates the
   * submenus gets them attached rather than left flat at the top level.
   */
  let nested = 0;
  for (const menu of defaultMenus) {
    const row = rows.get(menu.slug);
    const parentId = menu.parent ? rows.get(menu.parent)?.id ?? null : null;
    if (!row || (row.parentId ?? null) === parentId) continue;

    // eslint-disable-next-line no-await-in-loop
    await row.update({ parentId });
    nested += 1;
  }

  if (inserted) logger.info(`Seeded ${inserted} system menu(s)`);
  if (updated) logger.info(`Updated ${updated} system menu(s)`);
  if (nested) logger.info(`Re-parented ${nested} system menu(s)`);
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

/**
 * Moves any About copy still living on `company_functionalities.settings` into
 * its own `company_about` row.
 *
 * About started as a single blob per tenant, which was fine until it became
 * branch-aware — a company can now have one copy per branch, and that is a
 * table, not a JSON field. This runs once per company: it writes the
 * company-wide row (`branch_id NULL`) and clears the old blob, so a tenant that
 * wrote its About before the change does not open the screen to empty fields.
 *
 * Safe to run repeatedly — a company that already has a company-wide row is
 * skipped, so it never overwrites copy edited since the move.
 */
async function ensureAboutRows() {
  const legacy = await db.CompanyFunctionality.findAll({
    where: { key: FUNCTIONALITY.ABOUT_US },
    attributes: ['id', 'companyId', 'settings'],
  });
  if (!legacy.length) return;

  let moved = 0;
  for (const row of legacy) {
    const settings = row.settings;
    // Nothing worth keeping: no blob, or a blob with every field empty.
    const hasCopy =
      settings && typeof settings === 'object' &&
      ['eyebrow', 'title', 'lead', 'body'].some((field) => settings[field]);
    if (!hasCopy) continue;

    // eslint-disable-next-line no-await-in-loop
    const existing = await db.CompanyAbout.findOne({
      where: { companyId: row.companyId, branchId: null },
      attributes: ['id'],
    });

    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      await db.CompanyAbout.create({
        companyId: row.companyId,
        branchId: null,
        eyebrow: settings.eyebrow ?? null,
        title: settings.title ?? null,
        lead: settings.lead ?? null,
        body: settings.body ?? null,
      });
      moved += 1;
    }

    // Cleared either way: the blob is no longer read, and leaving it behind
    // would look like a second source of truth to anyone reading the table.
    // eslint-disable-next-line no-await-in-loop
    await row.update({ settings: null });
  }

  if (moved) logger.info(`Moved ${moved} About copy/copies into company_about`);
}

/**
 * Repoints slide buttons that still aim at sections the template no longer has.
 *
 * The websites used to be one page of anchors. About and Contact are real pages
 * now, and the template's own "what we do" and "why us" sections are gone — so
 * a slide seeded with `#services` is a button that scrolls nowhere. Nothing in
 * the tenant's own writing is touched: only these five exact anchor values are
 * rewritten, and a slide pointing anywhere else is left alone.
 *
 * This edits tenant rows, which is not something a boot task should normally
 * do. It is justified here because the links were broken *by* the template
 * change rather than by the tenant, and a dead button on a live website is not
 * something to leave sitting until somebody notices.
 */
const DEAD_SLIDE_LINKS = {
  '#services': '/about',
  '#why': '/about',
  '#about': '/about',
  '#contact': '/contact',
  '#home': '/',
};

async function ensureSlideLinks() {
  let moved = 0;

  for (const [from, to] of Object.entries(DEAD_SLIDE_LINKS)) {
    // eslint-disable-next-line no-await-in-loop
    const [count] = await db.Slider.update({ ctaUrl: to }, { where: { ctaUrl: from } });
    moved += count;
  }

  if (moved) logger.info(`Repointed ${moved} slide button(s) from removed page anchors`);
}

/**
 * Carries every existing tenant across the day Figures stopped being part of
 * About us and became a functionality of its own.
 *
 * Without this the split is a silent regression on live websites: the band is
 * gated on `figures`, no plan sold before today lists it, so every company that
 * had figures on its home page this morning would have none tonight — for a
 * change of ours, not a change of theirs. Nobody was asked whether they wanted
 * that, and the answer would have been no.
 *
 * Three passes, in the order the grant is actually read:
 *
 *   1. **Plans.** Anything that sells About us now sells Figures too. That is
 *      what the two keys were when they were one, so it is what a customer paid
 *      for. A platform that wants to sell them apart from here on can simply
 *      untick one — this only ever adds, and only to a plan that lacks it.
 *   2. **Live subscriptions.** The grant is read off `planSnapshot` when a term
 *      has one, precisely so re-pricing a plan cannot change what a running
 *      subscription was sold. That protection would freeze this fix out, so the
 *      snapshots are amended with it.
 *   3. **The switch rows.** A company with figures already written and About
 *      switched on had a band on its website. It gets a `figures` row switched
 *      on to match, so the band it had is the band it keeps. A company with no
 *      figures written gets nothing: it had no band, and switching a feature on
 *      for somebody is not ours to do beyond restoring what was already there.
 *
 * Idempotent throughout — every pass skips what already carries the key — so
 * it costs three cheap queries on every boot after the first.
 */
async function ensureFiguresGrant() {
  const withFigures = (list) => {
    if (!Array.isArray(list)) return null;
    if (!list.includes(FUNCTIONALITY.ABOUT_US) || list.includes(FUNCTIONALITY.FIGURES)) return null;
    return [...list, FUNCTIONALITY.FIGURES];
  };

  /* ---- 1. the plans ---- */
  let plans = 0;
  for (const plan of await db.Plan.findAll({ attributes: ['id', 'functionalities'] })) {
    const next = withFigures(plan.functionalities);
    if (!next) continue;
    // eslint-disable-next-line no-await-in-loop
    await plan.update({ functionalities: next });
    plans += 1;
  }

  /* ---- 2. the snapshots on running terms ---- */
  let terms = 0;
  for (const term of await db.CompanySubscription.findAll({ attributes: ['id', 'planSnapshot'] })) {
    const snapshot = term.planSnapshot;
    if (!snapshot || typeof snapshot !== 'object') continue;

    const next = withFigures(snapshot.functionalities);
    if (!next) continue;
    // A new object rather than a mutation: sequelize compares JSON columns by
    // reference, and an in-place push would not be seen as a change to save.
    // eslint-disable-next-line no-await-in-loop
    await term.update({ planSnapshot: { ...snapshot, functionalities: next } });
    terms += 1;
  }

  /* ---- 3. the switch rows, for anyone who actually had a band ---- */
  let switched = 0;
  const companiesWithFigures = await db.CompanyStat.findAll({
    attributes: ['companyId'],
    group: ['companyId'],
    raw: true,
  });

  for (const { companyId } of companiesWithFigures) {
    // eslint-disable-next-line no-await-in-loop
    const [about, existing] = await Promise.all([
      db.CompanyFunctionality.findOne({ where: { companyId, key: FUNCTIONALITY.ABOUT_US } }),
      db.CompanyFunctionality.findOne({ where: { companyId, key: FUNCTIONALITY.FIGURES } }),
    ]);

    // Only ever mirrors what About was: a company that had it switched off had
    // no band either, and must not gain one from a migration.
    if (existing || about?.status !== STATUS.ACTIVE) continue;

    // eslint-disable-next-line no-await-in-loop
    await db.CompanyFunctionality.create({
      companyId,
      key: FUNCTIONALITY.FIGURES,
      status: STATUS.ACTIVE,
      settings: null,
      createdBy: null,
    });
    switched += 1;
  }

  if (plans || terms || switched) {
    logger.info(
      `Figures split: ${plans} plan(s), ${terms} subscription snapshot(s), ${switched} company switch row(s)`
    );
  }
}

async function runBootstrap() {
  await ensureSuperAdmin();
  await ensureSystemMenus();
  await ensureSystemRolePermissions();
  await ensureReferenceData();
  await ensureDefaultSliders();
  await ensureAboutRows();
  await ensureFiguresGrant();
  await ensureSlideLinks();
}

module.exports = {
  runBootstrap,
  ensureSuperAdmin,
  ensureSystemMenus,
  ensureSystemRolePermissions,
  ensureReferenceData,
  ensureDefaultSliders,
  ensureAboutRows,
  ensureFiguresGrant,
  ensureSlideLinks,
};
