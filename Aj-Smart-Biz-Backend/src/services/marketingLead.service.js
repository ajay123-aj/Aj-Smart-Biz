'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { describeVisit, clientIp } = require('./lead.service');
const { LEAD_VISIT_SESSION_MINUTES } = require('../constants');
const crypto = require('crypto');

/**
 * Tracking for **our own** marketing site.
 *
 * The tenant twin is `lead.service`, and the two deliberately share everything
 * that parses a beacon: `describeVisit` bounds the payload, parses the user
 * agent and collects the `utm_*` parameters, and it is imported rather than
 * copied so the two cannot drift the first time one learns about a new field.
 *
 * What is *not* shared is the write, and that is the honest cost of the second
 * table. `recordVisit` over there is scoped to a company and a branch on every
 * query; this one has neither, so the transaction body below is its own rather
 * than a version of that one with two parameters threaded through it. It is
 * simpler for it — there is one site, and no tenant to keep anybody out of.
 */

/**
 * Who this device is.
 *
 * The browser's own id where it sent one, because that is the only stable
 * answer. Where it did not — a first load, a blocked storage API, a beacon
 * from something that is not our page — a hash of address and user agent
 * stands in, so the visit is still counted against *something* rather than
 * creating a new lead on every page load.
 *
 * Unsalted by design: the same visitor must hash to the same id tomorrow, and
 * there is nothing secret here to protect. It is a grouping key, not a secret.
 */
const resolveDeviceId = (payload, req) => {
  const given = typeof payload.deviceId === 'string' ? payload.deviceId.trim().slice(0, 64) : '';
  if (given) return given;

  const material = ['marketing', clientIp(req) || '', req.get('user-agent') || ''].join('|');
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 40);
};

/**
 * Records one beacon from the marketing site.
 *
 * Returns `{ leadId, visitId, isNewLead }` — enough for the caller to answer
 * and nothing the browser has any business knowing about other visitors.
 */
