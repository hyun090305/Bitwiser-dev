import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeCircuit, newBlock, newWire } from '../src/canvas/model.js';
import { evaluateCircuit, evaluateCombinational, getExecutionState, createExecutionState, tickCircuit, resetExecution, toggleButton, prepareCircuit, getEvaluationResult, startEngine, markCircuitDirty } from '../src/canvas/engine.js';
import { assignNewInputRole, normalizeAfterEdit, swapMemoryInputs, canConnect } from '../src/canvas/connections.js';
import { snapshotCircuit, getCircuitStats, SUPPORTED_CIRCUIT_VERSIONS } from '../src/canvas/circuitData.js';
import { createTickRunner } from '../src/canvas/tickRunner.js';
import { gradeCircuit } from '../src/modules/circuitGrading.js';
import { MEMORY_EXAMPLES, makeMemoryExample } from '../src/modules/memoryExamples.js';
import { createGradingController } from '../src/modules/grading.js';
import { validateCircuit } from '../src/demo/records.js';

function build(types, edges = []) {
  const c = makeCircuit();
  Object.entries(types).forEach(([id, type], i) => { c.blocks[id] = newBlock({ id, type, name: id, pos: { r: 0, c: i } }); });
  edges.forEach(([from, to], i) => connect(c, from, to, `w${i}`));
  return c;
}
function connect(c, from, to, id = `w${Object.keys(c.wires).length}`) {
  const w = newWire({ id, startBlockId: from, endBlockId: to, path: [] });
  assignNewInputRole(c, w); c.wires[id] = w; return w;
}
const sample = () => build({ x: 'INPUT', d: 'D', o: 'OUTPUT' }, [['x', 'd'], ['d', 'o']]);
const enabled = () => build({ x: 'INPUT', en: 'INPUT', d: 'D', o: 'OUTPUT' }, [['x', 'd'], ['en', 'd'], ['d', 'o']]);
const q = c => getExecutionState(c).memory.get('d');
const row = (x, o) => ({ inputs: { x }, expected: { o } });

test('unequal-depth AND/OR paths settle topologically for all inputs and storage orders', () => {
  for (const gate of ['AND', 'OR']) for (const reverse of [false, true]) for (const x of [false, true]) {
    const c = build({ x: 'INPUT', a: 'NOT', b: 'NOT', g: gate, o: 'OUTPUT' }, [['x', 'a'], ['a', 'b'], ['b', 'g'], ['x', 'g'], ['g', 'o']]);
    if (reverse) {
      c.blocks = Object.fromEntries(Object.entries(c.blocks).reverse());
      c.wires = Object.fromEntries(Object.entries(c.wires).reverse());
    }
    c.blocks.x.value = x; evaluateCircuit(c);
    assert.equal(c.blocks.o.value, x); assert.equal(getEvaluationResult(c).ok, true);
  }
});

test('legacy variable-input gates, unconnected gates and first-input NOT remain defined', () => {
  const c = build({ x: 'INPUT', y: 'INPUT', z: 'INPUT', a: 'AND', r: 'OR', n: 'NOT', j: 'JUNCTION', o: 'OUTPUT' });
  evaluateCircuit(c);
  assert.deepEqual(['a','r','n','j','o'].map(id => c.blocks[id].value), [true,false,true,false,false]);
  for (const id of ['x','y','z']) { connect(c,id,'a'); connect(c,id,'r'); c.blocks[id].value = true; }
  connect(c,'x','n'); connect(c,'y','n'); c.blocks.y.value = false;
  evaluateCircuit(c); assert.equal(c.blocks.a.value,false); assert.equal(c.blocks.r.value,true); assert.equal(c.blocks.n.value,false);
});

test('plan is reused across input changes, ticks and movement; role edits rebuild it', () => {
  const c = enabled(); const plan = prepareCircuit(c);
  c.blocks.x.value = true; evaluateCircuit(c); tickCircuit(c); c.blocks.d.pos.r++;
  assert.equal(prepareCircuit(c), plan);
  swapMemoryInputs(c,'d'); assert.notEqual(prepareCircuit(c), plan);
});

test('single D holds before tick, captures afterward, and reset is Q=0/tick=0', () => {
  const c = sample(); c.blocks.x.value = true;
  evaluateCircuit(c); assert.equal(c.blocks.o.value,false); assert.equal(q(c),false);
  assert.equal(tickCircuit(c).ok,true); assert.equal(q(c),true); assert.equal(c.blocks.o.value,true);
  c.blocks.x.value = false; evaluateCircuit(c); assert.equal(c.blocks.o.value,true);
  resetExecution(c); assert.equal(q(c),false); assert.equal(getExecutionState(c).tick,0);
});

