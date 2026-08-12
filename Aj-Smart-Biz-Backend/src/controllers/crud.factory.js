'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere, Op } = require('../utils/query');
const { STATUS } = require('../constants');

/**
 * Builds the five standard handlers for a simple master table.
 *
 * @param {object} options
 * @param {import('sequelize').ModelStatic} options.model
 * @param {string} options.label            Singular human label used in messages.
 * @param {string[]} options.searchFields   Columns included in `?search=`.
 * @param {string[]} options.sortFields     Columns allowed in `?sortBy=`.
 * @param {string[]} [options.uniqueFields] Columns kept unique among non-deleted rows.
 * @param {Array} [options.include]         Default eager-loads for list/detail.
 * @param {Function} [options.beforeDelete] async (instance, req) => void — blocks deletes.
 * @param {Function} [options.decorateRows] async (rows) => rows — adds derived
 *        fields (counts, rollups) that do not belong on the table itself.
 */
module.exports = ({
  model,
  label,
  searchFields = ['name'],
  sortFields = ['name', 'created_at'],
  uniqueFields = [],
  include = [],
  beforeDelete = null,
  decorateRows = null,
}) => {
  const assertUnique = async (payload, excludeId = null) => {
    for (const field of uniqueFields) {
      const value = payload[field];
      if (value === undefined || value === null || value === '') continue;
      const where = { [field]: value };
      if (excludeId) where.id = { [Op.ne]: excludeId };
      // eslint-disable-next-line no-await-in-loop
      const existing = await model.findOne({ where });
      if (existing) throw ApiError.conflict(`${label} with this ${field} already exists`);
    }
  };

  const findOrFail = async (id) => {
    const record = await model.findByPk(id, { include });
    if (!record) throw ApiError.notFound(`${label} not found`);
    return record;
  };

  return {
    list: asyncHandler(async (req, res) => {
      const { page, limit, offset } = getPagination(req.query);
      const where = mergeWhere(
        req.query.status ? { status: req.query.status } : null,
        buildSearch(req.query.search, searchFields)
      );

      const result = await model.findAndCountAll({
        where,
        include,
        order: getSort(req.query, sortFields),
        limit,
        offset,
        distinct: true,
      });

      const rows = decorateRows ? await decorateRows(result.rows) : result.rows;
      return paginated(res, { rows, count: result.count }, { page, limit }, `${label} list fetched successfully`);
    }),

    /** Lightweight id/name pairs for dropdowns. */
    dropdown: asyncHandler(async (req, res) => {
      const rows = await model.findAll({
        where: { status: STATUS.ACTIVE },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
      });
      return success(res, { message: `${label} options fetched successfully`, data: rows });
    }),

    getById: asyncHandler(async (req, res) => {
      const record = await findOrFail(req.params.id);
      return success(res, { message: `${label} fetched successfully`, data: record });
    }),

    create: asyncHandler(async (req, res) => {
      await assertUnique(req.body);
      const record = await model.create({ ...req.body, createdBy: req.auth?.id ?? null });
      return created(res, `${label} created successfully`, record);
    }),

    update: asyncHandler(async (req, res) => {
      const record = await findOrFail(req.params.id);
      await assertUnique(req.body, record.id);
      await record.update({ ...req.body, updatedBy: req.auth?.id ?? null });
      return success(res, { message: `${label} updated successfully`, data: record });
    }),

    /** Toggles between active/inactive without needing the full payload. */
    toggleStatus: asyncHandler(async (req, res) => {
      const record = await findOrFail(req.params.id);
      const next = req.body?.status || (record.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
      await record.update({ status: next, updatedBy: req.auth?.id ?? null });
      return success(res, { message: `${label} marked ${next}`, data: { id: record.id, status: next } });
    }),

    /** Soft delete - the row keeps living behind `deleted_at`. */
    remove: asyncHandler(async (req, res) => {
      const record = await findOrFail(req.params.id);
      if (beforeDelete) await beforeDelete(record, req);
      await record.update({ updatedBy: req.auth?.id ?? null });
      await record.destroy();
      return success(res, { message: `${label} deleted successfully`, data: { id: record.id } });
    }),

    /** Brings a soft-deleted row back. */
    restore: asyncHandler(async (req, res) => {
      const record = await model.findByPk(req.params.id, { paranoid: false });
      if (!record) throw ApiError.notFound(`${label} not found`);
      await record.restore();
      return success(res, { message: `${label} restored successfully`, data: record });
    }),
  };
};
