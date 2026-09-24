import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateCircuitCost, COST_RULES, evaluateCostStars, validateStarThresholds } from '../src/modules/circuitCost.js';
import { makeCostRecord, createCostStore, highestStars, isCurrentCostRecord, stageRules } from '../src/modules/costRecords.js';
import { GRADING_VERSION, gradeCircuitSync, gradeCircuit } from '../src/modules/circuitGrading.js';
import { snapshotCircuit, getCircuitStats } from '../src/canvas/circuitData.js';
import { rankCostEntries, createCostLeaderboard } from '../src/modules/costLeaderboard.js';
import { createDemoStore, SAVE_KEY } from '../src/demo/store.js';
import { createGradingController } from '../src/modules/grading.js';
const levels = JSON.parse(fs.readFileSync('levels.json', 'utf8'));
const fixture = (id, tier=3) => JSON.parse(fs.readFileSync(`tests/fixtures/demo/${id}-${id===0?'tutorial':tier}.json`, 'utf8')).circuit;
const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }; };
const memoryFixture = id => JSON.parse(fs.readFileSync(`tests/fixtures/memory20/${id}.json`, 'utf8')).circuit;
const doorShortcut = () => JSON.parse(fs.readFileSync('tests/fixtures/observations/30-shortcut.json', 'utf8')).circuit;
const oldRecord = (circuit, id) => {
  const rules = JSON.parse(stageRules(levels, id)); rules[0] = 3;
  const snapshot = snapshotCircuit(circuit);
  return { stageId:id, gradingVersion:3, stageRules:JSON.stringify(rules), circuitVersion:3,
    circuit:snapshot, ...getCircuitStats(snapshot), ...calculateCircuitCost(snapshot), stars:3 };
};

