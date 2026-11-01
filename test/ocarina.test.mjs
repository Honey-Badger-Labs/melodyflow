import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['instruments.js', 'songlesson.js', 'learn.js', 'render.js', 'record.js']) await import(pathToFileURL(path.join(here, '..', f)).href);
const { MF_LEARN: L, MF_SONGLESSON: SL, MF_RENDER: X, MF_RECORD: R } = globalThis;
const fakeHost = () => ({ innerHTML: '', isConnected: true, querySelector: () => null, contains: () => true });
const cov = (n) => SL.ocarinaHole(n).cover.map((x) => (x ? 1 : 0)).join('');

test('ocarina chart: 21 chromatic notes A4–F6, each step from the cited chart', () => {
  assert.equal(SL.OC_CHART.length, 21); assert.equal(SL.OC_HI - SL.OC_LO, 20);
  assert.equal(cov('A4'), '111111111111');   // everything closed
  assert.equal(cov('C5'), '111111111100');   // home: sub-holes open
  assert.equal(cov('D5'), '111111111000');   // lift R4
  assert.equal(cov('G5'), '111111000000');   // right hand off
  assert.equal(cov('F6'), '000000000000');   // everything open
  assert.equal(SL.ocarinaHole('G4'), null); assert.equal(SL.ocarinaHole('G6'), null);
  assert.equal(SL.ocarinaProblem('G4'), 'below low A'); assert.equal(SL.ocarinaProblem('A6'), 'above high F');
  assert.equal(SL.ocarinaProblem('E5'), null);
  // natural notes go up by opening holes: cover count never rises along the C major scale
  const nat = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'F6'].map((n) => SL.ocarinaHole(n).cover.filter(Boolean).length);
  for (let i = 1; i < nat.length; i++) assert.ok(nat[i] < nat[i - 1], `step ${i}`);
});

test('Learn on ocarina draws the hole diagram and flags out-of-range notes', () => {
  const h = fakeHost();
  L.mount(h, { inst: 'ocarina', song: { title: 'T', notes: [['G4', 1], ['C5', 1], ['G6', 1]], chords: [], beatsPerBar: 4 } });
  assert.ok(h.innerHTML.includes('data-learn-ocarina'));
  assert.ok(!h.innerHTML.includes('data-learn-drum'));
  assert.ok(h.innerHTML.includes('data-learn-ocarina-flag'));
  assert.match(h.innerHTML, /G4 \(below low A\)/); assert.match(h.innerHTML, /G6 \(above high F\)/);
  assert.equal(L.panelFor('ocarina'), 'ocarina');
  L.unmount();
});

test('Record shifts low notes up an octave onto the ocarina', () => {
  const w = R.placeNote('C4', 'ocarina');
  assert.equal(w.name, 'C5'); assert.ok(w.raised);
  assert.equal(R.placeNote('A4', 'ocarina').raised, false);
  assert.equal(R._state.include.ocarina, false, 'unticked by default');
});

test('ensemble: ocarina is a voice, octave-fitted, near-sine and unclipped', () => {
  assert.ok(X.VOICES.some(([id]) => id === 'ocarina'));
  assert.equal(X.ocFit(60), 72); assert.equal(X.ocFit(91), 79); assert.equal(X.ocFit(69), 69);
  const song = R.forSong({ id: 'x', title: 'X', meter: '4/4', bpm: 90, lines: [{ notes: '1 2 3 1', chords: 'C' }] });
  const r = X.render(song, 90, { sampleRate: 8000, include: ['ocarina'] });
  assert.deepEqual(Object.keys(r.stems), ['ocarina']);
  assert.ok(X.peakOf(r.mix[0]) <= 0.9 && X.peakOf(r.stems.ocarina) > 0.1);
});
