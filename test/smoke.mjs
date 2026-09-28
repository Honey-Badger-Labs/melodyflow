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
// The app works offline, so its test must too: the web font is the one thing
// it fetches from elsewhere, and a missing font is not a broken page.
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
page.on('dialog', (d) => d.accept());
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

// ── The play-along ────────────────────────────────────────────────────────
const scrollText = () => page.evaluate(() => document.getElementById('scroll').textContent);
await page.click('[data-act="tab"][data-v="play"]');
await page.waitForTimeout(200);
const book = await page.evaluate(() => ({
  first: document.querySelector('[data-act="openSong"]').getAttribute('data-id'),
  // Every chord line in the book adds up to its melody line.
  drift: SONGS.filter((x) => App.hasUke(x)).flatMap((x) => MF_PLAYALONG.plan(x).problems.map((q) => x.id + ':' + q.li)),
  withChords: SONGS.filter((x) => App.hasUke(x)).length,
}));
await page.click('[data-act="filter"][data-v="uke"]');
await page.waitForTimeout(150);
const ukeRows = await page.evaluate(() => document.querySelectorAll('[data-act="openSong"]').length);

await page.click('[data-act="openSong"][data-id="birthday"]');
await page.waitForTimeout(200);
await page.click('[data-act="playInst"][data-v="ukulele"]');
await page.waitForTimeout(300);
const uke = await page.evaluate(() => ({
  diagrams: document.querySelectorAll('#scroll svg[role="img"]').length,
  chips: document.getElementById('scroll').textContent.includes('G7'),
  slots: [...document.querySelectorAll('#scroll div')].filter((d) => /^[↓↑·]$/.test(d.textContent.trim()) && d.children.length === 0).length,
  anchors: /fingers? stay|Whole hand moves/.test(document.getElementById('scroll').textContent),
}));

// Play along, quick: a bar is counted in, then the strums move the chord on.
await page.evaluate(() => App.setState({ tempo: 126 }));
await page.click('[data-act="ukeLine"]');
await page.waitForTimeout(700);
const countingIn = (await scrollText()).includes('Count in');
await page.waitForTimeout(1900);
const midLine = await page.evaluate(() => ({ playing: App.state.playing, ci: App.state.uCi, now: document.getElementById('scroll').textContent.includes('Now') }));
await page.waitForTimeout(2600);
const endLine = await page.evaluate(() => ({ playing: App.state.playing, chord: MF_PLAYALONG.plan(App.song()).chords[App.state.uCi]?.chord }));

// On your own: each change waits for a tap.
await page.click('[data-act="ukeSong"][data-v="solo"]');
await page.waitForTimeout(150);
await page.click('[data-act="ukeLine"]');
await page.waitForTimeout(150);
const armed = await page.evaluate(() => ({ armed: App.state.armed, n: App.state.armItems.length, chord: MF_PLAYALONG.plan(App.song()).chords[App.state.uCi].chord }));
await page.click('[data-act="ukeTap"]');
await page.waitForTimeout(150);
const afterTap = await page.evaluate(() => MF_PLAYALONG.plan(App.song()).chords[App.state.uCi].chord);
await page.click('[data-act="ukeTap"]');
await page.waitForTimeout(150);
const soloDone = await page.evaluate(() => ({ armed: App.state.armed, done: App.state.ukeDone }));

// ── Saving ────────────────────────────────────────────────────────────────
await page.click('[data-act="playInst"][data-v="drum"]');
await page.waitForTimeout(150);
await page.click('[data-act="editThis"]');
await page.waitForTimeout(150);
await page.click('[data-act="pitchUp"]');
await page.click('[data-act="saveEdit"]');
await page.waitForTimeout(200);
const saved = await page.evaluate(() => ({
  toast: document.getElementById('toast').textContent.includes('Saved'),
  stored: JSON.parse(localStorage.getItem('melodyflow-songs') || '[]').map((x) => x.id),
  firstNote: SONGS.find((x) => x.id === 'birthday').lines[0].notes[0].pad,
}));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(300);
const afterReload = await page.evaluate(() => ({
  firstNote: SONGS.find((x) => x.id === 'birthday').lines[0].notes[0].pad,
  edited: SONGS.find((x) => x.id === 'birthday').edited === true,
  chordsKept: App.hasUke(SONGS.find((x) => x.id === 'birthday')),
}));
await page.evaluate(() => App.dispatch('restoreSong', { id: 'birthday' }, {}));
await page.waitForTimeout(150);
const restored = await page.evaluate(() => SONGS.find((x) => x.id === 'birthday').lines[0].notes[0].pad);