test('D+EN holds at EN=0 and captures both 0 and 1 at EN=1', () => {
  const c = enabled(); c.blocks.x.value = true;
  tickCircuit(c); assert.equal(q(c),false);
  c.blocks.en.value = true; tickCircuit(c); assert.equal(q(c),true);
  c.blocks.en.value = false; c.blocks.x.value = false; tickCircuit(c); assert.equal(q(c),true);
  c.blocks.en.value = true; tickCircuit(c); assert.equal(q(c),false);
});

test('two serial D blocks only propagate one register per tick', () => {
  const c = build({ x:'INPUT', a:'D', b:'D', o:'OUTPUT' }, [['x','a'],['a','b'],['b','o']]);
  c.blocks.x.value = true; tickCircuit(c); assert.equal(c.blocks.o.value,false);
  tickCircuit(c); assert.equal(c.blocks.o.value,true);
});

test('D-NOT feedback toggles once per tick; pure evaluations, dirty frames and rendering never toggle', () => {
  const c = build({ d:'D', n:'NOT' }, [['d','n'],['n','d']]);
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let frame; globalThis.requestAnimationFrame = fn => { frame = fn; return 1; }; globalThis.cancelAnimationFrame = () => {};
  try {
    const engine = startEngine({}, c, () => {});
    tickCircuit(c); assert.equal(q(c),true);
    for (let i=0;i<25;i++) { markCircuitDirty(c); frame(i*16); evaluateCircuit(c); assert.equal(q(c),true); }
    assert.equal(getExecutionState(c).tick,1); tickCircuit(c); assert.equal(q(c),false); engine.stop();
  } finally { globalThis.requestAnimationFrame = originalRaf; globalThis.cancelAnimationFrame = originalCancel; }
});

test('mutual D swap samples the same before state, independent of block/wire order', () => {
  for (const reverse of [false,true]) {
    const c = build({ a:'D', b:'D' }, [['a','b'],['b','a']]);
    if (reverse) { c.blocks = Object.fromEntries(Object.entries(c.blocks).reverse()); c.wires = Object.fromEntries(Object.entries(c.wires).reverse()); }
    const state = createExecutionState(c,{ memory: { a:false,b:true } });
    assert.equal(tickCircuit(c,state).ok,true);
    assert.equal(state.memory.get('a'),true); assert.equal(state.memory.get('b'),false);
  }
});

test('enabled inverter feedback toggles only with enable', () => {
  const c = build({ d:'D', n:'NOT', en:'INPUT' }, [['n','d'],['en','d'],['d','n']]);
  tickCircuit(c); assert.equal(q(c),false);
  c.blocks.en.value = true; tickCircuit(c); assert.equal(q(c),true);
  c.blocks.en.value = false; tickCircuit(c); assert.equal(q(c),true);
  c.blocks.en.value = true; tickCircuit(c); assert.equal(q(c),false);
});

test('swap changes roles, never Q, and two swaps restore the design', () => {
  const c = enabled(); c.blocks.x.value = true;
  const saved = snapshotCircuit(c); const state = getExecutionState(c);
  assert.equal(swapMemoryInputs(c,'d'),true); assert.equal(q(c),false);
  tickCircuit(c); assert.equal(q(c),false); // D now reads en=0, EN reads x=1
  c.blocks.en.value = true; tickCircuit(c); assert.equal(q(c),true);
  const previous = structuredClone(state); swapMemoryInputs(c,'d');
  assert.deepEqual(state,previous); c.blocks.en.value = false;
  assert.deepEqual(snapshotCircuit(c), saved);
  assert.equal(swapMemoryInputs(sample(),'d'),false);
});

test('1→2→1→2 connections rebase surviving EN to D, without hiding malformed imports', () => {
  const c = enabled(); delete c.wires.w0; normalizeAfterEdit(c);
  assert.equal(c.wires.w1.inputRole,'D');
  connect(c,'x','d','new'); assert.equal(c.wires.w1.inputRole,'D'); assert.equal(c.wires.new.inputRole,'EN');
  assert.equal(canConnect(c,'x','d'),false);
  delete c.wires.new; normalizeAfterEdit(c); assert.equal(c.wires.w1.inputRole,'D');
  c.wires.w1.inputRole = 'EN'; evaluateCircuit(c);
  assert.equal(getEvaluationResult(c).diagnostics[0].code,'INVALID_D_ROLES');
});

test('snapshot roundtrip preserves roles and INPUT policy, resets Q regardless of restored value', () => {
  const c = enabled(); swapMemoryInputs(c,'d'); c.blocks.x.value = c.blocks.en.value = true;
  tickCircuit(c); c.blocks.x.inputMode = 'button'; toggleButton(c,'x');
  const restored = JSON.parse(JSON.stringify(snapshotCircuit(c)));
  assert.equal(restored.wires.w0.inputRole,'EN'); assert.equal(restored.blocks.x.inputMode,'button');
  assert.equal(restored.blocks.x.value,false);
  restored.blocks.d.value = true; evaluateCircuit(restored);
  assert.equal(q(restored),false); assert.equal(getExecutionState(restored).tick,0);
  assert.equal(getCircuitStats(c).blockCounts.D,1);
});

