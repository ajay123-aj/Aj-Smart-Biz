'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, mergeWhere, Op } = require('../utils/query');
const { uniqueSlug } = require('../utils/slug');
const { removeUploadedFile } = require('../middlewares/upload');
const functionalityService = require('../services/functionality.service');
const { AUTH_SCOPE, STATUS, FUNCTIONALITY, CATEGORY_DEPTH_MAX } = require('../constants');

/**
 * The catalogue a tenant writes: its categories, the subcategories under them,
 * and the products filed in either.
 *
 * Not `cardResource.factory`, and the difference is worth stating because every
 * other website section on the platform *is* that factory. Three things here are
 * unlike a list of team members:
 *
 *  - **Categories are a tree.** A parent has to belong to the same tenant, may
 *    not be the row's own descendant, and may not push the tree past
 *    `CATEGORY_DEPTH_MAX`. None of that is expressible in a Joi schema, because
 *    all three need to read the rest of the tenant's tree.
 *  - **Products page.** A team has ten people; a catalogue has however many
 *    things the business sells. The factory's lists are deliberately
 *    unpaginated, and this one cannot be.
 *  - **Deleting a category must not delete anything else.** Its children are
 *    promoted to where it was and its products fall to uncategorised — see
 *    `removeCategory`, which does that by hand because a paranoid delete is an
 *    UPDATE and never fires the database's `ON DELETE SET NULL`.
 *
 * Everything else follows the factory's rules exactly: the tenant comes from the
 * token, writes are gated on the plan's **grant** rather than on the feature
 * being live, and a row may only be pinned to a branch of its own company.
 */

const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const assertGranted = (companyId) => functionalityService.assertGranted(companyId, FUNCTIONALITY.PRODUCTS);

const ORDER = [['sequence', 'ASC'], ['id', 'ASC']];

const BRANCH_INCLUDE = { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false };

/** `?branchId=` filters to one branch, `none` to the company-wide rows. */
const branchFilter = (query) => {
  if (query.branchId === 'none' || query.branchId === 'null') return { branchId: null };
  if (query.branchId) return { branchId: Number(query.branchId) };
  return null;
};

/** A row may only be pinned to a branch of its own company. */
const assertBranchBelongsToCompany = async (branchId, companyId) => {
  if (branchId === undefined || branchId === null || branchId === '') return null;
  const branch = await db.Branch.findOne({ where: { id: branchId, companyId }, attributes: ['id'] });
  if (!branch) throw ApiError.badRequest('That branch does not belong to this company');
  return branch.id;
};

/* ------------------------------------------------------------------ *
 * The tree
 * ------------------------------------------------------------------ */

/**
 * Every category this tenant has, as plain rows, keyed by id.
 *
 * One query rather than a recursive walk. A catalogue's category list is small
 * — tens of rows, not thousands, because it is a menu a person reads — so
 * loading it whole and doing the tree arithmetic in memory is both faster and
 * very much simpler than the recursive CTE the alternative would need, and it
 * works identically on MySQL and SQLite.
 */
async function categoryMap(companyId) {
  const rows = await db.CompanyCategory.findAll({
    where: { companyId },
    attributes: ['id', 'parentId', 'name', 'slug', 'branchId'],
    order: ORDER,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * How far above a category the tree goes — 1 for a main category, 2 for a
 * subcategory of one.
 *
 * Guarded against a cycle it did not create: a row whose ancestry loops would
 * otherwise spin here forever. The controller refuses to *make* a cycle, but
 * this function is also what runs over data that already exists, and hanging is
 * a worse failure than a wrong number.
 */
function depthOf(map, categoryId) {
  let depth = 1;
  let current = map.get(categoryId);
  const seen = new Set();

  while (current?.parentId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    current = map.get(current.parentId);
    if (!current) break;
    depth += 1;
    if (depth > CATEGORY_DEPTH_MAX + 1) break;
  }

  return depth;
}

/** How far below a category the tree goes — 1 for a category with no children. */
function heightOf(map, categoryId) {
  const childrenOf = new Map();
  map.forEach((row) => {
    if (!row.parentId) return;
    childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row.id]);
  });

  const walk = (id, seen) => {
    if (seen.has(id)) return 1;
    seen.add(id);
    const children = childrenOf.get(id) ?? [];
    if (!children.length) return 1;
    return 1 + Math.max(...children.map((child) => walk(child, seen)));
  };

  return walk(categoryId, new Set());
}

/** Every id at or below `categoryId`, itself included. */
function descendantIds(map, categoryId) {
  const childrenOf = new Map();
  map.forEach((row) => {
    if (!row.parentId) return;
    childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row.id]);
  });

  const out = [];
  const queue = [categoryId];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    (childrenOf.get(current) ?? []).forEach((child) => queue.push(child));
  }

  return out;
}

