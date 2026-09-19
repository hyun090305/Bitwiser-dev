import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { observeMap, goToMap } from './demo-browser-helpers.mjs';

const root = path.resolve('dist-web-demo');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
const server = createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end();return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel:process.env.BROWSER_CHANNEL || 'msedge', headless:true });
const errors=[], external=[];
try {
  for (const lang of ['ko','en']) {
    const context = await browser.newContext({ viewport:{width:1440,height:1000}, serviceWorkers:'block', locale:lang==='ko'?'ko-KR':'en-US' });
    await observeMap(context);
    await context.addInitScript(lang=>localStorage.setItem('lang',lang),lang);
    await context.route('**/*',route=>{
      const url=route.request().url();
      if (/^https?:/.test(url) && !url.startsWith(base)) { external.push(url);return route.abort(); }
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.locator('#loadingStartBtn').click();
    await page.locator('#startLevelBtn').click();
    await goToMap(page);
    assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'),'chapter_1');
    await page.keyboard.press('ArrowLeft');await page.waitForTimeout(650);
    assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'),'extras');
    for (const [id,feature] of [['lab','sandbox'],['user_created_stages','problems']]) {
      await page.locator(`[data-extra-node="${id}"]`).focus();
      await page.keyboard.press('Enter');
      const dialog=page.locator('#fullVersionDialog[open]');await dialog.waitFor();
      assert.equal(await dialog.getAttribute('data-feature'),feature);
      assert.equal(await page.locator('#labScreen').isVisible(),false);
      assert.equal(await page.locator('#levelIntroModal').isVisible(),false);
      await page.locator('.full-version-back').click();
    }
    // Pointer entry uses the same platform gate as keyboard entry.
    const point=await page.evaluate(()=>window.mapLabels['EXTERNAL BLUEPRINTS']);
    await page.mouse.click(point.x,point.y);
    await page.locator('#fullVersionDialog[open]').waitFor();
    assert.equal(await page.locator('#fullVersionDialog').getAttribute('data-feature'),'problems');
    await page.locator('.full-version-back').click();
    await page.mouse.move(20,20);await page.waitForTimeout(1000);
    await page.screenshot({path:`test-results/stage-map/extras-demo-${lang}.png`});
    await page.setViewportSize({width:900,height:650});await page.waitForTimeout(350);
    await page.screenshot({path:`test-results/stage-map/extras-small-${lang}.png`});
    for (const id of ['lab','user_created_stages']) {
      const box=await page.locator(`[data-extra-node="${id}"]`).boundingBox();
      assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=900 && box.y+box.height<=650);
    }
    await page.locator('#stageMapChapterNext').click();await page.waitForTimeout(650);
    assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'),'chapter_1');
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Built demo Extras passed: Korean/English, navigation, keyboard/pointer feature gates, and small viewport.');
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
