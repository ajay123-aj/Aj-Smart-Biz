'use strict';

const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError, DatabaseError } = require('sequelize');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const logger = require('../utils/logger');

const notFound = (req, res, next) => next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (error instanceof UniqueConstraintError) {
    const fields = Object.keys(error.fields || {}).join(', ');
    error = ApiError.conflict(`Duplicate value for ${fields || 'a unique field'}`);
  } else if (error instanceof ValidationError) {
    error = ApiError.badRequest(
      'Validation failed',
      error.errors.map((e) => ({ field: e.path, message: e.message }))
    );
  } else if (error instanceof ForeignKeyConstraintError) {
    error = ApiError.badRequest('Related record is missing or still in use');
  } else if (error instanceof DatabaseError) {
    logger.error('Database error:', err.message);
    error = ApiError.internal('Database error');
  } else if (!(error instanceof ApiError)) {
    logger.error('Unhandled error:', err);
    error = ApiError.internal(config.isProd ? 'Something went wrong' : err.message);
  }

  if (error.statusCode >= 500) logger.error(err.stack || err.message);

  return res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.errors ? { errors: error.errors } : {}),
    ...(config.isProd ? {} : { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
