import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { CHAPTERS, STAGES, chapterAccess, canPlayStage, preserveStageAccess, totalStageStars, acknowledgeChapter } from '../src/modules/stageCatalog.js';
import { STAGE_MAP_EDGES } from '../src/modules/stageMapTopology.js';
import { validateStageCircuit } from '../src/modules/stageCircuit.js';
import { hasValidWireLayout } from '../src/canvas/circuitData.js';
import { gradeCircuitSync, GRADING_VERSION } from '../src/modules/circuitGrading.js';
import { calculateCircuitCost, evaluateCostStars, COST_RULES } from '../src/modules/circuitCost.js';
import { createCostStore } from '../src/modules/costRecords.js';
import { createDemoStore } from '../src/demo/store.js';
import { DEMO_IDS } from '../src/demo/catalog.js';
import { emptyProgress, validateProgress } from '../src/demo/records.js';
import { applyStageCopy } from '../scripts/apply-stage-copy.mjs';
import { progressionBaseline } from './helpers/star-progression.mjs';
const read = p => JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const levels = read('levels.json'), en = read('levels_en.json'), copy = read('scripts/data/stage-copy.json');
const starsAt = total => Object.fromEntries(STAGES.filter(s=>s.id!==0).map((s,i)=>[s.id,Math.max(0,Math.min(3,total-i*3))]));
const memory = () => { const values=new Map(); return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}; };

test('495 AC-1/2/3: exact authored slots, 43 edges and bilingual functional titles', () => {
  const {slots,edges}=read('tests/fixtures/progression-layout.json'), map=read('stage_map.json');
  assert.deepEqual(CHAPTERS.map(ch=>STAGES.filter(s=>s.chapterId===ch.id&&s.id!==0).length),[7,9,11,11,9]);
  for(const s of STAGES) {
    assert.deepEqual(s.gridPosition,{column:slots[s.id].column,row:slots[s.id].row});
    assert.equal(s.chapterId,`chapter_${slots[s.id].chapter}`);
    assert.equal(levels.levelTitles[s.id],copy[s.id].title);
    assert.equal(en.levelTitles[s.id],copy[s.id].title);
    assert.equal(map.nodes.find(n=>n.id===s.nodeId).label,copy[s.id].title);
  }
  const ids=Object.fromEntries(STAGES.map(s=>[s.nodeId,s.id]));
  assert.deepEqual(STAGE_MAP_EDGES.map(e=>[ids[e.from],ids[e.to]]),edges);
});

test('495 AC-4/5/17/18: authored copy regenerates exactly without changing any puzzle contract', () => {
  for(const [file,data,language] of [['levels.json',levels,0],['levels_en.json',en,1]]) {
    assert.deepEqual(applyStageCopy(structuredClone(data),language),data);
    for(const s of STAGES) {
      const desc=data.levelDescriptions[s.id];
      assert.equal(desc.title,copy[s.id].title);
      assert.equal(desc.desc,copy[s.id][language?'en':'ko']);
      assert.deepEqual(desc.rules,copy[s.id].rules[language?'en':'ko']);
      const prose=[desc.desc,...desc.rules.flat()].join('\n');
      assert.doesNotMatch(prose,/상황:|목표:|시점:|Situation:|Goal:|Timing:|신호: 0은|Signals: 0 is|tick과 D|Ticks and D/);
      assert.equal(desc.desc.includes('\n'),false,'one concise goal');
      assert.doesNotMatch(desc.desc,/[\u3040-\u30ff]/);
      if([33,38,46].includes(s.id)) assert.doesNotMatch(desc.desc,/출력은 tick 때만|Outputs in this puzzle change only/);
    }
    const contracts=structuredClone(data);delete contracts.levelTitles;
    for(const d of Object.values(contracts.levelDescriptions)){delete d.title;delete d.desc;delete d.rules;}
    for(let id=38;id<=46;id++)delete contracts.levelStarThresholds[id];
    assert.equal(createHash('sha256').update(JSON.stringify(contracts)).digest('hex'),progressionBaseline.languages[file].contractHash);
  }
  assert.equal(GRADING_VERSION,6);assert.equal(COST_RULES.version,'cost-v1');
});

test('495 AC-6/7: nine attached planar circuits pass both languages at the exact documented costs and 3 stars', () => {
  const costs=[219,230,172,370,349,296,478,220,524];
  for(let id=38;id<=46;id++) {
    const f=read(`tests/fixtures/chapter5/${id}.json`),c=f.circuit;
    assert.equal(hasValidWireLayout(c),true);
    assert.equal(calculateCircuitCost(c).totalCost,costs[id-38]);
    for(const data of [levels,en]) {
      validateStageCircuit(c,id,data);
      assert.equal(gradeCircuitSync(c,data.levelAnswers[id]).ok,true,`stage ${id}`);
      assert.deepEqual(data.levelStarThresholds[id],f.proposedThresholds);
      assert.equal(evaluateCostStars(id,true,costs[id-38],data.levelStarThresholds[id]),3);
    }
  }
});

