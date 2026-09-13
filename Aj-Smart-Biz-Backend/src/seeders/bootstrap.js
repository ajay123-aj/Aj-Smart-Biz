'use strict';

const db = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');
const { menus: defaultMenus } = require('./defaultMenus');
const defaultSliders = require('./defaultSliders');
const { Op } = require('sequelize');
const { uniqueSlug } = require('../utils/slug');
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
 * Carries every existing tenant across the day the enquiry button and the diary
 * became functionalities of their own.
 *
 * Without this the split is a silent regression on live websites. Both were
 * settings inside `services` this morning; from tonight they are grants, and no
 * plan sold before today lists either - so every company with an enquiry button
 * on its service cards would have none, for a change of ours rather than one of
 * theirs. Nobody was asked, and the answer would have been no.
 *
 * Three passes, in the order the grant is actually read - the same shape
 * `ensureFiguresGrant` uses, and for the same reason:
 *
 *   1. **Plans.** Anything that sells Services now sells Service enquiries too.
 *      That is what the key was when it was a setting inside Services, so it is
 *      what a customer paid for. Appointments are **not** added: the diary was
 *      off by default and a tenant who never switched it on was never sold it.
 *   2. **Live subscriptions.** The grant is read off `planSnapshot` where a term
 *      has one, precisely so re-pricing a plan cannot change what a running
 *      subscription was sold. That protection would freeze this fix out, so the
 *      snapshots are amended with it.
 *   3. **The switch rows.** A company with Services switched on had an enquiry
 *      button this morning unless it had turned the button off, so it gets a
 *      `service_enquiry` row in the state it was actually in. A company that had
 *      switched the **diary** on gets `service_booking` switched on to match -
 *      restoring what was already there, which is the only thing this may do.
 *
 * Idempotent throughout: every pass skips what already carries the key.
 */
async function ensureServiceGrants() {
  /**
   * Which tenants were actually *using* the diary this morning.
   *
   * Read first, because it decides what the plans have to sell. A company with
   * `booking.enabled` was taking appointments on its website under the plan it
   * is on - so that plan effectively included them, whatever it says, and adding
   * the key is describing what was already true rather than giving anything
   * away.
   */
  const services = await db.CompanyFunctionality.findAll({ where: { key: FUNCTIONALITY.SERVICES } });

  const hadBooking = new Set(
    services.filter((row) => row.settings?.booking?.enabled === true).map((row) => row.companyId)
  );

  /* The running term for each of those, so the right plan is amended. */
  const terms = hadBooking.size
    ? await db.CompanySubscription.findAll({
      where: {
        companyId: { [Op.in]: [...hadBooking] },
        status: { [Op.in]: [STATUS.ACTIVE, 'pending', 'suspended'] },
      },
      attributes: ['id', 'companyId', 'planId', 'planSnapshot'],
    })
    : [];

  const bookingPlans = new Set(terms.map((term) => term.planId).filter(Boolean));

  const withKeys = (list, keys) => {
    if (!Array.isArray(list)) return null;
    if (!list.includes(FUNCTIONALITY.SERVICES)) return null;

    const missing = keys.filter((key) => !list.includes(key));
    return missing.length ? [...list, ...missing] : null;
  };

  /* ---- 1. the plans ---- */
  const plans = await db.Plan.findAll({ attributes: ['id', 'functionalities'] });
  let planned = 0;

  for (const plan of plans) {
    /**
     * Everything that sells Services now sells the enquiry: that is what the
     * button was when it lived inside Services, so it is what a customer paid
     * for. Appointments are added **only** to a plan somebody was actually
     * running a diary on - a feature nobody switched on was never sold, and
     * handing it to every plan on the platform is not a backfill's business.
     */
    const keys = [FUNCTIONALITY.SERVICE_ENQUIRY];
    if (bookingPlans.has(plan.id)) keys.push(FUNCTIONALITY.SERVICE_BOOKING);

    const next = withKeys(plan.functionalities, keys);
    if (!next) continue;

    // eslint-disable-next-line no-await-in-loop
    await plan.update({ functionalities: next });
    planned += 1;
  }

  /* ---- 2. the running terms ---- */
  const subscriptions = await db.CompanySubscription.findAll({
    where: { status: { [Op.in]: [STATUS.ACTIVE, 'pending', 'suspended'] } },
    attributes: ['id', 'companyId', 'planSnapshot'],
  });
  let snapshots = 0;

  for (const subscription of subscriptions) {
    /* The snapshot is what a live term is actually read from - amending the plan
       alone would leave every running subscription without the key. */
    const keys = [FUNCTIONALITY.SERVICE_ENQUIRY];
    if (hadBooking.has(subscription.companyId)) keys.push(FUNCTIONALITY.SERVICE_BOOKING);

    const snapshot = subscription.planSnapshot;
    const next = withKeys(snapshot?.functionalities, keys);
    if (!next) continue;

    // eslint-disable-next-line no-await-in-loop
    await subscription.update({ planSnapshot: { ...snapshot, functionalities: next } });
    snapshots += 1;
  }

  /* ---- 3. the switch rows ---- */
  let switched = 0;

  for (const row of services) {
    const settings = row.settings ?? {};

    /* What the tenant actually had this morning: the button unless they had
       turned it off, and the diary only if they had turned it on. */
    const wanted = [
      { key: FUNCTIONALITY.SERVICE_ENQUIRY, on: settings.showEnquiry !== false },
      { key: FUNCTIONALITY.SERVICE_BOOKING, on: settings.booking?.enabled === true },
    ];

    for (const entry of wanted) {
      // eslint-disable-next-line no-await-in-loop
      const [, created] = await db.CompanyFunctionality.findOrCreate({
        where: { companyId: row.companyId, key: entry.key },
        defaults: {
          companyId: row.companyId,
          key: entry.key,
          status: entry.on && row.status === STATUS.ACTIVE ? STATUS.ACTIVE : STATUS.INACTIVE,
        },
      });
      if (created) switched += 1;
    }
  }

  if (planned || snapshots || switched) {
    logger.info(
      `Service enquiries/appointments carried over: ${planned} plan(s), ${snapshots} subscription(s), ${switched} switch row(s)`
    );
  }
}

