import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getReferenceFSM, STAGE_REFERENCE_IDS } from '../src/modules/referenceFSM.js';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { createExecutionState, tickCircuit, evaluateCombinational } from '../src/canvas/evaluation.js';
import { snapshotCircuit } from '../src/canvas/circuitData.js';
import { validateStageCircuit } from '../src/modules/stageCircuit.js';
import { makeCostRecord, isCurrentCostRecord, createCostStore } from '../src/modules/costRecords.js';
import { emptyProgress } from '../src/demo/records.js';
import { createDemoStore, SAVE_KEY } from '../src/demo/store.js';
import { stageById, canPlayStage } from '../src/modules/stageCatalog.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const levels = read('levels.json'), en = read('levels_en.json');
const fixture = () => read('tests/fixtures/memory20/29.json').circuit;
const reference = getReferenceFSM(levels.levelAnswers[29].referenceId);
const twoBitDefinition = levels.levelPreviousLayouts[29].find(definition =>
  definition.levelAnswers.referenceId === 'memory20:C5-04' && definition.levelGridSizes.join('x') === '20x24');
const storageFor = entries => {
  const values = new Map(entries);
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

test('AC-1/5: response check has bilingual Button ports, free 12x12 IO and a distinct revision', () => {
  assert.equal(levels.levelTitles[29], '응답 확인');
  assert.equal(en.levelTitles[29], 'Response Check');
  assert.deepEqual(levels.levelGridSizes[29], [12, 12]);
  const solution = fixture(), points = [...Object.values(solution.blocks).map(b => b.pos), ...Object.values(solution.wires).flatMap(w => w.path)];
  assert.equal(Math.min(...points.map(p => p.r)), 1);
  assert.equal(Math.max(...points.map(p => p.r)), solution.rows - 3);
  assert.equal(Math.min(...points.map(p => p.c)), 1);
  assert.equal(Math.max(...points.map(p => p.c)), solution.cols - 2);
  assert.deepEqual(levels.levelFixedIO[29], { fixIO: false, grid: [] });
  assert.deepEqual(levels.levelBlockSets[29], [
    { type: 'INPUT', name: 'A', inputMode: 'button' },
    { type: 'INPUT', name: 'B', inputMode: 'button' },
    { type: 'OUTPUT', name: 'GO' }, ...['D', 'NOT', 'AND', 'OR', 'JUNCTION'].map(type => ({ type }))
  ]);
  for (const key of ['levelAnswers', 'levelBlockSets', 'levelFixedIO', 'levelGridSizes', 'levelRevisions', 'levelStarThresholds']) {
    assert.deepEqual(levels[key][29], en[key][29]);
  }
  assert.deepEqual(levels.levelDescriptions[29].table, en.levelDescriptions[29].table);
  assert.equal(levels.levelAnswers[29].referenceId, 'memory20:response-check');
  assert.equal(STAGE_REFERENCE_IDS[29], 'memory20:response-check');
  assert.equal(levels.levelRevisions[29], 'response-check-2026-09-24');
  assert.deepEqual(levels.levelStarThresholds[29], { twoStarMaxCost: 120, threeStarMaxCost: 95 });
  for (const data of [levels, en]) {
    assert.doesNotMatch(JSON.stringify([data.levelDescriptions[29], data.levelHints.stage29]), /WRITE|COMMIT|RESET|Q0|Q1/);
    for (const c of [fixture(), ...[2, 3].map(tier => read(`tests/fixtures/demo/29-${tier}.json`).circuit)]) {
      validateStageCircuit(c, 29, data);
      assert.equal(gradeCircuitSync(c, data.levelAnswers[29]).ok, true);
    }
  }
  assert.equal(stageById(29).nodeId, 'staging_register');
});

test('AC-2/3/4: all behavioral states and inputs match an independent pending-path table', () => {
  // Rows: nothing pending, A pending, B pending. Columns: -, A, B, AB.
  // Each entry names the next pending path and this tick\'s output.
  const table = [
    [[0,0],[1,0],[2,0],[0,1]],
    [[1,0],[1,0],[0,1],[0,1]],
    [[2,0],[0,1],[2,0],[0,1]]
  ];
  const known = new Map([['0:0', reference.initialState]]), queue = ['0:0'];
  assert.equal(reference.stateCount, 4);
  assert.equal(reference.observeAt, 'after_tick');
  for (const key of queue) for (let input = 0; input < 4; input++) {
    const [pending, pulse] = key.split(':').map(Number);
    const [next, output] = table[pending][input];
    const actual = reference.evaluate(known.get(key), input), nextKey = `${next}:${output}`;
    assert.equal(reference.observe(known.get(key), input), pulse, 'input changes preserve the current pulse');
    assert.equal(actual.outputs, output, `${pending}/${input}`);
    if (!known.has(nextKey)) { known.set(nextKey, actual.nextState); queue.push(nextKey); }
    assert.equal(actual.nextState, known.get(nextKey));
    assert.equal(reference.step(known.get(key), input), actual.nextState);
  }
  assert.equal(known.size, 4);
  for (const pending of [1, 2]) {
    assert.equal(reference.step(known.get(`${pending}:0`), 0), known.get(`${pending}:0`), 'idle is an indefinite self-loop');
  }
});

test('AC-2/3/4/5: actual ticks cover waiting, duplicates, consumption and consecutive checks', () => {
  const cases = [
    [[1, ...Array(256).fill(0), 2], [...Array(257).fill(0), 1]],
    [[2, ...Array(256).fill(0), 1], [...Array(257).fill(0), 1]],
    [[1,1,2,2,0], [0,0,1,0,0]], [[2,2,1,1,0], [0,0,1,0,0]],
    [[3,0,0], [1,0,0]], [[0,0,0], [0,0,0]],
    [[1,3,2], [0,1,0]], [[2,3,1], [0,1,0]],
    [[1,2,2,1], [0,1,0,1]], [[3,3,0], [1,1,0]]
  ];
  for (const [inputs, expected] of cases) {
    const c = fixture(), state = createExecutionState(c), actual = [];
    let refState = reference.initialState;
    for (const mask of inputs) {
      const before = new Map(state.memory);
      evaluateCombinational(c, { memory: state.memory, inputs: new Map([['A', !!(mask & 1)], ['B', !!(mask & 2)]]) });
      assert.deepEqual(state.memory, before, 'input preview must not advance memory');
      const result = tickCircuit(c, state, { inputs: new Map([['A', !!(mask & 1)], ['B', !!(mask & 2)]]), display: false });
      assert.equal(result.ok, true);
      const step = reference.evaluate(refState, mask); refState = step.nextState;
      actual.push(Number(result.values.get('OUT_GO')));
      assert.equal(actual.at(-1), step.outputs);
    }
    assert.deepEqual(actual, expected);
    assert.ok(Object.values(snapshotCircuit(c).blocks).filter(b => b.type === 'D').every(b => !b.value));
  }
});

test('AC-5: grader rejects forgotten, queued, retained, delayed and latched responses with after-tick counterexamples', () => {
  const add = (c, id, type, sources) => {
    c.blocks[id] = { id, type, pos: {r:17,c:10} };
    sources.forEach((src,i) => { const key = `${id}_${i}`; c.wires[key] = { id:key, startBlockId:src, endBlockId:id, path:[], ...(type==='D'?{inputRole:'D'}:{}) }; });
  };
  const cases = [
    c => { c.blocks.HAVE_A.type = 'AND'; }, // Cannot retain an early response.
    c => { c.blocks.NEXT_A.type = 'OR'; }, // Reuses a consumed response.
    c => { // Incorrectly queues a second A for the next confirmation.
      add(c, 'EXTRA_A', 'D', ['EXTRA_NEXT']);
      add(c, 'REPEAT_A', 'AND', ['SEEN_A', 'A']);
      add(c, 'EXTRA_HAVE', 'OR', ['EXTRA_A', 'REPEAT_A']);
      add(c, 'EXTRA_NEXT', 'AND', ['EXTRA_HAVE', 'NOT_READY']);
      add(c, 'KEEP_A', 'OR', ['NOT_READY', 'EXTRA_HAVE']);
      Object.values(c.wires).find(w => w.endBlockId==='NEXT_A' && w.startBlockId==='NOT_READY').startBlockId='KEEP_A';
    },
    c => { // One extra register delays the output by a tick.
      c.blocks.DELAY = { id: 'DELAY', type: 'D', pos: { r: 17, c: 10 } };
      c.wires.delay = { id: 'delay', startBlockId: 'PULSE', endBlockId: 'DELAY', inputRole: 'D', path: [] };
      Object.values(c.wires).find(w => w.endBlockId === 'OUT_GO').startBlockId = 'DELAY';
    },
    c => { // Latches completion instead of clearing it next tick.
      c.blocks.LATCH = { id: 'LATCH', type: 'OR', pos: { r: 17, c: 10 } };
      for (const id of ['READY', 'PULSE']) c.wires[`latch_${id}`] = { id: `latch_${id}`, startBlockId: id, endBlockId: 'LATCH', path: [] };
      Object.values(c.wires).find(w => w.endBlockId === 'PULSE').startBlockId = 'LATCH';
    }
  ];
  for (const mutate of cases) {
    const c = fixture(); mutate(c);
    const result = gradeCircuitSync(c, levels.levelAnswers[29]);
    assert.equal(result.status, 'fail');
    assert.ok(result.counterexample.ticks.length || result.counterexample.observe);
    assert.ok(result.trace.some(event => event.type === 'tick'));
    assert.equal(result.trace.at(-1).type, 'expect');
  }
});

test('AC-7: both old definitions still grade their original circuits and cannot become current records', () => {
  const definitions = [levels.levelLegacyDefinitions[29], twoBitDefinition];
  const files = ['29.json', '29-2bit.json'];
  for (const [i, definition] of definitions.entries()) {
    const c = read(`tests/fixtures/legacy-memory/${files[i]}`).circuit;
    const oldLevels = { ...levels, ...Object.fromEntries(Object.entries(definition).map(([key, value]) => [key, { 29: value }])) };
    validateStageCircuit(c, 29, oldLevels);
    assert.equal(gradeCircuitSync(c, definition.levelAnswers).ok, true);
    assert.equal(isCurrentCostRecord(makeCostRecord(c, 29, oldLevels), levels, 29), false);
    assert.equal(gradeCircuitSync(c, levels.levelAnswers[29]).ok, false);
  }
  const old = read('tests/fixtures/legacy-memory/29-2bit.json').circuit, state = createExecutionState(old);
  const outputs = [{D0:1,WRITE:1,COMMIT:1},{D1:1,WRITE:1,COMMIT:1},{COMMIT:1}].map(input => {
    const result = tickCircuit(old, state, { inputs: new Map(Object.entries(input).map(([name,value]) => [name,Boolean(value)])), display: false });
    return ['OUT_Q0', 'OUT_Q1'].map(id => Number(result.values.get(id)));
  });
  assert.deepEqual(outputs, [[0,0],[1,0],[0,1]], 'the old simultaneous WRITE/COMMIT contract remains available');
});

test('AC-7: demo reload, new clear and backup round-trip preserve both old designs, records and chapter access', () => {
  const one = read('tests/fixtures/legacy-memory/29.json').circuit;
  const two = read('tests/fixtures/legacy-memory/29-2bit.json').circuit;
  const record = circuit => ({ circuitVersion: 3, circuit, stars: 3, totalCost: 777, pricingVersion: 'historical' });
  const old = emptyProgress(); old.lastStageId = 29; old.unlockedStages = [29];
  const prior = { draft: record(one), best: record(one), bestStars: record(one) };
  old.stages[29] = { draft: record(two), best: record(two), bestStars: record(two), legacyStageRecords: [prior] };
  const storage = storageFor([[SAVE_KEY, JSON.stringify(old)]]);
  const open = () => createDemoStore({ storage, levels, budgets: {}, themeIds: [], onFailure: error => { throw error; } });
  let store = open();
  assert.equal(store.state.stages[29].best, undefined);
  assert.equal(store.state.stages[29].draft, undefined);
  assert.equal(store.state.stages[29].highestStars, 3);
  const archived = structuredClone(store.state.stages[29].legacyStageRecords);
  assert.equal(archived.length, 2);
  for (const [i, c] of [one, two].entries()) {
    for (const key of ['draft', 'best', 'bestStars']) assert.deepEqual(archived[i][key].circuit, snapshotCircuit(c));
    assert.equal(archived[i].best.totalCost, 777);
  }
  assert.ok(store.isUnlocked(29)); assert.ok(store.isUnlocked(30));
  store.setDraft(29, fixture()); store = open();
  store.recordClear(29, fixture()); store = open();
  assert.ok(isCurrentCostRecord(store.state.stages[29].best, levels, 29));
  assert.deepEqual(store.state.stages[29].legacyStageRecords, archived);
  const exported = store.exportBackup();
  assert.equal(store.replace(store.parseBackup(exported)), true);
  assert.deepEqual(open().state, JSON.parse(exported));
  assert.ok(store.isUnlocked(30));
});

test('AC-7: resizing preserves the previous 14x17 response-check save and backup', () => {
  const definition = levels.levelPreviousLayouts[29].find(item =>
    item.levelAnswers.referenceId === 'memory20:response-check' && item.levelGridSizes.join('x') === '14x17');
  assert.ok(definition);
  const oldLevels = { ...levels, ...Object.fromEntries(Object.entries(definition).map(([key, value]) => [key, {29: value}])) };
  const circuit = read('tests/fixtures/legacy-memory/29-response-check-14x17.json').circuit;
  const record = makeCostRecord(circuit, 29, oldLevels);
  assert.equal(isCurrentCostRecord(record, levels, 29), false);
  const old = emptyProgress(); old.lastStageId = 29; old.unlockedStages = [29];
  old.stages[29] = { draft: record, best: record, bestStars: record };
  const storage = storageFor([[SAVE_KEY, JSON.stringify(old)]]);
  const open = () => createDemoStore({ storage, levels, budgets: {}, themeIds: [], onFailure: error => { throw error; } });
  let store = open();
  assert.equal(store.state.stages[29].draft, undefined);
  assert.equal(store.state.stages[29].best, undefined);
  const archived = structuredClone(store.state.stages[29].legacyStageRecords);
  for (const key of ['draft', 'best', 'bestStars']) assert.deepEqual(archived[0][key], record);
  assert.ok(store.isUnlocked(29)); assert.ok(store.isUnlocked(30));
  store.setDraft(29, fixture()); store.recordClear(29, fixture()); store = open();
  assert.ok(isCurrentCostRecord(store.state.stages[29].best, levels, 29));
  const backup = store.exportBackup();
  assert.equal(store.replace(store.parseBackup(backup)), true);
  assert.deepEqual(open().state.stages[29].legacyStageRecords, archived);
});

test('AC-7: full cost history remains distinct while a new response-check clear is recorded', () => {
  const definition = twoBitDefinition;
  const oldLevels = { ...levels, ...Object.fromEntries(Object.entries(definition).map(([key,value]) => [key, {29:value}])) };
  const previous = makeCostRecord(read('tests/fixtures/legacy-memory/29-2bit.json').circuit, 29, oldLevels);
  previous.stars = 3;
  const storage = storageFor([['bitwiser:cost-progress:v1:response-test', JSON.stringify({ stages: {29:{best:previous,bestStars:previous,highestStars:3}} })]]);
  const open = () => createCostStore({ storage, owner: 'response-test', levels, onFailure: error => { throw error; } });
  let store = open();
  assert.equal(store.best(29), null); assert.equal(store.stars(29), 3);
  assert.deepEqual(store.cleared(), [29]);
  assert.ok(canPlayStage(29, store.cleared()));
  store.recordClear(29, fixture()); store = open();
  assert.ok(store.best(29));
  assert.deepEqual(store.state.stages[29].previousCostRecords, [previous]);
  assert.equal(store.stars(29), 3);
});
