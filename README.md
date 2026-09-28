# MelodyFlow

A songbook and practice tool for a 13-note C-major steel tongue drum, written in
the numbers engraved on the drum itself. No account, no network, no tracking — a
static, offline-capable Progressive Web App.

The engine is no longer drum-shaped. An instrument owns its tokens, the pitches
each one sounds and how it is voiced; notation, timing and the guided practice
loop are shared. A ukulele is the second instrument defined through it — a chord
is four strings at once, which is why a beat now holds more than one pitch, and a
strum has a direction, which is why an articulation sits on the beat rather than
on the chord. Both are playable: the drum keeps its pad wheel, and the ukulele has chord
diagrams that show **which finger stays put** through a change.

This is the **Nocturne redesign** of MelodyFlow, implemented as a real standalone
app from the `MelodyFlow.dc.html` Claude Design prototype. It regroups everything
the original did into four tabs, promotes capture to its own tab, and makes every
arrangement editable.

## The four tabs

| Tab | What it does |
|---|---|
| **Play** | The songbook (library) → a practice screen: next note huge, the whole line as a scrolling ribbon with a moving beat marker, and the pad lit on the drum. Three modes — **Notes only** (steady even pulse), **With rhythm** (real durations), and **On your own** (guided practice: nothing auto-plays — the next note lights up and you advance by tapping the correct pad yourself; *Listen* still plays it for you). Tempo, previous/next line. Songs with chords (tagged **uke**, and a *Ukulele* filter) switch to the ukulele play-along — see below. |
| **Drum** | The virtual drum — Free play, Improvise (drone + pentatonic lifted forward), and Layout. Rotate the wheel; tap any pad to hear it. |
| **Capture** | Play, hum or whistle a phrase into the phone's microphone → the notes, their lengths and the tempo, as a draft that lands in the editor and can be saved to the book. |
| **Book** | Every arrangement written out with its chords, **Your songs** (what you have written or corrected, and a saved copy of the whole book), and the decision register (in / adapted / corrected / out / queued, each with its reason). |

The **note editor** is reachable from any song (Play → Edit, Book → edit, or a
capture): tap a note to select it, then change pitch, octave and length, insert a
rest, duplicate or delete, and tap-tempo the four transcriptions whose timing is
still wrong. **Save** keeps it: a corrected built-in song replaces the original in
the book (and can be restored), and a saved capture becomes a song of your own.
Tap the title to rename it.

## Listening

The app can hear you through the phone's microphone. Tap **🎤 Listen** where it
appears:

- **Drum → On your own**: play the lit pad on your real drum and the line moves on,
  exactly as tapping it on the screen does. The same note in another octave
  counts — the drum's overtones can fool the ear by an octave.
- **Ukulele → On your own**: strum the lit chord and it moves to the next change.
  Only the song's own chords are candidates, which is what makes it dependable.
- **Ukulele → Drill**: the clock stops when it hears the chord, not when you tap.
- **Capture**: records notes, not sound — each strike's pitch snapped to the
  nearest pad, the tempo from the gaps between notes, and every length in half
  beats. Humming below the drum is moved up an octave onto it; notes that land
  between two pads come back dashed in the editor.

The microphone is only on while one of those is, it stops when the app goes to
the background, and nothing is recorded or sent anywhere: samples are looked at
and dropped. The detection is `listen.js` — YIN for a note, a twelve-note
chroma for a chord, a jump in loudness for when either starts — and the smoke
test drives all of it end to end through Chromium's fake microphone.

## Playing along on the ukulele

A song can carry a chord line under each lyric line. Open one and switch the
practice screen from *Tongue drum* to *Ukulele*:

- **The chord now, and the chord next** — both drawn, with how many beats until
  the change and which fingers can stay down through it. Shapes are the ones a
  chord chart teaches; only the fingering is solved across the song's changes.
- **Where to strum** — the bar as half-beat slots, `1 & 2 & 3 &`, with an arrow
  where the strum goes. *All downs* to start with, then a pattern with upstrokes
  (`D - D U - U D U` in 4/4, `D D U D U` in 3/4).
- **The line's chords over its words**, each as wide as it lasts.
- **Play along** counts in a bar, then plays the tune and a click while you strum.
  **Listen** strums it for you. **On your own** waits: make the shape, strum it,
  tap it, and it moves to the next change.

Chords are in: Happy Birthday, You Are My Sunshine, Silent Night, Twinkle
Twinkle, Frère Jacques (one chord — the place to start), Ode to Joy and Jingle
Bells. The timing is worked out in
`playalong.js`; a chord line that does not add up to its melody line is reported
on the screen and fails the smoke test.

## Files

| File | What it is |
|---|---|
| `index.html` | The app — engine, 16 arrangements, songbook, register, capture, editor. Vanilla JS, no build step. |
| `instruments.js` | The instrument model: which tokens exist, what pitches each one sounds, how it is voiced — plus the notation grammar they share. Loaded before the app, imported by the tests. |
| `fretboard.js` | Where the fingers go, and what it costs to get there from the shape you are already holding. Searches the fretboard from the notes of the chord; holds no chord pictures. |
| `fretboard-view.js` | Draws a chord box, and the thing chord boxes never show: the finger that is already where it needs to be. Strings in, markup out — no state, no events. |
| `playalong.js` | When every chord, strum and melody note falls, pickups included, for the play-along. No DOM, no audio, no clock — times are in beats. |
| `listen.js` | The microphone, as numbers: which pad a note is, which chord a strum is, when either starts, and a run of notes as lengths in beats. No DOM, no audio graph — the tests feed it tones they make up. |
| `songbook.js` | Your songs: saved as text in the book's own notation, merged over the built-ins, and written to / read from a songbook file. No DOM. |
| `practice.js` | The drill scheduler: which change to put up next, and what your times say about it. No DOM, no audio, no clock — latencies go in as numbers. |
| `test/` | `npm test` runs the unit tests on node's own runner, no dependencies. `npm run smoke` loads the page in a browser and skips itself if Playwright is absent. |
| `manifest.webmanifest` | Makes it installable. |
| `sw.js` | Offline cache, network-first: an installed app picks up a deploy on its next launch, and falls back to the last copy it saw when offline. |
| `icon.svg`, `icon-maskable.svg`, `icon-*.png`, `apple-touch-icon.png` | Home-screen icons (generated by `make-icons.js`). |
| `make-icons.js` | Regenerates the SVG icons from the app's own pad-wheel geometry. |

