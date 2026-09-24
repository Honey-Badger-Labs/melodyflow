/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — the fretboard.

   Chord charts tell you where the fingers go. They do not tell you the thing
   that actually gates progress: getting from one shape to the next in time.
   The hard part of a ukulele is not finding F, it is arriving at F from C on
   the beat — and which shape is "easiest" is not a property of the chord, it
   is a property of the pair.

   So nothing here is a table of chord pictures. Shapes are searched for on
   the fretboard from the notes the chord is made of, fingerings are chosen
   per transition rather than once and for all, and a progression is solved
   as a path: the cheapest way through all of it, not the cheapest shape at
   each step taken greedily.

   Choosing the fingering per transition is what makes the model agree with
   players. A minor to F keeps a finger on the second fret of the G string,
   and that anchor is most of why the change is easy — but only if A minor
   was fingered with the middle finger, which is a decision about the pair
   and cannot be made while looking at A minor alone.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const MAX_FRET = 7;   // past here is a different instrument for a learner
  const MAX_SPAN = 4;   // what a hand covers without moving

  /**
   * Intervals from the root, and which of them a four-string instrument may
   * drop. The fifth is the note that carries the least information, which is
   * why it is the one that goes when there are more notes than strings.
   */
  const QUALITIES = {
    '':     { intervals: [0, 4, 7],         optional: [7] },
    'm':    { intervals: [0, 3, 7],         optional: [7] },
    '7':    { intervals: [0, 4, 7, 10],     optional: [7] },
    'm7':   { intervals: [0, 3, 7, 10],     optional: [7] },
    'maj7': { intervals: [0, 4, 7, 11],     optional: [7] },
    '6':    { intervals: [0, 4, 7, 9],      optional: [7] },
    'm6':   { intervals: [0, 3, 7, 9],      optional: [7] },
    'dim':  { intervals: [0, 3, 6],         optional: [] },
    'aug':  { intervals: [0, 4, 8],         optional: [] },
    'sus2': { intervals: [0, 2, 7],         optional: [] },
    'sus4': { intervals: [0, 5, 7],         optional: [] },
    '9':    { intervals: [0, 4, 7, 10, 2],  optional: [7, 2] },
  };

  /** "Bbm7" → root B flat, quality m7. Longest suffix wins, so "m" loses to "m7". */
  function parseChord(name) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(String(name).trim());
    if (!m) return null;
    const quality = QUALITIES[m[3]];
    if (!quality) return null;
    const rootPc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    return {
      name: String(name).trim(),
      rootPc,
      tones: quality.intervals.map((i) => (rootPc + i) % 12),
      required: quality.intervals
        .filter((i) => !quality.optional.includes(i))
        .map((i) => (rootPc + i) % 12),
    };
  }

  /* ── finding the shapes ────────────────────────────────────────────────
     Every fret on every string whose note belongs to the chord, then every
     combination of those, then the ones a hand can actually hold.
  */
  function voicings(chord, tuning) {
    const perString = tuning.map((open) => {
      const frets = [];
      for (let f = 0; f <= MAX_FRET; f++) {
        if (chord.tones.includes((open + f) % 12)) frets.push(f);
      }
      return frets;
    });
    if (perString.some((f) => f.length === 0)) return [];

    const out = [];
    const walk = (s, frets) => {
      if (s === tuning.length) {
        const shape = frets.slice();
        if (playable(shape) && complete(shape, chord, tuning)) out.push(shape);
        return;
      }
      for (const f of perString[s]) walk(s + 1, frets.concat(f));
    };
    walk(0, []);
    return out;
  }

  function playable(frets) {
    const held = frets.filter((f) => f > 0);
    if (held.length === 0) return true;
    return Math.max(...held) - Math.min(...held) < MAX_SPAN;
  }

  /** Every note the chord cannot do without has to be sounding somewhere. */
  function complete(frets, chord, tuning) {
    const sounding = new Set(frets.map((f, s) => (tuning[s] + f) % 12));
    return chord.required.every((pc) => sounding.has(pc));
  }

  /* ── putting fingers on it ─────────────────────────────────────────────
     A fingering assigns fingers 1–4 to the held frets. Fingers never cross:
     a higher fret takes a higher-numbered finger. Several notes on the one
     lowest fret are a barre under the index finger, which is the only way a
     hand plays them.
  */
  function fingerings(frets) {
    const held = frets
      .map((fret, string) => ({ string, fret }))
      .filter((p) => p.fret > 0)
      .sort((a, b) => a.fret - b.fret || a.string - b.string);

    if (held.length === 0) return [{ placements: [], barre: false, fingers: 0 }];

    const low = held[0].fret;
    const onLow = held.filter((p) => p.fret === low);
    const barre = onLow.length > 1;

    // Under a barre the index finger is spoken for; the rest take 2, 3, 4 in
    // fret order, and there is only one way to do that.
    if (barre) {
      const rest = held.filter((p) => p.fret > low);
      if (rest.length > 3) return [];
      return [{
        placements: [
          ...onLow.map((p) => ({ ...p, finger: 1 })),
          ...rest.map((p, i) => ({ ...p, finger: i + 2 })),
        ],
        barre: true,
        fingers: 1 + rest.length,
      }];
    }

    // No barre: any increasing run of finger numbers will do, and which one
    // is chosen is exactly the decision that a transition gets to make.
    const out = [];
    const choose = (i, next, placements) => {
      if (i === held.length) {
        out.push({ placements: placements.slice(), barre: false, fingers: held.length });
        return;
      }
      for (let finger = next; finger <= 4 - (held.length - i - 1); finger++) {
        choose(i + 1, finger + 1, placements.concat({ ...held[i], finger }));
      }
    };
    if (held.length <= 4) choose(0, 1, []);
    return out;
  }

  /* ── what a change costs ───────────────────────────────────────────────
     Counted in finger movements, because that is what a learner runs out of
     time for. An open shape costs nothing to hold and everything is measured
     against arriving at it.
  */
  function restCost(shape) {
    if (shape.fingers === 0) return 0;
    const low = Math.min(...shape.placements.map((p) => p.fret));
    // In first position the hand sits at the nut whatever the shape reaches,
    // which is why open-chord fingerings are counted from fret 1 and not from
    // the lowest note held.
    const position = low <= MAX_SPAN ? 1 : low;

    /**
     * One finger per fret: the index takes the first fret of the position,
     * the middle the second, and so on. It is how these shapes are taught and
     * how a hand stays relaxed, and without it nothing distinguishes the four
     * ways to hold a one-finger chord — C came out under the index finger
     * rather than the ring, which is not what anybody plays.
     */
    const awkward = shape.placements.reduce((sum, p) => {
      const want = Math.min(4, Math.max(1, p.fret - position + 1));
      return sum + Math.abs(p.finger - want);
    }, 0);

    return shape.fingers + (shape.barre ? 1.5 : 0) + position * 0.25 + awkward * 0.3;
  }

  /**
   * From one held shape to another.
   *
   * A finger that stays exactly where it is costs nothing and pays a bonus,
   * because it holds the hand in place while the others move — the anchor
   * every teacher points at. A finger that moves costs the reach plus the
   * lifting. Landing costs more than lifting: putting a finger down in the
   * right place is the part that goes wrong.
   */
  function transitionCost(from, to) {
    if (!from || from.fingers === 0) return restCost(to);

    let cost = 0;
    let anchors = 0;
    const at = (shape, finger) => shape.placements.find((p) => p.finger === finger) || null;

    for (let finger = 1; finger <= 4; finger++) {
      const a = at(from, finger);
      const b = at(to, finger);
      if (a && b) {
        if (a.string === b.string && a.fret === b.fret) anchors++;
        else cost += 1 + Math.abs(a.fret - b.fret) + (a.string === b.string ? 0 : 0.5);
      } else if (a && !b) cost += 0.5;
      else if (!a && b) cost += 1.25;
    }

    const pos = (shape) =>
      shape.fingers === 0 ? 0 : Math.min(...shape.placements.map((p) => p.fret));
    cost += Math.abs(pos(from) - pos(to)) * 0.5;
    if (to.barre && !from.barre) cost += 1.5;

    return Math.max(0, cost - anchors * 0.75);
  }

  /* ── the public shape ──────────────────────────────────────────────────*/

  /**
   * Every way to play this chord, each with every sensible fingering.
   *
   * `chart` is the shape a beginner is taught, if there is one. The search
   * finds it every time, but it does not always rank it first, and that is
   * not a bug to tune away: a chart shape is conventional, while `restCost`
   * measures hand effort. E major is the clearest case — everyone learns
   * `4 4 4 2`, and `1 4 0 2` is genuinely easier and sounds the same. So the
   * chart shape is marked and sorted first when one is given, and the caller
   * decides whether it is teaching a beginner or planning a change.
   */
  function shapesFor(name, tuning, chart) {
    const chord = parseChord(name);
    if (!chord) return [];
    const same = (frets) => chart && frets.every((f, i) => f === chart[i]);
    const out = [];
    for (const frets of voicings(chord, tuning)) {
      for (const fingering of fingerings(frets)) {
        out.push({
          chord: chord.name,
          frets,
          ...fingering,
          canonical: Boolean(same(frets)),
          rest: restCost(fingering),
        });
      }
    }
    return out.sort((a, b) => Number(b.canonical) - Number(a.canonical) || a.rest - b.rest);
  }

  /** The shapes for a chord, ordered by how easily each follows what you hold. */
  function shapesAfter(name, from, tuning, chart) {
    return shapesFor(name, tuning, chart)
      .map((shape) => ({ ...shape, cost: transitionCost(from, shape) }))
      .sort((a, b) => a.cost - b.cost);
  }

  /**
   * The cheapest way to play a whole progression.
   *
   * Taking the easiest shape at every step and moving on gets this wrong:
   * a shape that is easy to arrive at can be expensive to leave, and a
   * progression repeats. So it is solved as a shortest path over (shape,
   * fingering) states — the same reason you plan a route rather than turning
   * down whichever road looks widest.
   */
  function easiestPath(names, tuning) {
    const stages = names.map((n) => shapesFor(n, tuning));
    if (stages.some((s) => s.length === 0)) return null;

    let frontier = stages[0].map((shape) => ({ shape, total: restCost(shape), via: null }));

    for (let i = 1; i < stages.length; i++) {
      frontier = stages[i].map((shape) => {
        let best = null;
        for (const node of frontier) {
          const total = node.total + transitionCost(node.shape, shape);
          if (!best || total < best.total) best = { shape, total, via: node };
        }
        return best;
      });
    }

    let end = frontier[0];
    for (const node of frontier) if (node.total < end.total) end = node;

    const path = [];
    for (let node = end; node; node = node.via) path.unshift(node.shape);
    return { shapes: path, total: end.total };
  }

  root.MF_FRETBOARD = {
    QUALITIES, MAX_FRET, MAX_SPAN,
    parseChord, voicings, fingerings, playable,
    restCost, transitionCost,
    shapesFor, shapesAfter, easiestPath,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
