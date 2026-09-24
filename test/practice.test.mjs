import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'practice.js')).href);
const P = globalThis.MF_PRACTICE;

const chords = ['C', 'Am', 'F', 'G7'];

test('a deck is the changes in a progression, including the way round', () => {
  const deck = P.deckFor(chords);
  assert.deepEqual(Object.keys(deck.cards), ['C>Am', 'Am>F', 'F>G7', 'G7>C']);
});

test('a chord repeated is not a change', () => {
  assert.deepEqual(Object.keys(P.deckFor(['C', 'C', 'F']).cards), ['C>F', 'F>C']);
});

test('the pass mark is a bar at the tempo you want', () => {
  assert.equal(Math.round(P.targetMs(90, 4)), 2667);
  assert.equal(Math.round(P.targetMs(120, 4)), 2000);
  // Half a bar to change is twice as hard, and says so.
  assert.equal(Math.round(P.targetMs(90, 2)), 1333);
});

test('the clock grades it, not the learner', () => {
  const t = 2000;
  assert.equal(P.grade(1400, t), 'good');
  assert.equal(P.grade(2000, t), 'good');
  assert.equal(P.grade(2800, t), 'close');
  assert.equal(P.grade(3100, t), 'slow');
});

test('recording leaves the deck it was given alone', () => {
  const deck = P.deckFor(chords, { bpm: 90 });
  const before = JSON.stringify(deck);
  P.record(deck, 'C>Am', 1200);
  assert.equal(JSON.stringify(deck), before);
});

test('a change made in time comes back later; a slow one comes back at once', () => {
  let deck = P.deckFor(chords, { bpm: 90 });
  const fast = P.record(deck, 'C>Am', 1200).cards['C>Am'];
  assert.equal(fast.interval, 2);
  assert.ok(fast.ease > P.EASE_START);

  // Learn it, then miss it: the interval collapses rather than decaying.
  let learned = deck;
  for (let i = 0; i < 4; i++) learned = P.record(learned, 'C>Am', 1200);
  assert.ok(learned.cards['C>Am'].interval > 4);

  const lapsed = P.record(learned, 'C>Am', 9000).cards['C>Am'];
  assert.equal(lapsed.interval, 1);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.ease < learned.cards['C>Am'].ease);
});

test('ease cannot run away in either direction', () => {
  let deck = P.deckFor(chords, { bpm: 90 });
  for (let i = 0; i < 40; i++) deck = P.record(deck, 'C>Am', 100);
  assert.ok(deck.cards['C>Am'].ease <= P.EASE_MAX);
  for (let i = 0; i < 40; i++) deck = P.record(deck, 'C>Am', 99999);
  assert.ok(deck.cards['C>Am'].ease >= P.EASE_MIN);
});

test('a deck opens with a few changes rather than all of them', () => {
  const long = P.deckFor(['C', 'Am', 'F', 'G7', 'Dm', 'E7', 'A7', 'Bb', 'G']);
  let deck = long;
  const introduced = new Set();
  for (let i = 0; i < 8; i++) {
    const k = P.next(deck);
    introduced.add(k);
    deck = P.record(deck, k, 1200);
  }
  assert.ok(
    introduced.size <= P.IN_CIRCULATION + 1,
    `opened with ${introduced.size} changes at once`,
  );
});

/**
 * The behaviour the whole thing exists for. A learner cannot feel which of
 * their changes is second-worst; the clock can, and the session should go
 * there rather than to whatever comes next in the song.
 */
test('the session spends itself on the slow change', () => {
  let deck = P.deckFor(chords, { bpm: 90 });
  const seen = {};
  for (let i = 0; i < 24; i++) {
    const k = P.next(deck);
    seen[k] = (seen[k] || 0) + 1;
    deck = P.record(deck, k, k === 'Am>F' ? 4200 : 1400);
  }
  const hard = seen['Am>F'];
  const others = Object.entries(seen).filter(([k]) => k !== 'Am>F').map(([, n]) => n);
  assert.ok(
    hard > Math.max(...others),
    `the slow change got ${hard} goes, the others ${others.join('/')}`,
  );
});

test('what to work on, slowest first', () => {
  let deck = P.deckFor(chords, { bpm: 90 });
  deck = P.record(deck, 'C>Am', 1200);
  deck = P.record(deck, 'Am>F', 5000);
  deck = P.record(deck, 'F>G7', 2900);

  const worst = P.weakest(deck);
  assert.deepEqual(worst.map((c) => c.key), ['Am>F', 'F>G7', 'C>Am']);
  // Untried changes are not claimed to be anything.
  assert.equal(worst.length, 3);
  assert.equal(worst[0].ready, false);
  assert.equal(worst[2].ready, true);
});

test('readiness names the one change holding the tempo back', () => {
  let deck = P.deckFor(chords, { bpm: 90 });
  for (const k of ['C>Am', 'F>G7', 'G7>C']) deck = P.record(deck, k, 1300);
  deck = P.record(deck, 'Am>F', 4800);

  const r = P.readiness(deck);
  assert.equal(r.total, 4);
  assert.equal(r.tried, 4);
  assert.equal(r.ready, 3);
  assert.equal(r.blocker.key, 'Am>F');

  // Once it is in time, nothing is in the way.
  for (let i = 0; i < 3; i++) deck = P.record(deck, 'Am>F', 1200);
  assert.equal(P.readiness(deck).blocker, null);
});

test('a median, not a last attempt, so one fluke does not move it', () => {
  let deck = P.deckFor(chords, { bpm: 90 });
  for (const t of [2000, 2100, 2050, 2200, 300]) deck = P.record(deck, 'C>Am', t);
  const pace = P.pace(deck.cards['C>Am']);
  assert.ok(pace >= 2000 && pace <= 2100, `one lucky go moved the pace to ${pace}`);
});
