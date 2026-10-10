// Note inputs: microphone (pitch detection) and USB MIDI keyboards.
import { analyzeFrame, pitchRangeFor } from './analyzer.js';
import { NoteSegmenter, ChordSegmenter } from './segmenter.js';
import { magnitudeSpectrum, judgeChord } from './chord.js';

// Single notes are judged on the most recent SINGLE_WINDOW samples (pitch
// tracking); chords need a longer window for frequency resolution.
const SINGLE_WINDOW = 4096;
const CHORD_WINDOW = 8192;

export class MicListener {
  constructor({ onNote, onChord, onFrame }) {
    this.onNote = onNote;
    this.onChord = onChord;
    this.onFrame = onFrame;
    this.gate = 0.008;
    this.mutedUntil = 0;
    this.pitchRange = undefined;
    this.midiRange = { low: 21, high: 108 };
    this.chordTargets = null;
    this.running = false;
  }

  async start() {
    // Browser voice processing distorts music; turn it off.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = CHORD_WINDOW;
    source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.segmenter = new NoteSegmenter({ gate: this.gate });
    this.chordSegmenter = new ChordSegmenter({ gate: this.gate });
    this.preOnset = null;
    this.running = true;
    this.#loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
  }

  setGate(gate) {
    this.gate = gate;
    if (this.segmenter) this.segmenter.gate = gate;
    if (this.chordSegmenter) this.chordSegmenter.gate = gate;
  }

  // Keys the player might press (the on-screen keyboard's range).
  setRange(lowMidi, highMidi) {
    this.pitchRange = pitchRangeFor(lowMidi, highMidi);
    this.midiRange = { low: lowMidi, high: highMidi };
  }

  // Expect several notes played together (MIDI numbers), or null for single
  // notes. In chord mode results arrive through onChord({ verdict, heard }).
  setChordTargets(midis) {
    this.chordTargets = midis && midis.length > 1 ? midis : null;
  }

  // Ignore the mic briefly, e.g. while the app itself plays a note.
  mute(ms) {
    this.mutedUntil = performance.now() + ms;
  }

  #loop = () => {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const now = performance.now();
    const recent = this.buf.subarray(this.buf.length - SINGLE_WINDOW);
    const frame = analyzeFrame(recent, this.ctx.sampleRate, this.gate, this.pitchRange);
    this.onFrame?.(frame);
    if (now >= this.mutedUntil) {
      if (this.chordTargets) {
        const event = this.chordSegmenter.process({ time: now, level: frame.level });
        if (event === 'onset') this.preOnset = magnitudeSpectrum(this.buf, this.ctx.sampleRate);
        if (event === 'analyze') {
          const spec = magnitudeSpectrum(this.buf, this.ctx.sampleRate);
          this.onChord(judgeChord(spec, this.preOnset, this.chordTargets, this.midiRange));
        }
      } else {
        const midi = this.segmenter.process({ time: now, ...frame });
        if (midi !== null) this.onNote(midi, 'mic');
      }
    }
    requestAnimationFrame(this.#loop);
  };
}

export async function connectMidi({ onNote, onNoteOff, onDevices }) {
  if (!navigator.requestMIDIAccess) return false;
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    return false;
  }
  const attach = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      names.push(input.name);
      input.onmidimessage = (e) => {
        const [status, note, velocity] = e.data;
        const type = status & 0xf0;
        if (type === 0x90 && velocity > 0) onNote(note, 'midi');
        else if (type === 0x80 || type === 0x90) onNoteOff?.(note);
      };
    }
    onDevices(names);
  };
  access.onstatechange = attach;
  attach();
  return true;
}

// Simple piano-ish tone for "hear it" and on-screen key clicks.
let synthCtx;
export function playTone(freq, duration = 0.9) {
  synthCtx ??= new AudioContext();
  const t = synthCtx.currentTime;
  const gain = synthCtx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  gain.connect(synthCtx.destination);
  for (const [mult, amp] of [[1, 1], [2, 0.4], [3, 0.15]]) {
    const osc = synthCtx.createOscillator();
    const g = synthCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq * mult;
    g.gain.value = amp;
    osc.connect(g).connect(gain);
    osc.start(t);
    osc.stop(t + duration);
  }
}
