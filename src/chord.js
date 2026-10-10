// Checking two (or more) notes played together. Single-note pitch detection
// can't separate simultaneous notes, so this works on the spectrum: since we
// know which notes are expected, we verify that each one is present and that
// every strong new partial belongs to one of them.
import { fft } from './fft.js';
import { midiToFreq, freqToMidi } from './notes.js';

const WINDOW = 8192; // samples analysed (≈170 ms at 48 kHz)
const PAD = 16384; // zero-padded FFT size, for finer peak positions
const MIN_HZ = 40;
const MAX_HZ = 5000;
const MAX_PARTIAL = 12;
const MAX_INHARMONICITY = 0.0012; // piano strings' partials run sharp
const OWN_EVIDENCE = 10; // a note's own partial must be this far above the noise floor…
const OWN_EVIDENCE_REL = 0.04; // …and this fraction of the loudest peak
const STRONG_REL = 0.12; // peaks above this fraction of the loudest must be explained
const STRONG_ABS = 10; // …if also this far above the noise floor
const NEW_RATIO = 2; // a peak is "new" if it grew this much since before the onset

/** Windowed, zero-padded magnitude spectrum of the most recent WINDOW samples. */
export function magnitudeSpectrum(buf, sampleRate) {
  const re = new Float64Array(PAD), im = new Float64Array(PAD);
  const n = Math.min(WINDOW, buf.length), start = buf.length - n;
  for (let i = 0; i < n; i++) re[i] = buf[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const mags = new Float32Array(PAD / 2);
  for (let i = 0; i < mags.length; i++) mags[i] = Math.hypot(re[i], im[i]);
  return { mags, binHz: sampleRate / PAD };
}

const bin = (spec, hz) => Math.round(hz / spec.binHz);

function noiseFloor(spec) {
  const vals = Array.from(spec.mags.subarray(bin(spec, MIN_HZ), bin(spec, MAX_HZ))).sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)] || 1e-12;
}

// Loudest spectral peak (local maximum) within a relative tolerance of `hz`.
// Requiring a real peak, not just energy, stops the skirt of a neighbouring
// partial (e.g. a semitone away in the bass) from counting as evidence.
function peakNear(peakList, hz, tol, binHz) {
  const width = Math.max(1.5 * binHz, hz * tol);
  let best = 0;
  for (const p of peakList) if (Math.abs(p.hz - hz) <= width && p.mag > best) best = p.mag;
  return best;
}

// Expected partial frequency range [lo, hi] of harmonic h of a note.
function partialRange(f0, h, binHz) {
  const tol = Math.max(0.02, (2 * binHz) / (h * f0));
  return [h * f0 * (1 - tol), h * f0 * Math.sqrt(1 + MAX_INHARMONICITY * h * h) * (1 + tol)];
}

function explainedBy(hz, midis, binHz) {
  return midis.some((m) => {
    const f0 = midiToFreq(m);
    for (let h = 1; h <= MAX_PARTIAL && h * f0 <= MAX_HZ * 1.1; h++) {
      const [lo, hi] = partialRange(f0, h, binHz);
      if (hz >= lo && hz <= hi) return true;
    }
    return false;
  });
}

// Local maxima above `floor`, as frequencies.
function peaks(spec, floor) {
  const out = [];
  const { mags } = spec;
  for (let b = Math.max(2, bin(spec, MIN_HZ)); b < Math.min(mags.length - 2, bin(spec, MAX_HZ)); b++) {
    const m = mags[b];
    if (m >= floor && m > mags[b - 1] && m >= mags[b + 1] && m > mags[b - 2] && m >= mags[b + 2]) {
      out.push({ hz: b * spec.binHz, mag: m, bin: b });
    }
  }
  return out;
}

