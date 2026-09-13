'use strict';

const { Op } = require('sequelize');
const { SLUG_MAX } = require('../constants');

/**
 * The half of a URL a person can read: `Solid Oak Dining Table` becomes
 * `solid-oak-dining-table`.
 *
 * Unicode is decomposed before the strip, so `Café` becomes `cafe` rather than
 * `caf` — a tenant naming a product in French or Hindi should get a usable slug
 * rather than a mangled one. A name that survives none of it (all emoji, all
 * Devanagari) yields an empty string, and the caller falls back to the row's id;
 * see `uniqueSlug`. That is deliberately the only fallback: a slug is a
 * convenience, and a URL that is merely ugly beats a save that is refused
 * because somebody's shop is not named in Latin script.
 */
function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    // Combining marks left behind by the decomposition — the accent on `é`.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    // A trim again: the slice above can leave a trailing hyphen.
    .replace(/-+$/g, '');
}

/**
 * A slug nothing else in this tenant is using.
 *
 * Scoped to the **company**, not to the branch or the category: the website
 * addresses a product as `/products/<slug>` with no branch in the path, so two
 * branches both claiming `oak-chair` would make one of them unreachable. A
 * collision gets `-2`, `-3` and so on, which is what every CMS does and what
 * people expect to see.
 *
 * `excludeId` is the row being renamed — without it, saving a product without
 * changing its name would find its own slug taken and append `-2` every time.
 *
 * Not race-free, and deliberately not: making it so would need a unique index,
 * and these tables are paranoid, so a soft-deleted row would hold a slug
 * invisibly and block the name being used again. Two admins creating identically
 * named products in the same second is a duplicate slug; nothing breaks, and the
 * second one is renamed by hand.
 *
 * @param {import('sequelize').ModelStatic} model
 * @param {number} companyId
 * @param {string} desired    Already a slug, or a name to make one from.
 * @param {number|null} excludeId
 */
async function uniqueSlug(model, companyId, desired, excludeId = null) {
  const base = slugify(desired) || 'item';

  const taken = await model.findAll({
    where: {
      companyId,
      slug: { [Op.like]: `${base}%` },
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
    attributes: ['slug'],
    paranoid: false,
  });

  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;

  let suffix = 2;
  // The cap is the column's, so a long name plus `-12` cannot overflow it.
  while (used.has(`${base.slice(0, SLUG_MAX - 5)}-${suffix}`)) suffix += 1;
  return `${base.slice(0, SLUG_MAX - 5)}-${suffix}`;
}

module.exports = { slugify, uniqueSlug };
