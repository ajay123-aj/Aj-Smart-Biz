import type { DeviceType, Lead, LeadVisit } from '../../core/models/domain.model';

/**
 * How a lead reads in a table cell.
 *
 * Shared by the list and the detail screen so the same visitor is described the
 * same way in both — a lead labelled "Chrome on Android" in the table and
 * "Android · Chrome 125" one click later reads as two different records.
 *
 * Every one of these degrades rather than guessing. A field the browser did not
 * report becomes an em dash, never an invented value: the whole table is
 * evidence about a stranger, and a plausible-looking blank is worse than an
 * obvious one.
 */

/** Em dash for anything missing, so a row never collapses to empty space. */
const DASH = '—';

const joined = (parts: (string | null | undefined)[], separator = ' '): string =>
  parts.filter((part) => part && String(part).trim()).join(separator) || DASH;

/**
 * Who this is.
 *
 * A name if anyone has established one, otherwise the shortened device id —
 * which is genuinely all that is known, and is short enough to recognise
 * between visits.
 */
export function whoLabel(lead: Pick<Lead, 'name' | 'email' | 'phone' | 'deviceId'>): string {
  return lead.name || lead.email || lead.phone || shortDeviceId(lead.deviceId);
}

/**
 * The device id, shortened for a cell.
 *
 * `anon_…` marks an id the server derived because the browser stored none —
 * it is stable only as long as the visitor's IP is, so the console labels it
 * rather than presenting it as an identity.
 */
export function shortDeviceId(deviceId: string | null | undefined): string {
  const value = String(deviceId ?? '');
  if (!value) return DASH;
  if (value.startsWith('anon_')) return `anon · ${value.slice(5, 13)}`;
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

const DEVICE_ICONS: Record<DeviceType, string> = {
  mobile: '📱',
  tablet: '📲',
  desktop: '💻',
  bot: '🤖',
  unknown: '❔',
};

export function deviceIcon(type: DeviceType | null | undefined): string {
  return DEVICE_ICONS[(type ?? 'unknown') as DeviceType] ?? DEVICE_ICONS.unknown;
}

/** `📱 Mobile` — the kind of machine, with its glyph. */
export function deviceLabel(type: DeviceType | null | undefined): string {
  const value = String(type ?? 'unknown');
  return `${deviceIcon(type)} ${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** `Chrome 125 · Android 14` — the software, on one line. */
export function machineLabel(
  row: Pick<Lead, 'browser' | 'browserVersion' | 'os' | 'osVersion'>
): string {
  const browser = joined([row.browser, majorVersion(row.browserVersion)]);
  const os = joined([row.os, majorVersion(row.osVersion)]);
  if (browser === DASH && os === DASH) return DASH;
  return [browser, os].filter((part) => part !== DASH).join(' · ');
}

/** `126.0.6478` -> `126`. A table has no room for a build number. */
function majorVersion(value: string | null | undefined): string | null {
  if (!value) return null;
  // Windows reports "10/11" rather than a number, and that is the whole answer.
  return value.includes('/') ? value : value.split('.')[0];
}

/** `Surat, India` — as much of the place as is known. */
export function placeLabel(row: Pick<Lead, 'city' | 'region' | 'country'>): string {
  return joined([row.city, row.country ?? row.region], ', ');
}

/**
 * Where this lead came from, in the order a marketer would ask.
 *
 * The campaign if there was one, then the source, then the site that linked
 * them — and "Direct" when there is genuinely nothing, which is a real answer
 * rather than a missing one.
 */
export function sourceLabel(row: Pick<Lead, 'utmSource' | 'utmCampaign' | 'firstReferrerHost'>): string {
  if (row.utmCampaign) return joined([row.utmSource, row.utmCampaign], ' · ');
  if (row.utmSource) return row.utmSource;
  if (row.firstReferrerHost) return row.firstReferrerHost.replace(/^www\./, '');
  return 'Direct';
}

/** `1440 × 900` for a screen or a viewport; a dash if either half is missing. */
export function sizeLabel(width: number | null | undefined, height: number | null | undefined): string {
  return width && height ? `${width} × ${height}` : DASH;
}

/** The page a visit landed on, as a path — `/contact`, or `/` for the home page. */
export function pageLabel(visit: Pick<LeadVisit, 'path' | 'pageTitle'>): string {
  return visit.pageTitle || visit.path || DASH;
}

/**
 * A JSON blob as `key: value` lines, for the detail screen's raw panels.
 *
 * Sorted, so the same device reads the same way on every visit — object key
 * order is whatever the browser happened to serialise, and an unsorted list
 * shuffles between rows for no reason the reader can see.
 */
export function entriesOf(blob: Record<string, unknown> | null | undefined): { key: string; value: string }[] {
  if (!blob) return [];
  return Object.entries(blob)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key: key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
}

export { DASH };
