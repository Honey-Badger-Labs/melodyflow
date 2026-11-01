/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — Learn mode.

   A landscape follow-along that teaches two things at once: reading staff
   notation, and finding that note on your instrument. The staff runs across
   the top; the instrument (piano keys, drum pads or ukulele strings) sits
   underneath; one highlight moves through both so the eye learns that this
   dot on this line is that key under this finger.

   Two ways to go through a lesson:
     Watch  — the app plays and the highlight moves at your tempo.
     Step   — the highlight waits until you play the right note (tap it,
              or use the computer keys shown on the keyboard).

   Pure functions first (tested in node), the view after (browser only).
   No build step, no network: plain script, same as the rest of the app.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /** 'C4', 'F#4', 'Bb3' → { letter, acc, octave, midi } */
  function parseNote(name) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name).trim());
    if (!m) return null;
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    const octave = +m[3];
    return { letter: m[1], acc, octave, midi: 12 * (octave + 1) + SEMI[m[1]] + acc };
  }

  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /** Diatonic steps from E4, the bottom line of the treble staff. 0 = E4, 1 = F4 … 8 = F5. */
  function staffStep(name) {
    const n = parseNote(name);
    if (!n) return null;
    return n.octave * 7 + LETTERS.indexOf(n.letter) - (4 * 7 + 2);
  }

  /** Lines on the staff are even steps 0..8. Ledger lines needed below or above. */
  function ledgerLines(step) {
    const out = [];
    for (let s = -2; s >= step; s -= 2) out.push(s);
    for (let s = 10; s <= step; s += 2) out.push(s);
    return out;
  }

  /** Lines are E G B D F; spaces are F A C E. The two sayings beginners learn. */
  function onLine(step) {
    return step % 2 === 0;
  }

  /* ── lessons ─────────────────────────────────────────────────────────
     Traditional and public-domain melodies, all inside C4–E5 so they sit on
     the treble staff with at most one ledger line and fit the tongue drum,
     a soprano ukulele and the first two octaves of a piano.
     Each note is [name, beats]. */
  const LESSONS = [
    {
      id: 'c-scale', title: 'The C major scale', tempo: 72,
      tip: 'Start on middle C, one ledger line below the staff. Each step up moves from a line to a space, or a space to a line.',
      notes: [['C4', 1], ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['A4', 1], ['B4', 1], ['C5', 2]],
    },
    {
      id: 'mary', title: 'Mary Had a Little Lamb', tempo: 90,
      tip: 'Only three notes to start: E, D and C. E sits on the bottom line, D just under it, C on its own ledger line.',
      notes: [['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 2],
        ['D4', 1], ['D4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['G4', 2]],
    },
    {
      id: 'ode', title: 'Ode to Joy (Beethoven)', tempo: 96,
      tip: 'Almost every move is one step. Watch the dot climb from E to G and walk back down.',
      notes: [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
        ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2]],
    },
    {
      id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', tempo: 90,
      tip: 'The first leap: C up to G. G sits on the second line — the line the treble clef curls around.',
      notes: [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
        ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]],
    },
  ];

  /* ── instruments ───────────────────────────────────────────────────── */

  /** Two octaves from middle C: the first thing a new pianist learns to find. */
  const PIANO_LOW = 60, PIANO_HIGH = 83;
  /** Home row, mapped to the white keys of the first octave, so a laptop can play along. */
  const KEY_MAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ';': 76 };

  function pianoKeys(low = PIANO_LOW, high = PIANO_HIGH) {
    const out = [];
    for (let m = low; m <= high; m++) {
      const pc = m % 12;
      const black = [1, 3, 6, 8, 10].includes(pc);
      out.push({ midi: m, black });
    }
    return out;
  }

  /** Which finger plays it, in the beginner's C position (thumb on middle C). */
  function pianoFinger(midi) {
    const f = { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 }[midi];
    return f || null;
  }

  const DRUM_NAMES = {
    '5.': 'G3', '6.': 'A3', '7.': 'B3', 1: 'C4', 2: 'D4', 3: 'E4', 4: 'F4',
    5: 'G4', 6: 'A4', 7: 'B4', '.1': 'C5', '.2': 'D5', '.3': 'E5',
  };

  function drumPad(name) {
    const target = parseNote(name);
    if (!target) return null;
    for (const [pad, n] of Object.entries(root.MF ? root.MF.DRUM_NAMES : DRUM_NAMES)) {
      if (parseNote(n).midi === target.midi) return String(pad);
    }
    return null;
  }

  const UKE_OPEN = [67, 60, 64, 69]; // G4 C4 E4 A4, re-entrant
  const UKE_STRINGS = ['G', 'C', 'E', 'A'];

  /** The easiest place to play a single note on soprano ukulele: lowest fret wins, then the lower string. */
  function ukePosition(name) {
    const n = parseNote(name);
    if (!n) return null;
    let best = null;
    UKE_OPEN.forEach((open, s) => {
      const fret = n.midi - open;
      if (fret < 0 || fret > 12) return;
      if (!best || fret < best.fret) best = { string: s, stringName: UKE_STRINGS[s], fret };
    });
    return best;
  }

  /** Where this note lives on the chosen instrument, in words a beginner can follow. */
  function where(name, inst) {
    if (inst === 'piano') {
      const n = parseNote(name);
      if (!n || n.midi < PIANO_LOW || n.midi > PIANO_HIGH) return null;
      const f = pianoFinger(n.midi);
      return { midi: n.midi, text: name === 'C4' ? 'Middle C' : `${n.letter}${n.acc ? (n.acc > 0 ? '♯' : '♭') : ''} key`, finger: f };
    }
    if (inst === 'drum') {
      const pad = drumPad(name);
      return pad === null ? null : { pad, text: `Pad ${pad}` };
    }
    if (inst === 'ukulele') {
      const p = ukePosition(name);
      return p && { ...p, text: p.fret === 0 ? `${p.stringName} string, open` : `${p.stringName} string, fret ${p.fret}` };
    }
    const SL = root.MF_SONGLESSON;
    if (inst === 'harmonica' && SL) { const h = SL.harpHole(name); return h && { ...h, midi: parseNote(name).midi }; }
    if (inst === 'kalimba' && SL) { const k = SL.kalimbaTine(name); return k && { ...k, midi: parseNote(name).midi }; }
    return null;
  }

  /** Beat at which each note starts, and the lesson's length in beats. */
  function timeline(notes) {
    let t = 0;
    const starts = notes.map(([, d]) => { const s = t; t += d; return s; });
    return { starts, total: t };
  }

  /** In step mode, did the player hit the note we're waiting for? Octave matters. */
  function isRight(expectedName, playedMidi) {
    const n = parseNote(expectedName);
    return !!n && n.midi === playedMidi;
  }

  function playableOn(lesson, inst) {
    return lesson.notes.every(([n]) => where(n, inst) !== null);
  }

  /** Learn instruments, in the order shown. */
  const INSTS = [['piano', 'Piano'], ['drum', 'Tongue drum'], ['ukulele', 'Ukulele'], ['harmonica', 'Harmonica (C)'], ['kalimba', 'Kalimba (17)']];
  const INST_IDS = INSTS.map((x) => x[0]);

  /** Which instrument panel the view draws — the selected one, always. */
  function panelFor(inst) {
    return { piano: 'piano', drum: 'drum', ukulele: 'uke', harmonica: 'harmonica', kalimba: 'kalimba' }[inst] || 'piano';
  }

  const api = { INSTS, panelFor,
    parseNote, midiToHz, staffStep, ledgerLines, onLine, LESSONS, pianoKeys, pianoFinger,
    KEY_MAP, drumPad, ukePosition, where, timeline, isRight, playableOn, PIANO_LOW, PIANO_HIGH,
  };

  /* ── the view ────────────────────────────────────────────────────────
     Owns its own state, so the app's re-render can remount it freely. */
  const S = { song: null, lesson: 0, inst: 'piano', mode: 'watch', i: -1, playing: false, tempo: null, names: true, timer: null, msg: '', help: false };

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

  let ac = null;
  function tone(hz, sec = 0.5) {
    try {
      ac = ac || new (root.AudioContext || root.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + sec);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + sec + 0.05);
    } catch (e) { /* no audio, still teaches */ }
  }

  const ACC = '#a99cf8', DIM = '#595d6c', INK = '#e7e6ee';

  function staffSvg(lesson, cur, names) {
    const W = Math.max(640, 90 + lesson.notes.length * 56), gap = 12, base = 112;
    const y = (step) => base - step * (gap / 2);
    let s = `<svg viewBox="0 0 ${W} 170" width="100%" height="170" role="img" aria-label="Staff for ${esc(lesson.title)}" data-learn-staff>`;
    for (let l = 0; l < 5; l++) s += `<line x1="10" x2="${W - 10}" y1="${y(l * 2)}" y2="${y(l * 2)}" stroke="${DIM}" stroke-width="1.2"/>`;
    s += `<text x="14" y="${y(2) + 22}" font-size="64" fill="${INK}" font-family="serif">𝄞</text>`;
    lesson.notes.forEach(([n, d], k) => {
      const st = staffStep(n), x = 90 + k * 56, on = k === cur;
      if (on) s += `<rect data-learn-cursor x="${x - 22}" y="6" width="44" height="158" rx="8" fill="${ACC}" fill-opacity="0.16" stroke="${ACC}" stroke-opacity="0.6"/>`;
      const col = on ? ACC : INK;
      for (const L of ledgerLines(st)) s += `<line x1="${x - 13}" x2="${x + 13}" y1="${y(L)}" y2="${y(L)}" stroke="${col}" stroke-width="1.4"/>`;
      const hollow = d >= 2;
      s += `<ellipse cx="${x}" cy="${y(st)}" rx="7.5" ry="5.6" transform="rotate(-20 ${x} ${y(st)})" fill="${hollow ? 'none' : col}" stroke="${col}" stroke-width="2" ${on ? 'data-now' : ''}/>`;
      const up = st < 4;
      s += up ? `<line x1="${x + 7}" x2="${x + 7}" y1="${y(st)}" y2="${y(st) - 34}" stroke="${col}" stroke-width="1.6"/>`
        : `<line x1="${x - 7}" x2="${x - 7}" y1="${y(st)}" y2="${y(st) + 34}" stroke="${col}" stroke-width="1.6"/>`;
      if (d === 1.5) s += `<circle cx="${x + 13}" cy="${y(st)}" r="2" fill="${col}"/>`;
      if (d === 0.5) s += `<path d="M${x + 7} ${y(st) - 34} q 10 8 6 20" stroke="${col}" fill="none" stroke-width="1.6"/>`;
      if (names || on) s += `<text x="${x}" y="160" text-anchor="middle" font-family="Inter,sans-serif" font-size="${on ? 15 : 12}" font-weight="${on ? 700 : 400}" fill="${on ? ACC : DIM}">${n.replace(/\d/, '')}</text>`;
    });
    return s + '</svg>';
  }

  function pianoSvg(hi) {
    const keys = pianoKeys(), whites = keys.filter((k) => !k.black), ww = 36, H = 130;
    const rev = Object.fromEntries(Object.entries(KEY_MAP).map(([k, m]) => [m, k]));
    let s = `<svg viewBox="0 0 ${whites.length * ww} ${H}" width="100%" height="${H}" data-learn-piano>`;
    let wi = 0; const xs = {};
    for (const k of keys) if (!k.black) { xs[k.midi] = wi * ww; wi++; }
    for (const k of whites) {
      const on = hi === k.midi, n = LETTERS[[0, 2, 4, 5, 7, 9, 11].indexOf(k.midi % 12)];
      s += `<rect data-midi="${k.midi}" x="${xs[k.midi] + 1}" y="0" width="${ww - 2}" height="${H}" rx="4" fill="${on ? ACC : '#f3f2f7'}"/>`;
      s += `<text x="${xs[k.midi] + ww / 2}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#333" pointer-events="none">${n}${k.midi === 60 ? '₄' : ''}</text>`;
      if (rev[k.midi]) s += `<text x="${xs[k.midi] + ww / 2}" y="${H - 28}" text-anchor="middle" font-size="9" fill="#999" pointer-events="none">${rev[k.midi].toUpperCase()}</text>`;
    }
    for (const k of keys) if (k.black) {
      const x = xs[k.midi - 1] + ww - 11, on = hi === k.midi;
      s += `<rect data-midi="${k.midi}" x="${x}" y="0" width="22" height="${H * 0.6}" rx="3" fill="${on ? ACC : '#1b1c21'}"/>`;
    }
    return s + '</svg>';
  }

  function drumSvg(hiPad) {
    const pads = ['5.', '6.', '7.', '1', '2', '3', '4', '5', '6', '7', '.1', '.2', '.3'];
    const midi = (p) => parseNote(DRUM_NAMES[p]).midi;
    return `<div data-learn-drum style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${pads.map((p) =>
      `<button data-midi="${midi(p)}" style="width:54px;height:54px;border-radius:50%;border:2px solid ${p === hiPad ? ACC : '#3a3d47'};background:${p === hiPad ? '#3b336b' : '#22242a'};color:${INK};font:600 15px Inter,sans-serif;cursor:pointer">${p}<div style="font:400 9px Inter,sans-serif;color:${DIM}">${DRUM_NAMES[p]}</div></button>`).join('')}</div>`;
  }

  function ukeSvg(pos) {
    const frets = 7, fw = 64, sh = 26, W = 40 + frets * fw, H = 30 + 3 * sh + 20;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" data-learn-uke>`;
    for (let f = 0; f <= frets; f++) s += `<line x1="${40 + f * fw}" x2="${40 + f * fw}" y1="20" y2="${20 + 3 * sh}" stroke="${f ? DIM : INK}" stroke-width="${f ? 1.5 : 4}"/>`;
    // A string on top, as a player looking down at the neck sees it.
    [3, 2, 1, 0].forEach((str, row) => {
      const yy = 20 + row * sh;
      s += `<line x1="40" x2="${W}" y1="${yy}" y2="${yy}" stroke="#cfcbd8" stroke-width="1.4"/><text x="16" y="${yy + 4}" font-size="12" fill="${INK}">${UKE_STRINGS[str]}</text>`;
      for (let f = 0; f <= frets; f++) {
        const m = UKE_OPEN[str] + f, cx = f === 0 ? 30 : 40 + f * fw - fw / 2, on = pos && pos.string === str && pos.fret === f;
        s += `<circle data-midi="${m}" cx="${cx}" cy="${yy}" r="${on ? 10 : 8}" fill="${on ? ACC : 'transparent'}" stroke="${on ? ACC : 'none'}"/>`;
      }
    });
    for (let f = 1; f <= frets; f++) s += `<text x="${40 + f * fw - fw / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="${DIM}">${f}</text>`;
    return s + '</svg>';
  }

  function harpSvg(w) {
    const SL = root.MF_SONGLESSON, cw = 52;
    let s = `<div data-learn-harmonica style="display:flex;gap:4px;justify-content:center">`;
    for (let h = 1; h <= 10; h++) {
      const on = w && w.hole === h, b = SL ? SL.HARP_BLOW[h - 1] : 0, d = SL ? SL.HARP_DRAW[h - 1] : 0;
      const nm = (m) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12];
      s += `<div style="width:${cw}px;display:flex;flex-direction:column;gap:3px;font:500 10px Inter,sans-serif;color:${DIM};text-align:center">
        <button data-midi="${b}" style="height:30px;border-radius:6px;border:1px solid ${on && w.dir === 'blow' ? ACC : '#3a3d47'};background:${on && w.dir === 'blow' ? '#3b336b' : '#22242a'};color:${INK};font:600 11px Inter,sans-serif">${nm(b)} ↑</button>
        <div style="height:26px;border-radius:4px;background:${on ? ACC : '#8a8d99'};color:#161826;font:700 14px/26px Inter,sans-serif">${h}</div>
        <button data-midi="${d}" style="height:30px;border-radius:6px;border:1px solid ${on && w.dir === 'draw' ? ACC : '#3a3d47'};background:${on && w.dir === 'draw' ? '#3b336b' : '#22242a'};color:${INK};font:600 11px Inter,sans-serif">${nm(d)} ↓</button></div>`;
    }
    return s + `</div><div style="text-align:center;font:400 11px Inter,sans-serif;color:${DIM};margin-top:6px">↑ blow (tab 4) · ↓ draw (tab -4)</div>`;
  }

  function kalimbaSvg(w) {
    const SL = root.MF_SONGLESSON; if (!SL) return '';
    const n = SL.KALIMBA_LAYOUT.length, mid = (n - 1) / 2;
    return `<div data-learn-kalimba style="display:flex;gap:3px;justify-content:center;align-items:flex-start">${SL.KALIMBA_LAYOUT.map((name, k) => {
      const t = SL.kalimbaTine(name), on = w && w.index === k, h = 120 - Math.abs(k - mid) * 8;
      return `<button data-midi="${parseNote(name).midi}" style="width:26px;height:${h}px;border-radius:0 0 13px 13px;border:1px solid ${on ? ACC : '#3a3d47'};background:${on ? ACC : '#c9cbd3'};color:#161826;font:600 10px Inter,sans-serif;padding:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px">${t.num}</button>`;
    }).join('')}</div>`;
  }

  /** The lesson on screen: a Songbook song if one was handed in, else a built-in lesson. */
  const current = () => S.song || LESSONS[S.lesson];

  let host = null;
  function draw() {
    if (!host) return;
    const L = current(), cur = S.i, note = cur >= 0 ? L.notes[cur][0] : L.notes[0][0];
    const w = where(note, S.inst);
    const tempo = S.tempo || L.tempo;
    const btn = (act, v, label, on) => `<button data-l="${act}" data-v="${v}" class="mf-btn" style="border:1px solid ${on ? ACC : '#3a3d47'};background:${on ? '#2b2741' : 'transparent'};color:${on ? '#d2cefd' : INK};cursor:pointer">${label}</button>`;
    let inst = '';
    const panel = panelFor(S.inst);
    if (panel === 'piano') inst = pianoSvg(cur >= 0 && w ? w.midi : null);
    else if (panel === 'drum') inst = drumSvg(cur >= 0 && w ? w.pad : null);
    else if (panel === 'harmonica') inst = harpSvg(cur >= 0 ? w : null);
    else if (panel === 'kalimba') inst = kalimbaSvg(cur >= 0 ? w : null);
    else inst = ukeSvg(cur >= 0 ? w : null);
    const bad = S.inst === 'harmonica' && root.MF_SONGLESSON
      ? [...new Set(L.notes.map(([n]) => n).filter((n) => root.MF_SONGLESSON.harpProblem(n)))] : [];
    const ok = playableOn(L, S.inst);
    host.innerHTML = `<div data-learn class="mf-learn" style="padding:10px 16px;display:flex;flex-direction:column;gap:10px">
      <div class="mf-learn-turn" style="display:none;padding:8px 12px;border-radius:8px;background:#2b2741;color:#d2cefd;font:500 13px Inter,sans-serif">Tip: turn sideways for a bigger staff.</div>
      <div class="mf-row mf-learn-lessons">
        <span style="font:500 20px var(--font-heading,serif);margin-right:8px">Learn</span>
        ${S.song ? `<span data-learn-song style="font:500 15px Inter,sans-serif;color:${INK}">${esc(S.song.title)}</span>${btn('lessons', '', 'Other lessons', false)}`
          : LESSONS.map((x, k) => btn('lesson', k, esc(x.title), k === S.lesson)).join('')}
      </div>
      <div class="mf-row mf-learn-controls">
        ${INSTS.map(([id, label]) => btn('inst', id, label, S.inst === id)).join('')}
        <span style="width:12px"></span>
        ${btn('mode', 'watch', 'Watch', S.mode === 'watch')}${btn('mode', 'step', 'Step — you play', S.mode === 'step')}
        ${btn('names', '', S.names ? 'Hide note names' : 'Show note names', false)}${btn('help', '', '?', S.help)}
        ${S.mode === 'watch' ? `<label style="font:400 12px Inter,sans-serif;color:${DIM}">Tempo <input data-l="tempo" type="range" min="40" max="140" value="${tempo}"> ${tempo}</label>` : ''}
      </div>
      <button data-l="go" class="mf-btn mf-learn-go" style="width:100%;min-height:52px;border:0;border-radius:14px;background:${S.playing ? '#423a6a' : ACC};color:${S.playing ? '#f5f4ff' : '#161826'};font:600 17px Inter,sans-serif">${S.playing ? '■ Stop' : (S.mode === 'watch' ? '▶ Play lesson' : '▶ Start lesson')}</button>
      <div class="mf-learn-tip" style="${S.help ? '' : 'display:none;'}font:400 12.5px/1.5 Inter,sans-serif;color:#a2a4b0">${esc(L.tip)} <span style="color:${DIM}">Lines, bottom to top: E G B D F (“Every Good Boy Does Fine”). Spaces: F A C E.</span></div>
      <div class="mf-learn-stage"><div class="mf-learn-staff" data-learn-staff-wrap style="overflow-x:auto;background:#17181c;border-radius:10px;padding:6px">${staffSvg(L, cur, S.names)}</div>
      <div data-learn-now style="font:600 15px Inter,sans-serif;color:${ACC};min-height:20px">${cur >= 0 ? `${esc(note.replace(/\d/, ''))} — ${w ? esc(w.text) + (w.finger ? `, finger ${w.finger}` : '') : 'not on this instrument'}` : (ok ? 'Press ' + (S.mode === 'watch' ? 'Play' : 'Start') + ' to begin.' : 'Some notes in this lesson are outside this instrument.')}${S.msg ? ` <span style="color:#e59">${esc(S.msg)}</span>` : ''}</div>
      ${bad.length ? `<div data-learn-harp-flag style="font:400 12px Inter,sans-serif;color:#e0c79a">Not playable on a C harp without bends: ${bad.map((n) => esc(n) + ' (' + esc(root.MF_SONGLESSON.harpProblem(n)) + ')').join(', ')}</div>` : ''}
      <div class="mf-learn-inst" style="background:#17181c;border-radius:10px;padding:10px">${inst}</div></div>
    </div>`;
    follow();
  }

  function follow() {
    const wrap = host && host.querySelector('[data-learn-staff-wrap]'), c = host && host.querySelector('[data-learn-cursor]');
    if (!wrap || !c || !c.getBoundingClientRect) return;
    const wr = wrap.getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (cr.left < wr.left || cr.right > wr.right) wrap.scrollLeft += cr.left - wr.left - wr.width / 3;
  }

  function stop() { clearTimeout(S.timer); S.timer = null; S.playing = false; }
  function sound(name) { const n = parseNote(name); if (n) tone(midiToHz(n.midi)); }

  function watchNext() {
    const L = current();
    S.i++;
    if (S.i >= L.notes.length) { stop(); S.i = -1; draw(); return; }
    const [n, d] = L.notes[S.i];
    sound(n); draw();
    S.timer = setTimeout(watchNext, (60000 / (S.tempo || L.tempo)) * d);
  }

  function played(midi) {
    tone(midiToHz(midi), 0.4);
    if (S.mode !== 'step' || !S.playing) return;
    const L = current();
    if (isRight(L.notes[S.i][0], midi)) {
      S.msg = '';
      S.i++;
      if (S.i >= L.notes.length) { stop(); S.i = -1; S.msg = ''; host && draw(); if (host) host.querySelector('[data-learn-now]').textContent = 'Well played — that was the whole tune.'; return; }
    } else S.msg = 'Not quite — try again.';
    draw();
  }

  function onClick(ev) {
    const t = ev.target.closest('[data-l],[data-midi]');
    if (!t || !host.contains(t)) return;
    if (t.dataset.midi) { played(+t.dataset.midi); return; }
    const v = t.dataset.v;
    switch (t.dataset.l) {
      case 'lessons': stop(); S.song = null; S.i = -1; S.tempo = null; break;
      case 'lesson': stop(); S.song = null; S.lesson = +v; S.i = -1; S.tempo = null; break;
      case 'inst': stop(); S.inst = v; S.i = -1; if (api.onInst) api.onInst(v); break;
      case 'help': S.help = !S.help; break;
      case 'mode': stop(); S.mode = v; S.i = -1; break;
      case 'names': S.names = !S.names; break;
      case 'go':
        if (S.playing) { stop(); S.i = -1; break; }
        S.playing = true; S.msg = '';
        if (S.mode === 'watch') { S.i = -1; watchNext(); return; }
        S.i = 0; break;
      default: return;
    }
    draw();
  }
  function onInput(ev) { if (ev.target.dataset && ev.target.dataset.l === 'tempo') { S.tempo = +ev.target.value; } }
  function onKey(ev) {
    if (!host || !host.isConnected || ev.repeat || ev.metaKey || ev.ctrlKey) return;
    const m = KEY_MAP[ev.key.toLowerCase()];
    if (m !== undefined) { ev.preventDefault(); played(m); }
  }

  let wired = false;
  function mount(el, opts) {
    host = el;
    if (opts) {
      if (INST_IDS.includes(opts.inst) && opts.inst !== S.inst) { stop(); S.inst = opts.inst; S.i = -1; }
      if (opts.song && (!S.song || S.song.id !== opts.song.id || S.song.notes.length !== opts.song.notes.length)) { stop(); S.song = opts.song; S.i = -1; S.tempo = null; }
      const k = opts.lesson ? LESSONS.findIndex((x) => x.id === opts.lesson) : -1;
      if (k >= 0 && (k !== S.lesson || S.song)) { S.song = null; stop(); S.lesson = k; S.i = -1; S.tempo = null; }
    }
    if (!wired && root.document) {
      wired = true;
      root.document.addEventListener('click', (e) => host && host.isConnected && onClick(e));
      root.document.addEventListener('input', (e) => host && host.isConnected && onInput(e));
      root.document.addEventListener('keydown', onKey);
    }
    draw();
  }
  function unmount() { stop(); host = null; }

  api.mount = mount;
  api.unmount = unmount;
  api._state = S;
  root.MF_LEARN = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
