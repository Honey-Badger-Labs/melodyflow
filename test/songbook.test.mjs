import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'instruments.js')).href);
await import(pathToFileURL(path.join(here, '..', 'songbook.js')).href);
const { MF, MF_SONGBOOK: B } = globalThis;

// A song as the app holds it: the drum's notes as pads, chords as tokens.
const pads = (s) => MF.parseNotation(s).map((e) => (e.bar || e.rest ? e : { pad: e.tok, dur: e.dur }));
const birthday = {
  id: 'birthday', title: 'Happy Birthday to You', cat: 'Celebration', level: 1, bpm: 96, meter: '3/4', pickup: 1, stars: 0,
  lines: [{ label: 'Happy birthday to you', notes: pads('5.*.5 5.*.5 | 6. 5. 1 | 7.*2'), chords: MF.parseNotation('0 | C*3 | G7*2') }],
};

test('a song is saved as the text it was written in', () => {
  const s = B.serialize(birthday);
  assert.equal(s.lines[0].notes, '5.*.5 5.*.5 | 6. 5. 1 | 7.*2');
  assert.equal(s.lines[0].chords, '0 | C*3 | G7*2');
  assert.equal(s.pickup, 1);
  // What the app draws with is not saved: it comes back from the built-in.
  assert.equal(s.stars, undefined);
  assert.ok(B.valid(s));
});

test('a line without chords saves without them', () => {
  const s = B.serialize({ id: 'x', title: 'x', lines: [{ label: 'a', notes: pads('1 2 3'), chords: null }] });
  assert.equal('chords' in s.lines[0], false);
  assert.equal(s.meter, '4/4');
});

test('your correction takes the built-in song\'s place; your own songs follow', () => {
  const builtIns = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const saved = [{ id: 'mine', title: 'Mine', lines: [] }, { id: 'b', title: 'B, fixed', lines: [] }];
  const out = B.merge(builtIns, saved);
  assert.deepEqual(out.map((e) => e.song.title), ['A', 'B, fixed', 'Mine']);
  assert.equal(out[1].edited, true);
  assert.equal(out[1].original.title, 'B');
  assert.equal(out[2].custom, true);
});

test('saving a song again replaces it rather than adding a copy', () => {
  const list = B.upsert(B.upsert([], { id: 'a', title: 'one' }), { id: 'a', title: 'two' });
  assert.deepEqual(list, [{ id: 'a', title: 'two' }]);
});

test('a saved copy reads back with its songs and drill times', () => {
  const song = B.serialize(birthday);
  const file = JSON.stringify(B.bundle({ songs: [song], drill: { fifties: { bpm: 90 } }, now: '2026-09-28T00:00:00Z' }));
  const got = B.unbundle(file);
  assert.deepEqual(got.songs, [song]);
  assert.deepEqual(got.drill, { fifties: { bpm: 90 } });
  assert.equal(got.skipped, 0);
  assert.equal(got.exported, '2026-09-28T00:00:00Z');
});

test('a file that is not a songbook says so in words', () => {
  assert.throws(() => B.unbundle('not json'), /could not be read/);
  assert.throws(() => B.unbundle('{"hello":1}'), /not a MelodyFlow songbook/);
  assert.throws(() => B.unbundle(JSON.stringify({ kind: B.KIND, version: 99 })), /newer MelodyFlow/);
});

test('a damaged song is left out and counted, and the rest still load', () => {
  const good = B.serialize(birthday);
  const got = B.unbundle(JSON.stringify(B.bundle({ songs: [good, { id: 'bad' }, { title: 'no id', lines: [] }] })));
  assert.equal(got.songs.length, 1);
  assert.equal(got.skipped, 2);
});

test('loading a copy keeps what was on the phone and updates what the file has', () => {
  const phone = [{ id: 'a', title: 'phone A' }, { id: 'b', title: 'phone B' }];
  const merged = B.absorb(phone, [{ id: 'b', title: 'file B' }, { id: 'c', title: 'file C' }]);
  assert.deepEqual(merged.map((s) => s.title).sort(), ['file B', 'file C', 'phone A']);
});

test('a song from a file is cut down to plain values before the app sees it', () => {
  const hostile = {
    id: 'ok-id', title: 'Fine', cat: 'Fine', level: '9', bpm: '<img src=x onerror=alert(1)>', meter: '"><script>',
    pickup: 'lots', custom: 'yes', extra: 'dropped',
    lines: [{ label: 'a', notes: '1 2 3', chords: '' }],
  };
  const s = B.clean(hostile);
  assert.deepEqual(s, { id: 'ok-id', title: 'Fine', cat: 'Fine', level: 3, bpm: 84, meter: '4/4', lines: [{ label: 'a', notes: '1 2 3' }] });
  // An id goes into the page as an attribute, so only plain ids get in at all.
  assert.equal(B.clean({ ...hostile, id: 'x" onclick="alert(1)' }), null);
});

test('notes are only ever written in the notation', () => {
  const song = { id: 'a', title: 'a', lines: [{ label: 'a', notes: '5. .1*2 | C/u*.5 G7 0 Bb C#m' }] };
  assert.ok(B.valid(song));
  assert.equal(B.valid({ ...song, lines: [{ label: 'a', notes: '1 <img src=x onerror=alert(1)>' }] }), false);
  assert.equal(B.valid({ ...song, lines: [{ label: 'a', notes: '1 2', chords: 'C "x"' }] }), false);
});
