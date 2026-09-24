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
  fretboard: typeof globalThis.MF_FRETBOARD,
  chartC: globalThis.MF?.instrument('ukulele').shapesFor('C')[0]?.frets,
  path: globalThis.MF?.instrument('ukulele').easiestPath(['C', 'Am', 'F', 'G7'])?.shapes.length,
}));

await page.click('[data-act="openSong"]');
await page.waitForTimeout(300);
const pads = await page.evaluate(() => document.querySelectorAll('[data-act="strike"]').length);

// Over to the ukulele, and through both of its screens.
await page.click('[data-act="tab"][data-v="drum"]');
await page.waitForTimeout(200);
await page.click('[data-act="inst"][data-v="ukulele"]');
await page.waitForTimeout(250);

const changes = await page.evaluate(() => ({
  diagrams: document.querySelectorAll('svg[role="img"]').length,
  // #scroll, never document.body: the app's scripts sit inside <body>, so
  // body.innerHTML contains their source and every one of these checks would
  // pass against the code that draws the page rather than the page.
  anchorsShown: document.getElementById('scroll').innerHTML.includes('#8fd0b4'),
  note: (document.getElementById('scroll').textContent.match(/\d+ fingers stay put|One finger stays put|Nothing stays/) || [null])[0],
  tab: document.querySelector('#tabbar [data-act="tab"][data-v="drum"]').textContent.replace(/\s+/g, ''),
}));

await page.click('[data-act="stepOn"]');
await page.waitForTimeout(200);
const stepped = await page.evaluate(() =>
  (document.getElementById('scroll').textContent.match(/\d+ fingers stay put|One finger stays put|Nothing stays/) || [null])[0]);

await page.click('[data-act="ukeMode"][data-v="chords"]');
await page.waitForTimeout(250);
const chords = await page.evaluate(() => ({
  chips: document.querySelectorAll('[data-act="ukeChord"]').length,
  diagrams: document.querySelectorAll('svg[role="img"]').length,
}));

// The drill: start a change, wait a known time, tap, and check the clock
// caught it and the deck kept it.
await page.click('[data-act="ukeMode"][data-v="drill"]');
await page.waitForTimeout(250);
const drillBefore = await page.evaluate(() => document.getElementById('scroll').textContent.includes('Nothing measured yet'));

await page.click('[data-act="drillGo"]');
await page.waitForTimeout(250);
const running = await page.evaluate(() => document.getElementById('scroll').textContent.includes('The clock is running'));

await page.waitForTimeout(900);
await page.click('[data-act="drillTap"]');
await page.waitForTimeout(250);

const afterOne = await page.evaluate(() => {
  const deck = JSON.parse(localStorage.getItem('melodyflow-drill') || '{}');
  const cards = Object.values(deck)[0]?.cards ?? {};
  const tried = Object.values(cards).filter((c) => c.reps > 0);
  return {
    verdict: /\d\.\ds · (in time|just late|too slow)/.test(document.getElementById('scroll').textContent),
    reps: tried.length,
    ms: tried[0]?.times[0] ?? null,
    stillEmpty: document.getElementById('scroll').textContent.includes('Nothing measured yet'),
  };
});

// A second change, to prove it moves on rather than repeating the same card.
await page.click('[data-act="drillGo"]');
await page.waitForTimeout(200);
await page.click('[data-act="drillTap"]');
await page.waitForTimeout(250);
const afterTwo = await page.evaluate(() => {
  const deck = JSON.parse(localStorage.getItem('melodyflow-drill') || '{}');
  const cards = Object.values(deck)[0]?.cards ?? {};
  return {
    total: Object.values(cards).reduce((n, c) => n + c.reps, 0),
    inWay: document.getElementById('scroll').textContent.includes('What is in your way'),
  };
});

// And back to the drum, which must be exactly as it was.
await page.click('[data-act="inst"][data-v="drum"]');
await page.waitForTimeout(250);
const backToDrum = await page.evaluate(() => document.querySelectorAll('[data-act="strike"]').length);

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
  ['the fretboard reached the page', probe.fretboard === 'object'],
  ['C is the shape off the chart', JSON.stringify(probe.chartC) === '[0,0,0,3]'],
  ['a progression solves in the browser', probe.path === 4],
  ['the change view draws both shapes', changes.diagrams >= 2],
  ['anchored fingers are marked', changes.anchorsShown],
  ['the change is named in words', changes.note !== null],
  ['stepping on shows a different change', stepped !== null],
  ['the tab renames itself', changes.tab.includes('Ukulele')],
  ['the chord browser lists every shape', chords.chips === 19],
  ['the chord browser draws diagrams', chords.diagrams >= 1],
  ['the drill starts with nothing measured', drillBefore],
  ['the clock runs while a change is live', running],
  ['a tap is graded against the bar', afterOne.verdict],
  ['the time is what the clock saw', afterOne.ms >= 700 && afterOne.ms <= 2500],
  ['the attempt is kept', afterOne.reps === 1 && !afterOne.stillEmpty],
  ['a second attempt is recorded too', afterTwo.total === 2],
  ['the weak list appears once there is data', afterTwo.inWay],
  ['the drum is untouched by any of it', backToDrum === 13],
  ['no page errors', errors.length === 0],
];

let failed = 0;
for (const [what, ok] of checks) {
  console.log(`${ok ? '✔' : '✖'} ${what}`);
  if (!ok) failed++;
}
if (errors.length) console.log(errors.join('\n'));
if (failed) console.log('afterOne:', JSON.stringify(afterOne), '\nafterTwo:', JSON.stringify(afterTwo));
process.exit(failed ? 1 : 0);
