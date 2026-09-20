import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { observeMap, enterStage, goToMap, openSettings } from './demo-browser-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.DEMO_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
await fs.mkdir('test-results', { recursive: true });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 850 }, acceptDownloads: true });
await observeMap(context);
await context.addInitScript(() => localStorage.setItem('bitwiserTheme', 'soft-glow'));
const external = [], errors = [], missing = [];
await context.route('**/*', route => {
  const url = route.request().url();
  if (!url.startsWith(base) && /^https?:/.test(url)) { external.push(url); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
const fixture = async (id, tier=3) => JSON.parse(await fs.readFile(`tests/fixtures/demo/${id}-${id===0?'tutorial':tier}.json`, 'utf8')).circuit;
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('bitwiser:web-demo:v1')));
async function loadFixture(id,tier=3) {
  await page.evaluate(async circuit => { const grid=await import('./src/modules/grid.js'); grid.getPlayController().restoreCircuit(circuit); }, await fixture(id,tier));
}
async function enter(id) {
  await enterStage(page,id);
}
async function grade(id,tier=3,returnToMap=false) {
  await loadFixture(id,tier);
  const readInputs=()=>page.evaluate(async()=>Object.values((await import('./src/modules/grid.js')).getPlayCircuit().blocks).filter(b=>b.type==='INPUT').map(b=>[b.id,b.value]));
  const originalInputs=await readInputs();
  await page.evaluate(() => {
    window.gradingLockObserved = false;
    const observe = () => {
      if (!window.isScoring) return;
      window.gradingLockObserved = document.getElementById('gameScreen').inert;
      document.removeEventListener('bitwiser:scoring', observe);
    };
    document.addEventListener('bitwiser:scoring', observe);
  });
  await page.locator('#gradeButton').click();
  if(id===1 && tier===2) {
    // Fast exhaustive grading may finish before click() returns. Observe the
    // actual scoring event instead of depending on the old animation delay.
    assert.equal(await page.evaluate(()=>window.gradingLockObserved),true);
  }
  await page.locator('#demoDialog[open]').waitFor();
  assert.match(await page.locator('#demoDialogTitle').innerText(), /restored/);
  assert.deepEqual(await readInputs(),originalInputs);
  const snapshot=(await save()).stages[id].draft.circuit;
  assert.deepEqual(Object.values(snapshot.blocks).filter(b=>b.type==='INPUT').map(b=>[b.id,b.value]),originalInputs);
  await page.screenshot({path:`test-results/demo-result-${id}.png`});
  assert.equal(await page.getByRole('button',{name:'Next stage',exact:true}).count(),0);
  assert.equal(await page.locator('.demo-result-map').innerText(),'Back to map');
  if (id===30) {
    await page.getByRole('button',{name:'Finish demo',exact:true}).click();
    await page.getByRole('heading',{name:'MEMORY LINK · A small recovery complete',exact:true}).waitFor();
    await page.screenshot({path:'test-results/demo-ending.png'});
    await page.locator('#demoDialog').getByRole('button',{name:'Stage map',exact:true}).click();
  } else if (returnToMap) {
    await page.getByRole('button',{name:'Back to map',exact:true}).click();
    await page.locator('#stageMapCanvas').waitFor({state:'visible'});
  } else await page.getByRole('button',{name:'Keep optimizing',exact:true}).click();
}
try {
  await page.goto(base);
  await page.waitForFunction(()=>document.getElementById('loadingStartBtn')?.disabled===false);
  assert.equal(await page.locator('.demo-header, #demoStageList, #storyHudBtn, #demoStoryBtn, #storyPlaybackOverlay, #storyModalOverlay').count(),0);
  assert.equal(await page.locator('#demoDialog').evaluate(el=>el.open),false);
  assert.ok(await page.locator('#bitwiserDots .on').count()>100);
  assert.equal(await page.locator('#themeOptions, #themeHeading, #themePreviewCanvas, #autoSaveCheckbox, #demoSaveBtn, #demoMenuSaveBtn, #saveCircuitBtn, #viewSavedBtn').count(),0);
  assert.equal(await page.locator('#demoBackupFile').count(),1);
  assert.equal(await page.evaluate(async() => { const themes=await import('./src/themes.js'); themes.setActiveTheme('soft-glow'); return themes.getActiveThemeId(); }), 'midnight-neon');
  assert.equal(await page.evaluate(()=>localStorage.getItem('bitwiserTheme')),'soft-glow');
  await page.screenshot({path:'test-results/demo-start.png'});
  assert.equal(await page.locator('#loadingStartBtn').innerText(),'START');
  await page.locator('#loadingStartBtn').click();
  await page.locator('#startLevelBtn').click();
  await page.screenshot({path:'test-results/demo-tutorial.png'});
  await grade(0,3,true);
  await enter(1);

  assert.ok((await save()).stages[0].best);
  assert.equal(await page.evaluate(async()=> (await import('./src/modules/levels.js')).getCurrentLevel()),1);
  await loadFixture(1,2);
  await page.waitForTimeout(550);
  const draftBefore=(await save()).stages[1].draft;
  await page.reload();
  assert.equal(await page.locator('#loadingStartBtn').innerText(),'START');
  await page.locator('#loadingStartBtn').click(); await page.locator('#startLevelBtn').click();
  assert.deepEqual(await page.evaluate(async()=>{const g=await import('./src/modules/grid.js');return Object.keys(g.getPlayCircuit().blocks);}),Object.keys(draftBefore.circuit.blocks));
  // A wrong circuit must not create a clear. Input test values must not leak.
  await page.evaluate(async()=>{const g=await import('./src/modules/grid.js');const c=structuredClone(g.getPlayCircuit());c.wires={};g.getPlayController().restoreCircuit(c);});
  await page.locator('#gradeButton').click();
  await page.locator('#gradingResultOverlay[data-state="failed"]').waitFor();
  assert.deepEqual(await page.locator('.trace-event').evaluateAll(nodes => nodes.map(n => n.dataset.eventType)), ['set', 'expect']);
  assert.match(await page.locator('.trace-event[data-failed=true]').innerText(), /✕[\s\S]*EXPECTED/);
  assert.equal(await page.locator('#gradingInlineStatus').isVisible(),false);
  await page.screenshot({path:'test-results/grading-counterexample.png'});
  assert.equal((await save()).stages[1].best,undefined);
  await page.locator('#gradingReplayBtn').click();
  await page.waitForFunction(() => !document.getElementById('gradingReplayBtn').disabled);
  await page.locator('#gradingResultEditBtn').click();
  await grade(1,2);
  assert.equal((await save()).stages[1].best.stars,1);
  await grade(1,3); assert.equal((await save()).stages[1].best.stars,1);
  // Preserve the better record while saving a later unfinished draft.
  await page.evaluate(async()=>{const g=await import('./src/modules/grid.js');const c=structuredClone(g.getPlayCircuit());c.wires={};g.getPlayController().restoreCircuit(c);});
  await page.waitForTimeout(550); assert.equal((await save()).stages[1].best.stars,1);
  await enter(2); await grade(2); await enter(3); await grade(3);
  await enter(6);
  await page.locator('#viewRankingBtn').click();
  await page.locator('#fullVersionDialog[open][data-feature="ranking"]').waitFor();
  await page.locator('.full-version-back').click();
  await page.locator('#hintBtn').click();
  await page.locator('#hintButtons button').nth(0).click(); await page.locator('#closeHintMessageBtn').click();
  assert.equal(await page.locator('#hintButtons button').nth(1).isEnabled(),true);
  await page.locator('#hintButtons button').nth(1).click(); await page.locator('#closeHintMessageBtn').click(); await page.locator('#closeHintBtn').click();
  await grade(6);
  const completed=await save(); assert.ok(completed.stages[6].best); assert.equal(completed.stages[4],undefined); assert.equal(completed.stages[5],undefined);
  assert.equal(completed.hints[6],2); assert.equal('storySeen' in completed,false);
  await enter(6); // A finished demo remains playable and shareable.
  await page.locator('#demoShareBtn').click();
  assert.ok((await page.locator('#demoDialog textarea').inputValue()).includes(`Circuit cost ${completed.stages[6].best.totalCost}`));
  const gifDownload=page.waitForEvent('download'); await page.getByRole('button',{name:'Download GIF',exact:true}).click();
  const gif=await gifDownload; await gif.saveAs('test-results/demo-result.gif'); assert.ok((await fs.stat('test-results/demo-result.gif')).size>100);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await fs.writeFile('test-results/demo-progress.json', JSON.stringify(await save()));
  await enter(4); await grade(4); await enter(5); await grade(5);
  for (const id of [30,31,29,28,27,26,7,25,11]) { await enter(id); await grade(id); }
  await enter(23); // Existing Priority remains playable; optimization budget is pending.
  assert.ok((await save()).stages[23].draft);
  assert.equal('storySeen' in (await save()),false);
  const forbidden=await page.evaluate(async()=>{try {await (await import('./src/modules/levels.js')).startLevel(24);return false;}catch{return true;}}); assert.equal(forbidden,true);
  await goToMap(page); await page.screenshot({path:'test-results/demo-map.png'});
  await openSettings(page);
  await page.screenshot({path:'test-results/demo-settings.png'});
  await page.locator('#settingsCloseBtn').click();
  assert.deepEqual(external,[]); assert.deepEqual(errors,[]); assert.deepEqual(missing,[]);
  console.log(JSON.stringify({result:'passed',gradedStages:16,priorityEntry:true,externalRequests:external,pageErrors:errors,missingAssets:missing},null,2));
} catch(error) {
  console.error('Browser check failed',error);
  console.error('Page errors:',errors,'Missing:',missing,'External:',external);
  console.error((await page.locator('body').innerText()).slice(-4000));
  await page.screenshot({path:'test-results/demo-failure.png'}); process.exitCode=1;
} finally { await browser.close(); }
