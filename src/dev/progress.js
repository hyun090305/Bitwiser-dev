import { CHAPTERS, playableStages, stageById, preserveStageAccess } from '../modules/stageCatalog.js';
import { makeCostRecord, mergeCostRecord, isCurrentCostRecord } from '../modules/costRecords.js';

export const DEV_PROGRESS_KEY = 'bitwiser:dev-progress:v1';
const empty = () => ({ version: 1, stages: {}, access: preserveStageAccess([]), chapterOverrides: {} });
const clone = value => JSON.parse(JSON.stringify(value));
const cleared = state => Object.keys(state.stages).filter(id => state.stages[id].cleared).map(Number);

export function presetProgress(preset) {
  const state = empty();
  const stages = playableStages();
  const ids = preset === 'fresh' ? []
    : preset === 'before-ch2' ? stages.filter(s => s.chapterId === 'chapter_1' && s.id !== 6)
    : preset === 'before-ch34' ? stages.filter(s => ['chapter_1', 'chapter_2'].includes(s.chapterId) && s.id !== 30)
    : preset === 'complete' ? stages : null;
  if (!ids) throw new Error('Unknown preset');
  for (const { id } of ids) state.stages[id] = { cleared: true, stars: id === 0 ? 0 : 3 };
  state.access = preserveStageAccess(cleared(state));
  return state;
}

function readState(raw) {
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !data.stages || typeof data.stages !== 'object') throw new Error('Invalid developer progress');
  const state = empty();
  for (const { id } of playableStages()) {
    const entry = data.stages[id];
    if (entry?.cleared !== true) continue;
    state.stages[id] = { ...entry, cleared: true, stars: id === 0 ? 0 : Math.min(3, Math.max(1, Number(entry.stars) || 1)) };
  }
  for (const ch of CHAPTERS) {
    const mode = data.chapterOverrides?.[ch.id];
    if (mode === 'locked' || mode === 'unlocked') state.chapterOverrides[ch.id] = mode;
  }
  state.access = preserveStageAccess(cleared(state), data.access || {}, { legacy: false });
  return state;
}

// Synthetic clears affect display/access only. A real pass still creates a
// verified cost record with the normal grader and version checks.
export function createDevProgress({ storage, getLevels, onFailure = () => {} }) {
  let state = empty(), damaged = null, saved = true;
  const listeners = new Set();
  try {
    const raw = storage?.getItem(DEV_PROGRESS_KEY);
    if (raw) {
      damaged = raw;
      state = readState(raw);
      damaged = null;
    }
  } catch (error) { saved = false; onFailure(error); }
  const initial = clone(state);
  const persist = () => {
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (damaged !== null) storage.setItem(`${DEV_PROGRESS_KEY}:recovery`, damaged);
      storage.setItem(DEV_PROGRESS_KEY, JSON.stringify(state));
      damaged = null;
      saved = true;
    } catch (error) { saved = false; onFailure(error); }
    listeners.forEach(listener => listener());
    return saved;
  };
  const update = next => { state = next; return persist(); };
  const requireStage = id => {
    if (stageById(id)?.status !== 'playable') throw new Error('Stage unavailable');
  };
  return {
    snapshot: () => clone(state),
    get saved() { return saved; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    cleared: () => cleared(state),
    stars: id => state.stages[id]?.stars || 0,
    access: () => ({ ...clone(state.access), chapterOverrides: { ...state.chapterOverrides } }),
    best: id => {
      const data = getLevels();
      return data && isCurrentCostRecord(state.stages[id]?.best, data, id) ? state.stages[id].best : null;
    },
    setChapter(id, mode) {
      if (!CHAPTERS.some(ch => ch.id === id) || !['default', 'locked', 'unlocked'].includes(mode)) throw new Error('Invalid chapter policy');
      if (mode === 'default') delete state.chapterOverrides[id];
      else state.chapterOverrides[id] = mode;
      return persist();
    },
    unlockAll() {
      state.chapterOverrides = Object.fromEntries(CHAPTERS.map(ch => [ch.id, 'unlocked']));
      return persist();
    },
    defaultAccess() { state.chapterOverrides = {}; return persist(); },
    setStage(id, stars) {
      requireStage(id);
      if (stars !== null && (!Number.isInteger(stars) || stars < 1 || stars > 3)) throw new Error('Invalid stars');
      if (stars === null) delete state.stages[id];
      else state.stages[id] = { cleared: true, stars: id === 0 ? 0 : stars };
      state.access = preserveStageAccess(cleared(state), state.access);
      return persist();
    },
    applyPreset(preset) { return update(presetProgress(preset)); },
    reset() { return update(clone(initial)); },
    recordClear(id, circuit) {
      requireStage(id);
      const data = getLevels();
      const record = makeCostRecord(circuit, id, data);
      const entry = state.stages[id] ||= {};
      const result = mergeCostRecord(entry, record, data, id);
      entry.cleared = true;
      entry.stars = id === 0 ? 0 : Math.max(entry.stars || 0, result.highestStars);
      state.access = preserveStageAccess(cleared(state), state.access);
      result.saved = persist();
      return result;
    }
  };
}