/**
 * The three things that can be wrong with a parent, checked together because
 * they are one question: *may this row sit under that one?*
 *
 *  - it has to exist, and belong to this tenant
 *  - it may not be the row itself, or anything under it — that is a cycle, and
 *    a cycle is a page that never finishes rendering
 *  - the deepest leaf under this row, once moved, has to stay inside
 *    `CATEGORY_DEPTH_MAX`
 *
 * The third is the one a create-time-only check would miss. Moving a two-level
 * branch under a second-level category is how a tenant reaches level four
 * without ever creating a category at level four.
 *
 * @param {Map} map     The tenant's whole tree.
 * @param {number|null} parentId
 * @param {number|null} rowId  Null when creating.
 */
function assertParentIsValid(map, parentId, rowId = null) {
  if (parentId === undefined || parentId === null || parentId === '') return null;

  const parent = map.get(Number(parentId));
  if (!parent) throw ApiError.badRequest('That parent category does not belong to this company');

  if (rowId) {
    if (Number(parentId) === Number(rowId)) {
      throw ApiError.badRequest('A category cannot be its own parent');
    }
    if (descendantIds(map, Number(rowId)).includes(Number(parentId))) {
      throw ApiError.badRequest('A category cannot be moved under one of its own subcategories');
    }
  }

  const parentDepth = depthOf(map, Number(parentId));
  // A new row is a single leaf; an existing one brings whatever is under it.
  const branchHeight = rowId ? heightOf(map, Number(rowId)) : 1;

  if (parentDepth + branchHeight > CATEGORY_DEPTH_MAX) {
    throw ApiError.badRequest(
      `Categories nest ${CATEGORY_DEPTH_MAX} levels deep at most. Moving this one there would make it ${
        parentDepth + branchHeight
      }.`
    );
  }

  return parent.id;
}

/**
 * Plain rows nested into a tree, each parent carrying its own `children`.
 *
 * Takes objects rather than model instances so the caller can decorate them
 * first — the management screen wants a product count on every node, and
 * counting after nesting would mean walking the tree a second time.
 */
function nest(rows) {
  const byId = new Map(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots = [];

  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    // A row whose parent is filtered out of this list is shown at the top level
    // rather than dropped — a category the tenant can see is a category they can
    // fix, and one that vanished from a filtered view is one they cannot.
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  return roots;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/**
 * GET /my-company/categories
 *
 * Unpaginated, unlike the products below: a category list is a menu somebody
 * reads, and a menu long enough to page through is a menu nobody uses.
 *
 * `?tree=true` nests them, which is what the management screen and the parent
 * picker render. Flat is what a filter dropdown wants.
 */
const listCategories = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const parentFilter = () => {
    if (req.query.parentId === 'none' || req.query.parentId === 'null') return { parentId: null };
    if (req.query.parentId) return { parentId: Number(req.query.parentId) };
    return null;
  };

  const rows = await db.CompanyCategory.findAll({
    where: mergeWhere(
      { companyId },
      branchFilter(req.query),
      parentFilter(),
      req.query.status ? { status: req.query.status } : null,
      req.query.search ? buildSearch(req.query.search, ['name', 'description']) : null
    ),
    include: [BRANCH_INCLUDE],
    order: ORDER,
  });

  /**
   * How many products sit in each category, so the screen can say "12 products"
   * on a row and warn before a delete that would unfile them. Counted for the
   * whole tenant in one grouped query rather than per row.
   */
  const counts = await db.CompanyProduct.findAll({
    where: { companyId, categoryId: { [Op.ne]: null } },
    attributes: ['categoryId', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'total']],
    group: ['categoryId'],
    raw: true,
  });
  const productCounts = new Map(counts.map((row) => [Number(row.categoryId), Number(row.total)]));

  const withCounts = rows.map((row) => {
    const json = row.toJSON();
    json.productCount = productCounts.get(row.id) ?? 0;
    return json;
  });

  return success(res, {
    message: 'Category list fetched successfully',
    data: { items: req.query.tree ? nest(withCounts) : withCounts },
  });
});

