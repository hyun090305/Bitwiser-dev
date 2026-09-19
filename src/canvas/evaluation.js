import { validateConnections } from './connections.js';
import { compilePlan } from './compiledCircuit.js';

const plans = new WeakMap();
const executions = new WeakMap();
const results = new WeakMap();
const compiledPlans = new WeakMap();
const previewEvaluators = new WeakMap();

export function compileCircuit(circuit) {
  const plan = prepareCircuit(circuit);
  if (plan.diagnostics.length) return { ok: false, diagnostics: plan.diagnostics };
  if (!compiledPlans.has(plan)) compiledPlans.set(plan, compilePlan(circuit, plan));
  return { ok: true, compiled: compiledPlans.get(plan) };
}

// Detect direct edits too, without rebuilding adjacency/sorting on each input
// change or tick. Positions and display values do not affect this signature.
export function prepareCircuit(circuit) {
  const blocks = Object.values(circuit.blocks);
  const signature = JSON.stringify([
    Object.entries(circuit.blocks).map(([key, b]) => [key, b.id, b.type, b.inputMode, b.name]),
    Object.entries(circuit.wires).map(([key, w]) => [key, w.id, w.startBlockId, w.endBlockId, w.inputRole])
  ]);
  const cached = plans.get(circuit);
  if (cached?.signature === signature) return cached;
  const { diagnostics, incoming: wires } = validateConnections(circuit);
  const incoming = new Map();
  const outgoing = new Map(blocks.map(b => [b.id, []]));
  const degrees = new Map(blocks.map(b => [b.id, 0]));
  for (const block of blocks) {
    const ids = (wires.get(block.id) || []).map(w => w.startBlockId);
    incoming.set(block.id, ids);
    // Current Q and INPUT are sources. D input edges remain available to tick.
    if (block.type === 'D' || block.type === 'INPUT') continue;
    degrees.set(block.id, ids.length);
    ids.forEach(id => outgoing.get(id)?.push(block.id));
  }
  const order = blocks.filter(b => degrees.get(b.id) === 0).map(b => b.id);
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const id of outgoing.get(order[cursor]) || []) {
      degrees.set(id, degrees.get(id) - 1);
      if (degrees.get(id) === 0) order.push(id);
    }
  }
  if (order.length !== blocks.length) diagnostics.push({
    code: 'COMBINATIONAL_CYCLE', message: '조합논리 순환이 있습니다. 모든 피드백 경로가 D를 통과해야 합니다.'
  });
  const plan = { signature, incoming, wires, order, diagnostics };
  plans.set(circuit, plan);
  return plan;
}

export function computeBlock(block, values, incomingMap) {
  if (block.type === 'INPUT' || block.type === 'D') return values.get(block.id);
  const ids = incomingMap.get(block.id) || [];
  if (ids.some(id => !values.has(id))) throw new Error(`Unresolved input of ${block.id}`);
  const inputs = ids.map(id => values.get(id));
  switch (block.type) {
    case 'AND': return inputs.every(Boolean);
    case 'OR': return inputs.some(Boolean);
    // Legacy NOT: first connected input; no input = 1. Do not invent a new gate.
    case 'NOT': return !inputs[0];
    case 'OUTPUT': return inputs.some(Boolean);
    case 'JUNCTION': return Boolean(inputs[0]);
    default: throw new Error(`Unsupported block ${block.type}`);
  }
}

export function createExecutionState(circuit, { memory = new Map() } = {}) {
  const initial = memory instanceof Map ? memory : new Map(Object.entries(memory));
  return {
    memory: new Map(Object.values(circuit.blocks).filter(b => b.type === 'D').map(b => [b.id, Boolean(initial.get(b.id))])),
    tick: 0, currentInputs: new Map(), lastTick: null
  };
}

export function getExecutionState(circuit) {
  if (!executions.has(circuit)) executions.set(circuit, createExecutionState(circuit));
  return executions.get(circuit);
}

export function synchronizeExecution(circuit) {
  const state = getExecutionState(circuit);
  for (const id of state.memory.keys()) if (circuit.blocks[id]?.type !== 'D') state.memory.delete(id);
  for (const b of Object.values(circuit.blocks)) if (b.type === 'D' && !state.memory.has(b.id)) state.memory.set(b.id, false);
  return state;
}