async function recordVisit({ payload, req }) {
  const deviceId = resolveDeviceId(payload, req);
  const seen = describeVisit(payload, req);
  const now = new Date();

  /**
   * Whether this beacon is a page being looked at.
   *
   * Almost always yes, and absent on almost every call — only a client that
   * means otherwise sends `pageView: false`. The site does that when a visitor
   * grants the location permission: the coordinates have to reach us, and
   * another call to this endpoint is the only way to carry them. Counting it
   * as a view would mean every granted permission silently added a page nobody
   * opened.
   */
  const claimsPageView = payload.pageView !== false;

  return db.sequelize.transaction(async (transaction) => {
    /**
     * `device_id` carries no database-level unique constraint — see the note on
     * the model — so the row lock is what holds the invariant.
     */
    const [lead, isNewLead] = await db.MarketingLead.findOrCreate({
      where: { deviceId },
      defaults: {
        deviceId,
        firstSeenAt: now,
        lastSeenAt: now,
        visitCount: 0,
        pageViewCount: 0,
        /* First touch, written once and never overwritten. */
        firstLandingUrl: seen.pageUrl,
        firstReferrer: seen.referrer,
        firstReferrerHost: seen.referrerHost,
        firstUtm: seen.utm,
        ...seen.utmColumns,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    /**
     * Is the visitor still here, or have they come back?
     *
     * Anything inside the session window is the same visit — the site fires
     * this on every page load, and four pages is one visit, not four.
     */
    const windowStart = new Date(now.getTime() - LEAD_VISIT_SESSION_MINUTES * 60 * 1000);
    const openVisit = isNewLead
      ? null
      : await db.MarketingLeadVisit.findOne({
          where: {
            leadId: lead.id,
            visitedAt: { [Op.gte]: windowStart },
            ...(seen.sessionId ? { sessionId: seen.sessionId } : {}),
          },
          order: [['visitedAt', 'DESC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

    /** See `claimsPageView`. A new visit row is always one view. */
    const pageViewDelta = openVisit && !claimsPageView ? 0 : 1;

    let visit;
    if (openVisit) {
      /**
       * Same visit, another page. The campaign fields are left alone: a visit
       * is attributed to the URL it started on, and an internal navigation
       * that drops the query string must not erase that.
       */
      await openVisit.update(
        {
          lastActivityAt: now,
          pageViewCount: openVisit.pageViewCount + pageViewDelta,
          /* Latest page wins — the detail screen shows where they got to. */
          pageUrl: seen.pageUrl ?? openVisit.pageUrl,
          path: seen.path ?? openVisit.path,
          pageTitle: seen.pageTitle ?? openVisit.pageTitle,
          ...(seen.latitude !== null && seen.longitude !== null
            ? {
                latitude: seen.latitude,
                longitude: seen.longitude,
                locationAccuracy: seen.locationAccuracy,
                locationSource: seen.locationSource,
              }
            : {}),
        },
        { transaction }
      );
      visit = openVisit;
    } else {
      visit = await db.MarketingLeadVisit.create(
        {
          leadId: lead.id,
          deviceId,
          sessionId: seen.sessionId,
          visitedAt: now,
          lastActivityAt: now,
          pageViewCount: 1,

          pageUrl: seen.pageUrl,
          path: seen.path,
          pageTitle: seen.pageTitle,
          host: seen.host,
          referrer: seen.referrer,
          referrerHost: seen.referrerHost,

          utm: seen.utm,
          ...seen.utmColumns,

          userAgent: seen.userAgent,
          deviceType: seen.agent.deviceType,
          deviceVendor: seen.agent.deviceVendor,
          deviceModel: seen.agent.deviceModel,
          os: seen.agent.os,
          osVersion: seen.agent.osVersion,
          browser: seen.agent.browser,
          browserVersion: seen.agent.browserVersion,
          engine: seen.agent.engine,
          isBot: seen.agent.isBot,

          screenWidth: seen.screenWidth,
          screenHeight: seen.screenHeight,
          viewportWidth: seen.viewportWidth,
          viewportHeight: seen.viewportHeight,
          pixelRatio: seen.pixelRatio,
          orientation: seen.orientation,
          device: seen.deviceBlob,

          ip: clientIp(req),
          country: seen.country,
          region: seen.region,
          city: seen.city,
          timezone: seen.timezone,
          timezoneOffset: seen.timezoneOffset,
          language: seen.language,
          languages: seen.languages,
          latitude: seen.latitude,
          longitude: seen.longitude,
          locationAccuracy: seen.locationAccuracy,
          locationSource: seen.locationSource,
          location: seen.locationBlob,
          extra: seen.extra,
        },
        { transaction }
      );
    }

    /**
     * The lead's own counters and its last-touch attribution.
     *
     * `visitCount` only moves when a visit row was actually created, so it
     * counts visits rather than beacons. Last touch is overwritten on every
     * *new* visit and left alone within one, for the same reason the visit's
     * own campaign fields are.
     */
    await lead.update(
      {
        lastSeenAt: now,
        visitCount: lead.visitCount + (openVisit ? 0 : 1),
        pageViewCount: lead.pageViewCount + pageViewDelta,

        ...(openVisit
          ? {}
          : {
              lastLandingUrl: seen.pageUrl,
              lastReferrer: seen.referrer,
              lastReferrerHost: seen.referrerHost,
              lastUtm: seen.utm,
            }),

        /* The machine and the place, as last seen. */
        deviceType: seen.agent.deviceType,
        deviceVendor: seen.agent.deviceVendor,
        deviceModel: seen.agent.deviceModel,
        os: seen.agent.os,
        osVersion: seen.agent.osVersion,
        browser: seen.agent.browser,
        browserVersion: seen.agent.browserVersion,
        isBot: seen.agent.isBot,

        ip: clientIp(req),
        country: seen.country ?? lead.country,
        region: seen.region ?? lead.region,
        city: seen.city ?? lead.city,
        timezone: seen.timezone ?? lead.timezone,
        language: seen.language ?? lead.language,
        ...(seen.latitude !== null && seen.longitude !== null
          ? { latitude: seen.latitude, longitude: seen.longitude }
          : {}),
      },
      { transaction }
    );

    return { leadId: lead.id, visitId: visit.id, isNewLead };
  });
}

/**
 * Attaches an enquiry to the device that sent it.
 *
 * This is the join the whole table exists for: it turns "somebody from the
 * autumn campaign read the pricing page four times" into "…and then asked for
 * a demo". Called from the enquiry endpoint, which knows the `deviceId` only
 * because the form sends it.
 *
 * **Never throws.** A failure here must not fail the enquiry — the enquiry is
 * the thing that matters and is already stored by the time this runs. An
 * unattributed enquiry is a reporting gap; a refused one is a lost customer.
 */
async function attachEnquiry({ deviceId, enquiry }) {
  if (!deviceId || !enquiry) return null;

  try {
    const lead = await db.MarketingLead.findOne({ where: { deviceId } });
    if (!lead) return null;

    await lead.update({
      enquiryId: enquiry.id,
      /* What they turned out to be. Only filled where the lead had nothing —
         the first name we learned is the one that matched the traffic. */
      name: lead.name ?? enquiry.name ?? null,
      email: lead.email ?? enquiry.email ?? null,
      phone: lead.phone ?? enquiry.phone ?? null,
    });

    return lead;
  } catch {
    return null;
  }
}

module.exports = { recordVisit, attachEnquiry, resolveDeviceId };