/**
 * Gives an address to every row that gained one after it already existed.
 *
 * ### Why this is needed at all
 *
 * `company_services.slug` was added to a table with rows in it. `sync({alter})`
 * adds the column as `NOT NULL`, and the database fills what is already there
 * with the empty string - so on the morning after the upgrade, every service a
 * tenant had written was published at `/services/` instead of at
 * `/services/fuse-box-replacement`.
 *
 * What that looks like from the outside is the worst kind of bug: the console
 * shows the service, the website shows the card, and **clicking it goes back to
 * the list**. Nothing errors, nothing is logged, and the tenant reasonably
 * concludes the whole feature is broken. A slug is only generated on create, so
 * without this the rows would stay that way until somebody opened and re-saved
 * all of them by hand.
 *
 * ### What it does
 *
 * One pass per table that gained a slug late, filling only the rows that have
 * none. The address is built from the row's own name and made unique within its
 * tenant by the same function the create path uses, so a backfilled service is
 * addressed exactly as a new one would have been.
 *
 * Soft-deleted rows are included deliberately (`paranoid: false`): a tenant who
 * restores a service should get a working page rather than the one row in the
 * table that is still broken.
 *
 * Idempotent, and cheap on every boot after the first - it is one `WHERE slug IS
 * NULL OR slug = ''` per table, which finds nothing once this has run.
 */
async function ensureSlugs() {
  const tables = [
    { model: db.CompanyService, from: 'title', label: 'service' },
    /* Categories cannot have legacy rows today - the table is new - but the
       same ALTER hazard applies the moment anything is added beside them, and
       one more empty query on boot is a fair price for not meeting this twice. */
    { model: db.CompanyServiceCategory, from: 'name', label: 'service category' },
  ];

  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await table.model.findAll({
      where: { [Op.or]: [{ slug: null }, { slug: '' }] },
      paranoid: false,
    });
    if (!rows.length) continue;

    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const slug = await uniqueSlug(table.model, row.companyId, row[table.from], row.id);
      // eslint-disable-next-line no-await-in-loop
      await row.update({ slug }, { hooks: false });
    }

    logger.info(`Gave ${rows.length} ${table.label}(s) a web address they were missing`);
  }
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
  /* After the schema sync that created the column, and before anything serves a
     page from it. */
  await ensureSlugs();
  await ensureServiceGrants();
  await ensureSlideLinks();
}

module.exports = {
  runBootstrap,
  ensureSlugs,
  ensureServiceGrants,
  ensureSuperAdmin,
  ensureSystemMenus,
  ensureSystemRolePermissions,
  ensureReferenceData,
  ensureDefaultSliders,
  ensureAboutRows,
  ensureFiguresGrant,
  ensureSlideLinks,
};
