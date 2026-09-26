import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradeCircuit, gradeCircuitSync, GRADING_VERSION } from '../src/modules/circuitGrading.js';
import { getReferenceFSM } from '../src/modules/referenceFSM.js';
import { MEMORY20_IDS } from '../src/modules/memory20References.js';
import { getExecutionState, tickCircuit, previewCircuit } from '../src/canvas/evaluation.js';
import { createTracePlayback } from '../src/canvas/tracePlayback.js';
import { automaticDoorShortcut, responseCheckShortcut, registeredAddressMemory, memoryFixture,
  dataChangeShortcut, riseInputShortcut, initialOutputShortcut, writeInputShortcut } from './helpers/sequential-observation-circuits.mjs';

const levels = JSON.parse(fs.readFileSync(new URL('../levels.json', import.meta.url)));
const answer = id => levels.levelAnswers[id];
const reference = id => getReferenceFSM(answer(id).referenceId);
const ids = Object.values(MEMORY20_IDS).filter(id=>id!==46);
const policies = {25:['LOAD'],28:['ACK'],29:['A','B'],30:['OPEN'],32:['INC','DEC'],33:[],34:['START'],37:['SUBMIT'],
  38:['WRITE'],39:['SAVE','UNDO'],40:['SEND','TAKE'],41:['PUSH','POP'],42:['PUSH','POP'],43:['RECEIVE'],45:['ADD','RESET']};
const set = (c, inputs) => { for(const b of Object.values(c.blocks))if(b.type==='INPUT'&&Object.hasOwn(inputs,b.name))b.value=Boolean(inputs[b.name]);previewCircuit(c); };
const outputs = c => Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='OUTPUT').map(b=>[b.name,Number(b.value)]));
const vector = (ref,mask) => Object.fromEntries(ref.inputs.map((name,i)=>[name,(mask>>>i)&1]));

test('all 19 visible references use trusted stage buttons; legacy contracts remain separate',()=>{
  assert.equal(GRADING_VERSION,6);
  for(const id of ids) {
    const ref=reference(id);assert.equal(ref.observationMode,'visible');assert.deepEqual(ref.releaseButtons,policies[id]||[]);
    assert.deepEqual([...ref.releaseButtons].sort(),levels.levelBlockSets[id].filter(b=>b.type==='INPUT'&&b.inputMode==='button').map(b=>b.name).sort());
    assert.equal(typeof ref.step,'function');assert.equal(typeof ref.observe,'function');
  }
  for(const id of ['toggle-light','lab-register','lab-enabled-register','automatic-door','memory20:C5-04']) {
    const ref=getReferenceFSM(id);assert.equal(ref.observationMode,undefined);assert.equal(ref.releaseButtons,undefined);
  }
});

test('19 normal circuits pass initial, every input vector and completed ticks identically in sync/async',async()=>{
  for(const id of ids) {
    const c=memoryFixture(id);tickCircuit(c);
    const before=structuredClone(c),execution=structuredClone(getExecutionState(c)),result=gradeCircuitSync(c,answer(id));
    assert.equal(result.status,'pass','stage '+id);assert.equal(result.checks,1+2*result.transitions);
    assert.deepEqual(await gradeCircuit(c,answer(id)),result);
    assert.deepEqual(c,before);assert.deepEqual(getExecutionState(c),execution);
  }
});

const counterexamples=[
  [30,automaticDoorShortcut,'after_set'],[29,responseCheckShortcut,'after_tick'],[38,registeredAddressMemory,'after_set'],
  [25,dataChangeShortcut,'after_set'],[31,riseInputShortcut,'after_set'],[25,initialOutputShortcut,'initial'],[38,writeInputShortcut,'after_set']
];
for(const [id,factory,phase] of counterexamples)test(factory.name+': reject, replay exact observations and restore',async()=>{
  const c=factory();tickCircuit(c);previewCircuit(c);
  const before=structuredClone(c),state=structuredClone(getExecutionState(c)),result=gradeCircuitSync(c,answer(id));
  assert.equal(result.status,'fail');assert.equal(result.observation,phase);assert.deepEqual(await gradeCircuit(c,answer(id)),result);
  assert.deepEqual(c,before);assert.deepEqual(getExecutionState(c),state);
  assert.ok(result.trace.every(e=>!['after_release','address_read'].includes(e.observation)));
  const playback=createTracePlayback(c,result.trace);playback.start();
  for(const event of result.trace) {
    const previous=structuredClone(getExecutionState(c)),step=playback.step();
    if(event.type==='set'||event.type==='expect')assert.deepEqual(getExecutionState(c),previous);
    if(event.type==='tick') {
      assert.equal(event.tickMode,'visible');
      for(const input of event.releaseInputs)assert.equal(c.blocks[input.blockId].value,false);
    }
    if(event.type==='expect')for(const output of event.outputs)assert.equal(Number(c.blocks[output.blockId].value),output.actual);
    if(event===result.trace.at(-1)) {
      assert.deepEqual(outputs(c),result.actual);assert.ok(step.highlight.blocks.some(b=>!b.passed));
      assert.deepEqual(Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='INPUT').map(b=>[b.name,Number(b.value)])),result.inputs);
    }
  }
  assert.equal(getExecutionState(c).tick,result.trace.filter(e=>e.type==='tick').length);
  playback.restore();assert.deepEqual(c,before);assert.deepEqual(getExecutionState(c),state);
});

