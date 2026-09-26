import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGES, stageById, canPlayStage, preserveStageAccess } from '../src/modules/stageCatalog.js';
import { DEMO_IDS, DEMO_END_STAGE, isDemoStage, isUnlocked, demoMap } from '../src/demo/catalog.js';
import { hasValidWireLayout, snapshotCircuit } from '../src/canvas/circuitData.js';
import { validateConnections } from '../src/canvas/connections.js';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { calculateCircuitCost, evaluateCostStars } from '../src/modules/circuitCost.js';
import { makeCostRecord, createCostStore } from '../src/modules/costRecords.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const ko = read('levels.json'), en = read('levels_en.json'), map = read('stage_map.json');
const fixture = read('tests/fixtures/stages/47-3.json');
const ports = { inputs: ['A1','A0','B1','B0','L1','L0'], outputs: ['OVER'] };
const boundaries = [[0,0,0,0],[1,0,0,1],[1,2,3,0],[2,2,3,1],[3,3,3,1],[0,2,1,1],[0,2,3,0]];
const values = inputs => ['A','B','L'].map(p => 2 * inputs[p + '1'] + inputs[p + '0']);

test('486 AC-1/7/8: the existing map slot opens with Chapter 3 access, outside the demo', () => {
  assert.deepEqual(stageById(47), { id:47, nodeId:'overflow_detector', chapterId:'chapter_3',
    layoutKey:'c3_overflow', gridPosition:{column:3,row:1}, optional:false, status:'playable' });
  assert.deepEqual(STAGES.map(s => s.id).sort((a,b) => a-b), Array.from({length:48}, (_,i) => i));
  const node = map.nodes.find(n => n.id === 'overflow_detector');
  assert.equal(node.label, 'Capacity Limit Check');
  assert.equal(node.status, 'playable');
  assert.deepEqual(map.edges.filter(e => e.to === node.id), [
    { from:'full_adder', to:'overflow_detector', style:'straight', edgeType:'progression' }
  ]);
  assert.equal(canPlayStage(47, []), false);
  assert.equal(canPlayStage(47, [30]), true);
  for (const previous of [{unlockedChapters:['chapter_3']}, {unlockedStages:[13]}]) {
    const access = preserveStageAccess([], {catalogVersion:4, ...previous});
    assert.equal(canPlayStage(47, [], access), true);
    assert.deepEqual(preserveStageAccess([], access), access);
  }
  assert.equal(canPlayStage(47, [9]), true);
  assert.equal(DEMO_IDS.length, 17);
  assert.equal(DEMO_END_STAGE, 30);
  assert.equal(isDemoStage(47), false);
  assert.equal(isUnlocked(47, [30,47], {unlockedChapters:['chapter_3']}), false);
  assert.equal(demoMap(map).nodes.some(n => n.id === node.id), false);
});

test('486 AC-2/4: all 64 distinct input tuples match an independent integer oracle', () => {
  for (const data of [ko,en]) {
    const answers = data.levelAnswers[47];
    assert.equal(answers.length, 64);
    const seen = new Set();
    for (const {inputs,expected} of answers) {
      assert.deepEqual(Object.keys(inputs), ports.inputs);
      assert.ok(Object.values(inputs).every(v => v === 0 || v === 1));
      const [a,b,limit] = values(inputs), key = `${a},${b},${limit}`;
      assert.equal(seen.has(key), false); seen.add(key);
      assert.deepEqual(expected, {OVER:Number(a+b>limit)}, key);
    }
    for (let a=0;a<4;a++) for(let b=0;b<4;b++) for(let l=0;l<4;l++) assert.ok(seen.has(`${a},${b},${l}`));
    assert.deepEqual(data.levelDescriptions[47].table.map(row => [...values(row), row.OVER]), boundaries);
  }
});

