'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');
const { sequelize, ensureDatabaseExists } = require('../config/database');
const db = require('../models'); // registers models + associations before sync
const { runBootstrap } = require('../seeders/bootstrap');

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
  } else if (config.db.dialect === 'mysql') {
    await dropDuplicateMysqlIndexes();
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
 * Drops duplicate indexes left behind by `sync({ alter: true })` on MySQL.
 *
 * A column declared `unique: true` makes every alter-sync issue
 * `ALTER TABLE ... CHANGE col col ... UNIQUE`, and MySQL answers each one with a
 * *new* index (`key`, `key_2`, `key_3`, ...) instead of reusing the old one.
 * After 63 restarts the table is full and boot fails with ER_TOO_MANY_KEYS.
 *
 * For each table, indexes with the same columns, in the same order and with
 * the same uniqueness, are duplicates. One is kept and the rest are dropped.
 * It keeps the name that does not end in `_N`, preferring sequelize's
 * `<table>_<cols>` form, so the index the models declare survives. A drop that
 * MySQL refuses (an FK that needs that exact index) is logged and skipped:
 * cleanup must never be the reason the server fails to start.
 *
 * Idempotent: on a clean schema it finds nothing and does nothing.
 */
async function dropDuplicateMysqlIndexes() {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME <> 'PRIMARY'
      GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`
  );

  const groups = new Map();
  for (const row of rows) {
    const id = `${row.tableName}|${row.cols}|${row.nonUnique}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }

  const rank = (row) => {
    const preferred = `${row.tableName}_${String(row.cols).split(',').join('_')}`;
    if (row.indexName === preferred) return 0;
    if (!/_\d+$/.test(row.indexName)) return 1;
    return 2;
  };

  let dropped = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => rank(a) - rank(b) || a.indexName.localeCompare(b.indexName));
    for (const extra of group.slice(1)) {
      try {
        await sequelize.query(`ALTER TABLE \`${extra.tableName}\` DROP INDEX \`${extra.indexName}\``);
        dropped += 1;
      } catch (error) {
        logger.warn(`Could not drop duplicate index ${extra.tableName}.${extra.indexName}: ${error.message}`);
      }
    }
  }

  if (dropped) logger.info(`Dropped ${dropped} duplicate index(es) before schema sync`);
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
 * Everything that prepares the database: create it if missing, reconcile the
 * schema (per DB_SYNC_MODE), then seed the defaults — menus, role permissions,
 * catalogues, the super admin. Each step is idempotent.
 *
 * Run on boot only when DB_SETUP_ON_START=true, and on demand with
 * `npm run db:setup`. Skipping it makes a restart take a second instead of a
 * full schema walk — but after pulling a change that adds a table, a column or
 * a menu, run it once (or start once with the flag on).
 */
async function runDatabaseSetup() {
  await ensureDatabaseExists();
  await sequelize.authenticate();
  await syncDatabase();
  await runBootstrap();
  logger.info('Database setup complete (schema + seed data)');
}

module.exports = { runDatabaseSetup, syncDatabase };