test('invalid cycles, missing D, excess inputs, dangling wires and bad roles fail atomically', () => {
  for (const corrupt of [
    c => { delete c.wires.w0; delete c.wires.w1; },
    c => connect(c,'x','d','extra'),
    c => { c.wires.w0.inputRole = 'EN'; },
    c => { c.wires.w0.startBlockId = 'missing'; },
    c => { c.blocks.n = newBlock({id:'n',type:'NOT',pos:{r:3,c:3}}); connect(c,'n','n','loop'); },
    c => { c.blocks.r = newBlock({id:'r',type:'OR',pos:{r:3,c:3}}); connect(c,'r','r','stable-loop'); }
  ]) {
    const c = enabled(); c.blocks.x.inputMode = 'button';
    c.blocks.other = newBlock({ id:'other', type:'D', pos:{r:4,c:4} });
    connect(c,'x','other','secondary');
    const state = getExecutionState(c); state.memory.set('d',true); state.tick = 7; toggleButton(c,'x'); corrupt(c);
    const previous = structuredClone(state); const design = structuredClone(c);
    const result = tickCircuit(c); assert.equal(result.ok,false); assert.ok(result.diagnostics.length);
    assert.deepEqual(state,previous); assert.deepEqual(c,design);
    evaluateCircuit(c); assert.equal(c.blocks.o.value,null);
  }
});

test('OUTPUT/JUNCTION input limit is shared, while output fanout stays allowed', () => {
  for (const type of ['OUTPUT','JUNCTION']) {
    const c = build({ x:'INPUT', y:'INPUT', o:type }, [['x','o']]);
    assert.equal(canConnect(c,'y','o'),false); connect(c,'y','o');
    assert.equal(prepareCircuit(c).diagnostics[0].code,'TOO_MANY_INPUTS');
  }
  const c = build({ x:'INPUT', a:'OUTPUT', b:'OUTPUT' }, [['x','a'],['x','b']]);
  c.blocks.x.value=true; evaluateCircuit(c); assert.equal(c.blocks.a.value,true); assert.equal(c.blocks.b.value,true);
});

test('button toggles immediately, turns off after a successful tick, and retains the observed snapshot', () => {
  const c = sample(); c.blocks.p = newBlock({id:'p',type:'OUTPUT',name:'p',pos:{r:2,c:2}}); connect(c,'x','p','pulse');
  c.blocks.x.inputMode = 'button'; toggleButton(c,'x');
  evaluateCircuit(c); assert.equal(c.blocks.x.value,true); assert.equal(c.blocks.p.value,true);
  toggleButton(c,'x'); evaluateCircuit(c); assert.equal(c.blocks.x.value,false); assert.equal(c.blocks.p.value,false);
  toggleButton(c,'x'); evaluateCircuit(c);
  tickCircuit(c); assert.equal(c.blocks.p.value,false); assert.equal(q(c),true);
  const state = getExecutionState(c); assert.equal(c.blocks.x.value,false);
  evaluateCircuit(c); assert.equal(c.blocks.p.value,false); assert.equal(state.lastTick.values.get('p'),true);
  tickCircuit(c); assert.equal(c.blocks.p.value,false); assert.equal(q(c),false);
});

test('between-tick preview never replaces the committed grading snapshot', () => {
  const c = sample(); c.blocks.x.value = true; tickCircuit(c);
  const committed = structuredClone(getExecutionState(c).lastTick);
  c.blocks.x.value=false; evaluateCircuit(c);
  assert.deepEqual(getExecutionState(c).lastTick,committed);
});

const registerReference = { mode: 'sequential', reference: {
  inputs: ['x'], outputs: ['o'], initialState: 0, stateCount: 2,
  evaluate: (state, input) => ({ outputs: state, nextState: input })
} };

test('FSM grading always starts at reset and preserves the editor state', async () => {
  const c = sample(); c.blocks.x.value = true; tickCircuit(c);
  const state = structuredClone(getExecutionState(c)), design = structuredClone(c);
  const result = await gradeCircuit(c, registerReference);
  assert.equal(result.ok, true); assert.equal(result.states, 2); assert.equal(result.transitions, 4);
  assert.deepEqual(getExecutionState(c), state); assert.deepEqual(c, design);
  const delayed = build({ x:'INPUT', a:'D', b:'D', o:'OUTPUT' }, [['x','a'],['a','b'],['b','o']]);
  const failure = await gradeCircuit(delayed, registerReference);
  assert.deepEqual(failure.counterexample, { ticks: [{x:1}], observe: {x:0} });
  assert.deepEqual(failure.expected, {o:1}); assert.deepEqual(failure.actual, {o:0});
});

