import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackPolicy } from '../src/canvas/playbackPolicy.js';
import { createTickRunner } from '../src/canvas/tickRunner.js';
import { evaluateCircuit, getExecutionState } from '../src/canvas/engine.js';
import { selfFeedbackCircuit } from './helpers/connection-circuits.mjs';

function setup(enabled = true) {
  const circuit = selfFeedbackCircuit();
  evaluateCircuit(circuit);
  let runnable = true, editing = false, pending = null, policy;
  const runner = createTickRunner(circuit, { canRun: () => policy.canRun(),
    schedule: fn => { pending = fn; return fn; }, cancel: () => { pending = null; } });
  policy = createPlaybackPolicy(runner, { enabled, canRun: () => runnable, isEditing: () => editing });
  return { circuit, runner, policy, runnable: value => { runnable = value; }, editing: value => { editing = value; },
    fire: () => { const fn = pending; pending = null; fn?.(); }, pending: () => Boolean(pending) };
}

test('autoplay waits for readiness and schedules without immediately changing runtime', () => {
  const s = setup();
  s.policy.sync(); assert.equal(s.pending(), false);
  s.policy.setReady(); s.policy.sync();
  assert.equal(s.runner.isRunning(), true); assert.equal(getExecutionState(s.circuit).tick, 0);
  s.fire(); assert.equal(getExecutionState(s.circuit).tick, 1);
  s.runner.destroy();
});

test('edit, incomplete, grading and inactive suspensions resume without resetting or immediately ticking', () => {
  const s = setup(); s.policy.setReady(); s.policy.sync(); s.fire();
  for (const suspension of ['editing', 'runnable']) {
    const tick = getExecutionState(s.circuit).tick;
    s[suspension](suspension === 'editing'); s.policy.beginEdit(); s.policy.sync();
    assert.equal(s.pending(), false); s.fire(); assert.equal(getExecutionState(s.circuit).tick, tick);
    s[suspension](suspension !== 'editing'); s.policy.sync();
    assert.equal(s.pending(), true); assert.equal(getExecutionState(s.circuit).tick, tick);
    s.fire(); assert.equal(getExecutionState(s.circuit).tick, tick + 1);
  }
  s.runner.destroy();
});

test('explicit pause persists through editing and availability changes until Continue', () => {
  const s = setup(); s.policy.setReady(); s.policy.sync(); s.policy.toggle();
  s.policy.beginEdit(); s.editing(true); s.policy.sync(); s.editing(false);
  s.runnable(false); s.policy.sync(); s.runnable(true); s.policy.sync();
  assert.equal(s.pending(), false); assert.equal(getExecutionState(s.circuit).tick, 0);
  s.policy.toggle(); assert.equal(s.pending(), true); s.fire();
  assert.equal(getExecutionState(s.circuit).tick, 1); s.runner.destroy();
});

test('combinational mode never schedules or manually advances ticks even with D parts', () => {
  const s = setup(false); s.policy.setReady(); s.policy.sync(); s.policy.toggle(); s.runner.step();
  assert.equal(s.pending(), false); assert.equal(getExecutionState(s.circuit).tick, 0);
  s.runner.destroy();
});
