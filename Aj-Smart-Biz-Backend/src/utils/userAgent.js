'use strict';

const { DEVICE_TYPE } = require('../constants');

/**
 * Reads a `User-Agent` string into the fields the lead tables store.
 *
 * Written here rather than pulled in as a dependency, deliberately. A UA parser
 * is a list of regexes against a moving target, and the ones on npm carry
 * hundreds of device-model patterns this product will never group by — the
 * console shows "Chrome 126 on Android, mobile", not a handset SKU. What is
 * below covers every browser and platform with measurable share, and degrades
 * to `unknown` rather than guessing, which is the honest answer for a string
 * the client is free to invent anyway.
 *
 * Client Hints are preferred over all of this where the browser sent them — see
 * `fromClientHints` — because the UA string is being frozen by Chromium and its
 * version numbers are already partly fiction. This is the fallback.
 */

/** `Chrome/126.0.6478.127` -> `126.0.6478`; keeps at most three parts. */
const trimVersion = (value) => {
  if (!value) return null;
  const parts = String(value).replace(/_/g, '.').split('.').slice(0, 3);
  return parts.join('.') || null;
};

const firstMatch = (ua, patterns) => {
  for (const [regex, name] of patterns) {
    const match = ua.match(regex);
    if (match) return { name, version: trimVersion(match[1]) };
  }
  return { name: null, version: null };
};

/**
 * Crawlers, previewers and uptime checks.
 *
 * They are stored rather than dropped — a company that suddenly has a thousand
 * "leads" deserves to see *why* — but they are typed as `bot` so the console can
 * exclude them from the counts, and so nobody rings a search engine's crawler.
 */
const BOT_PATTERN =
  /(bot|crawler|spider|crawling|slurp|mediapartners|facebookexternalhit|whatsapp|telegrambot|preview|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptimerobot|curl|wget|python-requests|axios|postman|go-http-client|java\/|okhttp)/i;

/**
 * Browsers, most specific first.
 *
 * Order is the whole game here: every Chromium browser also says "Chrome", and
 * Edge additionally says "Safari" and "Chrome" both — so Edge has to be tested
 * before Chrome, and Chrome before Safari, or everything collapses into one.
 */
const BROWSERS = [
  [/\bEdg(?:e|A|iOS)?\/([\d.]+)/i, 'Edge'],
  [/\bOPR\/([\d.]+)/i, 'Opera'],
  [/\bOpera(?:\sMini)?\/([\d.]+)/i, 'Opera'],
  [/\bSamsungBrowser\/([\d.]+)/i, 'Samsung Internet'],
  [/\bYaBrowser\/([\d.]+)/i, 'Yandex'],
  [/\bUCBrowser\/([\d.]+)/i, 'UC Browser'],
  [/\bBrave\/([\d.]+)/i, 'Brave'],
  [/\bVivaldi\/([\d.]+)/i, 'Vivaldi'],
  [/\bFxiOS\/([\d.]+)/i, 'Firefox'],
  [/\bFirefox\/([\d.]+)/i, 'Firefox'],
  [/\bCriOS\/([\d.]+)/i, 'Chrome'],
  [/\bChrome\/([\d.]+)/i, 'Chrome'],
  [/\bVersion\/([\d.]+).*\bSafari\//i, 'Safari'],
  [/\bSafari\/([\d.]+)/i, 'Safari'],
  [/\bMSIE\s([\d.]+)/i, 'Internet Explorer'],
  [/\bTrident\/.*\brv:([\d.]+)/i, 'Internet Explorer'],
];

/** Operating systems, most specific first — Android before Linux, iOS before macOS. */
const OPERATING_SYSTEMS = [
  [/\bWindows NT ([\d.]+)/i, 'Windows'],
  [/\bAndroid[\s/]([\d.]+)/i, 'Android'],
  [/\b(?:iPhone|iPad|iPod).*?OS ([\d_]+)/i, 'iOS'],
  [/\bCPU OS ([\d_]+)/i, 'iOS'],
  [/\bMac OS X ([\d_.]+)/i, 'macOS'],
  [/\bCrOS\s\S+\s([\d.]+)/i, 'ChromeOS'],
  [/\bUbuntu[\s/]?([\d.]*)/i, 'Ubuntu'],
  [/\bHarmonyOS[\s/]?([\d.]*)/i, 'HarmonyOS'],
  [/\bLinux(?:\sx86_64)?()/i, 'Linux'],
];

/** Marketing names for the NT build numbers, which nobody reads as versions. */
const WINDOWS_NAMES = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };

/** The handset makers worth naming. Anything else is left null rather than guessed. */
const VENDORS = [
  [/\b(?:iPhone|iPad|iPod)\b/i, 'Apple'],
  [/\b(?:SM-[A-Z0-9]+|Galaxy|SAMSUNG)\b/i, 'Samsung'],
  [/\bPixel\b/i, 'Google'],
  [/\b(?:Redmi|POCO|Xiaomi|MI\s\d)\b/i, 'Xiaomi'],
  [/\bOnePlus\b/i, 'OnePlus'],
  [/\bvivo\b/i, 'Vivo'],
  [/\b(?:OPPO|CPH\d+)\b/i, 'Oppo'],
  [/\b(?:realme|RMX\d+)\b/i, 'Realme'],
  [/\bNokia\b/i, 'Nokia'],
  [/\b(?:Motorola|moto\s)/i, 'Motorola'],
  [/\b(?:HUAWEI|Honor)\b/i, 'Huawei'],
];

