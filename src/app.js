import { notePool, generateExercise, generateChordExercise, naturalNotesInRange, noteLabel, stepNotes, stepMidis, stepLabel, midiToName, midiToFreq, keyboardRange, LOWEST_MIDI, HIGHEST_MIDI } from './notes.js';
import { renderSheet } from './staff.js';
import { buildKeyboard } from './keyboard.js';
import { MicListener, connectMidi, playTone } from './inputs.js';
import { initLibrary } from './library.js';

const DEFAULTS = {
  low: LOWEST_MIDI,
  high: HIGHEST_MIDI,
  clef: 'both',
  accidentals: false,
  count: 16,
  notesAtOnce: 1,
  showNames: 'after',
  hintAfter: 2,
  sensitivity: 50,
};
const STORAGE_KEY = 'note-reader-settings';
const SELF_SOUND_MUTE_MS = 1400;

const $ = (id) => document.getElementById(id);
const els = {
  sheet: $('sheet'), feedback: $('feedback'), progress: $('progress'), mistakes: $('mistakes'),
  mic: $('mic'), hear: $('hear'), newEx: $('newEx'), heard: $('heard'), meterFill: $('meterFill'),
  meterGate: $('meterGate'), inputStatus: $('inputStatus'), settingsBtn: $('settingsBtn'),
  settings: $('settings'), form: $('settingsForm'), done: $('done'), summary: $('summary'),
  again: $('again'), retry: $('retry'), modeChip: $('modeChip'), modeName: $('modeName'),
};

let settings = loadSettings();
let state;
let mic = null;
let midiNames = [];
let kbRange = keyboardRange([]);
let practiceSpan = [LOWEST_MIDI, HIGHEST_MIDI];
// Phones show only the keys being practised; desktop always shows C2–C7 or more.
const phoneQuery = matchMedia('(max-width: 700px), (pointer: coarse) and (max-height: 500px)');

// Keys tapped on screen / held on a MIDI keyboard towards the current double note.
const tapped = new Set();
const midiHeld = new Set();
// Right notes the mic heard separately (keys pressed a little apart) combine
// into one attempt if they come within STAGGER_MS of each other.
const STAGGER_MS = 1500;
let micPartial = { notes: new Set(), at: 0 };
const currentStep = () => state?.notes[state.index];
const isChord = (step) => Array.isArray(step);

const keyboard = buildKeyboard($('keyboard'), (midi) => {
  playTone(midiToFreq(midi));
  mic?.mute(SELF_SOUND_MUTE_MS);
  if (isChord(currentStep())) {
    // Tap the keys one at a time; tapping a selected key again deselects it.
    if (tapped.has(midi)) tapped.delete(midi);
    else tapped.add(midi);
    keyboard.mark([...tapped], 'pending');
    handleKeys([...tapped]);
  } else {
    handleNote(midi);
  }
});

