import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { makeCircuit, newBlock, newWire } from '../src/canvas/model.js';
import { getExecutionState, previewCircuit, tickCircuit } from '../src/canvas/evaluation.js';
import { applyTraceEvent, createTracePlayback, getTraceHighlight } from '../src/canvas/tracePlayback.js';
import { observationLabel } from '../src/modules/counterexampleTrace.js';
import { automaticDoorShortcut, responseCheckShortcut, registeredAddressMemory } from './helpers/sequential-observation-circuits.mjs';

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
  c.wires.direct = newWire({ id:'direct', startBlockId:'x', endBlockId:'o', path:[] });
  const result = gradeCircuitSync(c, [0, 1].map(x => ({ inputs: { x }, expected: { o: 0 } })));
  assert.deepEqual(result.trace.map(e => e.type), ['set', 'expect']);
  assert.deepEqual(result.trace[1].outputs[0], { signal: 'o', blockId: 'o', actual: 1, expected: 0, passed: false });
  assert.throws(() => applyTraceEvent(c, { type: 'unknown' }), /Unsupported trace event/);
});

test('existing FSMs retain before-tick grading semantics', () => {
  assert.deepEqual(gradeCircuitSync(register(), zero()), gradeCircuitSync(register(), zero('before_tick')));
  assert.equal(gradeCircuitSync(register(), zero('guess')).diagnostics[0].code, 'INVALID_OBSERVATION');
});

test('legacy unmarked ticks and explicit releases retain their original playback semantics', () => {
  const c = JSON.parse(fs.readFileSync(new URL('./fixtures/memory20/38.json', import.meta.url))).circuit;
  const inputs = Object.fromEntries(Object.values(c.blocks).filter(b => b.type === 'INPUT').map(b => [b.name, b]));
  const outputs = Object.fromEntries(Object.values(c.blocks).filter(b => b.type === 'OUTPUT').map(b => [b.name, b]));
  const set = values => ({ type: 'set', inputs: Object.entries(values).map(([signal, value]) => ({ signal, value, blockId: inputs[signal].id })) });
  const expect = (observation, q) => ({ type: 'expect', observation, outputs: ['Q0', 'Q1'].map((signal, i) => ({
    signal, blockId: outputs[signal].id, actual: (q >> i) & 1, expected: (q >> i) & 1, passed: true
  })) });
  const trace = [{ type: 'init', memory: [] }];
  // Initial reads, writes to both addresses, and bidirectional repeated reads.
  for (const ADDR of [0, 1]) trace.push(set({ WRITE: 0, ADDR, D0: 1, D1: 1 }), expect('address_read', 0));
  for (const [ADDR, D0, D1] of [[0, 1, 0], [1, 0, 1]]) {
    const value = D0 | (D1 << 1);
    trace.push(set({ WRITE: 1, ADDR, D0, D1 }), { type: 'tick' }, expect('after_tick', value),
      set({ WRITE: 0, ADDR, D0, D1 }), expect('after_release', value));
  }
  for (const ADDR of [0, 1, 0, 0, 1, 1]) trace.push(set({ WRITE: 0, ADDR, D0: 0, D1: 1 }), expect('address_read', ADDR ? 2 : 1));

  for (const input of Object.values(inputs)) input.value = true;
  tickCircuit(c);
  const savedState = structuredClone(getExecutionState(c)), savedCircuit = structuredClone(c);
  const playback = createTracePlayback(c, trace);
  // Cancel at every boundary, including after the last observation, then restart.
  for (let stop = 1; stop <= trace.length; stop++) {
    playback.start();
    for (let i = 0; i < stop; i++) {
      const before = structuredClone(getExecutionState(c));
      const step = playback.step();
      assert.equal(step.event, trace[i]);
      if (step.event.type !== 'init' && step.event.type !== 'tick') assert.deepEqual(getExecutionState(c), before);
      if (step.event.type === 'tick') {
        assert.equal(getExecutionState(c).tick, before.tick + 1);
        assert.equal(inputs.WRITE.value, true, 'only an explicit SET releases the sampled button');
      }
      if (step.event.type === 'set') for (const signal of step.event.inputs) assert.equal(Number(inputs[signal.signal].value), signal.value);
      if (step.event.type === 'expect') {
        assert.equal(step.highlight.observation, step.event.observation);
        assert.deepEqual(step.highlight.blocks.map(b => b.actual), step.event.outputs.map(s => s.actual));
        assert.ok(step.highlight.blocks.every(b => b.passed));
      }
    }
    if (stop === trace.length) {
      assert.equal(playback.step(), null);
      assert.equal(getExecutionState(c).tick, 2, 'all read probes share the two real write ticks');
    }
    playback.restore();
    assert.deepEqual(getExecutionState(c), savedState);
    assert.deepEqual(c, savedCircuit);
    assert.equal(getTraceHighlight(c), undefined);
  }
});

