import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { observeMap, enterStage, goToMap } from './demo-browser-helpers.mjs';

const base = process.env.DEMO_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const fixture = async id => JSON.parse(await fs.readFile(`tests/fixtures/demo/${id}-3.json`, 'utf8')).circuit;
await fs.mkdir('test-results/chapter-access', { recursive: true });
try {
  for (const lang of ['ko','en']) {
    const context = await browser.newContext({ locale: lang === 'ko' ? 'ko-KR' : 'en-US', viewport: { width: 1280, height: 900 } });
    await observeMap(context);
    await context.addInitScript(lang => localStorage.setItem('lang', lang), lang);
    const errors = [], external = [];
    await context.route('**/*', route => {
      if (/^https?:/.test(route.request().url()) && !route.request().url().startsWith(base)) {
        external.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('bitwiser:web-demo:v1')));
    const cleared = async () => Object.entries((await save()).stages).filter(([,entry]) => entry.best).map(([id]) => Number(id));
    const grade = async id => {
      await page.evaluate(async circuit => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(circuit), await fixture(id));
      await page.locator('#gradeButton').click();
      await page.locator('#demoDialog[open]').waitFor();
      assert.equal(await page.locator('.demo-result-map').innerText(), lang === 'ko' ? '맵으로 돌아가기' : 'Back to map');
      assert.equal(await page.getByRole('button', { name: /^(Next stage|다음 문제|다음 스테이지)$/i }).count(), 0);
      assert.notEqual(await page.locator('.demo-result-map').evaluate(el => getComputedStyle(el).backgroundColor),
        await page.locator('#demoDialogActions button').first().evaluate(el => getComputedStyle(el).backgroundColor));
    };
    await page.goto(base);
    await page.locator('#loadingStartBtn').click(); await page.locator('#startLevelBtn').click();
    // Choose every Chapter 1 card backwards before completing even the tutorial.
    for (const id of [5,4,3,2,1,0,6]) {
      await enterStage(page, id);
      assert.equal(await page.evaluate(async () => (await import('./src/modules/levels.js')).getCurrentLevel()), id);
    }
    assert.deepEqual(await cleared(), []);
    assert.equal(await page.evaluate(async () => {
      try { await (await import('./src/modules/levels.js')).startLevel(30); return false; } catch { return true; }
    }), true);
    await grade(6);
    await page.locator('.demo-result-map').click(); await goToMap(page);
    assert.deepEqual(await cleared(), [6]);
    // All Chapter 2 cards, including Automatic Door, need only the XOR clear.
    for (const id of [31,11,23,29,28,27,26,7,25,30]) {
      await enterStage(page, id);
      assert.equal(await page.evaluate(async () => (await import('./src/modules/levels.js')).getCurrentLevel()), id);
    }
    assert.deepEqual(await cleared(), [6]);
    await grade(30);
    await page.screenshot({ path: `test-results/chapter-access/demo-result-${lang}.png` });
    await page.getByRole('button', { name: lang === 'ko' ? '체험판 마무리' : 'Finish demo', exact: true }).click();
    await page.getByRole('heading', { name: /MEMORY LINK/ }).waitFor();
    await page.getByRole('button', { name: lang === 'ko' ? '스테이지 맵' : 'Stage map', exact: true }).click();
    await goToMap(page);
    assert.deepEqual(await cleared(), [6,30]);
    assert.equal(await page.evaluate(async () => {
      const levels = await import('./src/modules/levels.js');
      if (Object.keys(levels.getLevelTitles()).length !== 17 || levels.getLevelTitle(47)) return false;
      try { await levels.startLevel(47); return false; } catch { return true; }
    }), true, 'Capacity Limit Check stays outside the demo even after the Chapter 3 gate');
    assert.equal((await save()).catalogVersion, 4);
    await enterStage(page, 25); // Ending remains optional and does not close play.
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
    console.log(`Chapter access ${lang}: all 17 cards selected, only XOR gates Chapter 2, Automatic Door first-clear ending, map primary, no next suggestion.`);
  }
} finally { await browser.close(); }
