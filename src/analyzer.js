// Shared frame analysis: one window of samples → level + pitch.
import { rms, detectPitch } from './pitch.js';
import { freqToMidi, midiToFreq } from './notes.js';

// Pitch search range for a keyboard range: at least the default 55–2400 Hz,
// widened (about a semitone of margin) for notes beyond C2–C7.
export function pitchRangeFor(lowMidi, highMidi) {
  return {
    minFreq: Math.min(55, midiToFreq(lowMidi) * 0.94),
    maxFreq: Math.max(2400, midiToFreq(highMidi) * 1.06),
  };
}

export function analyzeFrame(buf, sampleRate, gate, pitchRange) {
  const level = rms(buf);
  // Don't spend time on pitch detection for near-silence.
  const res = level >= gate * 0.5 ? detectPitch(buf, sampleRate, pitchRange) : null;
  return {
    level,
    midi: res ? freqToMidi(res.freq) : null,
    clarity: res ? res.clarity : 0,
  };
}
