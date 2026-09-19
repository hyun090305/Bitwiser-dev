import { mergeCostRecord } from '../modules/costRecords.js';
import { CIRCUIT_VERSION, snapshotCircuit } from '../canvas/circuitData.js';
import { DEMO_IDS, isUnlocked } from './catalog.js';
import { emptyProgress, validateProgress, makeRecord } from './records.js';
import { preserveStageAccess } from '../modules/stageCatalog.js';

export const SAVE_KEY = 'bitwiser:web-demo:v1';
export function createDemoStore({ storage, levels, budgets, themeIds, onFailure = () => {} }) {
  let state = emptyProgress();
  let damaged = false;
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw) state = validateProgress(JSON.parse(raw), levels, budgets, themeIds);
  } catch (error) { damaged = true; onFailure(error); }
  function persist(next = state) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      // Preserve damaged data for recovery before the first replacement.
      if (damaged) {
        const raw = storage.getItem(SAVE_KEY);
        if (raw) storage.setItem(`${SAVE_KEY}:recovery`, raw);
        damaged = false;
      }
      storage.setItem(SAVE_KEY, JSON.stringify(next));
      return true;
    } catch (error) { onFailure(error); return false; }
  }
  const cleared = () => DEMO_IDS.filter(id => state.stages[id]?.best);
  const unlocked = id => isUnlocked(id, cleared(), state);
  return {
    get state() { return state; }, cleared,
    isUnlocked: unlocked, persist,
    setDraft(id, circuit) {
      if (!unlocked(id)) return false;
      const entry = state.stages[id] ||= {};
      entry.draft = { circuitVersion: CIRCUIT_VERSION, circuit: snapshotCircuit(circuit) };
      state.lastStageId = id;
      return persist();
    },
    recordClear(id, circuit) {
      if (!unlocked(id)) throw new Error('Locked stage');
      const record = makeRecord(circuit, id, levels, budgets);
      const entry = state.stages[id] ||= {};
      const result = mergeCostRecord(entry, record, levels, id);
      Object.assign(state, preserveStageAccess(cleared(), state, { allowedIds: DEMO_IDS }));
      entry.draft = { circuitVersion: CIRCUIT_VERSION, circuit: record.circuit };
      state.lastStageId = id;
      const saved = persist();
      return { ...result, saved };
    },
    parseBackup(text) {
      if (text.length > 1024 * 1024) throw new Error('Backup exceeds 1 MiB');
      return validateProgress(JSON.parse(text), levels, budgets, themeIds);
    },
    replace(next) {
      const validated = validateProgress(next, levels, budgets, themeIds);
      if (!persist(validated)) return false;
      state = validated;
      return true;
    },
    exportBackup: () => JSON.stringify(state, null, 2)
  };
}
