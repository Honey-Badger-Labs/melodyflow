/* MelodyFlow — any Songbook song as a Learn lesson or a Record backing.
   The book is written in drum pad numbers (instruments.js DRUM_NAMES gives
   each pad its pitch), with chords in the same notation. This turns that into
   the [note, beats] lists Learn and Record use. Nothing is added: the notes
   are the book's own, the chords are the book's own, and a song with no chord
   line is melody-only.

   Also here: where a note sits on two extra instruments.
     harmonica  10-hole diatonic (Richter) in C. Blow C4 E4 G4 C5 E5 G5 C6 E6 G6 C7,
                draw D4 G4 B4 D5 F5 A5 B5 D6 F6 A6. Tab: "4" = blow hole 4,
                "-4" = draw hole 4. Anything else needs a bend or overblow, or is
                below the harp — flagged, never faked.
     kalimba    17-key in C, C4–E6, tines laid out from the middle outwards
                (left to right: D6 B5 G5 E5 C5 A4 F4 D4 C4 E4 G4 B4 D5 F5 A5 C6 E6). */
(function (root) {
  'use strict';
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (n) => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(n)); return m ? 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : null; };
  const PADS = {
    '5.': 'G3', '6.': 'A3', '7.': 'B3', 1: 'C4', 2: 'D4', 3: 'E4', 4: 'F4',
    5: 'G4', 6: 'A4', 7: 'B4', '.1': 'C5', '.2': 'D5', '.3': 'E5',
  };

  function events(v) {
    if (!v) return [];
    if (typeof v === 'string') return root.MF.parseNotation(v);
    return v.map((e) => (e.pad !== undefined ? { ...e, tok: e.pad } : e));
  }

  /** A Songbook song → { notes:[[name,beats]], chords:[[name|null,beats]], ... }.
      A melody rest lengthens the note before it (Learn shows notes, not rests). */
  function fromSong(song) {
    const notes = [], chords = [];
    let melodyOnly = true;
    for (const line of song.lines || []) {
      for (const e of events(line.notes)) {
        if (e.bar) continue;
        const pads = (root.MF && root.MF.DRUM_NAMES) || PADS;
        if (e.rest) { if (notes.length) notes[notes.length - 1][1] += e.dur; continue; }
        const name = pads[e.tok];
        if (name) notes.push([name, e.dur]);
      }
      const ch = events(line.chords);
      if (ch.length) melodyOnly = false;
      for (const e of ch) if (!e.bar) chords.push([e.rest ? null : e.tok, e.dur]);
    }
    const bpb = parseInt(song.meter, 10) || 4;
    return {
      id: song.id, title: song.title, tempo: song.bpm || 84, bpm: song.bpm || 84,
      meter: song.meter || '4/4', beatsPerBar: bpb, pickup: song.pickup || 0,
      notes, chords: melodyOnly ? [] : chords, melodyOnly,
      tip: melodyOnly ? 'This song has no chord line in the Songbook, so it is melody-only.' : `${song.meter || '4/4'} at ${song.bpm || 84} BPM, from the Songbook.`,
    };
  }

  const HARP_BLOW = ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].map(midi);
  const HARP_DRAW = ['D4', 'G4', 'B4', 'D5', 'F5', 'A5', 'B5', 'D6', 'F6', 'A6'].map(midi);

  /** Hole and breath for a note on a C harp, or null. G4 is blow 3 (draw 2 also works). */
  function harpHole(name) {
    const m = midi(name); if (m === null) return null;
    let h = HARP_BLOW.indexOf(m);
    if (h >= 0) return { hole: h + 1, dir: 'blow', tab: String(h + 1), text: `Hole ${h + 1}, blow` };
    h = HARP_DRAW.indexOf(m);
    if (h >= 0) return { hole: h + 1, dir: 'draw', tab: '-' + (h + 1), text: `Hole ${h + 1}, draw` };
    return null;
  }
  /** Why a C harp can't play it plainly. */
  function harpProblem(name) {
    const m = midi(name); if (m === null) return 'not a note';
    if (harpHole(name)) return null;
    if (m < HARP_BLOW[0]) return 'below a C harp (lowest is C4)';
    if (m > HARP_BLOW[9]) return 'above a C harp (highest is C7)';
    return 'needs a bend or overblow on a C harp';
  }

  const KALIMBA_LAYOUT = ['D6', 'B5', 'G5', 'E5', 'C5', 'A4', 'F4', 'D4', 'C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5', 'C6', 'E6'];
  const DEG = { C: 1, D: 2, E: 3, F: 4, G: 5, A: 6, B: 7 };
  /** Kalimba number notation: 1–7 from C4, a dot over (°) per octave up. */
  function kalimbaTine(name) {
    const k = KALIMBA_LAYOUT.indexOf(name); if (k < 0) return null;
    const oct = +name.slice(-1) - 4, num = DEG[name[0]];
    return { index: k, num: num + '°'.repeat(oct), text: `Tine ${num}${'°'.repeat(oct)} (${name})` };
  }

  /* Ocarina: 12-hole Alto C (sweet-potato), sounding A4–F6.
     Fingerings from the "Fingering Diagram for 12-hole Ocarina" chart at
     https://sound.jp/suimin/fingering_e.htm (cross-checked against
     https://playsoloist.com/ocarina/finger-chart). Notation there:
     LEFT "T-1234" RIGHT "T-1234" — thumb hole, then index→pinky; ":" after a
     right-hand hole = the sub-hole beside it closed too. X closed, O open.
     Stored here as 12 booleans (true = cover), in OC_HOLES order. */
  const OC_HOLES = ['LT', 'L1', 'L2', 'L3', 'L4', 'RT', 'R1', 'R2', 'R3', 'R4', 'SA', 'SB'];
  const OC_CHART = [ // midi → chart string, low A (69) to high F (89)
    'X-XXXX X-X:X:XX', 'X-XXXX X-X:XXX', 'X-XXXX X-XX:XX', 'X-XXXX X-XXXX', 'X-XXXX X-XX:XO',
    'X-XXXX X-XXXO', 'X-XXXX X-XXOX', 'X-XXXX X-XXOO', 'X-XXXX X-XOOO', 'X-XXXX X-OOXO',
    'X-XXXX X-OOOO', 'X-XXOX X-OOXO', 'X-XXOX X-OOOO', 'X-XOOX X-OOXO', 'X-XOOX X-OOOO',
    'X-OOOX X-OOOO', 'O-OOOX X-OOXO', 'O-OOOX X-OOOO', 'O-OOOO X-OOOO', 'O-OOOX O-OOOO', 'O-OOOO O-OOOO'];
  const OC_LO = 69, OC_HI = 89;
  function ocChart(str) {
    const [l, r] = str.split(' '), c = (ch) => ch === 'X' || ch === ':';
    const L = l.replace('-', ''), fing = [], subs = [];
    const R = r.replace('-', '');
    for (let i = 0; i < R.length; i++) { if (R[i] === ':') { subs[fing.length - 1] = true; continue; } fing.push(c(R[i])); }
    // fing = [RT, R1, R2, R3, R4]; on that chart ':' follows R1 (sub-hole SA) or R2 (SB)
    return [c(L[0]), c(L[1]), c(L[2]), c(L[3]), c(L[4]), ...fing, !!subs[1], !!subs[2]];
  }
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  /** Where a note sits on the ocarina, or null if outside A4–F6. */
  function ocarinaHole(name) {
    const m = midi(name); if (m == null || m < OC_LO || m > OC_HI) return null;
    const cover = ocChart(OC_CHART[m - OC_LO]), n = cover.filter(Boolean).length;
    return { cover, chart: OC_CHART[m - OC_LO], tab: `${n}●`, text: `Ocarina ${NAMES[m % 12]}${Math.floor(m / 12) - 1}: cover ${n} of 12` };
  }
  /** Why a note can't be played as written on the ocarina (null if it can). */
  function ocarinaProblem(name) {
    const m = midi(name); if (m == null) return 'not a note';
    return m < OC_LO ? 'below low A' : m > OC_HI ? 'above high F' : null;
  }
  /** Nearest octave of midi m inside the ocarina's range. */
  function ocFit(m) { let x = m; while (x < OC_LO) x += 12; while (x > OC_HI) x -= 12; return x < OC_LO ? m : x; }

  root.MF_SONGLESSON = { ocarinaHole, ocarinaProblem, ocFit, OC_HOLES, OC_CHART, OC_LO, OC_HI, fromSong, harpHole, harpProblem, kalimbaTine, KALIMBA_LAYOUT, HARP_BLOW, HARP_DRAW, midi };
})(typeof globalThis !== 'undefined' ? globalThis : this);
