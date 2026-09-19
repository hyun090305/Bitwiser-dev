import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { makeCircuit, newBlock, newWire } from '../src/canvas/model.js';
import { getExecutionState, previewCircuit, tickCircuit } from '../src/canvas/evaluation.js';
import { applyTraceEvent, createTracePlayback, getTraceHighlight } from '../src/canvas/tracePlayback.js';

function register() {
  const c = makeCircuit();
  for (const [id, type] of [['x', 'INPUT'], ['a', 'D'], ['b', 'D'], ['o', 'OUTPUT']]) {
    c.blocks[id] = newBlock({ id, type, name: id, pos: { r: 0, c: 0 } });
  }
  for (const [i, [startBlockId, endBlockId]] of [['x', 'a'], ['a', 'b'], ['b', 'o']].entries()) {
    c.wires[i] = newWire({ id: String(i), startBlockId, endBlockId, inputRole: endBlockId === 'o' ? undefined : 'D', path: [] });
  }
  return c;
}
function zero(observeAt) {
  return { mode: 'sequential', reference: { inputs: ['x'], outputs: ['o'], initialState: 0, stateCount: 1,
    observeAt, evaluate: () => ({ outputs: 0, nextState: 0 }) } };
}

for (const observeAt of ['before_tick', 'after_tick']) test(`${observeAt}: grader trace replays identical observations and simultaneous commits`, () => {
  const c = register();
  c.blocks.x.inputMode = 'button';
  const result = gradeCircuitSync(c, zero(observeAt));
  assert.equal(result.status, 'fail');
  const stepOrder = observeAt === 'before_tick' ? ['set', 'expect', 'tick'] : ['set', 'tick', 'expect'];
  assert.deepEqual(result.trace.slice(1, 4).map(e => e.type), stepOrder);
  const playback = createTracePlayback(c, result.trace); playback.start();
  let step;
  while ((step = playback.step())) {
    assert.equal(step.event, result.trace[step.index]);
    if (step.event.type === 'tick' && getExecutionState(c).tick === 1) {
      assert.equal(getExecutionState(c).memory.get('a'), true);
      assert.equal(getExecutionState(c).memory.get('b'), false); // simultaneous, not cascaded commit
      assert.equal(c.blocks.x.value, true); // no invented button-release SET
    }
    if (step.event.type === 'expect') {
      for (const signal of step.event.outputs) {
        assert.equal(Number(c.blocks[signal.blockId].value), signal.actual);
        assert.equal(step.highlight.blocks.find(b => b.blockId === signal.blockId).passed, signal.passed);
      }
    }
  }
  assert.equal(getTraceHighlight(c).blocks[0].passed, false);
  playback.restore();
  assert.equal(getExecutionState(c).tick, 0);
  assert.equal(getTraceHighlight(c), undefined);
});

test('legacy edge pulse before tick remains distinct from the observation after tick', () => {
  const c = JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-memory/31.json', import.meta.url))).circuit;
  const trace = [
    { type: 'set', signal: 'SIGNAL', value: 1 },
    { type: 'expect', signal: 'RISE', actual: 1, expected: 1, passed: true },
    { type: 'tick' },
    { type: 'expect', signal: 'RISE', actual: 0, expected: 0, passed: true },
    { type: 'tick' } // a trace need not end with an observation
  ];
  const playback = createTracePlayback(c, trace); playback.start();
  for (const event of trace) {
    const step = playback.step(); assert.equal(step.event, event);
    if (event.type === 'expect') assert.equal(step.highlight.blocks[0].actual, event.actual);
  }
  assert.equal(getExecutionState(c).tick, 2);
  playback.restore();
});

test('cancellation and repeated playback restore editor Q, held inputs and tick history', () => {
  const c = register(); c.blocks.x.value = true; tickCircuit(c); tickCircuit(c);
  c.blocks.x.value = false; previewCircuit(c);
  const state = structuredClone(getExecutionState(c)), design = structuredClone(c);
  const trace = gradeCircuitSync(c, zero()).trace;
  const playback = createTracePlayback(c, trace);
  playback.start(); playback.step(); playback.step(); playback.restore();
  assert.deepEqual(getExecutionState(c), state); assert.deepEqual(c, design);
  assert.equal(playback.step(), null);
  playback.start(); while (playback.step()) {} playback.restore();
  assert.deepEqual(getExecutionState(c), state); assert.deepEqual(c, design);
});

test('truth-table trace has no invented tick or memory initialization', () => {
  const c = register(); delete c.blocks.a; delete c.blocks.b; c.wires = {};
  const result = gradeCircuitSync(c, [0, 1].map(x => ({ inputs: { x }, expected: { o: x } })));
  assert.deepEqual(result.trace.map(e => e.type), ['set', 'expect']);
  assert.deepEqual(result.trace[1].outputs[0], { signal: 'o', blockId: 'o', actual: 0, expected: 1, passed: false });
  assert.throws(() => applyTraceEvent(c, { type: 'unknown' }), /Unsupported trace event/);
});

test('existing FSMs retain before-tick grading semantics', () => {
  assert.deepEqual(gradeCircuitSync(register(), zero()), gradeCircuitSync(register(), zero('before_tick')));
  assert.equal(gradeCircuitSync(register(), zero('guess')).diagnostics[0].code, 'INVALID_OBSERVATION');
});
