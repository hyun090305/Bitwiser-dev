import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { chapterStarIds, starBaseline, beforeChapterStars } from './helpers/chapter-stars.mjs';
import { snapshotCircuit, hasValidWireLayout } from '../src/canvas/circuitData.js';
import { validateConnections } from '../src/canvas/connections.js';
import { validateStageCircuit } from '../src/modules/stageCircuit.js';
import { validateSavedCircuitRecord } from '../src/modules/savedCircuitRecord.js';
import { gradeCircuitSync, GRADING_VERSION } from '../src/modules/circuitGrading.js';
import { COST_RULES, calculateCircuitCost } from '../src/modules/circuitCost.js';
import { stageRules, isCurrentCostRecord, highestStars, makeCostRecord, createCostStore } from '../src/modules/costRecords.js';
import { createCostLeaderboard } from '../src/modules/costLeaderboard.js';
import { canPlayStage, CATALOG_VERSION } from '../src/modules/stageCatalog.js';
import { createDemoStore, SAVE_KEY } from '../src/demo/store.js';
import { emptyProgress } from '../src/demo/records.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const ko = read('levels.json'), en = read('levels_en.json');
const fixture = (id, tier = 3) => read(`tests/fixtures/stages/${id}-${tier}.json`).circuit;
const memory = () => { const map = new Map(); return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}; };
const ports = (levels, id) => Object.fromEntries([['inputs','INPUT'],['outputs','OUTPUT']].map(([key,type])=>[key,levels.levelBlockSets[id].filter(b=>b.type===type).map(b=>b.name)]));

test('491 AC-3/7: only the agreed data changes; Crossroad archives its old layout and keeps its palette and truth table', () => {
  for (const [file, levels] of [['levels.json',ko],['levels_en.json',en]]) {
    const original = starBaseline.languages[file];
    const unchanged = structuredClone(levels);
    for (const id of chapterStarIds) delete unchanged.levelStarThresholds[id];
    for (const key of ['levelGridSizes','levelFixedIO','levelPreviousLayouts']) delete unchanged[key][19];
    delete unchanged.levelAnswers[24];
    if(file==='levels_en.json') {
      assert.equal(levels.levelTitles[19],'8 x 8 crossroad');
      unchanged.levelTitles[19]='7 x 7 crossroad';
    }
    assert.equal(createHash('sha256').update(JSON.stringify(unchanged)).digest('hex'),original.unchangedHash);
    assert.deepEqual(levels.levelPreviousLayouts[19],[original.definitions[19]]);
    assert.deepEqual(levels.levelGridSizes[19],[8,8]);
    assert.equal(levels.levelFixedIO[19].fixIO,true);
    assert.deepEqual(levels.levelFixedIO[19].grid.map(b=>[b.type,b.name,b.index]),[
      ['INPUT','IN1',0],['INPUT','IN2',56],['OUTPUT','OUT2',7],['OUTPUT','OUT1',63]
    ]);
    assert.deepEqual(levels.levelBlockSets[19],original.definitions[19].levelBlockSets);
    assert.deepEqual(levels.levelAnswers[19],original.definitions[19].levelAnswers);
    assert.deepEqual(levels.levelGridSizes[6],[6,6]);
    assert.deepEqual(levels.levelGridSizes[20],[7,7]);
  }
  assert.equal(GRADING_VERSION,6); assert.equal(COST_RULES.version,'cost-v1'); assert.equal(CATALOG_VERSION,4);
  assert.equal(read('stage_map.json').nodes.find(n=>n.id==='crossroad').label,'8 x 8 crossroad');
});

test('491 AC-3/4: the two issue snapshots are planar, pass all four inputs and compute 152/3 stars and 178/2 stars', () => {
  for (const [tier,totalCost,counts] of [[3,152,[5,2,5,1,31]],[2,178,[8,2,4,2,36]]]) {
    const circuit = fixture(19,tier), before = structuredClone(circuit);
    assert.equal(hasValidWireLayout(circuit),true);
    assert.deepEqual(validateConnections(circuit).diagnostics,[]);
    const cost = calculateCircuitCost(circuit);
    assert.equal(cost.totalCost,totalCost);
    assert.deepEqual(['AND','OR','NOT','JUNCTION','WIRE'].map(k=>cost.counts[k]),counts);
    for (const levels of [ko,en]) {
      validateStageCircuit(circuit,19,levels);
      const result = gradeCircuitSync(circuit,levels.levelAnswers[19],{ports:ports(levels,19)});
      assert.equal(result.status,'pass'); assert.equal(result.completed,4); assert.equal(result.total,4);
      const record = makeCostRecord(circuit,19,levels);
      assert.equal(record.totalCost,totalCost); assert.equal(record.stars,tier);
    }
    assert.deepEqual(circuit,before,'grading/cost cannot mutate the design');
  }
});

