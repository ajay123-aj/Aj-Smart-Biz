'use strict';

/*
 * Standalone seeding for our own marketing site: `npm run db:seed:marketing`.
 *
 * Safe to re-run — every step skips what already exists. See the long note in
 * `seeders/marketing.js` for why it never updates: once this content is in the
 * database it is edited in the super admin console, and a seeder that reapplied
 * itself on deploy would undo that.
 */
const { sequelize, ensureDatabaseExists } = require('../config/database');
require('../models');
const { runMarketingSeed } = require('../seeders/marketing');
const logger = require('../utils/logger');

(async () => {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await runMarketingSeed();
    logger.info('Marketing seeding complete');
    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
