'use strict';

const success = (res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) =>
  res.status(statusCode).json({ success: true, message, data, ...(meta ? { meta } : {}) });

const created = (res, message, data) => success(res, { statusCode: 201, message, data });

/** Shapes a Sequelize `findAndCountAll` result into the list envelope the UIs expect. */
const paginated = (res, { rows, count }, { page, limit }, message = 'Records fetched successfully') =>
  success(res, {
    message,
    data: rows,
    meta: {
      total: count,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(count / limit) : 1,
      hasNext: limit > 0 && page * limit < count,
    },
  });

module.exports = { success, created, paginated };