test('submitted input modes cannot bypass trusted release or SET observations',()=>{
  for(const [id,factory] of [[29,responseCheckShortcut],[30,automaticDoorShortcut]]) {
    const c=factory(),expected=gradeCircuitSync(c,answer(id));
    for(const b of Object.values(c.blocks))if(b.type==='INPUT')b.inputMode='switch';
    assert.deepEqual(gradeCircuitSync(c,answer(id)),expected);
    const playback=createTracePlayback(c,expected.trace);playback.start();while(playback.step()){}
    assert.deepEqual(outputs(c),expected.actual);playback.restore();
  }
});

test('initial observations include nonzero EMPTY and first-tick input changes',()=>{
  for(const id of ids) {
    const ref=reference(id),c=memoryFixture(id);previewCircuit(c);
    const initial=Object.fromEntries(ref.outputs.map(name=>[name,name==='EMPTY'?1:0]));
    assert.deepEqual(outputs(c),initial,'initial '+id);
    assert.equal(ref.observe(ref.initialState,0),ref.outputs.reduce((n,name,i)=>n|(initial[name]<<i),0));
  }
  const result=gradeCircuitSync(initialOutputShortcut(),answer(25));
  assert.equal(result.transitions,0);assert.deepEqual(result.trace.map(e=>e.type),['init','expect']);
  assert.equal(gradeCircuitSync(dataChangeShortcut(),answer(25)).counterexample.ticks.length,0);
  assert.equal(gradeCircuitSync(writeInputShortcut(),answer(38)).inputs.WRITE,1);
});

test('pulses survive every input vector until a real tick, with GO distinct from initial state',()=>{
  for(const [id,history,pulse] of [[31,[1],'RISE'],[29,[3],'GO'],[43,[2,2,2,2],'DONE'],[44,[16],'VALID'],
    [41,[3,4],'VALID'],[42,[3,4],'VALID'],[40,[2],'ACCEPTED'],[40,[2,4],'VALID']]) {
    const ref=reference(id),c=memoryFixture(id);let state=ref.initialState;
    for(const input of history){set(c,vector(ref,input));tickCircuit(c);state=ref.step(state,input);}
    const snapshot=structuredClone(getExecutionState(c));
    for(let input=0;input<2**ref.inputs.length;input++) {
      set(c,vector(ref,input));assert.equal(outputs(c)[pulse],1,id+'/'+input);
      assert.equal((ref.observe(state,input)>>>ref.outputs.indexOf(pulse))&1,1);assert.deepEqual(getExecutionState(c),snapshot);
    }
  }
  const go=reference(29),raised=go.step(go.initialState,3);
  assert.notEqual(raised,go.initialState);assert.equal(go.observe(go.initialState,3),0);assert.equal(go.observe(raised,0),1);
  assert.equal(go.observe(go.step(raised,0),0),0);
});

test('LEVEL changes immediately use the current phase without advancing time',()=>{
  const c=memoryFixture(33),ref=reference(33);let state=ref.initialState;
  for(let phase=0;phase<4;phase++) {
    const snapshot=structuredClone(getExecutionState(c));
    for(let input=0;input<4;input++){
      set(c,vector(ref,input));assert.equal(outputs(c).LIGHT,Number(phase<(input&3)));
      assert.equal(ref.observe(state,input),Number(phase<(input&3)));assert.deepEqual(getExecutionState(c),snapshot);
    }
    tickCircuit(c);state=ref.step(state,3);
  }
});

