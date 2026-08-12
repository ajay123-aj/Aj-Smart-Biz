'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { STATUS } = require('../constants');

/** System menus (company_id NULL) are visible to every tenant but read-only for them. */
const visibleWhere = (companyId) => ({ companyId: { [Op.or]: [null, companyId] } });

const findOwnedOrFail = async (req) => {
  const menu = await db.Menu.findByPk(req.params.id);
  if (!menu) throw ApiError.notFound('Menu not found');
  if (menu.companyId !== req.auth.companyId) {
    throw ApiError.forbidden('System menus are managed by the platform and cannot be changed');
  }
  return menu;
};

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = mergeWhere(
    visibleWhere(req.auth.companyId),
    req.query.status ? { status: req.query.status } : null,
    buildSearch(req.query.search, ['name', 'slug', 'route'])
  );

  const result = await db.Menu.findAndCountAll({
    where,
    include: [{ model: db.Menu, as: 'parent', attributes: ['id', 'name'] }],
    order: getSort(req.query, ['name', 'sequence', 'created_at'], [['sequence', 'ASC'], ['id', 'ASC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Menu list fetched successfully');
});

/** GET /menus/tree - parent/child shape used by the sidebar and permission grid. */
const tree = asyncHandler(async (req, res) => {
  const menus = await db.Menu.findAll({
    where: { ...visibleWhere(req.auth.companyId), status: STATUS.ACTIVE },
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });

  const byId = new Map(menus.map((menu) => [menu.id, { ...menu.toJSON(), children: [] }]));
  const roots = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
    else roots.push(node);
  });

  return success(res, { message: 'Menu tree fetched successfully', data: roots });
});

const getById = asyncHandler(async (req, res) => {
  const menu = await db.Menu.findOne({ where: { id: req.params.id, ...visibleWhere(req.auth.companyId) } });
  if (!menu) throw ApiError.notFound('Menu not found');
  return success(res, { message: 'Menu fetched successfully', data: menu });
});

const create = asyncHandler(async (req, res) => {
  const companyId = req.auth.companyId;
  const clash = await db.Menu.findOne({ where: { slug: req.body.slug, ...visibleWhere(companyId) } });
  if (clash) throw ApiError.conflict('A menu with this slug already exists');

  if (req.body.parentId) {
    const parent = await db.Menu.findOne({ where: { id: req.body.parentId, ...visibleWhere(companyId) } });
    if (!parent) throw ApiError.badRequest('Parent menu not found');
  }

  const menu = await db.Menu.create({ ...req.body, companyId, isSystem: false, createdBy: req.auth.id });
  return created(res, 'Menu created successfully', menu);
});

const update = asyncHandler(async (req, res) => {
  const menu = await findOwnedOrFail(req);

  if (req.body.slug && req.body.slug !== menu.slug) {
    const clash = await db.Menu.findOne({
      where: { slug: req.body.slug, ...visibleWhere(req.auth.companyId), id: { [Op.ne]: menu.id } },
    });
    if (clash) throw ApiError.conflict('A menu with this slug already exists');
  }
  if (req.body.parentId === menu.id) throw ApiError.badRequest('A menu cannot be its own parent');

  await menu.update({ ...req.body, updatedBy: req.auth.id });
  return success(res, { message: 'Menu updated successfully', data: menu });
});

const remove = asyncHandler(async (req, res) => {
  const menu = await findOwnedOrFail(req);

  const childCount = await db.Menu.count({ where: { parentId: menu.id } });
  if (childCount > 0) throw ApiError.badRequest('Delete or move the child menus first');

  await db.sequelize.transaction(async (transaction) => {
    await db.RolePermission.destroy({ where: { menuId: menu.id }, transaction });
    await menu.destroy({ transaction });
  });

  return success(res, { message: 'Menu deleted successfully', data: { id: menu.id } });
});

module.exports = { list, tree, getById, create, update, remove };
