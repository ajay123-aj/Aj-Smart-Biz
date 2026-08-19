'use strict';

const { Joi, id, idParam, listQuery, status } = require('./common');

/**
 * `branchId` accepts null explicitly — that is how a slide is moved back to
 * "every branch", so it must be a value the client can actually send.
 */
const branchId = Joi.alternatives().try(id, Joi.valid(null));

const fields = {
  branchId,
  title: Joi.string().min(1).max(180),
  eyebrow: Joi.string().allow('', null).max(120),
  subtitle: Joi.string().allow('', null).max(600),
  image: Joi.string().allow('', null).max(255),
  mobileImage: Joi.string().allow('', null).max(255),
  ctaLabel: Joi.string().allow('', null).max(80),
  ctaUrl: Joi.string().allow('', null).max(255),
  sequence: Joi.number().integer().min(0).max(9999),
  status,
};

const create = {
  body: Joi.object({
    ...fields,
    title: fields.title.required(),
  }),
};

/**
 * Written without `.default()`, like the master schemas: Joi injects defaults
 * for absent keys, which on a partial update would silently reset columns the
 * client never sent.
 */
const update = {
  params: idParam,
  body: Joi.object(fields).min(1),
};

const reorder = {
  body: Joi.object({
    ids: Joi.array().items(id.required()).min(1).max(200).required(),
  }),
};

module.exports = {
  create,
  update,
  reorder,
  listQuery: {
    query: listQuery({
      // `none` asks for the company-wide slides, which have no branch id at all.
      branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    }),
  },
};