// Logical oracle for the grader, not a physical placement/cost fixture:
// negate by preserving bits through the least significant 1 and inverting above.
function complementCircuit() {
  const circuit = {rows:8,cols:8,blocks:{},wires:{}};
  function add(id,type,...inputs) {
    const n = Object.keys(circuit.blocks).length;
    circuit.blocks[id] = {id,type,name:id,pos:{r:Math.floor(n/8),c:n%8},value:false,fixed:false};
    for (const source of inputs) {
      const wireId = `w${Object.keys(circuit.wires).length}`;
      circuit.wires[wireId] = {id:wireId,startBlockId:source,endBlockId:id,path:[]};
    }
    return id;
  }
  for (let i=0;i<4;i++) add(`A${i}`,'INPUT');
  add('C0','OUTPUT','A0');
  let lower = 'A0';
  for (let i=1;i<4;i++) {
    const a=`A${i}`, either=add(`or${i}`,'OR',a,lower), both=add(`and${i}`,'AND',a,lower);
    add(`C${i}`,'OUTPUT',add(`xor${i}`,'AND',either,add(`not${i}`,'NOT',both)));
    if(i<3) lower=add(`lower${i}`,'OR',lower,a);
  }
  return circuit;
}

test('491 AC-5: actual A/C ports grade all 16 two’s-complement inputs in both languages and reject a reversed bit', () => {
  for (const levels of [ko,en]) {
    const answers = levels.levelAnswers[24], seen = new Set(), io = ports(levels,24);
    assert.equal(answers.length,16);
    for (const {inputs,expected} of answers) {
      assert.deepEqual(Object.keys(inputs).sort(),[...io.inputs].sort());
      assert.deepEqual(Object.keys(expected).sort(),[...io.outputs].sort());
      assert.ok([...Object.values(inputs),...Object.values(expected)].every(v=>v===0||v===1));
      const a = [0,1,2,3].reduce((n,i)=>n+(inputs[`A${i}`]<<i),0);
      assert.equal(seen.has(a),false); seen.add(a);
      assert.equal([0,1,2,3].reduce((n,i)=>n+(expected[`C${i}`]<<i),0),(-a)&15);
    }
    const circuit = complementCircuit();
    const result = gradeCircuitSync(circuit,answers,{ports:io});
    assert.equal(result.status,'pass'); assert.equal(result.completed,16); assert.equal(result.total,16);
    [circuit.blocks.C0.name,circuit.blocks.C3.name]=['C3','C0'];
    assert.equal(gradeCircuitSync(circuit,answers,{ports:io}).status,'fail');
  }
});

test('491 AC-6: all 20 threshold-only rule keys stay current; physical records re-evaluate on reload without replay', () => {
  const previous = beforeChapterStars(ko);
  for (const id of chapterStarIds.filter(id=>![19,24].includes(id))) {
    assert.equal(stageRules(previous,id),stageRules(ko,id));
    // Exercise the metadata path at each actual new cutoff, without claiming a
    // constructed metadata record is a verified physical circuit.
    for (const [cost,stars] of [[ko.levelStarThresholds[id].threeStarMaxCost,3],[ko.levelStarThresholds[id].twoStarMaxCost,2]]) {
      const record = {stageId:id,stageRules:stageRules(previous,id),pricingVersion:COST_RULES.version,gradingVersion:GRADING_VERSION,totalCost:cost,stars:1};
      assert.equal(isCurrentCostRecord(record,ko,id),true);
      assert.equal(highestStars({best:record},ko,id),stars);
    }
  }
  const storage = memory(), store = createCostStore({storage,levels:previous});
  const expected = {32:1,33:2,34:2,35:2,36:2,37:2,47:3};
  for (const id of Object.keys(expected).map(Number)) assert.equal(store.recordClear(id,fixture(id)).record.stars,1);
  const reopened = createCostStore({storage,levels:en,onFailure:e=>{throw e;}});
  for (const [id,stars] of Object.entries(expected)) {
    assert.equal(reopened.stars(id),stars);
    assert.deepEqual(reopened.best(id).circuit,store.best(id).circuit);
    assert.equal(reopened.best(id).totalCost,store.best(id).totalCost);
    assert.equal(reopened.state.stages[id].previousCostRecords,undefined);
  }
});

