/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — instruments.

   The engine used to be a tongue drum with a songbook attached: one pad per
   beat, one frequency per pad, the drum's layout baked into the sequencer.
   A ukulele breaks both halves of that. A chord is four strings sounding at
   once, so a beat holds more than one pitch; and a strum has a direction, so
   two beats of the same chord are not the same event.

   So an instrument owns three things the engine does not want to know about:
   which tokens exist, what pitches a token sounds, and how a token is voiced.
   Everything else — notation, timing, the practice loop, "did they play the
   right thing" — is shared, and shared is the point: the drum's guided
   practice becomes the ukulele's without being written twice.

   Loaded as a plain script by index.html and imported by the tests, so it
   runs in a browser and in node with no build step either side.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const A4 = 440;
  const midiToHz = (m) => A4 * Math.pow(2, (m - 69) / 12);

  /* ── notation ──────────────────────────────────────────────────────────
     One grammar for every instrument. A token, optionally an articulation
     after "/", optionally a length after "*".

         3          pad 3, or the chord named 3, for one beat
         C*2        two beats
         C/u*.5     half a beat, strummed upward
         F/x        a chuck — struck and damped
         0          a rest
         |          a bar line

     The instrument supplies the vocabulary; the grammar never varies. That
     is what lets one editor, one sequencer and one practice loop serve both.
  */
  function parseNotation(str) {
    return String(str)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((raw) => {
        if (raw === '|') return { bar: true };

        let tok = raw;
        let dur = 1;
        let art = null;

        const star = tok.indexOf('*');
        if (star >= 0) {
          const n = parseFloat(tok.slice(star + 1));
          if (n > 0) dur = n;
          tok = tok.slice(0, star);
        }

        const slash = tok.indexOf('/');
        if (slash >= 0) {
          art = tok.slice(slash + 1) || null;
          tok = tok.slice(0, slash);
        }

        if (tok === '0' || tok === '') return { rest: true, dur };
        return { tok, dur, art };
      });
  }

  /**
   * Back to the written form, so an edited line can be saved as text.
   *
   * Lengths keep the songbook's spelling — `*.5`, not `*0.5` — because a
   * round trip through the editor should not rewrite every half-beat in the
   * book into a form its author did not use.
   */
  function writeNotation(events) {
    return events
      .map((e) => {
        if (e.bar) return '|';
        const head = e.rest ? '0' : e.tok + (e.art ? '/' + e.art : '');
        return head + (e.dur === 1 ? '' : '*' + String(e.dur).replace(/^0\./, '.'));
      })
      .join(' ');
  }

  /* ── the tongue drum ───────────────────────────────────────────────────
     Numbers as engraved on the shell. A dot under a number is the low
     octave, a dot over it the high one.
  */
  const DEGREE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
  const DRUM_ORDER = ['5.', '6.', '7.', '1', '2', '3', '4', '5', '6', '7', '.1', '.2', '.3'];
  const DRUM_RING = ['6.', '.2', '7', '1', '5', '3', '7.', '4', '6', '2', '.1', '.3'];
  const DRUM_PENT = ['5.', '6.', '1', '2', '3', '5', '6', '.1', '.2', '.3'];
  const DRUM_NAMES = {
    '5.': 'G3', '6.': 'A3', '7.': 'B3', 1: 'C4', 2: 'D4', 3: 'E4', 4: 'F4',
    5: 'G4', 6: 'A4', 7: 'B4', '.1': 'C5', '.2': 'D5', '.3': 'E5',
  };

  function padParts(p) {
    const s = String(p);
    return { num: s.replace(/\./g, ''), up: s[0] === '.', dn: s[s.length - 1] === '.' };
  }

  function padHz(p) {
    const q = padParts(p);
    const degree = DEGREE[+q.num];
    if (degree === undefined) return null;
    return 261.6256 * Math.pow(2, (degree + (q.up ? 12 : 0) + (q.dn ? -12 : 0)) / 12);
  }

  const drum = {
    id: 'drum',
    name: 'Tongue drum',
    geometry: 'wheel',
    tokens: DRUM_ORDER,
    ring: DRUM_RING,
    pentatonic: DRUM_PENT,
    /** A struck pad is one pitch. The simultaneity is the ukulele's problem. */
    pitches(tok) {
      const f = padHz(tok);
      return f === null ? [] : [f];
    },
    label: (tok) => String(tok),
    noteName: (tok) => DRUM_NAMES[tok] || '',
    /** Struck, so every note rings the same way. Nothing to articulate. */
    articulations: [],
    voice: { partials: [[1, 1], [2.02, 0.3], [3.01, 0.1], [5.43, 0.035]], spreadMs: 0, ring: 1.6 },
  };

  /* ── the ukulele ───────────────────────────────────────────────────────
     Soprano tuning, re-entrant: the G string is the high one, which is why
     these shapes sound the way they do and why the pitch list is not sorted.
     Strings run G C E A, and a shape is the fret held on each.
  */
  const UKE_OPEN = [67, 60, 64, 69]; // G4 C4 E4 A4
  const UKE_SHAPES = {
    C: [0, 0, 0, 3],
    C7: [0, 0, 0, 1],
    Cm: [0, 3, 3, 3],
    D: [2, 2, 2, 0],
    D7: [2, 2, 2, 3],
    Dm: [2, 2, 1, 0],
    E: [4, 4, 4, 2],
    E7: [1, 2, 0, 2],
    Em: [0, 4, 3, 2],
    F: [2, 0, 1, 0],
    G: [0, 2, 3, 2],
    G7: [0, 2, 1, 2],
    Gm: [0, 2, 3, 1],
    A: [2, 1, 0, 0],
    A7: [0, 1, 0, 0],
    Am: [2, 0, 0, 0],
    Bb: [3, 2, 1, 1],
    B7: [2, 3, 2, 2],
    Bm: [4, 2, 2, 2],
  };

  const ukulele = {
    id: 'ukulele',
    name: 'Ukulele',
    geometry: 'fretboard',
    strings: UKE_OPEN,
    shapes: UKE_SHAPES,
    tokens: Object.keys(UKE_SHAPES),
    /** Four strings at once — the reason a beat can no longer hold one pitch. */
    pitches(tok) {
      const shape = UKE_SHAPES[tok];
      if (!shape) return [];
      return shape.map((fret, s) => midiToHz(UKE_OPEN[s] + fret));
    },
    /** Which fret each string is held at, for the diagram. */
    shape: (tok) => UKE_SHAPES[tok] || null,
    label: (tok) => String(tok),
    noteName: (tok) => (UKE_SHAPES[tok] ? tok + ' chord' : ''),
    /**
     * Down, up, and the chuck. A strum is the same four pitches with the
     * onsets fanned out, so direction is a property of the beat rather than
     * of the chord — which is why it lives on the event and not the token.
     */
    articulations: ['d', 'u', 'x'],
    voice: { partials: [[1, 1], [2, 0.22], [3, 0.08]], spreadMs: 22, ring: 1.1 },

    /**
     * Where to put the fingers, and what it costs to get there from what you
     * are already holding. Looked up when asked rather than held as a
     * reference, so fretboard.js may load in either order or not at all — the
     * audio and the songbook do not need it.
     */
    shapesFor(name) {
      const fb = root.MF_FRETBOARD;
      return fb ? fb.shapesFor(name, UKE_OPEN, UKE_SHAPES[name]) : [];
    },
    shapesAfter(name, from) {
      const fb = root.MF_FRETBOARD;
      return fb ? fb.shapesAfter(name, from, UKE_OPEN, UKE_SHAPES[name]) : [];
    },
    easiestPath(names) {
      const fb = root.MF_FRETBOARD;
      return fb ? fb.easiestPath(names, UKE_OPEN) : null;
    },
  };

  const INSTRUMENTS = { drum, ukulele };

  /**
   * How a beat is sounded: a pitch and when it starts, relative to the beat.
   *
   * One list covers a struck pad (one entry, no offset), a down-strum (four,
   * fanned low to high) and an up-strum (the same four, fanned the other
   * way). The sequencer schedules what it is given and stays ignorant.
   */
  function strikes(instrument, event) {
    if (!event || event.bar || event.rest) return [];
    const pitches = instrument.pitches(event.tok);
    if (!pitches.length) return [];

    const spread = instrument.voice.spreadMs || 0;
    const chuck = event.art === 'x';
    const order = event.art === 'u' ? pitches.slice().reverse() : pitches;

    return order.map((hz, i) => ({
      hz,
      atMs: spread * i,
      /** A chuck is struck and immediately damped, so it is short and quiet. */
      ring: chuck ? 0.12 : instrument.voice.ring,
      gain: chuck ? 0.5 : 1,
    }));
  }

  /**
   * Did the learner play the right thing?
   *
   * Token equality for both instruments, which is the whole reason tokens are
   * symbolic rather than a list of frequencies: the drum asks "was that the
   * lit pad", the ukulele asks "was that the shape on the chart", and the
   * guided practice loop asks neither — it asks this.
   */
  function matches(instrument, played, expected) {
    if (!expected || expected.bar || expected.rest) return false;
    return String(played) === String(expected.tok);
  }

  /** Every playable event in order, bar lines dropped. */
  function playable(events) {
    return events.filter((e) => !e.bar);
  }

  root.MF = {
    midiToHz,
    parseNotation,
    writeNotation,
    strikes,
    matches,
    playable,
    INSTRUMENTS,
    instrument: (id) => INSTRUMENTS[id] || INSTRUMENTS.drum,
    // The drum's own theory, still needed by the pad wheel and the editor.
    DEGREE, DRUM_ORDER, DRUM_RING, DRUM_PENT, DRUM_NAMES, padParts, padHz,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