const findCategoryOrFail = async (companyId, id) => {
  const row = await db.CompanyCategory.findOne({ where: { id, companyId } });
  if (!row) throw ApiError.notFound('Category not found');
  return row;
};

const createCategory = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
  const parentId = assertParentIsValid(await categoryMap(companyId), req.body.parentId, null);

  /**
   * Appended to the end of its own level, not to the end of the whole tree: a
   * new subcategory starting at the root list's length would leave a gap in its
   * own list and sort itself to the bottom of a group it does not belong to.
   */
  const sequence =
    req.body.sequence ??
    ((await db.CompanyCategory.max('sequence', {
      where: { companyId, branchId: branchId ?? null, parentId: parentId ?? null },
    })) || 0) + 1;

  const row = await db.CompanyCategory.create({
    ...req.body,
    companyId,
    branchId: branchId ?? null,
    parentId: parentId ?? null,
    slug: await uniqueSlug(db.CompanyCategory, companyId, req.body.slug || req.body.name),
    sequence,
    createdBy: req.auth?.id ?? null,
  });

  return created(res, 'Category added successfully', row);
});

const updateCategory = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findCategoryOrFail(companyId, req.params.id);
  const patch = { ...req.body, updatedBy: req.auth?.id ?? null };

  if ('branchId' in req.body) {
    patch.branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
  }

  if ('parentId' in req.body) {
    patch.parentId = assertParentIsValid(await categoryMap(companyId), req.body.parentId, row.id);
  }

  /**
   * The slug follows the name only when the tenant asks. Renaming a category
   * silently rewriting its URL would break every link anyone has shared to it,
   * and the tenant has no way of knowing that happened — so the field is
   * changed when it is sent, and left alone when it is not.
   */
  if (req.body.slug) {
    patch.slug = await uniqueSlug(db.CompanyCategory, companyId, req.body.slug, row.id);
  }

  const previousImage = row.image;
  await row.update(patch);

  if (previousImage && patch.image !== undefined && patch.image !== previousImage) {
    removeUploadedFile(previousImage);
  }

  return success(res, { message: 'Category updated successfully', data: row });
});

const toggleCategoryStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findCategoryOrFail(companyId, req.params.id);
  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });

  return success(res, { message: `Category marked ${next}`, data: { id: row.id, status: next } });
});

const reorderCategories = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const ids = req.body.ids ?? [];
  const owned = await db.CompanyCategory.findAll({ where: { id: ids, companyId }, attributes: ['id'] });
  if (owned.length !== ids.length) throw ApiError.badRequest('One or more categories do not belong to this company');

  await db.sequelize.transaction(async (transaction) =>
    Promise.all(
      ids.map((id, index) =>
        db.CompanyCategory.update(
          { sequence: index + 1, updatedBy: req.auth?.id ?? null },
          { where: { id, companyId }, transaction }
        )
      )
    )
  );

  return success(res, { message: 'Category order updated successfully', data: { ids } });
});

/**
 * DELETE /my-company/categories/:id
 *
 * Deleting a category deletes **the category**, and nothing else.
 *
 * Its subcategories are promoted to where it was — a level up, or to the top —
 * and its products fall back to being uncategorised. Both are done here rather
 * than left to the database, because these tables are paranoid: a soft delete is
 * an UPDATE, so `ON DELETE SET NULL` never fires and the rows would be left
 * pointing at a category the tenant can no longer see or re-file them from.
 *
 * All three writes are one transaction. Half of this applied is a catalogue with
 * orphans in it.
 */
