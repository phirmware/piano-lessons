// Turns a stream of per-frame analysis (level + pitch) into discrete
// "note played" events. A note is only reported after an onset (a sharp rise in
// level), so a sustained or decaying note is never re-judged against the next
// target, and pressing the same key again counts as a new attempt.

const ONSET_RATIO = 1.8; // level must jump this much above the recent minimum
const ONSET_LOOKBACK_MS = 150;
const MIN_ONSET_GAP_MS = 180;
const SETTLE_MS = 40; // skip the first frames, still mixed with the previous note
const DECIDE_WINDOW_MS = 450;
const STREAK_NEEDED = 3;

export class NoteSegmenter {
  constructor({ gate = 0.008, minClarity = 0.85 } = {}) {
    this.gate = gate;
    this.minClarity = minClarity;
    this.history = []; // { time, level }
    this.lastOnset = -Infinity;
    this.pending = null; // { start, votes: Map, streakMidi, streak }
  }

  /**
   * @param {{ time: number, level: number, midi: number|null, clarity: number }} frame
   * @returns {number|null} MIDI note played, when a decision is reached
   */
  process({ time, level, midi, clarity }) {
    const recent = this.history.filter((h) => time - h.time <= ONSET_LOOKBACK_MS);
    const floor = recent.length ? Math.min(...recent.map((h) => h.level)) : 0;
    this.history = [...recent, { time, level }];

    if (level >= this.gate && level >= floor * ONSET_RATIO && time - this.lastOnset >= MIN_ONSET_GAP_MS) {
      this.lastOnset = time;
      this.pending = { start: time, votes: new Map(), streakMidi: null, streak: 0 };
    }

    const p = this.pending;
    if (!p) return null;
    const age = time - p.start;

    if (age >= SETTLE_MS && midi !== null && clarity >= this.minClarity && level >= this.gate * 0.5) {
      const rounded = Math.round(midi);
      if (Math.abs(midi - rounded) < 0.4) {
        p.votes.set(rounded, (p.votes.get(rounded) || 0) + 1);
        p.streak = p.streakMidi === rounded ? p.streak + 1 : 1;
        p.streakMidi = rounded;
        if (p.streak >= STREAK_NEEDED) return this.#decide(rounded);
      }
    }

    if (age > DECIDE_WINDOW_MS) {
      let best = null, bestVotes = 0;
      for (const [m, v] of p.votes) if (v > bestVotes) [best, bestVotes] = [m, v];
      return bestVotes >= 2 ? this.#decide(best) : this.#decide(null);
    }
    return null;
  }

  #decide(midi) {
    this.pending = null;
    return midi;
  }
}

// For chords: reports the onset (so the caller can snapshot what was already
// ringing) and, ANALYZE_DELAY_MS later, when to judge the spectrum. The delay
// lets a second key pressed slightly late join the same attempt.
const ANALYZE_DELAY_MS = 260;

export class ChordSegmenter {
  constructor({ gate = 0.008 } = {}) {
    this.gate = gate;
    this.history = [];
    this.lastOnset = -Infinity;
    this.analyzeAt = null;
  }

  /** @returns {'onset'|'analyze'|null} */
  process({ time, level }) {
    const recent = this.history.filter((h) => time - h.time <= ONSET_LOOKBACK_MS);
    const floor = recent.length ? Math.min(...recent.map((h) => h.level)) : 0;
    this.history = [...recent, { time, level }];

    if (level >= this.gate && level >= floor * ONSET_RATIO && time - this.lastOnset >= MIN_ONSET_GAP_MS) {
      this.lastOnset = time;
      this.analyzeAt = time + ANALYZE_DELAY_MS;
      return 'onset';
    }
    if (this.analyzeAt !== null && time >= this.analyzeAt) {
      this.analyzeAt = null;
      return 'analyze';
    }
    return null;
  }
}
