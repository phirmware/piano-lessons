// "My exercises": create, save (localStorage), list and practise custom note
// sequences, e.g. copied from an external worksheet.
import { parseNoteList, noteLabel, midiToName } from './notes.js';
import { renderSheet } from './staff.js';
import { buildKeyboard } from './keyboard.js';

const STORAGE_KEY = 'note-reader-custom-exercises';
const PREVIEW_PER_SYSTEM = 4;

function loadExercises() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveExercises(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param {{ start: (notes, name) => void, preview: (midi) => void }} hooks
 *   start: begin practising the given notes; preview: play a note's sound.
 */
export function initLibrary({ start, preview }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('library');
  const listView = $('libraryList');
  const editor = $('libraryEditor');
  const items = $('libraryItems');
  const nameInput = $('customName');
  const notesInput = $('customNotes');
  const errors = $('customErrors');
  const previewEl = $('customPreview');
  const count = $('customCount');
  let exercises = loadExercises();
  let editingId = null;

  buildKeyboard($('customKeyboard'), (midi) => {
    preview(midi);
    const sep = notesInput.value && !/\s$/.test(notesInput.value) ? ' ' : '';
    notesInput.value += sep + midiToName(midi).replace('♯', '#');
    updatePreview();
  });

  function open() {
    $('settings').hidden = true;
    $('settingsBtn').setAttribute('aria-expanded', 'false');
    panel.hidden = false;
    $('libraryBtn').setAttribute('aria-expanded', 'true');
    showList();
  }

  function close() {
    panel.hidden = true;
    $('libraryBtn').setAttribute('aria-expanded', 'false');
  }

  function showList() {
    editor.hidden = true;
    listView.hidden = false;
    if (!exercises.length) {
      items.innerHTML = '<p class="help-text">No saved exercises yet. Create one from a worksheet or song you want to follow.</p>';
      return;
    }
    items.innerHTML = exercises.map((ex) => {
      const notes = parseNoteList(ex.notes.join(' ')).notes;
      const sample = notes.slice(0, 8).map(noteLabel).join(' ') + (notes.length > 8 ? ' …' : '');
      return `<li class="lib-item" data-id="${ex.id}">
        <div class="lib-info">
          <strong>${escapeHtml(ex.name)}</strong>
          <span>${notes.length} note${notes.length === 1 ? '' : 's'} · ${sample}</span>
        </div>
        <div class="lib-actions">
          <button class="primary" data-action="play">Practise</button>
          <button data-action="edit">Edit</button>
          <button data-action="delete">Delete</button>
        </div>
      </li>`;
    }).join('');
  }

  function showEditor(ex = null) {
    editingId = ex?.id ?? null;
    nameInput.value = ex?.name ?? '';
    notesInput.value = ex ? ex.notes.join(' ') : '';
    $('editorTitle').textContent = ex ? 'Edit exercise' : 'New exercise';
    listView.hidden = true;
    editor.hidden = false;
    updatePreview();
    nameInput.focus();
  }

  function updatePreview() {
    const { notes, invalid } = parseNoteList(notesInput.value);
    count.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
    errors.textContent = invalid.length
      ? `Not recognised (use C2–C7, e.g. C4, F#3, Bb2): ${invalid.join(', ')}`
      : '';
    if (!notes.length) {
      previewEl.innerHTML = '<p class="help-text">The notes will appear here as you add them.</p>';
      return;
    }
    renderSheet(previewEl, {
      notes,
      index: -1,
      results: notes.map(() => ({ done: false, mistakes: 0 })),
      wrongMidi: null,
      showNames: 'always',
      perSystem: PREVIEW_PER_SYSTEM,
    });
  }

  // Returns the saved exercise, or null if it isn't valid yet.
  function saveCurrent() {
    const { notes, invalid } = parseNoteList(notesInput.value);
    const name = nameInput.value.trim();
    if (!name) {
      errors.textContent = 'Give the exercise a name.';
      nameInput.focus();
      return null;
    }
    if (!notes.length || invalid.length) {
      errors.textContent ||= 'Add at least one note.';
      notesInput.focus();
      return null;
    }
    const ex = {
      id: editingId ?? (crypto.randomUUID?.() ?? String(Date.now())),
      name,
      notes: notes.map(noteLabel),
      updatedAt: new Date().toISOString(),
    };
    const next = editingId ? exercises.map((e) => (e.id === editingId ? ex : e)) : [ex, ...exercises];
    if (!saveExercises(next)) {
      errors.textContent = 'Couldn’t save — your browser’s storage is unavailable or full.';
      return null;
    }
    exercises = next;
    return ex;
  }

  function practise(ex) {
    const { notes } = parseNoteList(ex.notes.join(' '));
    if (!notes.length) return;
    close();
    start(notes, ex.name);
  }

  // Delete asks for a second click instead of a blocking confirm dialog.
  let pendingDelete = null;
  items.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const ex = exercises.find((x) => x.id === btn.closest('.lib-item').dataset.id);
    if (!ex) return;
    if (btn.dataset.action === 'play') practise(ex);
    if (btn.dataset.action === 'edit') showEditor(ex);
    if (btn.dataset.action === 'delete') {
      if (pendingDelete === btn) {
        exercises = exercises.filter((x) => x.id !== ex.id);
        saveExercises(exercises);
        showList();
      } else {
        pendingDelete = btn;
        btn.textContent = 'Confirm delete';
        btn.classList.add('danger');
        setTimeout(() => {
          if (pendingDelete !== btn) return;
          pendingDelete = null;
          btn.textContent = 'Delete';
          btn.classList.remove('danger');
        }, 3000);
      }
    }
  });

  $('libraryBtn').addEventListener('click', () => (panel.hidden ? open() : close()));
  $('settingsBtn').addEventListener('click', close);
  $('closeLibrary').addEventListener('click', close);
  $('newCustom').addEventListener('click', () => showEditor());
  $('cancelCustom').addEventListener('click', showList);
  $('undoCustom').addEventListener('click', () => {
    notesInput.value = notesInput.value.trimEnd().replace(/\S+$/, '').trimEnd();
    updatePreview();
  });
  $('clearCustom').addEventListener('click', () => {
    notesInput.value = '';
    updatePreview();
  });
  notesInput.addEventListener('input', updatePreview);
  $('saveCustom').addEventListener('click', () => {
    if (saveCurrent()) showList();
  });
  $('savePlayCustom').addEventListener('click', () => {
    const ex = saveCurrent();
    if (ex) practise(ex);
  });
}
