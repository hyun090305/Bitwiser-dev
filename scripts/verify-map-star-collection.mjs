import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, _electron as electron } from 'playwright';
import { preserveStageAccess } from '../src/modules/stageCatalog.js';
import { emptyProgress } from '../src/demo/records.js';
import { makeCostRecord } from '../src/modules/costRecords.js';
import { observeMap } from './demo-browser-helpers.mjs';

const root = path.resolve('.'), native = process.argv.includes('--electron');
const out = path.join(root, 'test-results/map-star-collection');
await fs.mkdir(out, { recursive: true });
const data = JSON.parse(await fs.readFile('levels.json', 'utf8'));
const circuits = {};
for (const tier of [2,3]) circuits[tier] = JSON.parse(await fs.readFile(`tests/fixtures/demo/1-${tier}.json`, 'utf8')).circuit;
circuits[1] = structuredClone(circuits[3]);
Object.assign(circuits[1].blocks, {
  n2: { id: 'n2', type: 'NOT', pos: { r: 3, c: 3 }, value: false, fixed: false },
  n3: { id: 'n3', type: 'NOT', pos: { r: 3, c: 5 }, value: false, fixed: false }
});
circuits[1].blocks.o.pos = { r: 5, c: 5 };
circuits[1].wires.w1.endBlockId = 'n2';
circuits[1].wires.w2 = { id: 'w2', startBlockId: 'n2', endBlockId: 'n3', path: [{r:3,c:3},{r:3,c:4},{r:3,c:5}] };
circuits[1].wires.w3 = { id: 'w3', startBlockId: 'n3', endBlockId: 'o', path: [{r:3,c:5},{r:4,c:5},{r:5,c:5}] };
for (const tier of [1,2,3]) assert.equal(makeCostRecord(circuits[tier], 1, data).stars, tier);

const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.gif':'image/gif', '.mp3':'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = native ? null : await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
let app;
const report = [];

// Observe the actual canvas star paths in screen CSS pixels, including DPR
// and the temporary new-star scale. No product-only testing API is needed.
async function observeStars(context) {
  await context.addInitScript(() => {
    window.mapStars = [];
    const proto = CanvasRenderingContext2D.prototype;
    const begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, fill = proto.fill, clear = proto.clearRect;
    proto.beginPath = function (...args) { this.qaPath = []; return begin.apply(this, args); };
    proto.moveTo = function (...args) { this.qaPath?.push(args); return move.apply(this, args); };
    proto.lineTo = function (...args) { this.qaPath?.push(args); return line.apply(this, args); };
    proto.clearRect = function (...args) { if (this.canvas.id === 'stageMapCanvas') window.mapStars = []; return clear.apply(this, args); };
    proto.fill = function (...args) {
      if (this.canvas.id === 'stageMapCanvas' && this.qaPath?.length === 10 && ['#c5ac70','#42556b'].includes(this.strokeStyle)) {
        const p = this.getTransform().transformPoint(new DOMPoint(32,32)), rect = this.canvas.getBoundingClientRect();
        window.mapStars.push({ x: rect.x + p.x * rect.width / this.canvas.width, y: rect.y + p.y * rect.height / this.canvas.height, size:Math.abs(this.getTransform().a)*64*rect.width/this.canvas.width, earned: this.strokeStyle === '#c5ac70' });
      }
      return fill.apply(this, args);
    };
  });
}