test('prices count committed occupancy including unused/fixed logic, never IO or duplicate junction cells', () => {
  const blocks = {};
  for (const [i,type] of ['AND','AND','NOT','D','JUNCTION','JUNCTION','INPUT','OUTPUT'].entries()) blocks[i] = {type,pos:{r:2,c:i},fixed:true,value:true};
  const path = [{r:2,c:0}, ...Array.from({length:18},(_,c)=>({r:0,c})), {r:2,c:7}];
  const c = {blocks,wires:{one:{path},duplicate:{path:[path[0],path[2],{r:2,c:4},path.at(-1)]}}};
  const cost = calculateCircuitCost(c);
  assert.equal(cost.totalCost,70); assert.equal(cost.counts.WIRE,18); assert.equal(cost.counts.JUNCTION,2);
  c.tick=123; c.speed=30; c.ghost={type:'D'}; c.preview={path};
  Object.values(c.blocks).forEach(b=>{b.value=false;b.inputRole='EN';b.label='sample';});
  assert.deepEqual(calculateCircuitCost(c),cost);
  c.blocks.extra={type:'MODULE',pos:{r:4,c:0}};
  assert.throws(()=>calculateCircuitCost(c),/No cost policy/);
});
test('star placeholders, invalid pairs, zero/equal limits, failed verification and tutorial remain distinct', () => {
  for (const threshold of [null,{}, {twoStarMaxCost:null,threeStarMaxCost:null}]) {
    assert.equal(validateStarThresholds(threshold).status,'pending'); assert.equal(evaluateCostStars(1,true,0,threshold),1);
  }
  for (const [two,three] of [[0,null],[null,0],[3,4],[-1,0],[5.5,2],[Infinity,1],['20',10],[NaN,0]]) {
    const t={twoStarMaxCost:two,threeStarMaxCost:three}; assert.equal(validateStarThresholds(t).status,'invalid'); assert.equal(evaluateCostStars(1,true,0,t),1);
  }
  const t={twoStarMaxCost:0,threeStarMaxCost:0};
  assert.equal(evaluateCostStars(1,true,0,t),3); assert.equal(evaluateCostStars(1,false,0,t),0); assert.equal(evaluateCostStars(0,true,0,t),0);
  for (const file of ['levels.json','levels_en.json']) {
    const l=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.deepEqual(Object.keys(l.levelStarThresholds),Object.keys(l.levelTitles).filter(id=>id!=='0'));
    for(const value of Object.values(l.levelStarThresholds)) assert.deepEqual(value,{twoStarMaxCost:null,threeStarMaxCost:null});
  }
});
test('record validation rejects failed circuits, recalculates cost and freezes the associated placement', () => {
  const c=fixture(1); const r=makeCostRecord(c,1,levels);
  assert.equal(r.totalCost,calculateCircuitCost(c).totalCost); assert.equal(r.stars,1);
  c.blocks.g.type='D'; assert.equal(r.circuit.blocks.g.type,'NOT');
  const failed=fixture(1);failed.wires={}; assert.throws(()=>makeCostRecord(failed,1,levels),/does not pass/);
});
test('first, improved, tie and worse costs preserve actual best and allow later stars without replay', () => {
  const data=structuredClone(levels), storage=memory();
  const store=createCostStore({storage,levels:data});
  const worse=fixture(1,2), better=fixture(1);
  const first=store.recordClear(1,worse); assert.equal(first.first,true);
  const improved=store.recordClear(1,better); assert.equal(improved.improved,true); assert.equal(improved.previousCost,first.record.totalCost);
  const tied=store.recordClear(1,better); assert.equal(tied.first,false); assert.equal(tied.improved,false);
  const bad=store.recordClear(1,worse); assert.equal(bad.improved,false); assert.equal(bad.best.totalCost,improved.record.totalCost);
  data.levelStarThresholds[1]={twoStarMaxCost:bad.record.totalCost,threeStarMaxCost:bad.best.totalCost};
  assert.equal(store.stars(1),3);
  const reloaded=createCostStore({storage,levels:data}); assert.equal(reloaded.stars(1),3);
  reloaded.recordClear(1,better);
  data.levelStarThresholds[1]={twoStarMaxCost:null,threeStarMaxCost:null};
  assert.equal(reloaded.recordClear(1,worse).record.stars,1); assert.equal(reloaded.stars(1),3);
  assert.equal(isCurrentCostRecord({...bad.best,pricingVersion:'old'},data,1),false);
  const changed=structuredClone(data);changed.levelGridSizes[1]=[8,8];assert.equal(isCurrentCostRecord(bad.best,changed,1),false);
});
test('legacy demo stars, clears and drafts survive without invented costs; new costs archive old records', () => {
  const storage=memory(), options={storage,levels,budgets:{},themeIds:[]};
  const store=createDemoStore(options);store.recordClear(0,fixture(0));store.recordClear(1,fixture(1));
  const raw=JSON.parse(store.exportBackup());const legacy=raw.stages[1];
  for(const field of ['best','bestStars']) {
    for(const key of ['totalCost','pricingVersion','counts','breakdown','stageRules','stageId']) delete legacy[field][key];
    legacy[field].stars=3;
  }
  storage.setItem(SAVE_KEY,JSON.stringify(raw));
  const again=createDemoStore(options);assert.equal(again.state.stages[1].best.totalCost,undefined);
  assert.equal(highestStars(again.state.stages[1],levels,1),3);assert.ok(again.cleared().includes(1));
  assert.deepEqual(again.state.stages[1].draft,raw.stages[1].draft);
  const next=again.recordClear(1,fixture(1));assert.equal(next.record.stars,1);assert.equal(next.highestStars,3);
  assert.equal(again.state.stages[1].previousCostRecords[0].totalCost,undefined);
  assert.deepEqual(createDemoStore(options).state.stages[1].previousCostRecords,again.state.stages[1].previousCostRecords);
});
test('competition ranks use only cost; personal best is deduplicated and own rank is exact', () => {
  const {entries,own}=rankCostEntries([{nickname:'a',totalCost:20},{nickname:'b',totalCost:10},{nickname:'me',totalCost:20},{nickname:'a',totalCost:30},{nickname:'c',totalCost:25}], 'me');
  assert.deepEqual(entries.map(e=>[e.totalCost,e.rank]),[[10,1],[20,2],[20,2],[25,4]]);assert.equal(own.rank,2);
});
test('Firebase adapter recomputes submissions/reads, keeps best transactionally and propagates errors', async () => {
  const values=new Map(); let fail=false;
  const db={ref:path=>({
    transaction:async update=>{if(fail)throw new Error('permission_denied');const next=update(values.get(path)||null);if(next)values.set(path,next);return{committed:!!next};},
    once:async()=>{if(fail)throw new Error('offline');return{forEach:fn=>{for(const [k,v]of values)if(k.startsWith(path+'/'))fn({val:()=>v});}}}
  })};
  const board=createCostLeaderboard({db,levels,getNickname:()=> 'me',ensureNickname:async n=>n});
  await board.submit(1,fixture(1));const before=JSON.stringify([...values]);
  await board.submit(1,fixture(1,2));assert.equal(JSON.stringify([...values]),before);
  const [key,value]=[...values][0]; values.set(key,{...value,totalCost:0,counts:{WIRE:0}});
  assert.equal((await board.load(1)).own.totalCost,calculateCircuitCost(fixture(1)).totalCost);
  const bad=fixture(1);bad.wires={};values.set(key,{...value,circuit:bad});assert.equal((await board.load(1)).entries.length,0);
  await assert.rejects(board.submit(1,bad));await assert.rejects(board.load(0));
  fail=true;await assert.rejects(board.submit(1,fixture(1)));await assert.rejects(board.load(1));
});
test('grading records the exact detached circuit that was verified', async () => {
  const c=fixture(1);let received;
  const grader=createGradingController({getPlayCircuit:()=>c,getLevelAnswer:()=>levels.levelAnswers[1],getLevelBlockSet:()=>levels.levelBlockSets[1],onPassed:(_id,snapshot)=>{received=snapshot;}});
  const pending=grader.gradeLevel(1); c.wires={}; await pending;
  assert.ok(received);assert.ok(Object.keys(received.wires).length);assert.equal(Object.keys(c.wires).length,0);
});