const removeCategory = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findCategoryOrFail(companyId, req.params.id);

  const result = await db.sequelize.transaction(async (transaction) => {
    const [promoted, unfiled] = await Promise.all([
      db.CompanyCategory.update(
        { parentId: row.parentId ?? null, updatedBy: req.auth?.id ?? null },
        { where: { companyId, parentId: row.id }, transaction }
      ),
      db.CompanyProduct.update(
        { categoryId: null, updatedBy: req.auth?.id ?? null },
        { where: { companyId, categoryId: row.id }, transaction }
      ),
    ]);

    await row.update({ updatedBy: req.auth?.id ?? null }, { transaction });
    await row.destroy({ transaction });

    return { promoted: promoted[0] ?? 0, unfiled: unfiled[0] ?? 0 };
  });

  return success(res, {
    message: 'Category deleted successfully',
    data: { id: row.id, ...result },
  });
});

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

/**
 * An offer price has to be below the normal price, and this is the half of that
 * rule Joi cannot enforce.
 *
 * The schema catches a body carrying both numbers. A body carrying only one —
 * "put this on offer at 1,999", against a price already stored — has nothing to
 * compare against until the row is loaded, which is here. Without it, sending
 * `offerPrice` alone is the way past the check.
 */
function assertOfferIsAnOffer(row, patch) {
  const price = patch.price !== undefined ? patch.price : row.price;
  const offerPrice = patch.offerPrice !== undefined ? patch.offerPrice : row.offerPrice;

  if (price === null || price === undefined) return;
  if (offerPrice === null || offerPrice === undefined) return;

  if (Number(offerPrice) >= Number(price)) {
    throw ApiError.badRequest(
      'offerPrice must be lower than price — an offer at or above the normal price is not an offer'
    );
  }
}

/** A product may only be filed in a category of its own company. */
const assertCategoryBelongsToCompany = async (categoryId, companyId) => {
  if (categoryId === undefined || categoryId === null || categoryId === '') return null;
  const category = await db.CompanyCategory.findOne({
    where: { id: categoryId, companyId },
    attributes: ['id'],
  });
  if (!category) throw ApiError.badRequest('That category does not belong to this company');
  return category.id;
};

/**
 * GET /my-company/products
 *
 * The one paginated list in the website-content half of the API. A catalogue is
 * as long as the business is wide, and the screen behind this has a search box
 * and a pager for exactly that reason.
 */
const listProducts = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const categoryFilter = () => {
    if (req.query.categoryId === 'none' || req.query.categoryId === 'null') return { categoryId: null };
    if (req.query.categoryId) return { categoryId: Number(req.query.categoryId) };
    return null;
  };

  /**
   * "On offer" is two things at once — a reduced price, or the flag a tenant
   * pricing in words ticks by hand — so the filter has to be an OR rather than
   * a column. It is the same rule `isOnOffer` applies on the way out; keeping
   * them apart is how the tab and the website would come to disagree.
   */
  const offerFilter = () => {
    if (req.query.onOffer === undefined) return null;
    const isOffer = {
      [Op.or]: [
        { onOffer: true },
        { [Op.and]: [{ offerPrice: { [Op.ne]: null } }, { price: { [Op.ne]: null } }] },
      ],
    };
    return req.query.onOffer ? isOffer : { [Op.and]: [{ onOffer: false }, { offerPrice: null }] };
  };

  const { rows, count } = await db.CompanyProduct.findAndCountAll({
    where: mergeWhere(
      { companyId },
      branchFilter(req.query),
      categoryFilter(),
      offerFilter(),
      req.query.featured !== undefined ? { featured: req.query.featured } : null,
      req.query.stockStatus ? { stockStatus: req.query.stockStatus } : null,
      req.query.status ? { status: req.query.status } : null,
      req.query.search ? buildSearch(req.query.search, ['name', 'summary', 'sku']) : null
    ),
    include: [
      BRANCH_INCLUDE,
      { model: db.CompanyCategory, as: 'category', attributes: ['id', 'name', 'slug'], required: false },
    ],
    order: ORDER,
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, { rows, count }, { page, limit }, 'Product list fetched successfully');
});

const findProductOrFail = async (companyId, id) => {
  const row = await db.CompanyProduct.findOne({
    where: { id, companyId },
    include: [{ model: db.CompanyCategory, as: 'category', attributes: ['id', 'name', 'slug'], required: false }],
  });
  if (!row) throw ApiError.notFound('Product not found');
  return row;
};

const getProduct = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const row = await findProductOrFail(companyId, req.params.id);
  return success(res, { message: 'Product fetched successfully', data: row });
});

