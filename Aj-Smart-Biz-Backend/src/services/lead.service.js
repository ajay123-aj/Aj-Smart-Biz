'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../models');
const { parseUserAgent, fromClientHints } = require('../utils/userAgent');
const {
  UTM_COLUMNS,
  CLICK_ID_PARAMS,
  LEAD_TRACKING_LIMITS,
  LEAD_VISIT_SESSION_MINUTES,
  DEVICE_TYPE,
} = require('../constants');

/**
 * Turning one website launch into a lead and a visit.
 *
 * Everything that decides *what is stored* lives here rather than in the
 * controller, because the same rules have to hold for a request that arrives
 * from a tenant's website today and from a mobile app tomorrow — and because
 * every field in the payload is attacker-controlled. The controller's job is to
 * work out which tenant is being tracked; this file's job is to distrust the
 * rest of it.
 */

/* ------------------------------------------------------------------ *
 * Coercion
 *
 * The payload is JSON from a public endpoint, so a "string" may be an object,
 * an array or 40kB of text. Everything below either returns a value of the
 * declared type and length or returns null; nothing throws, because a visitor
 * with an odd browser should still be recorded rather than 400'd.
 * ------------------------------------------------------------------ */

/** A string of at most `max` characters, or null. Objects and arrays are refused. */
const text = (value, max) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

/** A non-negative integer within `max`, or null. */
const count = (value, max = 100000) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(Math.round(number), max);
};

const decimal = (value, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
};

/** `https://acme.com/contact?x=1` -> `acme.com`. Null for anything unparseable. */
const hostOf = (url) => {
  const value = text(url, 500);
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase().slice(0, 180) || null;
  } catch {
    return null;
  }
};

/** The path alone, so "which page do people land on" is groupable. */
const pathOf = (url) => {
  const value = text(url, 500);
  if (!value) return null;
  try {
    return new URL(value).pathname.slice(0, 255) || null;
  } catch {
    // A relative path was sent rather than a full URL, which is fine.
    return value.startsWith('/') ? value.split('?')[0].slice(0, 255) : null;
  }
};

/**
 * A flat, size-bounded copy of a client-supplied object.
 *
 * Nested structures are JSON-stringified into their slot rather than walked:
 * that keeps one bounded pass over the input, so no payload — however deeply
 * nested — can cost more than `maxKeys × maxValue` to store or to process.
 */
const flatten = (source, maxKeys, maxValue) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (Object.keys(out).length >= maxKeys) break;
    if (value === null || value === undefined || value === '') continue;

    const name = String(key).trim().slice(0, 60);
    if (!name) continue;

    if (typeof value === 'object') {
      try {
        out[name] = JSON.stringify(value).slice(0, maxValue);
      } catch {
        // Circular or otherwise unserialisable — skip the key, keep the rest.
      }
      continue;
    }

    /**
     * Numbers and booleans are kept as themselves rather than stringified.
     * They are already bounded in size, and a screen width stored as `"412"`
     * cannot be compared, summed or sorted by anything reading the blob later.
     * Only strings need the cap, because only strings can be arbitrarily long.
     */
    out[name] = typeof value === 'string' ? value.slice(0, maxValue) : value;
  }

  return Object.keys(out).length ? out : null;
};

/* ------------------------------------------------------------------ *
 * Campaign parameters
 * ------------------------------------------------------------------ */

/**
 * Every `utm_*` key the URL carried, plus any recognised click id.
 *
 * "utm also like utm_ any key then store" — so the rule is the prefix, not a
 * list: a team that invents `utm_placement` next week gets it stored without
 * anyone touching this file. The five that reports group by are lifted onto
 * columns afterwards by `utmColumns`; the rest live in the JSON.
 *
 * Accepts either an object of query parameters or a full URL, because the
 * website sends the parsed object and a server-side caller has only the URL.
 */
