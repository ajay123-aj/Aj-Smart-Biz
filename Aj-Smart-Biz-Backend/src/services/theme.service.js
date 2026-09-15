'use strict';

/**
 * What colour a tenant's website is painted, and who decided.
 *
 * Three sources, in descending authority, and they are not equal:
 *
 *   **The branch's own** — `branches.theme_config`. Only ever consulted when
 *   the host resolved to a branch: a company whose Surat shop has its own
 *   domain can give that one site its own colours without touching the others.
 *
 *   **The company's own** — `companies.theme_config`, written by the tenant
 *   through `PUT /my-company/theme`. Per-company by construction.
 *
 *   **The preset** — a row in `themes`, the catalogue the platform maintains
 *   and the super admin edits. It is *shared*: a dozen companies can point at
 *   the same row, which is exactly why it cannot be the place a tenant edits
 *   its own colours. Changing `Aj Midnight` to repaint one salon would repaint
 *   every other business on it.
 *
 * Each level wins over the one below it **key by key** rather than wholesale.
 * That matters at every step: a branch that has only ever set an accent colour
 * keeps the company's primary and secondary, instead of losing them to two
 * nulls the moment somebody touches anything. It is also what makes "reset" a
 * real operation — clear a level and it falls back to the one under it rather
 * than to whatever the template happens to ship.
 *
 * This is the same chain `/website/branding` already uses for the logo and the
 * favicon (pinned branch → company → head office), which is deliberate: a
 * visitor on the Surat domain should not get Surat's logo above the company's
 * colours.
 *
 * Where a key is missing from all three, it comes back `null` and the website
 * uses its own default. That is why this returns `null` rather than an object
 * of nulls when there is nothing to say: every template treats a null theme as
 * "use the design you shipped with", and handing it four nulls instead would
 * paint three sites with `undefined`.
 */

/**
 * The keys a website actually consumes, in the order a form shows them.
 *
 * Deliberately shorter than the `themes` table, which also carries text,
 * background, sidebar and font columns. Those are read by nothing today, and a
 * settings screen offering a control that changes nothing is worse than one
 * that does not offer it. Add a key here when a template starts reading it —
 * and to `themeSave` in `validators/company.validator`, which has to stay in
 * step with this list.
 */
const WEBSITE_THEME_KEYS = Object.freeze(['primaryColor', 'secondaryColor', 'accentColor', 'mode']);

/** A theme value is "set" when it is a non-empty string. Blank means unset. */
const isSet = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Keeps only the website keys, drops anything blank, and returns `null` for an
 * object with nothing left in it.
 *
 * Used on the way *in* as well as the way out, so a tenant who clears every
 * field ends up with `themeConfig: null` — genuinely back on the level below —
 * rather than a row holding four empty strings that read as "overridden" to
 * everything downstream.
 */
const cleanThemeConfig = (input) => {
  if (!input || typeof input !== 'object') return null;

  const out = {};
  for (const key of WEBSITE_THEME_KEYS) {
    if (isSet(input[key])) out[key] = input[key].trim();
  }
  return Object.keys(out).length ? out : null;
};

/**
 * Merges any number of colour sources, first one wins per key.
 *
 * Takes the layers already in priority order and ignores the empty ones, which
 * is what lets the callers below express "branch, then company, then preset"
 * and "company, then preset" as the same operation on a different list.
 */
const mergeLayers = (layers) => {
  const usable = layers.filter(Boolean);
  if (!usable.length) return null;

  const pick = (key) => {
    for (const layer of usable) {
      if (isSet(layer[key])) return layer[key];
    }
    return null;
  };

  const theme = {
    primaryColor: pick('primaryColor'),
    secondaryColor: pick('secondaryColor'),
    accentColor: pick('accentColor'),
    mode: pick('mode'),
  };

  /**
   * Nothing usable. A theme whose primary colour is null cannot brand anything
   * — every template maps that one to `--brand` — so it is reported as no theme
   * at all rather than as a theme that happens to be empty.
   */
  return theme.primaryColor ? theme : null;
};

/**
 * The colours to publish for one request.
 *
 * @param {object}      sources
 * @param {object|null} sources.branch   the Branch row the host resolved to, or null
 * @param {object|null} sources.company  the Company row — only `themeConfig` is read
 * @param {object|null} sources.preset   the resolved `themes` row, or null
 * @returns {{primaryColor: string|null, secondaryColor: string|null,
 *            accentColor: string|null, mode: string|null}|null}
 */
const resolveTheme = ({ branch = null, company = null, preset = null } = {}) =>
  mergeLayers([cleanThemeConfig(branch?.themeConfig), cleanThemeConfig(company?.themeConfig), preset]);

/**
 * The same thing for one editing scope, plus what the console needs to explain
 * itself: which keys this scope set, and what it would fall back to if they
 * were cleared.
 *
 * The console shows that plainly for the same reason the About editor does — a
 * field sitting on the level below is *inheriting*, not empty, and saying so is
 * the difference between "nothing here" and "the same as everyone else".
 *
 * @param {object}      args
 * @param {object|null} args.branch   the branch being edited, or null for company-wide
 * @param {object|null} args.company
 * @param {object|null} args.preset
 */
const describeTheme = ({ branch = null, company = null, preset = null } = {}) => {
  const editingBranch = Boolean(branch);
  const own = cleanThemeConfig(editingBranch ? branch.themeConfig : company?.themeConfig);

  /**
   * What this scope would show with its own values removed.
   *
   * For a branch that is the company's colours over the preset; for the company
   * it is the preset alone. Either way it is the answer to "what happens if I
   * press Clear", which is the one thing the screen cannot work out for itself.
   */
  const inherited = editingBranch
    ? mergeLayers([cleanThemeConfig(company?.themeConfig), preset])
    : mergeLayers([preset]);

  return {
    /** Which scope this describes. `null` is the company-wide one. */
    branchId: branch?.id ?? null,
    /** What the website is actually painted with for this scope right now. */
    effective: editingBranch
      ? resolveTheme({ branch, company, preset })
      : resolveTheme({ company, preset }),
    /** Only what this scope set for itself. `null` when it is fully inheriting. */
    own,
    /** True when at least one key belongs to this scope rather than the one below. */
    overridden: Boolean(own),
    /** What it falls back to — the company's colours for a branch, the preset for a company. */
    inherited,
    /** The shared preset at the bottom of the chain, named so the console can say which. */
    preset: preset
      ? {
        id: preset.id ?? null,
        name: preset.name ?? null,
        primaryColor: preset.primaryColor ?? null,
        secondaryColor: preset.secondaryColor ?? null,
        accentColor: preset.accentColor ?? null,
        mode: preset.mode ?? null,
      }
      : null,
  };
};

module.exports = { WEBSITE_THEME_KEYS, cleanThemeConfig, resolveTheme, describeTheme };
