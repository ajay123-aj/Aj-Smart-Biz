'use strict';

/* Standalone schema sync: `npm run db:sync` (optionally with --force). */
const { sequelize, ensureDatabaseExists } = require('../config/database');
require('../models');
const logger = require('../utils/logger');

(async () => {
  try {
    const force = process.argv.includes('--force');
    await ensureDatabaseExists();
    await sequelize.authenticate();
    await sequelize.sync(force ? { force: true } : { alter: true });
    logger.info(`Schema synced (${force ? 'force' : 'alter'})`);
    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
