import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStarRewardQueue, effectiveStageStars } from '../src/modules/mapStarCollection.js';
import { createCostStore } from '../src/modules/costRecords.js';
import { createDemoStore, SAVE_KEY } from '../src/demo/store.js';
import { emptyProgress } from '../src/demo/records.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const levels = read('levels.json'), budgets = {};
const fixture = tier => read(`tests/fixtures/demo/1-${tier}.json`).circuit;
const memory = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };

test('499 AC-1/4: only new official star indices are queued; successive improvements coalesce once', () => {
  for (const [before, after, indices] of [[0,1,[0]], [0,3,[0,1,2]], [1,3,[1,2]], [2,3,[2]], [2,2,[]], [3,1,[]], [3,3,[]]]) {
    const queue = createStarRewardQueue(); queue.add(1, before, after);
    assert.deepEqual(queue.take(), indices.length ? [{ id: 1, indices }] : []);
    assert.deepEqual(queue.take(), []);
  }
  const queue = createStarRewardQueue();
  queue.add(1, 0, 1); queue.add(1, 1, 2); queue.add(1, 2, 3); queue.add(1, 1, 3);
  assert.deepEqual(queue.take(), [{ id: 1, indices: [0,1,2] }]);
  for (const id of [0, -1, 48, 'custom', null]) assert.equal(queue.add(id, 0, 3), false);
  assert.deepEqual(queue.take(), []);
});

test('499 AC-1: historical progress and retained access stars count before a real clear', () => {
  assert.equal(effectiveStageStars(1, [1]), 1);
  assert.equal(effectiveStageStars(1, [1], { 1: 3 }, 2), 3);
  assert.equal(effectiveStageStars(0, [0], { 0: 3 }, 3), 0);
  assert.equal(effectiveStageStars(99, [99], { 99: 3 }, 3), 0);
  // A sync in between clears must not turn its additional star into a reward.
  const queue = createStarRewardQueue(); queue.add(1, 0, 1); queue.add(1, 2, 3);
  assert.deepEqual(queue.take(), [{ id: 1, indices: [0,2] }]);
});

test('499 AC-1/6: full and demo verified records preserve stars through lower submissions and session restart', () => {
  for (const demo of [false, true]) {
    const storage = memory();
    if (demo) storage.setItem(SAVE_KEY, JSON.stringify({ ...emptyProgress(), stages: { 1: { historicalClear: true, highestStars: 2 } } }));
    else storage.setItem('bitwiser:cost-progress:v1:collection', JSON.stringify({ stages: { 1: { historicalClear: true, highestStars: 2 } } }));
    const make = () => demo ? createDemoStore({ storage, levels, budgets, themeIds: ['midnight-neon'] }) : createCostStore({ storage, levels, owner: 'collection' });
    const store = make();
    const stars = () => effectiveStageStars(1, store.cleared(), store.state.stageStars, demo ? store.state.stages[1].highestStars : store.stars(1));
    const queue = createStarRewardQueue(), before = stars();
    store.recordClear(1, fixture(3)); queue.add(1, before, stars());
    assert.deepEqual(queue.take(), [{ id: 1, indices: [2] }]);
    const best = stars(); store.recordClear(1, fixture(2)); queue.add(1, best, stars());
    assert.deepEqual(queue.take(), []);
    const reloaded = make();
    assert.equal(reloaded.state.stages[1].highestStars, 3);
    assert.deepEqual(createStarRewardQueue().take(), []);
  }
});
