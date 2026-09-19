import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { snapshotCircuit } from '../src/canvas/circuitData.js';
import { getSavePaths } from '../electron/circuit-store.cjs';
import { launchPackagedElectron } from './packaged-electron-test-launcher.mjs';

const root = path.resolve('.');
const packaged = process.argv.includes('--packaged');
const outputName = packaged ? 'electron-packaged-saves' : 'electron-local-saves';
await fs.mkdir('test-results', { recursive: true });
const profile = await fs.mkdtemp(path.join(root, 'test-results', 'electron-saves-'));
const paths = getSavePaths(profile);
const fixture = JSON.parse(await fs.readFile('tests/fixtures/demo/1-3.json', 'utf8')).circuit;
const memoryFixture = JSON.parse(await fs.readFile('tests/fixtures/demo/25-3.json', 'utf8')).circuit;
const report = { profile, packaged, processes: [], checks: [], blockedRequests: [] };
let app, page;
const errors = [];
async function launch() {
  const env = { ...process.env, BITWISER_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const entry = path.join(root, 'scripts/electron-save-test-entry.cjs');
  app = packaged
    ? await launchPackagedElectron({ executablePath: path.join(root, 'dist/win-unpacked/Bitwiser.exe'), hook: entry, profile, env })
    : await electron.launch({ args: [entry], env, timeout: 30000 });
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  report.processes.push(app.process().pid);
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.saveAlerts = [];
    window.acceptSaveDelete = false;
    window.alert = message => window.saveAlerts.push(message);
    window.confirm = () => window.acceptSaveDelete;
  });
  await page.reload();
  await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), packaged);
  if (packaged) assert.equal(await app.evaluate(({ app }) => app.getAppPath()), path.join(root, 'dist/win-unpacked/resources/app.asar'));
  const prefs = await app.evaluate(() => global.testWindow.webContents.getLastWebPreferences());
  assert.ok(prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration);
  const api = await page.evaluate(() => Object.keys(window.bitwiserCircuitStore).sort());
  assert.deepEqual(api, ['delete', 'list', 'load', 'readPreview', 'save', 'writePreview']);
  assert.equal(await page.evaluate(() => typeof firebase === 'undefined' || !firebase.auth().currentUser), true);
  await page.locator('#loadingStartBtn').click();
  await page.locator('#loadingScreen').waitFor({ state: 'hidden' });
  await page.locator('#stageMapCanvas').waitFor({ state: 'visible' });
  await page.waitForTimeout(600); // Complete the existing map entrance animation.
}
async function stage(id, circuit) {
  await page.evaluate(async id => {
    const levels = await import('./src/modules/levels.js');
    // Synthetic progress unlocks the memory fixture without changing real data.
    levels.configureLevelModule({ progressProvider: () => [1, 2, 3, 4, 5, 6] });
    await levels.startLevel(id);
    const navigation = await import('./src/modules/navigation.js');
    navigation.hideStageMapScreen(); navigation.showGameScreen();
  }, id);
  await page.locator('#startLevelBtn').click();
  if (circuit) await page.evaluate(async c => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c), circuit);
}
const list = () => page.evaluate(async () => (await window.bitwiserCircuitStore.list({ stageId: 1, problemKey: null })).value.items);
const readCircuit = () => page.evaluate(async () => (await import('./src/canvas/circuitData.js')).snapshotCircuit((await import('./src/modules/grid.js')).getPlayCircuit()));
async function waitCount(count) {
  await page.waitForFunction(async n => (await window.bitwiserCircuitStore.list({ stageId: 1, problemKey: null })).value.items.length === n, count);
}
async function close() {
  report.blockedRequests.push(...await app.evaluate(() => global.blockedRequests));
  await app.close(); app = null;
}
try {
  await launch(); await stage(1, fixture);
  await page.locator('#systemMenuBtn').click();
  await page.locator('#saveCircuitBtn').click();
  await waitCount(1);
  await page.waitForFunction(() => document.querySelector('.toast-container')?.textContent.includes(window.t('circuitSaved')));
  const first = (await list())[0];
  assert.equal(first.version, 3);
  const preview = await fs.readFile(path.join(paths.previews, `${first.id}.gif`));
  assert.match(preview.subarray(0, 6).toString(), /^GIF8[79]a$/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(paths.circuits, `${first.id}.json`))).circuit, snapshotCircuit(fixture));
  report.checks.push('Offline manual UI save committed JSON and a locally encoded GIF');
  // A failed encoder must still leave a successful, loadable save.
  await page.evaluate(() => { window.originalGIF = window.GIF; window.GIF = function() { throw new Error('Injected encoder failure'); }; });
  await page.evaluate(async () => (await import('./src/modules/circuitShare.js')).handleSaveCircuitClick());
  await waitCount(2);
  assert.ok(await page.evaluate(() => window.saveAlerts.includes(t('localSavePreviewFailed'))));
  await page.evaluate(() => { window.GIF = window.originalGIF; });
  const second = (await list())[0];
  assert.notEqual(second.id, first.id);
  assert.equal((await page.evaluate(id => window.bitwiserCircuitStore.readPreview(id), second.id)).value, null);
  report.checks.push('Second manual save is a separate revision and remains usable after GIF failure');
  await stage(1, fixture);
  await page.evaluate(async () => (await import('./src/modules/storage.js')).setAutoSaveSetting(false));
  await page.locator('#gradeButton').click();
  await page.waitForFunction(() => window.isScoring === false);
  assert.equal((await list()).length, 2);
  await page.evaluate(async () => (await import('./src/modules/levels.js')).returnToEditScreen());
  await page.locator('#clearedModal').evaluate(el => el.style.display = 'none');
  await page.evaluate(async () => (await import('./src/modules/storage.js')).setAutoSaveSetting(true));
  await page.locator('#gradeButton').click(); await waitCount(3);
  // Wait for the autosave preview job before exiting the process.
  await page.waitForFunction(async () => {
    const saved = (await window.bitwiserCircuitStore.list({ stageId: 1, problemKey: null })).value.items[0];
    return (await window.bitwiserCircuitStore.readPreview(saved.id)).value?.length > 0;
  });
  report.checks.push('Actual grading UI respects autosave off/on while signed out');
  const savedIds = (await list()).map(i => i.id);
  await close();
  await launch(); await stage(1, fixture);
  assert.deepEqual((await list()).map(i => i.id), savedIds);
  // Replace the editor, then restore through the existing saved-list UI.
  await page.evaluate(async () => {
    const g = await import('./src/modules/grid.js');
    g.getPlayController().restoreCircuit({ rows: 6, cols: 6, blocks: {}, wires: {} });
    (await import('./src/modules/circuitShare.js')).openSavedModal();
  });
  await page.locator('.saved-load').first().click();
  assert.deepEqual(await readCircuit(), snapshotCircuit(fixture));
  report.checks.push('A new Electron process lists and loads files from the previous process');
  // Legacy version and revision rejection must not partially mutate the editor.
  const legacy = randomUUID(), oldStage = randomUUID(), corrupt = randomUUID();
  const raw = JSON.parse(await fs.readFile(path.join(paths.circuits, `${first.id}.json`)));
  await fs.writeFile(path.join(paths.circuits, `${legacy}.json`), JSON.stringify({ ...raw, version: 2 }));
  assert.equal(await page.evaluate(async id => (await import('./src/modules/circuitShare.js')).loadCircuit(id), legacy), true);
  await fs.writeFile(path.join(paths.circuits, `${oldStage}.json`), JSON.stringify({ ...raw, stageId: 25, stageRevision: 'obsolete', circuit: memoryFixture }));
  await fs.writeFile(path.join(paths.circuits, `${corrupt}.json`), '{broken');
  await stage(25, memoryFixture);
  const before = await readCircuit();
  assert.equal(await page.evaluate(async id => (await import('./src/modules/circuitShare.js')).loadCircuit(id), oldStage), false);
  assert.deepEqual(await readCircuit(), before);
  assert.equal(await page.evaluate(async id => (await import('./src/modules/circuitShare.js')).loadCircuit(id), corrupt), false);
  assert.deepEqual(await readCircuit(), before);
  report.checks.push('v2 loads; obsolete revisions and corrupt files leave the editor unchanged');
  // Current memory snapshot restores D/EN, button mode, and execution zero.
  const memorySave = await page.evaluate(async () => (await import('./src/modules/circuitShare.js')).saveCircuit());
  await page.evaluate(async () => {
    const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
    const c = g.getPlayCircuit(); Object.values(c.blocks).filter(b => b.type === 'INPUT').forEach(b => b.value = true);
    e.tickCircuit(c);
  });
  assert.equal(await page.evaluate(async id => (await import('./src/modules/circuitShare.js')).loadCircuit(id), memorySave), true);
  assert.deepEqual(await readCircuit(), snapshotCircuit(memoryFixture));
  assert.deepEqual(await page.evaluate(async () => {
    const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
    const state = e.getExecutionState(g.getPlayCircuit()); return { tick: state.tick, memory: [...state.memory.values()] };
  }), { tick: 0, memory: [false] });
  report.checks.push('Memory round-trip preserves roles/input modes and resets execution');
  await stage(1, fixture);
  await page.evaluate(async () => (await import('./src/modules/circuitShare.js')).openSavedModal());
  await page.locator('.saved-load').first().waitFor();
  assert.match(await page.locator('#savedList').innerText(), /unreadable|읽을 수 없는/);
  const count = (await list()).length;
  await page.evaluate(() => { window.acceptSaveDelete = false; });
  await page.locator('.saved-item .deleteBtn').first().click();
  assert.equal((await list()).length, count);
  await page.evaluate(() => { window.acceptSaveDelete = true; });
  await page.locator('.saved-item .deleteBtn').first().click(); await waitCount(count - 1);
  assert.equal(await fs.readFile(path.join(paths.circuits, `${corrupt}.json`), 'utf8'), '{broken');
  report.checks.push('Corrupt file isolation, delete cancellation and confirmed deletion through list UI');
  for (const id of ['../outside', 'C:\\outside', '/outside']) {
    assert.deepEqual(await page.evaluate(id => window.bitwiserCircuitStore.load(id), id), { ok: false, error: 'INVALID_REQUEST' });
  }
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.screenshot({ path: `test-results/${outputName}.png` });
  await close();
  assert.ok(report.processes[0] !== report.processes[1]);
  assert.deepEqual(errors, []);
  assert.deepEqual(report.blockedRequests.filter(url => /apis\.google\.com|accounts\.google\.com|googleapis\.com\/(?:drive|upload\/drive|discovery)|oauth\/(?:exchange|refresh)|cdn.*gif\.js/.test(url)), []);
  report.checks.push('No Drive SDK/OAuth/API or external GIF requests, sandbox preserved, invalid IDs rejected');
  await fs.writeFile(`test-results/${outputName}.json`, JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ checks: report.checks, processes: report.processes, errors }, null, 2));
} catch (error) {
  console.error(error);
  if (page && !page.isClosed()) await page.screenshot({ path: `test-results/${outputName}-failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally { if (app) await app.close(); }
