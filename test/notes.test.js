import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteName, parseNoteList, noteLabel } from '../src/notes.js';

test('parses note names in common spellings', () => {
  const cases = { C4: 60, c4: 60, 'F#3': 54, 'f♯3': 54, Bb2: 46, 'B♭2': 46, b3: 59, C2: 36, C7: 96, 'E#4': 65 };
  for (const [text, midi] of Object.entries(cases)) assert.equal(parseNoteName(text)?.midi, midi, text);
});

test('keeps the spelling the user typed', () => {
  assert.equal(noteLabel(parseNoteName('Db4')), 'D♭4');
  assert.equal(noteLabel(parseNoteName('C#4')), 'C♯4');
});

test('rejects notes outside C2–C7 and nonsense', () => {
  for (const text of ['B1', 'C#7', 'D7', 'H4', 'C', '4', 'C10', 'Cbb4']) assert.equal(parseNoteName(text), null, text);
});

test('parses a list with mixed separators and reports invalid tokens', () => {
  const { notes, invalid } = parseNoteList('C4 E4, G4\nBb3 - x9  A1');
  assert.deepEqual(notes.map((n) => n.midi), [60, 64, 67, 58]);
  assert.deepEqual(invalid, ['x9', 'A1']);
});
