/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — drawing the fretboard.

   A chord box, and the thing chord boxes never show: which finger stays put.

   Every ukulele book prints the shapes side by side and leaves the change
   between them to be discovered. But the change is the difficulty, and the
   anchor — the finger already in the right place — is most of the answer. The
   engine knows which finger that is, so the diagram says so: an anchored
   finger is drawn held, in the same colour as the one before it, and the ones
   that have to move are drawn as moving.

   Strings render as they sit under the hand, G C E A from left to right.
   Strings are numbered from the G side here, matching the tuning array, which
   is the opposite of how a player counts them — hence the labels underneath.

   Strings and markup only; no state, no audio, no events. It returns a string.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const NAMES = ['G', 'C', 'E', 'A'];
  const WINDOW = 4; // frets visible at once — what a hand covers

  const HELD = '#8fd0b4';  // an anchored finger: already where it needs to be
  const MOVE = '#9184d9';  // a finger that has to travel
  const LINE = '#3a3d4e';
  const DIM = '#6b6f85';

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** The lowest fret the window starts at, and whether the nut is in view. */
  function windowOf(shape) {
    const held = shape.frets.filter((f) => f > 0);
    if (!held.length) return { start: 1, nut: true };
    const low = Math.min(...held);
    const high = Math.max(...held);
    if (high <= WINDOW) return { start: 1, nut: true };
    // Keep the whole shape in view, sitting as low on the neck as it can.
    return { start: Math.max(1, high - WINDOW + 1), nut: false };
  }

  /**
   * Is this finger already where it needs to be?
   *
   * Same finger, same string, same fret. Anything less is a move, however
   * small — a finger that slides one fret still has to be told to.
   */
  function anchored(placement, from) {
    if (!from || !from.placements) return false;
    return from.placements.some(
      (p) =>
        p.finger === placement.finger &&
        p.string === placement.string &&
        p.fret === placement.fret,
    );
  }

  /**
   * One chord box.
   *
   * `from` is the shape being left, if any. Pass it and the anchors light up;
   * leave it out and every finger is drawn the same, which is what a chart
   * does and why a chart cannot teach a change.
   */
  function chord(shape, opts) {
    const o = opts || {};
    const from = o.from || null;
    const win = windowOf(shape);
    const padX = 20;
    const gap = 26;
    const nutY = 30;
    const fretH = 24;
    const x = (s) => padX + s * gap;
    const y = (fret) => nutY + (fret - win.start + 0.5) * fretH;
    const bottom = nutY + WINDOW * fretH;

    const bits = [];

    // Strings first, then the frets over them: drawn the other way round, the
    // strings cut the nut into four pieces where they cross it.
    for (let s = 0; s < 4; s++) {
      bits.push(
        `<line x1="${x(s)}" y1="${nutY}" x2="${x(s)}" y2="${bottom}" stroke="${LINE}" stroke-width="1.5"/>`,
      );
    }
    for (let f = 0; f <= WINDOW; f++) {
      const yy = nutY + f * fretH;
      const thick = f === 0 && win.nut;
      bits.push(
        `<line x1="${padX}" y1="${yy}" x2="${x(3)}" y2="${yy}" stroke="${thick ? '#c9cddd' : LINE}" stroke-width="${thick ? 5 : 1.5}" stroke-linecap="round"/>`,
      );
    }

    // Where the hand is, when it is not at the nut.
    if (!win.nut) {
      bits.push(
        `<text x="${padX - 7}" y="${y(win.start) + 4}" fill="${DIM}" font-family="ui-monospace,Menlo,monospace" font-size="11" text-anchor="end">${win.start}</text>`,
      );
    }

    // A barre is one finger lying across several strings.
    if (shape.barre) {
      const bar = shape.placements.filter((p) => p.finger === 1);
      if (bar.length > 1) {
        const lo = Math.min(...bar.map((p) => p.string));
        const hi = Math.max(...bar.map((p) => p.string));
        const held = anchored(bar[0], from);
        bits.push(
          `<rect x="${x(lo) - 9}" y="${y(bar[0].fret) - 9}" width="${x(hi) - x(lo) + 18}" height="18" rx="9" fill="${held ? HELD : MOVE}"/>`,
        );
      }
    }

    // Open strings, above the nut.
    shape.frets.forEach((fret, s) => {
      if (fret === 0) {
        bits.push(
          `<circle cx="${x(s)}" cy="${nutY - 12}" r="5.5" fill="none" stroke="${DIM}" stroke-width="1.5"/>`,
        );
      }
    });

    // The fingers.
    for (const p of shape.placements) {
      const held = anchored(p, from);
      const onBar = shape.barre && p.finger === 1;
      if (!onBar) {
        bits.push(
          `<circle cx="${x(p.string)}" cy="${y(p.fret)}" r="9" fill="${held ? HELD : MOVE}"/>`,
        );
      }
      bits.push(
        `<text x="${x(p.string)}" y="${y(p.fret) + 4.5}" fill="#171927" font-family="Inter,sans-serif" font-weight="600" font-size="11.5" text-anchor="middle">${p.finger}</text>`,
      );
      // A held finger gets a ring, so the diagram still reads without colour.
      if (held && !onBar) {
        bits.push(
          `<circle cx="${x(p.string)}" cy="${y(p.fret)}" r="13" fill="none" stroke="${HELD}" stroke-width="1.5" opacity="0.55"/>`,
        );
      }
    }

    // Which string is which, since they are drawn in tuning order.
    NAMES.forEach((n, s) => {
      bits.push(
        `<text x="${x(s)}" y="${bottom + 16}" fill="${DIM}" font-family="ui-monospace,Menlo,monospace" font-size="10" text-anchor="middle">${n}</text>`,
      );
    });

    const title = o.label === false ? '' :
      `<text x="${(padX + x(3)) / 2}" y="12" fill="#e2e5f0" font-family="var(--font-heading),serif" font-size="16" font-weight="500" text-anchor="middle">${esc(o.label || shape.chord)}</text>`;

    return `<svg viewBox="-10 0 ${x(3) + padX + 10} ${bottom + 24}" width="${o.width || '100%'}" role="img" aria-label="${esc(shape.chord)} chord diagram" style="display:block">${title}${bits.join('')}</svg>`;
  }

  /**
   * A change, drawn as what it is: two shapes and the fingers that survive it.
   *
   * The count of anchors is the number a learner feels. Naming it is the whole
   * point — "two fingers stay" is advice, "C to F" is not.
   */
  function change(from, to, opts) {
    const o = opts || {};
    const anchors = to.placements.filter((p) => anchored(p, from)).length;
    const note =
      anchors === 0
        ? 'Nothing stays — the whole hand moves.'
        : anchors === 1
          ? 'One finger stays put. Leave it down and pivot on it.'
          : `${anchors} fingers stay put. Leave them down.`;

    return `<div style="display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">${chord(from, { label: from.chord })}</div>
      <div style="flex:none;align-self:center;padding-top:14px;color:${DIM};font:400 18px Inter,sans-serif">→</div>
      <div style="flex:1;min-width:0">${chord(to, { from, label: to.chord })}</div>
    </div>
    <div style="margin-top:8px;font:400 12px/1.5 Inter,sans-serif;color:${anchors ? HELD : DIM};text-wrap:pretty">${note}${
      o.cost === undefined ? '' : ` <span style="color:${DIM}">· effort ${o.cost.toFixed(1)}</span>`
    }</div>`;
  }

  root.MF_FRETBOARD_VIEW = { chord, change, anchored, windowOf, WINDOW };
})(typeof globalThis !== 'undefined' ? globalThis : this);