const collectUtm = (source, url) => {
  const params = {};

  const add = (key, value) => {
    const name = String(key || '').trim().toLowerCase();
    if (!name) return;
    const isUtm = name.startsWith('utm_') && name.length > 4;
    if (!isUtm && !CLICK_ID_PARAMS.includes(name)) return;
    if (Object.keys(params).length >= LEAD_TRACKING_LIMITS.utmKeys && !(name in params)) return;

    const clean = text(Array.isArray(value) ? value[0] : value, LEAD_TRACKING_LIMITS.utmValue);
    if (clean) params[name] = clean;
  };

  if (source && typeof source === 'object' && !Array.isArray(source)) {
    Object.entries(source).forEach(([key, value]) => add(key, value));
  }

  // The URL is read too, so a launch that sent no parsed object still attributes.
  const fullUrl = text(url, 500);
  if (fullUrl) {
    try {
      new URL(fullUrl).searchParams.forEach((value, key) => {
        if (!(key.toLowerCase() in params)) add(key, value);
      });
    } catch {
      // Not absolute; the parsed object above is all there is.
    }
  }

  return Object.keys(params).length ? params : null;
};

/** Lifts `utm_source` … `utm_content` out of the blob and onto the columns. */
const utmColumns = (utm) =>
  UTM_COLUMNS.reduce((acc, name) => ({ ...acc, [`utm${name[0].toUpperCase()}${name.slice(1)}`]: utm?.[`utm_${name}`] ?? null }), {});

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * The caller's IP.
 *
 * Express resolves `req.ip` from `X-Forwarded-For` because `trust proxy` is set
 * in `app.js`, which is right behind the one proxy this deploys behind. The
 * `::ffff:` prefix an IPv4 address picks up over an IPv6 socket is stripped so
 * the same visitor is one string rather than two.
 */
const clientIp = (req) => {
  const raw = req.ip || req.socket?.remoteAddress || null;
  if (!raw) return null;
  return String(raw).replace(/^::ffff:/, '').slice(0, 45);
};

/**
 * The device identity to group by.
 *
 * Normally the website's own id, held in the visitor's browser storage. When
 * there is none — storage disabled, a private window, a crawler, or a client
 * that simply did not send one — a synthetic id is derived from the IP and user
 * agent so those visits still collapse into one row instead of creating a new
 * "lead" on every page load.
 *
 * The synthetic id is a truncated SHA-256 with the company mixed in, so the
 * same visitor reaching two tenants cannot be correlated across them from the
 * stored value, and it is prefixed `anon_` so nobody mistakes it for the real
 * thing: it is stable only as long as the IP is, which for a phone is minutes.
 */
const resolveDeviceId = (payload, req, companyId) => {
  const provided = text(payload.deviceId, 64);
  if (provided) return provided.replace(/[^\w.:-]/g, '').slice(0, 64) || null;

  const material = [companyId, clientIp(req) || '', req.get('user-agent') || ''].join('|');
  return `anon_${crypto.createHash('sha256').update(material).digest('hex').slice(0, 40)}`;
};

/* ------------------------------------------------------------------ *
 * The visit
 * ------------------------------------------------------------------ */

/**
 * Everything about one launch, in the shape both tables store.
 *
 * Client Hints override the user-agent parse where the browser sent them —
 * Chromium freezes its UA string and reports the truth only in the hints — but
 * never the other way round: a payload cannot claim to be a device type the
 * hints did not assert.
 */
