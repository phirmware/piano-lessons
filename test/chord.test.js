// Double notes: synthesized chords run through the same listening loop as the
// browser (onset → spectrum → judgement). Roots are sampled across C2–B6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perform, listenChords } from './helpers/chordsim.js';
import { makeNote, midiToName } from '../src/notes.js';
import { fft } from '../src/fft.js';

// Every third diatonic root from C2, with intervals of a 3rd to a 7th.
const DYADS = [];
for (let root = 14; root <= 47; root += 3) {
  for (let d = 2; d <= 6; d++) {
    const a = makeNote(root % 7, Math.floor(root / 7));
    const b = makeNote((root + d) % 7, Math.floor((root + d) / 7));
    if (b.midi <= 96) DYADS.push([a.midi, b.midi]);
  }
}
const name = (ms) => ms.map(midiToName).join('+');
const verdicts = (log) => log.map((r) => r.verdict).join(',') || 'nothing';

function check(build) {
  const failures = [];
  for (const dyad of DYADS) {
    const problem = build(dyad);
    if (problem) failures.push(`${name(dyad)}: ${problem}`);
  }
  assert.deepEqual(failures, []);
}

test('fft matches a direct DFT', () => {
  const n = 16, re = new Float64Array(n), im = new Float64Array(n);
  const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1));
  x.forEach((v, i) => (re[i] = v));
  fft(re, im);
  for (let k = 0; k < n; k++) {
    let r = 0, m = 0;
    x.forEach((v, i) => { r += v * Math.cos((-2 * Math.PI * k * i) / n); m += v * Math.sin((-2 * Math.PI * k * i) / n); });
    assert.ok(Math.abs(re[k] - r) < 1e-9 && Math.abs(im[k] - m) < 1e-9);
  }
});

test('both notes played together → correct', () => {
  check(([a, b]) => {
    const log = listenChords(perform([{ midi: a, at: 0.2 }, { midi: b, at: 0.2 }], 0.9), [[a, b]]);
    return log[0]?.verdict === 'correct' ? null : verdicts(log);
  });
});

test('one key softer than the other → still correct', () => {
  check(([a, b]) => {
    const log = listenChords(perform([{ midi: a, at: 0.2, amp: 0.3 }, { midi: b, at: 0.2, amp: 0.1 }], 0.9), [[a, b]]);
    return log[0]?.verdict === 'correct' ? null : verdicts(log);
  });
});

test('keys pressed slightly apart, or the second one late → correct, never wrong', () => {
  check(([a, b]) => {
    for (const gap of [0.12, 0.5]) {
      const log = listenChords(perform([{ midi: a, at: 0.2 }, { midi: b, at: 0.2 + gap }], 1.5), [[a, b]]);
      if (log.at(-1)?.verdict !== 'correct' || log.some((r) => r.verdict === 'wrong')) return `${gap}s gap: ${verdicts(log)}`;
    }
    return null;
  });
});

test('a wrong note is never accepted, and is reported as wrong', () => {
  check(([a, b]) => {
    for (const played of [[a, b + 1], [a - 1, b], [a + 2, b + 2]]) {
      const log = listenChords(perform(played.map((midi) => ({ midi, at: 0.2 })), 0.9), [[a, b]]);
      if (log.some((r) => r.verdict === 'correct')) return `accepted ${name(played)}`;
      // An upper note a semitone sharp can land an octave above the lower one,
      // which is indistinguishable from its overtones; it's then "partial".
      const octave = (played[1] - played[0]) % 12 === 0;
      if (!octave && log[0]?.verdict !== 'wrong') return `${name(played)}: ${verdicts(log)}`;
    }
    return null;
  });
});

test('only one of the two notes → partial (wait for the other), not correct', () => {
  check(([a, b]) => {
    const log = listenChords(perform([{ midi: a, at: 0.2 }], 0.9), [[a, b]]);
    return log[0]?.verdict === 'partial' ? null : verdicts(log);
  });
});

test('previous chord still ringing does not count against the next one', () => {
  check(([a, b]) => {
    const prev = b + 5 <= 96 ? [a + 5, b + 5] : [a - 5, b - 5];
    const audio = perform([...prev.map((midi) => ({ midi, at: 0.2, duration: 2 })), { midi: a, at: 0.9 }, { midi: b, at: 0.9 }], 1.8);
    const log = listenChords(audio, [prev, [a, b]]);
    return log.filter((r) => r.verdict === 'correct').length === 2 && !log.some((r) => r.verdict === 'wrong') ? null : verdicts(log);
  });
});
