// Synthetic piano-ish tones for tests: decaying partials with inharmonicity,
// optional weak fundamental (typical of low piano notes) and noise.
import { midiToFreq } from '../../src/notes.js';

export function pianoTone(midi, { sampleRate = 48000, duration = 0.5, amp = 0.3, weakFundamental = midi < 48, noise = 0.003, seed = 1 } = {}) {
  const f0 = midiToFreq(midi);
  const n = Math.floor(sampleRate * duration);
  const out = new Float32Array(n);
  const B = 0.0004; // string inharmonicity coefficient
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const partials = [];
  for (let k = 1; k <= 12; k++) {
    const f = k * f0 * Math.sqrt(1 + B * k * k);
    if (f > sampleRate / 2.2) break;
    let a = 1 / k;
    if (k === 1 && weakFundamental) a = 0.25;
    if (k === 2 && weakFundamental) a = 0.9;
    partials.push({ f, a, decay: 1.5 + k * 0.8, phase: rand() * Math.PI });
  }
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.005);
    let v = 0;
    for (const p of partials) v += p.a * Math.exp(-p.decay * t) * Math.sin(2 * Math.PI * p.f * t + p.phase);
    out[i] = amp * attack * v + noise * rand();
  }
  return out;
}