test('observation labels distinguish all supplied boundaries in Korean and English', () => {
  for (const language of ['ko', 'en']) {
    const labels = ['initial', 'after_set', 'before_tick', 'after_tick', 'after_release', 'address_read'].map(phase => observationLabel(phase, language));
    assert.equal(new Set(labels).size, 6);
    assert.ok(labels.every(Boolean));
  }
  assert.match(observationLabel('after_release', 'ko'), /버튼 해제/);
  assert.match(observationLabel('after_release', 'en'), /button release/);
  assert.match(observationLabel('address_read', 'ko'), /tick 없음/);
  assert.match(observationLabel('address_read', 'en'), /no tick/);
  assert.equal(observationLabel(undefined, 'en'), '');
});

for (const [stage, make, observation] of [
  [30, automaticDoorShortcut, 'after_set'],
  [29, responseCheckShortcut, 'after_tick'],
  [38, registeredAddressMemory, 'after_set']
]) test(`stage ${stage}: failure metadata, rendered event phase and actual replay agree at ${observation}`, () => {
  const c = make(); previewCircuit(c);
  const before = structuredClone(c);
  const definitions = JSON.parse(fs.readFileSync(new URL('../levels.json', import.meta.url)));
  const result = gradeCircuitSync(c, definitions.levelAnswers[stage]);
  assert.equal(result.status, 'fail');
  assert.equal(result.observation, observation);
  assert.deepEqual(c, before, 'grading cannot modify the editor circuit');
  const finalSet = result.trace.at(-2), finalExpect = result.trace.at(-1);
  assert.equal(finalSet.type, observation === 'after_tick' ? 'tick' : 'set');
  assert.equal(finalExpect.observation, observation);
  assert.deepEqual(Object.fromEntries(finalExpect.outputs.map(s => [s.signal, s.actual])), result.actual);
  assert.deepEqual(Object.fromEntries(finalExpect.outputs.map(s => [s.signal, s.expected])), result.expected);
  const playback = createTracePlayback(c, result.trace); playback.start();
  let step, ticks = 0;
  while ((step = playback.step())) {
    if (step.event.type === 'tick') ticks++;
    assert.equal(getExecutionState(c).tick, ticks);
    if (step.event.type === 'expect') {
      assert.equal(step.highlight.observation, step.event.observation);
      assert.deepEqual(step.highlight.blocks.map(b => b.actual), step.event.outputs.map(s => s.actual));
      assert.deepEqual(step.highlight.blocks.map(b => b.passed), step.event.outputs.map(s => s.passed));
    }
  }
  assert.ok(getTraceHighlight(c).blocks.some(b => !b.passed));
  assert.deepEqual(Object.fromEntries(Object.values(c.blocks).filter(b => b.type === 'INPUT').map(b => [b.name, Number(b.value)])), result.inputs);
  playback.restore();
  assert.deepEqual(c, before);
});

test('a later completed-tick failure replays each parent SET and atomic tick with release', () => {
  const c = register(); c.blocks.x.inputMode = 'button';
  const answers = zero('after_tick');
  Object.assign(answers.reference, { observationMode:'visible', releaseButtons:['x'], step:()=>0, observe:()=>0 });
  const result = gradeCircuitSync(c, answers);
  assert.equal(result.observation, 'after_tick');
  assert.deepEqual(result.trace.map(e => e.type), ['init', 'expect', 'set', 'expect', 'tick', 'expect', 'set', 'expect', 'tick', 'expect']);
  for (const event of result.trace.filter(e => e.type === 'tick')) {
    assert.equal(event.tickMode, 'visible');
    assert.deepEqual(event.releaseInputs, [{signal:'x', blockId:'x', value:0}]);
  }
  const playback = createTracePlayback(c, result.trace); playback.start();
  let step;
  while ((step = playback.step())) if (step.event.type === 'expect') {
    assert.equal(step.highlight.blocks[0].actual, step.event.outputs[0].actual);
    assert.equal(step.highlight.blocks[0].passed, step.event.outputs[0].passed);
  }
  assert.equal(getExecutionState(c).tick, 2);
  playback.restore();
});

