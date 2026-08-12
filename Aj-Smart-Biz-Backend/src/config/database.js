'use strict';

const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('./env');
const logger = require('../utils/logger');

const isSqlite = config.db.dialect === 'sqlite';

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: config.db.dialect,
  // DB_DIALECT=sqlite is a zero-setup option for local development; it needs no
  // server and writes to a single file.
  ...(isSqlite ? { storage: path.resolve(process.cwd(), config.db.storage) } : {}),
  logging: config.db.logging ? (sql) => logger.debug(sql) : false,
  ...(isSqlite ? {} : { timezone: '+05:30' }),
  define: {
    underscored: true,
    freezeTableName: true,
    paranoid: true, // every model gets soft delete (deleted_at)
    ...(isSqlite ? {} : { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' }),
  },
  pool: { max: config.isProd ? 20 : 5, min: 0, acquire: 30000, idle: 10000 },
});

/**
 * Creates the database if it does not exist yet, so a fresh dev machine only
 * needs a running MySQL server - no manual `CREATE DATABASE`.
 */
async function ensureDatabaseExists() {
  if (config.db.dialect !== 'mysql') return; // sqlite creates its file automatically
  const bootstrap = new Sequelize('', config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    logging: false,
  });
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    logger.info(`Database "${config.db.name}" is ready`);
  } finally {
    await bootstrap.close();
  }
}

/** SQL expression that buckets a timestamp column into a `YYYY-MM` string. */
function monthExpression(column) {
  switch (config.db.dialect) {
    case 'sqlite':
      return `strftime('%Y-%m', ${column})`;
    case 'postgres':
      return `to_char(${column}, 'YYYY-MM')`;
    default:
      return `DATE_FORMAT(${column}, '%Y-%m')`;
  }
}

module.exports = { sequelize, ensureDatabaseExists, monthExpression, Sequelize };
