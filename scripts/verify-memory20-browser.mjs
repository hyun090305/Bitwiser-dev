import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {MEMORY20_IDS} from '../src/modules/memory20References.js';
const root=path.resolve('.'),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.gif':'image/gif'};
const server=createServer(async(req,res)=>{try {
  const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],results=[];
await context.addInitScript(()=>{localStorage.setItem('lang','ko');localStorage.setItem('bgmEnabled','false');localStorage.setItem('autoSaveCircuit','false');});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.dismiss());
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
  await page.locator('#loadingStartBtn:enabled').click();
  await page.evaluate(async()=>{const levels=await import('./src/modules/levels.js');levels.configureLevelModule({progressProvider:()=>Array.from({length:47},(_,i)=>i)});});
  for(const [slot,id] of Object.entries(MEMORY20_IDS)) {
    await page.evaluate(async id=>{const l=await import('./src/modules/levels.js');await l.startLevel(id);const n=await import('./src/modules/navigation.js');n.hideStageMapScreen();n.showGameScreen();window.scrollTo(0,0);},id);
    await page.locator('#startLevelBtn').click();
    assert.equal(await page.evaluate(async()=>Object.keys((await import('./src/modules/grid.js')).getPlayCircuit().blocks).length),0,`${slot}: start with freely placeable IO`);
    if(id===25) {
      const coordinates=await page.evaluate(()=>{
        const canvas=document.getElementById('overlayCanvas'),box=canvas.getBoundingClientRect();
        const scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth),panel=Number(canvas.dataset.panelWidth);
        const cell=(r,c)=>({x:box.x+panel+(2+c*52+25)*scale,y:box.y+(2+r*52+25)*scale});
        return {data:{x:box.x+48,y:box.y+58},output:{x:box.x+48,y:box.y+158},a:cell(1,1),b:cell(1,3),c:cell(3,1),d:cell(3,3)};
      });
      const drag=async(from,to)=>{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();};
      await drag(coordinates.data,coordinates.a);await drag(coordinates.a,coordinates.b);
      await drag(coordinates.output,coordinates.c);await drag(coordinates.c,coordinates.d);
      const placed=await page.evaluate(async()=>Object.values((await import('./src/modules/grid.js')).getPlayCircuit().blocks));
      assert.deepEqual(placed.find(b=>b.name==='DATA').pos,{r:1,c:3});
      assert.deepEqual(placed.find(b=>b.name==='VALUE').pos,{r:3,c:3});
      assert.ok(placed.every(b=>!b.fixed));
      await page.screenshot({path:'test-results/memory20-free-io.png'});
    }
    const c=JSON.parse(await fs.readFile(`tests/fixtures/memory20/${id}.json`,'utf8')).circuit;
    await page.evaluate(async c=>{const g=await import('./src/modules/grid.js');g.getPlayController().restoreCircuit(c);g.adjustGridZoom();},c);
    const state=await page.evaluate(async()=>{
      const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js'),c=g.getPlayCircuit();
      return {tick:e.getExecutionState(c).tick,memories:[...e.getExecutionState(c).memory.values()],blocks:Object.keys(c.blocks).length};
    });
    assert.equal(state.tick,0);assert.ok(state.memories.every(v=>!v));
    const viewport=await page.evaluate(()=>{
      const canvas=document.getElementById('overlayCanvas').getBoundingClientRect();
      const frame=document.querySelector('#canvasContainer').closest('.console-frame').getBoundingClientRect();
      return {canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},frame:{x:frame.x,y:frame.y,width:frame.width,height:frame.height}};
    });
    assert.ok(viewport.canvas.width<=viewport.frame.width,`${slot}: canvas must fit console width`);
    assert.ok(viewport.canvas.height<=viewport.frame.height,`${slot}: canvas must fit console height`);
    if([25,29,31,43,46].includes(id)) {
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.waitForTimeout(300);
      await page.screenshot({path:`test-results/memory20-board-${id}.png`});
    }
    await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
    assert.match(await page.locator('#clearedModal').innerText(),/통과/);
    results.push({slot,id,blocks:state.blocks,passed:true});console.log(`UI passed: ${slot} / ${id}`);
    if(id===46)await page.screenshot({path:'test-results/memory20-divider-pass.png'});
    await page.locator('#clearedModal').getByRole('button',{name:'다시 설계하기',exact:true}).click();
  }
  // A valid, physically identical gate change produces a wrong FIRST result.
  await page.evaluate(async()=>{const g=await import('./src/modules/grid.js'),c=structuredClone(g.getPlayCircuit());c.blocks.g14.type='OR';g.getPlayController().restoreCircuit(c);});
  await page.locator('#gradeButton').click();await page.locator('#gradingResultOverlay[data-state=failed]').waitFor();
  assert.match(await page.locator('#gradingResultTitle').innerText(),/첫 완료/);
  assert.ok(await page.locator('.trace-event[data-failed=true]').count());
  await page.screenshot({path:'test-results/memory20-divider-failure.png'});
  await page.locator('#gradingResultEditBtn').click();
  await page.setViewportSize({width:430,height:900});
  await page.evaluate(async()=>{const l=await import('./src/modules/levels.js');await l.startLevel(46);});
  await page.locator('#levelIntroModal').waitFor({state:'visible'});
  await page.waitForTimeout(600);
  await page.screenshot({path:'test-results/memory20-divider-mobile-description.png'});
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/memory20-browser.json',JSON.stringify({results,errors},null,2)+'\n');
  console.log('All 20 editor circuits graded through the full-game UI; divider failure trace and mobile description verified.');
}catch(error){await page.screenshot({path:'test-results/memory20-browser-failure.png'});throw error;}
finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
