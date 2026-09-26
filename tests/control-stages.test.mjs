import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { getReferenceFSM, STAGE_REFERENCE_IDS } from '../src/modules/referenceFSM.js';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { getExecutionState, getEvaluationResult, previewCircuit, tickCircuit } from '../src/canvas/evaluation.js';
import { createTracePlayback } from '../src/canvas/tracePlayback.js';
import { snapshotCircuit } from '../src/canvas/circuitData.js';
import { validateStageCircuit } from '../src/modules/stageCircuit.js';
import { makeCostRecord, isCurrentCostRecord, createCostStore } from '../src/modules/costRecords.js';
import { emptyProgress, validateProgress } from '../src/demo/records.js';
import { createDemoStore, SAVE_KEY } from '../src/demo/store.js';
import { DEMO_IDS } from '../src/demo/catalog.js';
import { stageById, canPlayStage } from '../src/modules/stageCatalog.js';
import { beforeChapterStars } from './helpers/chapter-stars.mjs';

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const levels = read('levels.json'), en = read('levels_en.json');
const baseline = read('tests/fixtures/legacy-memory/control-stage-contracts.json');
const fixture = id => read(`tests/fixtures/memory20/${id}.json`).circuit;
const ref = id => getReferenceFSM(levels.levelAnswers[id].referenceId);
const outputs = c => Object.values(c.blocks).filter(b => b.type === 'OUTPUT').map(b => Number(b.value));
function set(c, reference, mask) {
  for (const b of Object.values(c.blocks)) if (b.type === 'INPUT') b.value = Boolean(mask & (1 << reference.inputs.indexOf(b.name)));
  previewCircuit(c); assert.equal(getEvaluationResult(c).ok, true);
}
function run(id, masks) {
  const c = fixture(id), reference = ref(id), results = [];
  let state = reference.initialState;
  previewCircuit(c);
  assert.deepEqual(outputs(c), reference.outputs.map(() => 0));
  for (const mask of masks) {
    const before = structuredClone(getExecutionState(c));
    set(c, reference, mask);
    assert.deepEqual(getExecutionState(c), before, 'SET does not advance memory or time');
    const visible = reference.observe(state, mask);
    assert.deepEqual(outputs(c), reference.outputs.map((_, i) => (visible >>> i) & 1));
    assert.equal(tickCircuit(c).ok, true);
    state = reference.step(state, mask);
    const released = reference.inputs.reduce((n, name, i) => reference.releaseButtons.includes(name) ? n & ~(1 << i) : n, mask);
    assert.deepEqual(outputs(c), reference.outputs.map((_, i) => (reference.observe(state, released) >>> i) & 1));
    for (const name of reference.releaseButtons) assert.equal(Object.values(c.blocks).find(b => b.name === name).value, false);
    results.push(outputs(c).reduce((n, b, i) => n | (b << i), 0));
  }
  return results;
}

