'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { sequelize } = require('./config/database');
require('./models'); // registers models + associations
const { runDatabaseSetup } = require('./database/setup');
const { runDueSubscriptions } = require('./services/subscription.service');

/** Hourly is enough: terms are measured in days, and the sweep is idempotent. */
const SUBSCRIPTION_SWEEP_MS = 60 * 60 * 1000;

/**
 * Rolls subscriptions forward: starts terms that were scheduled for today and
 * closes the ones that have run out (renewing those set to auto renew). Without
 * this a countdown would reach zero and the status would sit there unchanged.
 */
const sweepSubscriptions = () =>
  runDueSubscriptions().catch((error) => logger.error('Subscription sweep failed:', error));

async function start() {
  try {
    /* DB_SETUP_ON_START=true: create the database if missing, sync the schema
       and seed defaults. false: just connect and serve — run
       `npm run db:setup` (or flip the flag for one start) after a schema change. */
    if (config.db.setupOnStart) {
      await runDatabaseSetup();
    } else {
      await sequelize.authenticate();
      logger.info('DB_SETUP_ON_START=false - skipping schema sync and seeding');
    }
    logger.info(`Connected to ${config.db.dialect}://${config.db.host}:${config.db.port}/${config.db.name}`);

    await sweepSubscriptions();

    const server = app.listen(config.port, () => {
      logger.info(`Aj Smart Biz API [${config.env}] listening on http://localhost:${config.port}${config.apiPrefix}`);
    });

    const sweepTimer = setInterval(sweepSubscriptions, SUBSCRIPTION_SWEEP_MS);
    sweepTimer.unref();

    /* Register files uploaded before storage was tracked, and drop ledger rows
       whose file is gone. In the background: it reads the disk, and nothing
       about serving requests should wait for it. */
    require('./services/storage.service')
      .reconcileAll()
      .catch((error) => logger.warn(`Storage reconcile skipped: ${error.message}`));

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
