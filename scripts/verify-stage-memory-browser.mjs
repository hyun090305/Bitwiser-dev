import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {observeMap,enterStage,goToMap,openSettings} from './demo-browser-helpers.mjs';
const base=process.env.DEMO_URL||'http://127.0.0.1:8080';
const progress=JSON.parse(await fs.readFile('test-results/demo-progress.json','utf8'));
progress.lastStageId=25;
const fixture=JSON.parse(await fs.readFile('tests/fixtures/demo/25-3.json','utf8')).circuit;
const memoryId=Object.values(fixture.blocks).find(b=>b.type==='D').id;
const dataWireId=Object.values(fixture.wires).find(w=>w.inputRole==='D').id;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:850},acceptDownloads:true});
await observeMap(context);
await context.addInitScript(progress=>{if(!localStorage.getItem('bitwiser:web-demo:v1'))localStorage.setItem('bitwiser:web-demo:v1',JSON.stringify(progress));localStorage.setItem('lang','en');},progress);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(async()=>{const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js');const c=g.getPlayCircuit(),s=e.getExecutionState(c);return {tick:s.tick,memory:Object.fromEntries(s.memory),running:g.getPlayController().tickRunner.isRunning()};});
const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bitwiser:web-demo:v1')));
async function clickBlock(id) {
  const p=await page.evaluate(async id=>{
    const c=(await import('./src/modules/grid.js')).getPlayCircuit(),canvas=document.getElementById('overlayCanvas'),box=canvas.getBoundingClientRect(),b=c.blocks[id];
    const scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth),panel=Number(canvas.dataset.panelWidth);
    return {x:box.x+panel+(2+b.pos.c*52+25)*scale,y:box.y+(2+b.pos.r*52+25)*scale};
  },id);await page.mouse.click(p.x,p.y);
}
const step=()=>page.evaluate(async()=>(await import('./src/modules/grid.js')).getPlayController().tickRunner.step());
try {
  await page.goto(base);await page.locator('#loadingStartBtn').click();await page.locator('#startLevelBtn').click();
  assert.equal(await page.locator('.memory-controls').count(),0);
  const single=structuredClone(fixture);delete single.wires[Object.keys(single.wires).find(id=>single.wires[id].inputRole==='EN')];
  await page.evaluate(async c=>(await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c),single);
  assert.equal(await page.locator('.memory-playback-bar:visible').count(),1);
  await page.waitForFunction(async()=>(await import('./src/modules/grid.js')).getPlayController().tickRunner.isRunning());
  await page.locator('[data-memory-action=play]').click(); // Pause to inspect exact manual-tick values.
  await clickBlock('DATA');await step();assert.equal((await read()).memory[memoryId],true);
  await clickBlock('DATA');assert.equal((await read()).memory[memoryId],true);
  await step();assert.equal((await read()).memory[memoryId],false);
  await page.evaluate(async c=>(await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c),fixture);
  await clickBlock('DATA');await clickBlock('LOAD');await step();
  await clickBlock('DATA');await step();assert.equal((await read()).memory[memoryId],true);
  await page.screenshot({path:'test-results/memory-stage-tutorial.png'});
  await page.locator('#hintBtn').click();await page.locator('#hintButtons button').first().click();
  assert.match(await page.locator('#hintMessage').innerText(),/LOAD to EN/);assert.doesNotMatch(await page.locator('#hintMessage').innerText(),/undefined/);
  await page.locator('#closeHintMessageBtn').click();await page.locator('#closeHintBtn').click();
  await clickBlock(memoryId);await page.waitForTimeout(600);
  const roles=Object.values((await save()).stages[25].draft.circuit.wires).map(w=>[w.id,w.inputRole]);
  assert.equal(roles.find(([id])=>id===dataWireId)[1],'EN');
  await page.locator('[data-memory-action=play]').click();await page.waitForFunction(async()=>{const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js');return e.getExecutionState(g.getPlayCircuit()).tick>2;});
  await goToMap(page);await enterStage(page,25);assert.equal((await read()).tick,0);assert.equal((await read()).memory[memoryId],false);
  assert.deepEqual(Object.values((await save()).stages[25].draft.circuit.wires).map(w=>[w.id,w.inputRole]),roles);
  await openSettings(page);
  const download=page.waitForEvent('download');await page.locator('#demoExportBackupBtn').click();await(await download).saveAs('test-results/memory-stage-backup.json');
  await page.locator('#demoBackupFile').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});
  await page.locator('#demoDialog[open]').waitFor();assert.match(await page.locator('#demoDialogBody').innerText(),/unchanged/);
  await page.locator('#demoDialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('#demoBackupFile').setInputFiles('test-results/memory-stage-backup.json');
  await page.locator('#demoDialog[open]').waitFor();assert.match(await page.locator('#demoDialogBody').innerText(),/validated/);
  const beforeRestore=await save();await page.locator('#demoDialog').getByRole('button',{name:'Restore this backup',exact:true}).click();
  await page.locator('#loadingStartBtn').waitFor();assert.deepEqual((await save()).stages,beforeRestore.stages);
  assert.deepEqual(errors,[]);console.log('Memory stage browser passed: tutorial, post-tick hold, translated hint, role autosave, replay reset, auto-stop, backup export/validation/restore.');
}catch(error){await page.screenshot({path:'test-results/memory-stage-failure.png'});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();}
