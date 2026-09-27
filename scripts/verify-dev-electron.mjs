import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { snapshotCircuit, getCircuitStats } from '../src/canvas/circuitData.js';
import { getSavePaths } from '../electron/circuit-store.cjs';

const root = path.resolve('.');
await fs.mkdir('test-results/dev-progress', { recursive: true });
const appData = await fs.mkdtemp(path.join(root, 'test-results/dev-electron-'));
const env = { ...process.env, BITWISER_TEST_APPDATA: appData }; delete env.ELECTRON_RUN_AS_NODE;
const apps = new Map(), report = { appData, launches: [], checks: [] };
const packageInfo = JSON.parse(await fs.readFile('package.json', 'utf8'));
const normalProfile = path.join(appData, packageInfo.productName || packageInfo.name);
const fixture = JSON.parse(await fs.readFile('tests/fixtures/demo/1-3.json', 'utf8')).circuit;
const record = { version: 3, stageId: 1, stageRevision: null, problemKey: null,
  timestamp: new Date().toISOString(), circuit: fixture, ...getCircuitStats(fixture) };
const folded = value => path.resolve(value).toLowerCase();
const list = page => page.evaluate(async () => (await (await import('./src/modules/circuitStorage.js')).circuitStorage.list({ stageId: 1, problemKey: null })).items);
const save = page => page.evaluate(async record => (await import('./src/modules/circuitStorage.js')).circuitStorage.save(record), record);
const readSettings = page => page.evaluate(() => Object.fromEntries([
  'username', 'autoSaveCircuit', 'backgroundAnimationEnabled', 'bgmEnabled', 'sfxEnabled',
  'hintsUsed_1', 'hintCooldownUntil', 'bitwiser:cost-progress:v1:profile-isolation-normal'
].map(key => [key, localStorage.getItem(key)])));
async function writeSettings(page, normal) {
  await page.evaluate(async normal => {
    const storage = await import('./src/modules/storage.js');
    storage.setUsername(normal ? 'profile-isolation-normal' : 'profile-isolation-dev');
    storage.setAutoSaveSetting(!normal); storage.setBackgroundAnimationSetting(!normal);
    storage.setBgmEnabledSetting(!normal); storage.setSfxEnabledSetting(!normal);
    storage.setHintProgress(1, normal ? 2 : 1); storage.setHintCooldown(normal ? 1234567890000 : 9876543210000);
  }, normal);
}
async function launch(mode) {
  // -r only redirects appData and hides the test windows. The normal launch
  // still uses Electron's real package loader, including its default app name.
  const entry = mode === 'normal' ? root : path.join(root, 'electron/dev/main.cjs');
  const app = await electron.launch({ args: ['-r', path.join(root, 'scripts/dev-electron-test-entry.cjs'), entry],
    env: { ...env, BITWISER_TEST_NORMAL: mode === 'normal' ? '1' : '0' }, timeout: 30000 });
  apps.set(mode, app);
  const state = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData'),
    appData: app.getPath('appData'), name: app.getName(), locked: app.hasSingleInstanceLock() }));
  assert.equal(state.appData, appData); assert.equal(state.locked, true);
  if (mode === 'normal') {
    assert.equal(state.name, packageInfo.productName || packageInfo.name);
    assert.equal(state.userData, normalProfile); assert.equal(state.sessionData, normalProfile);
  } else {
    for (const key of ['userData', 'sessionData']) assert.notEqual(folded(state[key]), folded(normalProfile), `${key} must not share the normal Windows profile`);
    assert.equal(state.userData, path.join(appData, 'Bitwiser-DevTools'));
    assert.equal(state.sessionData, state.userData);
  }
  report.launches.push({ mode, pid: app.process().pid, ...state, saves: getSavePaths(state.userData) });
  const page = await app.firstWindow(); page.setDefaultTimeout(20000);
  await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
  if (mode === 'dev') {
    await page.locator('#devProgressToggle').waitFor();
    await page.locator('.stage-map-chapter-nav[data-chapter-id="chapter_1"]').waitFor();
    assert.equal(await page.title(), 'Bitwiser DEV');
    assert.equal(await page.evaluate(() => typeof db === 'object' && db === null && typeof firebase === 'undefined'), true);
  } else assert.equal(await page.locator('#devProgressToggle').count(), 0);
  return { page, paths: getSavePaths(state.userData) };
}
async function close(mode) { const app = apps.get(mode); if (app) { await app.close(); apps.delete(mode); } }
async function assertConcurrent() {
  assert.notEqual(apps.get('normal').process().pid, apps.get('dev').process().pid);
  for (const [mode, app] of apps) {
    const state = await app.evaluate(({ app, BrowserWindow }) => ({ locked: app.hasSingleInstanceLock(), windows: BrowserWindow.getAllWindows().map(win => ({ id: win.id, url: win.webContents.getURL() })) }));
    assert.equal(state.locked, true, `${mode}: ${JSON.stringify(state)}`);
    assert.equal(state.windows.length, 1, `${mode}: ${JSON.stringify(state)}`);
  }
}
try {
  // Seed the normal app first, then open DEV in the same temporary appData.
  let normal = await launch('normal');
  await writeSettings(normal.page, true);
  await normal.page.evaluate(async circuit => {
    const { createCostStore } = await import('./src/modules/costRecords.js');
    const levels = await (await import('./src/modules/levels.js')).getStageDataPromise();
    createCostStore({ storage: localStorage, owner: 'profile-isolation-normal', levels }).recordClear(1, circuit);
  }, fixture);
  const normalSettings = await readSettings(normal.page);
  const normalSave = await save(normal.page);
  const normalFile = path.join(normal.paths.circuits, `${normalSave.id}.json`);
  const normalBytes = await fs.readFile(normalFile, 'utf8');
  const normalItems = await list(normal.page);
  await close('normal');

  let dev = await launch('dev');
  for (const key of ['root', 'circuits', 'previews']) assert.notEqual(folded(dev.paths[key]), folded(normal.paths[key]));
  assert.deepEqual(await list(dev.page), []);
  assert.ok(Object.values(await readSettings(dev.page)).every(value => value === null));
  assert.deepEqual(await dev.page.evaluate(id => window.bitwiserCircuitStore.load(id), normalSave.id), { ok: false, error: 'NOT_FOUND' });
  assert.deepEqual(await dev.page.evaluate(async id => (await import('./src/modules/circuitStorage.js')).circuitStorage.delete(id), normalSave.id), { removed: false, previewWarning: null });
  await writeSettings(dev.page, false);
  await dev.page.locator('#devProgressToggle').click();
  await dev.page.locator('#devUnlockAll').click();
  await dev.page.locator('#devStage').selectOption('9'); await dev.page.locator('#devStageState').selectOption('2');
  await dev.page.locator('#dev-chapter_3').selectOption('locked');
  const initial = await dev.page.evaluate(() => localStorage.getItem('bitwiser:dev-progress:v1'));
  const devSettings = await readSettings(dev.page);
  const disposable = await save(dev.page);
  assert.equal((await dev.page.evaluate(async id => (await import('./src/modules/circuitStorage.js')).circuitStorage.delete(id), disposable.id)).removed, true);
  assert.deepEqual(await list(dev.page), []);
  const { id } = await save(dev.page);
  const savedPath = path.join(dev.paths.circuits, `${id}.json`);
  assert.deepEqual(JSON.parse(await fs.readFile(savedPath, 'utf8')).circuit, snapshotCircuit(fixture));
  assert.equal(await fs.readFile(normalFile, 'utf8'), normalBytes);
  assert.deepEqual(await fs.readdir(normal.paths.circuits), [`${normalSave.id}.json`]);
  await dev.page.screenshot({ path: 'test-results/dev-progress/electron-panel.png' });
  report.checks.push('Case-insensitive userData/sessionData and native save/cache paths differ; DEV cannot read/delete normal saves or inherit settings/hints/progress');

  normal = await launch('normal'); await assertConcurrent();
  assert.deepEqual(await readSettings(normal.page), normalSettings);
  assert.deepEqual(await list(normal.page), normalItems);
  assert.equal(await normal.page.evaluate(() => localStorage.getItem('bitwiser:dev-progress:v1')), null);
  report.checks.push('Normal and DEV run simultaneously with separate single-instance locks and unchanged normal records');
  await close('dev');
  dev = await launch('dev'); await assertConcurrent();
  assert.equal(await dev.page.evaluate(() => localStorage.getItem('bitwiser:dev-progress:v1')), initial);
  assert.deepEqual(await readSettings(dev.page), devSettings);
  assert.equal(await dev.page.evaluate(async () => (await import('./src/modules/levels.js')).isLevelUnlocked(9)), false);
  assert.deepEqual((await list(dev.page)).map(item => item.id), [id]);
  const restored = await dev.page.evaluate(async id => (await import('./src/modules/circuitStorage.js')).circuitStorage.load(id), id);
  assert.deepEqual(restored.circuit, snapshotCircuit(fixture));
  assert.equal(await dev.page.evaluate(async () => {
    try { await fetch('https://bitgame-70394-default-rtdb.firebaseio.com/rankings.json'); return false; } catch { return true; }
  }), true);
  report.checks.push('DEV restart alongside normal restores settings/hints/progress and native circuit; external network remains blocked');
  await close('dev'); await close('normal');
  normal = await launch('normal');
  assert.deepEqual(await readSettings(normal.page), normalSettings);
  assert.deepEqual(await list(normal.page), normalItems);
  assert.equal(await fs.readFile(normalFile, 'utf8'), normalBytes);
  assert.deepEqual((await normal.page.evaluate(async id => (await import('./src/modules/circuitStorage.js')).circuitStorage.load(id), normalSave.id)).circuit, snapshotCircuit(fixture));
  report.checks.push('Normal progress/settings/hints and original circuit bytes survive all DEV mutations/deletions and another normal restart');
  await fs.writeFile('test-results/dev-progress/electron-isolation.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { for (const mode of [...apps.keys()]) await close(mode); }
