'use strict';

const { DataTypes } = require('sequelize');
const { DEVICE_TYPE, DEVICE_TYPE_VALUES } = require('../constants');

/**
 * One visit to a tenant's public website — the detail behind a lead.
 *
 * The website fires `POST /public/leads` on every launch, so the raw stream is
 * page loads, not visits. Folding them is `recordVisit`'s job: another launch
 * from the same device inside `LEAD_VISIT_SESSION_MINUTES` bumps this row's
 * `pageViewCount` and `lastActivityAt` instead of writing a new one. Without
 * that, "visits" would be page views wearing a different name and the console's
 * per-lead history would be unreadable for anyone who browsed three pages.
 *
 * ## Columns and blobs
 *
 * Anything the console filters, sorts or groups by has a column of its own so
 * an index can reach it. Everything else the browser reported is kept verbatim
 * in `device`, `location` and `extra` — because "etc, all possible" is a moving
 * target, and a JSON blob absorbs a field the template starts sending next
 * month without a migration. The blobs are capped in `lead.service` so a
 * crafted request cannot park megabytes in a tenant's database.
 *
 * ## Not soft-deleted
 *
 * The only table in the schema that opts out of `paranoid`. A visit is a fact
 * about something that already happened — there is no state to restore and
 * nothing to correct — and this is the one table that grows with traffic rather
 * than with the customer's business, so a `deleted_at` on every row would be an
 * index nobody ever reads.
 *
 * Note what that does *not* mean. `Lead` is paranoid like everything else, so
 * deleting a lead only sets its `deleted_at`; the foreign key's `CASCADE` fires
 * on a real `DELETE` and therefore does not run, and these rows stay behind a
 * lead that has gone from the console. That is the right outcome — the traffic
 * still happened, and the platform-wide counts should not move because one
 * tenant tidied its list — but it does mean this table is only ever emptied
 * deliberately, by deleting the company or by a retention sweep.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'LeadVisit',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      leadId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Denormalised from the lead so every read this table serves — the super
       * admin's cross-tenant list, the analytics — can filter without a join,
       * and so a visit can never be attributed to the wrong tenant by a bad
       * join. `branchId` is this visit's own: unlike the lead's, it is the
       * branch site *this* visit landed on, so a returning visitor reading a
       * different branch's site is visible as exactly that.
       */
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      deviceId: { type: DataTypes.STRING(64), allowNull: false },

      /**
       * The browser tab's own id, where the website sent one. Distinct from the
       * device: two tabs are two sessions on one device, and a session dies
       * when the tab does. Advisory — the server does its own folding by time —
       * but it is what separates two genuinely concurrent visits.
       */
      sessionId: { type: DataTypes.STRING(64), allowNull: true },

      visitedAt: { type: DataTypes.DATE, allowNull: false },
      /** Moves with each page load folded into this visit; `visitedAt` does not. */
      lastActivityAt: { type: DataTypes.DATE, allowNull: true },
      /** Page loads folded into this visit. Always at least 1. */
      pageViewCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },

      /* ---------------- The page ---------------- */

      pageUrl: { type: DataTypes.STRING(500), allowNull: true },
      /** `/contact` — the path alone, which is what a "most-landed-on" report groups by. */
      path: { type: DataTypes.STRING(255), allowNull: true },
      pageTitle: { type: DataTypes.STRING(255), allowNull: true },
      /** The host the visit was served on, so a multi-domain tenant is separable. */
      host: { type: DataTypes.STRING(255), allowNull: true },
      referrer: { type: DataTypes.STRING(500), allowNull: true },
      referrerHost: { type: DataTypes.STRING(180), allowNull: true },

      /* ---------------- Campaign ---------------- */

      /**
       * Every `utm_*` key the URL carried plus any recognised click id, exactly
       * as spelled. A marketing team invents its own the week after this ships,
       * so the blob is the record and the five columns below are the index.
       */
      utm: { type: DataTypes.JSON, allowNull: true },
      utmSource: { type: DataTypes.STRING(160), allowNull: true },
      utmMedium: { type: DataTypes.STRING(160), allowNull: true },
      utmCampaign: { type: DataTypes.STRING(160), allowNull: true },
      utmTerm: { type: DataTypes.STRING(160), allowNull: true },
      utmContent: { type: DataTypes.STRING(160), allowNull: true },

      /* ---------------- The machine ---------------- */

      fcmToken: { type: DataTypes.STRING(512), allowNull: true },
      /** The raw header, kept whole: the parse below is a best effort over it. */
      userAgent: { type: DataTypes.STRING(500), allowNull: true },
      deviceType: {
        type: DataTypes.ENUM(...DEVICE_TYPE_VALUES),
        allowNull: false,
        defaultValue: DEVICE_TYPE.UNKNOWN,
      },
      deviceVendor: { type: DataTypes.STRING(60), allowNull: true },
      deviceModel: { type: DataTypes.STRING(80), allowNull: true },
      os: { type: DataTypes.STRING(40), allowNull: true },
      osVersion: { type: DataTypes.STRING(40), allowNull: true },
      browser: { type: DataTypes.STRING(60), allowNull: true },
      browserVersion: { type: DataTypes.STRING(40), allowNull: true },
      engine: { type: DataTypes.STRING(40), allowNull: true },
      isBot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      screenWidth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      screenHeight: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      viewportWidth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      viewportHeight: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      pixelRatio: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
      orientation: { type: DataTypes.STRING(30), allowNull: true },

      /**
       * Everything else the browser said about itself — touch points, memory,
       * cores, connection type, whether it is in a standalone PWA. Uncapped in
       * shape, capped in size.
       */
      device: { type: DataTypes.JSON, allowNull: true },

      /* ---------------- Where ---------------- */

      ip: { type: DataTypes.STRING(45), allowNull: true },
      country: { type: DataTypes.STRING(80), allowNull: true },
      region: { type: DataTypes.STRING(80), allowNull: true },
      city: { type: DataTypes.STRING(80), allowNull: true },
      timezone: { type: DataTypes.STRING(64), allowNull: true },
      /** Minutes behind UTC, as `Date#getTimezoneOffset` reports it. */
      timezoneOffset: { type: DataTypes.INTEGER, allowNull: true },
      language: { type: DataTypes.STRING(40), allowNull: true },
      languages: { type: DataTypes.JSON, allowNull: true },

      /**
       * Precise coordinates, and null in the overwhelming majority of rows.
       *
       * The website does not ask for the location permission on launch — a
       * prompt before the visitor has read anything is how a site gets closed —
       * so these are filled in only where the page had already been granted it.
       * See `collectLocation` in the website's tracker.
       */
      latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      /** Radius in metres the browser reported for the fix above. */
      locationAccuracy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      /** How the coordinates were obtained: `geolocation`, or a name the site chose. */
      locationSource: { type: DataTypes.STRING(40), allowNull: true },
      /** Whatever else the site knows about where this is — uncapped in shape. */
      location: { type: DataTypes.JSON, allowNull: true },

      /**
       * Anything the template wants to record that this schema has no column
       * for. Off the request's `extra` object, capped and stringified.
       */
      extra: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: 'lead_visits',
      /** A visit is a fact. See the class comment. */
      paranoid: false,
      indexes: [
        /** The per-lead history, newest first — the detail screen's only read. */
        { fields: ['lead_id', 'visited_at'] },
        /** The session-folding lookup every tracking call makes. */
        { fields: ['company_id', 'device_id', 'visited_at'] },
        { fields: ['branch_id'] },
        { fields: ['visited_at'] },
        { fields: ['utm_source'] },
        { fields: ['utm_campaign'] },
        { fields: ['device_type'] },
        { fields: ['is_bot'] },
      ],
    }
  );