test('AC-1/2/4/7/8/11: bilingual ports, revisions, physical solutions and unchanged access', () => {
  const cases = [
    [32,'양방향 카운터','Up/Down Counter',['INC','DEC'],['BIT0','BIT1'],'up-down-counter-no-reset','up_down_counter'],
    [33,'점등 시간 조절','Light Timing',['LEVEL0','LEVEL1'],['LIGHT'],'light-timing','pwm'],
    [34,'예약 타이머','Delay Timer',['TIME0','TIME1','START'],['DONE'],'delay-timer','watchdog']
  ];
  for (const [id,ko,english,inputs,outs,reference,nodeId] of cases) {
    assert.equal(levels.levelTitles[id], ko); assert.equal(en.levelTitles[id], english);
    assert.equal(levels.levelAnswers[id].referenceId, `memory20:${reference}`);
    assert.equal(STAGE_REFERENCE_IDS[id], `memory20:${reference}`);
    assert.deepEqual(ref(id).inputs, inputs); assert.deepEqual(ref(id).outputs, outs);
    assert.deepEqual(ref(id).releaseButtons, id === 32 ? inputs : id === 34 ? ['START'] : []);
    assert.equal(ref(id).observationMode, 'visible');
    assert.equal(levels.levelRevisions[id], 'control-stages-2026-09-26');
    assert.deepEqual(levels.levelFixedIO[id], {fixIO:false,grid:[]});
    const [threeStarMaxCost,twoStarMaxCost] = {32:[185,225],33:[135,155],34:[315,370]}[id];
    assert.deepEqual(levels.levelStarThresholds[id], {twoStarMaxCost,threeStarMaxCost});
    for (const key of ['levelGridSizes','levelBlockSets','levelAnswers','levelRevisions','levelFixedIO','levelStarThresholds']) assert.deepEqual(levels[key][id], en[key][id]);
    assert.deepEqual(levels.levelDescriptions[id].table, en.levelDescriptions[id].table);
    for (const data of [levels,en]) {
      const copy = JSON.stringify([data.levelDescriptions[id],data.levelHints[`stage${id}`]]);
      assert.doesNotMatch(copy, /RESET|KICK|TIMEOUT|BUSY|DUTY|PWM|Watchdog|응답 감시기/);
      if (id === 33) assert.deepEqual(data.levelDescriptions[id].table,[0,1,2,3].map(n=>({LEVEL0:n&1,LEVEL1:n>>1,LIGHT:['0 0 0 0','1 0 0 0','1 1 0 0','1 1 1 0'][n]})));
      for (const c of [fixture(id), ...[2,3].map(tier => read(`tests/fixtures/stages/${id}-${tier}.json`).circuit)]) {
        validateStageCircuit(c,id,data);
        const result = gradeCircuitSync(c,data.levelAnswers[id]);
        assert.equal(result.ok,true); assert.equal(result.checks,1 + 2 * result.transitions);
      }
    }
    assert.equal(stageById(id).nodeId,nodeId); assert.equal(DEMO_IDS.includes(id),false);
    assert.equal(canPlayStage(id,[30]),true);
  }
  assert.deepEqual(levels.levelGridSizes[32],[19,25]); assert.deepEqual(levels.levelGridSizes[33],[12,13]);
  assert.deepEqual(levels.levelGridSizes[34],[15,24]);
});

test('AC-1: all four counter states and all four requests, wrap and holds', () => {
  const r = ref(32);
  for (let value=0; value<4; value++) {
    let state=r.initialState;
    for(let i=0;i<value;i++)state=r.step(state,1);
    for(let input=0;input<4;input++) {
      assert.equal(r.observe(state,input),value);
      const expected=(value + (input===1?1:input===2?-1:0) + 4)%4;
      assert.equal(r.observe(r.step(state,input),0),expected);
      assert.equal(run(32,[...Array(value).fill(1),input]).at(-1),expected);
    }
  }
  assert.deepEqual(run(32,[1,1,1,1,2,3,0,2,2,2]),[1,2,3,0,3,3,3,2,1,0]);
});

test('AC-2/3: all light patterns from tick zero, SET at every phase, zero still advances', () => {
  const r=ref(33), patterns=[[0,0,0,0],[1,0,0,0],[1,1,0,0],[1,1,1,0]];
  for (let n=0;n<4;n++) {
    const c=fixture(33);let state=r.initialState;
    for(let tick=0;tick<=8;tick++) {
      const before=structuredClone(getExecutionState(c));
      for(let setting=0;setting<4;setting++) {
        set(c,r,setting);assert.deepEqual(outputs(c),[patterns[setting][tick%4]]);
        assert.equal(r.observe(state,setting),patterns[setting][tick%4]);
        assert.deepEqual(getExecutionState(c),before);
      }
      set(c,r,n);assert.equal(tickCircuit(c).ok,true);state=r.step(state,n);
    }
  }
});

test('AC-4/5/6: exhaustive timer deadline model and real engine preserve captured settings and START priority', () => {
  // Independent absolute-deadline oracle, including every START/TIME history of length five.
  const r=ref(34), known=new Set();
  function walk(state,time,deadline,done,depth) {
    known.add(state);
    for(let input=0;input<8;input++) {
      assert.equal(r.observe(state,input),done,'SET preserves DONE');
      const now=time+1, nextDeadline=(input&4)?now+(input&3):deadline;
      const nextDone=Number(nextDeadline===now), next=r.step(state,input);
      assert.equal(r.observe(next,input&3),nextDone);
      if(depth)walk(next,now,nextDone?null:nextDeadline,nextDone,depth-1);
    }
  }
  walk(r.initialState,0,null,0,4);
  assert.equal(known.size,5); assert.equal(r.stateCount,5,'idle and done are distinct states');
  assert.deepEqual(run(34,Array(32).fill(3)),Array(32).fill(0),'no START means no timer');
  for(let n=0;n<4;n++)assert.deepEqual(run(34,[n|4,...Array(8).fill(3)]),Array.from({length:9},(_,tick)=>Number(tick===n)));
  assert.deepEqual(run(34,[6,3,3,3,3]),[0,0,1,0,0],'TIME changes do not extend N=2');
  assert.deepEqual(run(34,[5,7,0,0,0,0]),[0,0,0,0,1,0],'re-START wins on the old deadline');
  assert.deepEqual(run(34,[7,7,7,7,0,0,0,0]),[0,0,0,0,0,0,1,0]);
  assert.deepEqual(run(34,[5,4,4,4,0]),[0,1,1,1,0]);
  const c=fixture(34);set(c,r,4);tickCircuit(c);
  const execution=structuredClone(getExecutionState(c));
  for(let input=0;input<8;input++) {set(c,r,input);assert.deepEqual(outputs(c),[1]);assert.deepEqual(getExecutionState(c),execution);}
  assert.notEqual(r.step(r.initialState,4),r.initialState);
});

