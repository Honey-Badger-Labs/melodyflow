/* Loads the real app in a real browser and walks it.
 *
 * The unit tests can say the instrument model is right; only this can say the
 * page still boots, because the one thing a model cannot get wrong on its own
 * is script order. `instruments.js` has to have run before the inline script
 * reads MF, and nothing but loading the page proves that.
 *
 * Playwright is not a dependency of this app and never will be. If it is not
 * around, this says so and stops rather than failing as though something broke.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Playwright ships a CommonJS entry. Imported by path it arrives under
// `default`, so take whichever of the two shapes turns up.
const take = (mod) => mod?.chromium ?? mod?.default?.chromium ?? null;

let chromium = null;
try {
  chromium = take(await import('playwright'));
} catch {
  try {
    const require = createRequire(path.join(root, '..', 'refrain', 'package.json'));
    chromium = take(await import(pathToFileURL(require.resolve('playwright')).href));
  } catch {
    chromium = null;
  }
}
if (!chromium) {
  console.log('playwright is not installed, so the browser smoke test was skipped.');
  console.log('Install it with `npm i -D playwright && npx playwright install chromium`.');
  process.exit(0);
}

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const launch = async () => {
  try {
    return await chromium.launch();
  } catch {
    // No downloaded build; a locally installed Chrome will do.
    return chromium.launch({ channel: 'chrome' });
  }
};

const browser = await launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(400);

const probe = await page.evaluate(() => ({
  mf: typeof globalThis.MF,
  instruments: Object.keys(globalThis.MF?.INSTRUMENTS ?? {}),
  drumPitch: globalThis.MF?.instrument('drum').pitches('1')[0],
  ukeChord: globalThis.MF?.instrument('ukulele').pitches('C').length,
  songs: document.querySelectorAll('[data-act="openSong"]').length,
  tabs: document.querySelectorAll('#tabbar [data-act="tab"]').length,
}));

await page.click('[data-act="openSong"]');
await page.waitForTimeout(300);
const pads = await page.evaluate(() => document.querySelectorAll('[data-act="strike"]').length);

await browser.close();
server.close();

const checks = [
  ['MF is on the page', probe.mf === 'object'],
  ['both instruments registered', probe.instruments.join(',') === 'drum,ukulele'],
  ['pad 1 is middle C through the instrument', Math.abs(probe.drumPitch - 261.6256) < 0.01],
  ['a ukulele chord is four pitches', probe.ukeChord === 4],
  ['the songbook rendered', probe.songs >= 13],
  ['the tab bar rendered', probe.tabs === 4],
  ['a song opens onto the drum', pads === 13],
  ['no page errors', errors.length === 0],
];

let failed = 0;
for (const [what, ok] of checks) {
  console.log(`${ok ? '✔' : '✖'} ${what}`);
  if (!ok) failed++;
}
if (errors.length) console.log(errors.join('\n'));
process.exit(failed ? 1 : 0);