function oldDesign(id) {
  const definition = starBaseline.languages['levels.json'].definitions[id], [rows,cols]=definition.levelGridSizes;
  const io = definition.levelFixedIO?.fixIO ? definition.levelFixedIO.grid : definition.levelBlockSets.filter(b=>['INPUT','OUTPUT'].includes(b.type)).map((b,index)=>({...b,index}));
  return {rows,cols,blocks:Object.fromEntries(io.map(b=>[b.name,{id:b.name,type:b.type,name:b.name,fixed:Boolean(definition.levelFixedIO?.fixIO),value:false,pos:{r:Math.floor(b.index/cols),c:b.index%cols}}])),wires:{}};
}

test('491 AC-6: previous-rule history, 7x7 coordinates, saved designs, clears, access and highest stars survive reload/new clears', async () => {
  const previous = beforeChapterStars(ko), storage = memory(), stages = {};
  for (const id of [19,24]) {
    const design = oldDesign(id);
    validateStageCircuit(design,id,previous);
    const saved = {version:2,stageId:id,circuit:design};
    assert.deepEqual(validateSavedCircuitRecord(saved).circuit,snapshotCircuit(design));
    // Historical records are loaded as-is, never asserted to pass today's grader.
    const old = {stageId:id,stageRules:stageRules(previous,id),pricingVersion:COST_RULES.version,gradingVersion:GRADING_VERSION,circuitVersion:3,circuit:snapshotCircuit(design),totalCost:200,stars:3};
    stages[id]={best:old,bestStars:old,highestStars:3,draft:saved};
    assert.notEqual(stageRules(previous,id),stageRules(ko,id));
  }
  storage.setItem('bitwiser:cost-progress:v1:local',JSON.stringify({stages}));
  const open=()=>createCostStore({storage,levels:ko,onFailure:e=>{throw e;}});
  let store=open();
  for(const id of [19,24]) {
    assert.equal(store.best(id),null); assert.equal(store.stars(id),3);
    assert.ok(store.cleared().includes(id)); assert.equal(canPlayStage(id,store.cleared()),true);
    assert.deepEqual(store.state.stages[id],stages[id]);
  }
  store.persist(); assert.deepEqual(open().state,store.state);
  assert.throws(()=>makeCostRecord(oldDesign(19),19,ko),/Invalid grid/);
  const result=store.recordClear(19,fixture(19,2));
  assert.equal(result.record.stars,2); assert.equal(result.highestStars,3);
  store=open();assert.equal(store.best(19).totalCost,178);assert.equal(store.stars(19),3);
  assert.deepEqual(store.state.stages[19].previousCostRecords,[stages[19].best]);
  assert.deepEqual(store.state.stages[19].draft,stages[19].draft);
  assert.deepEqual(store.state.stages[24],stages[24]);

  const snap=(value,key='')=>({key,val:()=>value,forEach:fn=>Object.entries(value).forEach(([k,v])=>fn(snap(v,k)))});
  const old19={...stages[19].best,nickname:'me'},old24={...stages[24].best,nickname:'me'};
  const current={...store.best(19),nickname:'me'};
  const board=createCostLeaderboard({levels:ko,getNickname:()=> 'me',db:{ref:path=>({once:async()=>snap(path.split('/').length===2?{19:{old:{old19},current:{current}},24:{old:{old24}}}:{old19,old24,current})})}});
  assert.deepEqual((await board.load(19)).entries.map(r=>r.totalCost),[178]);
  assert.deepEqual((await board.loadPersonal()).map(r=>r.stageId),[19]);

  const raw=emptyProgress(); raw.stages=stages;
  const demoStorage=memory();demoStorage.setItem(SAVE_KEY,JSON.stringify(raw));
  const demo=createDemoStore({storage:demoStorage,levels:ko,budgets:{},themeIds:[],onFailure:e=>{throw e;}});
  assert.deepEqual(demo.state.archivedStages,stages);
  assert.equal(demo.isUnlocked(19),false);assert.equal(demo.isUnlocked(24),false);
  const backup=demo.exportBackup(); assert.equal(demo.replace(demo.parseBackup(backup)),true);
  assert.deepEqual(demo.state.archivedStages,stages);
});
