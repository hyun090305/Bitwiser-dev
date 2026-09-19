import { getMemory20Reference, MEMORY20_IDS } from './memory20References.js';
// Legacy/lab FSMs observe before a tick; memory20 references opt into after_tick.
const fsm = (inputs, outputs, stateCount, evaluate) => Object.freeze({
  inputs: Object.freeze(inputs), outputs: Object.freeze(outputs), stateCount, initialState: 0, evaluate
});
const references = Object.freeze({
  'enabled-register': fsm(['DATA', 'LOAD'], ['Q'], 2, (q, x) => ({ outputs: q, nextState: x & 2 ? x & 1 : q })),
  'toggle-light': fsm(['PRESS'], ['LIGHT'], 2, (q, x) => ({ outputs: q, nextState: q ^ x })),
  'sticky-fault': fsm(['FAULT', 'ACK'], ['ALARM'], 2, (q, x) => ({ outputs: q, nextState: x & 1 ? 1 : x & 2 ? 0 : q })),
  'staging-register': fsm(['DATA', 'WRITE', 'APPLY'], ['Q'], 4, (s, x) => ({
    outputs: s >>> 1, nextState: (x & 2 ? x & 1 : s & 1) | (x & 4 ? (s & 1) << 1 : s & 2)
  })),
  'automatic-door': fsm(['OPEN'], ['DOOR'], 8, (s, x) => ({ outputs: Number(s !== 0), nextState: ((s << 1) | x) & 7 })),
  'rising-edge': fsm(['SIGNAL'], ['RISE'], 2, (previous, x) => ({ outputs: x & (1 - previous), nextState: x })),
  watchdog: fsm(['KICK'], ['TIMEOUT'], 4, (s, x) => ({ outputs: Number(s === 3), nextState: x ? 0 : Math.min(3, s + 1) })),
  debouncer: fsm(['RAW'], ['CLEAN'], 8, (s, x) => ({
    outputs: s >>> 2,
    nextState: x | ((s & 1) << 1) | ((x === (s & 1) && x === ((s >>> 1) & 1)) ? x << 2 : s & 4)
  })),
  'lab-register': fsm(['IN1'], ['OUT1'], 2, (q, x) => ({ outputs: q, nextState: x })),
  'lab-enabled-register': fsm(['IN1', 'IN2'], ['OUT1'], 2, (q, x) => ({ outputs: q, nextState: x & 2 ? x & 1 : q }))
});

export const STAGE_REFERENCE_IDS = Object.freeze({
  26: 'toggle-light',
  ...Object.fromEntries(Object.entries(MEMORY20_IDS).filter(([slot])=>slot!=='C5-10').map(([slot,id])=>[id,`memory20:${slot}`]))
});
export function getReferenceFSM(id) { return id?.startsWith('memory20:') ? getMemory20Reference(id.slice(9)) : references[id]; }
