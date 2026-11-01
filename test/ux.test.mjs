import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'ux.js')).href);
const U = globalThis.MF_UX;
const songs = [
  { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', cat: 'Nursery', chords: true },
  { id: 'jingle', title: 'Jingle Bells', cat: 'Christmas' },
  { id: 'frere', title: 'Frère Jacques', cat: 'Round', chords: true, chordsGuess: true },
  { id: 'my-1', title: 'My song 1', cat: 'My songs', custom: true },
];
const hasUke = (x) => !!x.chords;

test('three modes, three instruments, four filters', () => {
  assert.deepEqual(U.MODES.map((m) => m[0]), ['listen', 'learn', 'record']);
  assert.deepEqual(U.INSTRUMENTS.map((m) => m[0]), ['drum', 'ukulele', 'piano']);
  assert.ok(U.FILTERS.length <= 4);
});

test('the big button follows the mode', () => {
  assert.equal(U.primary('listen', songs[0]).label, '▶ Play');
  assert.equal(U.primary('listen', songs[0], true).label, '■ Stop');
  assert.deepEqual(U.primary('learn', songs[0]), { label: '▶ Start lesson', action: 'lesson', lesson: 'twinkle' });
  assert.equal(U.primary('learn', songs[1]).action, 'step');
  assert.equal(U.primary('record', songs[1]).action, 'record');
  assert.equal(U.primary('record', songs[0]).action, 'capture');
});

test('one list: filter and accent-insensitive search', () => {
  assert.equal(U.filterSongs(songs, 'all', '', hasUke).length, 4);
  assert.deepEqual(U.filterSongs(songs, 'christmas', '', hasUke).map((x) => x.id), ['jingle']);
  assert.deepEqual(U.filterSongs(songs, 'mine', '', hasUke).map((x) => x.id), ['my-1']);
  assert.deepEqual(U.filterSongs(songs, 'uke', '', hasUke).map((x) => x.id), ['twinkle', 'frere']);
  assert.deepEqual(U.filterSongs(songs, 'all', 'frere', hasUke).map((x) => x.id), ['frere']);
  assert.deepEqual(U.filterSongs(songs, 'all', 'NURS', hasUke).map((x) => x.id), ['twinkle']);
});

test('at most one badge, only when it matters for your instrument', () => {
  assert.equal(U.badge(songs[0], 'drum', hasUke), '');
  assert.equal(U.badge(songs[1], 'ukulele', hasUke), 'Melody only on uke');
  assert.equal(U.badge(songs[2], 'ukulele', hasUke), 'Chords · guess');
  assert.equal(U.badge(songs[2], 'drum', hasUke), '');
});

test('the service worker caches ux.js and the page loads it before the app script', async () => {
  const fs = await import('node:fs');
  const sw = fs.readFileSync(path.join(here, '..', 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
  assert.match(sw, /'\.\/ux\.js'/);
  assert.ok(html.indexOf('src="ux.js"') > 0 && html.indexOf('src="ux.js"') < html.indexOf('const App = {'));
});

test('three bottom tabs: Songs, Play freely, Me; and a landscape left rail', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
  assert.match(html, /\[\['play','Songs','♪'\],\['drum','Play freely','◍'\],\['me','Me','●'\]\]/);
  assert.match(html, /nav#tabbar\{order:-1;flex-direction:column/);
});
