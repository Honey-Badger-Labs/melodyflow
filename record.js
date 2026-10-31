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
    title: 'Jingle Bells', composer: 'James Lord Pierpont (1857)', beatsPerBar: 4,
    notes: [...VERSE, ...CHORUS], chords: [...VERSE_CHORDS, ...CHORUS_CHORDS], tempo: 110,
  };

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
    const spb = 60 / bpm, lead = countBars * song.beatsPerBar;
    let beat = lead;
    const notes = song.notes.map(([n, d]) => { const t = beat * spb; beat += d; return { name: n, beats: d, t }; });
    const clicks = [];
    for (let b = 0; b <= beat; b++) clicks.push({ t: b * spb, accent: b % song.beatsPerBar === 0, countIn: b < lead });
    return { notes, clicks, songStart: lead * spb, end: beat * spb };
  }

  function fileName(inst, bpm, ext, d = new Date()) {
    const p = (x) => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    return `jingle-bells_${inst === 'drum' ? 'tongue-drum' : 'ukulele'}_${bpm}bpm_${stamp}.${ext}`;
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
  const S = { inst: 'drum', bpm: 110, guide: true, state: 'idle', i: -1, bar: -1, count: 0, take: null, msg: '' };
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
    const [name] = SONG.notes[k] || [];
    if (!name) return '';
    const w = placeNote(name, S.inst);
    if (!w) return esc(name);
    return S.inst === 'drum' ? `<b style="font-size:44px">${esc(String(w.pad))}</b>` : `<b style="font-size:24px">${esc(w.stringName)} string · fret ${w.fret}</b>`;
  }

  function draw() {
    if (!host) return;
    const sch = schedule(SONG, S.bpm);
    const btn = (a, v, label, on) => `<button data-r="${a}" data-v="${v}" class="mf-btn" style="border:1px solid ${on ? ACC : '#3a3d47'};background:${on ? '#2b2741' : 'transparent'};color:${on ? '#d2cefd' : INK}">${label}</button>`;
    const busy = S.state !== 'idle';
    const bar = S.i >= 0 ? Math.floor((sch.notes[S.i].t - sch.songStart) / (60 / S.bpm) / 4) : -1;
    const strip = SONG.notes.map(([n, d], k) => {
      const w = placeNote(n, S.inst), lab = S.inst === 'drum' ? (w ? w.pad : '?') : (w ? `${w.stringName}${w.fret}` : '?');
      return `<span data-rec-note="${k}" style="display:inline-block;min-width:${Math.max(26, d * 26)}px;padding:6px 2px;text-align:center;border-radius:6px;${k === S.i ? `background:${ACC};color:#161826;` : ''}${w && w.raised ? 'text-decoration:underline dotted;' : ''}">${esc(String(lab))}</span>`;
    }).join('');
    host.innerHTML = `<div data-record class="mf-record" style="padding:10px 16px;display:flex;flex-direction:column;gap:10px">
      <div class="mf-row"><span style="font:500 20px var(--font-heading,serif);margin-right:8px">Record · Jingle Bells</span>
        ${btn('inst', 'drum', 'Tongue drum', S.inst === 'drum')}${btn('inst', 'ukulele', 'Ukulele', S.inst === 'ukulele')}
        <label style="font:400 13px Inter,sans-serif;color:${DIM}">Tempo <input data-r="bpm" type="range" min="60" max="140" value="${S.bpm}" ${busy ? 'disabled' : ''}> ${S.bpm} BPM</label>
        ${btn('guide', '', S.guide ? 'Guide melody: on' : 'Guide melody: off', S.guide)}
        ${btn('go', '', busy ? '■ Stop' : '● Record', busy)}
        ${root.MF_RENDER ? btn('render', '', '♫ Render ensemble (WAV stems + mix)', false) : ''}</div>
      <div style="font:400 12.5px/1.5 Inter,sans-serif;color:#a2a4b0">🎧 Wear headphones: the click and guide play in your ears and are never written to the take, but open speakers would leak into the mic. 2-bar count-in (8 clicks), then play along. Dotted-underlined notes are raised an octave to fit the instrument.</div>
      <div class="mf-record-stage">
        <div data-rec-now style="background:#17181c;border-radius:10px;padding:14px;text-align:center;color:${ACC};min-height:110px">
          ${S.state === 'count' ? `<b style="font-size:44px">${S.count}</b><div>count-in</div>` : S.i >= 0 ? `${noteCard(S.i)}${S.inst === 'ukulele' ? `<div style="color:${INK};font-size:20px">Chord: ${SONG.chords[bar] || ''}</div>` : ''}<div style="color:${DIM}">next: ${noteCard(S.i + 1).replace(/font-size:\d+px/, 'font-size:16px')}</div>` : `<span style="color:${DIM}">${esc(S.msg || 'Ready. Press ● Record.')}</span>`}
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
      S.take = { blob, url: URL.createObjectURL(blob), ext, name: fileName(S.inst, S.bpm, ext) };
      S.state = 'idle'; S.i = -1; S.msg = 'Take saved — download it, then drop it in the Christmas special folder in Drive.';
      cleanup(); draw();
    };
    const sch = schedule(SONG, S.bpm), spb = 60 / S.bpm, t0 = ac.currentTime + 0.3;
    sch.clicks.forEach((c) => click(t0 + c.t, c.accent));
    if (S.guide) sch.notes.forEach((n) => guideTone(t0 + n.t, n.name, n.beats, spb));
    rec.start();
    S.state = 'count'; S.take && (S.take = S.take); S.msg = '';
    const tick = () => {
      const now = ac.currentTime - t0;
      if (now < sch.songStart) { S.state = 'count'; S.count = Math.max(1, Math.floor(now / spb) % 4 + 1); }
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
      const r = root.MF_RENDER.render(SONG, S.bpm);
      const save = (chs, name) => {
        const url = URL.createObjectURL(new Blob([encodeWav(chs, r.sampleRate)], { type: 'audio/wav' }));
        const a = root.document.createElement('a'); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      };
      const base = `jingle-bells_${S.bpm}bpm`;
      save([r.stems.piano], `${base}_piano_stem.wav`);
      save([r.stems.drum], `${base}_tongue-drum_stem.wav`);
      save([r.stems.ukulele], `${base}_ukulele_stem.wav`);
      save(r.mix, `${base}_ensemble_mix.wav`);
      S.msg = `Rendered ${Math.round(r.seconds)} s: three stems and a mix.`; draw();
    }, 30);
  }

  function onClick(ev) {
    const t = ev.target.closest('[data-r]'); if (!t || !host.contains(t)) return;
    switch (t.dataset.r) {
      case 'inst': if (S.state === 'idle') { S.inst = t.dataset.v; draw(); } break;
      case 'guide': S.guide = !S.guide; draw(); break;
      case 'go': S.state === 'idle' ? start() : stopRec(); break;
      case 'wav': downloadWav(); break;
      case 'render': renderEnsemble(); break;
    }
  }
  function onInput(ev) { if (ev.target.dataset && ev.target.dataset.r === 'bpm') { S.bpm = +ev.target.value; draw(); } }

  let wired = false;
  function mount(el) {
    host = el;
    if (!wired && root.document) { wired = true;
      root.document.addEventListener('click', (e) => host && host.isConnected && onClick(e));
      root.document.addEventListener('change', (e) => host && host.isConnected && onInput(e)); }
    draw();
  }
  function unmount() { stopRec(); host = null; }

  root.MF_RECORD = { SONG, placeNote, schedule, fileName, pickMime, extFor, encodeWav, mount, unmount, _state: S };
})(typeof globalThis !== 'undefined' ? globalThis : this);