/**
 * The model, as the handset reports it inside the Android build token —
 * `(Linux; Android 14; SM-S911B Build/...)` -> `SM-S911B`.
 *
 * iOS never reports one: every iPhone says "iPhone". Naming the vendor and
 * leaving the model null is the truthful outcome there, not a gap to fill in.
 */
const modelOf = (ua) => {
  if (/\biPad\b/i.test(ua)) return 'iPad';
  if (/\biPhone\b/i.test(ua)) return 'iPhone';
  if (/\biPod\b/i.test(ua)) return 'iPod';

  const android = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|[;)])/i);
  const model = android?.[1]?.trim();
  /**
   * "K" is what Chrome's reduced user agent sends in place of a model, and `wv`
   * marks a WebView rather than naming a device. Both are noise.
   */
  if (!model || /^(?:K|wv|Mobile)$/i.test(model)) return null;
  return model.slice(0, 80);
};

/**
 * Phone, tablet or desktop.
 *
 * An iPad running iPadOS 13+ claims to be a Mac, which is why "Macintosh with a
 * touch screen" is read as a tablet: `maxTouchPoints` is the only thing that
 * still tells them apart, and the browser sends it in the payload.
 */
const deviceTypeOf = (ua, { touchPoints = 0 } = {}) => {
  if (BOT_PATTERN.test(ua)) return DEVICE_TYPE.BOT;
  if (/\b(?:iPad|Tablet|PlayBook|Silk)\b/i.test(ua)) return DEVICE_TYPE.TABLET;
  if (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua)) return DEVICE_TYPE.TABLET;
  // `\bMobi` deliberately has no closing boundary: Chrome says "Mobile Safari",
  // Opera says "Mobi", and both mean the same thing.
  if (/\bMobi|\b(?:iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini)\b/i.test(ua)) return DEVICE_TYPE.MOBILE;
  if (/\bMacintosh\b/i.test(ua) && Number(touchPoints) > 1) return DEVICE_TYPE.TABLET;
  if (/\b(?:Windows|Macintosh|Linux|CrOS|X11)\b/i.test(ua)) return DEVICE_TYPE.DESKTOP;
  return DEVICE_TYPE.UNKNOWN;
};

const ENGINES = [
  [/\bTrident\/([\d.]*)/i, 'Trident'],
  [/\bAppleWebKit\/([\d.]+)/i, 'WebKit'],
  [/\bGecko\/(\d*)/i, 'Gecko'],
];

/**
 * Parses a user agent into the shape both lead tables store.
 *
 * @param {string} userAgent  The raw header.
 * @param {object} [hints]    `{ touchPoints }` from the payload, used only to
 *                            separate an iPad from a Mac.
 */
function parseUserAgent(userAgent, hints = {}) {
  const ua = String(userAgent || '').slice(0, 1000);

  if (!ua) {
    return {
      deviceType: DEVICE_TYPE.UNKNOWN,
      deviceVendor: null,
      deviceModel: null,
      os: null,
      osVersion: null,
      browser: null,
      browserVersion: null,
      engine: null,
      isBot: false,
    };
  }

  const browser = firstMatch(ua, BROWSERS);
  const os = firstMatch(ua, OPERATING_SYSTEMS);
  const engine = firstMatch(ua, ENGINES);
  const vendor = VENDORS.find(([regex]) => regex.test(ua));

  const osVersion = os.name === 'Windows' ? WINDOWS_NAMES[os.version] ?? os.version : os.version;

  return {
    deviceType: deviceTypeOf(ua, hints),
    deviceVendor: vendor?.[1] ?? null,
    deviceModel: modelOf(ua),
    os: os.name,
    osVersion: osVersion || null,
    browser: browser.name,
    browserVersion: browser.version,
    engine: engine.name,
    isBot: BOT_PATTERN.test(ua),
  };
}

/**
 * The same shape, built from `navigator.userAgentData` where the browser sent
 * it. Chromium reports its real version here while the UA string reports a
 * frozen one, so anything present in the hints wins over the parse above.
 *
 * Every field is optional: only Chromium sends hints at all, and the
 * low-entropy set it sends without a server opt-in has the platform and the
 * brand list but no model.
 */
function fromClientHints(hints) {
  if (!hints || typeof hints !== 'object') return {};

  const brands = Array.isArray(hints.brands) ? hints.brands : [];

  /**
   * The brand list is padded with deliberate nonsense — "Not)A;Brand" and its
   * variants — precisely so that naive code picks the wrong one. Those are
   * dropped, and the generic "Chromium" entry is sorted to the back so a
   * specific brand wins: that is what tells Edge and Brave from plain Chrome.
   */
  const named = brands
    .filter((entry) => entry && typeof entry.brand === 'string' && !/not.?a.?brand/i.test(entry.brand))
    .sort((a, b) => Number(/chromium/i.test(a.brand)) - Number(/chromium/i.test(b.brand)));

  const primary = named[0];

  return {
    ...(primary?.brand ? { browser: String(primary.brand).slice(0, 60) } : {}),
    ...(primary?.version ? { browserVersion: trimVersion(primary.version) } : {}),
    ...(hints.platform ? { os: String(hints.platform).slice(0, 40) } : {}),
    ...(hints.platformVersion ? { osVersion: trimVersion(hints.platformVersion) } : {}),
    ...(hints.model ? { deviceModel: String(hints.model).slice(0, 80) } : {}),
    ...(typeof hints.mobile === 'boolean'
      ? { deviceType: hints.mobile ? DEVICE_TYPE.MOBILE : DEVICE_TYPE.DESKTOP }
      : {}),
  };
}

module.exports = { parseUserAgent, fromClientHints, BOT_PATTERN };
