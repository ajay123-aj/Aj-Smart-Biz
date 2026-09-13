'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { mergeWhere } = require('../utils/query');
const content = require('./websiteContent.controller');
/**
 * The tree arithmetic, borrowed rather than written twice.
 *
 * Depth, cycles and nesting are the same problem for a service taxonomy as for a
 * product one, and the catalogue controller already solves it - over a plain
 * `Map` of rows, so nothing in it knows or cares which table the rows came from.
 * Two copies of a cycle check is how one of them ends up missing the case that
 * hangs a page.
 */
const { assertParentIsValid, descendantIds, nest } = require('./catalogue.controller');
const { AUTH_SCOPE, FUNCTIONALITY } = require('../constants');
const functionalityService = require('../services/functionality.service');

/**
 * Service categories: `Hair`, `Skin`, `Bridal`, and what sits under them.
 *
 * A thin layer over the card factory, which does the ordinary work - the tenant
 * scoping, the plan gate, the slug, the ordering, the soft delete. What is here
 * is the three things a list of cards does not have to think about and a **tree**
 * does:
 *
 *  - a parent has to belong to the same company
 *  - a category may not be moved under one of its own subcategories
 *  - the tree may not be pushed past `CATEGORY_DEPTH_MAX`
 *
 * and one thing a delete has to do: **not take the work with it**. Removing
 * `Bridal` promotes its subcategories to where it was and unfiles the services in
 * it. A salon that deletes a heading has reorganised its price list, not stopped
 * doing the treatments.
 */

const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const ORDER = [['sequence', 'ASC'], ['id', 'ASC']];

/** The tenant's whole tree, in one query. Small enough to hold in memory. */
async function categoryMap(companyId) {
  const rows = await db.CompanyServiceCategory.findAll({
    where: { companyId },
    attributes: ['id', 'parentId', 'name', 'slug', 'branchId'],
    order: ORDER,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * GET /my-company/service-categories
 *
 * Flat by default, nested with `tree=true` - which is what the management screen
 * and the parent picker render.
 *
 * Every row carries `serviceCount`, the number of services filed **directly** in
 * it. The screen shows it on the row and warns with it before a delete, because
 * deleting a category unfiles its services rather than removing them.
 */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const branchFilter = () => {
    if (req.query.branchId === 'none' || req.query.branchId === 'null') return { branchId: null };
    if (req.query.branchId) return { branchId: Number(req.query.branchId) };
    return null;
  };

  const rows = await db.CompanyServiceCategory.findAll({
    where: mergeWhere(
      { companyId },
      branchFilter(),
      req.query.status ? { status: req.query.status } : null,
      req.query.parentId === 'none' || req.query.parentId === 'null'
        ? { parentId: null }
        : req.query.parentId
          ? { parentId: Number(req.query.parentId) }
          : null
    ),
    include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false }],
    order: ORDER,
  });

  /* One grouped query for the page rather than one per row - the same
     arrangement every count on this platform uses. */
  const counts = new Map();
  if (rows.length) {
    const grouped = await db.CompanyService.findAll({
      where: { companyId, categoryId: rows.map((row) => row.id) },
      attributes: ['categoryId', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'total']],
      group: ['category_id'],
      raw: true,
    });
    grouped.forEach((row) => counts.set(Number(row.categoryId), Number(row.total || 0)));
  }

  const decorated = rows.map((row) => ({ ...row.toJSON(), serviceCount: counts.get(row.id) ?? 0 }));

  return success(res, {
    message: 'Service category list fetched successfully',
    data: { items: req.query.tree ? nest(decorated) : decorated },
  });
});

/**
 * POST /my-company/service-categories
 *
 * `parentId` is what makes this a subcategory; omitting it makes a main one. The
 * parent is checked before the factory writes anything, so a refusal leaves
 * nothing half-created.
 */
const create = asyncHandler(async (req, res, next) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.SERVICES);

  if (req.body.parentId) {
    assertParentIsValid(await categoryMap(companyId), req.body.parentId, null);
  }

  return content.serviceCategories.create(req, res, next);
});

/**
 * PUT /my-company/service-categories/:id
 *
 * Sending `parentId` re-parents the category and everything under it. Three
 * things are refused, and the third is the one a create-time check would miss:
 * moving a two-level branch under a second-level category is how a tenant
 * reaches level four without ever creating a category at level four.
 */
const update = asyncHandler(async (req, res, next) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.SERVICES);

  if ('parentId' in req.body && req.body.parentId) {
    assertParentIsValid(await categoryMap(companyId), req.body.parentId, Number(req.params.id));
  }

  return content.serviceCategories.update(req, res, next);
});

/**
 * DELETE /my-company/service-categories/:id
 *
 * Deletes the category and **nothing else**. Its subcategories are promoted to
 * where it was, and the services in it fall back to being uncategorised - the
 * response says how many of each were touched.
 *
 * Done by hand rather than by the database: these tables are paranoid, so the
 * delete is an UPDATE and `ON DELETE SET NULL` never fires. One transaction, so
 * a failure halfway cannot leave services filed under a category that is gone.
 */
const remove = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await functionalityService.assertGranted(companyId, FUNCTIONALITY.SERVICES);

  const row = await db.CompanyServiceCategory.findOne({ where: { id: req.params.id, companyId } });
  if (!row) throw ApiError.notFound('Service category not found');

  const result = await db.sequelize.transaction(async (transaction) => {
    const [promoted, unfiled] = await Promise.all([
      db.CompanyServiceCategory.update(
        { parentId: row.parentId ?? null, updatedBy: req.auth?.id ?? null },
        { where: { companyId, parentId: row.id }, transaction }
      ),
      db.CompanyService.update(
        { categoryId: null, updatedBy: req.auth?.id ?? null },
        { where: { companyId, categoryId: row.id }, transaction }
      ),
    ]);

    await row.update({ updatedBy: req.auth?.id ?? null }, { transaction });
    await row.destroy({ transaction });

    return { promoted: promoted[0] ?? 0, unfiled: unfiled[0] ?? 0 };
  });

  return success(res, {
    message: 'Service category deleted successfully',
    data: { id: row.id, ...result },
  });
});

module.exports = {
  list,
  create,
  update,
  remove,
  /* Straight from the factory: neither needs anything a tree knows about. */
  toggleStatus: content.serviceCategories.toggleStatus,
  reorder: content.serviceCategories.reorder,
  /* Exported for the tests. */
  categoryMap,
  descendantIds,
};