const createProduct = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
  const categoryId = await assertCategoryBelongsToCompany(req.body.categoryId, companyId);

  const sequence =
    req.body.sequence ??
    ((await db.CompanyProduct.max('sequence', { where: { companyId, branchId: branchId ?? null } })) || 0) + 1;

  const row = await db.CompanyProduct.create({
    ...req.body,
    companyId,
    branchId: branchId ?? null,
    categoryId: categoryId ?? null,
    slug: await uniqueSlug(db.CompanyProduct, companyId, req.body.slug || req.body.name),
    sequence,
    createdBy: req.auth?.id ?? null,
  });

  return created(res, 'Product added successfully', row);
});

/**
 * PUT /my-company/products/:id
 *
 * The image cleanup is what makes this longer than the other update handlers.
 * `images` is a list, so "what was replaced" is a set difference rather than a
 * comparison of two strings — and getting it wrong in either direction is a real
 * cost: leaking every photograph a tenant ever swapped, or deleting a file that
 * is still on the page.
 */
const updateProduct = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findProductOrFail(companyId, req.params.id);
  const patch = { ...req.body, updatedBy: req.auth?.id ?? null };

  if ('branchId' in req.body) {
    patch.branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
  }
  if ('categoryId' in req.body) {
    patch.categoryId = await assertCategoryBelongsToCompany(req.body.categoryId, companyId);
  }
  if (req.body.slug) {
    patch.slug = await uniqueSlug(db.CompanyProduct, companyId, req.body.slug, row.id);
  }

  assertOfferIsAnOffer(row, patch);

  const previousImages = Array.isArray(row.images) ? row.images : [];
  await row.update(patch);

  /**
   * Only when `images` was actually sent. A body that never mentions them has
   * replaced nothing, and treating "absent" as "empty" would delete a product's
   * entire gallery on any other edit.
   */
  if (Array.isArray(patch.images)) {
    const kept = new Set(patch.images);
    previousImages.filter((path) => !kept.has(path)).forEach(removeUploadedFile);
  }

  return success(res, { message: 'Product updated successfully', data: row });
});

const toggleProductStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findProductOrFail(companyId, req.params.id);
  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });

  return success(res, { message: `Product marked ${next}`, data: { id: row.id, status: next } });
});

const reorderProducts = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const ids = req.body.ids ?? [];
  const owned = await db.CompanyProduct.findAll({ where: { id: ids, companyId }, attributes: ['id'] });
  if (owned.length !== ids.length) throw ApiError.badRequest('One or more products do not belong to this company');

  await db.sequelize.transaction(async (transaction) =>
    Promise.all(
      ids.map((id, index) =>
        db.CompanyProduct.update(
          { sequence: index + 1, updatedBy: req.auth?.id ?? null },
          { where: { id, companyId }, transaction }
        )
      )
    )
  );

  return success(res, { message: 'Product order updated successfully', data: { ids } });
});

/**
 * The product's files are deliberately **not** removed with it.
 *
 * Every table here is paranoid, so this is a soft delete and the row comes back
 * if it is restored — with its photographs still on disk, because nothing was
 * unlinked. Deleting them would make a restore produce a product with eight
 * broken images, which is worse than the disk space.
 */
const removeProduct = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findProductOrFail(companyId, req.params.id);
  await row.update({ updatedBy: req.auth?.id ?? null });
  await row.destroy();

  return success(res, { message: 'Product deleted successfully', data: { id: row.id } });
});

module.exports = {
  categories: {
    list: listCategories,
    create: createCategory,
    update: updateCategory,
    toggleStatus: toggleCategoryStatus,
    reorder: reorderCategories,
    remove: removeCategory,
  },
  products: {
    list: listProducts,
    get: getProduct,
    create: createProduct,
    update: updateProduct,
    toggleStatus: toggleProductStatus,
    reorder: reorderProducts,
    remove: removeProduct,
  },
  /**
   * Exported for the public read path, for the tests, and for the service
   * category controller - a tree is a tree, and these run over a plain map of
   * rows rather than over anything that knows which table it came from.
   */
  assertParentIsValid,
  assertOfferIsAnOffer,
  depthOf,
  heightOf,
  descendantIds,
  nest,
};
