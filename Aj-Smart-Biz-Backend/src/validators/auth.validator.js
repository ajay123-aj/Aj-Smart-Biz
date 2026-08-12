'use strict';

const { Joi, email, password } = require('./common');

const login = {
  body: Joi.object({
    email: email.required(),
    password: Joi.string().required(),
  }),
};

const refresh = {
  body: Joi.object({ refreshToken: Joi.string().required() }),
};

const changePassword = {
  body: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'confirmPassword must match newPassword',
    }),
  }),
};

const updateProfile = {
  body: Joi.object({
    name: Joi.string().min(2).max(150),
    phone: Joi.string().allow('', null).max(20),
    avatar: Joi.string().allow('', null).max(255),
  }).min(1),
};

module.exports = { login, refresh, changePassword, updateProfile };
