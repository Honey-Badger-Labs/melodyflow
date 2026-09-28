import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'instruments.js')).href);
await import(pathToFileURL(path.join(here, '..', 'listen.js')).href);
const { MF, MF_LISTEN: H } = globalThis;

const SR = 48000;

/* A made-up recording: a few harmonics, a decay, and some room noise. The
   noise is seeded so a failure is the same failure every time. */
function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}
function tone(freqs, { ms = 120, partials = [[1, 1], [2, 0.35], [3, 0.12]], noise = 0.02, seed = 1, detune = 0 } = {}) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  const r = rand(seed);
  for (const f0 of freqs) {
    const f = f0 * 2 ** (detune / 1200);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (const [h, a] of partials) v += a * Math.sin(2 * Math.PI * f * h * t);
      out[i] += (v * Math.exp(-t * 3)) / freqs.length;
    }
  }
  for (let i = 0; i < n; i++) out[i] = out[i] * 0.5 + noise * r();
  return out;
}

test('every pad on the drum is heard as itself', () => {
  for (const pad of MF.DRUM_ORDER) {
    const got = H.yin(tone([MF.padHz(pad)], { ms: 60 }), SR);
    assert.ok(got, `${pad}: no pitch`);
    const heard = H.nearestPad(got.hz);
    assert.equal(heard && heard.tok, pad, `${pad} heard as ${heard && heard.tok} (${got.hz.toFixed(1)} Hz)`);
    assert.ok(got.clarity > 0.8, `${pad}: clarity ${got.clarity}`);
  }
});

test('a drum a little out of tune is still the pad it is closest to', () => {
  const got = H.yin(tone([MF.padHz('5')], { ms: 60, detune: 30 }), SR);
  const heard = H.nearestPad(got.hz);
  assert.equal(heard.tok, '5');
  assert.ok(heard.cents > 20 && heard.cents < 40, `cents ${heard.cents}`);
});

test('between two pads is neither, and silence has no pitch', () => {
  // Halfway between E and F, a quarter-tone from each: nothing on the drum is there.
  assert.equal(H.nearestPad(MF.padHz('3') * 2 ** (50 / 1200), { tolerance: 40 }), null);
  const hiss = tone([], { ms: 60, noise: 0.3, seed: 9 });
  const got = H.yin(hiss, SR);
  assert.ok(got === null || got.clarity < 0.6, 'noise was heard as a note');
});

test('humming an octave below the drum folds up onto it', () => {
  const low = MF.padHz('3') / 2; // E3, below the drum's G3
  assert.equal(H.nearestPad(low), null);
  const folded = H.nearestPad(low, { fold: true });
  assert.equal(folded.tok, '3');
  assert.equal(folded.snapped, true);
});

test('the same note in another octave is recognised as the same note', () => {
  assert.ok(H.sameNote('1', '.1'));
  assert.ok(H.sameNote('5.', '5'));
  assert.equal(H.sameNote('1', '2'), false);
});

test('a strum is told apart from the other chords in the song', () => {
  const uke = MF.instrument('ukulele');
  const song = ['C', 'G7', 'C7', 'F'];
  for (const name of song) {
    const ch = H.chroma(tone(uke.pitches(name), { ms: 180, seed: 3 }), SR);
    const got = H.pickChord(ch, song);
    assert.equal(got.name, name, `${name} heard as ${got.name} (${got.scores.map((s) => s.name + ' ' + s.score.toFixed(2)).join(', ')})`);
  }
});

test('C and A minor share two notes and are still told apart', () => {
  const uke = MF.instrument('ukulele');
  for (const name of ['C', 'Am']) {
    const got = H.pickChord(H.chroma(tone(uke.pitches(name), { ms: 180, seed: 5 }), SR), ['C', 'Am', 'F', 'G7']);
    assert.equal(got.name, name);
  }
});

test('a note starts when the sound jumps, and a repeated note starts twice', () => {
  const det = H.onsets();
  // Quiet room, strike, ring down, strike again at the same pitch, ring down.
  const levels = [0.002, 0.002, 0.003, 0.2, 0.15, 0.1, 0.07, 0.05, 0.19, 0.12, 0.08, 0.05, 0.03];
  const hits = levels.map((l, i) => det.push(l, i * 25)).map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(hits, [3, 8]);
});

test('a reading that drops out for a moment is not a new note', () => {
  // Taken from a run through the fake microphone: one block of audio dipped
  // to a third and came straight back, mid-note.
  const det = H.onsets();
  const levels = [0.0622, 0.3425, 0.3229, 0.1011, 0.282, 0.2671, 0.2459, 0.216, 0.2043, 0.1891];
  const hits = levels.map((l, i) => det.push(l, 3625 + i * 25)).filter(Boolean).length;
  assert.equal(hits, 1);
});

test('a fading note never starts a new one', () => {
  const det = H.onsets();
  const levels = [0.002, 0.3, 0.25, 0.2, 0.16, 0.12, 0.09, 0.07, 0.05, 0.04];
  assert.equal(levels.filter((l, i) => det.push(l, i * 25)).length, 1);
});

test('heard notes become lengths in beats, at the pulse they were played', () => {
  // Twinkle's first bar at 90 bpm: four crotchets, then a minim.
  const beat = 60000 / 90;
  const ev = ['1', '1', '5', '5', '6', '6', '5'].map((tok, i) => ({ tok, t: i * beat + (i % 2 ? 12 : -9) }));
  ev.push({ tok: '4', t: 8 * beat });
  const q = H.quantize(ev);
  assert.equal(q.bpm, 90);
  assert.deepEqual(q.notes.map((n) => n.dur), [1, 1, 1, 1, 1, 1, 2, 1]);
});

test('a pulse too quick to be the beat is taken as half beats', () => {
  const ev = [0, 1, 2, 3].map((i) => ({ tok: '1', t: i * 250 })); // 240 per minute
  const q = H.quantize(ev);
  assert.equal(q.bpm, 120);
  assert.deepEqual(q.notes.map((n) => n.dur), [0.5, 0.5, 0.5, 1]);
});
