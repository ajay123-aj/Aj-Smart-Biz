'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Joi validation for any combination of `body`, `query` and `params`.
 * Validated values replace the originals so controllers get coerced types.
 */
module.exports = (schema) => (req, res, next) => {
  const errors = [];

  ['params', 'query', 'body'].forEach((source) => {
    if (!schema[source]) return;
    // Route params are never stripped: nested routes carry ids (`:companyId`,
    // `:branchId`) that a schema for `:id` alone would otherwise throw away.
    const isParams = source === 'params';
    const { error, value } = schema[source].validate(req[source], {
      abortEarly: false,
      stripUnknown: !isParams,
      allowUnknown: isParams,
      convert: true,
    });
    if (error) {
      error.details.forEach((detail) => {
        errors.push({ field: detail.path.join('.'), message: detail.message.replace(/"/g, ''), in: source });
      });
    } else if (source === 'query') {
      // req.query is a getter-only property on Express 5; mutate in place instead.
      Object.keys(req.query).forEach((key) => delete req.query[key]);
      Object.assign(req.query, value);
    } else {
      req[source] = value;
    }
  });

  if (errors.length) return next(ApiError.badRequest('Validation failed', errors));
  return next();
};
