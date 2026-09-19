import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { snapshotCircuit } from '../src/canvas/circuitData.js';
import { validateSavedCircuitRecord } from '../src/modules/savedCircuitRecord.js';
import { createGradingController } from '../src/modules/grading.js';
import { __testing as authUI } from '../src/modules/authUI.js';
const require = createRequire(import.meta.url);
const { createCircuitStore, getSavePaths, errorCode } = require('../electron/circuit-store.cjs');
const { registerCircuitIPC, isTrustedSender } = require('../electron/circuit-ipc.cjs');
const fixture = JSON.parse(await fs.readFile(new URL('fixtures/demo/1-3.json', import.meta.url), 'utf8')).circuit;
const record = (extra = {}) => ({ version: 3, stageId: 1, stageRevision: null, problemKey: null,
  timestamp: '2026-09-19T12:00:00.000Z', circuit: structuredClone(fixture), usedBlocks: 3, usedWires: 5, ...extra });
const context = { stageId: 1, problemKey: null };
const gif = new Uint8Array(Buffer.from('GIF89a-test-preview'));
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bitwiser-circuits-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, paths: getSavePaths(root), store: createCircuitStore(root) };
}

test('AC-1/2: independent saves, exact contexts, newest first, and a reopened store', async t => {
  const { root, store } = await setup(t);
  assert.deepEqual(await store.list(context), { items: [], issues: [] });
  const saves = await Promise.all(Array.from({ length: 20 }, (_, i) => store.save(record({ timestamp: new Date(1000 + i).toISOString() }))));
  assert.equal(new Set(saves.map(s => s.id)).size, 20);
  await store.save(record({ stageId: 10 }));
  const a = await store.save(record({ stageId: null, problemKey: 'a' }));
  await store.save(record({ stageId: null, problemKey: 'a_b' }));
  await store.save(record({ stageId: null, problemKey: null }));
  assert.deepEqual((await store.list({ stageId: null, problemKey: 'a' })).items.map(i => i.id), [a.id]);
  const reopened = createCircuitStore(root);
  assert.equal((await reopened.list(context)).items.length, 20);
  assert.deepEqual((await reopened.list(context)).items.map(i => i.id), saves.toReversed().map(s => s.id));
  assert.deepEqual((await reopened.load(saves[0].id)).circuit, snapshotCircuit(fixture));
  await reopened.writePreview(saves[0].id, gif);
  assert.deepEqual(await reopened.readPreview(saves[0].id), gif);
  await reopened.delete(saves[0].id);
  assert.equal((await reopened.list(context)).items.length, 19);
  await assert.rejects(reopened.load(saves[0].id), { code: 'NOT_FOUND' });
  assert.equal((await reopened.delete(saves[0].id)).removed, false);
});

test('AC-3: v2/v3 metadata and D/EN/button design survive; transient execution does not', async t => {
  const { store } = await setup(t);
  const circuit = { rows: 5, cols: 5, tick: 8, blocks: {}, wires: {} };
  for (const [id, type, r, c] of [['x', 'INPUT', 0, 0], ['en', 'INPUT', 4, 0], ['d', 'D', 0, 4]]) {
    circuit.blocks[id] = { id, type, name: id, pos: { r, c }, value: true, fixed: false };
  }
  circuit.blocks.x.inputMode = 'button'; circuit.blocks.d.q = true;
  circuit.wires.data = { id: 'data', startBlockId: 'x', endBlockId: 'd', inputRole: 'D',
    path: [0, 1, 2, 3, 4].map(c => ({ r: 0, c })) };
  circuit.wires.enable = { id: 'enable', startBlockId: 'en', endBlockId: 'd', inputRole: 'EN',
    path: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4]].map(([r, c]) => ({ r, c })) };
  for (const version of [2, 3]) {
    const input = record({ version, stageId: null, problemKey: '../problem', problemTitle: 'Test / 문제', circuit });
    const { id } = await store.save(input);
    const output = await store.load(id);
    assert.deepEqual(output, { ...input, circuit: snapshotCircuit(circuit) });
    assert.equal(output.circuit.blocks.x.value, false);
    assert.equal(output.circuit.blocks.d.value, false);
    assert.equal(output.circuit.blocks.en.value, true);
    assert.equal(output.circuit.tick, undefined);
    assert.equal(output.circuit.wires.enable.inputRole, 'EN');
  }
});

