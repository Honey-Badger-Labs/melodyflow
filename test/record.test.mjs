import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ['instruments.js', 'learn.js', 'record.js']) await import(pathToFileURL(path.join(here, '..', f)).href);
const R = globalThis.MF_RECORD;

test('Jingle Bells: 32 whole 4/4 bars (16 verse + 16 chorus), one chord per bar', () => {
  const beats = R.SONG.notes.reduce((a, [, d]) => a + d, 0);
  assert.equal(beats, 128);
  assert.equal(R.SONG.chords.length, 32);
  assert.ok(R.SONG.chords.every((c) => ['C', 'F', 'G7'].includes(c)));
});

test('chorus opens E E E, E E E, E G C D E and ends G G F D C', () => {
  const n = R.SONG.notes.map(([x]) => x.replace(/\d/, ''));
  const chorus = n.slice(n.length - 51);
  assert.deepEqual(chorus.slice(0, 11), 'E E E E E E E G C D E'.split(' '));
  assert.deepEqual(n.slice(-5), 'G G F D C'.split(' '));
  assert.deepEqual(n.slice(0, 5), 'G E D C G'.split(' '));
});

test('every note is playable on drum and ukulele (low notes raised on uke)', () => {
  for (const [name] of R.SONG.notes) {
    const d = R.placeNote(name, 'drum'), u = R.placeNote(name, 'ukulele');
    assert.ok(d && !d.raised, `drum ${name}`);
    assert.ok(u, `uke ${name}`);
  }
  assert.ok(R.placeNote('G3', 'ukulele').raised);
});

test('schedule: 2-bar count-in then notes on the beat', () => {
  const s = R.schedule(R.SONG, 120);
  assert.equal(s.songStart, 4); // 8 beats at 0.5 s
  assert.equal(s.notes[0].t, 4);
  assert.equal(s.clicks.filter((c) => c.countIn).length, 8);
  assert.ok(s.clicks[0].accent && !s.clicks[1].accent);
  assert.equal(s.end, 4 + 64);
});

test('file name carries instrument and tempo', () => {
  const d = new Date(2026, 11, 1, 9, 5);
  assert.equal(R.fileName('drum', 110, 'webm', d), 'jingle-bells_tongue-drum_110bpm_20261201-0905.webm');
  assert.equal(R.fileName('ukulele', 96, 'wav', d), 'jingle-bells_ukulele_96bpm_20261201-0905.wav');
});

test('mime pick prefers webm/opus, falls back to mp4 (Safari)', () => {
  assert.equal(R.pickMime(() => true), 'audio/webm;codecs=opus');
  assert.equal(R.pickMime((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(R.extFor('audio/mp4'), 'm4a');
});

test('encodeWav writes a valid 16-bit PCM header', () => {
  const buf = R.encodeWav([new Float32Array([0, 1, -1])], 48000), v = new DataView(buf);
  const str = (o) => String.fromCharCode(...new Uint8Array(buf, o, 4));
  assert.equal(str(0), 'RIFF'); assert.equal(str(8), 'WAVE'); assert.equal(v.getUint32(24, true), 48000);
  assert.equal(buf.byteLength, 44 + 6);
  assert.equal(v.getInt16(46, true), 32767); assert.equal(v.getInt16(48, true), -32768);
});

test('manifest no longer locks portrait', async () => {
  const fs = await import('node:fs');
  const m = JSON.parse(fs.readFileSync(path.join(here, '..', 'manifest.webmanifest'), 'utf8'));
  assert.notEqual(m.orientation, 'portrait');
});

test('rotation: cache bumped, manifest re-fetched, every screen widens in landscape', async () => {
  const fs = await import('node:fs');
  const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8');
  assert.match(read('sw.js'), /melodyflow-v16/);
  assert.match(read('index.html'), /manifest\.webmanifest\?v=13/);
  assert.match(read('index.html'), /max-height:560px\)\{\n  #phone\{max-width:none\}/);
  assert.doesNotMatch(read('index.html') + read('learn.js') + read('record.js'), /orientation\.lock\(/);
});
