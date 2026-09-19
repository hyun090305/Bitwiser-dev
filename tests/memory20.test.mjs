import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MEMORY20_IDS,getMemory20Reference} from '../src/modules/memory20References.js';
import {gradeCircuitSync,gradeCircuit} from '../src/modules/circuitGrading.js';
import {compileCircuit,createExecutionState,tickCircuit} from '../src/canvas/evaluation.js';
import {validateStageCircuit} from '../src/modules/stageCircuit.js';
import {judgeDivision} from '../src/modules/dividerGrading.js';
import {createTracePlayback} from '../src/canvas/tracePlayback.js';
import {emptyProgress,validateProgress} from '../src/demo/records.js';
import {createDemoStore,SAVE_KEY} from '../src/demo/store.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const levels=read('levels.json'),en=read('levels_en.json');
const fixture=id=>read(`tests/fixtures/memory20/${id}.json`).circuit;

test('20 supplied circuits have playable, bilingual, physically legal final definitions',()=>{
  const catalog=read('docs/handoff-20/catalog.json');
  assert.equal(catalog.length,20);assert.equal(new Set(Object.values(MEMORY20_IDS)).size,20);
  for(const entry of catalog) {
    const id=MEMORY20_IDS[entry.slot],c=fixture(id);
    assert.equal(levels.levelFixedIO[id].fixIO,false);
    assert.ok(Object.values(c.blocks).every(b=>!b.fixed));
    assert.ok(c.rows>=6&&c.cols>=6);
    const points=[...Object.values(c.blocks).map(b=>b.pos),...Object.values(c.wires).flatMap(w=>w.path)];
    assert.ok(points.every(p=>p.r>=1&&p.c>=1&&p.r<c.rows-1&&p.c<c.cols-1),'room around the solution');
    const previous=levels.levelPreviousLayouts[id][0].levelGridSizes;
    assert.ok(c.rows*c.cols<previous[0]*previous[1],`smaller board ${entry.slot}`);
    for(const key of ['levelAnswers','levelBlockSets','levelFixedIO','levelGridSizes','levelRevisions'])assert.deepEqual(levels[key][id],en[key][id]);
    for(const data of [levels,en]) {
      validateStageCircuit(c,id,data);
      assert.ok(data.levelDescriptions[id].desc);assert.ok(data.levelHints[`stage${id}`].hints[0].content);
    }
    assert.deepEqual(Object.values(c.blocks).filter(b=>b.type==='INPUT').map(b=>b.name),entry.inputs);
    assert.deepEqual(Object.values(c.blocks).filter(b=>b.type==='OUTPUT').map(b=>b.name),entry.outputs);
    assert.equal(Object.values(c.blocks).filter(b=>b.type!=='JUNCTION').length,entry.blocks);
    assert.ok(Object.values(c.blocks).every(b=>['INPUT','OUTPUT','AND','OR','NOT','D','JUNCTION'].includes(b.type)));
    assert.equal(gradeCircuitSync(c,levels.levelAnswers[id]).ok,true,entry.slot);
    for(const row of levels.levelDescriptions[id].table)assert.ok([...entry.inputs,...entry.outputs].every(name=>Object.hasOwn(row,name)),`example ports ${entry.slot}`);
    if(id!==46)assert.equal(getMemory20Reference(entry.slot).observeAt,'after_tick');
  }
});

test('game tick engine agrees with all 5,782 independently verified Python transitions',()=>{
  let comparisons=0;
  for(const group of read('docs/handoff-20/tests/exhaustive_transitions.json')) {
    const c=fixture(MEMORY20_IDS[group.slot]);
    const outputIds=group.outputs.map(name=>Object.values(c.blocks).find(b=>b.type==='OUTPUT'&&b.name===name).id);
    for(const [before,input,after,expected] of group.transitions) {
      const state=createExecutionState(c,{memory:Object.fromEntries(group.memories.map((name,i)=>[name,Boolean(before[i])]))});
      const result=tickCircuit(c,state,{inputs:new Map(group.inputs.map((name,i)=>[name,Boolean(input[i])])),display:false});
      assert.equal(result.ok,true,group.slot);
      assert.deepEqual(group.memories.map(name=>Number(state.memory.get(name))),after,group.slot);
      assert.deepEqual(outputIds.map(id=>Number(result.values.get(id))),expected,group.slot);comparisons++;
    }
  }
  assert.equal(comparisons,5782);
});

