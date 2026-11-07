import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'instruments.js')).href);
await import(pathToFileURL(path.join(here, '..', 'learn.js')).href);
const L = globalThis.MF_LEARN;

test('parseNote: names to MIDI', () => {
  assert.equal(L.parseNote('C4').midi, 60);
  assert.equal(L.parseNote('A4').midi, 69);
  assert.equal(L.parseNote('F#4').midi, 66);
  assert.equal(L.parseNote('Bb3').midi, 58);
  assert.equal(L.parseNote('H2'), null);
});

test('staff: E4 is the bottom line, F5 the top, middle C needs one ledger line', () => {
  assert.equal(L.staffStep('E4'), 0);
  assert.equal(L.staffStep('F5'), 8);
  assert.equal(L.staffStep('C4'), -2);
  assert.deepEqual(L.ledgerLines(-2), [-2]);
  assert.deepEqual(L.ledgerLines(4), []);
  assert.deepEqual(L.ledgerLines(10), [10]);
  assert.ok(L.onLine(L.staffStep('G4')));
  assert.ok(!L.onLine(L.staffStep('F4')));
});

test('piano: 25 keys C3–C5, five black keys per octave', () => {
  const keys = L.pianoKeys();
  assert.equal(keys[0].midi, 48);
  assert.equal(keys.length, 25);
  assert.equal(keys.filter((k) => k.black).length, 10);
  assert.equal(L.pianoFinger(60), 1);
  assert.equal(L.KEY_MAP.a, 60);
});

test('drum: pads agree with the drum engraving', () => {
  assert.equal(L.drumPad('C4'), '1');
  assert.equal(L.drumPad('G3'), '5.');
  assert.equal(L.drumPad('E5'), '.3');
  assert.equal(L.drumPad('F#4'), null);
});

test('ukulele: lowest fret wins on re-entrant GCEA', () => {
  assert.deepEqual(L.ukePosition('C4'), { string: 1, stringName: 'C', fret: 0 });
  assert.deepEqual(L.ukePosition('D4'), { string: 1, stringName: 'C', fret: 2 });
  assert.deepEqual(L.ukePosition('G4'), { string: 0, stringName: 'G', fret: 0 });
  assert.equal(L.ukePosition('C3'), null);
});

test('every lesson plays on every instrument and has a sane timeline', () => {
  for (const lesson of L.LESSONS) {
    for (const inst of ['piano', 'drum', 'ukulele']) assert.ok(L.playableOn(lesson, inst), `${lesson.id} on ${inst}`);
    const t = L.timeline(lesson.notes);
    assert.equal(t.starts[0], 0);
    assert.ok(t.total > 0);
  }
});

test('step mode only accepts the right note in the right octave', () => {
  assert.ok(L.isRight('C4', 60));
  assert.ok(!L.isRight('C4', 72));
  assert.ok(!L.isRight('C4', 62));
});

test('where: words a beginner can follow', () => {
  assert.equal(L.where('C4', 'piano').text, 'Middle C');
  assert.equal(L.where('E4', 'drum').text, 'Pad 3');
  assert.equal(L.where('A4', 'ukulele').text, 'A string, open');
});


test('two-hand groups share onsets; other instruments and right-only omit bass', () => {
  const mary = L.LESSONS.find((l) => l.id === 'mary');
  assert.deepEqual(L.lessonGroups(mary)[0].notes.map((e) => e.name), ['C3', 'E4']);
  assert.equal(L.lessonEvents(mary, 'piano', 'right').length, mary.notes.length);
  for (const inst of ['drum', 'ukulele']) {
    assert.equal(L.lessonEvents(mary, inst).length, mary.notes.length);
    assert.ok(L.lessonEvents(mary, inst).every((e) => e.hand === 'RH'));
    assert.ok(L.playableOn(mary, inst));
  }
  for (const lesson of L.LESSONS) for (const e of L.lessonEvents(lesson)) {
    assert.ok(e.duration > 0 && e.start >= 0);
    assert.ok(e.start + e.duration <= L.timeline(lesson.notes).total);
  }
});

test('falling notes align with white/black keys and length is proportional to beats', () => {
  const events = [{ name: 'C3', start: 0, duration: 2, hand: 'LH' }, { name: 'C#4', start: 2, duration: 1, hand: 'RH' }];
  const bars = L.fallingBars(events, 0), keys = L.keyLayout().keys;
  assert.equal(bars[0].y + bars[0].height, 220);
  assert.equal(bars[0].height, 2 * bars[1].height);
  for (const bar of bars) {
    const key = keys.find((k) => k.midi === L.parseNote(bar.name).midi);
    assert.equal(bar.x, key.x); assert.equal(bar.width, key.width);
  }
  assert.equal(L.fallingBars(events, 1)[0].y - bars[0].y, 38);
  assert.equal(L.fallingBars(events, 2)[1].y + bars[1].height, 220);
});

test('MIDI note-on: all channels, exact pitch, no release or velocity-zero advances', () => {
  assert.equal(L.midiNoteOn([0x90, 48, 100]), 48);
  assert.equal(L.midiNoteOn([0x9f, 76, 1]), 76);
  for (const data of [[0x90, 60, 0], [0x80, 60, 90], [0xb0, 64, 127], [0xf8], [], null]) assert.equal(L.midiNoteOn(data), null);
});


