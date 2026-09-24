import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
await load('instruments.js');
await load('fretboard.js');

const { MF, MF_FRETBOARD: FB } = globalThis;
const uke = MF.instrument('ukulele');
const T = uke.strings;

test('chord names: root, accidental, quality', () => {
  assert.equal(FB.parseChord('C').rootPc, 0);
  assert.equal(FB.parseChord('Bb').rootPc, 10);
  assert.equal(FB.parseChord('F#').rootPc, 6);
  // "m7" must win over "m", or every minor seventh becomes a minor.
  assert.deepEqual(FB.parseChord('Am7').tones, [9, 0, 4, 7]);
  assert.deepEqual(FB.parseChord('Am').tones, [9, 0, 4]);
  assert.equal(FB.parseChord('Hdim7'), null);
  assert.equal(FB.parseChord('Cwhatever'), null);
});

/**
 * The search knows no chord charts — it works from the notes. That it finds
 * every shape the charts teach is what says both the table and the algorithm
 * are right, and it is the reason nothing here is a lookup.
 */
test('every shape the charts teach is found from the notes alone', () => {
  for (const [name, frets] of Object.entries(uke.shapes)) {
    const found = FB.shapesFor(name, T).some(
      (s) => JSON.stringify(s.frets) === JSON.stringify(frets),
    );
    assert.ok(found, `the chart shape for ${name} was not found`);
  }
});

test('the chart shape is offered first when there is one', () => {
  for (const [name, frets] of Object.entries(uke.shapes)) {
    const top = FB.shapesFor(name, T, frets)[0];
    assert.ok(top.canonical, name);
    assert.deepEqual(top.frets, frets, name);
  }
});

test('a shape sounds every note the chord needs', () => {
  for (const name of ['C', 'Am7', 'G7', 'Bb', 'Dm', 'Fmaj7', 'Esus4']) {
    const chord = FB.parseChord(name);
    for (const s of FB.shapesFor(name, T)) {
      const sounding = new Set(s.frets.map((f, i) => (T[i] + f) % 12));
      for (const pc of chord.required) {
        assert.ok(sounding.has(pc), `${name} ${JSON.stringify(s.frets)} is missing a note`);
      }
    }
  }
});

test('a shape is within reach: one hand, no stretch past four frets', () => {
  for (const name of ['C', 'Bb', 'B7', 'Cm', 'D7']) {
    for (const s of FB.shapesFor(name, T)) {
      assert.ok(Math.max(...s.frets) <= FB.MAX_FRET, name);
      const held = s.frets.filter((f) => f > 0);
      if (held.length) {
        assert.ok(Math.max(...held) - Math.min(...held) < FB.MAX_SPAN, name);
      }
      assert.ok(s.fingers <= 4, `${name} needs ${s.fingers} fingers`);
    }
  }
});

test('fingers never cross: a higher fret takes a higher finger', () => {
  for (const name of Object.keys(uke.shapes)) {
    for (const s of FB.shapesFor(name, T)) {
      const held = s.placements.slice().sort((a, b) => a.fret - b.fret);
      for (let i = 1; i < held.length; i++) {
        if (held[i].fret > held[i - 1].fret) {
          assert.ok(held[i].finger > held[i - 1].finger, `${name} crosses fingers`);
        }
      }
    }
  }
});

test('Bb needs a barre and C does not', () => {
  assert.ok(FB.shapesFor('Bb', T, uke.shapes.Bb)[0].barre);
  assert.ok(!FB.shapesFor('C', T, uke.shapes.C)[0].barre);
});

test('holding what you already hold costs nothing', () => {
  const c = FB.shapesFor('C', T, uke.shapes.C)[0];
  assert.equal(FB.transitionCost(c, c), 0);
});

/**
 * The fact the whole model exists to capture. A minor to F keeps a finger on
 * the second fret of the G string; C to F moves everything. Every teacher
 * says so, and a cost model that disagreed would be measuring the wrong
 * thing however tidy its code.
 */
test('an anchored finger is what makes a change easy', () => {
  const am = FB.shapesFor('Am', T, uke.shapes.Am);
  const f = FB.shapesFor('F', T, uke.shapes.F)[0];
  const c = FB.shapesFor('C', T, uke.shapes.C)[0];

  const amToF = Math.min(...am.map((a) => FB.transitionCost(a, f)));
  assert.ok(amToF < FB.transitionCost(c, f), 'Am → F should beat C → F');

  // And the cheap route is the one that keeps the finger where it was.
  const best = am.reduce((a, b) => (FB.transitionCost(a, f) <= FB.transitionCost(b, f) ? a : b));
  const held = best.placements.find((p) => p.string === 0 && p.fret === 2);
  const kept = f.placements.find((p) => p.string === 0 && p.fret === 2);
  assert.ok(held && kept && held.finger === kept.finger, 'the anchor is the same finger');
});

test('landing a finger costs more than lifting one', () => {
  const one = FB.shapesFor('Am', T, uke.shapes.Am)[0];
  const three = FB.shapesFor('G7', T, uke.shapes.G7)[0];
  assert.ok(
    FB.transitionCost(one, three) > FB.transitionCost(three, one),
    'adding fingers is the harder direction',
  );
});

/**
 * Why this is a path and not a loop of best-next-shapes. A shape that is easy
 * to arrive at can be expensive to leave, and a progression comes round again.
 */
test('the whole progression is solved, not each change in turn', () => {
  const song = ['C', 'Am', 'F', 'G7', 'C', 'Am', 'F', 'G7'];
  const solved = FB.easiestPath(song, T);
  assert.ok(solved, 'the progression is playable');
  assert.equal(solved.shapes.length, song.length);

  // Greedy: always take the cheapest next shape and never look back.
  let greedy = 0;
  let held = null;
  for (const name of song) {
    const next = FB.shapesAfter(name, held, T)[0];
    greedy += FB.transitionCost(held, next);
    held = next;
  }
  assert.ok(solved.total <= greedy, `path ${solved.total} should not beat greedy ${greedy}`);
});

test('a progression it cannot play says so rather than guessing', () => {
  assert.equal(FB.easiestPath(['C', 'Hmaj9'], T), null);
  assert.deepEqual(FB.shapesFor('Zm', T), []);
});
