import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { verifyGameplayActions } from './gameplay-ui-checks.mjs';
import { drawFeedbackWire } from './feedback-ui-checks.mjs';
const root=path.resolve('.');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({locale:'en-US',serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*', route => route.request().url().startsWith(`http://127.0.0.1:${server.address().port}`) ? route.continue() : route.abort());
// Expose the real custom-problem callback only in this disconnected test page.
// This exercises the production entry path without a Firebase write or test API.
await page.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: `${await response.text()}\nwindow.testStartCustomProblem = startCustomProblem;\n` });
});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>document.getElementById('loadingStartBtn')?.disabled===false,{},{timeout:25000});
  assert.equal(await page.locator('#storyHudBtn, #storyPlaybackOverlay, #storyModalOverlay').count(),0);
  const result=await page.evaluate(async()=>({stages:Object.keys((await import('./src/modules/levels.js')).getLevelTitles()).length,hasLegacyAccount:!!document.getElementById('googleLoginBtn'),hasLegacyLabNode:(await(await fetch('stage_map.json')).json()).nodes.some(n=>n.id==='lab')}));
  assert.equal(result.stages,47);assert.ok(result.hasLegacyAccount);assert.ok(result.hasLegacyLabNode);assert.deepEqual(errors,[]);
  const storageBoundary=await page.evaluate(async()=>{
    const storage=await import('./src/modules/circuitStorage.js');
    let error;try{await storage.circuitStorage.list({stageId:1,problemKey:null});}catch(e){error=e.code;}
    return {available:storage.isCircuitStorageAvailable(),error,
      disabled:['saveCircuitBtn','viewSavedBtn','autoSaveCheckbox'].every(id=>document.getElementById(id).disabled),
      reason:document.getElementById('nativeSaveNotice').textContent,
      scripts:[...document.scripts].map(script=>script.src)};
  });
  assert.equal(storageBoundary.available,false);assert.equal(storageBoundary.error,'NATIVE_UNAVAILABLE');assert.ok(storageBoundary.disabled);
  assert.match(storageBoundary.reason,/desktop|데스크톱/);
  assert.equal(storageBoundary.scripts.some(src=>/apis\.google\.com|accounts\.google\.com|cdn.*gif\.js/.test(src)),false);
  const guards=await page.evaluate(async()=>{
    const levels=await import('./src/modules/levels.js');
    const checks=[];
    for(const [id,cleared] of [[25,[]],[25,[6]],[9,[9]],[12,[30]],[12,[30,11]],[34,[30]],[35,[30,31]],[32,[30,31]]]) {
      levels.configureLevelModule({progressProvider:()=>cleared});
      try {await levels.startLevel(id);checks.push(true);}catch{checks.push(false);}
    }
    return checks;
  });
  assert.deepEqual(guards,[false,true,true,true,true,true,true,true]);
  for (const lang of ['en', 'ko']) {
    await page.evaluate(lang => localStorage.setItem('lang', lang), lang);
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.locator('#loadingStartBtn').click();
    await page.evaluate(() => window.testStartCustomProblem('review-layout', {
      title: 'Review custom problem', gridRows: 6, gridCols: 6, inputCount: 1, outputCount: 1,
      table: [{ IN1: 0, OUT1: 1 }, { IN1: 1, OUT1: 0 }]
    }));
    await page.locator('#startLevelBtn').click();
    assert.equal(await page.locator('#gameTitle').innerText(), 'Review custom problem');
    assert.equal(await page.locator('#rightPanel').evaluate(el => getComputedStyle(el).display), 'flex');
    await page.locator('#systemMenuBtn').click();
    await page.locator('#backToLevelsBtn').click();
    await page.locator('#stageMapCanvas').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      const levels = await import('./src/modules/levels.js');
      levels.configureLevelModule({ progressProvider: () => [0] });
      await levels.startLevel(6);
      const nav = await import('./src/modules/navigation.js');
      nav.hideStageMapScreen(); nav.showGameScreen();
    });
    await page.locator('#startLevelBtn').click();
    // The disconnected test session has no Firebase SDK. Supply only the
    // signed-out identity boundary used by the unchanged hint policy.
    await page.evaluate(() => { window.firebase ??= { auth: () => ({ currentUser: null }) }; });
    await verifyGameplayActions(page, { screenshot: `test-results/full-actions-${lang}` });
    await page.locator('#gameTitle').click();
    await page.locator('#levelIntroModal').waitFor({ state: 'visible' });
    await page.locator('#startLevelBtn').click();
    await page.locator('#viewRankingBtn').click();
    await page.locator('#rankingModal').waitFor({ state: 'visible' });
    await page.locator('#rankingModal').getByRole('button', { name: lang === 'ko' ? '닫기' : 'Close', exact: true }).click();
    if (lang === 'en') {
      const circuit = JSON.parse(await fs.readFile('tests/fixtures/demo/6-3.json', 'utf8')).circuit;
      await page.evaluate(async circuit => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(circuit), circuit);
      await page.locator('#exportGifBtn').click();
      await page.locator('#gifModal').waitFor({ state: 'visible' });
      assert.match(await page.locator('#gifPreview').getAttribute('src'), /^blob:/);
      await page.locator('#closeGifModal').click();
    }
    await page.locator('#systemMenuBtn').click();
    await page.locator('#backToLevelsBtn').click();
    await page.locator('#stageMapCanvas').waitFor({ state: 'visible' });
    await page.locator('#settingsBtn').click();
    assert.equal(await page.locator('#sfxCheckbox').isChecked(), await page.evaluate(async () => (await import('./src/modules/storage.js')).getSfxEnabledSetting()));
    await page.locator('#settingsCloseBtn').click();
    await page.evaluate(async () => (await import('./src/modules/labMode.js')).openLabModeFromShortcut());
    assert.equal(await page.locator('#systemMenuBtn').isVisible(), false);
    assert.equal(await page.locator('#stageQuickActions').isVisible(), false);
    assert.equal(await page.locator('#circuitManagement').isVisible(), false);
    await page.locator('#labExitBtn').click();
    await page.locator('#stageMapCanvas').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      await (await import('./src/modules/levels.js')).startLevel(6);
      const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
    });
    await page.locator('#startLevelBtn').click();
    assert.equal(await page.locator('#stageQuickActions').isVisible(), true);
    assert.equal(await page.locator('#circuitManagement').isVisible(), true);
    await page.locator('#systemMenuBtn').click();
    await page.locator('#continueGameBtn').click();
    await page.evaluate(async()=>{
      const levels=await import('./src/modules/levels.js');
      levels.configureLevelModule({progressProvider:()=>[6]});await levels.startLevel(25);
      const nav=await import('./src/modules/navigation.js');nav.hideStageMapScreen();nav.showGameScreen();
    });
    await page.locator('#startLevelBtn').click();
    for (const role of ['D','EN']) {
      const c=JSON.parse(await fs.readFile('tests/fixtures/demo/25-3.json','utf8')).circuit;delete c.wires.w1;
      if (role==='D') delete c.wires.w0;
      c.wires.loop={id:'loop',startBlockId:'Q',endBlockId:'Q',inputRole:role,
        path:[[2,2],[2,3],[2,4],[1,4],[0,4],[0,3],[0,2],[1,2],[2,2]].map(([r,c])=>({r,c}))};
      await drawFeedbackWire(page,c);
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({...result,nativeStorageDisabled:storageBoundary.disabled,selfFeedbackKoEn:true,errors}));
}catch(error){console.error(error,errors);process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
