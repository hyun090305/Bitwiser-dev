import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron as electron } from 'playwright';
import { observeMap, enterStage } from './demo-browser-helpers.mjs';
import { makeCostRecord } from '../src/modules/costRecords.js';
import { preserveStageAccess } from '../src/modules/stageCatalog.js';

const root=path.resolve('.'), out=path.join(root,'test-results/star-progression');
await fs.mkdir(out,{recursive:true});
const levels=JSON.parse(await fs.readFile('levels.json','utf8'));
const stages={};
for(const id of [1,2,3,4,5,7]) {
  const c=JSON.parse(await fs.readFile(`tests/fixtures/demo/${id}-3.json`,'utf8')).circuit;
  const best=makeCostRecord(c,id,levels);stages[id]={best,bestStars:best,highestStars:best.stars};
}
const cleared=Object.keys(stages).map(Number);
const seedAccess=preserveStageAccess(cleared,{}, {stageStars:Object.fromEntries(cleared.map(id=>[id,stages[id].highestStars]))});
assert.equal(Object.values(seedAccess.stageStars).reduce((a,b)=>a+b,0),17);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const body = await fs.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const native=process.argv.includes('--electron');
const browser=native?null:await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
let app;
const report=[];
try {
  for(const lang of ['ko','en']) {
    if(native) {
      const profile=await fs.mkdtemp(path.join(root,'test-results','star-progression-electron-'));
      const env={...process.env,BITWISER_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
      app=await electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});
    }
    const context=native?app.context():await browser.newContext({viewport:{width:1440,height:980},locale:lang,serviceWorkers:'block'});
    await observeMap(context);
    if(!native) await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await context.addInitScript(({lang,stages,seedAccess})=>{
      window.firebase={initializeApp(){},database:()=>undefined};
      localStorage.setItem('lang',lang);localStorage.setItem('username','Progress QA');localStorage.setItem('autoSaveCircuit','false');
      if(!localStorage.getItem('progression-seeded')) {
        localStorage.setItem('bitwiser:cost-progress:v1:Progress QA',JSON.stringify({stages}));
        localStorage.setItem('stageMapAccess_v3_Progress QA',JSON.stringify(seedAccess));
        localStorage.setItem('progression-seeded','1');
      }
    },{lang,stages,seedAccess});
    const page=native?await app.firstWindow():await context.newPage(), errors=[];
    await page.setViewportSize({width:1440,height:980});
    page.on('pageerror',e=>errors.push(e.stack));
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('stageMapAccess_v3_Progress QA')));
    const focus=async id=>{
      await page.evaluate(id=>document.dispatchEvent(new CustomEvent('stageMap:focusChapter',{detail:id})),id);
      await page.waitForFunction(id=>document.querySelector('.stage-map-chapter-nav').dataset.chapterId===id,id);
    };
    if(native) await page.reload();else await page.goto(base);
    await page.locator('#loadingStartBtn').click();
    await page.locator('#loadingScreen').waitFor({state:'hidden'});
    assert.match(await page.locator('#chapterTotalStars').innerText(),/17/);
    for(const [n,required,id] of [[2,18,25],[3,36,9],[4,50,32],[5,84,38]]) {
      await focus(`chapter_${n}`);
      assert.equal(await page.locator('.chapter-lock-overlay').isVisible(),true);
      assert.match(await page.locator('.chapter-lock-requirement').innerText(),new RegExp(String(required)));
      assert.match(await page.locator('.chapter-lock-progress').innerText(),new RegExp(String(required-17)));
      assert.equal(await page.evaluate(async id=>{try{await(await import('./src/modules/levels.js')).startLevel(id);return false;}catch{return true;}},id),true);
      await page.locator('.chapter-lock-panel').click();await page.keyboard.press('Enter');
      assert.equal(await page.locator('#levelIntroModal').isVisible(),false);
    }
    await page.setViewportSize({width:900,height:650});await focus('chapter_3');
    await page.waitForFunction(()=>{
      const panel=document.querySelector('.chapter-lock-panel').getBoundingClientRect();
      const nav=document.querySelector('.stage-map-chapter-nav').getBoundingClientRect();
      return panel.x>=0&&panel.y>=0&&panel.right<=innerWidth&&panel.bottom<nav.y;
    });
    const rects=await page.evaluate(()=>{
      const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
      return {panel:box('.chapter-lock-panel'),nav:box('.stage-map-chapter-nav')};
    });
    assert.ok(rects.panel.x>=0&&rects.panel.y>=0&&rects.panel.x+rects.panel.w<=900&&rects.panel.y+rects.panel.h<rects.nav.y);
    await page.screenshot({path:path.join(out,`${native?'electron':'web'}-locked-${lang}.png`)});
    await page.setViewportSize({width:1440,height:980});
    await enterStage(page,6);
    const circuit=JSON.parse(await fs.readFile('tests/fixtures/demo/6-3.json','utf8')).circuit;
    await page.evaluate(async c=>(await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c),circuit);
    await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
    assert.ok((await saved()).unlockedChapters.includes('chapter_2'));
    assert.ok((await saved()).pendingChapters.includes('chapter_2'));
    await page.locator('.chapter-result-unlock:visible').waitFor();
    assert.match(await page.locator('.chapter-result-unlock').innerText(),/CHAPTER 2 · Memory Link/);
    assert.equal(await page.locator('#clearedModal .blueprint-card').getAttribute('data-phase'),'settled');
    await page.screenshot({path:path.join(out,`${native?'electron':'web'}-result-${lang}.png`)});
    await page.locator('#clearedMapBtn').click();
    assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'),'chapter_2');
    // The native smoke window is hidden; dispatch the same button event before
    // the 900ms animation expires instead of waiting for window hit testing.
    if(native) await page.locator('.chapter-unlock-skip').dispatchEvent('click');
    else await page.locator('.chapter-unlock-skip:visible').click();
    assert.ok((await saved()).seenChapters.includes('chapter_2'));
    assert.equal(await page.locator('.chapter-lock-overlay').isVisible(),false);
    await focus('chapter_1');await focus('chapter_2');
    assert.equal(await page.locator('.chapter-lock-overlay').isVisible(),false);
    assert.match(await page.locator('#chapterTotalStars').innerText(),/19/);

    await page.evaluate(()=>{
      const key='stageMapAccess_v3_Progress QA',access=JSON.parse(localStorage.getItem(key));
      access.pendingChapters=['chapter_2'];access.seenChapters=[];localStorage.setItem(key,JSON.stringify(access));
    });
    await page.reload();await page.locator('#loadingStartBtn').click();
    await page.locator('.chapter-unlock-skip:visible').waitFor();
    await page.reload();
    assert.deepEqual((await saved()).pendingChapters,['chapter_2']);
    await page.locator('#loadingStartBtn').click();
    await page.locator('.chapter-unlock-skip:visible').waitFor();
    await page.waitForTimeout(950);
    assert.deepEqual((await saved()).pendingChapters,[]);
    assert.equal(await page.locator('.chapter-lock-overlay').isVisible(),false);
    assert.equal(await page.locator('#gameScreen').isVisible(),false);

    // A persisted pending presentation survives a closed app and does not run
    // behind the startup overlay. Moving tabs acknowledges only this chapter.
    await page.evaluate(()=>{
      const key='stageMapAccess_v3_Progress QA',access=JSON.parse(localStorage.getItem(key));
      access.pendingChapters=['chapter_2','chapter_3'];access.seenChapters=[];
      access.unlockedChapters.push('chapter_3');localStorage.setItem(key,JSON.stringify(access));
    });
    await page.reload();await page.locator('#loadingStartBtn').waitFor();
    assert.deepEqual((await saved()).pendingChapters,['chapter_2','chapter_3']);
    await page.locator('#loadingStartBtn').click();
    await page.locator('.chapter-unlock-skip:visible').waitFor();
    await page.locator('#stageMapChapterPrev').click();
    assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'),'chapter_1');
    assert.deepEqual((await saved()).pendingChapters,['chapter_3']);
    await page.emulateMedia({reducedMotion:'reduce'});
    await focus('chapter_3');await page.waitForTimeout(150);
    assert.equal(await page.locator('.chapter-lock-overlay').isVisible(),false);
    assert.deepEqual((await saved()).pendingChapters,[]);
    assert.equal(await page.locator('#gameScreen').isVisible(),false);
    assert.deepEqual(errors,[]);
    report.push({surface:native?'electron':'web',lang,lockedChapters:4,entryGuards:true,totalBefore:17,totalAfter:19,actualGradeUnlock:true,resultAfterBlueprint:true,skip:true,restartBeforeAndDuring:true,completeAfter900ms:true,multiplePending:true,tabCancellation:true,reducedMotion:true,errors});
    if(native) {await app.close();app=null;}else await context.close();
  }
  await fs.writeFile(path.join(out,`${native?'electron':'web'}.json`),JSON.stringify(report,null,2));
  console.log('Star progression: both languages, real 17→19 star clear, four locked previews/API guards, result ordering, skip, restart, multiple pending chapters and reduced motion passed.');
} finally {await app?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
