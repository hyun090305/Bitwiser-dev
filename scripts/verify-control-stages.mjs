import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron as electron } from 'playwright';

// Real web/Electron entry points, isolated profiles and no account writes.
const root=path.resolve('.'), report=[], errors=[];
const fixtures=Object.fromEntries(await Promise.all([32,33,34].map(async id=>[id,JSON.parse(await fs.readFile(`tests/fixtures/memory20/${id}.json`,'utf8')).circuit])));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname), file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
});
await fs.mkdir('test-results/control-stages',{recursive:true});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,app;

async function verify(page,surface,lang) {
  page.on('pageerror',error=>errors.push(`${surface}/${lang}: ${error.message}`));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.locator('#loadingStartBtn:enabled').click();
  await page.locator('#loadingScreen').waitFor({state:'hidden'});
  await page.evaluate(async()=>{(await import('./src/modules/levels.js')).configureLevelModule({progressProvider:()=>[30]});});
  for(const id of [32,33,34]) {
    await page.evaluate(async id=>{
      await(await import('./src/modules/levels.js')).startLevel(id);
      const nav=await import('./src/modules/navigation.js');nav.hideStageMapScreen();nav.showGameScreen();
    },id);
    const title=({32:['양방향 카운터','Up/Down Counter'],33:['점등 시간 조절','Light Timing'],34:['예약 타이머','Delay Timer']})[id][lang==='en'?1:0];
    assert.ok((await page.locator('#introTitle').innerText()).includes(title));
    const intro=await page.locator('#levelIntroModal').innerText();
    assert.doesNotMatch(intro,/RESET|DUTY|PWM|KICK|TIMEOUT|BUSY/);
    if(id===33)assert.deepEqual(await page.locator('.level-intro-case__side--output .level-intro-case__bit-value').allTextContents(),['0 0 0 0','1 0 0 0','1 1 0 0','1 1 1 0']);
    await page.locator('#startLevelBtn:enabled').waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({path:`test-results/control-stages/${surface}-${lang}-${id}-intro.png`});
    await page.locator('#startLevelBtn').click();
    await page.locator('#levelIntroModal').waitFor({state:'hidden'});
    assert.equal(await page.locator('#gameTitle').innerText(),title);
    assert.equal(await page.locator('#gameScreen .memory-playback-bar').isVisible(),true,'sequential bar exists even without Buttons');
    assert.equal(await page.evaluate(async()=>Object.keys((await import('./src/modules/grid.js')).getPlayCircuit().blocks).length),0);
    const restore=()=>page.evaluate(async c=>{const g=await import('./src/modules/grid.js');g.getPlayController().restoreCircuit(c);g.adjustGridZoom();},fixtures[id]);
    await restore();
    await page.waitForFunction(async()=>(await import('./src/modules/grid.js')).getPlayController().tickRunner.isRunning());
    if(id===33)await page.waitForFunction(async()=>{const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js');return e.getExecutionState(g.getPlayCircuit()).tick>=2;});
    await page.locator('#gameScreen [data-memory-action=play]').click();
    await restore(); // A user pause survives restoration; restart from tick zero.
    const sample=()=>page.evaluate(async()=>{
      const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js'),c=g.getPlayCircuit();
      return {tick:e.getExecutionState(c).tick,running:g.getPlayController().tickRunner.isRunning(),inputs:Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='INPUT').map(b=>[b.name,Number(b.value)])),outputs:Object.values(c.blocks).filter(b=>b.type==='OUTPUT').map(b=>Number(b.value))};
    });
    assert.equal((await sample()).tick,0);assert.equal((await sample()).running,false);
    async function input(mask) {
      const before=await sample(),names=Object.keys(before.inputs);
      for(const [i,name] of names.entries())if(before.inputs[name]!==((mask>>>i)&1)) {
        const p=await page.evaluate(async name=>{
          const g=await import('./src/modules/grid.js'),c=g.getPlayCircuit(),b=Object.values(c.blocks).find(b=>b.type==='INPUT'&&b.name===name);
          const canvas=document.getElementById('overlayCanvas'),box=canvas.getBoundingClientRect(),scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth);
          return {x:box.x+Number(canvas.dataset.panelWidth)+(2+b.pos.c*52+25)*scale,y:box.y+(2+b.pos.r*52+25)*scale};
        },name);
        await page.mouse.click(p.x,p.y);
      }
      const after=await sample();assert.equal(after.tick,before.tick);
      assert.deepEqual(Object.values(after.inputs),names.map((_,i)=>(mask>>>i)&1));
      if(id!==33)assert.deepEqual(after.outputs,before.outputs,'SET cannot change stored output');
      return after;
    }
    async function tick() {
      const before=await sample();
      await page.evaluate(async()=>{(await import('./src/modules/grid.js')).getPlayController().tickRunner.step();});
      const after=await sample();assert.equal(after.tick,before.tick+1);
      for(const name of id===32?['INC','DEC']:id===34?['START']:[])assert.equal(after.inputs[name],0);
      return after.outputs.reduce((n,b,i)=>n|(b<<i),0);
    }
    const outputs=[];
    if(id===32) {
      for(const mask of [1,1,1,1,2,3,0,2,2,2]){await input(mask);outputs.push(await tick());}
      assert.deepEqual(outputs,[1,2,3,0,3,3,3,2,1,0]);
    }else if(id===33) {
      assert.deepEqual((await input(1)).outputs,[1],'tick 0 is the first slot');
      assert.equal(await tick(),0,'first tick completes in the second slot');
      await input(0);assert.equal(await tick(),0);assert.equal(await tick(),0);
      assert.deepEqual((await input(3)).outputs,[0],'zero still advanced to the fourth slot');
      for(let i=0;i<8;i++)outputs.push(await tick());
      assert.deepEqual(outputs,[1,1,1,0,1,1,1,0]);
    }else {
      for(const mask of [0,0,6,3,3,3,5,7,0,0,0,4,4,0]){await input(mask);outputs.push(await tick());}
      assert.deepEqual(outputs,[0,0,0,0,1,0,0,0,0,0,1,1,1,0]);
      await input(4);assert.equal(await tick(),1);
      for(let mask=0;mask<8;mask++)assert.deepEqual((await input(mask)).outputs,[1],'DONE survives every SET after START release');
    }
    await page.screenshot({path:`test-results/control-stages/${surface}-${lang}-${id}-board.png`});
    await page.locator('#gradeButton').click();await page.locator('#clearedModal').waitFor({state:'visible'});
    assert.match(await page.locator('#clearedModal').innerText(),lang==='ko'?/통과/:/verified|passed|clear/i);
    await page.locator('#clearedModal').getByRole('button',{name:lang==='ko'?'다시 설계하기':'Back to design',exact:true}).click();
    report.push({surface,lang,id,title,outputs,graded:true});
  }
  // Physically legal gate mutation: never arms the timer, so N=0 fails on completion.
  const expected=await page.evaluate(async c=>{
    const g=await import('./src/modules/grid.js');c.blocks.g19.type='AND';g.getPlayController().restoreCircuit(c);
    return (await import('./src/modules/circuitGrading.js')).gradeCircuitSync(c,(await import('./src/modules/levels.js')).getLevelAnswer(34));
  },fixtures[34]);
  assert.equal(expected.status,'fail');assert.equal(expected.observation,'after_tick');
  await page.locator('#gradeButton').click();await page.locator('#gradingResultOverlay[data-state=failed]').waitFor();
  assert.equal(await page.locator('.trace-event[data-failed=true]').getAttribute('data-observation'),'after_tick');
  // Capture each active card in-page so a slow Electron transport cannot skip a frame.
  await page.evaluate(async()=>{
    const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js'),c=g.getPlayCircuit();
    window.controlTraceFrames=[];
    window.controlTraceObserver=new MutationObserver(()=>{
      const node=document.querySelector('.trace-event[aria-current=step]');if(!node)return;
      const index=Number(node.dataset.eventIndex);
      if(window.controlTraceFrames.at(-1)?.index===index)return;
      window.controlTraceFrames.push({index,tick:e.getExecutionState(c).tick,
        inputs:Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='INPUT').map(b=>[b.name,Number(b.value)])),
        outputs:Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='OUTPUT').map(b=>[b.name,Number(b.value)]))});
    });
    window.controlTraceObserver.observe(document.getElementById('gradingResultOverlay'),{subtree:true,attributes:true,attributeFilter:['aria-current']});
  });
  await page.locator('#gradingReplayBtn').click();
  await page.waitForFunction(()=>!document.getElementById('gradingReplayBtn').disabled,null,{polling:100});
  const frames=await page.evaluate(()=>{window.controlTraceObserver.disconnect();return window.controlTraceFrames;});
  assert.deepEqual(frames.map(f=>f.index),expected.trace.map((_,i)=>i));
  let ticks=0;
  for(const [i,event] of expected.trace.entries()) {
    if(event.type==='tick') {ticks++;for(const input of event.releaseInputs)assert.equal(frames[i].inputs[input.signal],0);}
    assert.equal(frames[i].tick,ticks);
    if(event.type==='expect')assert.deepEqual(frames[i].outputs,Object.fromEntries(event.outputs.map(o=>[o.signal,o.actual])));
  }
  await page.locator('#gradingResultEditBtn').click();
  console.log(`Control stages: ${surface}/${lang}, real inputs, timing, playback, grading and counterexample passed.`);
}

