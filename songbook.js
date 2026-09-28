/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — your songbook.

   The songs that ship with the app are in the app. The ones you write, and
   the built-in ones you correct, are yours, and they live on the phone —
   which is the problem: a phone is lost, replaced or reset, and an installed
   web app's storage goes with it. So they are kept here in plain text, and
   the whole book can be written to a file and read back.

   A saved song is text all the way down — "5.*.5 5.*.5 | 6. 5. 1" — in the
   same notation the book is written in, so a saved file is readable by a
   person and survives the app changing its insides.

   No DOM. The app hands in and takes out plain objects.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const KIND = 'melodyflow-songbook';
  const VERSION = 1;

  /** The drum's views call a token a pad; the notation writer wants a tok. */
  function write(events) {
    const MF = root.MF;
    return MF.writeNotation((events || []).map((e) => (e.pad !== undefined ? { ...e, tok: e.pad } : e)));
  }

  /** A song as text, the form it is stored and exported in. */
  function serialize(song) {
    const out = {
      id: song.id,
      title: song.title,
      cat: song.cat || 'My songs',
      level: song.level || 1,
      bpm: song.bpm || 84,
      meter: song.meter || '4/4',
      lines: song.lines.map((l) => {
        const line = { label: l.label || '', notes: typeof l.notes === 'string' ? l.notes : write(l.notes) };
        if (l.chords && l.chords.length) line.chords = typeof l.chords === 'string' ? l.chords : write(l.chords);
        return line;
      }),
    };
    if (song.pickup) out.pickup = song.pickup;
    if (song.custom) out.custom = true;
    return out;
  }

  /** Is this something that could be a saved song? Anything else is dropped. */
  function valid(s) {
    return !!s && typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(s.id) &&
      typeof s.title === 'string' && Array.isArray(s.lines) && s.lines.length > 0 &&
      s.lines.every((l) => l && notation(l.notes) && (l.chords === undefined || notation(l.chords)));
  }

  /** Only what the notation is written with: pads, chord names, lengths, strums, bars. */
  const notation = (v) => typeof v === 'string' && /^[A-Za-z0-9.#*\/|\s-]*$/.test(v);

  const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const text = (v, max, dflt) => (typeof v === 'string' ? v.slice(0, max) : dflt);

  /**
   * A song read from storage or a file, reduced to the fields the app uses and
   * the kinds it expects. A file can come from anywhere, and the app writes
   * some of these straight into the page, so a tempo is a number and a meter
   * looks like one — nothing else gets through.
   */
  function clean(s) {
    if (!valid(s)) return null;
    const out = {
      id: s.id,
      title: text(s.title, 120, 'Untitled'),
      cat: text(s.cat, 60, 'My songs'),
      level: Math.round(num(s.level, 1, 3, 1)),
      bpm: Math.round(num(s.bpm, 30, 240, 84)),
      meter: /^\d{1,2}\/\d{1,2}$/.test(s.meter) ? s.meter : '4/4',
      lines: s.lines.slice(0, 200).map((l) => {
        const line = { label: text(l.label, 200, ''), notes: l.notes.slice(0, 2000) };
        if (typeof l.chords === 'string' && l.chords.trim()) line.chords = l.chords.slice(0, 2000);
        return line;
      }),
    };
    const pickup = num(s.pickup, 0, 11, 0);
    if (pickup) out.pickup = pickup;
    if (s.custom === true) out.custom = true;
    return out;
  }

  /**
   * The book as you see it: every built-in song, with your version in its
   * place where you have changed it, then the songs that are only yours.
   * Order of the built-ins is kept, so a corrected song does not move.
   */
  function merge(builtIns, saved) {
    const mine = new Map((saved || []).map((s) => [s.id, s]));
    const out = builtIns.map((b) => (mine.has(b.id) ? { song: mine.get(b.id), edited: true, original: b } : { song: b, edited: false }));
    for (const s of saved || []) {
      if (!builtIns.some((b) => b.id === s.id)) out.push({ song: s, custom: true });
    }
    return out;
  }

  /** Put a song in the saved list, replacing the one with its id. */
  function upsert(saved, song) {
    const list = (saved || []).filter((s) => s.id !== song.id);
    list.push(song);
    return list;
  }

  /** Everything worth keeping, as one file. */
  function bundle({ songs, drill, now }) {
    return { kind: KIND, version: VERSION, exported: now || new Date().toISOString(), songs: songs || [], drill: drill || {} };
  }

  /**
   * Read a file back. Throws with a sentence a person can act on when the file
   * is not a MelodyFlow songbook; drops, and counts, songs it cannot read.
   */
  function unbundle(text) {
    let data;
    try {
      data = typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
      throw new Error('That file is not a MelodyFlow songbook — it could not be read.');
    }
    if (!data || data.kind !== KIND) throw new Error('That file is not a MelodyFlow songbook.');
    if (data.version > VERSION) throw new Error('That songbook was saved by a newer MelodyFlow. Update the app, then load it again.');
    const all = Array.isArray(data.songs) ? data.songs : [];
    const songs = all.map(clean).filter(Boolean);
    const drill = data.drill && typeof data.drill === 'object' && !Array.isArray(data.drill) ? data.drill : {};
    return { songs, drill, skipped: all.length - songs.length, exported: data.exported || null };
  }

  /** Songs from a file win over what is on the phone; nothing else is lost. */
  function absorb(saved, incoming) {
    return incoming.reduce((list, s) => upsert(list, s), saved || []);
  }

  root.MF_SONGBOOK = { KIND, VERSION, write, serialize, valid, clean, merge, upsert, bundle, unbundle, absorb };
})(typeof globalThis !== 'undefined' ? globalThis : this);
