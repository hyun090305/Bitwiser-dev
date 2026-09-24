import { calculateCircuitCost, validateStarThresholds } from '../src/modules/circuitCost.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEMO_IDS, DEMO_NODES, DEMO_NODE_LEVELS, isUnlocked, demoMap } from '../src/demo/catalog.js';
import { STAGES } from '../src/modules/stageCatalog.js';
import { getCircuitStats, isValidWirePath } from '../src/canvas/circuitData.js';
import { validateCircuit, makeRecord, awardStars, validateProgress, passesStage, emptyProgress } from '../src/demo/records.js';
import { stageRules, isCurrentCostRecord, highestStars } from '../src/modules/costRecords.js';
import { GRADING_VERSION, gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { snapshotCircuit } from '../src/canvas/circuitData.js';
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
test('chapter access permits all Logic Core stages and forbids excluded stages', () => {
  assert.equal(isUnlocked(0,[]),true); assert.equal(isUnlocked(1,[]),true);
  assert.equal(isUnlocked(4,[0,1,2]),true); assert.equal(isUnlocked(6,[0,1,2]),true);
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

test('AC-6/7: old button-release failures preserve full demo history across save, reload and backup import', () => {
  const circuit = read('tests/fixtures/observations/30-shortcut.json').circuit;
  const record = (c, id) => {
    const rules = JSON.parse(stageRules(levels, id)); rules[0] = 3;
    return { circuitVersion:3, circuit:snapshotCircuit(c), gradingVersion:3, stageId:id,
      stageRules:JSON.stringify(rules), ...getCircuitStats(c), ...calculateCircuitCost(c), stars:3 };
  };
  const old = record(circuit, 30), passingOld = record(fixture(29), 29), unrelated = makeRecord(fixture(1), 1, levels);
  const raw = emptyProgress(); raw.gradingVersion = 3; raw.lastStageId = 30;
  raw.unlockedStages = [29,30]; raw.unlockedChapters = ['chapter_2'];
  raw.stages = {30:{best:old,bestStars:structuredClone(old),draft:{circuitVersion:3,circuit:snapshotCircuit(fixture(30))}},
    29:{best:passingOld,bestStars:passingOld},1:{best:unrelated,bestStars:unrelated}};
  delete raw.stages[30].bestStars.gradingVersion; // Pre-record-version legacy data uses its container's version.
  raw.hints[30] = 1; raw.settings = {lang:'en',bgmEnabled:false};
  const storage = memoryStorage(); storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const open = () => createDemoStore({...options,storage,onFailure:error=>{throw error;}});
  let store = open();
  assert.equal(store.state.gradingVersion, GRADING_VERSION);
  assert.deepEqual(store.state.stages[30].best, old);
  assert.equal(store.state.stages[30].bestStars.gradingVersion, 3);
  assert.equal(highestStars(store.state.stages[30], levels, 30), 3);
  assert.ok(store.cleared().includes(30)); assert.ok(store.isUnlocked(30));
  assert.equal(isCurrentCostRecord(store.state.stages[30].best, levels, 30), false);
  assert.equal(isCurrentCostRecord(store.state.stages[29].best, levels, 29), false);
  assert.deepEqual(store.state.stages[1].best, unrelated);
  assert.deepEqual(store.state.stages[30].draft, raw.stages[30].draft);
  assert.deepEqual(store.state.hints, raw.hints); assert.deepEqual(store.state.settings, raw.settings);
  const before = store.exportBackup();
  assert.throws(() => store.recordClear(30, circuit), /does not pass/);
  assert.equal(store.exportBackup(), before);
  assert.equal(store.replace(store.parseBackup(before)), true); store = open();
  assert.equal(store.exportBackup(), before);
  store.recordClear(30, fixture(30)); store = open();
  assert.ok(isCurrentCostRecord(store.state.stages[30].best, levels, 30));
  assert.deepEqual(store.state.stages[30].previousCostRecords, [old]);
  assert.deepEqual(store.state.stages[30].bestStars.circuit, old.circuit);
  assert.equal(highestStars(store.state.stages[30], levels, 30), 3);
  const exported = store.exportBackup();
  assert.equal(store.replace(store.parseBackup(exported)), true);
  assert.equal(open().exportBackup(), exported);
  const falselyCurrent = JSON.parse(before);
  falselyCurrent.gradingVersion = 3;
  falselyCurrent.stages[30].best.gradingVersion = GRADING_VERSION;
  falselyCurrent.stages[30].best.stageRules = stageRules(levels, 30);
  assert.throws(() => store.parseBackup(JSON.stringify(falselyCurrent)), /does not pass/);
  assert.equal(store.exportBackup(), exported);
});

test('AC-6: local current-record revalidation isolates failures while backup import remains strict', () => {
  const invalid = { ...makeRecord(fixture(30), 30, levels),
    circuit:snapshotCircuit(read('tests/fixtures/observations/30-shortcut.json').circuit), stars:3 };
  const good = makeRecord(fixture(1), 1, levels), survivor = makeRecord(fixture(29), 29, levels);
  const failingStars = { ...survivor, circuit:{...survivor.circuit,wires:{}}, stars:3 };
  const raw = emptyProgress(); raw.lastStageId = 30;
  raw.unlockedStages = [29,30]; raw.unlockedChapters = ['chapter_2'];
  raw.stages = {1:{best:good,bestStars:good},
    29:{best:survivor,bestStars:failingStars},
    30:{best:invalid,bestStars:invalid,draft:{circuitVersion:3,circuit:invalid.circuit}}};
  raw.hints = {30:1}; raw.settings = {lang:'en',bgmEnabled:false};
  const storage = memoryStorage(); storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const open = () => createDemoStore({...options,storage,onFailure:error=>{throw error;}});
  let store = open();
  assert.deepEqual(store.state.stages[1].best, good);
  assert.deepEqual(store.state.stages[29].best, survivor);
  assert.deepEqual(store.state.stages[29].bestStars, survivor);
  assert.equal(highestStars(store.state.stages[29], levels, 29), 3);
  assert.deepEqual(store.state.stages[29].previousCostRecords, [failingStars]);
  assert.equal(store.state.stages[30].best, undefined);
  assert.equal(store.state.stages[30].bestStars, undefined);
  assert.deepEqual(store.state.stages[30].previousCostRecords, [invalid,invalid]);
  assert.deepEqual(store.state.stages[30].draft, raw.stages[30].draft);
  assert.equal(highestStars(store.state.stages[30], levels, 30), 3);
  assert.ok(store.cleared().includes(30)); assert.ok(store.isUnlocked(30));
  assert.deepEqual(store.state.hints, raw.hints); assert.deepEqual(store.state.settings, raw.settings);
  const restored = store.exportBackup();
  assert.throws(() => store.parseBackup(JSON.stringify(raw)), /does not pass/);
  assert.equal(store.exportBackup(), restored);
  store.persist(); store = open();
  assert.deepEqual(JSON.parse(store.exportBackup()), JSON.parse(restored), 'startup quarantine is stable across persistence and reload');
  assert.equal(store.replace(store.parseBackup(restored)), true);
  assert.deepEqual(JSON.parse(open().exportBackup()), JSON.parse(restored), 'exported history is accepted without promoting its failed records');
  store.recordClear(30, fixture(30)); store = open();
  assert.ok(isCurrentCostRecord(store.state.stages[30].best, levels, 30));
  assert.equal(highestStars(store.state.stages[30], levels, 30), 3);
  assert.deepEqual(store.state.stages[30].previousCostRecords, [invalid,invalid]);
});

test('AC-6/7: a local sequential revalidation time limit preserves progress without creating a current best', t => {
  const normal = makeRecord(fixture(30), 30, levels), unrelated = makeRecord(fixture(1), 1, levels);
  const raw = emptyProgress(); raw.unlockedStages = [30]; raw.lastStageId = 30;
  raw.stages = {1:{best:unrelated,bestStars:unrelated},30:{best:normal,bestStars:normal}};
  const storage = memoryStorage(); storage.setItem(SAVE_KEY, JSON.stringify(raw));
  let now = 0;
  t.mock.method(performance, 'now', () => now += 10001);
  const limited = gradeCircuitSync(normal.circuit, levels.levelAnswers[30]);
  assert.equal(limited.status, 'incomplete'); assert.equal(limited.reason, 'TIME_LIMIT');
  const store = createDemoStore({...options,storage,onFailure:error=>{throw error;}});
  assert.deepEqual(store.state.stages[1].previousCostRecords, [unrelated,unrelated]);
  assert.ok(store.cleared().includes(1));
  assert.equal(store.state.stages[30].best, undefined);
  assert.ok(store.cleared().includes(30)); assert.ok(store.isUnlocked(30));
  assert.deepEqual(store.state.stages[30].previousCostRecords, [normal,normal]);
  assert.equal(highestStars(store.state.stages[30], levels, 30), normal.stars);
  store.persist(); t.mock.restoreAll();
  const reloaded = createDemoStore({...options,storage,onFailure:error=>{throw error;}});
  assert.deepEqual(reloaded.state, store.state);
  assert.equal(reloaded.state.stages[30].best, undefined, 'finishing a later load does not promote archived results');
});
