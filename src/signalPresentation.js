import { formatBlockLabels } from './blockLabel.js';

// Official-stage presentation only. Never write these aliases into circuit,
// palette, grading, or saved-record data; custom/Lab callers omit stageId.
const ALIASES = {
  9: { IN1: 'A', IN2: 'B', OUT1: 'SUM', OUT2: 'COUT' },
  10: { IN1: 'A', IN2: 'B', IN3: 'CIN', OUT1: 'SUM', OUT2: 'COUT' },
  21: { IN4: 'SEL' },
  29: { GO: 'DONE' },
  30: { OPEN: 'IN', DOOR: 'OUT' },
  31: { SIGNAL: 'SIG' },
  33: { LEVEL0: 'L0', LEVEL1: 'L1' },
  37: { SIGNAL: 'BIT', SUBMIT: 'READ', UNLOCKED: 'FOUND' },
  39: { UNDO_AVAILABLE: 'READY' },
  40: { DATA_OUT: 'OUT', ACCEPTED: 'ACK' },
  41: { DATA_OUT: 'OUT' },
  42: { DATA_OUT: 'OUT' },
  43: { RECEIVE: 'READ' },
  44: { SERIAL: 'OUT' },
  46: { COMPLETE: 'DONE' }
};

export function signalDisplayName(name, stageId = null) {
  return ALIASES[stageId]?.[name] || name;
}

export function blockDisplayLabel(type, name, stageId = null) {
  return formatBlockLabels(type === 'INPUT' || type === 'OUTPUT' ? signalDisplayName(name, stageId) : name);
}

export function diagnosticDisplayText(text, block, stageId = null) {
  return block?.type === 'INPUT' || block?.type === 'OUTPUT' ? signalDisplayText(text, stageId) : text;
}

// Korean particles follow the spoken alias (A/에이, CIN/캐리 인, etc.).
const finalConsonant = new Set(['CIN', 'SUM', 'COUT', 'SEL', 'DONE', 'IN', 'OUT', 'L0', 'L1', 'BIT', 'ACK']);
const rieul = new Set(['SEL', 'L', 'L1']);
const particles = [['으로', '로'], ['을', '를'], ['이', '가'], ['은', '는'], ['과', '와']];

export function signalDisplayText(text, stageId = null) {
  const aliases = ALIASES[stageId];
  if (!aliases) return String(text || '');
  // Expand shortened numbered lists before replacing complete identifiers.
  // This avoids turning an input list such as IN1·2·3 into A·2·3.
  const expanded = String(text || '').replace(/\b([A-Z]+)(\d+(?:[·/]\d+)+)\b/g, (all, prefix, suffix) => {
    const numbers = suffix.split(/[·/]/);
    return numbers.every(n => aliases[prefix + n]) ? suffix.replace(/\d+/g, n => prefix + n) : all;
  });
  return expanded.replace(/\b[A-Za-z_][A-Za-z_0-9]*\b(으로|로|을|를|이|가|은|는|과|와)?/g, (all, particle = '') => {
    const name = particle ? all.slice(0, -particle.length) : all;
    const alias = aliases[name] || (Number(stageId) === 33 && name === 'LEVEL' ? 'L' : null);
    if (!alias) return all;
    const pair = particles.find(p => p.includes(particle));
    const hasFinal = finalConsonant.has(alias) || rieul.has(alias);
    const suffix = pair ? pair[hasFinal && !(pair[0] === '으로' && rieul.has(alias)) ? 0 : 1] : particle;
    return alias + suffix;
  });
}

// Correct legacy hint copy at the presentation boundary too: the full-adder
// formula reversed the output roles, and two hints retain old door/lock themes.
// Keep the authored records (including their compatibility hashes) intact.
const HINT_COPY = {
  10: {
    'OUT1 = (A∧B)∨(B∧C)∨(C∧A), OUT2 = (A XOR B) XOR C': 'OUT2 = (A∧B)∨(B∧C)∨(C∧A), OUT1 = (A XOR B) XOR C'
  },
  30: {
    '최근 세 번의 OPEN을 기억하고, 하나라도 1이면 문을 열어 두세요.': '최근 세 번의 OPEN을 기억하고, 하나라도 1이면 DOOR=1을 유지하세요.'
  },
  37: {
    'Shift submitted letters using SUBMIT as EN. Detect the previous A,B,B and the new A; retain the unlocked state.': 'Shift received letters using SUBMIT as EN. Detect the previous A,B,B and the new A; keep UNLOCKED=1 after finding the pattern.'
  }
};

export function hintDisplayText(text, stageId = null) {
  let copy = HINT_COPY[stageId]?.[text] || text;
  if (Number(stageId) === 10) copy = copy.replace(/\bC\b/g, 'IN3');
  return signalDisplayText(copy, stageId);
}
