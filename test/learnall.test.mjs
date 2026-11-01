import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['instruments.js', 'songlesson.js', 'learn.js', 'render.js', 'record.js', 'ux.js']) await import(pathToFileURL(path.join(here, '..', f)).href);
const { MF_LEARN: L, MF_SONGLESSON: SL, MF_RENDER: X, MF_RECORD: R, MF_UX: U } = globalThis;

// The real Songbook, pulled out of index.html so the test checks the shipped songs.
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf('const BUILTIN=['), html.indexOf('let SONGS=BUILTIN'));
const ctx = { MF: globalThis.MF };
vm.runInNewContext(`const parse=s=>MF.parseNotation(s).map(e=>(e.bar||e.rest)?e:{pad:e.tok,dur:e.dur,art:e.art});
const L=(label,s,c)=>({label,notes:parse(s),chords:c?MF.parseNotation(c):null});\n${src}\nthis.BUILTIN=BUILTIN;`, ctx);
const BOOK = ctx.BUILTIN;

const fakeHost = () => ({ innerHTML: '', isConnected: true, querySelector: () => null, contains: () => true });

test('bug: Learn with piano selected draws the piano, not the drum', () => {
  for (const [inst, mark, not] of [['piano', 'data-learn-piano', 'data-learn-drum'], ['drum', 'data-learn-drum', 'data-learn-piano'],
    ['ukulele', 'data-learn-uke', 'data-learn-drum'], ['harmonica', 'data-learn-harmonica', 'data-learn-drum'], ['kalimba', 'data-learn-kalimba', 'data-learn-drum']]) {
    const h = fakeHost();
    L.mount(h, { inst, song: SL.fromSong(BOOK.find((s) => s.id === 'jingle')) });
    assert.ok(h.innerHTML.includes(mark), `${inst} shows ${mark}`);
    assert.ok(!h.innerHTML.includes(not), `${inst} does not show ${not}`);
    L.unmount();
  }
  // and the song screen's Learn button always goes to Learn, never the drum step-through
  for (const s of BOOK) assert.equal(U.primary('learn', s).action, 'lesson', s.id);
});

test('every Songbook song converts to a lesson from its own pads, with total beats preserved', () => {
  for (const s of BOOK) {
    const x = SL.fromSong(s);
    assert.ok(x.notes.length > 0, s.id);
    const pads = s.lines.flatMap((l) => l.notes.filter((e) => !e.bar));
    const beats = pads.reduce((a, e) => a + e.dur, 0);
    assert.equal(x.notes.reduce((a, [, d]) => a + d, 0), beats, s.id);
    for (const [n] of x.notes) assert.ok(L.parseNote(n), `${s.id}: ${n}`);
    assert.equal(x.beatsPerBar, parseInt(s.meter, 10));
  }
  const sil = SL.fromSong(BOOK.find((s) => s.id === 'silent'));
  assert.equal(sil.beatsPerBar, 3);
  assert.deepEqual(sil.notes.slice(0, 4), [['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3]]);
});

test('melody-only: a song with no chord line has no chords and no uke stem', () => {
  const song = { id: 'my-x', title: 'Mine', meter: '4/4', bpm: 90, lines: [{ notes: '1 2 3 1' }] };
  const x = SL.fromSong(song);
  assert.ok(x.melodyOnly); assert.deepEqual(x.chords, []);
  const r = X.render(R.forSong(song), 90, { sampleRate: 8000, include: ['drum', 'ukulele'] });
  assert.deepEqual(Object.keys(r.stems), ['drum']);
  assert.equal(BOOK.filter((s) => SL.fromSong(s).melodyOnly).length, 0, 'all built-ins have chords');
});

test('Record: Silent Night counts in 2 bars of 3/4 at its own 66 BPM', () => {
  const song = R.forSong(BOOK.find((s) => s.id === 'silent'));
  assert.equal(song.beatsPerBar, 3); assert.equal(song.tempo, 66);
  const sch = R.schedule(song, song.tempo);
  assert.equal(sch.clicks.filter((c) => c.countIn).length, 6);
  assert.ok(Math.abs(sch.songStart - 6 * 60 / 66) < 1e-9);
  assert.deepEqual(sch.clicks.slice(0, 4).map((c) => c.accent), [true, false, false, true]);
  assert.equal(R.chordAt(song, 0), 'C'); assert.equal(R.chordAt(song, 12), 'G7');
});

test('Record: a pickup shortens the count-in so bar 1 lands on the accent (Happy Birthday)', () => {
  const song = R.forSong(BOOK.find((s) => s.id === 'birthday'));
  const sch = R.schedule(song, 96);
  assert.equal(sch.clicks.filter((c) => c.countIn).length, 5);
  const firstBar = sch.clicks.find((c) => Math.abs(c.t - sch.songStart - 60 / 96) < 1e-9);
  assert.ok(firstBar.accent);
  assert.equal(R.fileName('harmonica', 96, 'wav', new Date(2026, 10, 1, 9, 0), song.title), 'happy-birthday-to-you_harmonica_96bpm_20261101-0900.wav');
});

test('ensemble renders only the ticked instruments, aligned and unclipped', () => {
  const song = R.forSong(BOOK.find((s) => s.id === 'twinkle'));
  const r = X.render(song, 84, { sampleRate: 8000, include: ['harmonica', 'kalimba', 'piano'] });
  assert.deepEqual(Object.keys(r.stems), ['piano', 'harmonica', 'kalimba']);
  for (const a of [...Object.values(r.stems), ...r.mix]) { const p = X.peakOf(a); assert.ok(p > 0.05 && p < 0.95); }
  assert.ok(Object.values(r.stems).every((a) => a.length === r.mix[0].length));
});

test('harmonica: Richter C layout, tab notation, unplayable notes flagged', () => {
  assert.deepEqual(SL.harpHole('C4'), { hole: 1, dir: 'blow', tab: '1', text: 'Hole 1, blow' });
  assert.equal(SL.harpHole('D4').tab, '-1');
  assert.equal(SL.harpHole('B4').tab, '-3');
  assert.equal(SL.harpHole('F5').tab, '-5');
  assert.equal(SL.harpHole('A4'), null);
  assert.match(SL.harpProblem('A4'), /bend/);
  assert.match(SL.harpProblem('G3'), /below/);
  assert.equal(L.where('E4', 'harmonica').text, 'Hole 2, blow');
  const h = fakeHost(); L.mount(h, { inst: 'harmonica', song: SL.fromSong(BOOK.find((s) => s.id === 'twinkle')) });
  assert.ok(h.innerHTML.includes('data-learn-harp-flag') && h.innerHTML.includes('A4'));
  L.unmount();
});

test('kalimba: 17 keys C4–E6, middle tine is C4', () => {
  assert.equal(SL.KALIMBA_LAYOUT.length, 17);
  assert.equal(SL.KALIMBA_LAYOUT[8], 'C4');
  assert.equal(SL.kalimbaTine('C5').num, '1°');
  assert.equal(SL.kalimbaTine('F#4'), null);
});
