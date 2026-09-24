import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'instruments.js')).href);
const { MF } = globalThis;

const drum = MF.instrument('drum');
const uke = MF.instrument('ukulele');

test('notation: one grammar, whatever the instrument', () => {
  assert.deepEqual(MF.parseNotation('3'), [{ tok: '3', dur: 1, art: null }]);
  assert.deepEqual(MF.parseNotation('C*2'), [{ tok: 'C', dur: 2, art: null }]);
  assert.deepEqual(MF.parseNotation('G7/u*.5'), [{ tok: 'G7', dur: 0.5, art: 'u' }]);
  assert.deepEqual(MF.parseNotation('0*2'), [{ rest: true, dur: 2 }]);
  assert.deepEqual(MF.parseNotation('|'), [{ bar: true }]);
});

test('notation: survives a round trip, so an edit can be saved as text', () => {
  for (const line of ['1 1 5 5 | 6 6 5*2', 'C C/u*.5 F/x | Am*2 0', '5.*1.5 .3*.5']) {
    assert.equal(MF.writeNotation(MF.parseNotation(line)), line);
  }
});

test('drum: a struck pad is one pitch', () => {
  assert.equal(drum.pitches('1').length, 1);
  assert.ok(Math.abs(drum.pitches('1')[0] - 261.63) < 0.01, 'pad 1 is middle C');
  // A dot under drops an octave, a dot over raises one.
  assert.ok(Math.abs(drum.pitches('1.')[0] * 2 - drum.pitches('1')[0]) < 0.01);
  assert.ok(Math.abs(drum.pitches('.1')[0] / 2 - drum.pitches('1')[0]) < 0.01);
  assert.deepEqual(drum.pitches('9'), [], 'a pad this drum does not have');
});

test('ukulele: a chord is four pitches at once', () => {
  const c = uke.pitches('C');
  assert.equal(c.length, 4, 'the reason a beat can no longer hold one pitch');
  assert.deepEqual(uke.shape('C'), [0, 0, 0, 3]);
  assert.deepEqual(uke.pitches('nope'), []);
});

test('ukulele: the tuning is re-entrant, so the pitches are not in order', () => {
  // The G string is the high one. A shape sorted low-to-high would be a
  // guitar voicing and would sound wrong.
  const [g, c] = uke.pitches('C');
  assert.ok(g > c, 'the G string sits above the C string');
});

test('simultaneity: the sequencer is handed a list, not a note', () => {
  assert.equal(MF.strikes(drum, MF.parseNotation('3')[0]).length, 1);
  assert.equal(MF.strikes(uke, MF.parseNotation('C')[0]).length, 4);
  assert.deepEqual(MF.strikes(uke, MF.parseNotation('|')[0]), []);
  assert.deepEqual(MF.strikes(uke, MF.parseNotation('0')[0]), []);
});

test('articulation: a strum has a direction, a struck pad does not', () => {
  const down = MF.strikes(uke, MF.parseNotation('C')[0]);
  const up = MF.strikes(uke, MF.parseNotation('C/u')[0]);

  // Same four pitches, fanned out in opposite orders.
  assert.deepEqual(
    down.map((s) => s.hz),
    up.map((s) => s.hz).reverse(),
  );
  assert.ok(down[1].atMs > down[0].atMs, 'the strings do not all start together');

  // A chuck is struck and damped: short and quieter than a ring.
  const chuck = MF.strikes(uke, MF.parseNotation('C/x')[0]);
  assert.ok(chuck[0].ring < down[0].ring);
  assert.ok(chuck[0].gain < down[0].gain);

  // Nothing to fan out on a drum, so an articulation on it changes nothing.
  const struck = MF.strikes(drum, MF.parseNotation('3/u')[0]);
  assert.equal(struck.length, 1);
  assert.equal(struck[0].atMs, 0);
});

test('practice: the same match test serves both instruments', () => {
  const pad = MF.parseNotation('5.')[0];
  assert.ok(MF.matches(drum, '5.', pad));
  assert.ok(!MF.matches(drum, '5', pad));

  const chord = MF.parseNotation('G7/u')[0];
  assert.ok(MF.matches(uke, 'G7', chord), 'the shape is what is judged, not the strum');
  assert.ok(!MF.matches(uke, 'G', chord));

  // Nothing is ever the right answer to a rest or a bar line.
  assert.ok(!MF.matches(uke, 'C', MF.parseNotation('0')[0]));
  assert.ok(!MF.matches(uke, 'C', MF.parseNotation('|')[0]));
});

test('every ukulele shape names four strings and reachable frets', () => {
  for (const [name, shape] of Object.entries(uke.shapes)) {
    assert.equal(shape.length, 4, `${name} does not cover four strings`);
    for (const fret of shape) {
      assert.ok(Number.isInteger(fret) && fret >= 0 && fret <= 5, `${name} has an unplayable fret`);
    }
    assert.equal(uke.pitches(name).length, 4, `${name} does not sound`);
  }
});

/**
 * The test that says the abstraction is real: the drum is now one instrument
 * among others, and nothing about it moved. Every arrangement in the songbook
 * is re-parsed and compared against what the old drum-only parser produced.
 */
test('regression: the songbook parses exactly as it did before', () => {
  const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
  const lines = [...html.matchAll(/L\('(?:[^']|\\')*',\s*'([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(lines.length >= 40, `expected the whole songbook, found ${lines.length} lines`);

  // The parser as it was, before instruments existed.
  const before = (str) =>
    str
      .trim()
      .split(/\s+/)
      .map((tok) => {
        if (tok === '|') return { bar: true };
        const b = tok.split('*');
        const dur = b[1] ? parseFloat(b[1]) : 1;
        return b[0] === '0' ? { rest: true, dur } : { pad: b[0], dur };
      });

  for (const line of lines) {
    const old = before(line);
    const now = MF.parseNotation(line);
    assert.equal(now.length, old.length, line);
    old.forEach((o, i) => {
      const n = now[i];
      if (o.bar) return assert.ok(n.bar, line);
      if (o.rest) return assert.ok(n.rest && n.dur === o.dur, line);
      assert.equal(n.tok, o.pad, line);
      assert.equal(n.dur, o.dur, line);
    });
  }
});
