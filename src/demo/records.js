import { validateStageCircuit } from '../modules/stageCircuit.js';
import { makeCostRecord, isCurrentCostRecord, highestStars } from '../modules/costRecords.js';
import { evaluateCostStars } from '../modules/circuitCost.js';
import { CIRCUIT_VERSION, SUPPORTED_CIRCUIT_VERSIONS, getCircuitStats } from '../canvas/circuitData.js';
import { gradeCircuitSync, GRADING_VERSION } from '../modules/circuitGrading.js';
import { DEMO_IDS, isDemoStage, isUnlocked } from './catalog.js';
import { CATALOG_VERSION, CHAPTERS, preserveStageAccess } from '../modules/stageCatalog.js';

const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const check = (condition, message) => { if (!condition) throw new Error(message); };
export function validateCircuit(raw, id, levels) {
  check(isDemoStage(id), 'Invalid demo stage');
  return validateStageCircuit(raw, id, levels);
}

export function passesStage(circuit, id, levels) {
  const blocks = Object.values(circuit.blocks);
  const outputs = blocks.filter(b => b.type === 'OUTPUT');
  if (!levels.levelBlockSets[id].filter(b => b.type === 'OUTPUT').every(b => outputs.some(o => o.name === b.name))) return false;
  return gradeCircuitSync(circuit, levels.levelAnswers[id]).ok;
}

