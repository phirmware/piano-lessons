// Simulates the browser's chord listening loop over synthesized audio.
import { rms } from '../../src/pitch.js';
import { ChordSegmenter } from '../../src/segmenter.js';
import { magnitudeSpectrum, judgeChord } from '../../src/chord.js';
import { pianoTone } from './synth.js';

export const SR = 48000;

// events: [{ midi, at (s), duration, amp }]
export function perform(events, total, seed = 3) {
  const out = new Float32Array(Math.floor(SR * total));
  let s = seed;
  for (let i = 0; i < out.length; i++) out[i] = 0.002 * (((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1);
  for (const e of events) {
    const tone = pianoTone(e.midi, { sampleRate: SR, duration: e.duration ?? 1.2, amp: e.amp ?? 0.25, noise: 0, seed: e.midi });
    const off = Math.floor(e.at * SR);
    for (let i = 0; i < tone.length && off + i < out.length; i++) out[off + i] += tone[i];
  }
  return out;
}

// Returns the verdicts reached while `targets` (one array per step) are
// expected; advances to the next step on 'correct', like the app.
export function listenChords(audio, steps, gate = 0.008) {
  const seg = new ChordSegmenter({ gate });
  const hop = Math.floor(SR / 60);
  let pre = null, step = 0;
  const log = [];
  for (let end = 8192; end <= audio.length && step < steps.length; end += hop) {
    const buf = audio.subarray(end - 8192, end);
    const level = rms(buf.subarray(4096));
    const ev = seg.process({ time: (end / SR) * 1000, level });
    if (ev === 'onset') pre = magnitudeSpectrum(buf, SR);
    if (ev === 'analyze') {
      const r = judgeChord(magnitudeSpectrum(buf, SR), pre, steps[step]);
      log.push(r);
      if (r.verdict === 'correct') step++;
    }
  }
  return log;
}