test('all supported components have explicit prices and desktop memory fixtures use the same validator', async () => {
  const { BLOCK_TYPES } = await import('../src/canvas/connections.js');
  assert.deepEqual(new Set(Object.keys(COST_RULES.prices)),new Set([...BLOCK_TYPES,'WIRE']));
  for (const id of [34,35]) {
    const c=JSON.parse(fs.readFileSync(`tests/fixtures/stages/${id}-3.json`,'utf8')).circuit;
    const record=makeCostRecord(c,id,levels);assert.equal(record.stars,1);assert.equal(record.totalCost,calculateCircuitCost(c).totalCost);
  }
});

test('online personal progress only restores matching verified stages and never tutorial or stale prices', async () => {
  const valid={...makeCostRecord(fixture(1),1,levels),nickname:'me'};
  const snap=(value,key='')=>({key,val:()=>value,forEach:fn=>{for(const [k,v]of Object.entries(value)) fn(snap(v,k));}});
  const data={1:{rules:{me:valid,other:{...valid,nickname:'other'},old:{...valid,pricingVersion:'old'}}},0:{rules:{me:{...valid,stageId:0}}}};
  const board=createCostLeaderboard({db:{ref:()=>({once:async()=>snap(data)})},levels,getNickname:()=> 'me'});
  const records=await board.loadPersonal();assert.equal(records.length,1);assert.equal(records[0].totalCost,valid.totalCost);
});

