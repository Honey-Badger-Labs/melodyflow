/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — ukulele tablature.

   The drum is easy to follow because the number on the screen is the number
   on the pad. Tab does the same for the ukulele: four lines, one per string,
   and on the line a number — the fret to press. 0 is the open string.

   Written as players read it: the top line is the A string (nearest the
   floor), then E, C, and G at the bottom. Standard soprano/concert tuning,
   re-entrant: G4 C4 E4 A4.

   Each note goes to the lowest fret it can be played at — the first-position
   choice a beginner makes, and the one that keeps the hand by the nut. A
   note below the uke's lowest string (C4) is lifted an octave and says so;
   the drum's three lowest pads (5. 6. 7.) are the only ones that need it.

   No DOM, no state. Notes in, columns and markup out.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /** Strings as tuned, G side first — the same order as the chord shapes. */
  const OPEN = [67, 60, 64, 69];          // G4 C4 E4 A4
  const NAMES = ['G', 'C', 'E', 'A'];
  /** Top to bottom on the page: A E C G. */
  const ROWS = [3, 2, 1, 0];
  const MAX_FRET = 12;
  const LOWEST = Math.min(...OPEN);
  const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  const hzToMidi = (f) => Math.round(69 + 12 * Math.log2(f / 440));
  const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  /**
   * Where a pitch is played: the string and fret with the lowest fret.
   * Strings are all different pitches, so two strings never tie on a fret.
   * Returns null for a pitch above the twelfth fret of the A string.
   */
  function place(midi) {
    let m = midi, shifted = 0;
    while (m < LOWEST) { m += 12; shifted += 12; }
    let best = null;
    OPEN.forEach((open, s) => {
      const fret = m - open;
      if (fret < 0 || fret > MAX_FRET) return;
      if (!best || fret < best.fret) best = { string: s, fret };
    });
    return best ? { ...best, midi: m, shifted, name: noteName(m), stringName: NAMES[best.string] } : null;
  }

  /** A drum pad, placed on the ukulele. */
  function placePad(pad) {
    const MF = root.MF;
    const f = MF.instrument('drum').pitches(pad);
    return f.length ? place(hzToMidi(f[0])) : null;
  }

  /**
   * A line of the book as tab columns. Bar lines stay bar lines, rests stay
   * rests, and `idx` is the event's index so playback can light it.
   */
  function columns(events) {
    return (events || []).map((e, idx) => {
      if (e.bar) return { bar: true, idx };
      const dur = e.dur || 1;
      const tok = e.pad !== undefined ? e.pad : e.tok;
      if (e.rest || !tok || tok === '0') return { rest: true, dur, idx };
      const at = placePad(tok);
      return at ? { ...at, dur, idx, pad: tok } : { rest: true, dur, idx };
    });
  }

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Width of a column: a beat is 30px, never narrower than a number. */
  const widthOf = (c) => (c.bar ? 10 : Math.max(24, Math.round(30 * Math.min(c.dur, 3))));

  /**
   * The tab as markup. `cur` is the index of the event sounding now; it is
   * drawn lit, and everything before it drawn played. `id` lets the app
   * scroll the lit column into view.
   */
  function render(cols, opts) {
    const o = opts || {};
    const cur = o.cur === undefined ? -1 : o.cur;
    const rowH = 18;
    const lines = ROWS.map((s, r) => `<div aria-hidden="true" style="position:absolute;left:0;right:0;top:${r * rowH + rowH / 2}px;height:1px;background:#4a4e60"></div>`).join('');
    const names = ROWS.map((s) => `<div style="height:${rowH}px;line-height:${rowH}px;font:600 11px ui-monospace,Menlo,monospace;color:#a9adc2">${NAMES[s]}</div>`).join('');
    const cells = cols.map((c) => {
      const w = widthOf(c);
      if (c.bar) return `<div aria-hidden="true" style="flex:none;width:${w}px;position:relative"><div style="position:absolute;left:4px;top:${rowH / 2}px;height:${rowH * 3}px;width:2px;background:#6b6f85"></div></div>`;
      const now = c.idx === cur, done = cur >= 0 && c.idx < cur;
      const label = c.rest ? 'rest' : `${c.name}: ${c.stringName} string, ${c.fret === 0 ? 'open' : 'fret ' + c.fret}${c.shifted ? ' (an octave up)' : ''}`;
      const marks = c.rest ? '' : ROWS.map((s, r) => s !== c.string ? '' :
        `<div style="position:absolute;left:0;top:${r * rowH}px;height:${rowH}px;min-width:20px;padding:0 3px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:5px;font:700 13px ui-monospace,Menlo,monospace;background:${now ? '#9184d9' : '#1b1d27'};color:${now ? '#11121a' : done ? '#b9b4f0' : '#f2f1fb'};${now ? 'box-shadow:0 0 0 2px #d2cefd;' : ''}${c.shifted ? 'text-decoration:underline dotted;' : ''}">${c.fret}</div>`).join('');
      return `<div role="listitem" aria-label="${esc(label)}"${now ? ' aria-current="true" data-tab-now="1"' : ''} style="flex:none;width:${w}px;height:${rowH * 4}px;position:relative">${marks}</div>`;
    }).join('');
    return `<div class="mf-tab" style="display:flex;gap:6px;align-items:flex-start">
      <div aria-hidden="true" style="flex:none;width:12px">${names}</div>
      <div${o.id ? ` id="${esc(o.id)}"` : ''} style="flex:1;min-width:0;overflow-x:auto;scroll-behavior:smooth;-webkit-overflow-scrolling:touch">
        <div role="list" aria-label="${esc(o.label || 'Ukulele tab')}" style="position:relative;display:inline-flex;gap:4px;padding-right:12px;min-width:100%">${lines}${cells}</div>
      </div></div>`;
  }

  root.MF_TAB = { OPEN, NAMES, ROWS, MAX_FRET, hzToMidi, noteName, place, placePad, columns, render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
