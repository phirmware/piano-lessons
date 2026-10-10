// Note inputs: microphone (pitch detection) and USB MIDI keyboards.
import { analyzeFrame } from './analyzer.js';
import { NoteSegmenter } from './segmenter.js';

export class MicListener {
  constructor({ onNote, onFrame }) {
    this.onNote = onNote;
    this.onFrame = onFrame;
    this.gate = 0.008;
    this.mutedUntil = 0;
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
    this.analyser.fftSize = 4096;
    source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.segmenter = new NoteSegmenter({ gate: this.gate });
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
  }

  // Ignore the mic briefly, e.g. while the app itself plays a note.
  mute(ms) {
    this.mutedUntil = performance.now() + ms;
  }

  #loop = () => {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const now = performance.now();
    const frame = analyzeFrame(this.buf, this.ctx.sampleRate, this.gate);
    this.onFrame?.(frame);
    if (now >= this.mutedUntil) {
      const midi = this.segmenter.process({ time: now, ...frame });
      if (midi !== null) this.onNote(midi, 'mic');
    }
    requestAnimationFrame(this.#loop);
  };
}

export async function connectMidi({ onNote, onDevices }) {
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
        if ((status & 0xf0) === 0x90 && velocity > 0) onNote(note, 'midi');
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
