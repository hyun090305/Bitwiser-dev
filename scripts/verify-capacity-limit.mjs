// Issue #486: exercise the new stage through the real web/Electron UI.
// Synthetic progress and an isolated profile keep user saves/services untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium, _electron } from 'playwright';
import { snapshotCircuit } from '../src/canvas/circuitData.js';

const desktop = process.argv.includes('--electron');
const target = desktop ? 'electron' : 'web', root = path.resolve('.');
const out = path.join(root,'test-results',`capacity-limit-${target}`);
await fs.mkdir(out,{recursive:true});
const fixture = JSON.parse(await fs.readFile('tests/fixtures/stages/47-3.json','utf8')).circuit;
const expected = snapshotCircuit(fixture), errors = [], checks = [];
// Switch positions are part of the saved design; these four are toggled below.
for (const name of ['B1','L1','L0','A1']) expected.blocks[name].value = true;
const profile = desktop ? await fs.mkdtemp(path.join(out,'profile-')) : null;
let server, browser, app, page, origin;
async function launchElectron() {
  const env = {...process.env,BITWISER_TEST_PROFILE:profile}; delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});
  assert.equal(await app.evaluate(({app}) => app.getPath('userData')),profile);
  page = await app.firstWindow();
}
async function ready(lang) {
  await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
  await page.evaluate(lang => localStorage.setItem('lang',lang),lang);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#loadingStartBtn').click();
  await page.evaluate(async () => {
    (await import('./src/modules/storage.js')).setAutoSaveSetting(false);
    // The application has no authenticated account or external network in this test.
    window.firebase ??= {auth:() => ({currentUser:null})};
  });
}
async function enter() {
  await page.evaluate(async () => {
    const levels = await import('./src/modules/levels.js');
    levels.configureLevelModule({progressProvider:() => [30],accessProvider:() => ({})});
    await levels.startLevel(47);
    const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
  });
}
const readCircuit = () => page.evaluate(async () => (await import('./src/canvas/circuitData.js')).snapshotCircuit((await import('./src/modules/grid.js')).getPlayCircuit()));
const readRecord = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('bitwiser:cost-progress:v1:'))
  .map(k => JSON.parse(localStorage.getItem(k)).stages[47]?.best).find(Boolean));