test('AC-3: a legacy v2 file without optional timestamp/statistics remains readable', async t => {
  const { store, paths } = await setup(t);
  await store.save(record());
  const id = randomUUID();
  const legacy = JSON.parse(await fs.readFile(new URL('fixtures/demo/1-3.json', import.meta.url)));
  await fs.writeFile(path.join(paths.circuits, `${id}.json`), JSON.stringify(legacy));
  const restored = await store.load(id);
  assert.equal(restored.version, 2);
  assert.deepEqual(restored.circuit, snapshotCircuit(legacy.circuit));
  assert.equal(restored.timestamp, undefined);
  assert.ok(Number.isFinite(Date.parse((await store.list(context)).items.find(item => item.id === id).timestamp)));
});

test('AC-4: partial writes, disk full, sync/close/rename failures never publish or alter a good file', async t => {
  const { root, paths, store } = await setup(t);
  const good = await store.save(record());
  const original = await fs.readFile(path.join(paths.circuits, `${good.id}.json`));
  for (const operation of ['writeFile', 'sync', 'close', 'rename']) {
    const failure = Object.assign(new Error(operation), { code: operation === 'writeFile' ? 'ENOSPC' : 'EACCES' });
    const io = Object.create(fs);
    if (operation === 'rename') io.rename = async () => { throw failure; };
    else io.open = async (...args) => {
      const handle = await fs.open(...args);
      return {
        writeFile: async bytes => { if (operation === 'writeFile') { await handle.writeFile(bytes.slice(0, 5)); throw failure; } await handle.writeFile(bytes); },
        sync: async () => { if (operation === 'sync') throw failure; await handle.sync(); },
        close: async () => { await handle.close(); if (operation === 'close') throw failure; }
      };
    };
    await assert.rejects(createCircuitStore(root, { io }).save(record()), failure);
    assert.equal((await store.list(context)).items.length, 1);
    assert.deepEqual(await fs.readFile(path.join(paths.circuits, `${good.id}.json`)), original);
    assert.equal((await fs.readdir(paths.circuits)).some(n => n.endsWith('.tmp')), false);
  }
  assert.equal(errorCode({ code: 'ENOSPC' }), 'NO_SPACE');
  assert.equal(errorCode({ code: 'EPERM' }), 'PERMISSION');
  assert.equal((await store.save(record())).id.length, 36); // failure does not poison the queue
});

test('AC-4: corrupt/missing JSON, abandoned temporary files and broken previews are isolated', async t => {
  const { root, paths, store } = await setup(t);
  const good = await store.save(record()), corrupt = randomUUID();
  await fs.writeFile(path.join(paths.circuits, `${corrupt}.json`), '{broken');
  await fs.writeFile(path.join(paths.circuits, `${randomUUID()}.tmp`), '{partial');
  const reopened = createCircuitStore(root);
  const listed = await reopened.list(context);
  assert.deepEqual(listed.items.map(i => i.id), [good.id]);
  assert.deepEqual(listed.issues, [{ id: corrupt, code: 'CORRUPT' }]);
  await assert.rejects(reopened.load(corrupt), { code: 'CORRUPT' });
  assert.equal(await fs.readFile(path.join(paths.circuits, `${corrupt}.json`), 'utf8'), '{broken');
  assert.equal(await store.readPreview(good.id), null);
  await assert.rejects(store.writePreview(good.id, new Uint8Array([1, 2])), { code: 'INVALID_REQUEST' });
  const io = Object.create(fs);
  io.rename = async (from, to) => { if (to.endsWith('.gif')) throw Object.assign(new Error(), { code: 'ENOSPC' }); return fs.rename(from, to); };
  await assert.rejects(createCircuitStore(root, { io }).writePreview(good.id, gif), { code: 'ENOSPC' });
  assert.ok(await store.load(good.id));
  await store.writePreview(good.id, gif);
  await fs.writeFile(path.join(paths.previews, `${good.id}.gif`), 'broken');
  await assert.rejects(store.readPreview(good.id), { code: 'CORRUPT' });
  assert.ok(await store.load(good.id));
  await store.delete(corrupt);
  assert.equal((await store.list(context)).issues.length, 0);
});

