import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createDevServer } from './dev-web.mjs';
import { observeMap, enterStage, goToMap } from './demo-browser-helpers.mjs';

const server = createDevServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
await fs.mkdir('test-results/dev-progress', { recursive: true });
try {
  for (const lang of ['ko', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, locale: lang });
    await context.addInitScript(lang => localStorage.setItem('lang', lang), lang);
    await observeMap(context);
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) external.push(request.url()); });
    await page.route('**/src/modules/stageMap.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(/  return \{\s+refresh: \(\) => \{/, '  window.devMapState = state;\n  return {\n    refresh: () => {') });
    });
    page.setDefaultTimeout(20000);
    await page.goto(base);
    await page.locator('#devProgressToggle').waitFor();
    await page.locator('#loadingStartBtn').click();
    await page.locator('#stageMapCanvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.devMapState?.chapterStatus.has('chapter_5')).catch(async error => {
      console.error(await page.evaluate(() => ({ nodes: window.devMapState?.nodes.length, chapters: [...(window.devMapState?.chapterStatus.keys() || [])] })));
      throw error;
    });
    const inspect = () => page.evaluate(async () => {
      const levels = await import('./src/modules/levels.js');
      const { devProgress } = await import('./src/dev/setup.js');
      return { cleared: levels.getClearedLevels(), snapshot: devProgress.snapshot(),
        unlocked: [0, 6, 25, 30, 9, 12, 38].map(id => levels.isLevelUnlocked(id)),
        mapLocked: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5'].map(id => window.devMapState.chapterStatus.get(id).locked) };
    });
    const open = () => page.locator('#devProgressToggle').click();
    const close = () => page.locator('#devProgressClose').click();
    const preset = async value => {
      await page.locator('#devPreset').selectOption(value); await page.locator('#devApplyPreset').click();
    };
    assert.deepEqual((await inspect()).cleared, []);
    await page.keyboard.press('Control+Shift+d'); await page.locator('#devProgressPanel[open]').waitFor();
    await page.locator('#devUnlockAll').click();
    let state = await inspect();
    assert.deepEqual(state.cleared, []); assert.ok(state.unlocked.every(Boolean)); assert.ok(state.mapLocked.every(v => !v));
    await page.locator('#devStage').selectOption('9');
    for (const stars of ['3', '2', '1']) {
      await page.locator('#devStageState').selectOption(stars);
      assert.equal((await inspect()).snapshot.stages[9].stars, Number(stars));
    }
    await page.locator('#dev-chapter_3').selectOption('locked');
    state = await inspect(); assert.equal(state.unlocked[4], false); assert.equal(state.mapLocked[2], true);
    assert.equal(await page.evaluate(async () => {
      try { await (await import('./src/modules/levels.js')).startLevel(9); return false; } catch { return true; }
    }), true);
    await page.locator('#devStageState').selectOption('uncleared');
    assert.ok(!(await inspect()).cleared.includes(9));
    await preset('before-ch2');
    state = await inspect(); assert.equal(state.unlocked[2], false); assert.equal(state.mapLocked[1], true);
    await page.screenshot({ path: `test-results/dev-progress/panel-${lang}.png` });
    await close(); await enterStage(page, 6);
    await page.locator('#hintBtn').click(); await page.locator('#hintModal').waitFor({ state: 'visible' }); await page.locator('#closeHintBtn').click();
    const grade = async id => {
      const circuit = JSON.parse(await fs.readFile(`tests/fixtures/demo/${id}-3.json`, 'utf8')).circuit;
      await page.evaluate(async circuit => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(circuit), circuit);
      await page.locator('#gradeButton').click(); await page.locator('#clearedModal').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#clearedModal .cost-registration').count(), 0);
      await page.locator('#clearedMapBtn').click(); await goToMap(page);
    };
    await grade(6);
    state = await inspect(); assert.equal(state.unlocked[2], true); assert.equal(state.mapLocked[1], false);
    await open(); await preset('before-ch34'); await close(); await enterStage(page, 30); await grade(30);
    state = await inspect(); assert.equal(state.unlocked[4], true); assert.equal(state.unlocked[5], true);
    assert.equal(state.mapLocked[2], false); assert.equal(state.mapLocked[3], false); assert.equal(state.mapLocked[4], true);
    await open(); await page.locator('#dev-chapter_4').selectOption('locked');
    const persisted = (await inspect()).snapshot;
    await page.reload(); await page.locator('#devProgressToggle').waitFor();
    await page.waitForFunction(() => window.devMapState?.chapterStatus.has('chapter_5'));
    assert.deepEqual((await inspect()).snapshot, persisted);
    await open(); await preset('complete');
    assert.equal((await inspect()).cleared.length, 48);
    await page.locator('#devReset').click(); assert.deepEqual((await inspect()).snapshot, persisted);
    await page.setViewportSize({ width: 960, height: 640 });
    const box = await page.locator('#devProgressPanel').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 960 && box.y + box.height <= 640);
    await preset('fresh'); assert.deepEqual((await inspect()).cleared, []);
    await page.keyboard.press('Escape'); await page.locator('#devProgressPanel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#devProgressToggle').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => typeof db === 'object' && db === null && typeof firebase === 'undefined'), true);
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close(); console.log(`DEV ${lang}: panel, map/entry guards, real gate clears, stars, persistence, reset, offline boundary passed.`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