try {
  if(!process.argv.includes('--electron')) {
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    for(const lang of ['ko','en']) {
      const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
      await context.addInitScript(lang=>{localStorage.setItem('lang',lang);localStorage.setItem('bgmEnabled','false');localStorage.setItem('autoSaveCircuit','false');},lang);
      await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
      const page=await context.newPage();await page.goto(base);await verify(page,'web',lang);
      await page.setViewportSize({width:430,height:900});
      await page.evaluate(async()=>{await(await import('./src/modules/levels.js')).startLevel(33);});
      assert.deepEqual(await page.locator('.level-intro-case__side--output .level-intro-case__bit-value').allTextContents(),['0 0 0 0','1 0 0 0','1 1 0 0','1 1 1 0']);
      await page.locator('#startLevelBtn:enabled').waitFor();await page.waitForTimeout(600);
      await page.screenshot({path:`test-results/control-stages/web-${lang}-33-mobile-intro.png`});
      await context.close();
    }
  }else {
    const profile=await fs.mkdtemp(path.join(root,'test-results','control-stages-electron-'));
    const env={...process.env,BITWISER_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});
    const page=await app.firstWindow();
    for(const lang of ['ko','en']) {
      await page.evaluate(lang=>{localStorage.setItem('lang',lang);localStorage.setItem('bgmEnabled','false');localStorage.setItem('autoSaveCircuit','false');},lang);
      await page.reload();await verify(page,'electron',lang);
    }
  }
  assert.deepEqual(errors,[]);
}finally {
  await app?.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(`test-results/control-stages/${process.argv.includes('--electron')?'electron':'web'}.json`,JSON.stringify({report,errors},null,2)+'\n');
}
