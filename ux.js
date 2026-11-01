/* The simple flow: pick a song, your instrument is remembered, then one
   mode (Listen / Learn / Record) and one big button. Pure logic only, so
   the unit tests can check it without a browser. */
(function (root) {
  'use strict';
  const MODES = [['listen', 'Listen'], ['learn', 'Learn'], ['record', 'Record']];
  const INSTRUMENTS = [['drum', 'Tongue drum', '🥁'], ['ukulele', 'Ukulele', '🪕'], ['piano', 'Piano', '🎹'], ['harmonica', 'Harmonica', '🎵'], ['kalimba', 'Kalimba', '🎶']];
  // Songbook ids with a hand-written lesson (and tip) in learn.js. Every other
  // song is taught from its own Songbook notes (songlesson.js).
  const LESSON_FOR = { twinkle: 'twinkle', ode: 'ode', mary: 'mary' };
  const FILTERS = [['all', 'All'], ['uke', 'Chords'], ['mine', 'Mine'], ['christmas', 'Christmas']];

  function lessonFor(id) { return LESSON_FOR[id] || null; }
  /** Every song with notes can be recorded along to now. */
  function canRecord(id) { return !!id; }

  /* What the big button says and does for a mode on a song. */
  function primary(mode, song, playing) {
    const id = song && song.id;
    if (mode === 'learn') return lessonFor(id)
      ? { label: '▶ Start lesson', action: 'lesson', lesson: lessonFor(id) }
      : { label: '▶ Start lesson', action: 'lesson', song: id };
    if (mode === 'record') return canRecord(id)
      ? { label: '● Record', action: 'record' }
      : { label: '● Record', action: 'capture' };
    return { label: playing ? '■ Stop' : '▶ Play', action: 'play' };
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  function filterSongs(songs, filter, query, hasUke) {
    const q = norm(query).trim();
    return songs.filter((x) => {
      const ok = filter === 'uke' ? hasUke(x)
        : filter === 'mine' ? !!(x.custom || x.edited)
        : filter === 'christmas' ? norm(x.cat).indexOf('christmas') >= 0
        : true;
      return ok && (!q || norm(x.title).indexOf(q) >= 0 || norm(x.cat).indexOf(q) >= 0);
    });
  }

  /* At most one small badge per card, and only when it matters to you. */
  function badge(song, inst, hasUke) {
    if (inst === 'ukulele' && !hasUke(song)) return 'Melody only on uke';
    if (inst === 'ukulele' && song.chordsGuess) return 'Chords · guess';
    if (song.flag) return 'Needs fixing';
    return '';
  }

  root.MF_UX = { MODES, INSTRUMENTS, FILTERS, lessonFor, canRecord, primary, filterSongs, badge, norm };
})(typeof window !== 'undefined' ? window : globalThis);