test('acceptance sequences cover history, simultaneous requests, idle data holds and pulses',()=>{
  for(const example of read('docs/handoff-20/tests/acceptance_examples.json')) {
    const c=fixture(MEMORY20_IDS[example.slot]),state=createExecutionState(c);
    for(const row of example.trace) {
      const result=tickCircuit(c,state,{inputs:new Map(Object.entries(row.inputs).map(([id,v])=>[id,Boolean(v)])),display:false});
      const outputs=Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='OUTPUT').map(b=>[b.name,Number(result.values.get(b.id))]));
      assert.deepEqual(outputs,row.outputs,`${example.slot}: ${example.label||''}, tick ${row.tick}`);
    }
  }
});

test('divider accepts first completion at every tick 1..10, rejects 11, wrong first values and no COMPLETE',()=>{
  const correct={Q0:0,Q1:1,Q2:0,R0:1,R1:0};
  for(let finish=1;finish<=11;finish++) {
    let t=0;
    const r=judgeDivision(inputs=>{assert.deepEqual(inputs,{A0:1,A1:1,A2:1,B0:1,B1:1});t++;return {...correct,COMPLETE:Number(t===finish)};},7,3);
    assert.equal(r.ok,finish<=10);assert.equal(t,Math.min(finish,10));
  }
  let calls=0;
  const wrong=judgeDivision(()=>{calls++;return {...correct,Q0:Number(calls===1),COMPLETE:1};},7,3);
  assert.equal(wrong.reason,'wrong_first_complete');assert.equal(calls,1);
  assert.equal(judgeDivision(()=>({...correct,COMPLETE:0}),7,3).reason,'completion_timeout');
  assert.throws(()=>judgeDivision(()=>correct,7,0),/domain/);
});

// A deliberately different solution: combinational quotient/remainder lookup,
// with zero or many redundant D blocks used only to delay COMPLETE.
function combinationalDivider(delay=0) {
  const c={rows:1,cols:1,blocks:{},wires:{}};let serial=0;
  const node=(type,inputs=[],name)=>{
    const id=name||`n${serial++}`;c.blocks[id]={id,type,name:id,pos:{r:0,c:0},value:false};
    inputs.forEach(from=>{const wire=`w${serial++}`;c.wires[wire]={id:wire,startBlockId:from,endBlockId:id,path:[],...(type==='D'?{inputRole:'D'}:{})};});return id;
  };
  const inputs=['A0','A1','A2','B0','B1'].map(n=>node('INPUT',[],n)),inverse=inputs.map(n=>node('NOT',[n]));
  const one=node('OR',[inputs[0],inverse[0]]),zero=node('AND',[inputs[0],inverse[0]]);
  const terms=Array.from({length:32},(_,mask)=>inputs.map((n,i)=>mask&(1<<i)?n:inverse[i]).reduce((a,b)=>node('AND',[a,b])));
  for(const [i,name] of ['Q0','Q1','Q2','R0','R1'].entries()) {
    const selected=terms.filter((_,mask)=>{const a=mask&7,b=mask>>>3;if(!b)return false;return i<3?(Math.floor(a/b)>>>i)&1:((a%b)>>>(i-3))&1;});
    node('OUTPUT',[selected.length?selected.reduce((a,b)=>node('OR',[a,b])):zero],name);
  }
  let complete=one;for(let i=0;i<delay;i++)complete=node('D',[complete]);node('OUTPUT',[complete],'COMPLETE');
  return c;
}

test('integrated divider judge permits combinational answers, arbitrary delay, and ignores tick 0',async()=>{
  for(const delay of [0,1,2,8,9,10,11]) {
    const c=combinationalDivider(delay),result=gradeCircuitSync(c,levels.levelAnswers[46]);
    assert.equal(result.ok,delay<=10,`delay ${delay}`);
    if(result.ok){assert.equal(result.total,24);assert.ok(result.results.every(r=>r.tick===Math.max(1,delay)));}
    else assert.equal(result.reason,'completion_timeout');
  }
  const c=fixture(46),before=structuredClone(c),result=await gradeCircuit(c,levels.levelAnswers[46]);
  assert.equal(result.ok,true);assert.equal(result.total,24);assert.equal(result.transitions,108);assert.deepEqual(c,before);
  assert.equal(gradeCircuitSync(c,levels.levelAnswers[46],{maxTransitions:1}).status,'incomplete');
  const controller=new AbortController();
  const cancelled=await gradeCircuit(c,levels.levelAnswers[46],{signal:controller.signal,onProgress:()=>controller.abort()});
  assert.equal(cancelled.status,'cancelled');
});

