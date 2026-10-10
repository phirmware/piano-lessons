import { notePool, generateExercise, naturalNotesInRange, noteLabel, midiToName, midiToFreq, keyboardRange, LOWEST_MIDI, HIGHEST_MIDI } from './notes.js';
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

const keyboard = buildKeyboard($('keyboard'), (midi) => {
  playTone(midiToFreq(midi));
  mic?.mute(SELF_SOUND_MUTE_MS);
  handleNote(midi);
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
  kbRange = keyboardRange(customName ? notes.map((n) => n.midi) : [settings.low, settings.high]);
  keyboard.setRange(kbRange.low, kbRange.high);
  mic?.setRange(kbRange.low, kbRange.high);
  $('rangeLabel').textContent = `${midiToName(settings.low)}–${midiToName(settings.high)}`;
  state = {
    notes,
    customName,
    index: 0,
    results: notes.map(() => ({ done: false, mistakes: 0 })),
    wrongMidi: null,
    startedAt: null,
  };
  keyboard.mark(null, 'hint');
  setFeedback(mic || midiNames.length ? 'Play the highlighted note.' : 'Press “Start listening”, then play the highlighted note.');
  render();
}

function newExercise() {
  const pool = notePool(settings);
  if (!pool.length) {
    setFeedback('No notes match these settings — widen the range or change the clef.', 'bad');
    return;
  }
  startExercise(generateExercise(pool, settings.count));
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
  const result = state.results[state.index];
  state.startedAt ??= performance.now();

  if (midi === target.midi) {
    result.done = true;
    state.wrongMidi = null;
    keyboard.flash(midi, 'correct');
    keyboard.mark(null, 'hint');
    setFeedback(`✓ Correct — ${noteLabel(target)}`, 'good');
    state.index++;
    render();
    if (state.index === state.notes.length) finish();
  } else {
    result.mistakes++;
    state.wrongMidi = midi;
    keyboard.flash(midi, 'wrong', 900);
    const hint = settings.hintAfter && result.mistakes >= settings.hintAfter;
    if (hint) keyboard.mark(target.midi, 'hint');
    setFeedback(`✗ You played ${midiToName(midi)} — try again${hint ? ' (the right key is outlined below)' : ''}`, 'bad');
    render();
  }
}

function finish() {
  const { notes, results, startedAt } = state;
  const firstTry = results.filter((r) => r.mistakes === 0).length;
  const seconds = Math.round((performance.now() - (startedAt ?? performance.now())) / 1000);
  const missed = notes.filter((_, i) => results[i].mistakes > 0).map(noteLabel);
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
  const listener = new MicListener({ onNote: handleNote, onFrame });
  listener.setGate(gateFor(settings.sensitivity));
  listener.setRange(kbRange.low, kbRange.high);
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
  if (state.index === 0 && !state.startedAt) setFeedback('Listening… play the highlighted note.');
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
    showNames: f.showNames.value,
    hintAfter: Number(f.hintAfter.value),
    sensitivity: Number(f.sensitivity.value),
  };
  saveSettings();
  mic?.setGate(gateFor(settings.sensitivity));
  updateGateMarker();
  const exerciseKeys = ['low', 'high', 'clef', 'accidentals', 'count'];
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
  playTone(midiToFreq(target.midi));
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
  onNote: handleNote,
  onDevices: (names) => {
    midiNames = names;
    updateInputStatus();
  },
});
