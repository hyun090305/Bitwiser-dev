import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradeCircuit, gradeCircuitSync, GRADING_VERSION } from '../src/modules/circuitGrading.js';
import { getReferenceFSM } from '../src/modules/referenceFSM.js';
import { MEMORY20_IDS } from '../src/modules/memory20References.js';
import { getExecutionState, tickCircuit, previewCircuit } from '../src/canvas/evaluation.js';
import { createTracePlayback } from '../src/canvas/tracePlayback.js';
import { automaticDoorShortcut, responseCheckShortcut, registeredAddressMemory, memoryFixture } from './helpers/sequential-observation-circuits.mjs';

const levels = JSON.parse(fs.readFileSync(new URL('../levels.json', import.meta.url)));
const answer = id => levels.levelAnswers[id];
const oldAnswer = id => ({ mode:'sequential', reference:{...getReferenceFSM(answer(id).referenceId), releaseButtons:undefined, readProbe:undefined} });
const policies = {
  25:['LOAD'],28:['ACK'],29:['A','B'],30:['OPEN'],32:['INC','DEC','RESET'],33:['RESET'],34:['KICK'],37:['SUBMIT'],
  38:['WRITE'],39:['SAVE','UNDO'],40:['SEND','TAKE'],41:['PUSH','POP'],42:['PUSH','POP'],43:['RECEIVE'],45:['ADD','RESET']
};

test('trusted release policies match exactly the 15 stage button sets; excluded contracts stay unchanged', () => {
  assert.equal(GRADING_VERSION, 4);
  for (const id of Object.values(MEMORY20_IDS).filter(id => id !== 46)) {
    const ref = getReferenceFSM(answer(id).referenceId);
    assert.deepEqual(ref.releaseButtons, policies[id], `stage ${id}`);
    const buttons = levels.levelBlockSets[id].filter(b => b.type === 'INPUT' && b.inputMode === 'button').map(b => b.name).sort();
    assert.deepEqual([...(policies[id] || [])].sort(), buttons);
    assert.equal(Boolean(ref.readProbe), id === 38);
  }
  for (const id of ['toggle-light', 'lab-register', 'lab-enabled-register', 'automatic-door', 'memory20:C5-04']) {
    const ref = getReferenceFSM(id);
    assert.equal(ref.releaseButtons, undefined);
    assert.equal(ref.readProbe, undefined);
  }
  assert.equal(getReferenceFSM(answer(26).referenceId).observeAt, undefined);
});

test('all 19 reference circuits pass sync/async without changing search transitions or editor state', async () => {
  for (const id of Object.values(MEMORY20_IDS).filter(id => id !== 46)) {
    const circuit = memoryFixture(id);
    tickCircuit(circuit);
    const before = structuredClone(circuit), execution = structuredClone(getExecutionState(circuit));
    const old = gradeCircuitSync(circuit, oldAnswer(id));
    const result = gradeCircuitSync(circuit, answer(id));
    assert.equal(result.status, 'pass', `stage ${id}`);
    assert.equal(result.states, old.states);
    assert.equal(result.transitions, old.transitions);
    assert.equal(result.checks, id === 38 ? 8 + 4 * result.transitions : (policies[id] ? 2 : 1) * result.transitions);
    assert.deepEqual(await gradeCircuit(circuit, answer(id)), result);
    assert.deepEqual(circuit, before);
    assert.deepEqual(getExecutionState(circuit), execution);
  }
});

test('old door and GO shortcuts fail only after release, regardless of submitted input modes', async () => {
  for (const [id, factory] of [[30, automaticDoorShortcut], [29, responseCheckShortcut]]) {
    const circuit = factory();
    assert.equal(gradeCircuitSync(circuit, oldAnswer(id)).status, 'pass');
    const result = gradeCircuitSync(circuit, answer(id));
    assert.equal(result.status, 'fail');
    assert.equal(result.observation, 'after_release');
    assert.ok(Object.values(result.sampledInputs).some(Boolean));
    assert.ok(Object.values(result.inputs).every(value => value === 0));
    assert.deepEqual(await gradeCircuit(circuit, answer(id)), result);
    for (const b of Object.values(circuit.blocks)) if (b.type === 'INPUT') b.inputMode = 'switch';
    assert.deepEqual(gradeCircuitSync(circuit, answer(id)), result, 'submission cannot override trusted policy');
  }
});

test('button re-requests, simultaneous requests and consecutive requests retain the same tick output', () => {
  for (const [id, histories] of [
    [30, [[1,0,0,0], [1,0,1,0,0,0], [1,1,1,1,0,0,0]]],
    [29, [[3,3,3,0], [1,0,2,0], [2,1,3,0,0]]]
  ]) for (const history of histories) {
    const circuit = memoryFixture(id), state = getExecutionState(circuit), ref = getReferenceFSM(answer(id).referenceId);
    let referenceState = ref.initialState;
    for (const mask of history) {
      for (const block of Object.values(circuit.blocks)) if (block.type === 'INPUT') block.value = Boolean(mask & (1 << ref.inputs.indexOf(block.name)));
      const expected = ref.evaluate(referenceState, mask); referenceState = expected.nextState;
      assert.equal(tickCircuit(circuit, state).ok, true);
      const output = Object.values(circuit.blocks).filter(b => b.type === 'OUTPUT').reduce((n,b) => n | (Number(b.value) << ref.outputs.indexOf(b.name)), 0);
      assert.equal(output, expected.outputs, `stage ${id}, input ${mask}`);
      assert.ok(Object.values(circuit.blocks).filter(b => b.type === 'INPUT').every(b => !b.value));
    }
    assert.equal(state.tick, history.length);
  }
});

