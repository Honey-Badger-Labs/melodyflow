import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
await load('instruments.js');
await load('tab.js');
const { MF, MF_TAB: T } = globalThis;

const at = (m) => { const p = T.place(m); return p && [p.stringName, p.fret]; };

test('open strings are fret 0 on their own string', () => {
  assert.deepEqual(at(67), ['G', 0]);
  assert.deepEqual(at(60), ['C', 0]);
  assert.deepEqual(at(64), ['E', 0]);
  assert.deepEqual(at(69), ['A', 0]);
});

test('lowest fret wins, across the re-entrant G', () => {
  assert.deepEqual(at(62), ['C', 2]);   // D4
  assert.deepEqual(at(65), ['E', 1]);   // F4
  assert.deepEqual(at(66), ['E', 2]);   // F#4 — not G string, it is below G4
  assert.deepEqual(at(68), ['G', 1]);   // G#4: G 1 beats E 4
  assert.deepEqual(at(71), ['A', 2]);   // B4: A 2 beats G 4
  assert.deepEqual(at(72), ['A', 3]);   // C5
  assert.deepEqual(at(76), ['A', 7]);   // E5
  assert.deepEqual(at(81), ['A', 12]);
  assert.equal(T.place(82), null);      // past the 12th fret
});

test('every placement sounds the note it claims', () => {
  for (let m = 60; m <= 81; m++) {
    const p = T.place(m);
    assert.equal(T.OPEN[p.string] + p.fret, m);
    // No string offers a lower fret.
    for (const open of T.OPEN) if (m - open >= 0) assert.ok(m - open >= p.fret);
  }
});

test('below the lowest string is lifted an octave, and says so', () => {
  const g3 = T.place(55);
  assert.equal(g3.shifted, 12);
  assert.deepEqual([g3.stringName, g3.fret], ['G', 0]);
});

test('the drum, pad by pad', () => {
  const pads = MF.instrument('drum').tokens;
  const got = Object.fromEntries(pads.map((p) => { const x = T.placePad(p); return [p, x.stringName + x.fret + (x.shifted ? '^' : '')]; }));
  assert.deepEqual(got, {
    '5.': 'G0^', '6.': 'A0^', '7.': 'A2^',
    '1': 'C0', '2': 'C2', '3': 'E0', '4': 'E1', '5': 'G0', '6': 'A0', '7': 'A2',
    '.1': 'A3', '.2': 'A5', '.3': 'A7',
  });
});

test('a line becomes columns, bars and rests kept', () => {
  const ev = MF.parseNotation('1 1 5 | 0 6*2');
  const drumish = ev.map((e) => (e.bar ? e : e.tok === '0' ? { rest: true, dur: e.dur } : { pad: e.tok, dur: e.dur }));
  const cols = T.columns(drumish);
  assert.equal(cols.length, 6);
  assert.ok(cols[3].bar);
  assert.ok(cols[4].rest);
  assert.equal(cols[5].dur, 2);
  assert.equal(cols[2].stringName, 'G');
  const html = T.render(cols, { cur: 2 });
  assert.match(html, /aria-current="true"/);
  assert.match(html, /G4: G string, open/);
  assert.equal((html.match(/role="listitem"/g) || []).length, 5);
});
