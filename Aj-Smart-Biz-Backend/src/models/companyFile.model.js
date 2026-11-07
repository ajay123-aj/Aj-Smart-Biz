'use strict';

const { DataTypes } = require('sequelize');

/**
 * One uploaded file, and who it belongs to.
 *
 * Uploads land in shared folders (`uploads/product/…`), so the disk alone cannot
 * say which company a file is charged to. This ledger can: a row is written when
 * a company uploads a file, removed when the file is deleted, and the company's
 * storage usage is simply `SUM(size_bytes)` — one indexed query rather than a
 * walk of the disk on every upload.
 *
 * `path` is the public path the rest of the schema stores (`/uploads/x/y.png`),
 * unique so one file is never charged twice. Files that existed before the
 * ledger are registered by `storageService.reconcileCompany`, which reads every
 * file column a company's rows point at and records each one with its size on
 * disk.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyFile',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      path: { type: DataTypes.STRING(255), allowNull: false },
      folder: { type: DataTypes.STRING(40), allowNull: true },
      sizeBytes: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      mimeType: { type: DataTypes.STRING(100), allowNull: true },
      uploadedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_files',
      indexes: [
        { name: 'company_files_path_unique', unique: true, fields: ['path'] },
        { fields: ['company_id'] },
      ],
    }
  );