export function inputSnapshot(circuit) {
  return new Map(Object.values(circuit.blocks).filter(b => b.type === 'INPUT').map(b => [b.id, Boolean(b.value)]));
}

// Pure logical evaluation: no Q, tick, pending input or display mutation.
export function evaluateCombinational(circuit, { inputs = new Map(), memory = new Map() } = {}) {
  const plan = prepareCircuit(circuit);
  if (plan.diagnostics.length) return { ok: false, values: new Map(), diagnostics: plan.diagnostics };
  try {
    if (!previewEvaluators.has(plan)) {
      if (!compiledPlans.has(plan)) compiledPlans.set(plan, compilePlan(circuit, plan));
      previewEvaluators.set(plan, compiledPlans.get(plan).createEvaluator());
    }
    const values = previewEvaluators.get(plan).evaluateMaps(inputs, memory);
    return { ok: true, values, diagnostics: [] };
  } catch (error) {
    return { ok: false, values: new Map(), diagnostics: [{ code: 'EVALUATION_ERROR', message: error.message }] };
  }
}

export function displayResult(circuit, result) {
  results.set(circuit, result);
  for (const b of Object.values(circuit.blocks)) {
    // INPUT values are direct editor controls, not computed outputs.
    if (b.type === 'INPUT') continue;
    b.value = result.ok ? result.values.get(b.id) : null;
  }
}

export function getEvaluationResult(circuit) { return results.get(circuit); }

export function previewCircuit(circuit) {
  const state = getExecutionState(circuit);
  displayResult(circuit, evaluateCombinational(circuit, { inputs: inputSnapshot(circuit, state), memory: state.memory }));
  return circuit.blocks;
}

export function toggleButton(circuit, blockId) {
  const b = circuit.blocks[blockId];
  if (b?.type !== 'INPUT' || b.inputMode !== 'button') return false;
  b.value = !Boolean(b.value);
  return true;
}

// Commit only after BOTH evaluations succeed. Explicit grading snapshots use
// the same function, with an independent execution state and display=false.
export function tickCircuit(circuit, state = getExecutionState(circuit), { inputs, display = state === executions.get(circuit) } = {}) {
  const usesCircuitInputs = inputs == null;
  const snapshot = new Map(inputs ?? inputSnapshot(circuit));
  const before = evaluateCombinational(circuit, { inputs: snapshot, memory: state.memory });
  if (!before.ok) { if (display) results.set(circuit, before); return before; }
  const nextMemory = new Map();
  const plan = prepareCircuit(circuit);
  for (const b of Object.values(circuit.blocks)) {
    if (b.type !== 'D') continue;
    const incoming = plan.wires.get(b.id);
    const data = incoming.find(w => w.inputRole === 'D');
    const enable = incoming.find(w => w.inputRole === 'EN');
    nextMemory.set(b.id, !enable || before.values.get(enable.startBlockId)
      ? before.values.get(data.startBlockId) : Boolean(state.memory.get(b.id)));
  }
  const after = evaluateCombinational(circuit, { inputs: snapshot, memory: nextMemory });
  if (!after.ok) { if (display) results.set(circuit, after); return after; }
  const nextTick = state.tick + 1;
  state.memory = nextMemory;
  state.currentInputs = new Map(snapshot);
  state.tick = nextTick;
  state.lastTick = { tick: nextTick, inputs: new Map(snapshot), values: new Map(after.values) };
  if (usesCircuitInputs) {
    for (const b of Object.values(circuit.blocks)) {
      if (b.type === 'INPUT' && b.inputMode === 'button') b.value = false;
    }
  }
  // lastTick retains the sampled inputs; the live view reflects automatic
  // button release immediately, just like any other input change.
  if (display) displayResult(circuit, usesCircuitInputs
    ? evaluateCombinational(circuit, { inputs: inputSnapshot(circuit), memory: nextMemory }) : after);
  return { ...after, tick: nextTick, inputs: snapshot };
}

export function resetExecution(circuit) {
  for (const b of Object.values(circuit.blocks)) {
    if (b.type === 'INPUT' && b.inputMode === 'button') b.value = false;
  }
  const state = createExecutionState(circuit);
  executions.set(circuit, state);
  previewCircuit(circuit);
  return state;
}