test('AC-4: concurrent deletion/preview write and failed deletion preserve other saves', async t => {
  const { root, paths, store } = await setup(t);
  const a = await store.save(record()), b = await store.save(record());
  await Promise.all([store.writePreview(a.id, gif), store.delete(a.id)]);
  const race = await Promise.allSettled([store.delete(b.id), store.writePreview(b.id, gif)]);
  assert.equal(race[1].reason.code, 'NOT_FOUND');
  assert.deepEqual(await fs.readdir(paths.previews), []);
  const c = await store.save(record()); await store.writePreview(c.id, gif);
  const io = Object.create(fs);
  io.unlink = async file => { if (file.endsWith('.json')) throw Object.assign(new Error(), { code: 'EACCES' }); return fs.unlink(file); };
  await assert.rejects(createCircuitStore(root, { io }).delete(c.id), { code: 'EACCES' });
  assert.ok(await store.load(c.id)); assert.deepEqual(await store.readPreview(c.id), gif);
  io.unlink = async file => { if (file.endsWith('.gif')) throw Object.assign(new Error(), { code: 'EACCES' }); return fs.unlink(file); };
  assert.deepEqual(await createCircuitStore(root, { io }).delete(c.id), { removed: true, previewWarning: 'PERMISSION' });
  assert.deepEqual((await store.list(context)).items, []);
});

test('AC-5: IDs, oversized/malformed data, collisions and file/directory links cannot escape storage', async t => {
  const { root, paths, store } = await setup(t);
  const good = await store.save(record());
  for (const id of ['../outside', '/tmp/outside', 'C:\\outside', `${good.id}/..`, '__proto__', null, {}]) {
    for (const method of ['load', 'delete', 'readPreview']) await assert.rejects(store[method](id), { code: 'INVALID_REQUEST' });
  }
  for (const bad of [null, {}, record({ version: 1 }), record({ timestamp: 'bad' }), record({ stageId: -1 }),
    record({ problemTitle: 'a'.repeat(9 * 1024 * 1024) }), record({ circuit: { rows: 6, cols: 6, blocks: {}, wires: { a: {} } } })]) {
    await assert.rejects(store.save(bad), { code: 'INVALID_REQUEST' });
  }
  await assert.rejects(store.list({ stageId: '../' }), { code: 'INVALID_REQUEST' });
  await assert.rejects(createCircuitStore(root, { newId: () => good.id }).save(record({ problemTitle: 'overwrite' })), { code: 'INVALID_REQUEST' });
  const outside = path.join(root, 'outside.json');
  await fs.writeFile(outside, JSON.stringify(record()));
  const linked = randomUUID();
  await fs.link(outside, path.join(paths.circuits, `${linked}.json`));
  await assert.rejects(store.load(linked), { code: 'UNSAFE_PATH' });
  await assert.rejects(store.delete(linked), { code: 'UNSAFE_PATH' });
  const otherProfile = path.join(root, 'other-profile'); await fs.mkdir(otherProfile);
  await fs.mkdir(path.dirname(paths.previews), { recursive: true });
  await fs.symlink(otherProfile, paths.previews, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.writePreview(good.id, gif), { code: 'UNSAFE_PATH' });
  assert.deepEqual(await fs.readdir(otherProfile), []);
  assert.ok(await fs.readFile(outside));
  assert.equal(validateSavedCircuitRecord(record({ id: '../override' })).id, undefined);
});

