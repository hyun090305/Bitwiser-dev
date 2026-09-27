import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { snapshotCircuit, getCircuitStats } from '../src/canvas/circuitData.js';

const root = path.resolve('.');
await fs.mkdir('test-results', { recursive: true });
await fs.mkdir('test-results/dev-progress', { recursive: true });
const appData = await fs.mkdtemp(path.join(root, 'test-results/dev-electron-'));
const env = { ...process.env, BITWISER_TEST_APPDATA: appData }; delete env.ELECTRON_RUN_AS_NODE;
let app;
const launch = async () => {
  app = await electron.launch({ args: [path.join(root, 'scripts/dev-electron-test-entry.cjs')], env });
  const page = await app.firstWindow();
  await page.locator('#devProgressToggle').waitFor();
  await page.locator('.stage-map-chapter-nav[data-chapter-id="chapter_1"]').waitFor();
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), path.join(appData, 'Bitwiser-DEV'));
  assert.equal(await app.evaluate(({ app }) => app.getPath('sessionData')), path.join(appData, 'Bitwiser-DEV'));
  assert.equal(await page.title(), 'Bitwiser DEV');
  assert.equal(await page.evaluate(() => typeof db === 'object' && db === null && typeof firebase === 'undefined'), true);
  return page;
};
try {
  let page = await launch();
  await page.locator('#devProgressToggle').click();
  await page.locator('#devUnlockAll').click();
  await page.locator('#devStage').selectOption('9'); await page.locator('#devStageState').selectOption('2');
  await page.locator('#dev-chapter_3').selectOption('locked');
  const initial = await page.evaluate(() => localStorage.getItem('bitwiser:dev-progress:v1'));
  const native = await page.evaluate(async () => {
    const store = await import('./src/modules/circuitStorage.js');
    return { available: store.isCircuitStorageAvailable(), records: await store.circuitStorage.list({ stageId: 1, problemKey: null }) };
  });
  assert.equal(native.available, true);
  assert.deepEqual(native.records.items, []);
  const fixture = JSON.parse(await fs.readFile('tests/fixtures/demo/1-3.json', 'utf8')).circuit;
  const record = { version: 3, stageId: 1, stageRevision: null, problemKey: null,
    timestamp: new Date().toISOString(), circuit: fixture, ...getCircuitStats(fixture) };
  const { id } = await page.evaluate(async record => (await import('./src/modules/circuitStorage.js')).circuitStorage.save(record), record);
  const savedPath = path.join(appData, 'Bitwiser-DEV', 'saves/profiles/local/circuits', `${id}.json`);
  assert.deepEqual(JSON.parse(await fs.readFile(savedPath, 'utf8')).circuit, snapshotCircuit(fixture));
  await page.screenshot({ path: 'test-results/dev-progress/electron-panel.png' });
  await app.close(); app = null;
  page = await launch();
  assert.equal(await page.evaluate(() => localStorage.getItem('bitwiser:dev-progress:v1')), initial);
  assert.equal(await page.evaluate(async () => (await import('./src/modules/levels.js')).isLevelUnlocked(9)), false);
  const restored = await page.evaluate(async id => (await import('./src/modules/circuitStorage.js')).circuitStorage.load(id), id);
  assert.deepEqual(restored.circuit, snapshotCircuit(fixture));
  assert.equal(await page.evaluate(async () => {
    try { await fetch('https://bitgame-70394-default-rtdb.firebaseio.com/rankings.json'); return false; } catch { return true; }
  }), true);
  console.log('DEV Electron: real launcher, isolated userData/sessionData, restart persistence, native circuit save/load and network block passed.');
} finally { await app?.close(); }
