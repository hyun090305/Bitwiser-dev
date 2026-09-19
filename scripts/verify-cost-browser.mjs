import { observeMap, enterStage } from './demo-browser-helpers.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root=path.resolve('.');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
  try {
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name==='/')name='/index.html';
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:980},locale:'ko-KR'});
await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
await context.addInitScript(()=>{
  localStorage.setItem('lang','ko');localStorage.setItem('username','Cost Test');localStorage.setItem('autoSaveCircuit','false');
  window.paletteSamples={};window.paletteCostLabels=[];
  const fillText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
    if(this.canvas.id==='bgCanvas'||this.canvas.id==='labBgCanvas'){
      const m=this.getTransform();
      window.paletteSamples[`${this.canvas.id}:${text}`]={x:(m.a*x+m.c*y+m.e)/this.canvas.width,y:(m.b*x+m.d*y+m.f)/this.canvas.height};
      if(/^(비용|Cost)\s/.test(text))window.paletteCostLabels.push(text);
    }
    return fillText.call(this,text,x,y,...rest);
  };
});
let page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack || e.message));
const fixture=async(id,tier=3)=>JSON.parse(await fs.readFile(`tests/fixtures/demo/${id}-${id===0?'tutorial':tier}.json`,'utf8')).circuit;
const modulePath=()=>new URL(page.url()).pathname.startsWith('/dist-web-demo')?'./src':'/src';
async function restore(id,tier=3){await page.evaluate(async({c,path})=>{(await import(path+'/modules/grid.js')).getPlayController().restoreCircuit(c);},{c:await fixture(id,tier),path:modulePath()});}
async function hoverPalette(label,canvasId='bgCanvas'){
  const point=await page.evaluate(({label,canvasId})=>{
    const point=window.paletteSamples[`${canvasId}:${label}`],bounds=document.getElementById(canvasId).getBoundingClientRect();
    return {x:bounds.left+point.x*bounds.width,y:bounds.top+point.y*bounds.height};
  },{label,canvasId});
  await page.mouse.move(point.x,point.y);await page.locator('.palette-cost-tooltip:visible').waitFor();
}
try {
  await fs.mkdir('test-results/cost',{recursive:true});
  // Full application starts without Firebase/CDN, then uses the actual grader.
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('loadingStartBtn')?.disabled===false);
  await page.locator('#loadingStartBtn').click();
  await page.evaluate(async()=>{
    const l=await import('/src/modules/levels.js');l.configureLevelModule({progressProvider:()=>[0]});
    await l.startLevel(1);const nav=await import('/src/modules/navigation.js');nav.hideStageMapScreen();nav.showGameScreen();
  });
  await page.locator('#startLevelBtn').click();await restore(1,2);
  const initial=await page.locator('.cost-total').innerText();
  assert.ok(Number(initial)>10);assert.match(await page.locator('#circuitCostBoard').innerText(),/기준 준비 중/);
  assert.equal(await page.locator('.cost-breakdown').count(),0);
  assert.deepEqual(await page.evaluate(()=>window.paletteCostLabels),[]);
  await page.screenshot({path:'test-results/cost/full-editor.png'});
  await hoverPalette('NOT');
  assert.match(await page.locator('.palette-cost-tooltip:visible').innerText(),/비용 10/);
  await page.screenshot({path:'test-results/cost/full-palette-hover.png'});
  await page.mouse.down();assert.equal(await page.locator('.palette-cost-tooltip:visible').count(),0);await page.mouse.up();
  await page.mouse.move(10,10);await page.evaluate(()=>window.currentLang='en');await hoverPalette('NOT');
  assert.match(await page.locator('.palette-cost-tooltip:visible').innerText(),/Cost 10/);
  await page.evaluate(()=>window.currentLang='ko');await page.mouse.move(10,10);
  assert.equal(await page.locator('.palette-cost-tooltip:visible').count(),0);
  await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
  assert.equal(await page.locator('#clearedModal .cost-result-total').innerText(),initial);
  assert.equal(await page.locator('#clearedModal .earned').count(),1);
  assert.equal(await page.locator('#clearedModal .cost-stars svg').count(),3);
  assert.equal(await page.locator('.cost-breakdown').count(),0);
  assert.doesNotMatch(await page.locator('#clearedModal .cost-stars').innerText(),/[★☆]/);
  assert.match(await page.locator('#clearedModal').innerText(),/연결되지 않았습니다/);
  assert.equal(await page.locator('#clearedMapBtn').isEnabled(),true);
  assert.equal(await page.locator('#clearedMapBtn').innerText(),'맵으로 돌아가기');
  assert.equal(await page.getByRole('button',{name:/^(Next stage|다음 스테이지)$/i}).count(),0);
  assert.notEqual(await page.locator('#clearedMapBtn').evaluate(el=>getComputedStyle(el).backgroundColor),await page.getByRole('button',{name:'다시 설계하기',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor));
  await page.screenshot({path:'test-results/cost/full-result-offline.png'});
  await page.locator('#clearedModal .cost-ranking-toggle').click();assert.equal(await page.locator('#clearedModal .cost-ranking').isVisible(),false);
  await page.getByRole('button',{name:'다시 설계하기',exact:true}).click();await restore(1);
  await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
  assert.match(await page.locator('#clearedModal').innerText(),/개인 최고 갱신/);
  await page.getByRole('button',{name:'다시 설계하기',exact:true}).click();await restore(1,2);
  await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
  assert.match(await page.locator('#clearedModal').innerText(),/기존 최고 기록 유지/);
  await page.locator('#clearedMapBtn').click();
  await page.locator('#stageMapCanvas').waitFor({state:'visible'});
  await page.evaluate(async()=>{
    window.currentLang='en';
    const levels=await import('/src/modules/levels.js');await levels.startLevel(1);
    const nav=await import('/src/modules/navigation.js');nav.hideStageMapScreen();nav.showGameScreen();
  });
  await page.locator('#startLevelBtn').click();await restore(1);
  await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
  assert.equal(await page.locator('#clearedMapBtn').innerText(),'Back to map');
  assert.equal(await page.getByRole('button',{name:'Back to design',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:/^Next stage$/i}).count(),0);
  await page.getByRole('button',{name:'Back to design',exact:true}).click();
  await page.evaluate(()=>{window.currentLang='ko';});
  await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
  // Common ranking UI: async states, own row beyond page one, ties, no unsafe HTML.
  await page.evaluate(async()=>{
    const {renderCostRanking}=await import('/src/modules/costUI.js');
    const {rankCostEntries}=await import('/src/modules/costLeaderboard.js');
    const host=document.querySelector('#clearedModal .cost-ranking');
    const data=rankCostEntries(Array.from({length:14},(_,i)=>({nickname:i===13?'Cost Test':`Player ${i+1}`,totalCost:10+i})), 'Cost Test');
    renderCostRanking(host,{load:async()=>data});
  });
  await page.waitForFunction(()=>document.querySelector('.cost-ranking [data-state=ready]'));
  assert.equal(await page.locator('.cost-ranking-me').count(),1);assert.match(await page.locator('.cost-ranking-me').innerText(),/14/);
  assert.equal(await page.locator('.cost-ranking-table tbody tr').count(),9);
  await page.locator('.cost-ranking-pages').getByRole('button',{name:'다음',exact:true}).click();
  assert.equal(await page.locator('.cost-ranking-me').count(),1);
  await page.screenshot({path:'test-results/cost/full-result-ranking.png'});
  await page.setViewportSize({width:540,height:900});
  const boxes=await page.locator('.cost-result').evaluate(el=>{
    const own=el.querySelector('.cost-performance').getBoundingClientRect(),rank=el.querySelector('.cost-ranking').getBoundingClientRect();
    return {ownBottom:own.bottom,rankTop:rank.top,scroll:el.scrollWidth,width:el.clientWidth};
  });
  assert.ok(boxes.rankTop>=boxes.ownBottom);assert.ok(boxes.scroll<=boxes.width+1);
  await page.screenshot({path:'test-results/cost/full-result-narrow.png'});
  await page.evaluate(async()=>{
    const {renderCostRanking}=await import('/src/modules/costUI.js');const host=document.querySelector('.cost-ranking');
    renderCostRanking(host,{load:async()=>({entries:[],own:null})});
  });
  await page.waitForFunction(()=>document.querySelector('.cost-ranking [data-state=empty]'));
  assert.match(await page.locator('.cost-ranking').innerText(),/기록 없음/);assert.match(await page.locator('.cost-ranking').innerText(),/미등록/);
  await page.evaluate(async()=>{
    const {renderCostRanking}=await import('/src/modules/costUI.js');
    renderCostRanking(document.querySelector('.cost-ranking'),{load:async()=>{throw new Error('offline');},submit:async()=>{throw new Error('denied');}});
  });
  await page.waitForFunction(()=>document.querySelector('.cost-registration')?.dataset.state==='failed');
  assert.match(await page.locator('.cost-ranking').innerText(),/등록 실패/);assert.match(await page.locator('.cost-ranking').innerText(),/연결 실패/);
  await page.getByRole('button',{name:'다시 설계하기',exact:true}).click();
  await page.evaluate(async()=>{
    await (await import('/src/modules/levels.js')).returnToLevels();
    (await import('/src/modules/labMode.js')).openLabModeFromShortcut();
  });
  assert.equal(await page.locator('#circuitCostBoard .cost-total').innerText(),'0');
  assert.equal(await page.locator('#circuitCostBoard .cost-target').count(),0);
  await hoverPalette('D','labBgCanvas');
  assert.match(await page.locator('.palette-cost-tooltip:visible').innerText(),/비용 20/);
  const tooltipBounds=await page.locator('.palette-cost-tooltip:visible').boundingBox();
  assert.ok(tooltipBounds.x>=0&&tooltipBounds.x+tooltipBounds.width<=540);
  await page.mouse.move(10,10);
  // Demo uses the same UI and never enables its restricted online services.
  await page.setViewportSize({width:1440,height:980});
  const demoContext=await browser.newContext({viewport:{width:1440,height:980},locale:'ko-KR'});
  await demoContext.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await observeMap(demoContext);
  await demoContext.addInitScript(()=>localStorage.setItem('lang','ko'));
  page=await demoContext.newPage();page.on('pageerror',e=>errors.push(e.stack || e.message));
  await page.goto(base+'/dist-web-demo/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('loadingStartBtn')?.disabled===false);
  await page.locator('#loadingStartBtn').click();await page.locator('#startLevelBtn').click();await restore(0);
  await page.locator('#gradeButton').click();await page.locator('#demoDialog[open]').waitFor();
  assert.equal(await page.locator('#demoDialog .cost-stars, #demoDialog .cost-ranking').count(),0);
  assert.match(await page.locator('#demoDialog').innerText(),/튜토리얼 완료/);
  assert.doesNotMatch(await page.locator('#demoDialog').innerText(),/최적화/);
  await page.screenshot({path:'test-results/cost/demo-tutorial.png'});
  await page.getByRole('button',{name:'맵으로 돌아가기',exact:true}).click();await enterStage(page,1);await restore(1);
  const amount=await page.locator('.cost-total').innerText();
  await page.evaluate(async()=>{
    const g=await import('./src/modules/grid.js');const c=g.getPlayCircuit();const io=Object.values(c.blocks).find(b=>b.type==='INPUT');io.value=!io.value;
  });
  assert.equal(await page.locator('.cost-total').innerText(),amount);
  await page.locator('#gradeButton').click();await page.locator('#demoDialog[open]').waitFor();
  assert.equal(await page.locator('#demoDialog .cost-result-total').innerText(),amount);
  assert.match(await page.locator('#demoDialog').innerText(),/정식판에서/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('bitwiser:web-demo:v1')));
  assert.equal(saved.stages[1].best.totalCost,Number(amount));assert.equal(saved.stages[1].best.stars,1);
  await page.screenshot({path:'test-results/cost/demo-result.png'});
  // Test-only targets: direct three-star award, retained history after returning
  // to the shipped null configuration, and no fabricated next-cost message.
  await page.getByRole('button',{name:'계속 최적화하기',exact:true}).click();
  await page.evaluate(async amount=>{
    (await import('./src/modules/levels.js')).getLoadedStageData().levelStarThresholds[1]={twoStarMaxCost:amount+2,threeStarMaxCost:amount};
  },Number(amount));
  await page.locator('#gradeButton').click();await page.locator('#demoDialog[open]').waitFor();
  assert.equal(await page.locator('#demoDialog .earned').count(),3);assert.match(await page.locator('#demoDialog').innerText(),/모든 별 달성/);
  await page.locator('#demoDialog .cost-stars').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await page.screenshot({path:'test-results/cost/demo-three-stars.png'});
  await page.getByRole('button',{name:'계속 최적화하기',exact:true}).click();
  await page.evaluate(async()=>{
    (await import('./src/modules/levels.js')).getLoadedStageData().levelStarThresholds[1]={twoStarMaxCost:null,threeStarMaxCost:null};
  });
  await page.locator('#gradeButton').click();await page.locator('#demoDialog[open]').waitFor();
  assert.equal(await page.locator('#demoDialog .cost-stars .earned').count(),1);
  assert.match(await page.locator('#demoDialog .cost-best-stars').innerText(),/최고 획득 별/);
  assert.equal(await page.locator('#demoDialog .cost-best-stars .earned').count(),3);
  assert.equal(await page.locator('.cost-breakdown').count(),0);
  assert.equal(await page.locator('#demoDialog .cost-goal').count(),0);
  await page.getByRole('button',{name:'결과 공유',exact:true}).click();
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.isGradingResultOpen),false);
  assert.equal(await page.locator('#gradeButton').isVisible(),true);
  await page.locator('#gradeButton').click();await page.locator('#demoDialog[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.isGradingResultOpen),false);
  assert.equal(await page.locator('#gameScreen .status-toolbar').evaluate(el=>getComputedStyle(el).visibility),'visible');
  assert.deepEqual(errors,[]);
  console.log('Cost browser checks passed: palette hover and drag dismissal, Korean/English costs, SVG rewards, removed breakdown, full offline play, verified result/board/save agreement, improvement and regression, tutorial, restricted demo, exact own rank, pagination, hide/show, empty/failure, narrow layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
