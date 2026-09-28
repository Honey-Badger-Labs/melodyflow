/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — listening.

   The microphone, turned into the two things the practice loop asks: which
   pad was that, and which chord was that. Everything here is arithmetic on
   arrays of samples — no microphone, no audio graph, no clock — so the whole
   of it runs in node against tones the tests make up.

   Three pieces:

     a note     YIN, the pitch detector most tuners use: find the lag at which
                the sound best repeats itself. A tongue drum is a clean, bell-
                like tone, which is the easy case for it.
     a chord    a strum is four strings at once, so there is no one pitch to
                find. Instead, how much of each of the twelve notes is in the
                sound (a chroma vector), compared against what each chord
                should contain. Only the chords of the song being played are
                candidates, which is what makes it reliable on a phone.
     a strike   a note repeated is still two notes, so pitch alone cannot say
                when one starts. The loudness jumping is what does.

   And for Capture: a run of heard notes, turned into lengths in beats.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

  /** Loudness of a stretch of samples. */
  function rms(buf, start, end) {
    const a = Math.max(0, start || 0);
    const b = Math.min(buf.length, end === undefined ? buf.length : end);
    let s = 0;
    for (let i = a; i < b; i++) s += buf[i] * buf[i];
    return b > a ? Math.sqrt(s / (b - a)) : 0;
  }

  /**
   * The pitch of a stretch of sound, or null if it has none.
   *
   * YIN (de Cheveigné and Kawahara, 2002): for each lag, how different the
   * sound is from itself shifted by that much, normalised so that the first
   * lag where it dips under a threshold is the period. `clarity` is how deep
   * that dip is — 1 for a pure tone, near 0 for noise.
   */
  function yin(buf, sampleRate, opts) {
    const o = opts || {};
    const minHz = o.minHz || 70;
    const maxHz = o.maxHz || 1500;
    const threshold = o.threshold || 0.15;
    const n = buf.length;
    const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
    const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
    const w = n - maxLag;
    if (w < 32) return null;

    const d = new Float64Array(maxLag + 1);
    for (let tau = 1; tau <= maxLag; tau++) {
      let s = 0;
      for (let i = 0; i < w; i++) {
        const x = buf[i] - buf[i + tau];
        s += x * x;
      }
      d[tau] = s;
    }
    const c = new Float64Array(maxLag + 1);
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      run += d[tau];
      c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }

    let tau = -1;
    for (let t = minLag; t <= maxLag; t++) {
      if (c[t] < threshold) {
        while (t + 1 <= maxLag && c[t + 1] < c[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let best = minLag;
      for (let t = minLag; t <= maxLag; t++) if (c[t] < c[best]) best = t;
      if (c[best] > 0.35) return null;
      tau = best;
    }

    // Between two samples, the true period: a parabola through the dip.
    let x = tau;
    if (tau > 1 && tau < maxLag) {
      const a = c[tau - 1];
      const b = c[tau];
      const e = c[tau + 1];
      const den = a + e - 2 * b;
      if (den !== 0) x = tau + (a - e) / (2 * den);
    }
    return { hz: sampleRate / x, clarity: Math.max(0, Math.min(1, 1 - c[tau])) };
  }

  /** How far one pitch is from another, in hundredths of a semitone. */
  const cents = (hz, ref) => 1200 * Math.log2(hz / ref);

  /** The name of the note nearest a pitch, for showing what was heard. */
  function noteName(hz) {
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  /**
   * The pad nearest a pitch.
   *
   * `fold` moves a pitch by octaves into the drum's range first — for Capture,
   * where someone may hum an octave below the drum and still mean the tune.
   * `snapped` says it had to. Anything further than `tolerance` cents from
   * every pad is not a pad at all, and comes back null.
   */
  function nearestPad(hz, opts) {
    const o = opts || {};
    const MF = root.MF;
    const tokens = o.tokens || MF.DRUM_ORDER;
    const freqs = tokens.map((t) => MF.padHz(t));
    const low = Math.min(...freqs);
    const high = Math.max(...freqs);
    let f = hz;
    let snapped = false;
    if (o.fold) {
      while (f < low * 0.97) { f *= 2; snapped = true; }
      while (f > high * 1.03) { f /= 2; snapped = true; }
    }
    let best = null;
    tokens.forEach((tok, i) => {
      const c = cents(f, freqs[i]);
      if (!best || Math.abs(c) < Math.abs(best.cents)) best = { tok, cents: c };
    });
    const tolerance = o.tolerance === undefined ? 50 : o.tolerance;
    if (!best || Math.abs(best.cents) > tolerance) return null;
    return { tok: best.tok, cents: Math.round(best.cents), snapped };
  }

  /** Two pads that are the same note in different octaves: 1 and .1. */
  function sameNote(a, b) {
    const MF = root.MF;
    const fa = MF.padHz(a);
    const fb = MF.padHz(b);
    if (!fa || !fb) return false;
    const semis = Math.round(12 * Math.log2(fa / fb));
    return semis % 12 === 0;
  }

  /* ── chords ─────────────────────────────────────────────────────────── */

  /** In-place radix-2 FFT. Length must be a power of two. */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k;
          const b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  /**
   * How much of each of the twelve notes is in a sound, C first, scaled so
   * the strongest is 1. Octaves are folded together: that is the point.
   */
  function chroma(buf, sampleRate, opts) {
    const o = opts || {};
    let n = 1;
    while (n * 2 <= buf.length) n *= 2;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const off = buf.length - n;
    for (let i = 0; i < n; i++) re[i] = buf[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    fft(re, im);
    const out = new Float64Array(12);
    const lo = o.minHz || 180;
    const hi = o.maxHz || 2200;
    for (let k = 1; k < n / 2; k++) {
      const f = (k * sampleRate) / n;
      if (f < lo || f > hi) continue;
      const midi = 69 + 12 * Math.log2(f / 440);
      const near = Math.round(midi);
      // Energy between two notes belongs to neither.
      if (Math.abs(midi - near) > 0.35) continue;
      out[((near % 12) + 12) % 12] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    const max = Math.max(...out);
    if (max > 0) for (let i = 0; i < 12; i++) out[i] /= max;
    return out;
  }

  /** The twelve notes a ukulele chord sounds, from its shape. */
  function chordTemplate(name) {
    const MF = root.MF;
    const t = new Float64Array(12);
    for (const hz of MF.instrument('ukulele').pitches(name)) {
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      t[((midi % 12) + 12) % 12] = 1;
    }
    return t;
  }

  function cosine(a, b) {
    let ab = 0;
    let aa = 0;
    let bb = 0;
    for (let i = 0; i < 12; i++) {
      ab += a[i] * b[i];
      aa += a[i] * a[i];
      bb += b[i] * b[i];
    }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  }

  /**
   * Which of these chords a chroma vector sounds most like, and by how much
   * over the next best. The candidates are the song's own chords: telling C
   * from F is easy, telling C from any of nineteen shapes is not.
   */
  function pickChord(ch, names) {
    const scores = [...new Set(names)]
      .map((name) => ({ name, score: cosine(ch, chordTemplate(name)) }))
      .sort((a, b) => b.score - a.score);
    if (!scores.length) return null;
    return { name: scores[0].name, score: scores[0].score, margin: scores[0].score - (scores[1] ? scores[1].score : 0), scores };
  }

  /* ── strikes ────────────────────────────────────────────────────────── */

  /**
   * When a note starts. Fed one loudness reading at a time; says yes when the
   * sound jumps well above everything in the last three readings and above
   * the room's floor. A drum still ringing from the last note is quieter than
   * a new strike, so a repeated note is heard twice.
   *
   * Above the loudest recent reading, not the quietest: phones drop the odd
   * block of audio, and one reading that dips and recovers is not a note
   * ending — measured against the dip, the recovery looked like a new strike.
   */
  function onsets(opts) {
    const o = opts || {};
    const minRms = o.minRms || 0.01;
    const ratio = o.ratio || 1.8;
    const gapMs = o.gapMs || 110;
    let floor = o.floor || 0.003;
    let last = -Infinity;
    const recent = [];
    return {
      push(level, tMs) {
        const before = recent.length ? Math.max(...recent) : level;
        recent.push(level);
        if (recent.length > 3) recent.shift();
        const hit = level > Math.max(minRms, floor * 3) && level > before * ratio && tMs - last >= gapMs;
        if (hit) last = tMs;
        // The floor follows quiet quickly and noise slowly.
        floor = level < floor ? Math.max(0.0005, level) : floor * 1.01;
        return hit;
      },
      get floor() { return floor; },
    };
  }

  /* ── capture ────────────────────────────────────────────────────────── */

  /**
   * Heard notes, as the book writes them.
   *
   * The beat is the typical gap between notes — most of a tune moves in its
   * basic pulse — and every note is as long as the gap after it, in half
   * beats. The last note has no gap after it and is given one beat. A pulse
   * faster than 150 or slower than 50 is taken to be a half or double beat.
   */
  function quantize(events) {
    const ev = (events || []).slice().sort((a, b) => a.t - b.t);
    if (!ev.length) return { bpm: 0, notes: [] };
    const gaps = [];
    for (let i = 1; i < ev.length; i++) gaps.push(ev[i].t - ev[i - 1].t);
    // The middle gap finds the pulse; the gaps near it, averaged, time it —
    // one note played a little late should not set the tempo.
    const mid = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 600;
    const near = gaps.filter((g) => Math.abs(g / mid - 1) < 0.25);
    let beat = near.length ? near.reduce((a, b) => a + b, 0) / near.length : mid;
    while (60000 / beat > 150) beat *= 2;
    while (60000 / beat < 50) beat /= 2;
    const notes = ev.map((e, i) => {
      const gap = i < gaps.length ? gaps[i] : beat;
      const dur = Math.min(4, Math.max(0.5, Math.round((gap / beat) * 2) / 2));
      return Object.assign({}, e, { dur });
    });
    return { bpm: Math.round(60000 / beat), notes };
  }

  root.MF_LISTEN = { rms, yin, cents, noteName, nearestPad, sameNote, fft, chroma, chordTemplate, pickChord, onsets, quantize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
