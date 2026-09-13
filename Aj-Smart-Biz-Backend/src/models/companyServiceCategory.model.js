'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, FEATURE_ICON_FALLBACK } = require('../constants');

/**
 * How a business sorts the work it sells - `Hair`, `Skin`, `Bridal`, and the
 * subcategories under them.
 *
 * ### Why this is not `company_categories`
 *
 * It is the same shape as the product tree, and it is deliberately a second
 * table rather than a `kind` column on the first. Two reasons, and both are
 * about what happens later:
 *
 *  - **They are sold separately.** A salon has Services and no catalogue; a
 *    furniture shop has a catalogue and two services. Filing both taxonomies in
 *    one table would mean every read on either had to remember to filter, and the
 *    one that forgot would show a shop's product categories on its services page.
 *  - **A shared unique slug would collide across them.** `/products/bridal` and
 *    `/services/bridal` are different pages on the same site, and one table means
 *    one of them has to be renamed for no reason a tenant would understand.
 *
 * The *logic* is shared rather than duplicated: the depth, cycle and nesting
 * arithmetic lives in `catalogue.controller` and is imported by the service
 * category controller, so a tree is a tree in exactly one place.
 *
 * Depth is capped at `CATEGORY_DEPTH_MAX` like the catalogue's. A salon needs
 * two levels and uses two; nothing on a website reads well past three.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyServiceCategory',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /** Branch this belongs to; NULL means the whole company. */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** NULL is a main category; anything else makes this a subcategory. */
      parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      name: { type: DataTypes.STRING(150), allowNull: false },
      /**
       * The address it is reached at - `/services?category=bridal`.
       *
       * Generated from the name and made unique within the tenant, and **not**
       * rewritten when the name changes: a category is linked to from the home
       * page's band and from every service filed in it.
       */
      slug: { type: DataTypes.STRING(160), allowNull: false },
      description: { type: DataTypes.STRING(600), allowNull: true },

      /** An upload path. Optional - the icon is what a card without one uses. */
      image: { type: DataTypes.STRING(255), allowNull: true },
      /**
       * A key from `FEATURE_ICONS`, the same closed library the service cards and
       * the benefit cards draw from. One library rather than three: a site showing
       * all of them should look like it was drawn by one hand.
       */
      icon: { type: DataTypes.STRING(40), allowNull: false, defaultValue: FEATURE_ICON_FALLBACK },

      /** Read this one first. The home page's band shows featured categories. */
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_service_categories',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['parent_id'] },
        { fields: ['slug'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
