import { calculateCircuitCost, validateStarThresholds } from '../src/modules/circuitCost.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEMO_IDS, DEMO_NODES, DEMO_NODE_LEVELS, isUnlocked, demoMap } from '../src/demo/catalog.js';
import { STAGES } from '../src/modules/stageCatalog.js';
import { getCircuitStats, isValidWirePath } from '../src/canvas/circuitData.js';
import { validateCircuit, makeRecord, awardStars, validateProgress, passesStage } from '../src/demo/records.js';
import { createDemoStore, SAVE_KEY } from '../src/demo/store.js';
const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const levels = read('levels.json');
const fixture = (id, tier = 3) => read(`tests/fixtures/demo/${id}-${id === 0 ? 'tutorial' : tier}.json`).circuit;
const budgetIds = DEMO_IDS.filter(id => id !== 0 && STAGES.find(s => s.id === id)?.budgetStatus !== 'pending');
const budgets = Object.fromEntries(budgetIds.map(id => [id, Object.fromEntries([2,3].map(tier => [tier, getCircuitStats(fixture(id,tier))]))]));
function memoryStorage() {
  const map = new Map();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
const options = { levels, budgets, themeIds: ['soft-glow'] };
function setup(extra = {}) { const storage = memoryStorage(); return { storage, store: createDemoStore({ ...options, storage, ...extra }) }; }
function unlock(store, to) { for (const id of [0,1,2,3].filter(id => id < to)) store.recordClear(id, fixture(id)); }

test('all shipped puzzles keep null cost targets and passing fixtures earn one star', () => {
  const en = read('levels_en.json');
  for (const id of [0,...budgetIds]) {
    for (const key of ['levelGridSizes','levelBlockSets','levelAnswers','levelFixedIO']) assert.deepEqual(levels[key]?.[id], en[key]?.[id]);
    for (const tier of id === 0 ? [0] : [2,3]) {
      const circuit = fixture(id, tier);
      const record = makeRecord(circuit, id, levels, budgets);
      assert.equal(record.stars, id === 0 ? 0 : 1);
      assert.ok(passesStage(circuit, id, en));
      if (id) {
        assert.ok(budgets[id][3].usedBlocks <= budgets[id][2].usedBlocks);
        assert.ok(budgets[id][3].usedWires < budgets[id][2].usedWires);
      }
    }
  }
});
test('cost stars include boundaries and award three directly', () => {
  const thresholds = { 1: { twoStarMaxCost: 20, threeStarMaxCost: 12 } };
  for (const [totalCost, stars] of [[11,3],[12,3],[13,2],[20,2],[21,1]]) assert.equal(awardStars(1,{totalCost},thresholds), stars);
  for (const id of Object.keys(levels.levelTitles).filter(id => id !== '0')) assert.equal(validateStarThresholds(levels.levelStarThresholds[id]).status, 'pending');
});
test('counts include INPUT/OUTPUT/JUNCTION and deduplicate intermediate cells', () => {
  assert.deepEqual(getCircuitStats({ blocks: {a:{type:'INPUT'},b:{type:'OUTPUT'},c:{type:'JUNCTION'}}, wires: {
    a:{path:[{r:0,c:0},{r:0,c:1},{r:0,c:2}]}, b:{path:[{r:1,c:1},{r:0,c:1},{r:0,c:2}]}
  }}), { blockCounts: {INPUT:1,OUTPUT:1,JUNCTION:1}, usedBlocks:3, usedWires:1 });
});
test('branch graph permits XOR without optional NOR/NAND and forbids excluded stages', () => {
  assert.equal(isUnlocked(0,[]),true); assert.equal(isUnlocked(1,[]),false);
  assert.equal(isUnlocked(4,[0,1,2]),true); assert.equal(isUnlocked(6,[0,1,2]),false);
  assert.equal(isUnlocked(6,[0,1,2,3]),true);
  for (const id of [-1,8,19,24,32,null,'6',NaN]) assert.equal(isUnlocked(id,DEMO_IDS),false);
  const fullMap = read('stage_map.json');
  const excluded = fullMap.nodes.filter(n => n.nodeType === 'stage' && !DEMO_NODES.includes(n.id));
  for (const node of excluded) Object.assign(node, { levelId: 24, mission: 'secret mission', answer: [1], palette: ['XOR'] });
  const map = demoMap(fullMap);
  assert.equal(map.nodes.filter(n => n.nodeType === 'stage').length,17); assert.equal(map.chapters.length,6);
  const placeholders = map.nodes.filter(n => n.id.startsWith('preview_stage_'));
  assert.equal(placeholders.length, 0);
  for (const node of placeholders) {
    assert.match(node.label, /^STAGE \d{2}$/);
    assert.equal(node.previewFeature, 'stages');
    assert.deepEqual(Object.keys(node).sort(), ['chapterId','id','label','nodeType','position','previewFeature','size']);
    assert.equal(DEMO_NODE_LEVELS[node.id], undefined);
  }
  for (const node of excluded) assert.ok(!JSON.stringify(map).includes(`"${node.id}"`));
  assert.equal(map.nodes.find(n => n.id === 'lab').previewFeature, 'sandbox');
  assert.equal(map.nodes.find(n => n.id === 'user_created_stages').previewFeature, 'problems');
  assert.ok(map.edges.every(e => map.nodes.some(n=>n.id===e.from) && map.nodes.some(n=>n.id===e.to)));
});
test('bad grade cannot overwrite progress; one star still unlocks', () => {
  const {store}=setup(); store.recordClear(0, fixture(0));
  const bad=fixture(1); delete bad.wires.w0;
  const before=store.exportBackup(); assert.throws(()=>store.recordClear(1,bad)); assert.equal(store.exportBackup(),before);
  const one=fixture(1,2); one.blocks.extra={id:'extra',type:'NOT',pos:{r:5,c:0},value:false};
  assert.equal(store.recordClear(1,one).record.stars,1); assert.ok(store.isUnlocked(2));
});
test('best cost, historical stars, and draft remain independent', () => {
  const {store,storage}=setup(); unlock(store,2);
  store.recordClear(2,fixture(2));
  const prior = store.state.stages[2].best;
  store.state.stages[2].bestStars = {...prior, stars:3}; // historically earned
  store.state.stages[2].highestStars = 3;
  const expensive=fixture(2); expensive.blocks.extra={id:'extra',type:'OR',pos:{r:5,c:5},value:false};
  const result=store.recordClear(2,expensive);
  assert.equal(result.improved,false); assert.equal(result.record.stars,1);
  assert.equal(store.state.stages[2].best.totalCost,prior.totalCost);
  const draft=fixture(2); draft.wires={}; store.setDraft(2,draft);
  const again=createDemoStore({...options,storage});
  assert.equal(Object.keys(again.state.stages[2].draft.circuit.wires).length,0);
  assert.equal(again.state.stages[2].best.totalCost,prior.totalCost);
  assert.equal(again.state.stages[2].bestStars.stars,3); assert.ok(again.isUnlocked(3));
});
test('backups round-trip, recalculate claims, and reject invalid input without writes', () => {
  const {store,storage}=setup(); unlock(store,4); store.recordClear(6,fixture(6));
  store.state.hints[6]=2;
  store.state.settings={lang:'en',bitwiserTheme:'soft-glow',bgmEnabled:false}; store.persist();
  const backup=store.exportBackup(); const parsed=store.parseBackup(backup); assert.equal(store.replace(parsed),true);
  assert.deepEqual(JSON.parse(store.exportBackup()),JSON.parse(backup));
  const changed=JSON.parse(backup); changed.stages[6].best.usedBlocks=0; changed.stages[6].best.stars=0;
  assert.equal(store.parseBackup(JSON.stringify(changed)).stages[6].best.usedBlocks,7);
  const committed = storage.getItem(SAVE_KEY);
  for (const mutate of [b=>b.version=22,b=>b.stages[1000]={},b=>b.stages[6].draft.circuit.rows=10,b=>b.hints[6]=3,b=>b.settings.token='secret',b=>b.lastStageId=1000,b=>b.stages[6].best.circuit.wires={}]) {
    const b=JSON.parse(backup); mutate(b); assert.throws(()=>store.parseBackup(JSON.stringify(b)));
    assert.equal(storage.getItem(SAVE_KEY), committed);
  }
  assert.throws(()=>store.parseBackup('{')); assert.throws(()=>store.parseBackup(' '.repeat(1024*1024+1)));
});
test('storage denial/quota never claim success and failed replacement keeps current state', () => {
  const failures=[]; const {store,storage}=setup({onFailure:e=>failures.push(e)}); store.recordClear(0,fixture(0));
  const next=store.parseBackup(store.exportBackup()); next.settings.lang='en';
  storage.setItem=()=>{throw new Error('QuotaExceededError');};
  const before=store.exportBackup(); assert.equal(store.replace(next),false); assert.equal(store.exportBackup(),before);
  assert.equal(store.recordClear(1,fixture(1)).saved,false); assert.ok(store.isUnlocked(2)); assert.ok(failures.length);
  const unavailable=createDemoStore({...options,onFailure:()=>{}}); assert.equal(unavailable.recordClear(0,fixture(0)).saved,false);
});
test('corrupt local data is preserved; illegal wire geometry is rejected by shared editor rule', () => {
  const storage=memoryStorage(); storage.setItem(SAVE_KEY,'damaged');
  const store=createDemoStore({...options,storage,onFailure:()=>{}}); assert.deepEqual(store.cleared(),[]);
  store.recordClear(0,fixture(0)); assert.equal(storage.getItem(SAVE_KEY+':recovery'),'damaged');
  for(const mutate of [c=>c.wires.w0.path[1].r=5,c=>c.blocks.g.pos={r:1,c:1},c=>c.wires.w0.endBlockId='missing',c=>c.blocks.a.name='IN99',c=>c.blocks.g.type='XOR']) {
    const c=fixture(1); mutate(c); assert.throws(()=>validateCircuit(c,1,levels));
  }
  const c=fixture(1); c.wires.w0.path=[c.blocks.a.pos,c.blocks.g.pos]; assert.throws(()=>validateCircuit(c,1,levels));
});