test('AC-6: previous grading records retain designs, stars and clears without becoming current costs', () => {
  assert.equal(GRADING_VERSION, 4);
  const stale = oldRecord(doorShortcut(), 30), passingOld = oldRecord(memoryFixture(29), 29);
  const unrelated = makeCostRecord(fixture(1), 1, levels), storage = memory();
  const key = 'bitwiser:cost-progress:v1:history';
  storage.setItem(key, JSON.stringify({ stages: { 30:{best:stale,bestStars:stale}, 29:{best:passingOld,bestStars:passingOld}, 1:{best:unrelated} } }));
  const open = () => createCostStore({ storage, levels, owner:'history', onFailure:error=>{throw error;} });
  let store = open();
  assert.equal(store.best(30), null); assert.equal(store.best(29), null);
  assert.deepEqual(store.state.stages[30].best, stale);
  assert.equal(store.stars(30), 3); assert.ok(store.cleared().includes(30));
  assert.deepEqual(store.best(1), unrelated);
  const before = JSON.stringify(store.state);
  assert.throws(() => store.recordClear(30, doorShortcut()), /does not pass/);
  assert.equal(JSON.stringify(store.state), before);
  store.persist(); store = open();
  assert.equal(JSON.stringify(store.state), before);
  store.recordClear(30, memoryFixture(30)); store = open();
  assert.ok(isCurrentCostRecord(store.best(30), levels, 30));
  assert.deepEqual(store.state.stages[30].previousCostRecords, [stale]);
  assert.equal(store.stars(30), 3);
  assert.deepEqual(store.state.stages[29].best, passingOld);
  assert.deepEqual(store.best(1), unrelated);
});

test('AC-6: one failed current revalidation is quarantined without resetting other progress or earned stars', () => {
  const rejected = { ...oldRecord(doorShortcut(), 30), gradingVersion:GRADING_VERSION, stageRules:stageRules(levels, 30) };
  const good = { ...makeCostRecord(fixture(1), 1, levels), stars:3 }, storage = memory(), errors = [];
  storage.setItem('bitwiser:cost-progress:v1:local', JSON.stringify({ stages:{30:{best:rejected},1:{best:good}} }));
  const open = () => createCostStore({ storage, levels, onFailure:error=>errors.push(error) });
  const store = open();
  assert.equal(errors.length, 1); assert.equal(store.best(30), null);
  assert.deepEqual(store.state.stages[30].previousCostRecords, [rejected]);
  assert.ok(store.cleared().includes(30)); assert.equal(store.stars(30), 3);
  assert.ok(store.best(1)); assert.equal(store.stars(1), 3);
  store.persist(); assert.deepEqual(open().state, store.state);
  assert.equal(errors.length, 1, 'a quarantined record is not reintroduced as a current best on reload');
});

test('AC-6/7: sync, async, cost submission and ranking reads reject release failures and old-version promotion', async () => {
  const bad = doorShortcut();
  assert.equal(gradeCircuitSync(bad, levels.levelAnswers[30]).status, 'fail');
  assert.equal((await gradeCircuit(bad, levels.levelAnswers[30])).status, 'fail');
  assert.throws(() => makeCostRecord(bad, 30, levels), /does not pass/);
  const stale = { ...oldRecord(bad, 30), nickname:'me' };
  const forged = { ...stale, gradingVersion:GRADING_VERSION, stageRules:stageRules(levels, 30) };
  const good = { ...makeCostRecord(memoryFixture(30), 30, levels), nickname:'other' };
  const snap = (value, key='') => ({key,val:()=>value,forEach:fn=>{for(const [k,v] of Object.entries(value)) fn(snap(v,k));}});
  let transactions = 0;
  const db = { ref:path=>({
    once:async()=>snap(path.split('/').length === 2 ? {30:{current:{forged,good},old:{stale}}} : {stale,forged,good}),
    transaction:async()=>{transactions++;}
  }) };
  const board = createCostLeaderboard({ db, levels, getNickname:()=> 'me', ensureNickname:async n=>n });
  await assert.rejects(board.submit(30, bad), /does not pass/);
  assert.equal(transactions, 0);
  assert.deepEqual((await board.load(30)).entries.map(entry=>entry.nickname), ['other']);
  assert.deepEqual(await board.loadPersonal(), []);
});