test('AC-6/8: bad timing, live settings and phase restart fail with exactly replayable counterexamples', () => {
  const cases=[];
  // Bypass registered timer state with current TIME: fails SET observation.
  const live=fixture(34);Object.values(live.wires).find(w=>w.endBlockId==='OUT_DONE').startBlockId='TIME0';cases.push([34,live,'after_set']);
  // Detect one remaining tick instead of zero: completes a tick too soon.
  const early=fixture(34);Object.values(early.wires).find(w=>w.endBlockId==='OUT_DONE').startBlockId='R0';cases.push([34,early,'after_tick']);
  // Delay the visible pulse by a D: misses immediate completion when N=0.
  const late=fixture(34),outWire=Object.values(late.wires).find(w=>w.endBlockId==='OUT_DONE');
  late.blocks.LATE={id:'LATE',type:'D',pos:{r:0,c:0}};
  late.wires.delay={id:'delay',startBlockId:outWire.startBlockId,endBlockId:'LATE',inputRole:'D',path:[]};outWire.startBlockId='LATE';cases.push([34,late,'after_tick']);
  // Restart the light cycle from LEVEL changes instead of advancing independently.
  const restart=fixture(33);Object.values(restart.wires).find(w=>w.endBlockId==='GRAY0').startBlockId='LEVEL0';cases.push([33,restart,'after_set']);
  for(const [id,c,phase] of cases) {
    const before=snapshotCircuit(c),result=gradeCircuitSync(c,levels.levelAnswers[id]);
    assert.equal(result.status,'fail');assert.equal(result.observation,phase);
    const playback=createTracePlayback(c,result.trace);playback.start();
    for(const event of result.trace) {
      const execution=structuredClone(getExecutionState(c));playback.step();
      if(event.type==='set'||event.type==='expect')assert.deepEqual(getExecutionState(c),execution);
      if(event.type==='expect')for(const output of event.outputs)assert.equal(Number(c.blocks[output.blockId].value),output.actual);
      if(event.type==='tick')for(const input of event.releaseInputs)assert.equal(c.blocks[input.blockId].value,false);
    }
    playback.restore();assert.deepEqual(snapshotCircuit(c),before);
  }
});

const oldLevels = (id,definition) => ({...levels,...Object.fromEntries(Object.entries(definition).filter(([key])=>['levelGridSizes','levelBlockSets','levelFixedIO','levelAnswers'].includes(key)).map(([key,value])=>[key,{[id]:value}]))});
const storageFor = entries => {const m=new Map(entries);return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};

test('AC-9: published references still grade original compact/watchdog designs, cost history and access survive', () => {
  for(const id of [32,33,34]) {
    const definition=baseline.languages['levels.json'].definitions[id];
    const old=read(`tests/fixtures/legacy-memory/${id}-compact.json`).circuit, priorLevels=oldLevels(id,definition);
    validateStageCircuit(old,id,priorLevels);assert.equal(gradeCircuitSync(old,definition.levelAnswers).ok,true);
    assert.equal(gradeCircuitSync(old,levels.levelAnswers[id]).ok,false);
    const record=makeCostRecord(old,id,priorLevels);record.stars=3;
    assert.equal(isCurrentCostRecord(record,levels,id),false);
    const owner=`control-${id}`,storage=storageFor([[`bitwiser:cost-progress:v1:${owner}`,JSON.stringify({stages:{[id]:{best:record,bestStars:record,highestStars:3}}})]]);
    const open=()=>createCostStore({storage,owner,levels,onFailure:e=>{throw e;}});
    let store=open();assert.equal(store.best(id),null);assert.equal(store.stars(id),3);assert.equal(canPlayStage(id,store.cleared()),true);
    assert.deepEqual(store.state.stages[id].best.circuit,snapshotCircuit(old));
    store.recordClear(id,fixture(id));store=open();
    assert.equal(isCurrentCostRecord(store.best(id),levels,id),true);assert.equal(store.stars(id),3);
    assert.deepEqual(store.state.stages[id].previousCostRecords,[record]);
  }
  const watchdog=read('tests/fixtures/legacy-memory/34-watchdog.json').circuit,definition=levels.levelLegacyDefinitions[34];
  validateStageCircuit(watchdog,34,oldLevels(34,definition));assert.equal(gradeCircuitSync(watchdog,definition.levelAnswers).ok,true);
  assert.equal(getReferenceFSM('watchdog').observationMode,undefined);
  assert.deepEqual(getReferenceFSM('memory20:C4-06').releaseButtons,['INC','DEC','RESET']);
  assert.deepEqual(getReferenceFSM('memory20:C4-07').releaseButtons,['RESET']);
  assert.deepEqual(getReferenceFSM('memory20:C4-10').releaseButtons,['KICK']);
});

