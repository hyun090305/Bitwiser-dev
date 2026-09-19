import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { observeMap, goToMap, openSettings } from './demo-browser-helpers.mjs';
import {DEMO_IDS} from '../src/demo/catalog.js';

const base = process.env.DEMO_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const errors = [], external = [], requested = [];
const builtMap = JSON.parse(await fs.readFile('dist-web-demo/stage_map.json', 'utf8'));
for (const file of ['levels.json', 'levels_en.json']) {
  const levels = JSON.parse(await fs.readFile(`dist-web-demo/${file}`, 'utf8'));
  for (const values of Object.values(levels)) assert.ok(Object.keys(values).every(id => DEMO_IDS.includes(Number(id.replace('stage', '')))));
}
const layout = await fs.readFile('dist-web-demo/src/modules/stageMapLayout.js', 'utf8');
assert.ok(!layout.includes('majority_gate') && !layout.includes('twos_complement'));
assert.equal(builtMap.chapters.length, 6);
const catalog = await fs.readFile('dist-web-demo/src/modules/stageCatalog.js','utf8');
assert.ok(!catalog.includes('twos_complement') && !catalog.includes('serial_transmitter'));

async function clickMapText(page, label) {
  await page.waitForFunction(label => !!window.mapLabels[label], label);
  const point = await page.evaluate(label => window.mapLabels[label], label);
  await page.mouse.click(point.x + 3, point.y);
}
async function assertGate(page, feature) {
  const dialog = page.locator('#fullVersionDialog[open]');
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('data-feature'), feature);
  assert.equal(await dialog.locator('.full-feature-card').count(), 4);
  assert.equal(await dialog.locator('.is-selected').getAttribute('data-feature'), feature);
  assert.equal(await page.locator('#levelIntroModal').isVisible(), false);
  assert.equal(await page.evaluate(() => document.body.classList.contains('lab-mode')), false);
}
try {
  for (const lang of ['en', 'ko']) {
    const context = await browser.newContext({ locale: lang === 'ko' ? 'ko-KR' : 'en-US', viewport: { width: 1280, height: 850 } });
    await observeMap(context);
    await context.addInitScript(lang => { localStorage.setItem('lang', lang); localStorage.setItem('bitwiserTheme', 'soft-glow'); }, lang);
    await context.route('**/*', route => {
      const url = route.request().url(); requested.push(url);
      if (/^https?:/.test(url) && !url.startsWith(base)) { external.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base);
      await page.locator('#loadingStartBtn').click();
      await page.locator('#startLevelBtn').click();
      await page.locator('#systemMenuBtn').click();
      // Tutorial deliberately has no stage ranking entry point.
      assert.equal(await page.locator('#viewRankingBtn').isVisible(), false);
      await page.keyboard.press('Escape');
      await goToMap(page);
      await page.locator('#demoRankingHudBtn').click();
      await assertGate(page, 'ranking');
      await page.screenshot({ path: `test-results/demo-full-version-${lang}.png` });
      await page.locator('.full-version-back').click();
      assert.equal(await page.locator('#storyHudBtn, #demoStoryBtn, #storyPlaybackOverlay, #storyModalOverlay, [data-feature=story]').count(), 0);

      for (const chapter of [2, 3, 4, 5]) {
        await page.evaluate(() => { window.mapLabels = {}; });
        await page.locator('#stageMapChapterNext').click();
        await page.waitForTimeout(1200);
        assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'), `chapter_${chapter}`);
        await page.screenshot({ path: `test-results/demo-chapter-${chapter}-${lang}.png` });
        if (chapter > 2) {
          // Later chapters contain headings only, with no playable stage nodes.
          assert.ok(!builtMap.nodes.some(node => node.chapterId === `chapter_${chapter}` && node.nodeType === 'stage'));
          const visible = await page.evaluate(() => Object.entries(window.mapLabels).some(([label, point]) => /^(ARITHMETIC UNIT|CONTROL FLOW|SYSTEM INTEGRATION)$/.test(label) && point.x > 0 && point.x < innerWidth && point.y > 0 && point.y < innerHeight));
          assert.ok(visible, `No chapter heading rendered in chapter ${chapter}`);
        }
      }
      // Extras precedes Chapter 1 in the current map.
      for (let step = 0; step < 5; step++) {
        await page.locator('#stageMapChapterPrev').click();
        await page.waitForTimeout(650);
      }
      assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'), 'extras');
      for (const [label, feature] of [['TEST BENCH', 'sandbox'], ['EXTERNAL BLUEPRINTS', 'problems']]) {
        await clickMapText(page, label);
        await assertGate(page, feature);
        await page.locator('.full-version-back').click();
      }
      const state = await page.evaluate(async () => {
        const levels = await import('./src/modules/levels.js');
        const themes = await import('./src/themes.js');
        themes.setActiveTheme('soft-glow');
        const rejected = [];
        for (const id of [7, 19, 24]) { try { await levels.startLevel(id); } catch { rejected.push(id); } }
        return { ids: Object.keys(levels.getLevelTitles()), rejected, theme: themes.getActiveThemeId(), savedTheme: localStorage.getItem('bitwiserTheme') };
      });
      assert.deepEqual(state.ids.map(Number), [...DEMO_IDS].sort((a,b)=>a-b));
      assert.deepEqual(state.rejected, [7,19,24]);
      assert.equal(state.theme, 'midnight-neon'); assert.equal(state.savedTheme, 'soft-glow');
      await openSettings(page);
      assert.equal(await page.locator('#themeOptions, #themeHeading, #themePreviewCanvas, #autoSaveCheckbox, #demoSaveBtn, #demoMenuSaveBtn, #saveCircuitBtn, #viewSavedBtn').count(), 0);
      assert.equal(await page.locator('#demoBackupFile').count(),1);
      await page.screenshot({ path: `test-results/demo-settings-${lang}.png` });
      await page.locator('#settingsCloseBtn').click();
      if (lang === 'ko') {
        // The feature window also fits narrow portrait viewports and scrolls
        // its content independently, keeping its close action reachable.
        await page.setViewportSize({ width: 390, height: 740 });
        await page.locator('#demoRankingHudBtn').click();
        await assertGate(page, 'ranking');
        assert.ok(await page.locator('.full-version-content').evaluate(el => el.scrollHeight > el.clientHeight));
        await page.screenshot({ path: 'test-results/demo-full-version-mobile.png' });
        await page.locator('.full-version-back').click();
      }
      await context.close();
    } catch (error) {
      console.error(await page.evaluate(() => window.mapLabels));
      await page.screenshot({ path: 'test-results/demo-features-failure.png' });
      throw error;
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  assert.ok(!requested.some(url => /\/(?:storyFragments\.json|story\.demo\.(?:ko|en)\.json|src\/modules\/(?:story|auth|rank|labMode|problemEditor|community)\.js)/.test(url)));
  console.log('Feature checks passed: Korean/English, five chapters + extras, chapter-only previews, stripped full-stage data, backup controls, fixed theme, portrait modal, no online requests.');
} catch (error) { console.error(error, errors, external); process.exitCode = 1; }
finally { await browser.close(); }
