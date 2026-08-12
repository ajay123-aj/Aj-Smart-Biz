'use strict';

/* Standalone seeding: `npm run db:seed`. Safe to re-run - every step is idempotent. */
const { sequelize, ensureDatabaseExists } = require('../config/database');
require('../models');
const { runBootstrap } = require('../seeders/bootstrap');
const logger = require('../utils/logger');

(async () => {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await runBootstrap();
    logger.info('Seeding complete');
    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
