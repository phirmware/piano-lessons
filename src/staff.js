// Renders the exercise as grand-staff systems (SVG), like a printed worksheet.
import { clefFor, staffStep, ledgerSteps, noteLabel, midiToName } from './notes.js';

const S = 12; // staff line spacing
const TREBLE_BOTTOM_Y = 132;
const BASS_BOTTOM_Y = 252;
const STAFF_LEFT = 14;
const CLEF_W = 64;
const SLOT_W = 78;
const HEIGHT = 322;
const LABEL_Y = 308;

// Glyphs from Bravura (SMuFL): 1 em = 4 staff spaces, and each clef's origin
// sits on the line it names (G line for treble, F line for bass).
const TREBLE_CLEF = '\uE050';
const BASS_CLEF = '\uE062';
const SHARP = '\uE262';
const FLAT = '\uE260';

const yFor = (step, clef) => (clef === 'treble' ? TREBLE_BOTTOM_Y : BASS_BOTTOM_Y) - (step * S) / 2;

function staffLines(bottomY, x1, x2) {
  let out = '';
  for (let i = 0; i < 5; i++) {
    const y = bottomY - i * S;
    out += `<line class="staff-line" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
  }
  return out;
}

function wholeNote(x, y) {
  return `<ellipse cx="${x}" cy="${y}" rx="8.6" ry="6.2"/>` +
    `<ellipse class="hole" cx="${x}" cy="${y}" rx="4.6" ry="3.2" transform="rotate(-38 ${x} ${y})"/>`;
}

function noteGroup(note, x, cls) {
  const clef = clefFor(note);
  const step = staffStep(note, clef);
  const y = yFor(step, clef);
  let out = `<g class="note ${cls}">`;
  for (const s of ledgerSteps(step)) {
    const ly = yFor(s, clef);
    out += `<line class="ledger" x1="${x - 15}" y1="${ly}" x2="${x + 15}" y2="${ly}"/>`;
  }
  if (note.accidental) {
    const glyph = note.accidental === 1 ? '♯' : '♭';
    const dy = note.accidental === 1 ? 0 : -4;
    out += `<text class="accidental" x="${x - 22}" y="${y + dy}">${glyph}</text>`;
  }
  out += wholeNote(x, y) + '</g>';
  return out;
}

/**
 * @param {HTMLElement} container
 * @param {{ notes, index, results, wrongMidi, showNames, perSystem }} view
 *   results[i] = { done: bool, mistakes: number }
 */
export function renderSheet(container, { notes, index, results, wrongMidi, showNames, perSystem }) {
  let html = '';
  for (let start = 0; start < notes.length; start += perSystem) {
    const slice = notes.slice(start, start + perSystem);
    const width = STAFF_LEFT + CLEF_W + perSystem * SLOT_W + 10;
    const right = width - 4;
    // Grow the system for notes beyond C2–C7 (many ledger lines); within that
    // range it keeps the standard 0..HEIGHT box.
    const ys = slice.map((note) => yFor(staffStep(note), clefFor(note)));
    const top = Math.min(0, Math.min(...ys) - 12);
    const bottom = Math.max(HEIGHT, Math.max(...ys) + 46);
    const labelY = LABEL_Y + (bottom - HEIGHT);
    let svg = `<svg class="system" viewBox="0 ${top} ${width} ${bottom - top}" role="img" aria-label="Notes ${start + 1} to ${start + slice.length}">`;

    // Cursor behind the current note.
    slice.forEach((_, i) => {
      if (start + i !== index) return;
      const x = STAFF_LEFT + CLEF_W + SLOT_W * (i + 0.5);
      svg += `<rect class="cursor${wrongMidi !== null ? ' is-wrong' : ''}" x="${x - SLOT_W / 2 + 5}" y="${top + 4}" width="${SLOT_W - 10}" height="${bottom - top - 8}" rx="10"/>`;
    });

    svg += staffLines(TREBLE_BOTTOM_Y, STAFF_LEFT, right) + staffLines(BASS_BOTTOM_Y, STAFF_LEFT, right);
    svg += `<line class="barline" x1="${STAFF_LEFT}" y1="${TREBLE_BOTTOM_Y - 4 * S}" x2="${STAFF_LEFT}" y2="${BASS_BOTTOM_Y}"/>`;
    svg += `<line class="barline" x1="${right}" y1="${TREBLE_BOTTOM_Y - 4 * S}" x2="${right}" y2="${BASS_BOTTOM_Y}"/>`;
    svg += `<text class="clef" x="${STAFF_LEFT + 10}" y="${TREBLE_BOTTOM_Y - S}">${TREBLE_CLEF}</text>`;
    svg += `<text class="clef" x="${STAFF_LEFT + 10}" y="${BASS_BOTTOM_Y - 3 * S}">${BASS_CLEF}</text>`;

    slice.forEach((note, i) => {
      const n = start + i;
      const x = STAFF_LEFT + CLEF_W + SLOT_W * (i + 0.5);
      const r = results[n];
      const cls = n === index ? (wrongMidi !== null ? 'current wrong' : 'current') : r.done ? (r.mistakes ? 'done had-mistakes' : 'done') : 'upcoming';
      svg += noteGroup(note, x, cls);
      if (n === index && wrongMidi !== null) {
        svg += `<text class="label label-wrong" x="${x}" y="${labelY}">✗ ${midiToName(wrongMidi)}</text>`;
      } else if (showNames === 'always' || (showNames === 'after' && r.done)) {
        svg += `<text class="label${r.done ? ' label-done' : ''}" x="${x}" y="${labelY}">${noteLabel(note)}</text>`;
      }
    });

    html += svg + '</svg>';
  }
  container.innerHTML = html;
}
