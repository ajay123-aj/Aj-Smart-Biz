#!/usr/bin/env node
/**
 * Renders every docs/source/*.html to docs/pdf/<same name>.pdf with headless
 * Chrome (or Edge). No npm dependencies — it shells out to the browser.
 *
 *   node docs/build-pdf.js            # all documents
 *   node docs/build-pdf.js 03         # only files whose name contains "03"
 *
 * Override the browser with CHROME_PATH if it is not in a standard location.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, 'source');
const OUT = path.join(__dirname, 'pdf');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] || '';
const files = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.html') && f.includes(filter))
  .sort();

for (const file of files) {
  const target = path.join(OUT, file.replace(/\.html$/, '.pdf'));
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      `--print-to-pdf=${target}`,
      pathToFileURL(path.join(SRC, file)).href,
    ],
    { stdio: 'ignore' },
  );
  const kb = Math.round(fs.statSync(target).size / 1024);
  console.log(`✓ ${path.basename(target)} (${kb} KB)`);
}
console.log(`\n${files.length} PDF(s) written to ${OUT}`);
