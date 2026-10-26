'use strict';

/**
 * **Duplicate company**: a new tenant created with another one's set-up.
 *
 * The new company is made by `createCompany`, exactly like one typed in, with
 * its own name, code, email, domain, main admin and plan. That part cannot be
 * copied, because every one of them is unique or belongs to a person. What is
 * copied is what the super admin ticks (see `DUPLICATE_SECTION`):
 *
 *  - `website`       hero slides, About, Contact, benefit cards, figures, team,
 *                    gallery, social links, WhatsApp numbers, which sections
 *                    are switched on and how they are worded, and the theme
 *  - `services`      service categories (with their nesting) and services
 *  - `products`      product categories (with their nesting) and products
 *  - `blog`          posts, with their publish dates
 *  - `testimonials`  approved reviews only, without the reviewer's contact details
 *  - `branches`      branches and their contacts, up to what the new plan allows
 *  - `roles`         custom roles and their menu permissions
 *
 * Never copied: admins, customers, orders, leads, stock counts, subscriptions
 * and payments. Those are the original business's own history, not its set-up.
 *
 * **All or nothing.** The company and everything copied into it are written
 * in one transaction, so a failure leaves no half-made tenant behind.
 *
 * **Files are copied, not shared.** Every `/uploads/...` path is duplicated
 * on disk. Deleting a product image removes its file (`removeUploadedFile`),
 * and two companies pointing at one file would let one of them break the
 * other's website. Files written for a duplicate that then fails are removed.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../models');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { createCompany } = require('./company.service');
const { uploadRoot, toPublicPath } = require('../middlewares/upload');
const { DUPLICATE_SECTION, TESTIMONIAL_MODERATION } = require('../constants');

/** Never carried across: the row's identity and its own timestamps. */
const OWN_COLUMNS = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy'];

/** Columns that may hold an uploaded file's public path. */
const FILE_COLUMNS = ['image', 'mobileImage', 'photo', 'coverImage', 'logo', 'favicon'];
const FILE_LIST_COLUMNS = ['images'];

/**
 * What each section copies, in the order it must be written: a parent table
 * before anything that refers to it.
 *
 *  - `key`    remembers old id -> new id, for a later table's `refs`
 *  - `refs`   columns pointing at an earlier table, by that table's `key`
 *  - `tree`   the table nests on `parentId`
 *  - `strip`  columns cleared on the copy
 */
