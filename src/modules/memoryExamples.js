import { makeCircuit, newBlock, newWire } from '../canvas/model.js';

// Explicit Lab-only allowlist. Existing stage budgets and demo content stay in
// their original catalogs. Both examples use the same exhaustive FSM verifier.
export const MEMORY_LAB_BLOCKS = [{ type: 'D' }];
export const MEMORY_EXAMPLES = [
  { id: 'single-d', title: 'D 저장 예제', enabled: false },
  { id: 'enabled-d', title: 'D + EN 예제', enabled: true }
].map(example => ({
  ...example,
  answers: {
    mode: 'sequential',
    referenceId: example.enabled ? 'lab-enabled-register' : 'lab-register'
  }
}));

export function makeMemoryExample(example) {
  const circuit = makeCircuit(24, 24);
  for (const [id, type, r, c, name] of [
    ['input', 'INPUT', 2, 0, 'IN1'], ['memory', 'D', 2, 4, 'D'], ['output', 'OUTPUT', 2, 8, 'OUT1'],
    ...(example.enabled ? [['enable', 'INPUT', 0, 4, 'IN2']] : [])
  ]) circuit.blocks[id] = newBlock({ id, type, pos: { r, c }, name });
  circuit.wires.data = newWire({ id: 'data', startBlockId: 'input', endBlockId: 'memory', inputRole: 'D',
    path: [0, 1, 2, 3, 4].map(c => ({ r: 2, c })) });
  circuit.wires.output = newWire({ id: 'output', startBlockId: 'memory', endBlockId: 'output',
    path: [4, 5, 6, 7, 8].map(c => ({ r: 2, c })) });
  if (example.enabled) circuit.wires.enable = newWire({ id: 'enable', startBlockId: 'enable', endBlockId: 'memory', inputRole: 'EN',
    path: [0, 1, 2].map(r => ({ r, c: 4 })) });
  return circuit;
}