test('divider failures replay only specified observations, retaining the first completion rule',()=>{
  const c=combinationalDivider(11),result=gradeCircuitSync(c,levels.levelAnswers[46]);
  const playback=createTracePlayback(c,result.trace);playback.start();let step;
  while((step=playback.step()))if(step.event.type==='expect')for(const output of step.event.outputs)assert.equal(Number(c.blocks[output.blockId].value),output.actual);
  playback.restore();
  assert.deepEqual(result.trace.at(-1).outputs.map(o=>o.signal),['COMPLETE']);
  const wrong=fixture(46);const out=Object.values(wrong.blocks).find(b=>b.type==='OUTPUT'&&b.name==='Q0');
  Object.values(wrong.wires).find(w=>w.endBlockId===out.id).startBlockId='A0';
  assert.equal(gradeCircuitSync(wrong,levels.levelAnswers[46]).reason,'wrong_first_complete');
});

test('changed boards archive all old designs and retain unrelated progress across reload/export',()=>{
  const old=emptyProgress();old.gradingVersion=2;old.lastStageId=29;
  for(const id of [25,29,31]) {
    const circuit=read(`tests/fixtures/legacy-memory/${id}.json`).circuit;
    const record={circuitVersion:3,circuit,stars:2};old.stages[id]={draft:record,best:record,bestStars:record};
  }
  const storage=new Map([[SAVE_KEY,JSON.stringify(old)]]),adapter={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  const store=createDemoStore({storage:adapter,levels,budgets:{},themeIds:[],onFailure:error=>{throw error;}});
  for(const id of [25,29,31]) {
    assert.equal(store.state.stages[id].best,undefined);
    assert.equal(store.state.stages[id].legacyStageRecords[0].best.circuit.blocks[Object.keys(old.stages[id].best.circuit.blocks)[0]].id,Object.keys(old.stages[id].best.circuit.blocks)[0]);
    assert.ok(store.isUnlocked(id));
  }
  store.setDraft(29,fixture(29));
  const exported=JSON.parse(store.exportBackup());
  assert.deepEqual(validateProgress(exported,levels,{},[]),exported);
  assert.deepEqual(createDemoStore({storage:adapter,levels,budgets:{},themeIds:[]}).state,exported);
  const legacyOnly=emptyProgress();legacyOnly.gradingVersion=2;legacyOnly.lastStageId=31;
  legacyOnly.stages[31]={legacyResults:[old.stages[31].best]};
  const migrated=validateProgress(legacyOnly,levels,{},[]);
  assert.equal(migrated.stages[31].legacyStageRecords[0].legacyResults.length,1);
  assert.ok(migrated.unlockedStages.includes(31));
  assert.deepEqual(validateProgress(migrated,levels,{},[]),migrated);
  // Layout changes also preserve drafts saved with the current grading version.
  const definition=levels.levelPreviousLayouts[25][0],[rows,cols]=definition.levelGridSizes;
  const prior={rows,cols,blocks:Object.fromEntries(definition.levelFixedIO.grid.map((b,i)=>[
    `old${i}`,{id:`old${i}`,type:b.type,name:b.name,fixed:true,value:false,inputMode:b.inputMode,pos:{r:Math.floor(b.index/cols),c:b.index%cols}}
  ])),wires:{}};
  const sameVersion=emptyProgress();sameVersion.unlockedStages=[25];sameVersion.lastStageId=25;
  sameVersion.stages[25]={draft:{circuitVersion:3,circuit:prior}};
  const compacted=validateProgress(sameVersion,levels,{},[]);
  assert.equal(compacted.stages[25].draft,undefined);
  assert.equal(compacted.stages[25].legacyStageRecords[0].draft.circuit.rows,rows);
  assert.deepEqual(validateProgress(compacted,levels,{},[]),compacted);
});

test('unrelated stages including the combinational 2x2 multiplier retain their exact definitions',()=>{
  for(const [id,hash] of Object.entries(read('tests/fixtures/legacy-memory/unchanged-hashes.json'))) {
    const data=Object.fromEntries(Object.entries(levels).filter(([k])=>k!=='levelPreviousLayouts').map(([k,v])=>[k,v[k==='levelHints'?'stage'+id:id]]));
    assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'),hash,`stage ${id}`);
  }
});