## Running it

**Just try it.** Open `index.html` in a browser. Everything works except installing
to the home screen, which browsers only allow over a secure page.

**Properly, on a phone.** Serve the folder over HTTPS and use *Add to home screen*:

- **Netlify Drop** — drag the folder onto <https://app.netlify.com/drop>.
- **GitHub Pages** / **Cloudflare Pages** — no build command, output directory `/`.

**On your own machine**, from inside the folder:

    python3 -m http.server 8000

Then visit <http://localhost:8000>. `localhost` counts as secure.

## Chords, and the change between them

A chord chart tells you where the fingers go. It does not tell you the thing
that actually gates progress: arriving at F from C on the beat. Which shape is
easiest is not a property of the chord — it is a property of the pair.

So `fretboard.js` holds no chord pictures. It takes the notes a chord is made
of, searches the fretboard for every way four strings can sound them, keeps the
ones a hand can hold, and puts fingers on them. It finds every shape the charts
teach, which is how both the search and the charts are checked against each
other.

The fingering is chosen **per change**, not once per chord. A minor to F is easy
because a finger stays on the second fret of the G string — but only if A minor
was fingered with that finger in the first place, which is a decision about the
pair and cannot be made while looking at A minor alone. An anchored finger costs
nothing and pays a bonus; landing a finger costs more than lifting one.

A progression is then solved as a shortest path over (shape, fingering), because
a shape that is easy to arrive at can be expensive to leave and a song comes
round again.

```js
const uke = MF.instrument('ukulele');
uke.shapesFor('G7');                       // every way to play it, the chart first
uke.easiestPath(['C', 'Am', 'F', 'G7']);   // the cheapest way through all of it
```

The chart shape is marked and offered first, but it does not always win on
effort, and that is not tuned away. Everyone learns E as `4 4 4 2`; `1 4 0 2` is
genuinely easier and sounds the same. Teaching a beginner and planning a change
are different questions, so the caller picks.

### Drilling the change

The third screen times you. Hold the first shape, press **Start**, make the
change on your own ukulele, and tap the diagram when you have it. The clock
does the grading — nobody is asked how hard it felt.

Self-rating is the weak part of every spaced-repetition system, and it is
unnecessary here, because a chord change has an honest pass mark: **the beat**.
A bar of 4/4 at 90 is 2.7 seconds. Either the hand arrived inside it or it did
not. Set the tempo you want to play at and the target moves with it.

Spacing is counted in changes seen, not in days. Vocabulary is reviewed
tomorrow; a chord change is drilled now, six cards later, then twenty, inside
one sitting. The session keeps coming back to whatever is slowest, and a deck
opens with a handful of changes rather than all of them.

What comes out is a sentence worth having:

> 3 of 4 changes are in time at 90. **Am → F** is what is holding the tempo down.

A learner cannot feel the difference between their second-worst and
fourth-worst change. The clock can, and that is the whole reason any of this
is measured. Times are kept per change, per progression, on your device.

### Seeing the change

The Ukulele tab has two screens. **Chords** browses every shape, the one
everybody learns first and the other voicings under it. **Changes** takes a
progression, solves it, and walks you through it one change at a time.

A finger drawn in mint with a ring round it is already where it needs to be.
That is the whole trick, and it is the one thing a printed chord chart cannot
tell you, because it draws each shape as though you arrived from nowhere.

## Notation

Numbers are the pads engraved on the drum. A dot **under** a number means the low
octave (`5.` `6.` `7.`), a dot **over** it means the high octave (`.1` `.2` `.3`).

| Written | Means |
|---|---|
| `3` | pad 3, one beat |
| `3*2` `3*.5` `3*1.5` | held two beats / half a beat / dotted |
| `0` | a rest |
| `C*3` `G7*2` | in a chord line: a chord held three beats / two |
| `\|` | a bar line |

The drum layout (centre pad, then clockwise from twelve): `5. · 6. .2 7 1 5 3 7. 4 6 2 .1 .3`

## Where things are kept

Everything lives in your browser's local storage on that device, and nothing
leaves it on its own: progress and preferences, your drill times, and your songs.

Local storage goes when the app is deleted or the site's data is cleared, so
**Book → Your songs → Save a copy** writes your songs and drill times to a file
(the share sheet on a phone — save it to Files, a cloud drive or email). **Load a
copy** reads one back; songs in the file replace the phone's copy of the same
song and nothing else is removed.

## Notes on this build

- Audio is a synthesised approximation of the drum (a few sine partials), not the
  real instrument.
- Silent Night, You Are My Sunshine, Hedwig's Theme, Terminator and Low Rider are
  from the notebook. The register says what changed and why.
- Terminator, Low Rider, Can't Help Falling in Love and Somewhere in My Memory are
  flagged `timing`: the notes are right, the rhythm is a placeholder.
