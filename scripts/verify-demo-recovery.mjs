import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { observeMap, enterStage, openSettings } from './demo-browser-helpers.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base=process.env.DEMO_URL || 'http://127.0.0.1:8080';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
const errors=[];
const backup=JSON.parse(await fs.readFile('test-results/demo-progress.json','utf8'));
const fixture=JSON.parse(await fs.readFile('tests/fixtures/demo/1-3.json','utf8')).circuit;
const readSave=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('bitwiser:web-demo:v1')));
async function newPage(options={},init) {
  const ctx=await browser.newContext(options); await observeMap(ctx); if(init) await ctx.addInitScript(init);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page};
}
try {
  // Korean touch layout, actual pointer editing, undo/redo, and automatic draft recovery.
  const mobile=await newPage({locale:'ko-KR',viewport:{width:940,height:600},isMobile:true,hasTouch:true});
  await mobile.ctx.addInitScript(({backup})=>{if(!localStorage.getItem('bitwiser:web-demo:v1')) localStorage.setItem('bitwiser:web-demo:v1',JSON.stringify(backup));localStorage.setItem('lang','ko');},{backup:{...backup,lastStageId:1}});
  const p=mobile.page;await p.goto(base);await p.locator('#loadingStartBtn').click();await p.locator('#startLevelBtn').click();
  await p.evaluate(async c=>{(await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c);},fixture);
  const point=async(r,c)=>p.locator('#overlayCanvas').evaluate((canvas,{r,c})=>{
    const box=canvas.getBoundingClientRect(), panel=Number(canvas.dataset.panelWidth), scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth);
    return {x:box.x+panel+(2+c*52+25)*scale,y:box.y+(2+r*52+25)*scale};
  },{r,c});
  const a=await point(1,1);await p.touchscreen.tap(a.x,a.y);
  assert.equal(await p.evaluate(async()=> (await import('./src/modules/grid.js')).getPlayCircuit().blocks.a.value),true);
  const from=await point(1,3),to=await point(1,4),cdp=await mobile.ctx.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
  for(let i=1;i<=6;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/6,y:from.y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await p.evaluate(async()=> (await import('./src/modules/grid.js')).getPlayCircuit().blocks.g.pos.c),4);
  await p.locator('#undoBtn').tap();assert.equal(await p.evaluate(async()=> (await import('./src/modules/grid.js')).getPlayCircuit().blocks.g.pos.c),3);
  await p.locator('#redoBtn').tap();assert.equal(await p.evaluate(async()=> (await import('./src/modules/grid.js')).getPlayCircuit().blocks.g.pos.c),4);
  await p.screenshot({path:'test-results/demo-touch-ko.png'});
  await openSettings(p);
  await p.keyboard.press('Control+z');
  assert.equal(await p.evaluate(async()=> (await import('./src/modules/grid.js')).getPlayCircuit().blocks.g.pos.c),4);
  await p.locator('#settingsCloseBtn').click();
  await p.waitForTimeout(550);
  await p.reload(); await p.locator('#loadingStartBtn').click(); await p.locator('#startLevelBtn').click();
  assert.equal((await readSave(p)).lastStageId,1);
  assert.equal(await p.evaluate(async()=> (await import('./src/modules/grid.js')).getPlayCircuit().blocks.g.pos.c),4);
  // A failed clipboard copy offers selectable text and a download.
  await enterStage(p,6);
  await p.locator('#demoShareBtn').tap();
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('denied'))},configurable:true}));
  await p.getByRole('button',{name:'텍스트 복사',exact:true}).click();await p.getByText('복사 권한이 없습니다.',{exact:false}).waitFor();
  await p.evaluate(()=>{window.GIF=class { constructor(){throw new Error('Encoder unavailable');} };});
  await p.getByRole('button',{name:'GIF 다운로드',exact:true}).click();
  await p.getByText('GIF 생성에 실패했습니다.',{exact:false}).waitFor();
  const textDownload=p.waitForEvent('download');
  await p.getByRole('button',{name:'텍스트 다운로드',exact:true}).click();
  await (await textDownload).saveAs('test-results/demo-share-fallback.txt');
  assert.match(await fs.readFile('test-results/demo-share-fallback.txt','utf8'),/XOR/);
  assert.equal(await p.evaluate(()=>window.isScoring),false);
  await mobile.ctx.close();

  // localStorage itself can throw SecurityError, including during module load.
  const blocked=await newPage({locale:'en-US',viewport:{width:1280,height:850}},()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
  const q=blocked.page;await q.goto(base);await q.locator('#loadingStartBtn').click();
  await q.locator('#startLevelBtn').click();
  assert.match(await q.locator('#demoSaveStatus').innerText(),/Autosave is unavailable/);
  const tutorial=JSON.parse(await fs.readFile('tests/fixtures/demo/0-tutorial.json','utf8')).circuit;
  await q.evaluate(async c=>(await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c),tutorial);
  await q.locator('#gradeButton').click();await q.locator('#demoDialog[open]').waitFor();
  await q.getByRole('button',{name:'Back to map',exact:true}).click();
  await enterStage(q,1);
  assert.equal(await q.evaluate(async()=> (await import('./src/modules/levels.js')).getCurrentLevel()),1);
  await blocked.ctx.close();

  // Install an older demo worker, then upgrade in place and retain both game
  // progress and an unrelated application's cache. Route only the SW script;
  // all application assets still come from the real demo server.
  const swTest=await newPage({locale:'en-US'});let old=true;
  await swTest.ctx.route('**/service-worker-demo.js',async route=>{
    if(old) return route.fulfill({contentType:'text/javascript',body:`
      self.addEventListener('install',e=>e.waitUntil(caches.open('bitwiser-demo-old').then(async cache=>{
        await cache.put(new URL('src/demo/main.js',self.registration.scope),new Response("throw new Error('Old entry used with new HTML')",{headers:{'Content-Type':'text/javascript'}}));
        await self.skipWaiting();
      })));
      self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch',e=>e.respondWith(caches.open('bitwiser-demo-old').then(async cache=>(await cache.match(e.request))||fetch(e.request))));
    `});
    return route.continue();
  });
  const s=swTest.page;await s.goto(base);await s.locator('#loadingStartBtn').waitFor();
  await s.evaluate(async backup=>{localStorage.setItem('bitwiser:web-demo:v1',JSON.stringify(backup));await caches.open('unrelated-app-cache');await navigator.serviceWorker.ready;},backup);
  await s.reload();await s.locator('#loadingStartBtn').waitFor();
  await s.locator('#loadingStartBtn').click();await s.locator('#startLevelBtn').click();
  await openSettings(s);
  old=false;await s.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await s.locator('#demoUpdateBtn').waitFor({timeout:20000});
  const before=await readSave(s);
  await Promise.all([s.waitForEvent('load'), s.locator('#demoUpdateBtn').click()]);
  await s.locator('#loadingStartBtn').waitFor();
  assert.deepEqual((await readSave(s)).stages,before.stages);
  const cachesAfter=await s.evaluate(()=>caches.keys());assert.ok(cachesAfter.includes('unrelated-app-cache'));assert.ok(!cachesAfter.includes('bitwiser-demo-old'));
  await swTest.ctx.close();
  assert.deepEqual(errors,[]);
  console.log('Recovery checks passed: Korean touch editing, Undo/Redo, automatic draft recovery, clipboard/GIF fallback, blocked storage play/progress, old SW upgrade with progress/cache preservation.');
} catch(error){console.error(error);console.error(errors);process.exitCode=1;}
finally{await browser.close();}
