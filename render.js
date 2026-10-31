/* MelodyFlow — offline ensemble render.
   Renders a song to three sample-aligned stems — piano, tongue drum, ukulele —
   at one tempo, plus a stereo mix, as plain Float32Arrays. It is arithmetic on
   arrays (no AudioContext), so it renders identically in the browser and in
   node, faster than real time, and needs no samples at all: every sound here is
   synthesised, so there is nothing to license.

     tongue drum  the melody, at true pitch, with the app's own drum voice
                  (the same partials the Drum screen plays).
     ukulele      the chords, strummed D · DU · DU · D on real GCEA shapes,
                  each string a Karplus–Strong plucked string.
     piano        the melody an octave up plus a left-hand root/fifth,
                  additive partials with a hammer click and a faster decay
                  on the upper partials. */
(function (root) {
  'use strict';
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = (n) => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  // GCEA re-entrant: G4 C4 E4 A4 open; shapes as fret per string.
  const UKE_OPEN = [67, 60, 64, 69];
  const SHAPES = { C: [0, 0, 0, 3], F: [2, 0, 1, 0], G7: [0, 2, 1, 2], Dm: [2, 2, 1, 0], D7: [2, 2, 2, 3] };
  const ROOT = { C: 48, F: 41, G7: 43, Dm: 50, D7: 50 };

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function addTone(buf, sr, t, f, dur, gain, partials, decay) {
    const i0 = Math.floor(t * sr), n = Math.min(buf.length - i0, Math.floor((dur + 0.02) * sr));
    for (const [mul, amp, dk] of partials) {
      const w = 2 * Math.PI * f * mul / sr, k = (dk || 1) * decay / sr;
      for (let i = 0; i < n; i++) {
        const att = i < sr * 0.005 ? i / (sr * 0.005) : 1, rel = i > n - sr * 0.02 ? (n - i) / (sr * 0.02) : 1;
        buf[i0 + i] += gain * amp * att * rel * Math.exp(-k * i) * Math.sin(w * i);
      }
    }
  }

  function pluck(buf, sr, t, f, gain, rand, ring = 1.6) {
    const N = Math.max(2, Math.round(sr / f)), line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = rand() * 2 - 1;
    const i0 = Math.floor(t * sr), n = Math.min(buf.length - i0, Math.floor(ring * sr));
    let p = 0, prev = 0;
    const damp = 0.996, bright = 0.5;
    for (let i = 0; i < n; i++) {
      const cur = line[p], next = line[(p + 1) % N];
      const v = damp * (bright * cur + (1 - bright) * next);
      line[p] = v; p = (p + 1) % N;
      const lp = prev + 0.6 * (cur - prev); prev = lp;
      const fade = i > n - sr * 0.05 ? (n - i) / (sr * 0.05) : 1;
      buf[i0 + i] += gain * lp * fade;
    }
  }

  function render(song, bpm, opts = {}) {
    const sr = opts.sampleRate || 44100, spb = 60 / bpm, bpb = song.beatsPerBar || 4;
    const beats = song.notes.reduce((a, [, d]) => a + d, 0), tail = 2.5;
    const len = Math.ceil((beats * spb + tail) * sr);
    const drum = new Float32Array(len), piano = new Float32Array(len), ukulele = new Float32Array(len);
    const rand = rng(1857);
    let b = 0;
    for (const [name, d] of song.notes) {
      const t = b * spb, m = midiOf(name);
      // tongue drum: app partials, ring ~1.6 s, struck firmly
      addTone(drum, sr, t, hz(m), 1.8, 0.32, [[1, 1, 1], [2.02, 0.3, 1.6], [3.01, 0.1, 2.2], [5.43, 0.035, 3]], 2.2);
      // piano melody up an octave
      addTone(piano, sr, t, hz(m + 12), Math.min(2.2, d * spb + 0.6), 0.18,
        [[1, 1, 1], [2.001, 0.5, 1.5], [3.003, 0.25, 2.2], [4.006, 0.12, 3], [5.01, 0.06, 4], [6.02, 0.03, 5]], 1.6);
      // hammer click
      const i0 = Math.floor(t * sr); for (let i = 0; i < sr * 0.004 && i0 + i < len; i++) piano[i0 + i] += 0.02 * (rand() * 2 - 1) * (1 - i / (sr * 0.004));
      b += d;
    }
    const strum = [[0, 'D'], [1, 'D'], [1.5, 'U'], [2, 'D'], [2.5, 'U'], [3, 'D']];
    song.chords.forEach((c, bar) => {
      const t0 = bar * bpb * spb, frets = SHAPES[c];
      for (const [beat, dir] of strum) {
        const order = dir === 'D' ? [0, 1, 2, 3] : [3, 2, 1, 0], g = dir === 'D' ? 0.16 : 0.1;
        order.forEach((s, k) => pluck(ukulele, sr, t0 + beat * spb + k * 0.012, hz(UKE_OPEN[s] + frets[s]), g, rand, 1.2));
      }
      // piano left hand: root on 1, fifth on 3
      const r = ROOT[c];
      addTone(piano, sr, t0, hz(r), 2 * spb + 0.3, 0.16, [[1, 1, 1], [2, 0.45, 1.6], [3, 0.2, 2.4], [4, 0.08, 3]], 1.4);
      addTone(piano, sr, t0 + 2 * spb, hz(r + 7), 2 * spb + 0.3, 0.12, [[1, 1, 1], [2, 0.45, 1.6], [3, 0.2, 2.4]], 1.4);
    });
    const stems = { piano, drum, ukulele };
    for (const k in stems) normalize(stems[k], 0.7);
    const pan = { piano: -0.35, drum: 0, ukulele: 0.35 }, lvl = { piano: 0.75, drum: 0.95, ukulele: 0.7 };
    const L = new Float32Array(len), R = new Float32Array(len);
    for (const k in stems) {
      const a = (pan[k] + 1) * Math.PI / 4, gl = Math.cos(a) * lvl[k], gr = Math.sin(a) * lvl[k], s = stems[k];
      for (let i = 0; i < len; i++) { L[i] += s[i] * gl; R[i] += s[i] * gr; }
    }
    const peak = Math.max(peakOf(L), peakOf(R)); if (peak > 0.89) { const g = 0.89 / peak; for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; } }
    return { sampleRate: sr, stems, mix: [L, R], seconds: len / sr };
  }
  function peakOf(a) { let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; } return p; }
  function normalize(a, to) { const p = peakOf(a); if (p > 0) { const g = to / p; for (let i = 0; i < a.length; i++) a[i] *= g; } }

  root.MF_RENDER = { render, midiOf, SHAPES, peakOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