test('initial address-read failure replays without any tick', () => {
  const c = makeCircuit();
  for (const name of ['D0', 'D1', 'ADDR', 'WRITE', 'Q0', 'Q1']) {
    c.blocks[name] = newBlock({ id: name, name, type: name.startsWith('Q') ? 'OUTPUT' : 'INPUT', pos: { r: 0, c: 0 } });
  }
  for (const bit of [0, 1]) c.wires[bit] = newWire({ id: String(bit), startBlockId: `D${bit}`, endBlockId: `Q${bit}`, path: [] });
  const result = gradeCircuitSync(c, { mode: 'sequential', referenceId: 'memory20:C5-02' });
  assert.equal(result.observation, 'after_set');
  assert.deepEqual(result.trace.map(e => e.type), ['init', 'expect', 'set', 'expect']);
  const playback = createTracePlayback(c, result.trace); playback.start();
  while (playback.step()) assert.equal(getExecutionState(c).tick, 0);
  assert.ok(getTraceHighlight(c).blocks.some(b => !b.passed));
  playback.restore();
});

test('visible ticks never display or grade the hidden pre-release frame', () => {
  const c = makeCircuit();
  c.blocks.x = newBlock({id:'x', name:'x', type:'INPUT', inputMode:'button', pos:{r:0,c:0}});
  c.blocks.o = newBlock({id:'o', name:'o', type:'OUTPUT', pos:{r:0,c:1}});
  c.wires.w = newWire({id:'w', startBlockId:'x', endBlockId:'o', path:[]});
  const answers = {mode:'sequential', reference:{inputs:['x'], outputs:['o'], initialState:0, stateCount:1,
    observeAt:'after_tick', observationMode:'visible', releaseButtons:['x'], step:()=>0, observe:(_s,x)=>x}};
  assert.equal(gradeCircuitSync(c, answers).status, 'pass', 'completed output is 0 although the hidden frame is 1');
  let value = false; const displayed = [];
  Object.defineProperty(c.blocks.o, 'value', {configurable:true, enumerable:true, get:()=>value, set:v=>{value=v;displayed.push(v);}});
  applyTraceEvent(c, {type:'set', signal:'x', value:1}); displayed.length = 0;
  applyTraceEvent(c, {type:'tick', tickMode:'visible', releaseInputs:[{signal:'x',value:0}]});
  assert.equal(c.blocks.x.value, false); assert.equal(c.blocks.o.value, false);
  assert.ok(displayed.length > 0); assert.ok(displayed.every(v=>v===false));
  assert.equal(getExecutionState(c).tick, 1);
  applyTraceEvent(c, {type:'set', signal:'x', value:1});
  applyTraceEvent(c, {type:'tick'});
  assert.equal(c.blocks.x.value, true); assert.equal(c.blocks.o.value, true, 'unmarked legacy tick retains sampled input');
  const before = structuredClone(getExecutionState(c));
  assert.throws(()=>applyTraceEvent(c,{type:'tick',tickMode:'visible',releaseInputs:[{signal:'missing'}]}), /port unavailable/);
  assert.deepEqual(getExecutionState(c), before);
});

test('visible replay cancellation at every boundary restores inputs, Q, tick, lastTick and design', () => {
  const c = registeredAddressMemory();
  Object.values(c.blocks).filter(b=>b.type==='INPUT').forEach(b=>{b.value=true;}); tickCircuit(c); previewCircuit(c);
  const before = structuredClone(c), state = structuredClone(getExecutionState(c));
  const trace = gradeCircuitSync(c,{mode:'sequential',referenceId:'memory20:C5-02'}).trace;
  const playback = createTracePlayback(c, trace);
  for(let stop=1;stop<=trace.length;stop++) {
    playback.start();
    for(let i=0;i<stop;i++) {
      const previous = structuredClone(getExecutionState(c)), {event} = playback.step();
      if(event.type==='tick') {
        assert.equal(getExecutionState(c).tick,previous.tick+1);
        for(const signal of event.releaseInputs) assert.equal(c.blocks[signal.blockId].value,false);
      } else if(event.type!=='init') assert.deepEqual(getExecutionState(c),previous);
    }
    playback.restore(); assert.deepEqual(c,before); assert.deepEqual(getExecutionState(c),state);
  }
});