test('AC-9/11: compact, previous large-layout and legacy designs survive demo backup as excluded stages', () => {
  const raw=emptyProgress();
  for(const id of [32,33,34]) {
    const compact=read(`tests/fixtures/legacy-memory/${id}-compact.json`).circuit;
    const old=levels.levelPreviousLayouts[id][0],[rows,cols]=old.levelGridSizes;
    const large={rows,cols,blocks:Object.fromEntries(old.levelFixedIO.grid.map((b,i)=>[`old${i}`,{id:`old${i}`,type:b.type,name:b.name,fixed:true,value:false,...(b.inputMode?{inputMode:b.inputMode}:{}),pos:{r:Math.floor(b.index/cols),c:b.index%cols}}])),wires:{}};
    validateStageCircuit(large,id,oldLevels(id,old));
    raw.stages[id]={draft:{circuitVersion:2,circuit:compact},best:{circuitVersion:3,circuit:compact,stars:3},legacyStageRecords:[{draft:{circuitVersion:3,circuit:large}}]};
  }
  raw.stages[34].legacyStageRecords.push({draft:{circuitVersion:3,circuit:read('tests/fixtures/legacy-memory/34-watchdog.json').circuit}});
  const storage=storageFor([[SAVE_KEY,JSON.stringify(raw)]]);
  const open=()=>createDemoStore({storage,levels,budgets:{},themeIds:[],onFailure:e=>{throw e;}});
  const store=open();assert.deepEqual(store.state.archivedStages,raw.stages);
  const backup=store.exportBackup();assert.equal(store.replace(store.parseBackup(backup)),true);
  assert.deepEqual(open().state.archivedStages,raw.stages);
  assert.deepEqual(validateProgress(JSON.parse(backup),levels,{},[]),JSON.parse(backup));
  for(const id of [32,33,34])assert.equal(store.isUnlocked(id),false,'demo scope remains chapters 1/2');
});

function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
test('AC-9/10/11: old archives, every unrelated stage and map topology remain exact', () => {
  for(const [file,data] of [['levels.json',levels],['levels_en.json',en]]) {
    const expected=baseline.languages[file];
    const previous = beforeChapterStars(data, file);
    for(const [key,digest] of Object.entries(expected.unchanged))assert.equal(hash(Object.fromEntries(Object.entries(previous[key]).filter(([id])=>!['32','33','34','stage32','stage33','stage34'].includes(id)))),digest,`${file}/${key}`);
    for(const id of [32,33,34]) {
      const original=expected.definitions[id],archive=Object.fromEntries(['levelGridSizes','levelBlockSets','levelFixedIO','levelAnswers'].map(k=>[k,original[k]]));
      assert.deepEqual(data.levelPreviousLayouts[id],[...original.levelPreviousLayouts,archive]);
      assert.deepEqual(data.levelLegacyDefinitions?.[id]??null,original.levelLegacyDefinitions);
    }
  }
  const map=read('stage_map.json');
  assert.equal(map.nodes.find(n=>n.id==='pwm').label,'Light Timing');assert.equal(map.nodes.find(n=>n.id==='watchdog').label,'Delay Timer');
  for(const node of map.nodes)if(['pwm','watchdog'].includes(node.id))delete node.label;
  // Issue #491 expands Crossroad; its display label follows the new board size.
  map.nodes.find(n=>n.id==='crossroad').label='7 x 7 crossroad';
  assert.equal(hash(map),baseline.mapHash);
});