test('495 AC-8/9: inclusive star boundaries, no old gates, no duplicate/negative/foreign contributions', () => {
  for(const ch of CHAPTERS.slice(1)) for(const total of [ch.requiredStars-1,ch.requiredStars]) {
    const access=preserveStageAccess([],{}, {stageStars:starsAt(total)});
    assert.equal(totalStageStars([],access.stageStars),total);
    assert.equal(chapterAccess(ch.id,[],access).unlocked,total>=ch.requiredStars);
    for(const stage of STAGES.filter(s=>s.chapterId===ch.id)) assert.equal(canPlayStage(stage.id,[],access),total>=ch.requiredStars);
  }
  for(const gate of [[6],[30],[30,14,32]]) {
    const access=preserveStageAccess(gate);
    assert.equal(chapterAccess('chapter_5',gate,access).unlocked,false);
    assert.equal(chapterAccess('chapter_3',gate,access).unlocked,gate.includes(14));
  }
  assert.equal(totalStageStars([0,0,1,1,999],{0:3,1:3,999:3,lab:3}),3);
  assert.equal(totalStageStars([],{1:NaN,2:2.5,3:-1}),0);
  assert.equal(totalStageStars([],starsAt(141)),141);
  const storage=memory(), store=createCostStore({storage,levels});
  const circuit=read('tests/fixtures/demo/1-3.json').circuit;
  store.recordClear(1,circuit);store.recordClear(1,circuit);
  assert.equal(totalStageStars(store.cleared(),{1:store.stars(1)}),3);
  store.recordClear(1,read('tests/fixtures/demo/1-2.json').circuit);
  assert.equal(store.stars(1),3);
});

test('495 AC-13/14: old memberships/gates migrate once; pending and acknowledged access round-trip independently', () => {
  for(const catalogVersion of [1,2,3,4]) for(const cleared of [[6],[7],[30]]) {
    const access=preserveStageAccess(cleared,{catalogVersion});
    assert.ok(access.unlockedChapters.includes('chapter_2'));
    if(cleared.includes(30)) {
      assert.ok(access.unlockedChapters.includes('chapter_3'));
      assert.ok(access.unlockedChapters.includes('chapter_4'));
      assert.equal(access.unlockedChapters.includes('chapter_5'),catalogVersion<3);
    }
    assert.equal(totalStageStars(cleared,access.stageStars),1);
    assert.deepEqual(preserveStageAccess(cleared,access),access);
    assert.deepEqual(access.pendingChapters,[]);
  }
  const access=preserveStageAccess([],{}, {stageStars:starsAt(84)});
  assert.deepEqual(access.pendingChapters,['chapter_2','chapter_3','chapter_4','chapter_5']);
  const acknowledged=acknowledgeChapter(access,'chapter_3');
  const reopened=preserveStageAccess([],JSON.parse(JSON.stringify(acknowledged)));
  assert.deepEqual(reopened,acknowledged);
  assert.equal(chapterAccess('chapter_3',[],reopened).unlocked,true);
  assert.deepEqual(reopened.pendingChapters,['chapter_2','chapter_4','chapter_5']);
});

test('495 AC-14/15: verified C5 records reprice without replay; unrelated malformed records do not erase progress; demo scope caps at 48', () => {
  const old=structuredClone(levels);
  for(let id=38;id<=46;id++)old.levelStarThresholds[id]={threeStarMaxCost:null,twoStarMaxCost:null};
  const storage=memory(), store=createCostStore({storage,levels:old});
  for(let id=38;id<=46;id++)assert.equal(store.recordClear(id,read(`tests/fixtures/chapter5/${id}.json`).circuit).highestStars,1);
  store.state.stages[999]=null;store.persist();
  const reopened=createCostStore({storage,levels});
  for(let id=38;id<=46;id++){assert.equal(reopened.stars(id),3);assert.equal(reopened.best(id).totalCost,store.best(id).totalCost);}
  assert.equal(totalStageStars(reopened.cleared(),Object.fromEntries(reopened.cleared().map(id=>[id,reopened.stars(id)]))),27);
  const access=preserveStageAccess([],{}, {stageStars:starsAt(141),allowedIds:DEMO_IDS});
  assert.equal(totalStageStars([],access.stageStars),48);
  assert.deepEqual(access.unlockedChapters,['chapter_1','chapter_2']);
  const demo=createDemoStore({storage:memory(),levels,themeIds:[]});
  for(const id of [9,12,38])assert.equal(demo.isUnlocked(id),false);
});

test('495 AC-14: one damaged demo record is quarantined while valid records and historical stars survive', () => {
  const storage=memory(), store=createDemoStore({storage,levels,themeIds:[]});
  store.recordClear(1,read('tests/fixtures/demo/1-3.json').circuit);
  const raw=structuredClone(store.state);
  raw.stages[2]={best:{stars:2,circuit:{broken:true}},bestStars:{stars:2,circuit:{broken:true}}};
  raw.stages[3]=null;
  storage.setItem('bitwiser:web-demo:v1',JSON.stringify(raw));
  const restored=createDemoStore({storage,levels,themeIds:[]});
  assert.equal(restored.state.stages[1].best.totalCost,12);
  assert.equal(restored.state.stages[2].highestStars,2);
  assert.deepEqual(restored.state.recoveryStages[2],raw.stages[2]);
  assert.equal(restored.state.recoveryStages[3],null);
  assert.deepEqual(restored.parseBackup(restored.exportBackup()),restored.state);
  const unearned={...emptyProgress(),stageStars:Object.fromEntries(DEMO_IDS.map(id=>[id,3]))};
  assert.equal(totalStageStars([],validateProgress(unearned,levels,{},[]).stageStars),0);
  const old=emptyProgress();old.catalogVersion=2;old.gradingVersion=2;
  const circuit=read('tests/fixtures/legacy-memory/31.json').circuit;
  old.stages[31]={best:{circuitVersion:3,circuit},bestStars:{circuitVersion:3,circuit}};
  const migrated=validateProgress(old,levels,{},[]);
  assert.equal(migrated.stageStars[31],1,'a historical clear without a stored star value retains its one earned star');
  assert.deepEqual(validateProgress(migrated,levels,{},[]),migrated);
});
