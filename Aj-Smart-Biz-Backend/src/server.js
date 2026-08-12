'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { sequelize, ensureDatabaseExists } = require('./config/database');
require('./models'); // registers models + associations before sync
const { runBootstrap } = require('./seeders/bootstrap');
const { runDueSubscriptions } = require('./services/subscription.service');

/** Hourly is enough: terms are measured in days, and the sweep is idempotent. */
const SUBSCRIPTION_SWEEP_MS = 60 * 60 * 1000;

/**
 * DB_SYNC_MODE decides how the schema is reconciled on boot:
 *   alter - create missing tables and columns (default for development)
 *   force - drop and recreate everything (development only)
 *   none  - leave the schema untouched (recommended for production)
 */
async function syncDatabase() {
  const mode = config.db.syncMode;
  if (mode === 'none') {
    logger.info('DB_SYNC_MODE=none - skipping schema sync');
    return;
  }
  if (mode === 'force') {
    logger.warn('DB_SYNC_MODE=force - dropping and recreating every table');
    await sequelize.sync({ force: true });
    return;
  }
  await sequelize.sync({ alter: true });
  logger.info('Schema synced (alter)');
}

/**
 * Rolls subscriptions forward: starts terms that were scheduled for today and
 * closes the ones that have run out (renewing those set to auto renew). Without
 * this a countdown would reach zero and the status would sit there unchanged.
 */
const sweepSubscriptions = () =>
  runDueSubscriptions().catch((error) => logger.error('Subscription sweep failed:', error));

async function start() {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    logger.info(`Connected to ${config.db.dialect}://${config.db.host}:${config.db.port}/${config.db.name}`);

    await syncDatabase();
    await runBootstrap();
    await sweepSubscriptions();

    const server = app.listen(config.port, () => {
      logger.info(`Aj Smart Biz API [${config.env}] listening on http://localhost:${config.port}${config.apiPrefix}`);
    });

    const sweepTimer = setInterval(sweepSubscriptions, SUBSCRIPTION_SWEEP_MS);
    sweepTimer.unref();

    const shutdown = (signal) => async () => {
      logger.warn(`${signal} received, shutting down`);
      clearInterval(sweepTimer);
      server.close(async () => {
        await sequelize.close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', shutdown('SIGTERM'));
    process.on('SIGINT', shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

start();