const describeVisit = (payload, req) => {
  const userAgent = req.get('user-agent') || null;
  const device = payload.device && typeof payload.device === 'object' ? payload.device : {};

  const parsed = parseUserAgent(userAgent, { touchPoints: device.touchPoints });
  const hinted = fromClientHints(payload.clientHints ?? device.userAgentData);

  const agent = { ...parsed, ...hinted };
  // The hints never say "bot"; that verdict stays with the UA string.
  agent.isBot = parsed.isBot;
  if (!DEVICE_TYPE[String(agent.deviceType || '').toUpperCase()]) agent.deviceType = parsed.deviceType;

  const location = payload.location && typeof payload.location === 'object' ? payload.location : {};
  const pageUrl = text(payload.url ?? payload.pageUrl, 500);
  const referrer = text(payload.referrer, 500);

  const utm = collectUtm(payload.utm ?? payload.query, pageUrl);

  return {
    agent,
    userAgent: text(userAgent, 500),
    pageUrl,
    path: pathOf(payload.path ?? pageUrl),
    pageTitle: text(payload.title ?? payload.pageTitle, 255),
    host: text(payload.host, 255) ?? hostOf(pageUrl),
    referrer,
    referrerHost: hostOf(referrer),
    utm,
    utmColumns: utmColumns(utm),
    sessionId: text(payload.sessionId, 64),
    fcmToken: text(payload.fcmToken, 512),

    screenWidth: count(device.screenWidth ?? payload.screenWidth, 30000),
    screenHeight: count(device.screenHeight ?? payload.screenHeight, 30000),
    viewportWidth: count(device.viewportWidth ?? payload.viewportWidth, 30000),
    viewportHeight: count(device.viewportHeight ?? payload.viewportHeight, 30000),
    pixelRatio: decimal(device.pixelRatio, 0, 20),
    orientation: text(device.orientation, 30),

    language: text(payload.language ?? device.language, 40),
    languages: Array.isArray(payload.languages ?? device.languages)
      ? (payload.languages ?? device.languages).slice(0, 10).map((entry) => text(entry, 40)).filter(Boolean)
      : null,
    timezone: text(location.timezone ?? payload.timezone, 64),
    timezoneOffset: Number.isFinite(Number(location.timezoneOffset))
      ? Math.trunc(Number(location.timezoneOffset))
      : null,

    latitude: decimal(location.latitude, -90, 90),
    longitude: decimal(location.longitude, -180, 180),
    locationAccuracy: count(location.accuracy, 10000000),
    locationSource: text(location.source, 40),
    country: text(location.country, 80),
    region: text(location.region ?? location.state, 80),
    city: text(location.city, 80),

    /* The long tail, kept whole and bounded. */
    deviceBlob: flatten(device, LEAD_TRACKING_LIMITS.extraKeys, LEAD_TRACKING_LIMITS.extraValue),
    locationBlob: flatten(location, LEAD_TRACKING_LIMITS.extraKeys, LEAD_TRACKING_LIMITS.extraValue),
    extra: flatten(payload.extra, LEAD_TRACKING_LIMITS.extraKeys, LEAD_TRACKING_LIMITS.extraValue),

    ip: clientIp(req),
  };
};

/**
 * Records one website launch against a company, creating the lead if this
 * device has never been seen and folding the launch into the visitor's current
 * visit if they are still on the site.
 *
 * Runs in a transaction, and locks the lead row while it updates the counters.
 * A page that fires the call from three tabs at once would otherwise race: both
 * the find-or-create and the `visitCount` increment are read-then-write, and
 * without the lock a returning visitor could end up with two lead rows — which
 * is precisely the duplicate the one-row-per-device rule exists to prevent.
 *
 * @param {object}  options
 * @param {object}  options.company  The resolved tenant.
 * @param {object?} options.branch   The branch this host is pinned to, if any.
 * @param {object}  options.payload  The request body, entirely untrusted.
 * @param {object}  options.req      For the IP and the user-agent header.
 * @returns {Promise<{ lead: object, visit: object, isNewLead: boolean, isNewVisit: boolean }>}
 */