test('address/data changes read stored words with WRITE off or on, before and after writes',()=>{
  const c=memoryFixture(38),ref=reference(38);let state=ref.initialState;
  const inspect=words=>{
    const snapshot=structuredClone(getExecutionState(c));
    for(const ADDR of [0,1,0,1])for(const WRITE of [0,1])for(let data=0;data<4;data++){
      set(c,{ADDR,WRITE,D0:data&1,D1:data>>>1});
      assert.deepEqual(outputs(c),{Q0:words[ADDR]&1,Q1:words[ADDR]>>>1});
      assert.equal(ref.observe(state,data|(ADDR<<2)|(WRITE<<3)),words[ADDR]);assert.deepEqual(getExecutionState(c),snapshot);
    }
  };
  inspect([0,0]);set(c,{ADDR:0,WRITE:1,D0:1,D1:0});tickCircuit(c);state=ref.step(state,9);inspect([1,0]);
  set(c,{ADDR:1,WRITE:1,D0:0,D1:1});tickCircuit(c);state=ref.step(state,14);inspect([1,2]);
  const reversed=registeredAddressMemory();reversed.blocks=Object.fromEntries(Object.entries(reversed.blocks).reverse());
  assert.equal(gradeCircuitSync(reversed,answer(38)).status,'fail');
});

test('repeated, simultaneous and renewed requests use only actual ticks',()=>{
  for(const [id,histories] of [[30,[[1,0,0,0],[1,0,1,0,0,0],[1,1,1,1,0,0,0]]],[29,[[3,3,3,0],[1,0,2,0],[2,1,3,0,0]]]])for(const history of histories){
    const c=memoryFixture(id),ref=reference(id);let state=ref.initialState;
    for(const input of history){
      set(c,vector(ref,input));assert.equal(tickCircuit(c).ok,true);state=ref.step(state,input);
      assert.deepEqual(outputs(c),Object.fromEntries(ref.outputs.map((name,i)=>[name,(ref.observe(state,0)>>>i)&1])));
      assert.ok(Object.values(c.blocks).filter(b=>b.type==='INPUT').every(b=>!b.value));
    }
    assert.equal(getExecutionState(c).tick,history.length);
  }
});

test('initial/SET/completed-tick observations share cancellation, time and work limits',async t=>{
  for(const phase of ['initial','after_set','after_tick']){
    const controller=new AbortController();
    const result=await gradeCircuit(memoryFixture(30),answer(30),{signal:controller.signal,chunkSize:1,onProgress:p=>{if(p.phase===phase)controller.abort();}});
    assert.equal(result.status,'cancelled');assert.equal(result.ok,false);
  }
  const limited=gradeCircuitSync(memoryFixture(30),answer(30),{maxTransitions:16});
  assert.equal(limited.status,'incomplete');assert.equal(limited.reason,'TRANSITION_LIMIT');assert.equal(limited.checks,16);assert.equal(limited.transitions,7);
  let now=0;t.mock.method(performance,'now',()=>now);
  for(const [c,id,phase] of [[memoryFixture(30),30,'after_tick'],[automaticDoorShortcut(),30,'after_set'],[initialOutputShortcut(),25,'initial']]){
    now=0;
    const result=await gradeCircuit(c,answer(id),{chunkSize:1,maxMilliseconds:10,onProgress:p=>{if(p.phase===phase)now=11;}});
    assert.equal(result.status,'incomplete');assert.equal(result.reason,'TIME_LIMIT');
  }
});

test('invalid visible definitions cannot pass or silently fall back to legacy semantics',()=>{
  const base=reference(38);
  for(const change of [{releaseButtons:['MISSING']},{releaseButtons:['WRITE','WRITE']},{releaseButtons:undefined},
    {observeAt:'before_tick'},{observationMode:'unknown'},{observe:undefined},{step:undefined}]){
    assert.equal(gradeCircuitSync(memoryFixture(38),{mode:'sequential',reference:{...base,...change}}).status,'invalid');
  }
  for(const change of [{observe:()=>4},{step:()=>base.stateCount}])assert.equal(
    gradeCircuitSync(memoryFixture(38),{mode:'sequential',reference:{...base,...change}}).diagnostics[0].code,'INVALID_REFERENCE_RESULT');
});
