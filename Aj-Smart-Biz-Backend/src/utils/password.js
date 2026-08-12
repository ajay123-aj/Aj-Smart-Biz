'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config/env');

const hash = (plain) => bcrypt.hash(plain, config.bcryptSaltRounds);
const compare = (plain, hashed) => bcrypt.compare(plain, hashed);

/** Used when a company's main admin is auto-created and no password was supplied. */
const random = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$';
  const bytes = require('crypto').randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};

module.exports = { hash, compare, random };
