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
    // Inner strip: fills the container on desktop, wider than it (scrollable)
    // on phones where keys get a minimum tappable width.
    container.innerHTML = `<div class="keys" style="--whites:${whites.length}">${html}</div>`;
    container.setAttribute('aria-label', `Piano keyboard ${midiToName(lo)} to ${midiToName(hi)}`);
    updateFit();
  }

  // When every white key can be at least FIT_MIN_KEY px wide, the keys fill the
  // container instead of scrolling (used by the phone layout).
  const FIT_MIN_KEY = 32;
  function updateFit() {
    const whites = container.querySelectorAll('.key.white').length;
    container.classList.toggle('fits', whites > 0 && container.clientWidth / whites >= FIT_MIN_KEY);
  }
  new ResizeObserver(updateFit).observe(container);

  draw(low, high);
  // Mouse presses play immediately. Touch/pen presses play on release, and only
  // if the finger didn't move, so swiping to scroll the keys never plays a note.
  let touch = null;
  const endTouch = () => {
    touch?.key.classList.remove('pressed');
    touch = null;
  };
  container.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
      onPress(Number(key.dataset.midi));
      return;
    }
    endTouch();
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, scroll: container.scrollLeft, key };
    key.classList.add('pressed');
  });
  container.addEventListener('pointermove', (e) => {
    if (touch?.id === e.pointerId && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10) endTouch();
  });
  container.addEventListener('pointerup', (e) => {
    if (touch?.id !== e.pointerId) return;
    const { key, scroll } = touch;
    endTouch();
    if (Math.abs(container.scrollLeft - scroll) < 2) onPress(Number(key.dataset.midi));
  });
  container.addEventListener('pointercancel', endTouch);

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
    // Persistent marker on one key or a list of keys (e.g. the hint for the
    // target); pass null to clear.
    mark(midi, cls) {
      container.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
      for (const m of [].concat(midi ?? [])) keyEl(m)?.classList.add(cls);
    },
    // Scroll a key to the middle when the keys don't all fit (phones).
    reveal(midi, smooth = true) {
      const el = keyEl(midi);
      if (!el || container.scrollWidth <= container.clientWidth) return;
      const left = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
      container.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    },
    // Redraw with a different range (no-op if unchanged).
    setRange(lo, hi) {
      if (range.low !== lo || range.high !== hi) draw(lo, hi);
    },
  };
}
