'use strict';

const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { sequelize, ensureDatabaseExists } = require('./config/database');
const db = require('./models'); // registers models + associations before sync
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
  /**
   * SQLite has no real ALTER: sequelize emulates it by copying the table to a
   * new one and dropping the original, which a foreign key pointing at that
   * table refuses to allow. On a populated database the whole sync then fails
   * with `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed` on `DROP TABLE`,
   * and adding one column to a referenced table — `plans`, `companies` — is
   * enough to trigger it.
   *
   * Foreign keys are therefore suspended for the rebuild and switched straight
   * back on. This is the documented way to do it, and it is safe here because
   * the copy preserves the rows: nothing is written between the two pragmas
   * except sequelize's own table rebuild.
   *
   * MySQL, the default dialect, does a real ALTER TABLE and needs none of this.
   */
  const isSqlite = config.db.dialect === 'sqlite';
  let rescued = null;

  if (isSqlite) {
    rescued = await repairSqliteBeforeSync();
    await sequelize.query('PRAGMA foreign_keys = OFF;');
  }

  try {
    await sequelize.sync({ alter: true });
  } finally {
    if (isSqlite) await sequelize.query('PRAGMA foreign_keys = ON;');
  }

  // The table sync has just recreated, refilled with what was in the old one.
  if (rescued?.length) await restoreFunctionalityRows(rescued);

  logger.info('Schema synced (alter)');
}

/**
 * Clears the two things that make a SQLite database refuse to sync a second
 * time. Both are artefacts of sequelize emulating ALTER by copying tables, and
 * both leave a boot failure whose message says nothing about the real cause.
 *
 * 1. **Leftover `*_backup` tables.** A sync that failed part-way leaves the
 *    half-built copy behind, and the next attempt collides with it.
 *
 * 2. **A composite UNIQUE on `company_functionalities`.** Sequelize reads the
 *    table back before copying it and reports `(company_id, key)` as a unique
 *    on `key` alone, then recreates it that way — which rejects the second
 *    feature any company has switched on. The model no longer declares the
 *    constraint on SQLite (see `companyFunctionality.model.js`), so this drops
 *    it from databases created before that, once. `findOrCreate` in the
 *    controller is what holds the invariant either way.
 *
 * The rows are read out and the table dropped, rather than rebuilt by hand:
 * `CREATE TABLE … AS SELECT` in SQLite copies the data but none of the schema —
 * no primary key, no defaults — which leaves a table that cannot take an
 * insert. Letting `sync` recreate it and putting the rows back is the only way
 * to end up with the schema the model actually describes.
 *
 * Returns the rows to restore once sync has run, or null when nothing needed
 * doing. MySQL does a real ALTER TABLE and never reaches any of this.
 */
async function repairSqliteBeforeSync() {
  const [leftovers] = await sequelize.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%\\_backup' ESCAPE '\\'"
  );
  for (const { name } of leftovers) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(`DROP TABLE IF EXISTS \`${name}\`;`);
    logger.warn(`Dropped leftover table "${name}" from an interrupted sync`);
  }

  const [[table] = []] = await sequelize.query(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='company_functionalities'"
  );
  if (!table?.sql || !/UNIQUE\s*\(\s*`?company_id`?\s*,\s*`?key`?\s*\)/i.test(table.sql)) return null;

  const [rows] = await sequelize.query('SELECT * FROM `company_functionalities`');

  await sequelize.query('PRAGMA foreign_keys = OFF;');
  try {
    await sequelize.query('DROP TABLE `company_functionalities`;');
  } finally {
    await sequelize.query('PRAGMA foreign_keys = ON;');
  }

  logger.warn(
    `Dropping company_functionalities to shed its composite UNIQUE (SQLite cannot carry it); ` +
      `${rows.length} switch row(s) will be restored after the sync`
  );
  return rows;
}

/** Puts the switch rows back into the table sync has just recreated. */
async function restoreFunctionalityRows(rows) {
  await db.CompanyFunctionality.bulkCreate(
    rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      key: row.key,
      // Stored as JSON; SQLite hands it back as the raw string.
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings || 'null') : row.settings,
      status: row.status,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    { ignoreDuplicates: true }
  );
  logger.info(`Restored ${rows.length} functionality switch row(s)`);
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
