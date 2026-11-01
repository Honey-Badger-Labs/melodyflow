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
  // The app's chord chart (instruments.js) when loaded, else the five Jingle Bells needs.
  const SHAPES = Object.assign({ C: [0, 0, 0, 3], F: [2, 0, 1, 0], G7: [0, 2, 1, 2], Dm: [2, 2, 1, 0], D7: [2, 2, 2, 3] },
    (root.MF && root.MF.INSTRUMENTS && root.MF.INSTRUMENTS.ukulele.shapes) || {});
  /** Left-hand root for a chord name: in octave 2/3, between F2 and E3. */
  const rootOf = (c) => { const m = /^([A-G])([#b]?)/.exec(c || ''); if (!m) return null; const pc = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; return pc >= 5 ? 36 + pc : 48 + pc; };
  const ROOT = new Proxy({}, { get: (_, c) => rootOf(String(c)) });
  /** Everything the ensemble can include, in mix order. */
  const VOICES = [['piano', 'Piano'], ['drum', 'Tongue drum'], ['ukulele', 'Ukulele'], ['harmonica', 'Harmonica'], ['kalimba', 'Kalimba'], ['ocarina', 'Ocarina']];

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

  /** A song's chords as [name|null, beats]; one-per-bar lists are expanded. */
  function chordTimeline(song) {
    const bpb = song.beatsPerBar || 4;
    return (song.chords || []).map((x) => (Array.isArray(x) ? x : [x, bpb]));
  }

  /** opts.include: which of VOICES to render (default piano, drum, ukulele). */
  function render(song, bpm, opts = {}) {
    const sr = opts.sampleRate || 44100, spb = 60 / bpm, bpb = song.beatsPerBar || 4;
    const want = new Set(opts.include || ['piano', 'drum', 'ukulele']);
    const beats = song.notes.reduce((a, [, d]) => a + d, 0), tail = 2.5;
    const len = Math.ceil((beats * spb + tail) * sr);
    const drum = new Float32Array(len), piano = new Float32Array(len), ukulele = new Float32Array(len);
    const harmonica = new Float32Array(len), kalimba = new Float32Array(len), ocarina = new Float32Array(len);
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
      if (want.has('harmonica')) reed(harmonica, sr, t, hz(harpFit(m)), d * spb);
      if (want.has('kalimba')) addTone(kalimba, sr, t, hz(kalFit(m)), 1.6, 0.3, [[1, 1, 1], [5.4, 0.12, 6], [8.9, 0.04, 9]], 2.6);
      if (want.has('ocarina')) vessel(ocarina, sr, t, hz(ocFit(m)), d * spb, rand);
      b += d;
    }
    // Chords on the song's own beat: in 4/4 D on every beat and U on the
    // off-beats after beat 1 (D · DU · DU · D); in 3 or 6, D on every beat.
    // The piano left hand plays the root on each bar's 1 and the fifth half-way.
    let cb = 0;
    for (const [c, dur] of chordTimeline(song)) {
      const frets = c && SHAPES[c], r = c && ROOT[c];
      for (let k = 0; k < dur - 1e-9; k += 0.5) {
        const at = cb + k, inBar = ((at + (song.pickup ? bpb - song.pickup : 0)) % bpb + bpb) % bpb, half = k % 1 !== 0;
        if (frets && (!half || (bpb === 4 && inBar > 1 && inBar !== 3.5))) {
          const dir = half ? 'U' : 'D', order = dir === 'D' ? [0, 1, 2, 3] : [3, 2, 1, 0], g = dir === 'D' ? 0.16 : 0.1;
          order.forEach((s, j) => pluck(ukulele, sr, at * spb + j * 0.012, hz(UKE_OPEN[s] + frets[s]), g, rand, 1.2));
        }
        if (r && !half && (inBar === 0 || k === 0)) addTone(piano, sr, at * spb, hz(r), Math.min(2, bpb / 2) * spb + 0.3, 0.16, [[1, 1, 1], [2, 0.45, 1.6], [3, 0.2, 2.4], [4, 0.08, 3]], 1.4);
        if (r && bpb === 4 && inBar === 2) addTone(piano, sr, at * spb, hz(r + 7), 2 * spb + 0.3, 0.12, [[1, 1, 1], [2, 0.45, 1.6], [3, 0.2, 2.4]], 1.4);
      }
      cb += dur;
    }
    const all = { piano, drum, ukulele, harmonica, kalimba, ocarina }, stems = {};
    for (const [id] of VOICES) if (want.has(id)) stems[id] = all[id];
    if (!chordTimeline(song).some(([c]) => c)) delete stems.ukulele; // melody-only song
    for (const k in stems) normalize(stems[k], 0.7);
    const pan = { piano: -0.35, drum: 0, ukulele: 0.35, harmonica: 0.15, kalimba: -0.15, ocarina: 0.25 }, lvl = { piano: 0.75, drum: 0.95, ukulele: 0.7, harmonica: 0.6, kalimba: 0.7, ocarina: 0.6 };
    const L = new Float32Array(len), R = new Float32Array(len);
    for (const k in stems) {
      const a = (pan[k] + 1) * Math.PI / 4, gl = Math.cos(a) * lvl[k], gr = Math.sin(a) * lvl[k], s = stems[k];
      for (let i = 0; i < len; i++) { L[i] += s[i] * gl; R[i] += s[i] * gr; }
    }
    const peak = Math.max(peakOf(L), peakOf(R)); if (peak > 0.89) { const g = 0.89 / peak; for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; } }
    return { sampleRate: sr, stems, mix: [L, R], seconds: len / sr };
  }
  /* Harmonica: a free reed is a buzzy, sustained tone — a band of harmonics
     with slow attack, gentle vibrato and a breathy edge. Notes a C harp can't
     sound plainly are moved by octaves to one it can (see songlesson.js). */
  function reed(buf, sr, t, f, dur, gain = 0.22) {
    const i0 = Math.floor(t * sr), n = Math.min(buf.length - i0, Math.floor((dur * 0.95 + 0.05) * sr));
    const parts = [[1, 1], [2, 0.7], [3, 0.45], [4, 0.3], [5, 0.18], [6, 0.1], [7, 0.06]];
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / sr, vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * tt) * Math.min(1, tt / 0.3);
      ph += 2 * Math.PI * f * vib / sr;
      let v = 0; for (const [m, a] of parts) v += a * Math.sin(m * ph);
      const env = Math.min(1, tt / 0.04) * (i > n - sr * 0.04 ? (n - i) / (sr * 0.04) : 1);
      buf[i0 + i] += gain * env * v / 2.8;
    }
  }
  const HARP = [60, 62, 64, 67, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 96];
  /** Nearest octave of m that a C harp plays without bends (C4–C7). */
  function harpFit(m) { for (const o of [0, 12, -12, 24]) if (HARP.includes(m + o)) return m + o; return m; }
  /** 17-key C kalimba covers C4–E6, white notes only. */
  function kalFit(m) { let x = m; while (x < 60) x += 12; while (x > 88) x -= 12; return x; }

  /* Ocarina: a Helmholtz vessel flute is almost a pure sine (very weak
     overtones), with a soft breath "chiff" at the start, a little breath
     noise under the tone and slow breath-pressure vibrato. */
  function vessel(buf, sr, t, f, dur, rand, gain = 0.25) {
    const i0 = Math.floor(t * sr), n = Math.min(buf.length - i0, Math.floor((dur * 0.95 + 0.06) * sr));
    let ph = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / sr, vib = 1 + 0.003 * Math.sin(2 * Math.PI * 4.6 * tt) * Math.min(1, tt / 0.35);
      ph += 2 * Math.PI * f * vib / sr;
      lp += 0.08 * ((rand() * 2 - 1) - lp); // soft low-passed breath
      const tone = Math.sin(ph) + 0.06 * Math.sin(2 * ph) + 0.02 * Math.sin(3 * ph);
      const att = Math.min(1, tt / 0.06), rel = i > n - sr * 0.06 ? (n - i) / (sr * 0.06) : 1;
      const chiff = Math.exp(-tt / 0.03) * 0.5;
      buf[i0 + i] += gain * rel * (att * tone * 0.9 + (0.12 + chiff) * lp * 3);
    }
  }
  /** 12-hole Alto C ocarina sounds A4–F6 (see songlesson.js). */
  function ocFit(m) { let x = m; while (x < 69) x += 12; while (x > 89) x -= 12; return x; }

  function peakOf(a) { let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; } return p; }
  function normalize(a, to) { const p = peakOf(a); if (p > 0) { const g = to / p; for (let i = 0; i < a.length; i++) a[i] *= g; } }

  root.MF_RENDER = { render, midiOf, SHAPES, peakOf, VOICES, chordTimeline, harpFit, ocFit, rootOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
