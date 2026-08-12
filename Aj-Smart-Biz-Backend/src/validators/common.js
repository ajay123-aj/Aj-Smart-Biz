'use strict';

const Joi = require('joi');
const { STATUS_VALUES } = require('../constants');

const id = Joi.number().integer().positive();

const idParam = Joi.object({ id: id.required() });

const listQuery = (extra = {}) =>
  Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(10),
    search: Joi.string().allow('', null).max(150),
    status: Joi.string().valid(...STATUS_VALUES),
    sortBy: Joi.string().max(60),
    sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
    ...extra,
  });

const statusBody = Joi.object({ status: Joi.string().valid(...STATUS_VALUES) });

// `tlds: false` checks the address shape without validating the suffix against
// the IANA list, so internal domains (.local, .internal, staging hosts) work.
const email = Joi.string().email({ tlds: { allow: false } }).max(160).lowercase().trim();
const phone = Joi.string().pattern(/^[0-9+\-\s()]{6,20}$/).message('phone must be a valid phone number');
const password = Joi.string()
  .min(8)
  .max(64)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  .message('password must be at least 8 characters and contain an uppercase, a lowercase and a number');
const hexColor = Joi.string().pattern(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).message('must be a hex colour like #2563eb');
const status = Joi.string().valid(...STATUS_VALUES);

module.exports = { Joi, id, idParam, listQuery, statusBody, email, phone, password, hexColor, status };