try {
  const cases = process.argv.includes('--smoke') ? [{ before:0, grades:[3], indices:[0,1,2] }] : [
    { before:0, grades:[1], indices:[0] }, { before:0, grades:[3], indices:[0,1,2] },
    { before:1, grades:[3], indices:[1,2] }, { before:2, grades:[3], indices:[2] },
    { before:2, grades:[2], indices:[] }, { before:3, grades:[2], indices:[] },
    { before:0, grades:[1,3], indices:[0,1,2], closeFirst:true },
    ...['chapter','resize','hide','stage','reduce'].map(cancel => ({ before:0, grades:[3], indices:[0,1,2], cancel })),
    { before:0, grades:[3], indices:[], reduced:true }
  ];
  for (const surface of native ? ['electron'] : ['web','demo']) for (const lang of ['ko','en']) for (const scenario of cases) {
    // Every boundary case runs in both entry points. The ordinary three-star
    // case also runs at a narrow window/high DPR in the second language.
    const narrow = lang === 'en', size = narrow ? { width:900, height:650 } : { width:1440, height:980 };
    if (native) {
      const profile = await fs.mkdtemp(path.join(root,'test-results','star-collection-electron-'));
      const env = { ...process.env, BITWISER_TEST_PROFILE:profile }; delete env.ELECTRON_RUN_AS_NODE;
      app = await electron.launch({ args:[path.join(root,'scripts/electron-save-test-entry.cjs')], env });
    }
    const context = native ? app.context() : await browser.newContext({ viewport:size, deviceScaleFactor:narrow?2:1, serviceWorkers:'block', reducedMotion:scenario.reduced?'reduce':'no-preference' });
    await observeMap(context); await observeStars(context);
    if (!native) await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const stages = scenario.before ? { 1: { historicalClear:true, highestStars:scenario.before } } : {};
    const access = preserveStageAccess(Object.keys(stages).map(Number), {}, { stageStars: { 1:scenario.before } });
    await context.addInitScript(({lang,stages,access,demo,progress}) => {
      if (location.protocol === 'about:') return;
      window.firebase = { initializeApp(){}, database:()=>undefined };
      localStorage.setItem('lang',lang); localStorage.setItem('username','Collection QA'); localStorage.setItem('autoSaveCircuit','false');
      if (!localStorage.getItem('collection-seeded')) {
        localStorage.setItem('bitwiser:cost-progress:v1:Collection QA',JSON.stringify({stages}));
        localStorage.setItem('stageMapAccess_v3_Collection QA',JSON.stringify(access));
        if (demo) localStorage.setItem('bitwiser:web-demo:v1',JSON.stringify({...progress,...access,stages,lastStageId:1,settings:{lang}}));
        localStorage.setItem('collection-seeded','1');
      }
    }, { lang, stages, access, demo:surface==='demo', progress:emptyProgress() });
    const page = native ? await app.firstWindow() : await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    if (native) { await page.waitForURL('app://bitwiser/index.html'); await page.setViewportSize(size); await page.emulateMedia({reducedMotion:scenario.reduced?'reduce':'no-preference'}); await page.reload(); }
    else await page.goto(surface === 'demo' ? base + '/dist-web-demo/index.html' : base);
    await page.locator('#loadingStartBtn').click(); await page.locator('#loadingScreen').waitFor({state:'hidden'});
    if (surface !== 'demo') await page.evaluate(async () => {
      await (await import('./src/modules/levels.js')).startLevel(1);
      const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
    });
    await page.locator('#startLevelBtn').click();
    const result = surface === 'demo' ? '#demoDialog[open]' : '#clearedModal';
    const mapButton = surface === 'demo' ? '.demo-result-map' : '#clearedMapBtn';
    for (const [index,tier] of scenario.grades.entries()) {
      await page.evaluate(async circuit => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(circuit), circuits[tier]);
      await page.locator('#gradeButton').click(); await page.locator(result).waitFor({state:'visible'});
      if (index < scenario.grades.length - 1) await page.locator(surface === 'demo' && scenario.closeFirst ? '#demoDialogActions button:last-child' : result+' .modal-buttons button:first-child').click();
    }
    await page.evaluate(() => {
      window.collectionTrace = []; window.traceUntil = performance.now()+2500;
      function sample(now) {
        const screen = document.getElementById('stageMapScreen');
        if (getComputedStyle(screen).display !== 'none') {
          const flights = [...document.querySelectorAll('.map-collect-star')].map(icon => {
            const style = getComputedStyle(icon), m = new DOMMatrix(style.transform), size = parseFloat(style.width);
            return { index:Number(icon.dataset.starIndex), x:m.e+size/2, y:m.f+size/2, visible:style.visibility==='visible' };
          });
          const r = document.querySelector('.chapter-total-star-icon').getBoundingClientRect();
          window.collectionTrace.push({ now, value:Number(document.querySelector('.chapter-total-star-value').textContent), layer:!!document.querySelector('.map-star-collection'), chapter:document.querySelector('.stage-map-chapter-nav').dataset.chapterId,
            stars:window.mapStars, flights, target:{x:r.x+r.width/2,y:r.y+r.height/2} });
        }
        if (now < window.traceUntil) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    let cast, frameWrites = [], frameNumber = 0;
    const recording = process.argv.includes('--record') && !native && surface==='web' && lang==='ko' && scenario.indices.length===3 && !scenario.cancel;
    if (recording) {
      await fs.mkdir(path.join(out,'recording'),{recursive:true});
      cast = await context.newCDPSession(page);
      cast.on('Page.screencastFrame', event => {
        frameWrites.push(fs.writeFile(path.join(out,'recording',`${String(frameNumber++).padStart(4,'0')}.png`),Buffer.from(event.data,'base64')));
        cast.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
      });
      await cast.send('Page.startScreencast',{format:'png',maxWidth:1440,maxHeight:980,everyNthFrame:1});
    }
    const returnedAt = Date.now(); await page.locator(mapButton).click();
    if (scenario.cancel) {
      await page.locator('.map-collect-star').first().waitFor({state:'visible'});
      if (scenario.cancel === 'chapter') await page.keyboard.press('ArrowLeft');
      if (scenario.cancel === 'resize') await page.setViewportSize({width:size.width-40,height:size.height-20});
      if (scenario.cancel === 'hide') await page.evaluate(() => {
        Object.defineProperty(document,'hidden',{configurable:true,value:true});
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
      });
      if (scenario.cancel === 'stage') {
        const point = await page.evaluate(() => window.mapLabels[Object.keys(window.mapLabels).find(key => key.toUpperCase().includes('NOT'))]);
        await page.mouse.click(point.x+3,point.y);
        await page.locator('#levelIntroModal').waitFor({state:'visible'});
        assert.ok(Date.now()-returnedAt < 1300);
      }
      if (scenario.cancel === 'reduce') await page.emulateMedia({reducedMotion:'reduce'});
    }
    await page.waitForFunction(() => !document.querySelector('.map-star-collection'));
    await page.waitForTimeout(150);
    if (cast) { await cast.send('Page.stopScreencast'); await Promise.all(frameWrites); await page.screenshot({path:path.join(out,'collected.png')}); }
    const trace = await page.evaluate(() => { window.traceUntil=0; return window.collectionTrace; });
    await fs.writeFile(path.join(out,`${surface}-${lang}-latest.json`),JSON.stringify({scenario,trace},null,2));
    const final = Math.max(scenario.before,...scenario.grades);
    assert.equal(Number(await page.locator('.chapter-total-star-value').innerText()),final);
    assert.match(await page.locator('#chapterTotalStars').getAttribute('aria-label'),new RegExp(`${final}$`));
    assert.equal(await page.getByRole('status',{name:new RegExp(`${lang==='ko'?'누적 별':'Total stars'}: ★ ${final}$`)}).count(),1);
    assert.equal(await page.locator('.map-collect-star').count(),0);
    if (!scenario.cancel) {
      assert.deepEqual([...new Set(trace.flatMap(frame => frame.flights.map(flight=>flight.index)))].sort(),scenario.indices);
      const values = trace.map(frame=>frame.value).filter((value,index,all)=>!index||value!==all[index-1]);
      assert.deepEqual(values,scenario.reduced ? [final] : Array.from({length:final-scenario.before+1},(_,i)=>scenario.before+i));
      if (scenario.indices.length) {
        const origin = trace.find(frame=>frame.flights.length);
        for (const flight of origin.flights) assert.ok(origin.stars.some(star=>Math.hypot(star.x-flight.x,star.y-flight.y)<1),'Clone origin matches the canvas star at this DPR');
        for (const frame of trace.filter(frame=>frame.flights.some(flight=>flight.visible))) {
          for (const start of origin.flights) assert.ok(frame.stars.some(star=>star.earned&&Math.hypot(star.x-start.x,star.y-start.y)<1),'The earned original stays filled during flight');
        }
        const last = trace.findLast(frame=>frame.flights.some(flight=>flight.visible));
        assert.ok(last.flights.filter(flight=>flight.visible).some(flight=>Math.hypot(flight.x-last.target.x,flight.y-last.target.y)<1),'Clone reaches the actual counter icon');
        assert.ok(trace.findLast(frame=>frame.layer).now-trace[0].now >= 800);
        assert.ok(trace.findLast(frame=>frame.layer).now-trace[0].now < 1350);
      }
      await page.evaluate(() => document.dispatchEvent(new Event('stageMap:shown')));
      assert.equal(await page.locator('.map-star-collection').count(),0);
      await page.reload(); await page.locator('#loadingStartBtn').click();
      assert.equal(await page.locator('.map-star-collection').count(),0);
    }
    assert.deepEqual(errors,[]);
    const name = `${surface}-${lang}-${scenario.before}-${scenario.grades.join('-')}${scenario.cancel?'-'+scenario.cancel:''}${scenario.reduced?'-reduced':''}`;
    await fs.writeFile(path.join(out,name+'.json'),JSON.stringify({scenario,trace},null,2));
    report.push({surface,lang,scenario,passed:true}); console.log('Passed',name);
    if (native) { await app.close(); app=null; } else await context.close();
  }
  await fs.writeFile(path.join(out,`${native?'electron':'browser'}-report.json`),JSON.stringify(report,null,2));
} finally { await app?.close(); await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