test('address reads reject a tick-dependent output register, including remapped input/output orders', async () => {
  for (const reverse of [false, true]) {
    const circuit = registeredAddressMemory();
    if (reverse) circuit.blocks = Object.fromEntries(Object.entries(circuit.blocks).reverse());
    assert.equal(gradeCircuitSync(circuit, oldAnswer(38)).status, 'pass');
    const result = gradeCircuitSync(circuit, answer(38));
    assert.equal(result.status, 'fail'); assert.equal(result.observation, 'address_read');
    assert.equal(result.inputs.WRITE, 0);
    assert.deepEqual(await gradeCircuit(circuit, answer(38)), result);
    assert.equal(result.trace.at(-2).type, 'set');
    assert.equal(result.trace.at(-1).observation, 'address_read');
    assert.notEqual(result.inputs.ADDR, result.sampledInputs.ADDR);
  }
});

test('initial address reads reject faults before the first tick', () => {
  const circuit = memoryFixture(38), out = Object.values(circuit.blocks).find(b => b.name === 'Q0' && b.type === 'OUTPUT');
  Object.values(circuit.wires).find(w => w.endBlockId === out.id).startBlockId = 'D0';
  const result = gradeCircuitSync(circuit, answer(38));
  assert.equal(result.status, 'fail'); assert.equal(result.observation, 'address_read');
  assert.equal(result.transitions, 0); assert.equal(result.trace.some(e => e.type === 'tick'), false);
  assert.equal(result.inputs.D0, 1); assert.equal(result.actual.Q0, 1); assert.equal(result.expected.Q0, 0);
});

test('every failure trace reproduces actual outputs; release/read events never change memory or time', () => {
  for (const [id, factory] of [[30, automaticDoorShortcut], [29, responseCheckShortcut], [38, registeredAddressMemory]]) {
    const circuit = factory(); tickCircuit(circuit); previewCircuit(circuit);
    const before = structuredClone(circuit), state = structuredClone(getExecutionState(circuit));
    const result = gradeCircuitSync(circuit, answer(id)), playback = createTracePlayback(circuit, result.trace);
    playback.start();
    for (const event of result.trace) {
      const previous = structuredClone(getExecutionState(circuit)), step = playback.step();
      if (event.type === 'set' || event.type === 'expect') assert.deepEqual(getExecutionState(circuit), previous);
      if (event.type === 'expect') for (const output of event.outputs) assert.equal(Number(circuit.blocks[output.blockId].value), output.actual);
      if (event === result.trace.at(-1)) assert.ok(step.highlight.blocks.some(b => !b.passed));
    }
    assert.equal(getExecutionState(circuit).tick, result.trace.filter(e => e.type === 'tick').length);
    playback.restore(); assert.deepEqual(circuit, before); assert.deepEqual(getExecutionState(circuit), state);
  }
});

test('release and address observations share cancellation, time and comparison budgets', async t => {
  for (const [id, phase] of [[30,'after_release'], [38,'address_read']]) {
    const controller = new AbortController();
    const cancelled = await gradeCircuit(memoryFixture(id), answer(id), {
      signal:controller.signal, chunkSize:1, onProgress:p => { if (p.phase === phase) controller.abort(); }
    });
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.ok, false);
  }
  // 8 reference states x 2 inputs fit the setup limit; the extra release
  // observations exhaust the comparison budget before the old search would.
  const limited = gradeCircuitSync(memoryFixture(30), answer(30), {maxTransitions:16});
  assert.equal(limited.status, 'incomplete'); assert.equal(limited.reason, 'TRANSITION_LIMIT');
  assert.equal(limited.checks, 16); assert.equal(limited.transitions, 8);
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const timeout = await gradeCircuit(memoryFixture(30), answer(30), {
    chunkSize:1, maxMilliseconds:10, onProgress:p => { if (p.phase === 'after_release') now = 11; }
  });
  assert.equal(timeout.status, 'incomplete'); assert.equal(timeout.reason, 'TIME_LIMIT');
  now = 0;
  const lateFailure = await gradeCircuit(automaticDoorShortcut(), answer(30), {
    chunkSize:1, maxMilliseconds:10,
    onProgress:p => { if (p.phase === 'after_release' && p.transitions === 2) now = 11; }
  });
  assert.equal(lateFailure.status, 'incomplete'); assert.equal(lateFailure.reason, 'TIME_LIMIT');
});

test('invalid observation definitions and invalid read values cannot pass', () => {
  const base = getReferenceFSM(answer(38).referenceId);
  for (const change of [
    {releaseButtons:['MISSING']}, {releaseButtons:['WRITE','WRITE']}, {observeAt:'before_tick'},
    {readProbe:{...base.readProbe, vary:['MISSING']}}, {readProbe:{...base.readProbe, fixed:{ADDR:0}}},
    {readProbe:{...base.readProbe, fixed:{WRITE:2}}}, {readProbe:{...base.readProbe, observe:undefined}}
  ]) assert.equal(gradeCircuitSync(memoryFixture(38), {mode:'sequential',reference:{...base,...change}}).status, 'invalid');
  assert.equal(gradeCircuitSync(memoryFixture(38), {mode:'sequential',reference:{...base,readProbe:{...base.readProbe,observe:()=>4}}}).diagnostics[0].code, 'INVALID_REFERENCE_RESULT');
});