const PLAN = {
  [DUPLICATE_SECTION.WEBSITE]: [
    { model: 'Slider', label: 'sliders' },
    { model: 'CompanyAbout', label: 'about' },
    { model: 'CompanyContact', label: 'contactPage' },
    { model: 'CompanyFeature', label: 'features' },
    { model: 'CompanyStat', label: 'figures' },
    { model: 'CompanyTeamMember', label: 'team' },
    { model: 'CompanyGalleryItem', label: 'gallery' },
    { model: 'CompanySocialLink', label: 'socialLinks' },
    { model: 'CompanyWhatsapp', label: 'whatsapp' },
    { model: 'CompanyFunctionality', label: 'sections' },
  ],
  [DUPLICATE_SECTION.SERVICES]: [
    { model: 'CompanyServiceCategory', label: 'serviceCategories', key: 'serviceCategory', tree: true },
    { model: 'CompanyService', label: 'services', refs: { categoryId: 'serviceCategory' } },
  ],
  [DUPLICATE_SECTION.PRODUCTS]: [
    { model: 'CompanyCategory', label: 'productCategories', key: 'productCategory', tree: true },
    { model: 'CompanyProduct', label: 'products', refs: { categoryId: 'productCategory' } },
  ],
  [DUPLICATE_SECTION.BLOG]: [{ model: 'CompanyBlogPost', label: 'blog' }],
  [DUPLICATE_SECTION.TESTIMONIALS]: [
    {
      model: 'CompanyTestimonial',
      label: 'testimonials',
      where: { moderation: TESTIMONIAL_MODERATION.APPROVED },
      strip: ['authorEmail', 'authorPhone', 'submittedIp', 'moderatedBy'],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

/**
 * A fresh copy of an uploaded file, beside the original, named the way
 * `upload.js` names files. Anything that is not an existing upload (an
 * absolute URL, a missing file) is returned unchanged.
 */
function copyUpload(ctx, publicPath) {
  const prefix = `${config.uploads.publicPath}/`;
  if (typeof publicPath !== 'string' || !publicPath.startsWith(prefix)) return publicPath;

  const absolute = path.resolve(uploadRoot, publicPath.slice(prefix.length));
  if (!absolute.startsWith(uploadRoot + path.sep) || !fs.existsSync(absolute)) return publicPath;

  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${path.extname(absolute)}`;
  const target = path.join(path.dirname(absolute), name);
  fs.copyFileSync(absolute, target);
  ctx.files.push(target);
  return toPublicPath({ path: target });
}

function copyFiles(ctx, values) {
  FILE_COLUMNS.forEach((column) => {
    if (values[column]) values[column] = copyUpload(ctx, values[column]);
  });
  FILE_LIST_COLUMNS.forEach((column) => {
    if (Array.isArray(values[column])) values[column] = values[column].map((file) => copyUpload(ctx, file));
  });
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

const count = (ctx, label, by = 1) => {
  ctx.copied[label] = (ctx.copied[label] ?? 0) + by;
};

/** A row's values, ready to be written into the new company. */
function cloneValues(ctx, row) {
  /* Spread, because `get({ plain: true })` can hand back the row's own
     `dataValues`, and deleting `id` from that would erase the source row's id
     that the old -> new maps are keyed on. */
  const values = { ...row.get({ plain: true }) };
  OWN_COLUMNS.forEach((column) => delete values[column]);
  values.companyId = ctx.targetId;
  values.createdBy = ctx.actorId;
  copyFiles(ctx, values);
  return values;
}

/**
 * Copies one table. A row tied to a branch that was not copied is skipped
 * rather than turned company-wide, which would put a branch's own page or
 * slide on every branch of the new company.
 */
async function copyTable(ctx, step) {
  const model = db[step.model];
  const rows = await model.findAll({
    where: { companyId: ctx.sourceId, ...(step.where ?? {}) },
    order: [['id', 'ASC']],
    transaction: ctx.transaction,
  });

  const ids = step.key ? (ctx.ids[step.key] = new Map()) : null;
  const children = [];

  for (const row of rows) {
    const values = cloneValues(ctx, row);

    if (values.branchId !== undefined && values.branchId !== null) {
      const branchId = ctx.branchIds.get(values.branchId);
      if (!branchId) {
        ctx.skipped.branchContent = (ctx.skipped.branchContent ?? 0) + 1;
        continue;
      }
      values.branchId = branchId;
    }

    Object.entries(step.refs ?? {}).forEach(([column, key]) => {
      if (values[column] !== null && values[column] !== undefined) values[column] = ctx.ids[key]?.get(values[column]) ?? null;
    });
    (step.strip ?? []).forEach((column) => {
      values[column] = null;
    });

    const parentId = step.tree ? values.parentId : null;
    if (step.tree) values.parentId = null;

    const created = await model.create(values, { transaction: ctx.transaction });
    if (ids) ids.set(row.id, created.id);
    if (parentId) children.push([created, parentId]);
    count(ctx, step.label);
  }

  /* Nesting is restored once every row exists, so a child listed before its
     parent still finds it. */
  for (const [created, oldParentId] of children) {
    const parentId = ids.get(oldParentId);
    if (parentId) await created.update({ parentId }, { transaction: ctx.transaction });
  }
}

/**
 * Branches, up to what the new company's plan allows. The source's head
 * office always maps to the new head office `createCompany` made, so content
 * tied to it is never lost, even when no other branch is copied.
 */
async function copyBranches(ctx, { source, created, copyOthers, planId }) {
  const sourceBranches = await db.Branch.findAll({
    where: { companyId: ctx.sourceId },
    order: [['isMain', 'DESC'], ['id', 'ASC']],
    transaction: ctx.transaction,
  });

  const main = sourceBranches.find((branch) => branch.isMain);
  if (main) ctx.branchIds.set(main.id, created.branch.id);
  if (!copyOthers) return;

  const plan = planId ? await db.Plan.findByPk(planId, { transaction: ctx.transaction }) : null;
  const room = Math.max((plan?.maxBranches ?? 1) - 1, 0);
  const others = sourceBranches.filter((branch) => !branch.isMain);

  for (const branch of others.slice(0, room)) {
    const values = cloneValues(ctx, branch);
    values.isMain = false;
    values.code = (
      branch.code.startsWith(`${source.code}-`)
        ? `${created.company.code}${branch.code.slice(source.code.length)}`
        : `${created.company.code}-${branch.code}`
    ).slice(0, 40);
    const row = await db.Branch.create(values, { transaction: ctx.transaction });
    ctx.branchIds.set(branch.id, row.id);
    count(ctx, 'branches');
  }
  if (others.length > room) ctx.skipped.branchesOverPlan = others.length - room;

  const contacts = await db.BranchContact.findAll({
    where: { companyId: ctx.sourceId },
    order: [['id', 'ASC']],
    transaction: ctx.transaction,
  });
  for (const contact of contacts) {
    const branchId = ctx.branchIds.get(contact.branchId);
    if (!branchId) continue;
    await db.BranchContact.create({ ...cloneValues(ctx, contact), branchId }, { transaction: ctx.transaction });
    count(ctx, 'branchContacts');
  }
}

/**
 * Custom roles and what they may see. The "Company Admin" system role is not
 * copied: `createCompany` has already made the new company its own. Only
 * permissions on the platform's system menus are carried; a menu the source
 * company made for itself does not exist in the new one.
 */
async function copyRoles(ctx) {
  const roles = await db.Role.findAll({
    where: { companyId: ctx.sourceId, isSystem: false },
    order: [['id', 'ASC']],
    transaction: ctx.transaction,
  });
  if (!roles.length) return;

  const roleIds = new Map();
  for (const role of roles) {
    const row = await db.Role.create(cloneValues(ctx, role), { transaction: ctx.transaction });
    roleIds.set(role.id, row.id);
    count(ctx, 'roles');
  }

  const systemMenus = new Set(
    (await db.Menu.findAll({ where: { companyId: null }, attributes: ['id'], transaction: ctx.transaction })).map((menu) => menu.id)
  );
  const permissions = await db.RolePermission.findAll({
    where: { companyId: ctx.sourceId, roleId: [...roleIds.keys()] },
    transaction: ctx.transaction,
  });
  const rows = permissions
    .filter((permission) => systemMenus.has(permission.menuId))
    .map((permission) => ({ ...cloneValues(ctx, permission), roleId: roleIds.get(permission.roleId) }));
  if (rows.length) await db.RolePermission.bulkCreate(rows, { transaction: ctx.transaction });
}

/* ------------------------------------------------------------------ *
 * The whole thing
 * ------------------------------------------------------------------ */

/**
 * Creates `payload` as a new company and copies `include` from `sourceId`
 * into it. Returns what `createCompany` returns, plus `copied` (rows written,
 * by kind) and `skipped` (what was left out, and why).
 */
async function duplicateCompany(sourceId, payload, include, actorId) {
  const source = await db.Company.findByPk(sourceId);
  if (!source) throw ApiError.notFound('Company to duplicate not found');

  const sections = new Set(include);
  const ctx = {
    sourceId,
    targetId: null,
    actorId: actorId ?? null,
    transaction: null,
    files: [],
    ids: {},
    branchIds: new Map(),
    copied: {},
    skipped: {},
  };

  try {
    return await db.sequelize.transaction(async (transaction) => {
      ctx.transaction = transaction;

      /* The form arrives pre-filled from the source, so a logo left as it was
         is still the source's file, and gets a copy of its own. */
      const profile = { ...payload };
      ['logo', 'favicon'].forEach((column) => {
        if (profile[column] && profile[column] === source[column]) profile[column] = copyUpload(ctx, profile[column]);
      });

      const created = await createCompany(profile, actorId, { transaction });
      ctx.targetId = created.company.id;

      await copyBranches(ctx, {
        source,
        created,
        copyOthers: sections.has(DUPLICATE_SECTION.BRANCHES),
        planId: payload.subscription?.planId ?? null,
      });
      if (sections.has(DUPLICATE_SECTION.ROLES)) await copyRoles(ctx);

      if (sections.has(DUPLICATE_SECTION.WEBSITE)) {
        /* The three starter slides `createCompany` gives every tenant make way
           for the source's own. */
        await db.Slider.destroy({ where: { companyId: ctx.targetId }, force: true, transaction });
        if (source.themeConfig) await created.company.update({ themeConfig: source.themeConfig }, { transaction });
      }

      for (const section of Object.keys(PLAN)) {
        if (!sections.has(section)) continue;
        for (const step of PLAN[section]) await copyTable(ctx, step);
      }

      return { ...created, copied: ctx.copied, skipped: ctx.skipped };
    });
  } catch (error) {
    ctx.files.forEach((file) => fs.unlink(file, () => {}));
    throw error;
  }
}

module.exports = { duplicateCompany };