test('grading cancellation and callback exceptions preserve editor Q, inputs and values', async () => {
  const c = sample(); c.blocks.x.inputMode='button'; toggleButton(c,'x'); tickCircuit(c); toggleButton(c,'x');
  const state=structuredClone(getExecutionState(c)), design=structuredClone(c);
  const abort=new AbortController();
  assert.equal((await gradeCircuit(c,registerReference,{signal:abort.signal,onProgress:()=>abort.abort()})).cancelled,true);
  await assert.rejects(gradeCircuit(c,registerReference,{onProgress:()=>{throw Error('callback exception');}}));
  assert.deepEqual(getExecutionState(c),state); assert.deepEqual(c,design);
});

test('manual and automatic ticks match; one timer only, pause/leave prevents queued callbacks', () => {
  const manual=sample(), auto=sample(); const queue=new Map(); let id=0;
  const runner=createTickRunner(auto,{schedule:fn=>{queue.set(++id,fn);return id;},cancel:id=>queue.delete(id)});
  runner.play(); runner.play(); assert.equal(queue.size,1);
  for (const value of [1,0,1,1,0]) {
    manual.blocks.x.value=auto.blocks.x.value=Boolean(value); tickCircuit(manual);
    const [key,fn]=queue.entries().next().value; queue.delete(key); fn();
    assert.equal(q(auto),q(manual)); assert.equal(getExecutionState(auto).tick,getExecutionState(manual).tick);
  }
  const pending=queue.values().next().value; runner.pause(); assert.equal(queue.size,0); pending();
  assert.equal(getExecutionState(auto).tick,5);
  runner.play(); const leaving=queue.values().next().value; runner.destroy(); leaving();
  assert.equal(getExecutionState(auto).tick,5);
});

test('playback speed can range from one to ten ticks per second and reschedules while running', () => {
  const c=sample(); let delay=null; let nextId=0;
  const runner=createTickRunner(c,{schedule:(fn,ms)=>{delay=ms;return ++nextId;},cancel:()=>{}});
  runner.setInterval(1000);runner.play();assert.equal(delay,1000);
  runner.setInterval(100);assert.equal(delay,100);runner.destroy();
});

test('legacy v2 files evaluate and all Lab examples pass without changing shipped stage palettes', async () => {
  assert.ok(SUPPORTED_CIRCUIT_VERSIONS.includes(2));
  const levels=JSON.parse(fs.readFileSync(new URL('../levels.json',import.meta.url)));
  assert.equal(Object.entries(levels.levelBlockSets).filter(([id])=>Number(id)<=24).flatMap(([,palette])=>palette).some(b=>b.type==='D'),false);
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/demo/1-3.json',import.meta.url))).circuit;
  assert.equal((await gradeCircuit(fixture,levels.levelAnswers[1])).ok,true);
  for (const example of MEMORY_EXAMPLES) assert.equal((await gradeCircuit(makeMemoryExample(example),example.answers)).ok,true);
  Object.values(fixture.blocks).find(b=>b.type==='INPUT').inputMode='button';
  assert.throws(()=>validateCircuit(fixture,1,levels));
});

test('grading compares every output, including malformed duplicate output labels', async () => {
  const c=build({x:'INPUT',y:'INPUT',a:'OUTPUT',b:'OUTPUT'},[['x','a'],['y','b']]);
  c.blocks.a.name=c.blocks.b.name='o';
  assert.equal((await gradeCircuit(c,[{inputs:{x:0,y:1},expected:{o:1}}])).ok,false);
});

test('public grading controller pauses auto-run and releases lock on cancellation/exception', async () => {
  const c=sample(), changes=[];const state=structuredClone(getExecutionState(c));
  const runner=createTickRunner(c,{schedule:()=>1,cancel:()=>{}});runner.play();
  const grader=createGradingController({getPlayCircuit:()=>c,getLevelAnswer:()=>registerReference,
    getLevelBlockSet:()=>[{type:'INPUT',name:'x'},{type:'OUTPUT',name:'o'}],onScoringChange:value=>changes.push(value)});
  const work=grader.gradeLevel(1);assert.equal(grader.isScoring(),true);assert.equal(runner.isRunning(),false);
  grader.cancel();await work;assert.equal(grader.isScoring(),false);assert.deepEqual(changes,[true,false]);
  assert.deepEqual(getExecutionState(c),state);
  const broken=createGradingController({getPlayCircuit:()=>c,onScoringChange:value=>{if(value)throw Error('UI callback failed');}});
  await broken.gradeLevel(1);assert.equal(broken.isScoring(),false);assert.deepEqual(getExecutionState(c),state);runner.destroy();
});
