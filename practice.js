/* ════════════════════════════════════════════════════════════════════════
   MelodyFlow — the drill.

   What gets practised is not chords, it is the changes between them. "I know
   F" is not a claim anyone can act on; "I get to F from C in 2.4 seconds and
   I need 1.8" is. So the unit of study here is an ordered pair, and the thing
   measured is the clock.

   Nobody is asked how hard that felt. Self-rating is the weak part of every
   spaced-repetition system and it is unnecessary here, because a chord change
   has an honest pass mark: the beat. A bar of 4/4 at 90 is 2.7 seconds, and
   either the hand arrived inside it or it did not. The target comes from the
   tempo you want to play at, which makes a failed card mean something a
   learner can hear.

   Spacing is counted in changes seen rather than in days. Vocabulary is
   reviewed tomorrow; a chord change is drilled now, six cards later, then
   twenty, inside one sitting — this is motor learning, and the interval that
   matters is short.

   No DOM, no audio, no clock. Latencies come in as numbers so the whole thing
   can be tested without waiting for anything.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const EASE_START = 2.3;
  const EASE_MIN = 1.3;
  const EASE_MAX = 2.8;
  /** How many changes may be part-learned at once. More than this and nothing sticks. */
  const IN_CIRCULATION = 5;
  /** Recent times kept per change. Enough for a median, few enough to follow improvement. */
  const WINDOW = 5;

  const key = (from, to) => `${from}>${to}`;

  /** One bar to make the change, at the tempo you are aiming for. */
  function targetMs(bpm, beats) {
    return (60000 / (bpm || 90)) * (beats || 4);
  }

  function newCard() {
    return { reps: 0, lapses: 0, ease: EASE_START, interval: 0, due: 0, times: [] };
  }

  /** A deck for one progression: every change in it, and the loop back round. */
  function deckFor(chords, opts) {
    const o = opts || {};
    const deck = { step: 0, bpm: o.bpm || 90, beats: o.beats || 4, cards: {} };
    for (let i = 0; i < chords.length; i++) {
      const from = chords[i];
      const to = chords[(i + 1) % chords.length];
      if (from !== to) deck.cards[key(from, to)] = newCard();
    }
    return deck;
  }

  function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** The time this change actually takes, as far as anyone can tell yet. */
  function pace(card) {
    return median(card.times);
  }

  /**
   * Which change to put up next.
   *
   * Anything overdue comes first, worst-paced first, because the point of the
   * whole exercise is to spend the session on what is slow rather than on
   * what is already comfortable. A change never seen is introduced only when
   * there is room, so a deck opens with a handful rather than all of it.
   */
  function next(deck) {
    const entries = Object.entries(deck.cards);
    if (!entries.length) return null;

    const seen = entries.filter(([, c]) => c.reps > 0);
    const unseen = entries.filter(([, c]) => c.reps === 0);
    const learning = seen.filter(([, c]) => c.reps < 3).length;

    const due = seen
      .filter(([, c]) => c.due <= deck.step)
      .sort((a, b) => (pace(b[1]) || 0) - (pace(a[1]) || 0));

    if (due.length && !(unseen.length && learning < IN_CIRCULATION && due.length < 2)) {
      return due[0][0];
    }
    if (unseen.length && learning < IN_CIRCULATION) return unseen[0][0];
    if (due.length) return due[0][0];

    // Nothing is due yet: the least far off, so a short session still drills.
    return seen.sort((a, b) => a[1].due - b[1].due)[0][0];
  }

  /**
   * How it went, from the clock alone.
   *
   * Inside the bar is a pass. Up to half a bar late is a near miss worth
   * repeating sooner rather than relearning. Anything slower is a lapse: the
   * change is not there yet and saying otherwise helps nobody.
   */
  function grade(latency, target) {
    if (latency <= target) return 'good';
    if (latency <= target * 1.5) return 'close';
    return 'slow';
  }

  /** Record an attempt. Returns the deck — it is replaced, never mutated. */
  function record(deck, cardKey, latency) {
    const card = deck.cards[cardKey];
    if (!card) return deck;

    const target = targetMs(deck.bpm, deck.beats);
    const verdict = grade(latency, target);
    const times = card.times.concat(latency).slice(-WINDOW);

    let { ease, interval, lapses } = card;
    if (verdict === 'good') {
      ease = Math.min(EASE_MAX, ease + 0.05);
      interval = interval < 1 ? 2 : Math.max(2, Math.round(interval * ease));
    } else if (verdict === 'close') {
      interval = Math.max(2, Math.round((interval || 1) * 1.2));
    } else {
      lapses += 1;
      ease = Math.max(EASE_MIN, ease - 0.2);
      interval = 1;
    }

    const step = deck.step + 1;
    return {
      ...deck,
      step,
      cards: {
        ...deck.cards,
        [cardKey]: { reps: card.reps + 1, lapses, ease, interval, due: step + interval, times },
      },
    };
  }

  /**
   * The changes standing between you and the song, slowest first.
   *
   * This is the answer to "what should I work on", and it is the reason any
   * of this is measured: a learner cannot feel the difference between their
   * second-worst and fourth-worst change, and the clock can.
   */
  function weakest(deck) {
    const target = targetMs(deck.bpm, deck.beats);
    return Object.entries(deck.cards)
      .filter(([, c]) => c.reps > 0)
      .map(([k, c]) => {
        const [from, to] = k.split('>');
        return { key: k, from, to, pace: pace(c), reps: c.reps, lapses: c.lapses,
                 ready: pace(c) !== null && pace(c) <= target };
      })
      .sort((a, b) => b.pace - a.pace);
  }

  /** Can the whole progression be played at this tempo yet? */
  function readiness(deck) {
    const all = weakest(deck);
    const total = Object.keys(deck.cards).length;
    return {
      target: targetMs(deck.bpm, deck.beats),
      tried: all.length,
      total,
      ready: all.filter((c) => c.ready).length,
      blocker: all.find((c) => !c.ready) || null,
    };
  }

  root.MF_PRACTICE = {
    IN_CIRCULATION, WINDOW, EASE_START, EASE_MIN, EASE_MAX,
    key, targetMs, deckFor, next, grade, record, weakest, readiness, pace, median,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
