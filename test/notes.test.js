import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteName, parseNoteList, noteLabel, notePool, naturalNotesInRange, keyboardRange, generateChordExercise, stepLabel, stepMidis } from '../src/notes.js';

test('parses note names in common spellings', () => {
  const cases = { A0: 21, C8: 108, 'Bb0': 22, B1: 35, C4: 60, c4: 60, 'F#3': 54, 'f♯3': 54, Bb2: 46, 'B♭2': 46, b3: 59, C2: 36, C7: 96, 'E#4': 65 };
  for (const [text, midi] of Object.entries(cases)) assert.equal(parseNoteName(text)?.midi, midi, text);
});

test('keeps the spelling the user typed', () => {
  assert.equal(noteLabel(parseNoteName('Db4')), 'D♭4');
  assert.equal(noteLabel(parseNoteName('C#4')), 'C♯4');
});

test('rejects notes outside C2–C7 and nonsense', () => {
  for (const text of ['G#0', 'Ab0', 'C#8', 'D8', 'H4', 'C', '4', 'C10', 'Cbb4']) assert.equal(parseNoteName(text), null, text);
});

test('parses a list with mixed separators and reports invalid tokens', () => {
  const { notes, invalid } = parseNoteList('C4 E4, G4\nBb3 - x9  G0');
  assert.deepEqual(notes.map((n) => n.midi), [60, 64, 67, 58]);
  assert.deepEqual(invalid, ['x9', 'G0']);
});

test('range pickers cover all 52 white keys A0–C8', () => {
  const naturals = naturalNotesInRange();
  assert.equal(naturals.length, 52);
  assert.equal(noteLabel(naturals[0]), 'A0');
  assert.equal(noteLabel(naturals.at(-1)), 'C8');
});

test('default note pool is unchanged (C2–C7)', () => {
  const pool = notePool();
  assert.equal(pool.length, 36);
  assert.equal(Math.min(...pool.map((n) => n.midi)), 36);
  assert.equal(Math.max(...pool.map((n) => n.midi)), 96);
});

test('full-range pool includes every piano key', () => {
  const pool = notePool({ low: 21, high: 108, accidentals: true });
  assert.equal(new Set(pool.map((n) => n.midi)).size, 88);
});

test('keyboard range keeps C2–C7 and widens to white keys', () => {
  assert.deepEqual(keyboardRange([60, 62]), { low: 36, high: 96 });
  assert.deepEqual(keyboardRange([22, 106]), { low: 21, high: 107 });
});

test('exact keyboard range shows only the practised notes', () => {
  assert.deepEqual(keyboardRange([60, 79], { exact: true }), { low: 60, high: 79 });
  assert.deepEqual(keyboardRange([61, 70, 66], { exact: true }), { low: 60, high: 71 });
});

test('parses notes joined with + as one chord step, lowest first', () => {
  const { notes, invalid } = parseNoteList('C4 E4+C4  G3 + B3 + D4, F4+F4 C4+zz');
  assert.deepEqual(notes.map(stepLabel), ['C4', 'C4+E4', 'G3+B3+D4', 'F4']);
  assert.deepEqual(invalid, ['C4+zz']);
});

test('double-note exercises: pairs a 3rd to a 7th apart, from the pool', () => {
  const pool = notePool({ low: 60, high: 79 });
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const steps = generateChordExercise(pool, 200, rng);
  assert.equal(steps.length, 200);
  for (const step of steps) {
    const [a, b] = stepMidis(step);
    assert.ok(b - a >= 3 && b - a <= 11, stepLabel(step));
    assert.ok(a >= 60 && b <= 79, stepLabel(step));
  }
  for (let i = 1; i < steps.length; i++) assert.notEqual(stepLabel(steps[i]), stepLabel(steps[i - 1]));
});

test('double notes need room: a tiny range gives no exercise', () => {
  assert.deepEqual(generateChordExercise(notePool({ low: 60, high: 62 }), 4), []);
});
