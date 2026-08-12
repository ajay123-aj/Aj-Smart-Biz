'use strict';

const { Joi, id, idParam, listQuery, email, password, status } = require('./common');
const { SUPER_ADMIN_ROLE, PERMISSION_ACTIONS } = require('../constants');

/* ------------- Super admin ------------- */
const superAdminFields = {
  name: Joi.string().min(2).max(150),
  email,
  phone: Joi.string().allow('', null).max(20),
  avatar: Joi.string().allow('', null).max(255),
  role: Joi.string().valid(...Object.values(SUPER_ADMIN_ROLE)),
  status,
};
const superAdminCreate = {
  body: Joi.object({
    ...superAdminFields,
    name: superAdminFields.name.required(),
    email: email.required(),
    password: password.required(),
    role: superAdminFields.role.default(SUPER_ADMIN_ROLE.STAFF),
  }),
};
const superAdminUpdate = {
  params: idParam,
  body: Joi.object({ ...superAdminFields, password: password.optional() }).min(1),
};
const superAdminResetPassword = {
  params: idParam,
  body: Joi.object({ newPassword: password.required() }),
};

/* ---------------- Role ---------------- */
const roleFields = {
  name: Joi.string().min(2).max(120),
  slug: Joi.string().allow('', null).max(120),
  description: Joi.string().allow('', null).max(2000),
  status,
};
const roleCreate = {
  body: Joi.object({
    ...roleFields,
    name: roleFields.name.required(),
    // Optional permission matrix applied straight after the role is created.
    permissions: Joi.array()
      .items(
        Joi.object({
          menuId: id.required(),
          ...PERMISSION_ACTIONS.reduce((acc, action) => ({ ...acc, [action]: Joi.boolean().default(false) }), {}),
        })
      )
      .optional(),
  }),
};
const roleUpdate = { params: idParam, body: Joi.object(roleFields).min(1) };

/* ---------------- Menu ---------------- */
const menuFields = {
  parentId: id.allow(null),
  name: Joi.string().min(2).max(120),
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).max(120).message('slug must be lowercase kebab-case'),
  icon: Joi.string().allow('', null).max(120),
  route: Joi.string().allow('', null).max(180),
  sequence: Joi.number().integer(),
  status,
};
const menuCreate = {
  body: Joi.object({
    ...menuFields,
    name: menuFields.name.required(),
    slug: menuFields.slug.required(),
    sequence: menuFields.sequence.default(0),
  }),
};
const menuUpdate = { params: idParam, body: Joi.object(menuFields).min(1) };

/* ------------- Role permissions ------------- */
const permissionSync = {
  params: Joi.object({ roleId: id.required() }),
  body: Joi.object({
    permissions: Joi.array()
      .items(
        Joi.object({
          menuId: id.required(),
          ...PERMISSION_ACTIONS.reduce((acc, action) => ({ ...acc, [action]: Joi.boolean().default(false) }), {}),
        })
      )
      .min(0)
      .required(),
  }),
};

/* ---------------- Admin ---------------- */
const adminFields = {
  name: Joi.string().min(2).max(150),
  email,
  phone: Joi.string().allow('', null).max(20),
  avatar: Joi.string().allow('', null).max(255),
  branchId: id.allow(null),
  roleId: id.allow(null),
  status,
};
const adminCreate = {
  body: Joi.object({
    ...adminFields,
    name: adminFields.name.required(),
    email: email.required(),
    roleId: id.required(),
    password: password.optional(),
    mustChangePassword: Joi.boolean().default(true),
  }),
};
const adminUpdate = {
  params: idParam,
  body: Joi.object({ ...adminFields, mustChangePassword: Joi.boolean() }).min(1),
};
const adminResetPassword = {
  params: idParam,
  body: Joi.object({ newPassword: password.required(), mustChangePassword: Joi.boolean().default(true) }),
};
const adminList = { query: listQuery({ roleId: id, branchId: id }) };

module.exports = {
  superAdminCreate,
  superAdminUpdate,
  superAdminResetPassword,
  roleCreate,
  roleUpdate,
  menuCreate,
  menuUpdate,
  permissionSync,
  adminCreate,
  adminUpdate,
  adminResetPassword,
  adminList,
};
