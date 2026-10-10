# Note Reader

Single-note sight-reading practice for piano: C2–C7 by default, any range on the full 88-key piano (A0–C8). The app shows a worksheet of
notes on the grand staff, highlights the one you're on, listens to your piano
through the microphone and only moves on when you play the right key.

## Run

```sh
npm start        # → http://localhost:5173
npm test         # detection + note model tests
npm run build    # tests, then the deployable site in dist/
```

Use Chrome, Edge or Safari. The microphone only works on `localhost` (or https),
so don't open `index.html` directly as a file.

No dependencies — needs Node 18+ only.

## Use

1. Click **Start listening** and allow the microphone.
2. Play the highlighted note. Correct → it turns green and the next note is
   highlighted. Wrong → it shows what it heard and waits for you to try again.
3. Notes you got wrong at least once turn amber; the summary at the end lists them.

### Double notes

Settings → **Notes at once → Double notes** shows two notes stacked in one column
(a 3rd to a 7th apart) to play together. The app checks that both notes sound and
nothing else new does. If it only hears one right note it waits for the other,
and keys pressed up to ~1.5 s apart still count. On the on-screen keyboard, tap
both keys (tap a key again to deselect it); with MIDI, hold both down.

Limits of listening for two notes at once: octaves aren't used (the upper note
is indistinguishable from the lower note's overtones), and a wrong note exactly
an octave above a right one reads as "only one note heard" rather than "wrong".
It never accepts a wrong chord in the test suite, but real pianos and rooms vary,
so tell us if it misjudges you.

### My exercises (custom notes)

To follow an external worksheet, book or song, open **My exercises** → **+ New exercise**,
give it a name and enter the notes in order, either typed (`C4 E4 G4 Bb3 F#2`) or by
clicking the small keyboard. Join notes played together with `+` (`C4+E4`), or
press **+ Together** between key clicks. A staff preview updates as you go. Saved exercises are
kept in your browser (localStorage) and listed there to **Practise**, **Edit** or
**Delete**. While practising one, a “Custom: …” chip shows its name; click ✕ (or
**New exercise**) to go back to random notes.

Shortcuts: **L** start/stop listening · **H** hear the current note · **N** new exercise.

Settings let you choose the range (anywhere from A0 to C8 — the on-screen keyboard
widens beyond C2–C7 when needed), practise one staff at a time, add sharps/flats,
show note names, show the right key after mistakes, and adjust mic sensitivity.

If your keyboard has USB-MIDI, plug it in: the app uses it automatically (more
reliable than the microphone). Clicking the on-screen keys also works as input.

## Deploy (Vercel)

`vercel.json` is set up: Vercel runs `npm run build` (tests, then copies the app
into `dist/`) and serves `dist/` over https, which the microphone requires.

- **From GitHub:** push this repo, then in Vercel choose *Add New → Project*, import
  the repo and click *Deploy* (no settings to change). Every push redeploys.
- **From the terminal:** `npx vercel` for a preview, `npx vercel --prod` for production.

Saved exercises and settings live in each browser's localStorage, so they are
per-device and per-domain (localhost and the Vercel URL don't share them).

## Tips for the microphone

- Practise in a quiet room; talking near the mic can count as a wrong note.
- Watch the level bar: notes must pass the marker. Adjust **Sensitivity** if soft
  notes are ignored or noise is picked up.
- Play one key at a time and let the app react before the next one.

## Code

- `src/pitch.js` — YIN pitch detection
- `src/segmenter.js` — turns audio frames into "key pressed" events (onset detection + voting)
- `src/chord.js`, `src/fft.js` — double notes: spectrum analysis to verify notes played together
- `src/notes.js` — note model, staff positions, exercise generation
- `src/staff.js` — grand-staff SVG rendering (Bravura music font, `fonts/`, SIL OFL)
- `src/inputs.js` — microphone, MIDI and tone playback
- `src/library.js` — saved custom exercises (My exercises panel)
- `src/app.js` — exercise flow and UI

`npm test` checks detection on synthesized piano tones for all 88 keys and
common playing patterns (legato, repeated keys, soft notes, sustain, silence),
and double notes (right, wrong, uneven, staggered, previous chord ringing).
