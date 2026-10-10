// Renders the exercise as grand-staff systems (SVG), like a printed worksheet.
import { clefFor, staffStep, ledgerSteps, noteLabel, midiToName, stepNotes } from './notes.js';

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

const SECOND_SHIFT = 17; // notehead offset when two notes are a step apart
const ACCIDENTAL_GAP = 16; // extra offset for crowded accidentals

// Draws one step: a single note, or several notes stacked in one column.
function noteGroup(step, x, cls) {
  // Lowest first; a note a step above its neighbour on the same staff is
  // shifted right so the heads don't overlap.
  const placed = stepNotes(step)
    .map((note) => ({ note, clef: clefFor(note), step: staffStep(note), dx: 0, ax: 0 }))
    .sort((a, b) => a.note.midi - b.note.midi);
  placed.forEach((p, i) => {
    const prev = placed[i - 1];
    if (prev && prev.clef === p.clef && p.step - prev.step === 1 && prev.dx === 0) p.dx = SECOND_SHIFT;
  });
  // Accidentals: from the top down, step further left when one above is close.
  const withAcc = placed.filter((p) => p.note.accidental).reverse();
  withAcc.forEach((p, i) => {
    const near = withAcc.slice(0, i).filter((q) => q.clef === p.clef && q.step - p.step < 6);
    p.ax = near.length ? Math.max(...near.map((q) => q.ax)) + ACCIDENTAL_GAP : 0;
  });

  let out = `<g class="note ${cls}">`;
  for (const { note, clef, step: st, dx, ax } of placed) {
    const nx = x + dx;
    const y = yFor(st, clef);
    for (const s of ledgerSteps(st)) {
      const ly = yFor(s, clef);
      out += `<line class="ledger" x1="${nx - 15}" y1="${ly}" x2="${nx + 15}" y2="${ly}"/>`;
    }
    if (note.accidental) {
      const glyph = note.accidental === 1 ? '♯' : '♭';
      const dy = note.accidental === 1 ? 0 : -4;
      out += `<text class="accidental" x="${x - 22 - ax}" y="${y + dy}">${glyph}</text>`;
    }
    out += wholeNote(nx, y);
  }
  return out + '</g>';
}

// Name label(s) under a step; chords stack their names, highest on top.
function stepLabels(step, x, y, cls) {
  return stepNotes(step)
    .slice()
    .sort((a, b) => a.midi - b.midi)
    .map((note, i) => `<text class="label${cls}" x="${x}" y="${y - i * 16}">${noteLabel(note)}</text>`)
    .join('');
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
    const ys = slice.flatMap((step) => stepNotes(step).map((note) => yFor(staffStep(note), clefFor(note))));
    const maxLabels = Math.max(...slice.map((step) => stepNotes(step).length));
    const top = Math.min(0, Math.min(...ys) - 12);
    const bottom = Math.max(HEIGHT, Math.max(...ys) + 46 + (maxLabels - 1) * 16);
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
        // wrongMidi: the note heard instead, or for chords the notes heard.
        const heard = [].concat(wrongMidi).map(midiToName).join('+');
        svg += `<text class="label label-wrong${heard.length > 4 ? ' label-small' : ''}" x="${x}" y="${labelY}">✗${heard ? ' ' + heard : ''}</text>`;
      } else if (showNames === 'always' || (showNames === 'after' && r.done)) {
        svg += stepLabels(note, x, labelY, r.done ? ' label-done' : '');
      }
    });

    html += svg + '</svg>';
  }
  container.innerHTML = html;
}
