// On-screen keyboard (C2–C7 by default, up to the full A0–C8) that mirrors what
// is heard and can be clicked as an input.
import { LOWEST_MIDI, HIGHEST_MIDI, isBlackKey, midiToName } from './notes.js';

// Both ends of the range must be white keys.
export function buildKeyboard(container, onPress, { low = LOWEST_MIDI, high = HIGHEST_MIDI } = {}) {
  let range = null;

  function draw(lo, hi) {
    range = { low: lo, high: hi };
    const whites = [];
    for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
    const whiteW = 100 / whites.length;
    let html = '';
    whites.forEach((m, i) => {
      const label = m % 12 === 0 ? `<span>${midiToName(m)}</span>` : '';
      html += `<button class="key white" data-midi="${m}" style="left:${i * whiteW}%;width:${whiteW}%" aria-label="${midiToName(m)}">${label}</button>`;
    });
    for (let m = lo; m <= hi; m++) {
      if (!isBlackKey(m)) continue;
      const leftWhite = whites.indexOf(m - 1);
      const w = whiteW * 0.62;
      html += `<button class="key black" data-midi="${m}" style="left:${(leftWhite + 1) * whiteW - w / 2}%;width:${w}%" aria-label="${midiToName(m)}"></button>`;
    }
    container.innerHTML = html;
    container.setAttribute('aria-label', `Piano keyboard ${midiToName(lo)} to ${midiToName(hi)}`);
  }

  draw(low, high);
  container.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.key');
    if (key) onPress(Number(key.dataset.midi));
  });

  const keyEl = (m) => container.querySelector(`[data-midi="${m}"]`);
  const flashTimers = new Map();
  return {
    // Mark one key with a class for a short time (e.g. heard / wrong).
    flash(midi, cls, ms = 600) {
      const el = keyEl(midi);
      if (!el) return;
      el.classList.add(cls);
      clearTimeout(flashTimers.get(el));
      flashTimers.set(el, setTimeout(() => el.classList.remove(cls), ms));
    },
    // Persistent marker (e.g. hint for the target); pass null to clear.
    mark(midi, cls) {
      container.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
      if (midi !== null) keyEl(midi)?.classList.add(cls);
    },
    // Redraw with a different range (no-op if unchanged).
    setRange(lo, hi) {
      if (range.low !== lo || range.high !== hi) draw(lo, hi);
    },
  };
}
