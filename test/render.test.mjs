import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['instruments.js', 'learn.js', 'listen.js', 'render.js', 'record.js']) await import(pathToFileURL(path.join(here, '..', f)).href);
const { MF_RENDER: X, MF_RECORD: R, MF_LISTEN: Li } = globalThis;

test('stems are aligned, same length, unclipped; mix is stereo', () => {
  const r = X.render(R.SONG, 110, { sampleRate: 16000 });
  const n = r.stems.piano.length;
  for (const k of ['drum', 'ukulele']) assert.equal(r.stems[k].length, n);
  assert.equal(r.mix.length, 2);
  for (const a of [...Object.values(r.stems), ...r.mix]) { const p = X.peakOf(a); assert.ok(p > 0.1 && p < 0.95, `peak ${p}`); }
  assert.ok(Math.abs(r.seconds - (128 * 60 / 110 + 2.5)) < 0.01);
});

test('tongue-drum stem sounds the opening notes G3 E4 D4 C4 in tune', () => {
  const sr = 16000, r = X.render(R.SONG, 110, { sampleRate: sr }), spb = 60 / 110;
  ['G3', 'E4', 'D4', 'C4'].forEach((n, k) => {
    const i = Math.floor((k * spb + 0.03) * sr), y = Li.yin(r.stems.drum.subarray(i, i + 2048), sr);
    const want = 440 * 2 ** ((X.midiOf(n) - 69) / 12), got = y && (y.hz || y);
    assert.ok(got && Math.abs(1200 * Math.log2(got / want)) < 50, `${n}: ${got}`);
  });
});

test('ukulele shapes are the standard C, F, G7', () => {
  assert.deepEqual(X.SHAPES.C, [0, 0, 0, 3]);
  assert.deepEqual(X.SHAPES.F, [2, 0, 1, 0]);
  assert.deepEqual(X.SHAPES.G7, [0, 2, 1, 2]);
});
