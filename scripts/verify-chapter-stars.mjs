import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron as electron } from 'playwright';
import { snapshotCircuit } from '../src/canvas/circuitData.js';
import { makeCostRecord } from '../src/modules/costRecords.js';
import { validateSavedCircuitRecord } from '../src/modules/savedCircuitRecord.js';
import { beforeChapterStars, chapterStarIds } from '../tests/helpers/chapter-stars.mjs';
import { observeMap } from './demo-browser-helpers.mjs';

const root=path.resolve('.'), out='test-results/chapter-stars', report=[], errors=[];
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const levels=await read('levels.json');
const circuits=Object.fromEntries(await Promise.all(['19-3','19-2','47-3'].map(async key=>[key,(await read(`tests/fixtures/stages/${key}.json`)).circuit])));
const prior=beforeChapterStars(levels), old47=makeCostRecord(circuits['47-3'],47,prior);
const oldDefinition=levels.levelPreviousLayouts[19][0];
const oldDesign={rows:7,cols:7,blocks:Object.fromEntries(oldDefinition.levelFixedIO.grid.map(b=>[b.name,{id:b.name,type:b.type,name:b.name,fixed:true,value:false,pos:{r:Math.floor(b.index/7),c:b.index%7}}])),wires:{}};
// Keep a non-IO block and an actual wire at the old right edge when saving.
oldDesign.blocks.edge={id:'edge',type:'NOT',name:'edge',fixed:false,value:false,pos:{r:4,c:6}};
oldDesign.wires.edge={id:'edge',startBlockId:'edge',endBlockId:'OUT1',path:[{r:4,c:6},{r:5,c:6},{r:6,c:6}]};
validateSavedCircuitRecord({version:2,stageId:19,circuit:oldDesign});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname), file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
});
await fs.mkdir(out,{recursive:true});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,app;

async function initialize(context,lang) {
  await observeMap(context);
  await context.addInitScript(({lang,old47})=>{
    // The existing map's UGC loader recognizes an absent DB as undefined.
    // Keep that service absent while exercising the real local map/cost UI.
    window.firebase={initializeApp(){},database:()=>undefined};
    localStorage.setItem('lang',lang);localStorage.setItem('username',`Stars ${lang}`);
    localStorage.setItem('bgmEnabled','false');localStorage.setItem('autoSaveCircuit','false');
    const key=`bitwiser:cost-progress:v1:Stars ${lang}`;
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({stages:{47:{best:old47,bestStars:old47,highestStars:1}}}));
    const fill=CanvasRenderingContext2D.prototype.fill, clear=CanvasRenderingContext2D.prototype.clearRect;
    window.mapGoldStars=[];
    CanvasRenderingContext2D.prototype.clearRect=function(...args){
      if(this.canvas.id==='stageMapCanvas')window.mapGoldStars=[];
      return clear.apply(this,args);
    };
    CanvasRenderingContext2D.prototype.fill=function(...args){
      if(this.canvas.id==='stageMapCanvas' && this.strokeStyle==='#c5ac70' && typeof this.fillStyle!=='string') {
        const p=this.getTransform().transformPoint(new DOMPoint(32,32)),box=this.canvas.getBoundingClientRect();
        window.mapGoldStars.push({x:box.x+p.x*box.width/this.canvas.width,y:box.y+p.y*box.height/this.canvas.height});
      }
      return fill.apply(this,args);
    };
  },{lang,old47});
}