/**
 * Judge a played chord against the expected notes.
 * @param spec spectrum shortly after the onset
 * @param preSpec spectrum just before the onset (sound already ringing), or null
 * @param targets expected MIDI notes
 * @param range { low, high } MIDI range to search when naming wrong notes
 * @returns {{ verdict: 'correct'|'partial'|'wrong'|'none', heard: number[] }}
 */
export function judgeChord(spec, preSpec, targets, range = { low: 21, high: 108 }) {
  const noise = noiseFloor(spec);
  const loudest = peaks(spec, 0).reduce((m, p) => Math.max(m, p.mag), 0);
  if (loudest < noise * STRONG_ABS) return { verdict: 'none', heard: [] };

  // Strong peaks that are new since the onset must belong to a target note.
  const isNew = (p) => !preSpec || preSpec.mags[p.bin] * NEW_RATIO <= p.mag;
  const strong = peaks(spec, Math.max(noise * STRONG_ABS, loudest * STRONG_REL)).filter(isNew);
  const unexplained = strong.filter((p) => !explainedBy(p.hz, targets, spec.binHz));

  // Each target needs evidence from a partial no other target shares.
  const allPeaks = peaks(spec, noise * OWN_EVIDENCE);
  const present = targets.filter((m) => {
    const others = targets.filter((o) => o !== m);
    const f0 = midiToFreq(m);
    for (let h = 1; h <= 4 && h * f0 <= MAX_HZ; h++) {
      const hz = h * f0 * Math.sqrt(1 + 0.0004 * h * h);
      if (explainedBy(hz, others, spec.binHz)) continue;
      const mag = peakNear(allPeaks, hz, 0.025, spec.binHz);
      if (mag >= noise * OWN_EVIDENCE && mag >= loudest * OWN_EVIDENCE_REL) return true;
    }
    return false;
  });

  if (unexplained.length) return { verdict: 'wrong', heard: estimateNotes(spec, preSpec, targets.length, range) };
  if (present.length === targets.length) return { verdict: 'correct', heard: [...targets] };
  if (present.length) return { verdict: 'partial', heard: present };
  return { verdict: 'none', heard: [] };
}

/**
 * Best-effort names for what was played (used for "you played …" messages):
 * repeatedly pick the note whose partials best account for the remaining new
 * peaks, then remove those peaks.
 */
export function estimateNotes(spec, preSpec, count, { low, high }) {
  const noise = noiseFloor(spec);
  const loudest = peaks(spec, 0).reduce((m, p) => Math.max(m, p.mag), 0);
  const allPeaks = peaks(spec, noise * OWN_EVIDENCE);
  let remaining = peaks(spec, Math.max(noise * STRONG_ABS, loudest * STRONG_REL))
    .filter((p) => !preSpec || preSpec.mags[p.bin] * NEW_RATIO <= p.mag);
  const found = [];
  while (found.length < count && remaining.length) {
    // The loudest remaining peak must be a partial of the note we pick; favour
    // the note explaining the most energy, but require its fundamental to be
    // sounding (rules out "sub-harmonic" notes below what was played).
    const top = remaining.reduce((a, b) => (b.mag > a.mag ? b : a));
    let best = null;
    for (let h = 1; h <= MAX_PARTIAL; h++) {
      const m = Math.round(freqToMidi(top.hz / h));
      if (m < low || m > high || found.includes(m) || !explainedBy(top.hz, [m], spec.binHz)) continue;
      const f0 = midiToFreq(m);
      const grounded = peakNear(allPeaks, f0, 0.025, spec.binHz) > 0;
      if (!grounded) continue;
      const energy = remaining.filter((p) => explainedBy(p.hz, [m], spec.binHz)).reduce((s, p) => s + p.mag, 0);
      if (!best || energy > best.energy * 1.05) best = { m, energy };
    }
    if (!best) break;
    found.push(best.m);
    remaining = remaining.filter((p) => !explainedBy(p.hz, [best.m], spec.binHz));
  }
  return found.sort((a, b) => a - b);
}