// Isolated browser-like harness: real view/events, fake clock and MIDI ports.
function view(navigator = {}) {
  const listeners = {}, timers = new Map(), frames = new Map(); let next = 0, now = 0;
  const status = { textContent: '' }, host = { innerHTML: '', isConnected: true,
    contains: () => true, querySelector: (q) => q === '[data-learn-now]' ? status : null };
  const context = vm.createContext({ navigator, performance: { now: () => now },
    document: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => { const id = ++next; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  vm.runInContext(fs.readFileSync(path.join(here, '..', 'learn.js'), 'utf8'), context);
  const api = context.MF_LEARN;
  api.mount(host, { inst: 'piano', lesson: 'mary' });
  const click = (l, v) => {
    const target = { dataset: l === 'note' ? { midi: String(v) } : { l, v }, closest() { return this; } };
    listeners.click({ target });
  };
  return { api, host, click, listeners, timers, frames, status,
    tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); now += timer.delay; timer.callback(); return timer.delay; } };
}

test('view keeps staff plus falling notes; Step waits for BOTH hands, exact octaves', () => {
  const v = view();
  assert.match(v.host.innerHTML, /data-learn-falling/);
  assert.match(v.host.innerHTML, /Left hand bass staff/);
  assert.match(v.host.innerHTML, /data-midi="48"/);
  v.click('view', 'staff'); assert.doesNotMatch(v.host.innerHTML, /data-learn-falling/);
  v.click('view', 'falling'); assert.match(v.host.innerHTML, /display:none;overflow-x/);
  v.click('mode', 'step'); v.click('go');
  v.click('note', 64); assert.equal(v.api._state.i, 0);
  v.click('note', 60); assert.equal(v.api._state.i, 0); // wrong octave for LH
  v.click('note', 48); assert.equal(v.api._state.i, 1);
  v.click('note', 62); assert.equal(v.api._state.i, 2);
  v.click('hands', 'right'); v.click('go');
  v.click('note', 64); assert.equal(v.api._state.i, 1);
  v.api.unmount();
});

test('laptop home row retained, Shift adds bass; text inputs and repeats ignored', () => {
  const v = view(); v.click('mode', 'step'); v.click('go');
  const key = (key, opts = {}) => v.listeners.keydown({ key, target: { tagName: 'BODY' }, preventDefault() {}, ...opts });
  key('d', { repeat: true }); assert.equal(v.api._state.matched.size, 0);
  key('d', { target: { tagName: 'INPUT' } }); assert.equal(v.api._state.matched.size, 0);
  key('d'); assert.equal(v.api._state.i, 0);
  key('A', { shiftKey: true }); assert.equal(v.api._state.i, 1);
  v.api.unmount();
});

test('Watch counts in, animates, schedules hand groups at tempo, and cleans up', () => {
  const v = view(); v.click('go');
  assert.equal(v.api._state.i, -1); assert.equal(v.frames.size, 1);
  assert.equal(v.tick(), 4 * 60000 / 90);
  assert.equal(v.api._state.i, 0);
  assert.equal(v.tick(), 60000 / 90);
  assert.equal(v.api._state.i, 1);
  v.api.unmount(); assert.equal(v.timers.size, 0); assert.equal(v.frames.size, 0);
});

test('MIDI is opt-in, handles repeat/release and hotplug, detaches on unmount', async () => {
  let requests = 0;
  const port = { id: 'minilab', state: 'connected', onmidimessage: null };
  const access = { inputs: new Map([['minilab', port]]), onstatechange: null };
  const v = view({ requestMIDIAccess: async (opts) => { requests++; assert.equal(opts.sysex, false); return access; } });
  assert.equal(requests, 0);
  v.click('midi'); await new Promise(setImmediate);
  assert.equal(requests, 1); assert.match(v.host.innerHTML, /MIDI connected/);
  v.click('lesson', '0'); v.click('mode', 'step'); v.click('go');
  port.onmidimessage({ data: [0x9f, 60, 100] }); assert.equal(v.api._state.i, 1);
  port.onmidimessage({ data: [0x9f, 60, 100] }); assert.equal(v.api._state.i, 1);
  port.onmidimessage({ data: [0x9f, 60, 0] });
  port.onmidimessage({ data: [0x9f, 62, 0] }); assert.equal(v.api._state.i, 1);
  port.onmidimessage({ data: [0x9f, 62, 100] }); assert.equal(v.api._state.i, 2);
  port.state = 'disconnected'; access.onstatechange();
  assert.equal(port.onmidimessage, null); assert.match(v.host.innerHTML, /No MIDI keyboard found/);
  port.state = 'connected'; access.onstatechange(); assert.equal(typeof port.onmidimessage, 'function');
  v.api.unmount(); assert.equal(access.onstatechange, null); assert.equal(port.onmidimessage, null);
});

test('MIDI unavailable/denied gracefully falls back to screen input', async () => {
  for (const nav of [{}, { requestMIDIAccess: async () => { throw new Error('denied'); } }]) {
    const v = view(nav); v.click('midi'); await new Promise(setImmediate);
    assert.match(v.host.innerHTML, /unavailable|permission denied/);
    v.click('mode', 'step'); v.click('go'); v.click('note', 48); v.click('note', 64);
    assert.equal(v.api._state.i, 1); v.api.unmount();
  }
});
