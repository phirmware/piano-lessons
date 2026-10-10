// Shared frame analysis: one window of samples → level + pitch.
import { rms, detectPitch } from './pitch.js';
import { freqToMidi } from './notes.js';

export function analyzeFrame(buf, sampleRate, gate) {
  const level = rms(buf);
  // Don't spend time on pitch detection for near-silence.
  const res = level >= gate * 0.5 ? detectPitch(buf, sampleRate) : null;
  return {
    level,
    midi: res ? freqToMidi(res.freq) : null,
    clarity: res ? res.clarity : 0,
  };
}