async function verify(page,surface,lang) {
  page.setDefaultTimeout(20000);
  await page.setViewportSize({width:1440,height:1000});
  page.on('pageerror',error=>errors.push(`${surface}/${lang}: ${error.message}`));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.locator('#loadingStartBtn:enabled').click();
  await page.locator('#loadingScreen').waitFor({state:'hidden'});
  await page.waitForFunction(()=>Boolean(document.querySelector('.stage-map-chapter-nav')?.dataset.chapterId));
  await page.evaluate(async()=>{(await import('./src/modules/levels.js')).configureLevelModule({progressProvider:()=>[30,47,19]});});
  async function enter(id) {
    await page.evaluate(async id=>{
      await(await import('./src/modules/levels.js')).startLevel(id);
      const nav=await import('./src/modules/navigation.js');nav.hideStageMapScreen();nav.showGameScreen();
    },id);
    await page.locator('#startLevelBtn:enabled').click();
    await page.locator('#levelIntroModal').waitFor({state:'hidden'});
  }
  const restore=c=>page.evaluate(async c=>{const g=await import('./src/modules/grid.js');g.getPlayController().restoreCircuit(c);g.adjustGridZoom();},c);
  const design=()=>page.evaluate(async()=>{const g=await import('./src/modules/grid.js');return(await import('./src/canvas/circuitData.js')).snapshotCircuit(g.getPlayCircuit());});
  for(const id of chapterStarIds) {
    await enter(id);
    const t=levels.levelStarThresholds[id];
    assert.deepEqual(await page.locator('#circuitCostBoard .cost-target').allTextContents(),[`≤ ${t.twoStarMaxCost}`,`≤ ${t.threeStarMaxCost}`]);
    if(id===19) {
      const c=await design();assert.deepEqual([c.rows,c.cols],[8,8]);
      assert.deepEqual(Object.values(c.blocks).map(b=>[b.name,b.pos.r*8+b.pos.c]).sort(),[['IN1',0],['IN2',56],['OUT1',63],['OUT2',7]]);
      await page.screenshot({path:`${out}/${surface}-${lang}-crossroad-board.png`});
    }
  }
  console.log(`Verified 22 editor targets: ${surface}/${lang}.`);
  await enter(47);
  assert.match(await page.locator('#circuitCostBoard .cost-best').innerText(),/175/,'previous valid cost survives without replay');
  const upgraded=await page.evaluate(()=>JSON.parse(localStorage.getItem(`bitwiser:cost-progress:v1:Stars ${window.currentLang}`)).stages[47]);
  assert.equal(upgraded.best.totalCost,175);
  // Reading current stars need not eagerly rewrite the raw historical record.
  // The map below must render the re-evaluated three-star result.
  for(const [id,key,cost,stars] of [[47,'47-3',175,3],[19,'19-3',152,3],[19,'19-2',178,2]]) {
    await enter(id);await restore(circuits[key]);
    await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
    assert.equal(await page.locator('#clearedModal .cost-result-total').innerText(),String(cost));
    assert.equal(await page.locator('#clearedModal .cost-stars .earned').count(),stars);
    if(stars===2) {
      assert.match(await page.locator('#clearedModal .cost-goal').innerText(),/13/);
      assert.equal(await page.locator('#clearedModal .cost-best-stars .earned').count(),3);
    }
    await page.locator('#clearedModal .blueprint-card[data-phase="settled"]').waitFor();
    await page.screenshot({path:`${out}/${surface}-${lang}-${key}-result.png`});
    await page.locator('#clearedMapBtn').click();await page.locator('#stageMapCanvas').waitFor({state:'visible'});
    const chapter=id===47?'chapter_3':'chapter_4';
    for(let attempt=0;attempt<5;attempt++) {
      const current=await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id');
      if(current===chapter)break;
      await page.locator(Number(current?.replace('chapter_',''))<Number(chapter.replace('chapter_',''))?'#stageMapChapterNext':'#stageMapChapterPrev').click();
      await page.waitForTimeout(600);
    }
    assert.equal(await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id'),chapter);
    await page.waitForTimeout(1000);
    // Flush painting in the hidden Electron window before inspecting canvas samples.
    await page.screenshot({path:`${out}/${surface}-${lang}-${key}-map.png`});
    const title=await page.evaluate(async id=>(await import('./src/modules/levels.js')).getLevelTitle(id),id);
    const gold=await page.evaluate(title=>{
      const point=Object.entries(window.mapLabels).find(([label,p])=>(label.toUpperCase()===title.toUpperCase()||title.toUpperCase().startsWith(label.toUpperCase()+' '))&&p.x>0&&p.x<innerWidth&&p.y>0&&p.y<innerHeight)?.[1];
      return point?window.mapGoldStars.filter(p=>Math.abs(p.x-point.x)<65&&p.y>point.y&&p.y<point.y+110):[];
    },title);
    assert.equal(gold.length,3,`${surface}/${lang}/${id} map retains three earned stars`);
  }
  if(surface==='electron') {
    await enter(19);
    const response=await page.evaluate(circuit=>window.bitwiserCircuitStore.save({version:2,stageId:19,circuit}),oldDesign);
    assert.equal(response.ok,true,JSON.stringify(response));
    const saved=response.value;
    assert.ok(saved.id);
    assert.equal(await page.evaluate(async id=>(await import('./src/modules/circuitShare.js')).loadCircuit(id),saved.id),true);
    assert.deepEqual(await design(),snapshotCircuit(oldDesign));
    const copy=await page.evaluate(async()=>{
      const id=await(await import('./src/modules/circuitShare.js')).saveCircuit();
      return(await window.bitwiserCircuitStore.load(id)).value;
    });
    assert.equal(copy.version,3);assert.deepEqual(copy.circuit,snapshotCircuit(oldDesign));
    assert.deepEqual((await page.evaluate(async id=>(await window.bitwiserCircuitStore.load(id)).value,saved.id)).circuit,snapshotCircuit(oldDesign));
    await page.screenshot({path:`${out}/${surface}-${lang}-legacy-7x7.png`});
  }
  report.push({surface,lang,targets:22,crossroad:[{cost:152,stars:3},{cost:178,stars:2,highest:3,nextGoal:13}],mapStars:3,recordReevaluation:true,legacySaveRoundTrip:surface==='electron'});
  console.log(`Chapter stars passed: ${surface}/${lang}, 22 targets, results/map, prior cost re-evaluation${surface==='electron'?', 7x7 native save round trip':''}.`);
}

try {
  if(!process.argv.includes('--electron')) {
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    for(const lang of ['ko','en']) {
      const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
      await initialize(context,lang);
      await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
      const page=await context.newPage();await page.goto(base);await verify(page,'web',lang);await context.close();
    }
  }else {
    for(const lang of ['ko','en']) {
      const profile=await fs.mkdtemp(path.join(root,'test-results','chapter-stars-electron-'));
      const env={...process.env,BITWISER_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
      app=await electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});
      await initialize(app.context(),lang);
      const page=await app.firstWindow();await page.reload();await verify(page,'electron',lang);await app.close();app=null;
    }
  }
  assert.deepEqual(errors,[]);
}finally {
  await app?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(`${out}/${process.argv.includes('--electron')?'electron':'web'}.json`,JSON.stringify({report,errors},null,2)+'\n');
}
