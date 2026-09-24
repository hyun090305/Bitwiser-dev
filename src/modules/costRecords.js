import { COST_RULES, calculateCircuitCost, evaluateCostStars } from './circuitCost.js';
import { CIRCUIT_VERSION, getCircuitStats } from '../canvas/circuitData.js';
import { GRADING_VERSION, gradeCircuitSync } from './circuitGrading.js';
import { validateStageCircuit } from './stageCircuit.js';

// Includes puzzle rules, not localized descriptions or adjustable star targets.
// Keep the full definition in records as well as a compact leaderboard key.
export function stageRules(levels, id) {
  return JSON.stringify([GRADING_VERSION, levels.levelGridSizes[id], levels.levelBlockSets[id],
    levels.levelFixedIO?.[id] || null, levels.levelAnswers[id]]);
}
export function isCurrentCostRecord(record, levels, id) {
  return Boolean(record && record.pricingVersion === COST_RULES.version &&
    record.gradingVersion === GRADING_VERSION && record.stageId === Number(id) &&
    record.stageRules === stageRules(levels, id) && Number.isSafeInteger(record.totalCost) && record.totalCost >= 0);
}
export function makeCostRecord(circuit, id, levels) {
  const snapshot = validateStageCircuit(circuit, Number(id), levels);
  const palette = levels.levelBlockSets[id];
  const ports = { inputs: palette.filter(b => b.type === 'INPUT').map(b => b.name), outputs: palette.filter(b => b.type === 'OUTPUT').map(b => b.name) };
  if (!gradeCircuitSync(snapshot, levels.levelAnswers[id], { ports }).ok) throw new Error('Circuit does not pass this stage');
  const cost = calculateCircuitCost(snapshot);
  return { stageId: Number(id), stageRules: stageRules(levels, id), gradingVersion: GRADING_VERSION,
    circuitVersion: CIRCUIT_VERSION, circuit: snapshot, ...getCircuitStats(snapshot), ...cost,
    stars: evaluateCostStars(id, true, cost.totalCost, levels.levelStarThresholds?.[id]) };
}
export function highestStars(entry, levels, id) {
  if (Number(id) === 0) return 0;
  const stored = Math.max(entry?.bestStars?.stars || 0, entry?.best?.stars || 0, entry?.highestStars || 0);
  const awarded = isCurrentCostRecord(entry?.best, levels, id)
    ? evaluateCostStars(id, true, entry.best.totalCost, levels.levelStarThresholds?.[id]) : 0;
  return Math.min(3, Math.max(stored, awarded));
}
export function mergeCostRecord(entry, record, levels, id) {
  const earnedStars = highestStars(entry, levels, id);
  const previous = isCurrentCostRecord(entry.best, levels, id) ? entry.best : null;
  const first = !previous;
  const improved = first || record.totalCost < previous.totalCost;
  if (improved) {
    if (entry.best && !previous) (entry.previousCostRecords ||= []).push(entry.best);
    entry.best = record;
  }
  entry.highestStars = Math.max(earnedStars, highestStars(entry, levels, id), record.stars);
  if (!entry.bestStars || record.stars > entry.bestStars.stars) entry.bestStars = record;
  return { record, first, improved, previousCost: previous?.totalCost ?? null, best: entry.best, highestStars: entry.highestStars };
}

// Legacy progress lives in its original keys. This namespace adds only verified
// placements, scoped to the existing nickname identity used by the web service.
export function createCostStore({ storage, owner = 'local', levels, onFailure = () => {} }) {
  const key = `bitwiser:cost-progress:v1:${owner}`;
  let state = { stages: {} }, damaged = false;
  try {
    const raw = storage?.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed?.stages || typeof parsed.stages !== 'object') throw new Error('Invalid cost progress');
      state = parsed;
      for (const [id, entry] of Object.entries(state.stages)) {
        if (!isCurrentCostRecord(entry.best, levels, id)) continue;
        const earnedStars = Math.max(entry.best.stars || 0, entry.bestStars?.stars || 0, entry.highestStars || 0);
        try {
          // Recalculate claimed totals/counts from the associated verified snapshot.
          entry.best = makeCostRecord(entry.best.circuit, Number(id), levels);
        } catch (error) {
          // One unverifiable score must not discard this player's other stages
          // or erase the historical clear and associated design.
          (entry.previousCostRecords ||= []).push(entry.best);
          entry.historicalClear = true;
          delete entry.best;
          onFailure(error);
        }
        entry.highestStars = Math.min(3, Math.max(earnedStars, highestStars(entry, levels, id)));
      }
    }
  } catch (error) { state = { stages: {} }; damaged = true; onFailure(error); }
  const persist = () => {
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (damaged) { const raw = storage.getItem(key); if (raw) storage.setItem(`${key}:recovery`, raw); damaged = false; }
      storage.setItem(key, JSON.stringify(state)); return true;
    } catch (error) { onFailure(error); return false; }
  };
  return {
    get state() { return state; },
    cleared: () => Object.keys(state.stages).filter(id => state.stages[id].best || state.stages[id].historicalClear).map(Number),
    best: id => isCurrentCostRecord(state.stages[id]?.best, levels, id) ? state.stages[id].best : null,
    stars: id => {
      const entry = state.stages[id], stars = highestStars(entry, levels, id);
      if (entry && stars > (entry.highestStars || 0)) { entry.highestStars = stars; persist(); }
      return stars;
    },
    recordClear(id, circuit) {
      const record = makeCostRecord(circuit, id, levels);
      const result = mergeCostRecord(state.stages[id] ||= {}, record, levels, id);
      result.saved = persist(); return result;
    },
    persist
  };
}
