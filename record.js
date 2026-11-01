/* MelodyFlow — Record mode.
   Plays Jingle Bells as a follow-along for the tongue drum (pad numbers) or
   ukulele (chord + string/fret), with a click and a 2-bar count-in, while it
   records ONLY the microphone. The click goes to the speakers/headphones via
   Web Audio; MediaRecorder gets the raw mic stream, so the click is never in
   the take digitally. (Through open speakers the mic would hear it — use
   headphones.) The take downloads as WebM/MP4 (whatever the browser records)
   or as WAV, named with the instrument and tempo.
   Melody: James Lord Pierpont, 1857 (public domain), in C as commonly printed:
   verse from the G below middle C, chorus from the E above it. */
(function (root) {
  'use strict';
  const L = () => root.MF_LEARN;

  // [note, beats]  4/4, quarter = 1 beat. Bars are 4 beats each.
  const VERSE = [
    ['G3',1],['E4',1],['D4',1],['C4',1], ['G3',3],['G3',.5],['G3',.5],
    ['G3',1],['E4',1],['D4',1],['C4',1], ['A3',4],
    ['A3',1],['F4',1],['E4',1],['D4',1], ['B3',4],
    ['G4',1],['G4',1],['F4',1],['D4',1], ['E4',4],
    ['G3',1],['E4',1],['D4',1],['C4',1], ['G3',4],
    ['G3',1],['E4',1],['D4',1],['C4',1], ['A3',3],['A3',1],
    ['A3',1],['F4',1],['E4',1],['D4',1], ['G4',1],['G4',1],['G4',1],['G4',1],
    ['A4',1],['G4',1],['F4',1],['D4',1], ['C4',2],['G3',2],
  ];
  const HALF = [
    ['E4',1],['E4',1],['E4',2], ['E4',1],['E4',1],['E4',2],
    ['E4',1],['G4',1],['C4',1.5],['D4',.5], ['E4',4],
    ['F4',1],['F4',1],['F4',1.5],['F4',.5], ['F4',1],['E4',1],['E4',1],['E4',.5],['E4',.5],
  ];
  const CHORUS = [
    ...HALF, ['E4',1],['D4',1],['D4',1],['E4',1], ['D4',2],['G4',2],
    ...HALF, ['G4',1],['G4',1],['F4',1],['D4',1], ['C4',4],
  ];
  // One chord per bar, C/F/G7 only (Dm→F and D7→G7 simplified).
  const VERSE_CHORDS = ['C','C','C','F','F','G7','G7','C','C','C','C','F','F','C','G7','C'];
  const CHORUS_CHORDS = ['C','C','C','C','F','C','G7','G7','C','C','C','C','F','C','G7','C'];
  const SONG = {
    id: 'jingle', title: 'Jingle Bells', composer: 'James Lord Pierpont (1857)', beatsPerBar: 4,
    notes: [...VERSE, ...CHORUS], chords: [...VERSE_CHORDS, ...CHORUS_CHORDS], tempo: 110,
  };

  const slug = (t) => String(t || 'song').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
  const INST_FILE = { drum: 'tongue-drum', ukulele: 'ukulele', piano: 'piano', harmonica: 'harmonica', kalimba: 'kalimba', ocarina: 'ocarina' };
  const INSTS = [['drum', 'Tongue drum'], ['ukulele', 'Ukulele'], ['piano', 'Piano'], ['harmonica', 'Harmonica'], ['kalimba', 'Kalimba'], ['ocarina', 'Ocarina']];

  /** Chords as [name, beats] whether the song lists one per bar or a timeline. */
  function chordTimeline(song) {
    const c = song.chords || [];
    return c.map((x) => (Array.isArray(x) ? x : [x, song.beatsPerBar || 4]));
  }
  /** The chord sounding at a beat of the song (beat 0 = first note). */
  function chordAt(song, beat) {
    let t = 0;
    for (const [name, d] of chordTimeline(song)) { if (beat < t + d - 1e-9) return name; t += d; }
    return null;
  }
  /** Any Songbook song, ready to record: Jingle Bells keeps its full sourced arrangement. */
  function forSong(song) {
    if (!song || song.id === 'jingle' || !root.MF_SONGLESSON) return SONG;
    const x = root.MF_SONGLESSON.fromSong(song);
    return { id: x.id, title: x.title, beatsPerBar: x.beatsPerBar, pickup: x.pickup, notes: x.notes, chords: x.chords, tempo: x.bpm, melodyOnly: x.melodyOnly };
  }

  /** Where to play a note; notes below the instrument are raised an octave (flagged). */
  function placeNote(name, inst) {
    const m = /^([A-G][#b]?)(\d)$/.exec(name);
    for (let oct = +m[2], up = 0; up < 3; oct++, up++) {
      const w = L().where(m[1] + oct, inst);
      if (w) return { ...w, name: m[1] + oct, raised: up > 0 };
    }
    return null;
  }

  /** Seconds at which each note starts, after a count-in of `countBars` bars. */
  function schedule(song, bpm, countBars = 2) {
    // A pickup starts that many beats before the bar line, so the count-in is
    // shortened by it and the first full bar still lands on an accented click.
    const spb = 60 / bpm, lead = countBars * song.beatsPerBar - (song.pickup || 0);
    let beat = lead;
    const notes = song.notes.map(([n, d]) => { const t = beat * spb; beat += d; return { name: n, beats: d, t }; });
    const clicks = [];
    for (let b = 0; b <= beat; b++) clicks.push({ t: b * spb, accent: b % song.beatsPerBar === 0, countIn: b < lead });
    return { notes, clicks, songStart: lead * spb, end: beat * spb };
  }

  function fileName(inst, bpm, ext, d = new Date(), title = 'Jingle Bells') {
    const p = (x) => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    return `${slug(title)}_${INST_FILE[inst] || inst}_${bpm}bpm_${stamp}.${ext}`;
  }

  function pickMime(isSupported) {
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (isSupported(t)) return t;
    return '';
  }
  const extFor = (mime) => /mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';

  /** 16-bit PCM WAV from channel Float32Arrays. */
  function encodeWav(channels, sampleRate) {
    const nc = channels.length, len = channels[0].length, buf = new ArrayBuffer(44 + len * nc * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + len * nc * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, len * nc * 2, true);
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return buf;
  }

  // ── view ────────────────────────────────────────────────────────────
  const S = { song: SONG, include: { piano: true, drum: true, ukulele: true, harmonica: false, kalimba: false, ocarina: false }, picking: false, inst: 'drum', bpm: 110, guide: true, state: 'idle', i: -1, bar: -1, count: 0, take: null, msg: '', tip: false };
  let host = null, ac = null, rec = null, stream = null, timers = [], raf = 0;
  const ACC = '#a99cf8', DIM = '#75798c', INK = '#e7e6ee';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function click(at, accent) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + 0.06);
  }
  function guideTone(at, name, beats, spb) {
    const n = L().parseNote(name); if (!n) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = L().midiToHz(n.midi);
    const dur = Math.max(0.12, beats * spb * 0.85);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + dur + 0.05);
  }

  function noteCard(k) {
    const [name] = S.song.notes[k] || [];
    if (!name) return '';
    const w = placeNote(name, S.inst);
    if (!w) return esc(name);
    return S.inst === 'drum' ? `<b style="font-size:44px">${esc(String(w.pad))}</b>`
      : S.inst === 'ukulele' ? `<b style="font-size:24px">${esc(w.stringName)} string · fret ${w.fret}</b>`
      : `<b style="font-size:24px">${esc(w.text)}</b>`;
  }

  function draw() {
    if (!host) return;
    const sch = schedule(S.song, S.bpm);
    const btn = (a, v, label, on) => `<button data-r="${a}" data-v="${v}" class="mf-btn" style="border:1px solid ${on ? ACC : '#3a3d47'};background:${on ? '#2b2741' : 'transparent'};color:${on ? '#d2cefd' : INK}">${label}</button>`;
    const busy = S.state !== 'idle';
    const chordNow = S.i >= 0 ? chordAt(S.song, (sch.notes[S.i].t - sch.songStart) / (60 / S.bpm)) : null;
    const R = root.MF_RENDER, picks = R ? R.VOICES : [];
    const strip = S.song.notes.map(([n, d], k) => {
      const w = placeNote(n, S.inst), lab = !w ? '?' : S.inst === 'drum' ? w.pad : S.inst === 'ukulele' ? `${w.stringName}${w.fret}` : S.inst === 'harmonica' ? w.tab : S.inst === 'kalimba' ? w.num : S.inst === 'ocarina' ? w.name.replace(/\d/, '') : n.replace(/\d/, '');
      return `<span data-rec-note="${k}" style="display:inline-block;min-width:${Math.max(26, d * 26)}px;padding:6px 2px;text-align:center;border-radius:6px;${k === S.i ? `background:${ACC};color:#161826;` : ''}${w && w.raised ? 'text-decoration:underline dotted;' : ''}">${esc(String(lab))}</span>`;
    }).join('');
    host.innerHTML = `<div data-record class="mf-record" style="padding:10px 16px;display:flex;flex-direction:column;gap:10px">
      <div class="mf-row"><span style="font:500 20px var(--font-heading,serif);margin-right:8px">Record · ${esc(S.song.title)}</span>
        ${INSTS.map(([id, label]) => btn('inst', id, label, S.inst === id)).join('')}
        <label style="font:400 13px Inter,sans-serif;color:${DIM}">Tempo <input data-r="bpm" type="range" min="40" max="160" value="${S.bpm}" ${busy ? 'disabled' : ''}> ${S.bpm} BPM</label>
        ${btn('guide', '', S.guide ? 'Guide melody: on' : 'Guide melody: off', S.guide)}
        ${btn('tip', '', '?', S.tip)}
        ${R ? btn('pick', '', '♫ Render ensemble…', S.picking) : ''}</div>
      ${R && S.picking ? `<div data-ensemble-picker class="mf-row" style="background:#17181c;border-radius:10px;padding:10px;flex-wrap:wrap">
        <span style="font:500 13px Inter,sans-serif;color:${DIM}">Include:</span>
        ${picks.map(([id, label]) => `<label style="font:500 14px Inter,sans-serif;color:${INK};display:flex;gap:6px;align-items:center"><input type="checkbox" data-r="incl" data-v="${id}" ${S.include[id] ? 'checked' : ''}> ${label}</label>`).join('')}
        ${btn('render', '', `Render ${picks.filter(([id]) => S.include[id]).length} stems + mix`, false)}
        ${S.song.melodyOnly ? `<span style="font:400 12px Inter,sans-serif;color:#e0c79a">No chord line in the Songbook: ukulele and the piano left hand are skipped.</span>` : ''}</div>` : ''}
      <button data-r="go" class="mf-btn" style="width:100%;min-height:56px;border:0;border-radius:14px;background:${busy ? '#423a6a' : ACC};color:${busy ? '#f5f4ff' : '#161826'};font:600 18px Inter,sans-serif">${busy ? '■ Stop' : '● Record'}</button>
      <div style="${S.tip ? '' : 'display:none;'}font:400 13px/1.5 Inter,sans-serif;color:#a2a4b0">🎧 Wear headphones: the click and guide play in your ears and are never written to the take, but open speakers would leak into the mic. 2-bar count-in in ${S.song.beatsPerBar}/4 at the song's own tempo${S.song.pickup ? ` (shortened by the ${S.song.pickup}-beat pickup)` : ''}, then play along. Dotted-underlined notes are raised an octave to fit the instrument.</div>
      <div class="mf-record-stage">
        <div data-rec-now style="background:#17181c;border-radius:10px;padding:14px;text-align:center;color:${ACC};min-height:110px">
          ${S.state === 'count' ? `<b style="font-size:44px">${S.count}</b><div>count-in</div>` : S.i >= 0 ? `${noteCard(S.i)}${chordNow ? `<div style="color:${INK};font-size:20px">Chord: ${esc(chordNow)}</div>` : ''}<div style="color:${DIM}">next: ${noteCard(S.i + 1).replace(/font-size:\d+px/, 'font-size:16px')}</div>` : `<span style="color:${DIM}">${esc(S.msg || 'Ready. Press ● Record.')}</span>`}
        </div>
        <div data-rec-strip style="background:#17181c;border-radius:10px;padding:8px;overflow:auto;max-height:46dvh;line-height:2;font:600 15px Inter,sans-serif;color:${INK}">${strip}</div>
      </div>
      ${S.take ? `<div class="mf-row"><audio controls src="${S.take.url}"></audio>
        <a class="mf-btn" download="${esc(S.take.name)}" href="${S.take.url}" style="border:1px solid ${ACC};color:#d2cefd">Download ${esc(S.take.ext.toUpperCase())}</a>
        ${btn('wav', '', 'Download WAV', false)}</div>` : ''}
    </div>`;
    const cur = host.querySelector(`[data-rec-note="${S.i}"]`);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function cleanup() {
    timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
  }

  async function start() {
    const nav = root.navigator;
    if (!nav.mediaDevices || !root.MediaRecorder) { S.msg = 'This browser cannot record audio.'; draw(); return; }
    try {
      stream = await nav.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { S.msg = 'Microphone permission was refused.'; draw(); return; }
    ac = ac || new (root.AudioContext || root.webkitAudioContext)();
    await ac.resume();
    const mime = pickMime((t) => MediaRecorder.isTypeSupported(t));
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); // mic only — the click is not in this stream
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'audio/webm', ext = extFor(type), blob = new Blob(chunks, { type });
      if (S.take) URL.revokeObjectURL(S.take.url);
      S.take = { blob, url: URL.createObjectURL(blob), ext, name: fileName(S.inst, S.bpm, ext, new Date(), S.song.title) };
      S.state = 'idle'; S.i = -1; S.msg = 'Take saved — download it, then drop it in the Christmas special folder in Drive.';
      cleanup(); draw();
    };
    const sch = schedule(S.song, S.bpm), spb = 60 / S.bpm, t0 = ac.currentTime + 0.3;
    sch.clicks.forEach((c) => click(t0 + c.t, c.accent));
    if (S.guide) sch.notes.forEach((n) => guideTone(t0 + n.t, n.name, n.beats, spb));
    rec.start();
    S.state = 'count'; S.take && (S.take = S.take); S.msg = '';
    const tick = () => {
      const now = ac.currentTime - t0;
      if (now < sch.songStart) { S.state = 'count'; S.count = Math.max(1, Math.floor(now / spb) % S.song.beatsPerBar + 1); }
      else { S.state = 'rec'; let k = S.i < 0 ? 0 : S.i; while (k + 1 < sch.notes.length && sch.notes[k + 1].t <= now) k++; S.i = k; }
      draw();
      if (now >= sch.end + spb) { if (rec.state !== 'inactive') rec.stop(); return; }
      raf = requestAnimationFrame(() => timers.push(setTimeout(tick, 60)));
    };
    tick();
  }

  function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); else { cleanup(); S.state = 'idle'; draw(); } }

  async function downloadWav() {
    if (!S.take) return;
    ac = ac || new (root.AudioContext || root.webkitAudioContext)();
    const ab = await ac.decodeAudioData(await S.take.blob.arrayBuffer());
    const ch = []; for (let c = 0; c < ab.numberOfChannels; c++) ch.push(ab.getChannelData(c));
    const url = URL.createObjectURL(new Blob([encodeWav(ch, ab.sampleRate)], { type: 'audio/wav' }));
    const a = root.document.createElement('a'); a.href = url; a.download = S.take.name.replace(/\.\w+$/, '.wav'); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** The app renders the song itself: piano, tongue drum and ukulele stems at
      the chosen tempo, plus a stereo mix — all WAV, all sample-aligned. */
  function renderEnsemble() {
    S.msg = 'Rendering…'; draw();
    setTimeout(() => {
      const want = root.MF_RENDER.VOICES.map(([id]) => id).filter((id) => S.include[id]);
      if (!want.length) { S.msg = 'Tick at least one instrument.'; draw(); return; }
      const r = root.MF_RENDER.render(S.song, S.bpm, { include: want });
      const save = (chs, name) => {
        const url = URL.createObjectURL(new Blob([encodeWav(chs, r.sampleRate)], { type: 'audio/wav' }));
        const a = root.document.createElement('a'); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      };
      const base = `${slug(S.song.title)}_${S.bpm}bpm`, names = Object.keys(r.stems);
      names.forEach((k) => save([r.stems[k]], `${base}_${INST_FILE[k] || k}_stem.wav`));
      save(r.mix, `${base}_ensemble_mix.wav`);
      S.msg = `Rendered ${Math.round(r.seconds)} s: ${names.length} stem${names.length === 1 ? '' : 's'} (${names.join(', ')}) and a mix.`; draw();
    }, 30);
  }

  function onClick(ev) {
    const t = ev.target.closest('[data-r]'); if (!t || !host.contains(t)) return;
    switch (t.dataset.r) {
      case 'inst': if (S.state === 'idle') { S.inst = t.dataset.v; if (root.MF_RECORD.onInst) root.MF_RECORD.onInst(S.inst); draw(); } break;
      case 'tip': S.tip = !S.tip; draw(); break;
      case 'guide': S.guide = !S.guide; draw(); break;
      case 'go': S.state === 'idle' ? start() : stopRec(); break;
      case 'wav': downloadWav(); break;
      case 'render': renderEnsemble(); break;
      case 'pick': S.picking = !S.picking; draw(); break;
    }
  }
  function onInput(ev) {
    const d = ev.target.dataset || {};
    if (d.r === 'bpm') { S.bpm = +ev.target.value; draw(); }
    if (d.r === 'incl') { S.include[d.v] = !!ev.target.checked; draw(); }
  }

  let wired = false;
  function mount(el, opts) {
    host = el;
    if (opts && S.state === 'idle' && INST_FILE[opts.inst]) S.inst = opts.inst;
    if (opts && S.state === 'idle' && opts.song) { const x = forSong(opts.song); if (x !== S.song && (x.id !== S.song.id || x.notes.length !== S.song.notes.length)) { S.song = x; S.bpm = x.tempo; S.i = -1; } }
    if (!wired && root.document) { wired = true;
      root.document.addEventListener('click', (e) => host && host.isConnected && onClick(e));
      root.document.addEventListener('change', (e) => host && host.isConnected && onInput(e)); }
    draw();
  }
  function unmount() { stopRec(); host = null; }

  root.MF_RECORD = { SONG, forSong, chordAt, chordTimeline, slug, placeNote, schedule, fileName, pickMime, extFor, encodeWav, mount, unmount, _state: S };
})(typeof globalThis !== 'undefined' ? globalThis : this);
