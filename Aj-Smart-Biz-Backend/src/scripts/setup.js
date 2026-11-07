'use strict';

/**
 * `npm run db:setup` — the same database preparation the server does on boot
 * when DB_SETUP_ON_START=true: create the database if missing, sync the schema
 * (per DB_SYNC_MODE), run every default seeder. Then exits.
 *
 * Run it after pulling a change that adds tables, columns or menus while
 * DB_SETUP_ON_START=false.
 */
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { runDatabaseSetup } = require('../database/setup');

(async () => {
  try {
    await runDatabaseSetup();
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('Database setup failed:', error);
    process.exit(1);
  }
})();