function loadSettings() {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    // Fall back to the default range if the saved one isn't valid.
    const naturals = naturalNotesInRange().map((n) => n.midi);
    if (!naturals.includes(saved.low) || !naturals.includes(saved.high) || saved.low > saved.high) {
      saved.low = DEFAULTS.low;
      saved.high = DEFAULTS.high;
    }
    return saved;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

// Sensitivity 0–100 → level gate, on a log scale (higher = quieter notes count).
const gateFor = (sensitivity) => 0.04 * Math.pow(0.0015 / 0.04, sensitivity / 100);

// `customName` is set when practising a saved exercise.
function startExercise(notes, customName = null) {
  els.modeChip.hidden = !customName;
  els.modeName.textContent = customName ? `Custom: ${customName}` : '';
  // Show (and listen for) every key the exercise can use, never less than C2–C7.
  practiceSpan = customName ? notes.flatMap(stepMidis) : [settings.low, settings.high];
  kbRange = keyboardRange(practiceSpan);
  showKeyboard();
  mic?.setRange(kbRange.low, kbRange.high); // listen across the wider range either way
  $('rangeLabel').textContent = `${midiToName(settings.low)}–${midiToName(settings.high)}`;
  $('modeLabel').textContent = notes.some(isChord) ? 'Double-note' : 'Single-note';
  state = {
    notes,
    customName,
    index: 0,
    results: notes.map(() => ({ done: false, mistakes: 0 })),
    wrongMidi: null,
    startedAt: null,
  };
  keyboard.mark(null, 'hint');
  clearTapped();
  syncListener();
  const what = isChord(notes[0]) ? 'notes together' : 'note';
  setFeedback(mic || midiNames.length ? `Play the highlighted ${what}.` : `Press “Start listening”, then play the highlighted ${what}.`);
  render();
}

// Tell the mic whether the current step is a single note or a double note.
function syncListener() {
  const step = currentStep();
  mic?.setChordTargets(isChord(step) ? stepMidis(step) : null);
}

function clearTapped() {
  tapped.clear();
  keyboard.mark(null, 'pending');
  micPartial = { notes: new Set(), at: 0 };
}

// Mic results: combine a right note heard shortly after another right note.
function handleMicChord(result) {
  if (!isChord(currentStep())) return;
  if (result.verdict !== 'partial') return handleChord(result);
  const now = performance.now();
  if (now - micPartial.at > STAGGER_MS) micPartial.notes.clear();
  result.heard.forEach((m) => micPartial.notes.add(m));
  micPartial.at = now;
  const targets = stepMidis(currentStep());
  const all = targets.every((m) => micPartial.notes.has(m));
  handleChord(all ? { verdict: 'correct', heard: targets } : { verdict: 'partial', heard: [...micPartial.notes] });
}

function showKeyboard() {
  const shown = phoneQuery.matches ? keyboardRange(practiceSpan, { exact: true }) : kbRange;
  keyboard.setRange(shown.low, shown.high);
  keyboard.reveal(Math.round((Math.min(...practiceSpan) + Math.max(...practiceSpan)) / 2), false);
}

function newExercise() {
  const pool = notePool(settings);
  if (!pool.length) {
    setFeedback('No notes match these settings — widen the range or change the clef.', 'bad');
    return;
  }
  if (settings.notesAtOnce === 2) {
    const steps = generateChordExercise(pool, settings.count);
    if (!steps.length) {
      setFeedback('Not enough notes in this range for double notes — widen the range.', 'bad');
      return;
    }
    startExercise(steps);
  } else {
    startExercise(generateExercise(pool, settings.count));
  }
}

function perSystem() {
  const w = els.sheet.clientWidth;
  return w < 560 ? 4 : w < 860 ? 6 : 8;
}

function render() {
  const { notes, index, results, wrongMidi } = state;
  renderSheet(els.sheet, { notes, index, results, wrongMidi, showNames: settings.showNames, perSystem: perSystem() });
  els.progress.textContent = `Note ${Math.min(index + 1, notes.length)} of ${notes.length}`;
  const total = results.reduce((sum, r) => sum + r.mistakes, 0);
  els.mistakes.textContent = `${total} mistake${total === 1 ? '' : 's'}`;
  els.sheet.querySelector('.cursor')?.closest('svg')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setFeedback(text, tone = '') {
  els.feedback.textContent = text;
  els.feedback.className = `feedback ${tone}`;
}

function handleNote(midi) {
  if (!state || state.index >= state.notes.length) return;
  const target = state.notes[state.index];
  if (isChord(target)) return; // double notes go through handleKeys / handleChord
  const result = state.results[state.index];
  state.startedAt ??= performance.now();

  if (midi === target.midi) {
    result.done = true;
    state.wrongMidi = null;
    keyboard.flash(midi, 'correct');
    keyboard.mark(null, 'hint');
    setFeedback(`✓ Correct — ${noteLabel(target)}`, 'good');
    state.index++;
    syncListener();
    render();
    if (state.index === state.notes.length) finish();
  } else {
    result.mistakes++;
    state.wrongMidi = midi;
    keyboard.flash(midi, 'wrong', 900);
    const hint = settings.hintAfter && result.mistakes >= settings.hintAfter;
    if (hint) {
      keyboard.mark(target.midi, 'hint');
      keyboard.reveal(target.midi);
    }
    setFeedback(`✗ You played ${midiToName(midi)} — try again${hint ? ' (the right key is outlined below)' : ''}`, 'bad');
    render();
  }
}

// Keys known to be down together (taps or MIDI): judge them directly.
function handleKeys(midis) {
  const step = currentStep();
  if (!isChord(step) || !midis.length) return;
  const targets = stepMidis(step);
  const verdict = midis.some((m) => !targets.includes(m)) ? 'wrong'
    : targets.every((m) => midis.includes(m)) ? 'correct' : 'partial';
  handleChord({ verdict, heard: midis });
}

// A judged attempt at the current double note (from the mic, MIDI or taps).
function handleChord({ verdict, heard: unsorted }) {
  const step = currentStep();
  if (!isChord(step) || verdict === 'none') return;
  const result = state.results[state.index];
  const heard = [...unsorted].sort((a, b) => a - b);
  const names = heard.map(midiToName).join(' + ');
  state.startedAt ??= performance.now();
  if (heard.length) els.heard.textContent = heard.map(midiToName).join('+');

  if (verdict === 'partial') {
    setFeedback(`Heard ${names} — play all ${step.length} notes together`);
    return;
  }
  clearTapped();
  if (verdict === 'correct') {
    result.done = true;
    state.wrongMidi = null;
    for (const m of stepMidis(step)) keyboard.flash(m, 'correct');
    keyboard.mark(null, 'hint');
    setFeedback(`✓ Correct — ${stepLabel(step)}`, 'good');
    state.index++;
    syncListener();
    render();
    if (state.index === state.notes.length) finish();
  } else {
    result.mistakes++;
    state.wrongMidi = heard;
    for (const m of heard) keyboard.flash(m, 'wrong', 900);
    const hint = settings.hintAfter && result.mistakes >= settings.hintAfter;
    if (hint) {
      const targets = stepMidis(step);
      keyboard.mark(targets, 'hint');
      keyboard.reveal(Math.round((targets[0] + targets[targets.length - 1]) / 2));
    }
    setFeedback(`✗ ${names ? `You played ${names}` : 'Not quite'} — try again${hint ? ' (the right keys are outlined below)' : ''}`, 'bad');
    render();
  }
}

function finish() {
  const { notes, results, startedAt } = state;
  const firstTry = results.filter((r) => r.mistakes === 0).length;
  const seconds = Math.round((performance.now() - (startedAt ?? performance.now())) / 1000);
  const missed = notes.filter((_, i) => results[i].mistakes > 0).map(stepLabel);
  els.summary.innerHTML = `
    <div class="stats">
      <div><strong>${firstTry}/${notes.length}</strong><span>right first try</span></div>
      <div><strong>${results.reduce((s, r) => s + r.mistakes, 0)}</strong><span>mistakes</span></div>
      <div><strong>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</strong><span>time</span></div>
    </div>
    ${missed.length ? `<p>Notes to review: <strong>${[...new Set(missed)].join(', ')}</strong></p>` : '<p>Perfect — every note right first time.</p>'}`;
  setFeedback('Exercise complete!', 'good');
  setTimeout(() => els.done.showModal(), 500);
}

// --- Inputs -------------------------------------------------------------

function updateInputStatus() {
  const parts = [];
  if (mic) parts.push('Mic on');
  if (midiNames.length) parts.push(`MIDI: ${midiNames.join(', ')}`);
  els.inputStatus.textContent = parts.join(' · ') || 'No input yet';
}

const METER_MIN = Math.log(0.0005), METER_MAX = Math.log(0.3);
const meterPos = (level) => Math.max(0, Math.min(1, (Math.log(Math.max(level, 1e-6)) - METER_MIN) / (METER_MAX - METER_MIN)));

function onFrame({ level, midi, clarity }) {
  els.meterFill.style.width = `${meterPos(level) * 100}%`;
  const gate = gateFor(settings.sensitivity);
  // Single-pitch tracking can't name chords; handleChord shows what it heard.
  if (isChord(currentStep())) {
    if (level < gate * 0.5) els.heard.textContent = '—';
    return;
  }
  if (midi !== null && clarity > 0.85 && level >= gate) {
    els.heard.textContent = midiToName(Math.round(midi));
  } else if (level < gate * 0.5) {
    els.heard.textContent = '—';
  }
}

async function toggleMic() {
  if (mic) {
    mic.stop();
    mic = null;
    els.mic.textContent = 'Start listening';
    els.mic.classList.remove('on');
    els.heard.textContent = '—';
    els.meterFill.style.width = '0';
    updateInputStatus();
    return;
  }
  const listener = new MicListener({ onNote: handleNote, onChord: handleMicChord, onFrame });
  listener.setGate(gateFor(settings.sensitivity));
  listener.setRange(kbRange.low, kbRange.high);
  const step = currentStep();
  listener.setChordTargets(isChord(step) ? stepMidis(step) : null);
  try {
    await listener.start();
  } catch (err) {
    setFeedback(`Couldn't use the microphone: ${err.message}. Check your browser's mic permission.`, 'bad');
    return;
  }
  mic = listener;
  els.mic.textContent = 'Stop listening';
  els.mic.classList.add('on');
  updateInputStatus();
  if (state.index === 0 && !state.startedAt) setFeedback(`Listening… play the highlighted ${isChord(currentStep()) ? 'notes together' : 'note'}.`);
}

function updateGateMarker() {
  els.meterGate.style.left = `${meterPos(gateFor(settings.sensitivity)) * 100}%`;
}

// --- Settings -----------------------------------------------------------

function fillSettingsForm() {
  const opts = naturalNotesInRange().map((n) => `<option value="${n.midi}">${noteLabel(n)}</option>`).join('');
  els.form.low.innerHTML = opts;
  els.form.high.innerHTML = opts;
  for (const [k, v] of Object.entries(settings)) {
    const field = els.form.elements[k];
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = v;
    else field.value = v;
  }
}

els.form.addEventListener('change', (e) => {
  const f = els.form.elements;
  let low = Number(f.low.value), high = Number(f.high.value);
  if (low > high) [low, high] = [high, low];
  const prev = settings;
  settings = {
    low, high,
    clef: f.clef.value,
    accidentals: f.accidentals.checked,
    count: Number(f.count.value),
    notesAtOnce: Number(f.notesAtOnce.value),
    showNames: f.showNames.value,
    hintAfter: Number(f.hintAfter.value),
    sensitivity: Number(f.sensitivity.value),
  };
  saveSettings();
  mic?.setGate(gateFor(settings.sensitivity));
  updateGateMarker();
  const exerciseKeys = ['low', 'high', 'clef', 'accidentals', 'count', 'notesAtOnce'];
  if (exerciseKeys.some((k) => prev[k] !== settings[k])) {
    f.low.value = low;
    f.high.value = high;
    newExercise();
  } else if (e.target.name === 'showNames') {
    render();
  }
});

els.settingsBtn.addEventListener('click', () => {
  els.settings.hidden = !els.settings.hidden;
  els.settingsBtn.setAttribute('aria-expanded', String(!els.settings.hidden));
});
$('closeSettings').addEventListener('click', () => {
  els.settings.hidden = true;
  els.settingsBtn.setAttribute('aria-expanded', 'false');
});

// --- Wiring -------------------------------------------------------------

function hearTarget() {
  const target = state.notes[state.index];
  if (!target) return;
  mic?.mute(SELF_SOUND_MUTE_MS);
  for (const note of stepNotes(target)) playTone(midiToFreq(note.midi));
}

els.mic.addEventListener('click', toggleMic);
els.hear.addEventListener('click', hearTarget);
els.newEx.addEventListener('click', newExercise);
$('exitCustom').addEventListener('click', newExercise);
els.again.addEventListener('click', () => { els.done.close(); newExercise(); });
els.retry.addEventListener('click', () => { els.done.close(); startExercise(state.notes, state.customName); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey) return;
  if (e.key === 'h') hearTarget();
  if (e.key === 'n') newExercise();
  if (e.key === 'l') toggleMic();
});

let lastPerSystem = perSystem();
new ResizeObserver(() => {
  const p = perSystem();
  if (p !== lastPerSystem) {
    lastPerSystem = p;
    render();
  }
}).observe(els.sheet);

phoneQuery.addEventListener('change', () => {
  showKeyboard();
  const target = state.notes[state.index];
  const hint = settings.hintAfter && target && state.results[state.index].mistakes >= settings.hintAfter;
  if (hint) keyboard.mark(stepMidis(target), 'hint');
  keyboard.mark([...tapped], 'pending');
});

fillSettingsForm();
updateGateMarker();
newExercise();
document.fonts.ready.then(render);
initLibrary({
  start: startExercise,
  preview: (midi) => {
    playTone(midiToFreq(midi));
    mic?.mute(SELF_SOUND_MUTE_MS);
  },
});
updateInputStatus();
connectMidi({
  // Double notes: judge whatever is held when a key goes down.
  onNote: (midi) => {
    midiHeld.add(midi);
    if (isChord(currentStep())) handleKeys([...midiHeld]);
    else handleNote(midi);
  },
  onNoteOff: (midi) => midiHeld.delete(midi),
  onDevices: (names) => {
    midiNames = names;
    updateInputStatus();
  },
});
