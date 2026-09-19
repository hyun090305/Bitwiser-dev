import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CHAPTERS,STAGES,canPlayStage,playableStages} from '../src/modules/stageCatalog.js';
import { STAGE_MAP_EDGES } from '../src/modules/stageMapTopology.js';
import {DEMO_IDS,DEMO_END_STAGE,isUnlocked} from '../src/demo/catalog.js';
import {makeRecord,validateProgress,emptyProgress} from '../src/demo/records.js';
import {gradeCircuitSync} from '../src/modules/circuitGrading.js';
import {createExecutionState,tickCircuit} from '../src/canvas/evaluation.js';
import {createMemoryTutorial} from '../src/modules/memoryTutorial.js';
import {isValidWirePath} from '../src/canvas/circuitData.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const levels=read('levels.json'),map=read('stage_map.json');
const fixture=id=>read(`tests/fixtures/${id>=32?'stages':'demo'}/${id}-3.json`).circuit;

test('stable IDs, five chapters plus extras, complete catalog and no candidate progress',()=>{
  assert.deepEqual(CHAPTERS.map(c=>c.title),['Logic Core','Memory Link','Arithmetic Unit','Control Flow','System Integration']);
  assert.equal(new Set(STAGES.map(s=>s.nodeId)).size,STAGES.length);
  assert.equal(new Set(STAGES.filter(s=>s.id!==null).map(s=>s.id)).size,47);
  assert.deepEqual(playableStages().map(s=>s.id).sort((a,b)=>a-b),Array.from({length:47},(_,i)=>i));
  assert.equal(map.nodes.filter(n=>n.nodeType==='stage').length,48);
  assert.equal(map.nodes.some(n=>n.nodeType==='rank'),false);
  assert.equal('rank' in map.nodeTypes,false);
  assert.equal(map.chapters.find(c=>c.id==='extras').numbered,false);
  for(const chapter of map.chapters) {
    assert.ok(chapter.title?.position);
    assert.ok(chapter.title?.size);
    assert.equal(typeof chapter.title?.styleId,'string');
    assert.equal(chapter.title.position.x+chapter.title.size.w/2,chapter.panel.position.x+chapter.panel.size.w/2);
  }
  for(const id of ['lab','user_created_stages'])assert.equal(map.nodes.find(n=>n.id===id).chapterId,'extras');
  for(const s of STAGES) {
    assert.equal(map.nodes.find(n=>n.id===s.nodeId).chapterId,s.chapterId);
    const incoming=map.edges.filter(e=>e.to===s.nodeId).map(e=>STAGES.find(n=>n.nodeId===e.from)?.id).sort((a,b)=>a-b);
    assert.deepEqual(incoming,STAGE_MAP_EDGES.filter(e=>e.to===s.nodeId).map(e=>STAGES.find(n=>n.nodeId===e.from).id).sort((a,b)=>a-b));
    assert.equal(s.status==='playable',Boolean(levels.levelAnswers[s.id]));
    if(s.status==='candidate')assert.equal(canPlayStage(s.id,Array.from({length:47},(_,i)=>i)),false);
  }
  assert.equal(map.edges.filter(e=>e.from==='fixed_xor'&&e.to==='crossroad').length,1);
  for(const edge of map.edges) {
    const center=id=>{const n=map.nodes.find(n=>n.id===id);return {x:n.position.x+(n.size.w-1)/2,y:n.position.y+(n.size.h-1)/2};};
    const points=[center(edge.from),...(edge.waypoints || []),center(edge.to)];
    points.slice(1).forEach((p,i)=>assert.ok(p.x===points[i].x||p.y===points[i].y,`Diagonal map connector ${edge.from} -> ${edge.to}`));
  }
  function visit(s,path=[]) {assert.ok(!path.includes(s.nodeId),'map cycle');STAGE_MAP_EDGES.filter(e=>e.to===s.nodeId).forEach(e=>visit(STAGES.find(n=>n.nodeId===e.from),[...path,s.nodeId]));}
  playableStages().forEach(s=>visit(s));
});

test('demo chapter access excludes later chapters and keeps the ending stage',()=>{
  for(const id of [0,1,2,3,4,5,6])assert.equal(isUnlocked(id,[]),true);
  for(const id of DEMO_IDS.filter(id=>id>6))assert.equal(isUnlocked(id,[6]),true);
  assert.equal(isUnlocked(24,[24,30]),false);
  assert.equal(DEMO_END_STAGE,30);assert.equal(DEMO_IDS.length,17);
});

test('all new references pass bilingual physical validation and sequential grading',()=>{
  const en=read('levels_en.json');
  for(let id=25;id<=31;id++) {
    for(const key of ['levelAnswers','levelBlockSets','levelGridSizes','levelFixedIO'])assert.deepEqual(levels[key][id],en[key][id]);
    for(const data of [levels,en])assert.ok(data.levelHints[`stage${id}`].hints.every(h=>h.type&&h.content));
    const record=makeRecord(fixture(id),id,levels,{});assert.equal(record.stars,1);
    assert.equal(gradeCircuitSync(record.circuit,en.levelAnswers[id]).ok,true);
    const c=fixture(id);
    const required=Object.values(c.blocks).filter(b=>b.type==='D');
    if(required.length) {delete c.wires[Object.keys(c.wires).find(w=>c.wires[w].endBlockId===required[0].id)];assert.equal(gradeCircuitSync(c,levels.levelAnswers[id]).ok,false);}
  }
});