async function recordVisit({ company, branch, payload, req }) {
  const companyId = company.id;
  const branchId = branch?.id ?? null;
  const deviceId = resolveDeviceId(payload, req, companyId);
  const seen = describeVisit(payload, req);
  const now = new Date();

  /**
   * Whether this beacon is a page being looked at.
   *
   * Almost always yes, and the field is absent on almost every call — only a
   * client that means otherwise sends `pageView: false`, which is why the test
   * is against `false` rather than for truthiness.
   *
   * The website sends it when a visitor grants the location permission: the
   * coordinates have to reach the platform, and the only way to carry them is
   * another call to this endpoint. Counting that as a view would mean every
   * granted permission silently added a page nobody opened — so it updates
   * what it came to update and leaves the counters alone.
   *
   * A beacon that opens a *new* visit counts regardless of what it claims: the
   * visitor is on a page, whatever else the call was for.
   */
  const claimsPageView = payload.pageView !== false;

  return db.sequelize.transaction(async (transaction) => {
    /**
     * `(company_id, device_id)` carries no database-level unique constraint —
     * see the note on the model — so the row lock is what actually holds the
     * invariant. `findOrCreate` in the same transaction narrows the window to
     * the create itself.
     */
    const [lead, isNewLead] = await db.Lead.findOrCreate({
      where: { companyId, deviceId },
      defaults: {
        companyId,
        branchId,
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
     * this call on every page load, and four pages is one visit, not four.
     */
    const windowStart = new Date(now.getTime() - LEAD_VISIT_SESSION_MINUTES * 60 * 1000);
    const openVisit = isNewLead
      ? null
      : await db.LeadVisit.findOne({
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
       * Same visit, another page. The campaign fields are left alone: the visit
       * is attributed to the URL it started on, and an internal navigation that
       * drops the query string must not erase that.
       */
      await openVisit.update(
        {
          lastActivityAt: now,
          pageViewCount: openVisit.pageViewCount + pageViewDelta,
          /* Latest page wins — the detail screen shows where they got to. */
          pageUrl: seen.pageUrl ?? openVisit.pageUrl,
          path: seen.path ?? openVisit.path,
          pageTitle: seen.pageTitle ?? openVisit.pageTitle,
          /* A token can be granted mid-visit; nothing else here can improve. */
          fcmToken: seen.fcmToken ?? openVisit.fcmToken,
          /* So can the location permission. */
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
      visit = await db.LeadVisit.create(
        {
          leadId: lead.id,
          companyId,
          /* This visit's own branch, which may differ from the lead's. */
          branchId,
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

          fcmToken: seen.fcmToken,
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

          ip: seen.ip,
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
     * The lead's roll-up.
     *
     * Latest-wins for the machine and the place, because those describe the
     * device as it is now. Last-touch attribution is overwritten every visit;
     * first touch never is. `??` throughout rather than `||`, so a field the
     * browser genuinely did not report leaves the previous answer standing
     * instead of blanking it.
     */
    await lead.update(
      {
        lastSeenAt: now,
        visitCount: lead.visitCount + (openVisit ? 0 : 1),
        pageViewCount: lead.pageViewCount + pageViewDelta,
        ...(lead.firstSeenAt ? {} : { firstSeenAt: now }),
        /** A lead that first arrived company-wide adopts the first branch it names. */
        ...(lead.branchId === null && branchId !== null ? { branchId } : {}),

        lastLandingUrl: seen.pageUrl ?? lead.lastLandingUrl,
        lastReferrer: seen.referrer ?? lead.lastReferrer,
        lastReferrerHost: seen.referrerHost ?? lead.lastReferrerHost,
        ...(seen.utm ? { lastUtm: seen.utm } : {}),

        deviceType: seen.agent.deviceType,
        deviceVendor: seen.agent.deviceVendor ?? lead.deviceVendor,
        deviceModel: seen.agent.deviceModel ?? lead.deviceModel,
        os: seen.agent.os ?? lead.os,
        osVersion: seen.agent.osVersion ?? lead.osVersion,
        browser: seen.agent.browser ?? lead.browser,
        browserVersion: seen.agent.browserVersion ?? lead.browserVersion,
        isBot: seen.agent.isBot,

        ip: seen.ip ?? lead.ip,
        country: seen.country ?? lead.country,
        region: seen.region ?? lead.region,
        city: seen.city ?? lead.city,
        timezone: seen.timezone ?? lead.timezone,
        latitude: seen.latitude ?? lead.latitude,
        longitude: seen.longitude ?? lead.longitude,
        language: seen.language ?? lead.language,

        ...(seen.fcmToken && seen.fcmToken !== lead.fcmToken
          ? { fcmToken: seen.fcmToken, fcmUpdatedAt: now }
          : {}),

        /**
         * Contact details, only ever filled in — never overwritten from a
         * public request. A tracking call must not be able to rename a lead
         * that someone in the console has already identified.
         */
        ...(lead.name ? {} : { name: text(payload.name, 150) ?? null }),
        ...(lead.email ? {} : { email: text(payload.email, 160) ?? null }),
        ...(lead.phone ? {} : { phone: text(payload.phone, 20) ?? null }),
      },
      { transaction }
    );

    return { lead, visit, isNewLead, isNewVisit: !openVisit };
  });
}

module.exports = {
  recordVisit,
  /* Exported for the controllers and for tests to reuse the same rules. */
  collectUtm,
  /**
   * Also used by `marketingLead.service`, which tracks our own site.
   *
   * Exported rather than copied on purpose: this is where a beacon's payload
   * is normalised, bounded and parsed, and two copies of those rules would
   * drift the first time one of them learned about a new field.
   */
  describeVisit,
  utmColumns,
  clientIp,
  resolveDeviceId,
  hostOf,
};
