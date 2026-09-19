import { getExecutionState, getEvaluationResult, inputSnapshot, previewCircuit, resetExecution, tickCircuit } from './evaluation.js';
import { pauseCircuit } from './tickRunner.js';

const highlights = new WeakMap();
export const getTraceHighlight = circuit => highlights.get(circuit);

// Accept both an atomic input/output vector and a single-signal event. A vector
// is one event: settling intermediate partial input assignments would invent time.
export const eventSignals = event => event.inputs || event.outputs || (event.signal != null ? [event] : []);

function blockFor(circuit, signal, type) {
  const block = signal.blockId ? circuit.blocks[signal.blockId]
    : Object.values(circuit.blocks).find(b => b.type === type && b.name === signal.signal);
  if (!block || block.type !== type) throw new Error(`Trace port unavailable: ${signal.signal}`);
  return block;
}

export function applyTraceEvent(circuit, event) {
  let blocks = [];
  if (event.type === 'init') {
    const state = resetExecution(circuit);
    for (const entry of event.memory || []) {
      const block = blockFor(circuit, entry, 'D');
      state.memory.set(block.id, Boolean(entry.value)); blocks.push({ blockId: block.id });
    }
    previewCircuit(circuit);
  } else if (event.type === 'set') {
    blocks = eventSignals(event).map(signal => {
      const block = blockFor(circuit, signal, 'INPUT');
      block.value = Boolean(signal.value);
      return { blockId: block.id };
    });
    previewCircuit(circuit);
  } else if (event.type === 'tick') {
    // Explicit sampled inputs retain button values until a SET says otherwise.
    // FSM verification has no implicit button-release event. Snapshot/commit/
    // settle are all performed by the existing engine, never by the UI.
    const result = tickCircuit(circuit, getExecutionState(circuit), { inputs: inputSnapshot(circuit), display: true });
    if (!result.ok) throw new Error(result.diagnostics[0].message);
    blocks = Object.values(circuit.blocks).filter(b => b.type === 'D').map(b => ({ blockId: b.id }));
  } else if (event.type === 'expect' || event.type === 'observe') {
    previewCircuit(circuit);
    blocks = eventSignals(event).map(signal => {
      const block = blockFor(circuit, signal, 'OUTPUT');
      const actual = Number(block.value);
      return { blockId: block.id, signal: signal.signal, actual, expected: signal.expected,
        passed: actual === signal.expected };
    });
  } else throw new Error(`Unsupported trace event: ${event.type}`);
  const evaluation = getEvaluationResult(circuit);
  if (evaluation?.ok === false) throw new Error(evaluation.diagnostics[0].message);
  const highlight = { type: event.type, blocks };
  highlights.set(circuit, highlight);
  return highlight;
}

// Owns only temporary runtime state. Closing, leaving a stage, or retrying
// restores inputs, Q, tick count and lastTick without touching the design/history.
export function createTracePlayback(circuit, trace) {
  pauseCircuit(circuit);
  const savedValues = Object.fromEntries(Object.values(circuit.blocks).map(b => [b.id, b.value]));
  const savedState = structuredClone(getExecutionState(circuit));
  let index = 0;
  let restored = false;
  return {
    start() {
      restored = false; index = 0;
      resetExecution(circuit);
      Object.values(circuit.blocks).filter(b => b.type === 'INPUT').forEach(b => { b.value = false; });
      previewCircuit(circuit); highlights.delete(circuit);
    },
    step() {
      if (restored || index >= trace.length) return null;
      const event = trace[index];
      const highlight = applyTraceEvent(circuit, event);
      return { index: index++, event, highlight };
    },
    restore() {
      if (restored) return;
      restored = true;
      Object.assign(getExecutionState(circuit), structuredClone(savedState));
      for (const [id, value] of Object.entries(savedValues)) if (circuit.blocks[id]) circuit.blocks[id].value = value;
      previewCircuit(circuit); highlights.delete(circuit);
    }
  };
}
