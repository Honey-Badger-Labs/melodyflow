import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'instruments.js')).href);
await import(pathToFileURL(path.join(here, '..', 'learn.js')).href);
const L = globalThis.MF_LEARN;

test('parseNote: names to MIDI', () => {
  assert.equal(L.parseNote('C4').midi, 60);
  assert.equal(L.parseNote('A4').midi, 69);
  assert.equal(L.parseNote('F#4').midi, 66);
  assert.equal(L.parseNote('Bb3').midi, 58);
  assert.equal(L.parseNote('H2'), null);
});

test('staff: E4 is the bottom line, F5 the top, middle C needs one ledger line', () => {
  assert.equal(L.staffStep('E4'), 0);
  assert.equal(L.staffStep('F5'), 8);
  assert.equal(L.staffStep('C4'), -2);
  assert.deepEqual(L.ledgerLines(-2), [-2]);
  assert.deepEqual(L.ledgerLines(4), []);
  assert.deepEqual(L.ledgerLines(10), [10]);
  assert.ok(L.onLine(L.staffStep('G4')));
  assert.ok(!L.onLine(L.staffStep('F4')));
});

test('piano: two octaves from middle C, five black keys per octave', () => {
  const keys = L.pianoKeys();
  assert.equal(keys[0].midi, 60);
  assert.equal(keys.length, 24);
  assert.equal(keys.filter((k) => k.black).length, 10);
  assert.equal(L.pianoFinger(60), 1);
  assert.equal(L.KEY_MAP.a, 60);
});

test('drum: pads agree with the drum engraving', () => {
  assert.equal(L.drumPad('C4'), '1');
  assert.equal(L.drumPad('G3'), '5.');
  assert.equal(L.drumPad('E5'), '.3');
  assert.equal(L.drumPad('F#4'), null);
});

test('ukulele: lowest fret wins on re-entrant GCEA', () => {
  assert.deepEqual(L.ukePosition('C4'), { string: 1, stringName: 'C', fret: 0 });
  assert.deepEqual(L.ukePosition('D4'), { string: 1, stringName: 'C', fret: 2 });
  assert.deepEqual(L.ukePosition('G4'), { string: 0, stringName: 'G', fret: 0 });
  assert.equal(L.ukePosition('C3'), null);
});

test('every lesson plays on every instrument and has a sane timeline', () => {
  for (const lesson of L.LESSONS) {
    for (const inst of ['piano', 'drum', 'ukulele']) assert.ok(L.playableOn(lesson, inst), `${lesson.id} on ${inst}`);
    const t = L.timeline(lesson.notes);
    assert.equal(t.starts[0], 0);
    assert.ok(t.total > 0);
  }
});

test('step mode only accepts the right note in the right octave', () => {
  assert.ok(L.isRight('C4', 60));
  assert.ok(!L.isRight('C4', 72));
  assert.ok(!L.isRight('C4', 62));
});

test('where: words a beginner can follow', () => {
  assert.equal(L.where('C4', 'piano').text, 'Middle C');
  assert.equal(L.where('E4', 'drum').text, 'Pad 3');
  assert.equal(L.where('A4', 'ukulele').text, 'A string, open');
});