test('486 AC-3/4/6: bilingual ports, free grid, hints, revision and pending targets agree', () => {
  for (const key of ['levelAnswers','levelGridSizes','levelBlockSets','levelFixedIO','levelStarThresholds','levelRevisions']) {
    assert.deepEqual(ko[key][47], en[key][47], key);
  }
  assert.deepEqual(ko.levelGridSizes[47], [9,15]);
  assert.deepEqual(ko.levelFixedIO[47], {fixIO:false,grid:[]});
  assert.deepEqual(ko.levelBlockSets[47], [...ports.inputs.map(name => ({type:'INPUT',name,inputMode:'switch'})),
    {type:'OUTPUT',name:'OVER'}, ...['AND','OR','NOT','JUNCTION'].map(type => ({type}))]);
  assert.deepEqual(ko.levelStarThresholds[47], {twoStarMaxCost:null,threeStarMaxCost:null});
  assert.equal(ko.levelRevisions[47], 'capacity-limit-2026-09-26');
  for (const [data,title] of [[ko,'적재 한도 검사'],[en,'Capacity Limit Check']]) {
    assert.equal(data.levelTitles[47], title);
    assert.equal(data.levelDescriptions[47].title, title);
    assert.match(data.levelDescriptions[47].desc, /LIMIT = 2\*L1 \+ L0/);
    const hints = data.levelHints.stage47.hints;
    assert.equal(hints.length, 3);
    assert.ok(hints.every(h => h.type && h.content));
    assert.match(hints[0].content, /OVER=0/);
    assert.match(hints[1].content, /A1\+B1/);
  }
  assert.equal(ko.levelHints.stage47.hints[2].content.split('NL0 =')[1], en.levelHints.stage47.hints[2].content.split('NL0 =')[1]);
});

test('486 AC-5: the issue reference is physically valid and grades 64/64 for cost-v1 175', () => {
  const circuit = fixture.circuit;
  assert.equal(circuit.version, 3);
  assert.match(fixture.purpose, /not an optimal solution or a confirmed 3-star/);
  assert.equal(hasValidWireLayout(circuit), true);
  assert.deepEqual(validateConnections(circuit).diagnostics, []);
  for (const data of [ko,en]) {
    const result = gradeCircuitSync(circuit, data.levelAnswers[47], {ports});
    assert.equal(result.status, 'pass'); assert.equal(result.sequential, false);
    assert.equal(result.checks, 64); assert.equal(result.completed, 64); assert.equal(result.total, 64);
  }
  const cost = calculateCircuitCost(circuit);
  assert.equal(cost.pricingVersion, 'cost-v1'); assert.equal(cost.totalCost, 175);
  assert.deepEqual(cost.counts, {WIRE:43,JUNCTION:2,NOT:2,AND:5,OR:6,D:0,INPUT:6,OUTPUT:1});
  const failed = structuredClone(circuit); failed.blocks.NL0.type = 'JUNCTION';
  assert.equal(gradeCircuitSync(failed, ko.levelAnswers[47], {ports}).ok, false);
  assert.throws(() => makeCostRecord(failed,47,ko), /does not pass/);
});

test('486 AC-6/7/8: a clear persists one star and actual cost without disturbing old records', () => {
  const old = makeCostRecord(read('tests/fixtures/demo/1-3.json').circuit,1,ko);
  const state = {stages:{1:{best:old,bestStars:old,highestStars:3,draft:{circuit:old.circuit}}}};
  const records = new Map([['bitwiser:cost-progress:v1:local',JSON.stringify(state)]]);
  const storage = {getItem:key => records.get(key) ?? null, setItem:(key,value) => records.set(key,value)};
  const store = createCostStore({storage,levels:ko});
  const result = store.recordClear(47,fixture.circuit);
  assert.equal(result.saved, true); assert.equal(result.record.stars, 1); assert.equal(result.record.totalCost, 175);
  assert.deepEqual(store.state.stages[1], state.stages[1]);
  const restored = createCostStore({storage,levels:en});
  assert.deepEqual(restored.cleared(), [1,47]); assert.equal(restored.stars(47),1);
  assert.deepEqual(restored.best(47).circuit, snapshotCircuit(fixture.circuit));
  assert.equal(gradeCircuitSync(restored.best(47).circuit,en.levelAnswers[47],{ports}).ok,true);
  // Cost is recorded, never used as a pass/fail limit, even above the reference.
  const moreExpensive = structuredClone(fixture.circuit);
  moreExpensive.wires.w3.path = [[1,6],[0,6],[0,5],[0,4],[1,4]].map(([r,c]) => ({r,c}));
  const record = makeCostRecord(moreExpensive,47,ko);
  assert.equal(record.totalCost,177); assert.equal(record.stars,1);
  assert.equal(evaluateCostStars(47,true,10000,ko.levelStarThresholds[47]),1);
});
