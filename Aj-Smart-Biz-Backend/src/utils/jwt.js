'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('./ApiError');

/**
 * `scope` separates the two portals: `super_admin` tokens are issued by the
 * super-admin portal, `admin` tokens are company scoped and always carry a companyId.
 */
const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

const signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });

const issueTokens = (payload) => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken({ id: payload.id, scope: payload.scope }),
  expiresIn: config.jwt.expiresIn,
});

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token');
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token');
  }
};

module.exports = { signAccessToken, signRefreshToken, issueTokens, verifyAccessToken, verifyRefreshToken };
