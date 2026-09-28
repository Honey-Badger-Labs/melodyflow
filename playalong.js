/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — the play-along.

   A song is a melody with a chord line under each lyric line. The drum plays
   the melody; the ukulele plays the chords. This works out where every chord,
   every strum and every melody note falls in time, so one clock can drive
   both instruments and the screen can say "C now, F in two beats".

   The melody is the authority on time. Each lyric line starts where the one
   before it ended in the melody, and its chords are laid from there. A chord
   line that does not add up to its melody line is reported rather than
   quietly stretched, because a chord arriving a beat early is exactly the
   mistake a learner would copy.

   Songs that start on an upbeat — "Hap-py" before the first bar — say so with
   `pickup`, the number of beats before the first downbeat. Strums follow the
   bar, not the line, so the pattern lands on the downbeat where a player's
   hand would.

   No DOM, no audio, no clock. Times are in beats; the app turns them into
   milliseconds.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const EPS = 1e-6;

  /**
   * Strums, as [offset in beats from the downbeat, direction].
   *
   * Two per meter, because there are two stages to learning one: every beat
   * down until the changes are in time, then a pattern with some upstrokes
   * once the left hand can be trusted. The 4/4 pattern is the "island" strum,
   * D - D U - U D U, that most of the ukulele is played with.
   */
  const PATTERNS = {
    3: {
      downs: { name: 'Downs', strokes: [[0, 'd'], [1, 'd'], [2, 'd']] },
      pattern: { name: 'D D U D U', strokes: [[0, 'd'], [1, 'd'], [1.5, 'u'], [2, 'd'], [2.5, 'u']] },
    },
    4: {
      downs: { name: 'Downs', strokes: [[0, 'd'], [1, 'd'], [2, 'd'], [3, 'd']] },
      pattern: { name: 'D - D U - U D U', strokes: [[0, 'd'], [1, 'd'], [1.5, 'u'], [2.5, 'u'], [3, 'd'], [3.5, 'u']] },
    },
  };

  function meterBeats(meter) {
    const n = parseInt(String(meter || '4/4'), 10);
    return n > 0 ? n : 4;
  }

  function patternFor(meter, style) {
    const m = meterBeats(meter);
    const set = PATTERNS[m] || {
      downs: { name: 'Downs', strokes: Array.from({ length: m }, (_, i) => [i, 'd']) },
    };
    return set[style] || set.downs;
  }

  /** How long a line of events lasts. Bar lines take no time. */
  function beats(events) {
    return (events || []).reduce((sum, e) => (e.bar ? sum : sum + (e.dur || 1)), 0);
  }

  /** The token an event plays: the drum's views call it a pad, the model a tok. */
  const tokOf = (e) => (e.pad !== undefined ? e.pad : e.tok);

  /** The label under a beat in a bar: 1 & 2 & 3 &. */
  function countLabel(offset) {
    const whole = Math.floor(offset + EPS);
    return Math.abs(offset - whole) < EPS ? String(whole + 1) : '&';
  }

  /**
   * Everything that happens in a song, in beats from the first note.
   *
   *   lines     where each lyric line starts and how long it is
   *   melody    the notes, rests left out but their time kept
   *   chords    each chord held, and for how long
   *   strokes   each strum: when, which way, and which chord
   *   beats     every beat, with the downbeats marked, for a click track
   *   groups    the chords as a player changes them: repeats merged
   *   problems  lines whose chords do not add up to their melody
   */
  function plan(song, opts) {
    const o = opts || {};
    const m = meterBeats(song.meter);
    const pickup = Math.max(0, Math.min(m - EPS, song.pickup || 0));
    // Where bar 1's downbeat sits: the pickup comes before it.
    const firstDown = pickup;

    const lines = [];
    const melody = [];
    const chords = [];
    const problems = [];
    let t = 0;

    (song.lines || []).forEach((line, li) => {
      const notes = line.notes || [];
      const len = beats(notes);
      lines.push({ li, t, dur: len });

      let at = t;
      notes.forEach((e, idx) => {
        if (e.bar) return;
        const dur = e.dur || 1;
        if (!e.rest) melody.push({ t: at, dur, tok: tokOf(e), li, idx });
        at += dur;
      });

      if (line.chords && line.chords.length) {
        const clen = beats(line.chords);
        if (Math.abs(clen - len) > EPS) problems.push({ li, melody: len, chords: clen });
        let ct = t;
        line.chords.forEach((e, idx) => {
          if (e.bar) return;
          const dur = e.dur || 1;
          if (!e.rest) chords.push({ t: ct, dur, chord: tokOf(e), li, idx });
          ct += dur;
        });
      }
      t += len;
    });

    const total = t;
    const pattern = patternFor(song.meter, o.strum);

    // Strums follow the bar. Walk every bar that touches the song, starting
    // from the one the pickup sits in.
    const strokes = [];
    const firstBar = firstDown - Math.ceil((firstDown - EPS) / m) * m;
    for (let bar = firstBar; bar < total - EPS; bar += m) {
      for (const [off, art] of pattern.strokes) {
        const st = bar + off;
        if (st < -EPS || st > total - EPS) continue;
        const ci = chordAt(chords, st);
        if (ci < 0) continue;
        strokes.push({ t: st, chord: chords[ci].chord, art, ci, bar, off });
      }
    }
    strokes.forEach((s, i) => {
      const end = chords[s.ci].t + chords[s.ci].dur;
      const next = strokes[i + 1] ? strokes[i + 1].t : Infinity;
      s.dur = Math.min(end, next) - s.t;
    });

    const clicks = [];
    for (let bar = firstBar; bar < total - EPS; bar += m) {
      for (let b = 0; b < m; b++) {
        const bt = bar + b;
        if (bt < -EPS || bt > total - EPS) continue;
        clicks.push({ t: bt, down: b === 0 });
      }
    }

    // The chords as a hand changes them. C for three bars is one C.
    const groups = [];
    const groupOf = chords.map((c, ci) => {
      const last = groups[groups.length - 1];
      if (last && last.chord === c.chord && Math.abs(last.end - c.t) < EPS) {
        last.end = c.t + c.dur;
        last.last = ci;
      } else {
        groups.push({ chord: c.chord, t: c.t, end: c.t + c.dur, first: ci, last: ci });
      }
      return groups.length - 1;
    });

    return { meter: m, pickup, firstBar, total, pattern, lines, melody, chords, strokes, clicks, groups, groupOf, problems };
  }

  /** The chord sounding at a moment, or -1 over a rest. */
  function chordAt(chords, t) {
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      if (t >= c.t - EPS && t < c.t + c.dur - EPS) return i;
    }
    return -1;
  }

  /** The last item that has started by beat t, or -1 if none has. */
  function at(list, t) {
    let found = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].t <= t + EPS) found = i;
      else break;
    }
    return found;
  }

  /** Where the next change of chord is from a given moment, in beats. */
  function nextChange(p, t) {
    const i = p.groups.findIndex((g) => g.t > t + EPS);
    return i < 0 ? null : { group: i, chord: p.groups[i].chord, t: p.groups[i].t, in: p.groups[i].t - t };
  }

  /** The bar a moment falls in, as its downbeat. */
  function barOf(p, t) {
    return p.firstBar + Math.floor((t - p.firstBar + EPS) / p.meter) * p.meter;
  }

  root.MF_PLAYALONG = { PATTERNS, meterBeats, patternFor, beats, countLabel, plan, chordAt, at, nextChange, barOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
