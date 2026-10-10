import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from '../src/pitch.js';
import { freqToMidi, midiToName, LOWEST_MIDI, HIGHEST_MIDI } from '../src/notes.js';
import { pianoTone } from './helpers/synth.js';

for (const sampleRate of [44100, 48000]) {
  test(`detects every key C2–C7 at ${sampleRate} Hz`, () => {
    const failures = [];
    for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
      const tone = pianoTone(midi, { sampleRate, duration: 0.4 });
      // Analyse a 4096-sample window ~150 ms into the note, as the app would.
      const start = Math.floor(sampleRate * 0.15);
      const res = detectPitch(tone.subarray(start, start + 4096), sampleRate);
      const got = res ? Math.round(freqToMidi(res.freq)) : null;
      if (got !== midi) failures.push(`${midiToName(midi)} → ${got === null ? 'none' : midiToName(got)}`);
    }
    assert.deepEqual(failures, []);
  });
}

test('returns null for silence-like noise', () => {
  let s = 7;
  const buf = new Float32Array(4096).map(() => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1);
  const res = detectPitch(buf, 48000);
  assert.ok(res === null || res.clarity < 0.7, `unexpected pitch ${res && res.freq}`);
});
