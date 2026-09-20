'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES, SOCIAL_PLATFORM_VALUES } = require('../constants');

/**
 * One social profile a company publishes in its website footer.
 *
 * Typed by platform rather than free-form, for the two reasons that show up in
 * the footer itself: the icon has to be chosen from somewhere, and "Facebook"
 * typed four different ways is four different things to anything that groups by
 * it. `SOCIAL_PLATFORM.OTHER` is the escape hatch — any URL, a generic glyph —
 * so a network nobody anticipated is publishable without a release.
 *
 * **Rows exist independently of the functionality being granted or switched
 * on.** Losing a plan, or turning the row of icons off for a season, must not
 * delete a tenant's links: the feature decides whether the footer *renders*
 * them, and these rows decide what there is to render. That is the same rule
 * `company_whatsapp_numbers` follows, for the same reason.
 *
 * One row per platform is the common case but not a constraint — a company with
 * two YouTube channels is entitled to list both, and `sequence` is what decides
 * the order they appear in.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanySocialLink',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

      /** One of `SOCIAL_PLATFORM`. Decides the icon and the accessible name. */
      platform: { type: DataTypes.ENUM(...SOCIAL_PLATFORM_VALUES), allowNull: false },

      /**
       * The profile's address, stored exactly as it was accepted.
       *
       * Whole URL rather than a handle: every one of these networks has at
       * least two address shapes in the wild, and reassembling one from a
       * handle is how a link ends up pointing at a page that does not exist.
       * The validator normalises the scheme and refuses anything that is not
       * `http(s)`, so what is stored is always something a browser can open.
       */
      url: { type: DataTypes.STRING(500), allowNull: false },

      /**
       * Overrides the platform's name where the company wants it to.
       *
       * Rendered as the link's accessible name and its tooltip, never as
       * visible text — the footer shows icons. Useful for "Careers on LinkedIn"
       * or for telling two channels apart.
       */
      label: { type: DataTypes.STRING(80), allowNull: true },

      /** Low to high. The order the icons appear in the footer. */
      sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_social_links',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['platform'] },
        { fields: ['status'] },
        { fields: ['sequence'] },
      ],
    }
  );
