'use strict';

/**
 * Generated stand-in artwork for the demo seeders.
 *
 * Shared by `seedCatalogue` and `seedBlog` because both want the same thing: a
 * card with the item's name on it, so a gallery, a thumbnail strip or a blog
 * listing has something to show before a tenant has uploaded a single photo.
 *
 * Nothing that serves a real tenant imports this. A placeholder that reached
 * live content would be a business advertising a picture it never took, which is
 * the same reason the seeders are scripts somebody runs on purpose rather than
 * part of `runBootstrap`.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const { slugify } = require('./slug');

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch])
  );

/**
 * A tinted card with the item's name on it, as an SVG.
 *
 * SVG rather than a raster: it is a few hundred bytes, needs no image library,
 * and scales to whatever the card asks for. The palette is seeded from the name
 * so the same item is always the same colour and a grid of them looks arranged
 * rather than random.
 */
function placeholder(name, kind) {
  const hue = [...name].reduce((total, ch) => (total * 31 + ch.charCodeAt(0)) % 360, 7);
  const light = `hsl(${hue} 32% 92%)`;
  const mid = `hsl(${hue} 28% 82%)`;
  const ink = `hsl(${hue} 30% 28%)`;

  /* Wrapped by hand: SVG has no text flow, and a long name on one line runs off
     the edge of the card. */
  const words = name.split(' ');
  const lines = [];
  let line = '';
  words.forEach((word) => {
    if ((line + ' ' + word).trim().length > 18) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  });
  if (line.trim()) lines.push(line.trim());

  const text = lines
    .slice(0, 3)
    .map((row, index) => `<tspan x="60" dy="${index === 0 ? 0 : 58}">${escapeXml(row)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${mid}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <circle cx="660" cy="120" r="190" fill="${ink}" opacity="0.05"/>
  <circle cx="120" cy="520" r="140" fill="${ink}" opacity="0.05"/>
  <text x="60" y="290" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="46" font-weight="600" fill="${ink}">${text}</text>
  <text x="60" y="545" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="20" fill="${ink}" opacity="0.55">Sample ${kind} image</text>
</svg>`;
}

/**
 * Writes one placeholder into `uploads/<folder>` and returns the path to store
 * on the row.
 *
 * Named from the item rather than randomly, so re-running a seeder overwrites
 * the same file instead of leaving a second copy behind on disk. The `seed-`
 * prefix is what makes them all deletable in one sweep.
 */
function writePlaceholder(folder, name, suffix = '') {
  const uploadRoot = path.resolve(process.cwd(), config.uploads.dir);
  const dir = path.join(uploadRoot, folder);
  fs.mkdirSync(dir, { recursive: true });

  const file = `seed-${slugify(name)}${suffix}.svg`;
  fs.writeFileSync(path.join(dir, file), placeholder(name, folder), 'utf8');

  return `${config.uploads.publicPath}/${folder}/${file}`;
}

module.exports = { placeholder, writePlaceholder, escapeXml };
