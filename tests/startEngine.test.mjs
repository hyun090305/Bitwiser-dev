import assert from 'node:assert/strict';
import { evaluateCircuit, startEngine } from '../src/canvas/engine.js';

function cloneCircuit(circuit) {
  return {
    blocks: Object.fromEntries(
      Object.entries(circuit.blocks).map(([id, block]) => [id, { ...block }]),
    ),
    wires: Object.fromEntries(
      Object.entries(circuit.wires).map(([id, wire]) => [
        id,
        {
          ...wire,
          path: Array.isArray(wire.path)
            ? wire.path.map(point => ({ ...point }))
            : [],
        },
      ]),
    ),
  };
}

function installMockRaf() {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let callback = null;
  let rafId = 0;

  globalThis.requestAnimationFrame = cb => {
    callback = cb;
    rafId += 1;
    return rafId;
  };

  globalThis.cancelAnimationFrame = () => {
    callback = null;
  };

  return {
    step(time) {
      if (!callback) return;
      const cb = callback;
      callback = null;
      cb(time);
    },
    restore() {
      if (originalRaf) {
        globalThis.requestAnimationFrame = originalRaf;
      } else {
        delete globalThis.requestAnimationFrame;
      }

      if (originalCancel) {
        globalThis.cancelAnimationFrame = originalCancel;
      } else {
        delete globalThis.cancelAnimationFrame;
      }
    },
  };
}

function assertStartEngineMatchesEvaluate({ name, circuit, outputs }) {
  const expectedCircuit = cloneCircuit(circuit);
  evaluateCircuit(expectedCircuit);
  const expected = Object.fromEntries(
    outputs.map(id => [id, expectedCircuit.blocks[id]?.value ?? false]),
  );

  const raf = installMockRaf();
  const testCircuit = cloneCircuit(circuit);
  const frameSnapshots = [];

  let engine;
  const renderer = (ctx, updatedCircuit) => {
    const snapshot = Object.fromEntries(
      outputs.map(id => [id, updatedCircuit.blocks[id]?.value ?? false]),
    );
    frameSnapshots.push(snapshot);
    if (engine) {
      engine.stop();
    }
  };

  engine = startEngine({}, testCircuit, renderer);
  raf.step(0);
  raf.restore();

  assert.ok(
    frameSnapshots.length > 0,
    `No frames rendered for scenario: ${name}`,
  );

  assert.deepStrictEqual(
    frameSnapshots[0],
    expected,
    `startEngine first frame mismatch for scenario: ${name}`,
  );
}

const testCases = [
  {
    name: 'multi-input AND driving an output',
    outputs: ['out'],
    circuit: {
      blocks: {
        inA: { id: 'inA', type: 'INPUT', value: true },
        inB: { id: 'inB', type: 'INPUT', value: true },
        gate: { id: 'gate', type: 'AND', value: false },
        out: { id: 'out', type: 'OUTPUT', value: false },
      },
      wires: {
        w1: { id: 'w1', startBlockId: 'inA', endBlockId: 'gate', path: [] },
        w2: { id: 'w2', startBlockId: 'inB', endBlockId: 'gate', path: [] },
        w3: { id: 'w3', startBlockId: 'gate', endBlockId: 'out', path: [] },
      },
    },
  },
  {
    name: 'single input fan-out to two outputs',
    outputs: ['out1', 'out2'],
    circuit: {
      blocks: {
        source: { id: 'source', type: 'INPUT', value: true },
        out1: { id: 'out1', type: 'OUTPUT', value: false },
        out2: { id: 'out2', type: 'OUTPUT', value: false },
      },
      wires: {
        w1: { id: 'w1', startBlockId: 'source', endBlockId: 'out1', path: [] },
        w2: { id: 'w2', startBlockId: 'source', endBlockId: 'out2', path: [] },
      },
    },
  },
  {
    name: 'feed-forward chain without feedback',
    outputs: ['out'],
    circuit: {
      blocks: {
        in1: { id: 'in1', type: 'INPUT', value: false },
        in2: { id: 'in2', type: 'INPUT', value: true },
        or1: { id: 'or1', type: 'OR', value: false },
        not1: { id: 'not1', type: 'NOT', value: false },
        out: { id: 'out', type: 'OUTPUT', value: false },
      },
      wires: {
        w1: { id: 'w1', startBlockId: 'in1', endBlockId: 'or1', path: [] },
        w2: { id: 'w2', startBlockId: 'in2', endBlockId: 'or1', path: [] },
        w3: { id: 'w3', startBlockId: 'or1', endBlockId: 'not1', path: [] },
        w4: { id: 'w4', startBlockId: 'not1', endBlockId: 'out', path: [] },
      },
    },
  },
];

testCases.forEach(testCase => {
  assertStartEngineMatchesEvaluate(testCase);
});

console.log('startEngine test scenarios passed');