async function grade() {
  await page.locator('#gradeButton').click();
  await page.locator('#clearedModal').waitFor({state:'visible'});
  const record = await readRecord();
  assert.equal(record.totalCost,175); assert.equal(record.stars,1);
  assert.deepEqual(record.circuit,expected);
  assert.equal(await page.evaluate(async () => (await import('./src/modules/levels.js')).getClearedLevels().includes(47)),true);
}
async function leaveResult() {
  await page.locator('#clearedMapBtn').click();
  await page.locator('#stageMapCanvas').waitFor({state:'visible'});
}
try {
  if (desktop) await launchElectron();
  else {
    const mime = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav'};
    server = createServer(async (req,res) => {
      try {
        const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file = path.resolve(root,'.'+(name==='/'?'/index.html':name));
        if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
        res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
      } catch {res.writeHead(404).end();}
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    page = await browser.newPage({serviceWorkers:'block'});
    await page.route('**/*',route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
  }
  page.on('pageerror',e => errors.push(e.message));
  page.setDefaultTimeout(20000);
  for (const lang of ['ko','en']) {
    await ready(lang);
    await enter();
    const title = lang==='ko'?'적재 한도 검사':'Capacity Limit Check';
    assert.match(await page.locator('#introTitle').innerText(),new RegExp(title));
    assert.match(await page.locator('#introDesc').innerText(),/LIMIT = 2\*L1 \+ L0/);
    assert.equal(await page.locator('#truthTable .level-intro-case').count(),7);
    assert.deepEqual(await page.locator('#truthTable .level-intro-case').first().locator('.level-intro-case__bit-label').allTextContents(),['A1','A0','B1','B0','L1','L0','OVER']);
    await page.waitForFunction(() => [...document.querySelectorAll('#truthTable .level-intro-case')].every(el => getComputedStyle(el).opacity === '1'));
    await page.screenshot({path:path.join(out,`${lang}-intro.png`)});
    await page.locator('#startLevelBtn').click();
    assert.equal(await page.locator('#gameTitle').innerText(),title);
    assert.deepEqual(await readCircuit(),{rows:9,cols:15,blocks:{},wires:{}});
    assert.equal(await page.locator('.memory-playback-bar').isVisible(),false);
    const hintTexts = await page.evaluate(async () => {
      const storage = await import('./src/modules/storage.js'); storage.setHintProgress(47,3);
      (await import('./src/modules/hints.js')).openHintModal(47);
      return (await import('./src/modules/levels.js')).getLevelHints().stage47.hints.map(h => h.content);
    });
    for (let i=0;i<3;i++) {
      await page.locator('#hintButtons button').nth(i).click();
      assert.ok((await page.locator('#hintMessage').textContent()).includes(hintTexts[i]));
      await page.locator('#closeHintMessageBtn').click();
    }
    await page.locator('#closeHintBtn').click();
    await page.evaluate(async circuit => {
      const grid = await import('./src/modules/grid.js'); grid.getPlayController().restoreCircuit(circuit); grid.adjustGridZoom();
    },fixture);
    // Toggle actual canvas switches: equality, low-sum exceedance, variable LIMIT,
    // and the non-wrapping sum 4. No direct input-state writes or tick calls.
    for (const [name,over] of [['B1',1],['L1',0],['L0',0],['A1',1]]) {
      const point = await page.locator('#overlayCanvas').evaluate((canvas,pos) => {
        const box=canvas.getBoundingClientRect(),panel=Number(canvas.dataset.panelWidth);
        const scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth);
        return {x:box.x+panel+(2+pos.c*52+25)*scale,y:box.y+(2+pos.r*52+25)*scale};
      },fixture.blocks[name].pos);
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(async ({name,over}) => {
        const c=(await import('./src/modules/grid.js')).getPlayCircuit();
        return c.blocks[name].value===true && Number(c.blocks.OVER.value)===over;
      },{name,over});
    }
    await page.screenshot({path:path.join(out,`${lang}-circuit.png`)});
    await grade();
    await page.screenshot({path:path.join(out,`${lang}-clear.png`)});
    await leaveResult(); await enter(); await page.locator('#startLevelBtn').click();
    await page.evaluate(async () => {
      const entry=Object.keys(localStorage).filter(k=>k.startsWith('bitwiser:cost-progress:v1:'))
        .map(k=>JSON.parse(localStorage.getItem(k)).stages[47]?.best).find(Boolean);
      (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(entry.circuit);
    });
    assert.deepEqual(await readCircuit(),expected);
    if (desktop) {
      await page.locator('#saveCircuitBtn').click();
      await page.waitForFunction(async () => {
        const item=(await window.bitwiserCircuitStore.list({stageId:47,problemKey:null})).value.items[0];
        return item && (await window.bitwiserCircuitStore.readPreview(item.id)).value?.length>0;
      });
      const item=await page.evaluate(async () => (await window.bitwiserCircuitStore.list({stageId:47,problemKey:null})).value.items[0]);
      assert.equal(item.stageRevision,'capacity-limit-2026-09-26');
      await app.close(); app=null; await launchElectron();
      page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(20000);
      await ready(lang); await enter(); await page.locator('#startLevelBtn').click();
      await page.locator('#viewSavedBtn').click(); await page.locator('.saved-load').first().click();
      assert.deepEqual(await readCircuit(),expected);
    } else {
      assert.equal(await page.locator('#saveCircuitBtn').isDisabled(),true);
      assert.equal(await page.locator('#viewSavedBtn').isDisabled(),true);
    }
    await grade(); await leaveResult();
    checks.push({lang,title,emptyStart:true,hints:3,canvasInputs:true,clear:true,cost:175,stars:1,
      restoredCostSnapshot:true,nativeFileRoundTrip:desktop,webNativeStorageDisabled:!desktop});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({target,checks,errors},null,2));
  console.log(JSON.stringify({target,checks,errors}));
} catch (error) {
  await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  console.error(error,errors); process.exitCode=1;
} finally {
  await app?.close(); await browser?.close();
  if (server) await new Promise(resolve=>server.close(resolve));
}
