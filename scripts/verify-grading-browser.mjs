import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=path.resolve('.');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><link rel="stylesheet" href="/style.css">
<style>body{display:block;padding:30px;background:#090f1d;color:white}main{max-width:370px;margin:auto}button{margin:8px}#gradingInlineStatus[hidden]{display:none}</style>
<main><div id="editor"><button id="edit">Toggle input</button></div><button id="gradeButton">Verify</button>
<div id="gradingInlineStatus" class="grading-inline-status" hidden role="status"><div class="grading-inline-status__row"><strong id="gradingStatusTitle"></strong><span id="gradingStatusPercent">0%</span></div>
<div class="grading-inline-status__bar"><div id="gradingStatusFill"></div></div><p id="gradingStatusText" class="grading-inline-status__text"></p><p id="gradingStatusCase" class="grading-inline-status__case"></p><button id="gradingInlineBackBtn">Back to Edit</button></div></main>
<script type="module">
import {createGradingController} from '/src/modules/grading.js';
import {makeCircuit,newBlock,newWire} from '/src/canvas/model.js';
import {gradeCircuitSync} from '/src/modules/circuitGrading.js';
import {getExecutionState,previewCircuit,tickCircuit} from '/src/canvas/evaluation.js';
import {getTraceHighlight} from '/src/canvas/tracePlayback.js';
const mode=new URL(location.href).searchParams.get('mode'), depth=mode==='long'?26:mode==='incomplete'?31:3;
const c=makeCircuit();
function block(id,type){c.blocks[id]=newBlock({id,type,name:id,pos:{r:0,c:0}})}
function wire(a,b){const id='w'+Object.keys(c.wires).length;c.wires[id]=newWire({id,startBlockId:a,endBlockId:b,inputRole:c.blocks[b].type==='D'?'D':undefined,path:[]})}
block('x','INPUT');block('o','OUTPUT');
for(let i=0;i<depth;i++){block('d'+i,'D');wire(i?'d'+(i-1):'x','d'+i)}
// Use a two-input AND tree: the full circuit still fails only after all D
// stages become 1, and remains valid under the editor's gate input limit.
if(mode.startsWith('fail')){let previous='d0';for(let i=1;i<depth;i++){const id='and'+i;block(id,'AND');wire(previous,id);wire('d'+i,id);previous=id}wire(previous,'o')}
const answers={mode:'sequential',reference:{inputs:['x'],outputs:['o'],stateCount:1,initialState:0,observeAt:mode==='failAfter'?'after_tick':'before_tick',evaluate:()=>({outputs:0,nextState:0})}};
window.c=c;window.getExecutionState=getExecutionState;window.getTraceHighlight=getTraceHighlight;
if(mode.startsWith('fail')) {
  window.result=gradeCircuitSync(c,answers);
  c.blocks.x.value=true;tickCircuit(c);previewCircuit(c);
  window.before=JSON.stringify({c,state:[...getExecutionState(c).memory],tick:getExecutionState(c).tick});
}
window.passed=0;window.edits=0;
document.getElementById('edit').onclick=()=>{window.edits++;c.blocks.x.value=!c.blocks.x.value};
const tr={gradingVerifying:'Verifying circuit…',gradingMismatch:'Output mismatch',gradingIncomplete:'Verification incomplete',gradingCounterexample:'Counterexample',gradingObserve:'observe outputs (before tick)',gradingExpected:'Expected',gradingActual:'Actual',returnToEditBtn:'Back to Edit'};
window.grader=createGradingController({getPlayCircuit:()=>c,getLevelAnswer:()=>answers,
getLevelBlockSet:()=>[{type:'INPUT',name:'x'},{type:'OUTPUT',name:'o'}],t:key=>tr[key]||key,onPassed:()=>window.passed++,
onScoringChange:value=>document.getElementById('editor').inert=value,
elements:{gradeButton:document.getElementById('gradeButton'),gradingInlineStatus:document.getElementById('gradingInlineStatus')}});
document.getElementById('gradeButton').onclick=()=>window.work=grader.gradeLevel(1);
window.ready=true;
</script></html>`;
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/harness'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);return;}
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'}).end(body);
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:420,height:850}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${server.address().port}/harness`;
try {
  await fs.mkdir('test-results',{recursive:true});
  for(const mode of ['fail','failAfter']) {
    await page.goto(base+'?mode='+mode);await page.waitForFunction(()=>window.ready);
    await page.locator('#gradeButton').click();await page.locator('#gradingResultOverlay[data-state=failed]').waitFor();
    const expected=await page.evaluate(()=>result.trace);
    assert.deepEqual(await page.locator('.trace-event').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventType)),expected.map(e=>e.type));
    assert.match(await page.locator('.trace-event[data-failed=true]').innerText(),/1\s*✕[\s\S]*EXPECTED 0/);
    assert.equal(await page.locator('#gradingInlineStatus').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.isGradingResultOpen),true);
    assert.equal(await page.locator('.counterexample-trace').evaluate(el=>el.scrollWidth>el.clientWidth),true);
    const panel=await page.locator('.grading-result-panel').boundingBox();assert.ok(panel.x>=0 && panel.x+panel.width<=420);
    await page.keyboard.press('Tab');assert.equal(await page.locator('#gradingResultEditBtn').evaluate(el=>el===document.activeElement),true);
    await page.screenshot({path:'test-results/grading-'+mode+'-mobile.png'});
    await page.locator('#gradingReplayBtn').click();
    for(let i=0;i<expected.length;i++) {
      await page.waitForFunction(i=>document.querySelector('.trace-event[aria-current=step]')?.dataset.eventIndex===String(i),i);
      if(expected[i].type==='expect') assert.deepEqual(await page.evaluate(()=>getTraceHighlight(c).blocks.map(b=>b.actual)),expected[i].outputs.map(s=>s.actual));
    }
    await page.waitForFunction(()=>!document.getElementById('gradingReplayBtn').disabled);
    assert.equal(await page.evaluate(()=>getTraceHighlight(c).blocks[0].passed),false);
    await page.locator('#gradingReplayBtn').click();
    await page.waitForFunction(()=>document.querySelector('.trace-event[aria-current=step]')?.dataset.eventIndex==='0');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.isGradingResultOpen),false);
    assert.equal(await page.evaluate(()=>JSON.stringify({c,state:[...getExecutionState(c).memory],tick:getExecutionState(c).tick})===before),true);
    assert.equal(await page.locator('#gradeButton').isVisible(),true);
    await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>getTraceHighlight(c)),undefined);
  }
  await page.goto(base+'?mode=long');await page.waitForFunction(()=>window.ready);
  await page.locator('#gradeButton').click();await page.locator('[data-state=running]').waitFor();
  assert.equal(await page.locator('#editor').evaluate(el=>el.inert),true);
  await page.locator('#edit').click({force:true});assert.equal(await page.evaluate(()=>edits),0);
  await page.locator('#gradingInlineBackBtn').click();await page.evaluate(()=>work);
  assert.equal(await page.evaluate(()=>grader.isScoring()),false);
  assert.equal(await page.locator('#gradingInlineStatus').isVisible(),false);
  assert.equal(await page.evaluate(()=>passed),0);
  await page.locator('#edit').click();assert.equal(await page.evaluate(()=>edits),1);
  await page.goto(base+'?mode=incomplete');await page.waitForFunction(()=>window.ready);
  await page.locator('#gradeButton').click();await page.locator('#gradingResultOverlay[data-state=incomplete]').waitFor();
  assert.equal(await page.evaluate(()=>passed),0);assert.equal(await page.evaluate(()=>grader.isScoring()),false);
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>document.dispatchEvent(new Event('bitwiser:leavePlay')));
  assert.equal(await page.locator('#gradingResultOverlay').isVisible(),false);
  console.log('Grading browser passed: both event orders match grader/replay, mobile scrolling, focus, Escape restoration, replay cancellation, edit lock, incomplete result, no false clear.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
