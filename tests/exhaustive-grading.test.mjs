import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeCircuit, newBlock, newWire } from '../src/canvas/model.js';
import { assignNewInputRole } from '../src/canvas/connections.js';
import { compileCircuit, evaluateCombinational, tickCircuit, previewCircuit, getExecutionState } from '../src/canvas/evaluation.js';
import { gradeCircuit, gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { createGradingController } from '../src/modules/grading.js';
import { getReferenceFSM, STAGE_REFERENCE_IDS } from '../src/modules/referenceFSM.js';
import { emptyProgress, validateProgress, makeRecord } from '../src/demo/records.js';
import { snapshotCircuit } from '../src/canvas/circuitData.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url)));

test('successful full-game grading records progress and opens results without extra rewards', async () => {
  const levels = read('levels.json');
  const c = read('tests/fixtures/demo/1-3.json').circuit;
  const events = [];
  const grader = createGradingController({
    getPlayCircuit: () => c,
    getLevelAnswer: id => levels.levelAnswers[id],
    getLevelBlockSet: id => levels.levelBlockSets[id],
    markLevelCleared: id => { events.push(['cleared', id]); },
    showClearedModal: id => { events.push(['results', id]); },
    onScoringChange: value => { events.push(['scoring', value]); }
  });
  await grader.gradeLevel(1);
  assert.deepEqual(events, [['scoring', true], ['cleared', 1], ['results', 1], ['scoring', false]]);
  assert.equal(grader.isScoring(), false);
  assert.equal(grader.consumePendingClearedLevel(), null);
});

function circuit(types, wires) {
  const c = makeCircuit();
  for (const [id, type] of Object.entries(types)) c.blocks[id] = newBlock({ id, type, name: id, pos: {r:0,c:0} });
  for (const [startBlockId, endBlockId] of wires) {
    const id = 'w' + Object.keys(c.wires).length, wire = newWire({ id, startBlockId, endBlockId, path: [] });
    assignNewInputRole(c, wire); c.wires[id] = wire;
  }
  return c;
}
const fsm = (evaluate, stateCount = 2) => ({mode:'sequential',reference:{inputs:['x'],outputs:['o'],initialState:0,stateCount,evaluate}});
const register = fsm((s,x)=>({outputs:s,nextState:x}));
const zero = fsm(()=>({outputs:0,nextState:0}),1);

test('exhaustive truth tables reject missing, duplicate, conflicting rows and malformed ports', () => {
  const c = circuit({x:'INPUT',o:'OUTPUT'},[['x','o']]);
  const table = [0,1].map(x=>({inputs:{x},expected:{o:x}}));
  assert.equal(gradeCircuitSync(c,table).ok,true);
  assert.equal(gradeCircuitSync(c,table.slice(0,1)).diagnostics[0].code,'INCOMPLETE_TRUTH_TABLE');
  assert.equal(gradeCircuitSync(c,[table[0],table[0]]).diagnostics[0].code,'DUPLICATE_TEST_INPUT');
  assert.equal(gradeCircuitSync(c,[table[0],{inputs:{x:0},expected:{o:1}}]).ok,false);
  assert.equal(gradeCircuitSync(c,[table[0],{inputs:{x:1},expected:{o:2}}]).diagnostics[0].code,'INVALID_TEST_ROW');
  c.blocks.extra = newBlock({id:'extra',type:'OUTPUT',name:'extra',pos:{r:0,c:0}});
  assert.equal(gradeCircuitSync(c,table).diagnostics[0].code,'PORT_MISMATCH');
  c.blocks.extra.name='o'; assert.equal(gradeCircuitSync(c,table).diagnostics[0].code,'PORT_MISMATCH');
  delete c.blocks.extra; c.blocks.x.name='wrong';
  assert.equal(gradeCircuitSync(c,table).diagnostics[0].code,'PORT_MISMATCH');
});

test('problem mode selects the algorithm, including sequential submissions without D', () => {
  const c = circuit({x:'INPUT',o:'OUTPUT'},[['x','o']]);
  const result = gradeCircuitSync(c,register);
  assert.equal(result.status,'fail'); assert.deepEqual(result.counterexample,{ticks:[],observe:{x:1}});
  assert.equal(gradeCircuitSync(c,fsm((_s,x)=>({outputs:x,nextState:0}),1)).ok,true);
  assert.equal(gradeCircuitSync(c,{mode:'sequential',sequences:[{rows:[]}]}).diagnostics[0].code,'REFERENCE_REQUIRED');
  const memory = circuit({x:'INPUT',d:'D',o:'OUTPUT'},[['x','d'],['d','o']]);
  assert.equal(gradeCircuitSync(memory,[0,1].map(x=>({inputs:{x},expected:{o:x}}))).diagnostics[0].code,'MEMORY_NOT_ALLOWED');
});

test('product search detects hidden user history missed by representative reference paths', () => {
  const c = circuit({x:'INPUT',a:'D',b:'D',d:'D',ab:'AND',and:'AND',o:'OUTPUT'},
    [['x','a'],['a','b'],['b','d'],['a','ab'],['b','ab'],['ab','and'],['d','and'],['and','o']]);
  // The reference has one state: traces []/[0]/[1] all see zero. Three
  // consecutive ones reach a different user state paired with that SAME state.
  const result = gradeCircuitSync(c,zero);
  assert.equal(result.status,'fail');
  assert.deepEqual(result.counterexample,{ticks:[{x:1},{x:1},{x:1}],observe:{x:0}});
  const replay = compileCircuit(c).compiled.createEvaluator(); let state=0;
  for (const input of result.counterexample.ticks) state=replay.evaluate(state,input.x).nextState;
  assert.equal(replay.evaluate(state,result.counterexample.observe.x).outputs,1);
});

test('equivalent circuits may use redundant and unrelated internal memory', () => {
  const c = circuit({x:'INPUT',a:'D',b:'D',t:'D',n:'NOT',or:'OR',o:'OUTPUT'},
    [['x','a'],['x','b'],['a','or'],['b','or'],['or','o'],['t','n'],['n','t']]);
  const result=gradeCircuitSync(c,register);
  assert.equal(result.ok,true); assert.equal(result.states,4);
  assert.deepEqual(gradeCircuitSync(c,register,{denseLimit:1}),result);
});

test('FIFO search returns the fewest ticks and ignores unreachable mismatches', () => {
  const c=circuit({x:'INPUT',o:'OUTPUT'},[]);
  const branching=fsm((s,x)=>({outputs:Number(s>=2),nextState:s===0?(x?1:2):s===1?3:s}),4);
  assert.deepEqual(gradeCircuitSync(c,branching).counterexample,{ticks:[{x:0}],observe:{x:0}});
  const unreachable=fsm(s=>({outputs:s,nextState:s}));
  assert.equal(gradeCircuitSync(c,unreachable).ok,true);
});

test('sparse product keys safely exceed signed 32-bit range; unsupported state width is incomplete', () => {
  const types={x:'INPUT',o:'OUTPUT'}, edges=[];
  for(let i=0;i<30;i++) {types['d'+i]='D';edges.push([i===29?'x':'d'+i,'d'+i]);}
  edges.push(['d29','o']);
  const c=circuit(types,edges);
  const encoded=fsm((s,x)=>({outputs:s>>>1,nextState:x<<1}),4);
  assert.equal(gradeCircuitSync(c,encoded).ok,true);
  c.blocks.extra=newBlock({id:'extra',type:'D',pos:{r:0,c:0}});
  c.wires.extra=newWire({id:'extra',startBlockId:'extra',endBlockId:'extra',inputRole:'D',path:[]});
  assert.equal(gradeCircuitSync(c,register).status,'incomplete');
});

test('budgets never award a pass or report an output mismatch', () => {
  const c=circuit({x:'INPUT',d:'D',o:'OUTPUT'},[['x','d'],['d','o']]);
  for(const options of [{maxStates:1},{maxTransitions:3}]) {
    const result=gradeCircuitSync(c,register,options);
    assert.equal(result.ok,false);assert.equal(result.status,'incomplete');assert.equal(result.counterexample,undefined);
  }
  const malformed=fsm(()=>({outputs:0,nextState:2}));
  assert.equal(gradeCircuitSync(c,malformed).diagnostics[0].code,'INVALID_REFERENCE_RESULT');
  const redundant=circuit({x:'INPUT',d:'D',n:'NOT',o:'OUTPUT'},[['d','n'],['n','d']]);
  assert.equal(gradeCircuitSync(redundant,zero,{maxTransitions:3}).reason,'TRANSITION_LIMIT');
});

test('async search yields to real cancellation events and does not mutate editor state', async () => {
  const c=circuit({x:'INPUT',d:'D',o:'OUTPUT'},[['x','d'],['d','o']]);
  c.blocks.x.value=true;tickCircuit(c);
  const design=structuredClone(c), state=structuredClone(getExecutionState(c)), abort=new AbortController();
  const work=gradeCircuit(c,register,{signal:abort.signal,chunkSize:1});
  setTimeout(()=>abort.abort(),0);
  assert.equal((await work).status,'cancelled');
  assert.deepEqual(c,design);assert.deepEqual(getExecutionState(c),state);
});

test('compiled plans detach from edits and retain binary/empty/first-input gate semantics', () => {
  const c=circuit({x:'INPUT',y:'INPUT',z:'INPUT',a:'AND',or:'OR',n:'NOT',empty:'AND',o:'OUTPUT'},
    [['x','a'],['y','a'],['x','or'],['y','or'],['x','n'],['y','n'],['a','o']]);
  const compiled=compileCircuit(c).compiled, evaluator=compiled.createEvaluator();
  for(let input=0;input<8;input++) {
    const inputs=new Map(compiled.inputIds.map((id,i)=>[id,Boolean(input&(1<<i))]));
    const values=evaluateCombinational(c,{inputs}).values;
    assert.equal(values.get('a'),(input&3)===3);assert.equal(values.get('or'),(input&3)!==0);
    assert.equal(values.get('n'),!(input&1));assert.equal(values.get('empty'),true);
    assert.equal(evaluator.evaluate(0,input).outputs,Number((input&3)===3));
  }
  c.blocks.a.type='OR';
  assert.equal(evaluator.evaluate(0,1).outputs,0);
  assert.equal(compileCircuit(c).compiled.createEvaluator().evaluate(0,1).outputs,1);
});

test('all shipped FSM references pass and numeric compilation agrees with map state updates', () => {
  const levels=read('levels.json');
  for(const [id,referenceId] of Object.entries(STAGE_REFERENCE_IDS)) {
    const c=read(`tests/fixtures/${Number(id)>=32?'stages':'demo'}/${id}-3.json`).circuit;
    assert.deepEqual(levels.levelAnswers[id],{mode:'sequential',referenceId});
    assert.equal(gradeCircuitSync(c,levels.levelAnswers[id]).ok,true,`stage ${id}`);
    const compiled=compileCircuit(c).compiled, evaluator=compiled.createEvaluator();
    for(let state=0;state<2**compiled.memoryIds.length;state++) for(let input=0;input<2**compiled.inputIds.length;input++) {
      const inputs=new Map(compiled.inputIds.map((id,i)=>[id,Boolean(input&(1<<i))]));
      const memory=new Map(compiled.memoryIds.map((id,i)=>[id,Boolean(state&(1<<i))]));
      const before=evaluateCombinational(c,{inputs,memory}), result=evaluator.evaluate(state,input);
      assert.equal(result.outputs,compiled.outputIds.reduce((n,id,i)=>n|(Number(before.values.get(id))<<i),0));
      const execution={memory,tick:0};tickCircuit(c,execution,{inputs,display:false});
      assert.equal(result.nextState,compiled.memoryIds.reduce((n,id,i)=>n|(Number(execution.memory.get(id))<<i),0));
    }
  }
});

test('legacy rising edge remains visible between ticks and disappears after sampling', () => {
  const c=read('tests/fixtures/legacy-memory/31.json').circuit;
  c.blocks.SIGNAL.value=false;previewCircuit(c);assert.equal(c.blocks.RISE.value,false);
  c.blocks.SIGNAL.value=true;previewCircuit(c);assert.equal(c.blocks.RISE.value,true);
  tickCircuit(c);assert.equal(c.blocks.RISE.value,false);
  c.blocks.SIGNAL.value=false;previewCircuit(c);assert.equal(c.blocks.RISE.value,false);
  c.blocks.SIGNAL.value=true;previewCircuit(c);assert.equal(c.blocks.RISE.value,false); // No intervening tick stored 0.
  assert.equal(getReferenceFSM('rising-edge').evaluate(0,1).outputs,1);
});

test('legacy clears failing the new timing contract retain recoverable circuits without losing other progress', () => {
  const levels=read('levels.json'), raw=emptyProgress();delete raw.gradingVersion;
  const good=makeRecord(read('tests/fixtures/demo/1-3.json').circuit,1,levels,{});
  raw.stages[1]={best:good,bestStars:good};
  const c=read('tests/fixtures/legacy-memory/31.json').circuit;
  raw.stages[31]={best:{circuitVersion:3,circuit:c},bestStars:{circuitVersion:3,circuit:c}};
  const migrated=validateProgress(raw,levels,{},[]);
  assert.ok(migrated.stages[1].best);assert.equal(migrated.stages[31].best,undefined);
  assert.equal(migrated.stages[31].legacyStageRecords.length,1);
  assert.deepEqual(migrated.stages[31].legacyStageRecords[0].best.circuit,snapshotCircuit(c));
  assert.equal(migrated.stages[31].draft,undefined);
  assert.ok(migrated.unlockedStages.includes(31));
  assert.deepEqual(validateProgress(migrated,levels,{},[]),migrated);
});