test('AC-5: IPC permits only the registered top frame with the exact app URL and explicit arity', async () => {
  const frame = { url: 'app://bitwiser/index.html' }, sender = { mainFrame: null }; sender.mainFrame = frame;
  const allowed = new Set([sender]); const event = { sender, senderFrame: frame };
  assert.equal(isTrustedSender(event, allowed), true);
  const handlers = {}, calls = [];
  registerCircuitIPC({ handle: (name, fn) => handlers[name] = fn }, { load: async id => { calls.push(id); return 'loaded'; } }, allowed);
  for (const bad of [{ sender: { mainFrame: frame }, senderFrame: frame }, { sender, senderFrame: { url: frame.url } }]) {
    assert.deepEqual(await handlers['circuit-store:load'](bad, '../'), { ok: false, error: 'FORBIDDEN' });
  }
  for (const url of ['https://bitwiser/index.html', 'app://bitwiser.evil/index.html', 'app://bitwiser/index.html?x', 'file:///index.html']) {
    frame.url = url; assert.equal(isTrustedSender(event, allowed), false);
  }
  frame.url = 'app://bitwiser/index.html';
  assert.deepEqual(await handlers['circuit-store:load'](event, 'id', 'extra'), { ok: false, error: 'INVALID_REQUEST' });
  assert.deepEqual(await handlers['circuit-store:load'](event, 'id'), { ok: true, value: 'loaded' });
  assert.deepEqual(calls, ['id']);
});

test('AC-1/6: grading autosaves without an account, respects off, and keeps save failure separate from passing', async () => {
  const levels = JSON.parse(await fs.readFile(new URL('../levels.json', import.meta.url)));
  for (const mode of ['on', 'off', 'failure']) {
    const calls = { passed: 0, saved: 0, notified: 0, errors: [] };
    const grader = createGradingController({ getPlayCircuit: () => structuredClone(fixture),
      getLevelAnswer: () => levels.levelAnswers[1], getLevelBlockSet: () => levels.levelBlockSets[1],
      getAutoSaveSetting: () => mode !== 'off', onPassed: () => { calls.passed++; },
      saveCircuit: async () => { calls.saved++; if (mode === 'failure') throw Object.assign(new Error(), { code: 'NO_SPACE' }); },
      showCircuitSavedModal: () => { calls.notified++; }, alert: error => calls.errors.push(error), t: key => key });
    await grader.gradeLevel(1); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.passed, 1);
    assert.equal(calls.saved, mode === 'off' ? 0 : 1);
    assert.equal(calls.notified, mode === 'on' ? 1 : 0);
    assert.deepEqual(calls.errors, mode === 'failure' ? ['localSaveNoSpace'] : []);
    assert.equal(grader.isScoring(), false);
  }
});

test('AC-6: Firebase Google sign-in and sign-out remain, without Drive scopes or offline consent parameters', async t => {
  const original = globalThis.firebase;
  t.after(() => { if (original === undefined) delete globalThis.firebase; else globalThis.firebase = original; });
  let click, providerUsed, user = null, signedOut = false;
  const scopes = [], parameters = [];
  const auth = () => ({ currentUser: user, signInWithPopup: provider => { providerUsed = provider; return Promise.resolve({ user: {} }); },
    signOut: () => { signedOut = true; } });
  auth.GoogleAuthProvider = class { addScope(scope) { scopes.push(scope); } setCustomParameters(value) { parameters.push(value); } };
  globalThis.firebase = { auth };
  authUI.setupLoginButtonHandlers([{ id: 'googleLoginBtn', addEventListener: (_, fn) => { click = fn; } }]);
  click(); await Promise.resolve();
  assert.ok(providerUsed instanceof auth.GoogleAuthProvider);
  assert.deepEqual(scopes, []); assert.deepEqual(parameters, []);
  user = { uid: 'test' }; click(); assert.equal(signedOut, true);
});
