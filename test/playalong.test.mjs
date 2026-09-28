import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'instruments.js')).href);
await import(pathToFileURL(path.join(here, '..', 'playalong.js')).href);
const { MF, MF_PLAYALONG: P } = globalThis;

const line = (notes, chords) => ({ notes: MF.parseNotation(notes), chords: chords ? MF.parseNotation(chords) : null });

// Happy Birthday's first two lines, as the app has them.
const birthday = {
  meter: '3/4',
  pickup: 1,
  lines: [
    line('5.*.5 5.*.5 | 6. 5. 1 | 7.*2', '0 | C*3 | G7*2'),
    line('5.*.5 5.*.5 | 6. 5. 2 | 1*2', 'G7 | G7*3 | C*2'),
  ],
};

test('the melody sets the time, and each line starts where the last ended', () => {
  const p = P.plan(birthday);
  assert.equal(p.total, 12);
  assert.deepEqual(p.lines.map((l) => [l.t, l.dur]), [[0, 6], [6, 6]]);
  assert.deepEqual(p.problems, []);
});

test('a pickup puts the first downbeat after it, so the strum lands on "birth"', () => {
  const p = P.plan(birthday);
  // Beat 0 is the upbeat "Hap-py", under a rest: nothing is strummed there.
  assert.equal(p.strokes[0].t, 1);
  assert.equal(p.strokes[0].chord, 'C');
  assert.equal(p.strokes[0].off, 0);
  // Every down-strum in all-downs is on a whole beat.
  assert.ok(p.strokes.every((s) => s.art === 'd' && Number.isInteger(s.t)));
});

test('the click marks the downbeats where the bars actually fall', () => {
  const p = P.plan(birthday);
  assert.deepEqual(p.clicks.filter((c) => c.down).map((c) => c.t), [1, 4, 7, 10]);
  assert.equal(p.clicks[0].t, 0);
  assert.equal(p.clicks[0].down, false);
});

test('the pattern strums up on the offbeats, and each strum lasts until the next', () => {
  const p = P.plan({ meter: '4/4', lines: [line('1 2 3 4', 'C*4')] }, { strum: 'pattern' });
  assert.deepEqual(p.strokes.map((s) => [s.t, s.art]), [[0, 'd'], [1, 'd'], [1.5, 'u'], [2.5, 'u'], [3, 'd'], [3.5, 'u']]);
  assert.deepEqual(p.strokes.map((s) => s.dur), [1, 0.5, 1, 0.5, 0.5, 0.5]);
});

test('a strum belongs to the chord sounding when it falls', () => {
  const p = P.plan({ meter: '4/4', lines: [line('1 1 1 1 | 5 5 5 5', 'C*2 F*2 | G7*4')] });
  assert.deepEqual(p.strokes.map((s) => s.chord), ['C', 'C', 'F', 'F', 'G7', 'G7', 'G7', 'G7']);
});

test('a chord held across a line break is one change, not two', () => {
  const p = P.plan(birthday);
  // G7 ends line one and opens line two: the hand does not move.
  assert.deepEqual(p.groups.map((g) => g.chord), ['C', 'G7', 'C']);
  assert.equal(p.groups[1].t, 4);
  assert.equal(p.groups[1].end, 10);
  assert.equal(p.groupOf[1], p.groupOf[2]);
});

test('the next change is counted from where you are', () => {
  const p = P.plan(birthday);
  assert.deepEqual(P.nextChange(p, 1), { group: 1, chord: 'G7', t: 4, in: 3 });
  assert.equal(P.nextChange(p, 11), null);
});

test('chords that do not add up to their line are reported, not stretched', () => {
  const p = P.plan({ meter: '4/4', lines: [line('1 2 3 4', 'C*3')] });
  assert.deepEqual(p.problems, [{ li: 0, melody: 4, chords: 3 }]);
});

test('a song with no chords still has a melody and a click', () => {
  const p = P.plan({ meter: '4/4', lines: [line('1 2 0 3')] });
  assert.equal(p.melody.length, 3);
  assert.equal(p.melody[2].t, 3);
  assert.equal(p.strokes.length, 0);
  assert.equal(p.clicks.length, 4);
});

test('beats in a bar are counted the way a player counts them', () => {
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map(P.countLabel), ['1', '&', '2', '&', '3']);
  assert.equal(P.barOf(P.plan(birthday), 0), -2);
  assert.equal(P.barOf(P.plan(birthday), 5.5), 4);
});
