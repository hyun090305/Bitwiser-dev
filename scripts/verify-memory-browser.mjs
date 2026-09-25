import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=path.resolve('.');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)) { res.writeHead(403).end();return; }
    const body = await fs.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,acceptDownloads:true});
const page=await context.newPage();
const errors=[], passed=[]; page.on('pageerror',error=>errors.push(error.message));
await fs.mkdir('test-results',{recursive:true});
const read=()=>page.evaluate(()=>testRead());
async function point(r,c) {
  return page.locator('#overlay').evaluate((canvas,{r,c})=>{
    const box=canvas.getBoundingClientRect();return {x:box.x+220+2+c*52+25,y:box.y+2+r*52+25};
  },{r,c});
}
async function click(r,c) { const p=await point(r,c);await page.mouse.click(p.x,p.y); }
async function drag(from,to) {
  const a=await point(...from),b=await point(...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
}
const action=name=>page.locator(`[data-memory-action="${name}"]`);
const step=()=>page.evaluate(()=>testController.tickRunner.step());
const roles=s=>Object.fromEntries(Object.entries(s.design.wires).filter(([,w])=>w.endBlockId==='memory').map(([id,w])=>[id,w.inputRole]));
try {
  await page.goto(base+'/tests/memory-harness.html');await page.waitForFunction(()=>window.testReady && testController.tickRunner.isRunning());
  await action('play').click(); // Explicit pause for deterministic manual-tick checks.
  await click(2,0);assert.equal((await read()).memory.memory,false);
  await step();assert.equal((await read()).memory.memory,false);
  await click(0,4);await step();assert.equal((await read()).memory.memory,true);
  await click(2,4);assert.deepEqual(roles(await read()),{data:'EN',enable:'D'});assert.equal((await read()).memory.memory,true);
  await page.locator('#undo').click();assert.deepEqual(roles(await read()),{data:'D',enable:'EN'});assert.equal((await read()).memory.memory,true);
  await page.locator('#redo').click();assert.deepEqual(roles(await read()),{data:'EN',enable:'D'});
  const tap=await point(2,4);await page.touchscreen.tap(tap.x,tap.y);assert.deepEqual(roles(await read()),{data:'D',enable:'EN'});
  passed.push('D/EN click and touch swap; Undo/Redo retains current Q');

  await page.mouse.move(tap.x,tap.y);await page.mouse.down();await page.mouse.move(tap.x+8,tap.y);await page.mouse.up();
  assert.deepEqual(roles(await read()),{data:'D',enable:'EN'});
  await drag([2,4],[3,4]);
  assert.deepEqual((await read()).design.blocks.memory.pos,{r:3,c:4});
  assert.deepEqual(roles(await read()),{data:'D',enable:'EN'});assert.equal((await read()).memory.memory,true);
  await page.locator('#undo').click();assert.deepEqual((await read()).design.blocks.memory.pos,{r:2,c:4});
  passed.push('small motion and block drag never swap; routed move preserves connections and Q');

  await page.evaluate(()=>testReset());await click(2,4);
  await page.locator('#del').click();await click(1,4);
  assert.deepEqual(roles(await read()),{data:'D'});
  await page.locator('#undo').click();assert.deepEqual(roles(await read()),{data:'EN',enable:'D'});
  await page.locator('#redo').click();assert.deepEqual(roles(await read()),{data:'D'});
  await page.locator('#undo').click();await page.locator('#move').click();
  passed.push('deleting D-role wire rebases surviving EN; Undo restores pre-delete swapped mapping');

  await page.locator('#wire').click();
  const route=[[2,8],[3,8],[4,8],[4,7],[4,6],[4,5],[4,4],[3,4],[2,4]];
  const start=await point(...route[0]);await page.mouse.move(start.x,start.y);await page.mouse.down();
  for(const cell of route.slice(1)){const p=await point(...cell);await page.mouse.move(p.x,p.y,{steps:3});}
  await page.mouse.up();assert.equal(Object.keys((await read()).design.wires).length,3);
  passed.push('editor rejects third D input');await page.locator('#move').click();

  // Real selection expansion, clipboard cloning, ID reassignment and paste.
  await page.locator('#select').click();await drag([0,0],[2,8]);await page.locator('#copy').click();
  await page.locator('#paste').click();await click(6,0);
  const pasted=await read(); const copiedD=Object.values(pasted.design.blocks).find(b=>b.type==='D'&&b.id!=='memory');
  assert.ok(copiedD);const copiedInputs=Object.values(pasted.design.wires).filter(w=>w.endBlockId===copiedD.id);
  assert.equal(copiedInputs.length,2);assert.deepEqual(copiedInputs.map(w=>w.inputRole).sort(),['D','EN']);
  assert.equal(copiedInputs.find(w=>w.inputRole==='EN').path[0].c,0);
  assert.equal(pasted.memory[copiedD.id],false);
  passed.push('copy/paste preserves swapped roles through fresh IDs, copied Q starts at zero');

  for (const type of ['AND','OR']) {
    await page.evaluate(async type=>{
      testReset();
      const c=testRead().design;
      const {newBlock}=await import('/src/canvas/model.js');
      c.blocks.memory.type=type;c.blocks.memory.name=type;
      c.blocks.third=newBlock({id:'third',type:'INPUT',name:'IN3',pos:{r:4,c:4}});
      delete c.wires.data;delete c.wires.enable;
      testController.restoreCircuit(c);
    },type);
    await page.locator('#wire').click();
    await drag([2,0],[2,4]);assert.equal(Object.keys((await read()).design.wires).length,2);
    await drag([0,4],[2,4]);assert.equal(Object.keys((await read()).design.wires).length,3);
    const full=(await read()).design;
    await drag([4,4],[2,4]);assert.deepEqual((await read()).design,full);
    await page.locator('#del').click();await click(1,4);
    assert.equal(Object.keys((await read()).design.wires).length,2);
    await page.locator('#undo').click();assert.deepEqual((await read()).design,full);
    await page.locator('#redo').click();
    await page.locator('#wire').click();await drag([4,4],[2,4]);
    const repaired=await read();
    assert.equal(Object.keys(repaired.design.wires).length,3);
    assert.ok(Object.values(repaired.design.wires).some(w=>w.startBlockId==='third'&&w.endBlockId==='memory'));
    assert.deepEqual(repaired.diagnostics,[]);
    passed.push(`${type} accepts two inputs, rejects a third, and permits replacement after delete/Undo/Redo`);
    await page.locator('#move').click();
  }

  await page.evaluate(()=>{testReset();testCircuit.blocks.input.inputMode='button';testCircuit.blocks.input.value=false;});
  await click(2,0);assert.equal((await read()).values.input,true);
  await click(2,0);assert.equal((await read()).values.input,false);
  await click(2,0);await click(0,4);await step();
  assert.equal((await read()).memory.memory,true);assert.equal((await read()).values.input,false);
  assert.equal(await page.locator('.memory-controls').count(),0);
  assert.equal(await page.locator('.memory-playback-bar').count(),1);
  assert.equal(await page.locator('.memory-playback-bar').evaluate(el=>el.previousElementSibling?.id),'surface');
  const geometry=await page.evaluate(()=>{
    const canvas=document.getElementById('surface').getBoundingClientRect();
    const bar=document.querySelector('.memory-playback-bar').getBoundingClientRect();
    return {canvasBottom:canvas.bottom,barTop:bar.top};
  });
  assert.ok(geometry.barTop>=geometry.canvasBottom);
  await step();assert.equal((await read()).memory.memory,false);
  passed.push('button toggles immediately and turns off after a successful tick');

  const slider=page.getByLabel('재생 속도');
  const tickText=()=>page.locator('.memory-playback-tick').innerText();
  const lit=()=>page.locator('.memory-playback-lamp').evaluate(el=>el.classList.contains('is-lit'));
  await page.evaluate(()=>{
    testReset();
    testCircuit.blocks.input.value=true;
    testCircuit.blocks.enable.value=true;
    testController.tickRunner.step();
    testCircuit.blocks.enable.value=false;
    for(let i=1;i<999;i++) testController.tickRunner.step();
  });
  assert.equal(await tickText(),'TICK 999');
  assert.equal((await read()).memory.memory,true);
  await step();assert.equal(await tickText(),'TICK 000');
  assert.equal((await read()).tick,1000);assert.equal((await read()).memory.memory,true);
  await step();assert.equal(await tickText(),'TICK 001');assert.equal((await read()).tick,1001);
  await page.evaluate(()=>testController.tickRunner.reset());
  assert.equal(await tickText(),'TICK 000');assert.equal((await read()).memory.memory,false);
  await slider.fill('3');
  await action('play').click();
  await page.evaluate(()=>testController.tickRunner.step());assert.equal(await lit(),true);
  await page.waitForTimeout(180);assert.equal(await lit(),false);
  await slider.fill('10');assert.equal(await lit(),true);
  await slider.fill('2');assert.equal(await lit(),false);
  await step();assert.equal(await lit(),true);
  await slider.fill('10');await page.waitForTimeout(180);assert.equal(await lit(),true);
  await action('play').click();assert.equal(await lit(),false);
  const pausedTick=(await read()).tick;
  await page.waitForTimeout(200);assert.equal((await read()).tick,pausedTick);
  await action('play').click();await page.waitForFunction(n=>testRead().tick>n,pausedTick);
  await action('play').click();
  assert.equal(await tickText(),`TICK ${String((await read()).tick%1000).padStart(3,'0')}`);
  await page.evaluate(()=>testReset());assert.equal(await tickText(),'TICK 000');
  await step();assert.equal(await tickText(),'TICK 001');
  passed.push('tick 999→000→001 preserves internal count and EN=0 memory; reset, pause/resume, 3 tick/s pulse and immediate slow/fast transitions');
  await slider.fill('1');assert.equal(await page.evaluate(()=>testController.tickRunner.getInterval()),1000);
  await slider.fill('10');assert.equal(await page.evaluate(()=>testController.tickRunner.getInterval()),100);
  passed.push('playback slider spans one to ten ticks per second outside the canvas');

  await action('play').click();await page.waitForFunction(()=>testRead().tick>=3);
  await action('play').click();const stopped=(await read()).tick;await page.waitForTimeout(650);assert.equal((await read()).tick,stopped);
  await action('play').click();await click(2,4);await page.waitForFunction(()=>testRead().running);
  await page.evaluate(()=>{window.isScoring=true;document.dispatchEvent(new Event('bitwiser:scoring'));});
  const beforeLock=await read();await page.evaluate(()=>{window.isScoring=true;document.dispatchEvent(new Event('bitwiser:scoring'));});
  await click(2,4);await click(2,0);assert.deepEqual(await read(),beforeLock);
  await page.evaluate(()=>{window.isScoring=false;document.dispatchEvent(new Event('bitwiser:scoring'));});
  await action('play').click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await read()).running,false);const hiddenTick=(await read()).tick;await page.waitForTimeout(650);assert.equal((await read()).tick,hiddenTick);
  await page.evaluate(()=>{delete document.hidden;testController.destroy();});
  passed.push('auto pause, editing, grading input lock, background pause and controller cleanup');

  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/memory-browser.json',JSON.stringify({passed,errors},null,2));
  console.log(JSON.stringify({passed,errors},null,2));
} catch(error) {
  await page.screenshot({path:'test-results/memory-browser-failure.png'}).catch(()=>{});
  console.error(error,{passed,errors});process.exitCode=1;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