export function awardStars(id, stats, thresholds) {
  return evaluateCostStars(id, true, stats.totalCost, thresholds[id]);
}
export function compareRecords(a, b) { return a.totalCost - b.totalCost; }
export function makeRecord(circuit, id, levels) {
  check(isDemoStage(id), 'Invalid demo stage');
  return makeCostRecord(circuit, id, levels);
}
export function emptyProgress() {
  return { format: 'bitwiser-web-demo', version: 1, gradingVersion: GRADING_VERSION, catalogVersion: CATALOG_VERSION, unlockedStages: [], unlockedChapters: [], stages: {}, archivedStages: {}, archivedHints: {}, lastStageId: null, hints: {}, settings: {} };
}
export const SETTING_KEYS = ['lang', 'bitwiserTheme', 'bgmEnabled', 'sfxEnabled', 'backgroundAnimationEnabled'];
export function validateProgress(raw, levels, budgets, themeIds) {
  check(plain(raw) && raw.format === 'bitwiser-web-demo' && raw.version === 1, 'Unsupported backup format/version');
  check(plain(raw.stages) && plain(raw.hints) && plain(raw.settings), 'Invalid progress');
  check(raw.gradingVersion == null || (Number.isInteger(raw.gradingVersion) && raw.gradingVersion >= 1 && raw.gradingVersion <= GRADING_VERSION), 'Unsupported grading version');
  const migrating = (raw.gradingVersion || 1) < GRADING_VERSION;
  check((raw.archivedStages == null || plain(raw.archivedStages)) && (raw.archivedHints == null || plain(raw.archivedHints)), 'Invalid archived progress');
  if (raw.archivedLastStageId != null) check(Number.isInteger(raw.archivedLastStageId) && raw.archivedLastStageId >= 0 && raw.archivedLastStageId <= 46 && !isDemoStage(raw.archivedLastStageId), 'Invalid archived recent stage');
  const result = emptyProgress();
  for (const [key, entry] of Object.entries({...raw.archivedStages, ...raw.stages})) {
    const id = Number(key);
    check(String(id) === key && Number.isInteger(id) && id >= 0 && id <= 46 && plain(entry), 'Backup contains an unsupported stage');
    if (!isDemoStage(id)) { result.archivedStages[id] = structuredClone(entry); continue; }
    const next = {};
    const previousDefinitions = [levels.levelLegacyDefinitions?.[id],...(levels.levelPreviousLayouts?.[id]||[])].filter(Boolean);
    const validateOldCircuit = circuit => {
      for(const definition of previousDefinitions) {
        const oldLevels=Object.fromEntries(Object.entries(definition).map(([key,value])=>[key,{[id]:value}]));
        try {return validateStageCircuit(circuit,id,oldLevels);} catch { /* Try the next known board revision. */ }
      }
      throw new Error('Invalid previous stage circuit');
    };
    const validateOldEntry = archived => {
      check(previousDefinitions.length && plain(archived), 'Unsupported previous stage revision');
      const copy = structuredClone(archived);
      for (const field of ['draft','best','bestStars']) if (copy[field]) {
        check(SUPPORTED_CIRCUIT_VERSIONS.includes(copy[field].circuitVersion), 'Unsupported previous circuit version');
        copy[field].circuit = validateOldCircuit(copy[field].circuit);
      }
      if(copy.legacyResults != null) {
        check(Array.isArray(copy.legacyResults)&&copy.legacyResults.length<=2,'Invalid previous legacy results');
        for (const record of copy.legacyResults) {
          check(plain(record)&&SUPPORTED_CIRCUIT_VERSIONS.includes(record.circuitVersion),'Unsupported previous circuit version');
          record.circuit = validateOldCircuit(record.circuit);
        }
      }
      delete copy.legacyStageRecords;
      return copy;
    };
    if(entry.legacyStageRecords != null) {
      check(Array.isArray(entry.legacyStageRecords)&&entry.legacyStageRecords.length<=4,'Invalid previous stage revisions');
      next.legacyStageRecords=entry.legacyStageRecords.map(validateOldEntry);
    }
    if(previousDefinitions.length) {
      const obsolete=['draft','best','bestStars'].some(field=>{
        if(!entry[field])return false;
        try {const c=validateCircuit(entry[field].circuit,id,levels);return migrating&&field!=='draft'&&!passesStage(c,id,levels);} catch{return true;}
      }) || (Array.isArray(entry.legacyResults)&&entry.legacyResults.some(record=>{
        try {validateCircuit(record.circuit,id,levels);return false;} catch{return true;}
      }));
      if(obsolete) {
        (next.legacyStageRecords ||= []).push(validateOldEntry(entry));
        next.legacyStageRecords=next.legacyStageRecords.slice(-4);
        next.highestStars=Math.min(3,Math.max(0,Number(entry.highestStars)||0,Number(entry.bestStars?.stars)||0));
        result.stages[id]=next;
        continue;
      }
    }
    check(Boolean(entry.best) === Boolean(entry.bestStars), 'Missing result circuit');
    // Old clears that no longer satisfy exhaustive verification remain
    // recoverable as circuits, but cannot grant a new clear or ranking.
    const preserveLegacy = record => {
      check(plain(record) && SUPPORTED_CIRCUIT_VERSIONS.includes(record.circuitVersion), 'Unsupported legacy circuit');
      return { circuitVersion: CIRCUIT_VERSION, circuit: validateCircuit(record.circuit, id, levels) };
    };
    if (entry.legacyResults != null) {
      check(Array.isArray(entry.legacyResults) && entry.legacyResults.length <= 2, 'Invalid legacy results');
      next.legacyResults = entry.legacyResults.map(preserveLegacy);
    }
    if (entry.draft) {
      check(SUPPORTED_CIRCUIT_VERSIONS.includes(entry.draft.circuitVersion), 'Unsupported circuit version');
      next.draft = { circuitVersion: CIRCUIT_VERSION, circuit: validateCircuit(entry.draft.circuit, id, levels) };
    }
    for (const field of ['best', 'bestStars']) {
      if (entry[field]) {
        check(SUPPORTED_CIRCUIT_VERSIONS.includes(entry[field].circuitVersion), 'Unsupported circuit version');
        const circuit = validateCircuit(entry[field].circuit, id, levels);
        if (migrating && !passesStage(circuit, id, levels)) {
          (next.legacyResults ||= []).push({ circuitVersion: CIRCUIT_VERSION, circuit });
          if (!next.draft) next.draft = { circuitVersion: CIRCUIT_VERSION, circuit };
        } else {
          check(passesStage(circuit, id, levels), 'Circuit does not pass this stage');
          // No retrospective pricing of legacy/other-version results.
          next[field] = isCurrentCostRecord(entry[field], levels, id)
            ? makeRecord(circuit, id, levels) : { ...entry[field], circuit, ...getCircuitStats(circuit) };
          next[field].stars = id === 0 ? 0 : Math.min(3, Math.max(next[field].stars || 1, Number(entry[field].stars) || 1));
        }
      }
    }
    if (migrating) {
      if (next.legacyResults) next.legacyResults = next.legacyResults.slice(-2);
      if (next.best && !next.bestStars) next.bestStars = next.best;
      if (next.bestStars && !next.best) next.best = next.bestStars;
    }
    check(Boolean(next.best) === Boolean(next.bestStars), 'Missing result circuit');
    if (entry.previousCostRecords) {
      check(Array.isArray(entry.previousCostRecords), 'Invalid previous cost records');
      next.previousCostRecords = structuredClone(entry.previousCostRecords);
    }
    if (entry.highestStars != null) next.highestStars = Math.max(highestStars(next, levels, id), id === 0 ? 0 : Math.min(3, Number(entry.highestStars) || 0));
    result.stages[id] = next;
  }
  const cleared = DEMO_IDS.filter(id => result.stages[id]?.best);
  check(raw.unlockedStages == null || (Array.isArray(raw.unlockedStages) && raw.unlockedStages.every(isDemoStage)), 'Invalid unlocked stages');
  check(raw.unlockedChapters == null || (Array.isArray(raw.unlockedChapters) && raw.unlockedChapters.every(id => CHAPTERS.slice(0,2).some(ch => ch.id === id))), 'Invalid unlocked chapters');
  const legacyReplay = DEMO_IDS.filter(id => result.stages[id]?.legacyResults?.length || result.stages[id]?.legacyStageRecords?.some(entry=>entry.best||entry.legacyResults?.length));
  Object.assign(result, preserveStageAccess(cleared, { ...raw, unlockedStages: [...(raw.unlockedStages || []), ...legacyReplay] }, { legacy: (raw.catalogVersion || 1) < 3, allowedIds: DEMO_IDS }));
  // Solved legacy stages remain replayable even after their prerequisites move.
  const recent = raw.lastStageId;
  if (recent !== null && !isDemoStage(recent) && Number.isInteger(recent) && recent >= 0 && recent <= 46) result.archivedLastStageId = recent;
  else {
    if (recent !== null) check(isUnlocked(recent, cleared, result), 'Invalid recent stage');
    result.lastStageId = recent;
  }
  if (raw.archivedLastStageId != null && result.archivedLastStageId == null) result.archivedLastStageId = raw.archivedLastStageId;
  for (const [key, count] of Object.entries({...raw.archivedHints, ...raw.hints})) {
    const id = Number(key), max = levels.levelHints?.[`stage${id}`]?.hints?.length || 0;
    if (!isDemoStage(id) && Number.isInteger(id) && id >= 0 && id <= 46 && String(id) === key && Number.isInteger(count) && count >= 0) { result.archivedHints[id] = count; continue; }
    check(isDemoStage(id) && String(id) === key && Number.isInteger(count) && count >= 0 && count <= max, 'Invalid hint progress');
    result.hints[id] = count;
  }
  for (const [key, value] of Object.entries(raw.settings)) {
    check(SETTING_KEYS.includes(key), 'Unsupported setting');
    check(key === 'lang' ? ['ko', 'en'].includes(value) : key === 'bitwiserTheme' ? themeIds.includes(value) : typeof value === 'boolean', 'Invalid setting');
    result.settings[key] = value;
  }
  return result;
}
