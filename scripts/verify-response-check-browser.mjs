import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron as electron } from 'playwright';
import { emptyProgress } from '../src/demo/records.js';

// Exercise the real entry points in isolated profiles. No account or network writes.
const root = path.resolve('.'), report = [], errors = [];
const fixture = JSON.parse(await fs.readFile('tests/fixtures/memory20/29.json', 'utf8')).circuit;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.mp3':'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name.endsWith('/')) name += 'index.html';
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'}).end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await fs.mkdir('test-results/response-check', {recursive:true});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, app;

async function verify(page, surface, lang) {
  page.on('pageerror', error => errors.push(`${surface}/${lang}: ${error.message}`));
  await page.locator('#loadingStartBtn:enabled').click();
  await page.evaluate(async () => {
    const levels = await import('./src/modules/levels.js');
    if (!location.pathname.includes('dist-web-demo')) levels.configureLevelModule({progressProvider:()=>[6]});
    await levels.startLevel(29);
    const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
  });
  const title = lang === 'ko' ? '응답 확인' : 'Response Check';
  assert.match(await page.locator('#levelIntroModal').innerText(), new RegExp(title));
  assert.doesNotMatch(await page.locator('#levelIntroModal').innerText(), /COMMIT|WRITE|RESET|Q0|Q1/);
  await page.locator('#startLevelBtn').click();
  await page.locator('#levelIntroModal').waitFor({state:'hidden'});
  assert.equal(await page.locator('#gameTitle').innerText(), title);
  const data = await page.evaluate(async () => {
    const levels = await import('./src/modules/levels.js'), grid = await import('./src/modules/grid.js');
    return { grid:levels.getLevelGridSize(29), palette:levels.getLevelBlockSet(29), fixed:levels.getLevelFixedIO(29), blocks:Object.keys(grid.getPlayCircuit().blocks).length };
  });
  assert.deepEqual(data.grid, [14,17]); assert.equal(data.fixed.fixIO, false);
  assert.equal(data.blocks, 0);
  assert.deepEqual(data.palette.filter(b => b.type==='INPUT'), [{type:'INPUT',name:'A',inputMode:'button'},{type:'INPUT',name:'B',inputMode:'button'}]);
  assert.deepEqual(data.palette.filter(b => b.type==='OUTPUT'), [{type:'OUTPUT',name:'GO'}]);
  await page.screenshot({path:`test-results/response-check/${surface}-${lang}-palette.png`});
  await page.evaluate(async circuit => {
    const grid = await import('./src/modules/grid.js');
    grid.getPlayController().restoreCircuit(circuit); grid.adjustGridZoom();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, fixture);
  const outputs = [];
  // Click the actual Button blocks, then use the controller's existing tick.
  for (const mask of [1,0,2,2,1,3,3,0]) {
    for (const [id, bit] of [['A',1],['B',2]]) if (mask & bit) {
      const p = await page.evaluate(async id => {
        const c = (await import('./src/modules/grid.js')).getPlayCircuit(), canvas = document.getElementById('overlayCanvas'), box = canvas.getBoundingClientRect();
        const scale = Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth), b = c.blocks[id];
        return {x:box.x+Number(canvas.dataset.panelWidth)+(2+b.pos.c*52+25)*scale, y:box.y+(2+b.pos.r*52+25)*scale};
      }, id);
      await page.mouse.click(p.x,p.y);
      assert.equal(await page.evaluate(async id => (await import('./src/modules/grid.js')).getPlayCircuit().blocks[id].value,id), true, `${surface}/${lang}: click ${id}`);
    }
    const tick = await page.evaluate(async () => {
      const grid = await import('./src/modules/grid.js'), engine = await import('./src/canvas/evaluation.js'), c = grid.getPlayCircuit();
      const before = engine.getExecutionState(c).tick;
      grid.getPlayController().tickRunner.step();
      const state = engine.getExecutionState(c);
      return {before, after:state.tick, go:Number(state.lastTick.values.get('OUT_GO')), inputs:[c.blocks.A.value,c.blocks.B.value]};
    });
    assert.equal(tick.after,tick.before+1); assert.deepEqual(tick.inputs,[false,false]); outputs.push(tick.go);
  }
  assert.deepEqual(outputs,[0,0,1,0,1,1,1,0]);
  await page.locator('#gradeButton').click();
  if (surface==='demo') {
    await page.locator('#demoDialog[open]').waitFor();
    assert.ok(await page.locator('.demo-result-map').count());
  } else {
    await page.locator('#clearedModal').waitFor({state:'visible'});
    assert.match(await page.locator('#clearedModal').innerText(),lang==='ko'?/통과/:/verified|passed|clear/i);
  }
  await page.screenshot({path:`test-results/response-check/${surface}-${lang}-passed.png`});
  report.push({surface,lang,title,...data,outputs,graded:true});
  console.log(`Response Check: ${surface}/${lang} title, palette, Button clicks, consumption and grading passed.`);
}

try {
  browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  for (const surface of ['web','demo']) for (const lang of ['ko','en']) {
    const context = await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
    const progress = emptyProgress(); progress.unlockedChapters=['chapter_2'];
    await context.addInitScript(({lang,progress}) => {
      localStorage.setItem('lang',lang); localStorage.setItem('bgmEnabled','false'); localStorage.setItem('autoSaveCircuit','false');
      localStorage.setItem('bitwiser:web-demo:v1',JSON.stringify(progress));
    },{lang,progress});
    await context.route('**/*', route => route.request().url().startsWith(base)?route.continue():route.abort());
    const page = await context.newPage();
    await page.goto(base+(surface==='demo'?'/dist-web-demo/':'/'));
    await verify(page,surface,lang); await context.close();
  }
  await browser.close(); browser = null;
  const profile = await fs.mkdtemp(path.join(root,'test-results','response-check-electron-'));
  const env = {...process.env,BITWISER_TEST_PROFILE:profile}; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});
  const page = await app.firstWindow();
  for (const lang of ['ko','en']) {
    await page.evaluate(lang => {localStorage.setItem('lang',lang); localStorage.setItem('bgmEnabled','false'); localStorage.setItem('autoSaveCircuit','false');},lang);
    await page.reload(); await verify(page,'electron',lang);
  }
  assert.deepEqual(errors,[]);
} finally {
  await app?.close(); await browser?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await fs.writeFile('test-results/response-check/report.json',JSON.stringify({report,errors},null,2)+'\n');
}
