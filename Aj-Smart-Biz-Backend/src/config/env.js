'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * Two environments are supported: `development` and `production`.
 * NODE_ENV picks which .env file is loaded; anything already present in the
 * real process environment (CI / container secrets) always wins.
 */
const NODE_ENV = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const envFile = path.resolve(process.cwd(), `.env.${NODE_ENV}`);

if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
  // eslint-disable-next-line no-console
  console.warn(`[env] ${envFile} not found, falling back to .env / process env`);
}

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const list = (value, fallback = []) =>
  value ? String(value).split(',').map((item) => item.trim()).filter(Boolean) : fallback;

const config = {
  env: NODE_ENV,
  isProd: NODE_ENV === 'production',
  isDev: NODE_ENV === 'development',
  port: int(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigins: list(process.env.CORS_ORIGINS, ['http://localhost:4200', 'http://localhost:4300']),
  bcryptSaltRounds: int(process.env.BCRYPT_SALT_ROUNDS, 10),
  defaultCompanyAdminPassword: process.env.DEFAULT_COMPANY_ADMIN_PASSWORD || 'Company@123',

  uploads: {
    // Directory on disk; served read-only at `publicPath`.
    dir: process.env.UPLOAD_DIR || 'uploads',
    publicPath: process.env.UPLOAD_PUBLIC_PATH || '/uploads',
    maxSizeMb: int(process.env.UPLOAD_MAX_SIZE_MB, 2),
  },

  db: {
    dialect: process.env.DB_DIALECT || 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    name: process.env.DB_NAME || 'aj_smart_biz_dev',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // Only used when DB_DIALECT=sqlite.
    storage: process.env.DB_STORAGE || 'aj-smart-biz.sqlite',
    logging: bool(process.env.DB_LOGGING, NODE_ENV === 'development'),
    // alter -> sequelize.sync({ alter: true }); force -> drop & recreate; none -> skip
    syncMode: (process.env.DB_SYNC_MODE || 'alter').toLowerCase(),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'aj-smart-biz-access-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'aj-smart-biz-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Aj Super Admin',
    email: (process.env.SUPER_ADMIN_EMAIL || 'superadmin@ajsmartbiz.com').toLowerCase(),
    phone: process.env.SUPER_ADMIN_PHONE || '9999999999',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123',
  },
};

if (config.isProd) {
  const weak = ['CHANGE_ME', 'CHANGE_ME_STRONG_RANDOM_SECRET', 'aj-smart-biz-access-secret'];
  if (weak.includes(config.jwt.secret) || weak.includes(config.jwt.refreshSecret)) {
    throw new Error('[env] JWT secrets must be set to strong values in production');
  }
  if (config.db.syncMode === 'force') {
    throw new Error('[env] DB_SYNC_MODE=force is not allowed in production');
  }
}

module.exports = config;
