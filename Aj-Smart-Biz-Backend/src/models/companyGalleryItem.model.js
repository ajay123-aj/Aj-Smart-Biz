'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * One image in the website's Gallery section.
 *
 * `image` is the only field that really matters — a gallery of untitled
 * photographs is a perfectly good gallery — so title and caption are optional
 * and the template lays out cleanly without them.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyGalleryItem',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * Same rule the sliders follow: a branch-pinned domain shows the branch's
       * own images, and falls back to the company-wide ones when it has
       * none — so a new branch site is never blank and an existing one is never
       * silently replaced.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** Relative upload path, e.g. `/uploads/gallery/frame-17.jpg`. */
      image: { type: DataTypes.STRING(255), allowNull: false },
      title: { type: DataTypes.STRING(150), allowNull: true },
      caption: { type: DataTypes.STRING(400), allowNull: true },
      /**
       * Alternative text. Falls back to the title when empty, and to nothing
       * when there is no title either — an image with no alt at all is marked
       * decorative rather than given a meaningless one.
       */
      altText: { type: DataTypes.STRING(200), allowNull: true },
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_gallery_items',
      indexes: [{ fields: ['company_id'] }, { fields: ['branch_id'] }, { fields: ['status'] }, { fields: ['sequence'] }],
    }
  );
