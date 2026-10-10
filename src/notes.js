// Note model: spelled notes (letter + accidental + octave) with MIDI numbers
// and their position on the grand staff.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// Default practice range (a 61-key keyboard)…
export const LOWEST_MIDI = 36; // C2
export const HIGHEST_MIDI = 96; // C7
// …and the full 88-key piano.
export const PIANO_LOWEST = 21; // A0
export const PIANO_HIGHEST = 108; // C8
export const MIDDLE_C = 60; // C4

// Diatonic index of each staff's bottom line: E4 (treble) and G2 (bass).
const TREBLE_BOTTOM = 4 * 7 + 2;
const BASS_BOTTOM = 2 * 7 + 4;

export function makeNote(letterIndex, octave, accidental = 0) {
  const midi = 12 * (octave + 1) + LETTER_SEMITONES[letterIndex] + accidental;
  return { letterIndex, octave, accidental, midi, diatonic: octave * 7 + letterIndex };
}

export function noteLabel(note) {
  const acc = note.accidental === 1 ? '♯' : note.accidental === -1 ? '♭' : '';
  return `${LETTERS[note.letterIndex]}${acc}${note.octave}`;
}

export function midiToName(midi) {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

// Notes from middle C upward go on the treble staff, everything below on bass.
export function clefFor(note) {
  return note.midi >= MIDDLE_C ? 'treble' : 'bass';
}

// Half-line steps above the clef's bottom line (0 = bottom line, 8 = top line).
export function staffStep(note, clef = clefFor(note)) {
  return note.diatonic - (clef === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM);
}

// Steps at which ledger lines must be drawn for a note at `step`.
export function ledgerSteps(step) {
  const steps = [];
  for (let s = -2; s >= step; s -= 2) steps.push(s);
  for (let s = 10; s <= step; s += 2) steps.push(s);
  return steps;
}

// Natural notes on the full piano (A0–C8), for range pickers.
export function naturalNotesInRange() {
  const notes = [];
  for (let octave = 0; octave <= 8; octave++) {
    for (let li = 0; li < 7; li++) {
      const n = makeNote(li, octave);
      if (n.midi >= PIANO_LOWEST && n.midi <= PIANO_HIGHEST) notes.push(n);
    }
  }
  return notes;
}

// All spelled notes matching the settings. Accidentals only produce black keys
// (no E♯, F♭, B♯, C♭), each black key appearing both as a sharp and a flat.
export function notePool({ low = LOWEST_MIDI, high = HIGHEST_MIDI, clef = 'both', accidentals = false } = {}) {
  const pool = [];
  for (let octave = 0; octave <= 8; octave++) {
    for (let li = 0; li < 7; li++) {
      for (const acc of accidentals ? [-1, 0, 1] : [0]) {
        if (acc === 1 && (li === 2 || li === 6)) continue;
        if (acc === -1 && (li === 0 || li === 3)) continue;
        const n = makeNote(li, octave, acc);
        if (n.midi < low || n.midi > high) continue;
        if (clef !== 'both' && clefFor(n) !== clef) continue;
        pool.push(n);
      }
    }
  }
  return pool;
}

// Keyboard range to display: the given notes plus (unless `exact`) the default
// C2–C7, widened to white keys at both ends.
export function keyboardRange(midis, { exact = false } = {}) {
  let low = exact ? Math.min(...midis) : Math.min(LOWEST_MIDI, ...midis);
  let high = exact ? Math.max(...midis) : Math.max(HIGHEST_MIDI, ...midis);
  if (isBlackKey(low)) low--;
  if (isBlackKey(high)) high++;
  return { low, high };
}

// Random sequence from the pool, never repeating the same pitch back to back.
export function generateExercise(pool, count, rng = Math.random) {
  if (pool.length === 0) return [];
  const notes = [];
  for (let i = 0; i < count; i++) {
    let n;
    let tries = 0;
    do {
      n = pool[Math.floor(rng() * pool.length)];
      tries++;
    } while (pool.length > 1 && notes.length && n.midi === notes[notes.length - 1].midi && tries < 50);
    notes.push(n);
  }
  return notes;
}

// Parses a note name such as "C4", "f#3", "Bb2", "E♭5" or "G♯6".
// Returns null if it isn't a note on the piano (A0–C8).
export function parseNoteName(text) {
  const m = /^([A-Ga-g])(#|♯|b|♭)?(\d)$/.exec(text.trim());
  if (!m) return null;
  const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
  const note = makeNote(LETTERS.indexOf(m[1].toUpperCase()), Number(m[3]), accidental);
  return note.midi >= PIANO_LOWEST && note.midi <= PIANO_HIGHEST ? note : null;
}

// Parses a list of note names separated by spaces, commas, dashes or new lines.
export function parseNoteList(text) {
  const notes = [];
  const invalid = [];
  for (const token of text.split(/[\s,;|\-]+/).filter(Boolean)) {
    const note = parseNoteName(token);
    if (note) notes.push(note);
    else invalid.push(token);
  }
  return { notes, invalid };
}