// A capture saved becomes a song of your own.
await page.evaluate(() => { App.setState({ tab: 'capture', screen: 'capture' }); App.dispatch('editCapture', {}, {}); });
await page.waitForTimeout(150);
await page.click('[data-act="saveEdit"]');
await page.waitForTimeout(200);
const captured = await page.evaluate(() => ({ screen: App.state.screen, song: App.song().title, custom: !!App.song().custom }));

// ── A copy of the book, out and back in ───────────────────────────────────
await page.click('[data-act="tab"][data-v="book"]');
await page.waitForTimeout(150);
await page.click('[data-act="book"][data-v="mine"]');
await page.waitForTimeout(150);
const listed = await page.evaluate(() => document.querySelectorAll('[data-act="deleteSong"]').length);
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="exportBook"]')]);
const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
const incoming = { ...exported, songs: [{ id: 'my-imported', title: 'From a file', lines: [{ label: 'x', notes: '1 2 3' }], custom: true }] };
await page.setInputFiles('input[data-act="importFile"]', { name: 'book.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
await page.waitForTimeout(300);
const imported = await page.evaluate(() => ({
  msg: document.getElementById('scroll').textContent.includes('Loaded 1 song'),
  have: SONGS.some((x) => x.id === 'my-imported'),
  mine: SONGS.filter((x) => x.custom).length,
}));

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
  ['Happy Birthday is first in the book', book.first === 'birthday'],
  ['every chord line adds up to its melody', book.drift.length === 0],
  ['the ukulele filter lists the songs with chords', ukeRows === book.withChords && ukeRows >= 5],
  ['the play-along draws now and next', uke.diagrams === 2],
  ['the line shows its chords', uke.chips],
  ['a 3/4 bar is six strum slots', uke.slots === 6],
  ['the change says which fingers stay', uke.anchors],
  ['a bar is counted in', countingIn],
  ['the strums move the chord on', midLine.playing && midLine.ci >= 0 && midLine.now],
  ['the line plays out and stops', !endLine.playing && endLine.chord === 'G7'],
  ['on your own waits on the first chord', armed.armed && armed.n === 2 && armed.chord === 'C'],
  ['a tap moves to the next change', afterTap === 'G7'],
  ['the last tap finishes the line', !soloDone.armed && soloDone.done],
  ['saving says so', saved.toast],
  ['a saved edit is stored', saved.stored.includes('birthday') && saved.firstNote === '6.'],
  ['a saved edit survives a reload', afterReload.firstNote === '6.' && afterReload.edited],
  ['editing the tune keeps the chords', afterReload.chordsKept],
  ['restoring puts the original back', restored === '5.'],
  ['a saved capture becomes your song', captured.screen === 'practice' && captured.custom && captured.song === 'My song 1'],
  ['your songs are listed in the book', listed === 1],
  ['a copy of the book is a songbook file', exported.kind === 'melodyflow-songbook' && exported.songs.length === 1 && !!exported.drill],
  ['a copy loads back in', imported.msg && imported.have && imported.mine === 2],
  ['no page errors', errors.length === 0],
];

let failed = 0;
for (const [what, ok] of checks) {
  console.log(`${ok ? '✔' : '✖'} ${what}`);
  if (!ok) failed++;
}
if (errors.length) console.log(errors.join('\n'));
if (failed) console.log(JSON.stringify({ afterOne, afterTwo, book, uke, midLine, endLine, armed, afterTap, soloDone, saved, afterReload, restored, captured, listed, imported }, null, 1));
process.exit(failed ? 1 : 0);
