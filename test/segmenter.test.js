// Simulates the browser loop: a performance is synthesized, then analysed with
// overlapping 4096-sample windows every ~16 ms, just like requestAnimationFrame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoteSegmenter } from '../src/segmenter.js';
import { analyzeFrame } from '../src/analyzer.js';
import { pianoTone } from './helpers/synth.js';

const SR = 48000;

// events: [{ midi, at (s), duration (s), amp }]; tones are mixed so they overlap
// (legato / sustain), plus low background noise.
function perform(events, total) {
  const out = new Float32Array(Math.floor(SR * total));
  let s = 3;
  for (let i = 0; i < out.length; i++) out[i] = 0.002 * (((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1);
  for (const e of events) {
    const tone = pianoTone(e.midi, { sampleRate: SR, duration: e.duration ?? 1.2, amp: e.amp ?? 0.3, noise: 0 });
    const off = Math.floor(e.at * SR);
    for (let i = 0; i < tone.length && off + i < out.length; i++) out[off + i] += tone[i];
  }
  return out;
}

function listen(audio, gate = 0.008) {
  const seg = new NoteSegmenter({ gate });
  const heard = [];
  const hop = Math.floor(SR / 60);
  for (let end = 4096; end <= audio.length; end += hop) {
    const frame = analyzeFrame(audio.subarray(end - 4096, end), SR, gate);
    const midi = seg.process({ time: (end / SR) * 1000, ...frame });
    if (midi !== null) heard.push(midi);
  }
  return heard;
}

test('hears separate notes across the whole range', () => {
  const seq = [36, 43, 50, 60, 67, 77, 84, 96, 40, 72];
  const audio = perform(seq.map((midi, i) => ({ midi, at: 0.2 + i * 0.8, duration: 0.7 })), 0.2 + seq.length * 0.8 + 0.3);
  assert.deepEqual(listen(audio), seq);
});

test('legato: next note starts while previous still rings', () => {
  const seq = [60, 64, 67, 72, 48];
  const audio = perform(seq.map((midi, i) => ({ midi, at: 0.2 + i * 0.6, duration: 1.5 })), 4);
  assert.deepEqual(listen(audio), seq);
});

test('repeating the same key twice is two attempts', () => {
  const audio = perform([{ midi: 62, at: 0.2, duration: 0.6 }, { midi: 62, at: 1.0, duration: 0.6 }], 2);
  assert.deepEqual(listen(audio), [62, 62]);
});

test('a soft note is still heard', () => {
  const audio = perform([{ midi: 55, at: 0.3, amp: 0.05 }], 1.5);
  assert.deepEqual(listen(audio), [55]);
});

test('a long sustained note is reported once', () => {
  const audio = perform([{ midi: 45, at: 0.2, duration: 3 }], 3.5);
  assert.deepEqual(listen(audio), [45]);
});

test('background noise alone produces nothing', () => {
  assert.deepEqual(listen(perform([], 2)), []);
});