test('explicit timing contracts include retrigger, simultaneous WRITE/COMMIT and post-tick edges',()=>{
  function run(id,inputs) {
    const c=fixture(id),state=createExecutionState(c),io=Object.values(c.blocks).filter(b=>b.type==='INPUT'),outputs=Object.values(c.blocks).filter(b=>b.type==='OUTPUT');
    return inputs.map(x=>{const result=tickCircuit(c,state,{inputs:new Map(io.map(b=>[b.id,!!x[b.name]])),display:false});assert.equal(result.ok,true);return outputs.map(b=>Number(result.values.get(b.id)));});
  }
  assert.deepEqual(run(30,[1,0,0,0].map(OPEN=>({OPEN}))),[[1],[1],[1],[0]]);
  assert.deepEqual(run(30,[1,0,1,0,0,0].map(OPEN=>({OPEN}))),[[1],[1],[1],[1],[1],[0]]);
  assert.deepEqual(run(29,[{D0:1,WRITE:1,COMMIT:1},{D1:1,WRITE:1,COMMIT:1},{COMMIT:1}]),[[0,0],[1,0],[0,1]]);
  assert.deepEqual(run(31,[0,1,1,0,1,0].map(SIGNAL=>({SIGNAL}))),[[0],[1],[0],[0],[1],[0]]);
  assert.deepEqual(run(28,[{FAULT:1,ACK:1},{},{ACK:1}]),[[1],[1],[0]]);
  assert.deepEqual(run(26,[1,1,0,1].map(PRESS=>({PRESS}))),[[1],[0],[0],[1]]);
  assert.deepEqual(run(34,[0,0,0,0,1,0,0,0].map(KICK=>({KICK}))),[[0],[0],[1],[1],[0],[0],[0],[1]]);
  assert.deepEqual(run(35,[1,0,1,1,1,0,1,0,0,0].map(RAW=>({RAW}))),[[0],[0],[0],[0],[1],[1],[1],[1],[1],[0]]);
  for(const id of [34,35]) {
    const c=fixture(id),positions=new Map(Object.values(c.blocks).map(b=>[`${b.pos.r},${b.pos.c}`,b])),occupied=new Set();
    assert.equal(gradeCircuitSync(c,levels.levelAnswers[id]).ok,true);
    const en=read('levels_en.json');
    for(const key of ['levelAnswers','levelBlockSets','levelGridSizes','levelFixedIO'])assert.deepEqual(levels[key][id],en[key][id]);
    for(const wire of Object.values(c.wires)) {
      assert.ok(isValidWirePath(wire.path,{withinBounds:(r,col)=>r>=0&&col>=0&&r<c.rows&&col<c.cols,blockAt:p=>positions.get(`${p.r},${p.c}`),cellHasWire:p=>occupied.has(`${p.r},${p.c}`)}));
      wire.path.slice(1,-1).forEach(p=>occupied.add(`${p.r},${p.c}`));
    }
    for(const b of Object.values(c.blocks))assert.ok(Object.values(c.wires).filter(w=>w.startBlockId===b.id).length<=4);
  }
});

test('old moved clears replay; excluded records survive without unlocking',()=>{
  const raw=emptyProgress();raw.catalogVersion=1;
  const best=makeRecord(fixture(11),11,levels,{});
  raw.stages[11]={best,bestStars:best};raw.stages[24]={draft:{circuitVersion:2,circuit:{legacy:'preserved'}}};raw.hints[24]=2;raw.lastStageId=24;
  const imported=validateProgress(raw,levels,{},[]);
  assert.deepEqual(imported.archivedStages[24],raw.stages[24]);assert.equal(imported.archivedHints[24],2);assert.equal(imported.lastStageId,null);
  assert.equal(isUnlocked(11,[11]),true);assert.equal(isUnlocked(24,[24]),false);
  assert.deepEqual(validateProgress(imported,levels,{},[]),imported);
});

test('legacy story records are discarded while circuits and progress remain usable',()=>{
  const old=emptyProgress(),xor=makeRecord(fixture(6),6,levels,{});
  old.stages[6]={best:xor,bestStars:xor};old.lastStageId=6;old.hints[6]=1;
  old.storySeen=['intro','ending','memory-ending'];
  const imported=validateProgress(old,levels,{},[]);
  assert.equal('storySeen' in imported,false);
  assert.deepEqual(imported.stages[6],old.stages[6]);
  assert.equal(imported.lastStageId,6);assert.equal(imported.hints[6],1);
  assert.equal(isUnlocked(6,[6],imported),true);
  assert.deepEqual(validateProgress(imported,levels,{},[]),imported);
});

test('memory tutorial requires a real store, between-tick hold and EN hold experiment',()=>{
  const c=fixture(25),element={dataset:{}},guide=createMemoryTutorial(c,element,'en'),state=createExecutionState(c);
  const en=Object.values(c.wires).find(w=>w.inputRole==='EN');delete c.wires[en.id];
  const tick=(DATA,LOAD=0)=>{c.blocks.DATA.value=!!DATA;tickCircuit(c,state,{inputs:new Map([['DATA',!!DATA],['LOAD',!!LOAD]]),display:false});guide(state);};
  guide(state);assert.equal(element.dataset.tutorialStep,'1');
  tick(1);assert.equal(element.dataset.tutorialStep,'2');
  c.blocks.DATA.value=false;guide(state);assert.equal(element.dataset.tutorialStep,'3');
  tick(0);assert.equal(element.dataset.tutorialStep,'4');
  c.wires[en.id]=en;guide(state);assert.equal(element.dataset.tutorialStep,'5');
  tick(1,1);tick(0);assert.equal(element.dataset.tutorialStep,'6');
});
