import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('.'), output = 'test-results/blueprint';
await fs.mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/blueprint-test.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<meta charset="utf-8"><link rel="stylesheet" href="/style.css"><script src="/gif.js"></script><style>body{margin:0;background:#132035!important}#panel{margin:20px auto;padding:20px;max-width:960px;box-sizing:border-box;color:white;background:#0c1524}#actions{margin-top:20px}</style><main id="panel"><div id="host"></div><div id="actions"><button id="back">Back to map</button></div></main>'); return;
    }
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.js':'text/javascript', '.css':'text/css', '.json':'application/json' })[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const errors = [], hashes = [];
try {
  for (const dpr of [1,2]) {
    const page = await browser.newPage({ viewport:{width:1280,height:1100}, deviceScaleFactor:dpr });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/blueprint-test.html');
    await page.evaluate(async () => {
      window.png = await import('/src/canvas/blueprintExport.js');
      window.ui = await import('/src/modules/costUI.js');
      window.sharing = await import('/src/modules/blueprintShare.js');
      window.circuit = (await (await fetch('/tests/fixtures/demo/25-3.json')).json()).circuit;
      window.hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',');
      window.render = (stars, lang = 'en', id = 25) => {
        ui.disposePerformance(host); host.replaceChildren();
        const record = { circuit, stars, totalCost: stars === 3 ? 20 : stars === 2 ? 30 : 40 };
        ui.renderPerformance(host, { id, title: 'Memory link · 메모리 연결', result:{ record, best:{totalCost:12}, highestStars:3, saved:false },
          thresholds:{twoStarMaxCost:30,threeStarMaxCost:20}, lang,
          ranking:{load:async()=>({entries:[{rank:1,nickname:'Player',totalCost:12,isMe:true}],own:null}),submit:async()=>{throw new Error('offline');}} });
      };
      document.getElementById('back').onclick = () => { ui.disposePerformance(host); host.replaceChildren(); };
    });
    const rendering = await page.evaluate(async () => {
      const before = JSON.stringify(circuit);
      const a = await png.createBlueprintPng({ circuit, title:'Memory link', totalCost:42, stars:2, lang:'en' });
      const aHash = await hash(a.blob);
      if (JSON.stringify(circuit) !== before) throw new Error('Renderer changed circuit');
      for (const b of Object.values(circuit.blocks)) { b.value = !b.value; b.selected = true; b.q = true; }
      circuit.tick = 90; circuit.camera = {zoom:3,x:80,y:100};
      const b = await png.createBlueprintPng({ circuit, title:'Memory link', totalCost:42, stars:2, lang:'en' });
      if (await hash(b.blob) !== aHash) throw new Error('Runtime state leaked into PNG');
      return { hash:aHash, width:a.width,height:a.height, bytes:Array.from(new Uint8Array(await a.blob.arrayBuffer())) };
    });
    hashes.push(rendering.hash); if (dpr===1) await fs.writeFile(`${output}/memory-card.png`, Buffer.from(rendering.bytes));
    assert.ok(rendering.width >= 1200);
    if (dpr===2) { await page.close(); continue; }
    for (const stars of [1,2,3]) {
      await page.evaluate(stars=>render(stars), stars);
      await page.locator('.blueprint-share[data-state=ready]').waitFor();
      const initial = await page.evaluate(() => ({ rank:document.querySelector('.cost-ranking').getBoundingClientRect().top,
        actions:document.getElementById('actions').getBoundingClientRect().top, star:document.querySelector('.cost-stars').getBoundingClientRect().width }));
      assert.equal(await page.locator('.cost-stars .earned').count(),stars);
      assert.equal(await page.locator('.cost-stars svg').count(),3);
      await page.evaluate(()=>window.originalStars=[...document.querySelectorAll('.cost-stars svg')]);
      await page.screenshot({path:`${output}/${stars}-initial.png`});
      for (const time of [900,1400]) {
        await page.evaluate(time=>{for(const a of document.querySelector('.blueprint-card').getAnimations({subtree:true})){a.pause();a.currentTime=time;}},time);
        await page.screenshot({path:`${output}/${stars}-${time}ms.png`});
      }
      await page.evaluate(()=>document.querySelector('.blueprint-card').getAnimations({subtree:true}).forEach(a=>a.play()));
      await page.waitForFunction(()=>document.querySelector('.blueprint-card').dataset.phase==='settled');
      const final = await page.evaluate(() => ({ rank:document.querySelector('.cost-ranking').getBoundingClientRect().top,
        actions:document.getElementById('actions').getBoundingClientRect().top, star:document.querySelector('.cost-stars').getBoundingClientRect().width,
        same:originalStars.every((s,i)=>s===document.querySelectorAll('.cost-stars svg')[i]) }));
      assert.equal(initial.rank,final.rank); assert.equal(initial.actions,final.actions); assert.ok(initial.star>final.star); assert.ok(final.same);
      await page.screenshot({path:`${output}/${stars}-final.png`});
      assert.match(await page.locator('.cost-warning').innerText(),/Local save failed/);
      assert.match(await page.locator('.cost-registration').innerText(),/Submission failed/);
      const canvasCount = await page.locator('.blueprint-preview canvas').count(); assert.equal(canvasCount,1);
      const download=page.waitForEvent('download'); await page.locator('.blueprint-save').click();
      await (await download).saveAs(`${output}/${stars}-download.png`);
    }
    // Read the chosen blob through ClipboardItem; native APIs are isolated from the user's clipboard.
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.copied=await hash(await items[0].getType('image/png'));}}}));
    await page.locator('.blueprint-copy').click();
    await page.waitForFunction(()=>document.querySelector('.blueprint-status').textContent==='Image copied.');
    const fullHash=await page.evaluate(()=>window.copied);
    await page.locator('.blueprint-include input').uncheck(); await page.locator('.blueprint-share[data-state=ready]').waitFor();
    assert.equal(await page.locator('.blueprint-preview').isVisible(),false);
    await page.locator('.blueprint-copy').click(); await page.waitForFunction(()=>document.querySelector('.blueprint-status').textContent==='Image copied.'); assert.notEqual(await page.evaluate(()=>window.copied),fullHash);
    const compact=page.waitForEvent('download'); await page.locator('.blueprint-save').click(); await (await compact).saveAs(`${output}/performance-only.png`);
    await page.locator('.blueprint-include input').check(); await page.locator('.blueprint-share[data-state=ready]').waitFor();
    await page.locator('.blueprint-preview').focus(); await page.keyboard.press('Enter');
    await page.locator('.blueprint-zoom[open]').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.blueprint-preview').evaluate(e=>e===document.activeElement),true);
    await page.locator('.cost-ranking-toggle').click(); await page.locator('.cost-ranking-toggle').click();
    assert.equal(await page.locator('.blueprint-card').getAttribute('data-phase'),'settled');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{throw new Error('denied');}}}));
    await page.locator('.blueprint-copy').click(); assert.match(await page.locator('.blueprint-status').innerText(),/Use Save image/);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
    await page.locator('.blueprint-copy').click(); assert.match(await page.locator('.blueprint-status').innerText(),/Use Save image/);
    // Exact file capability gate and silent cancellation.
    await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files?.[0]?.type==='image/png'});Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.sharedType=files[0].type;throw new DOMException('Cancelled','AbortError');}});render(2);});
    await page.locator('.blueprint-share[data-state=ready]').waitFor(); await page.locator('.blueprint-native-share').click();
    assert.equal(await page.evaluate(()=>window.sharedType),'image/png'); assert.match(await page.locator('.blueprint-status').innerText(),/PNG ready/);
    for (const lang of ['ko','en']) {
      await page.emulateMedia({ reducedMotion:'reduce' }); await page.setViewportSize({width:360,height:800});
      await page.evaluate(lang=>render(2,lang),lang); await page.locator('.blueprint-share[data-state=ready]').waitFor();
      assert.equal(await page.locator('.blueprint-card').getAttribute('data-phase'),'settled');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${output}/narrow-${lang}.png`,fullPage:true});
    }
    await page.emulateMedia({reducedMotion:'no-preference'}); await page.setViewportSize({width:1280,height:1100});
    await page.evaluate(()=>render(1)); await page.setViewportSize({width:800,height:900});
    await page.waitForFunction(()=>document.querySelector('.blueprint-card').dataset.phase==='settled');
    await page.evaluate(()=>render(1)); await page.locator('#back').click(); await page.waitForTimeout(1700); assert.equal(await page.locator('.blueprint-card').count(),0);
    await page.evaluate(()=>render(1)); await page.locator('.blueprint-include input').uncheck();
    assert.equal(await page.locator('.blueprint-card').getAttribute('data-phase'),'settled');
    // Tutorial has no star/ranking; no threshold still awards exactly the record's one star.
    await page.evaluate(()=>render(0,'en',0)); assert.equal(await page.locator('.cost-stars,.cost-ranking').count(),0);
    assert.equal(await page.locator('.blueprint-card').getAttribute('data-phase'),'settled');
    // Out-of-order encoders, failed retry and disposal must not publish stale PNGs.
    const isolation=await page.evaluate(async()=>{
      ui.disposePerformance(host);host.replaceChildren();let jobs=[];window.payloads=[];
      const source=structuredClone(circuit);
      const v=sharing.createBlueprintShare(host,{circuit:source,title:'Frozen',totalCost:42,stars:1,lang:'en'},{generate:input=>new Promise((resolve,reject)=>jobs.push({input,resolve,reject}))});
      source.blocks={};const toggle=v.root.querySelector('input');toggle.checked=false;toggle.dispatchEvent(new Event('change'));toggle.checked=true;toggle.dispatchEvent(new Event('change'));
      const result=text=>({blob:new Blob([text],{type:'image/png'}),preview:document.createElement('canvas')});
      jobs[2].resolve(result('latest'));await new Promise(r=>setTimeout(r,0));jobs[0].resolve(result('old'));jobs[1].reject(new Error('old failure'));await new Promise(r=>setTimeout(r,0));
      let didCopy; const copied = new Promise(resolve=>didCopy=resolve);
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{payloads.push(await(await items[0].getType('image/png')).text());didCopy();}}});
      v.root.querySelector('.blueprint-copy').click();await copied;
      const selected=payloads[0],frozen=Object.keys(jobs[0].input.circuit.blocks).length>0;
      toggle.checked=false;toggle.dispatchEvent(new Event('change'));jobs[3].reject(new Error('failed'));await new Promise(r=>setTimeout(r,0));
      const failed=v.root.dataset.state==='failed'&&v.root.querySelector('.blueprint-copy').disabled;
      v.root.querySelector('.blueprint-retry').click();v.dispose();jobs[4].resolve(result('late'));await new Promise(r=>setTimeout(r,0));
      return {selected,frozen,failed,disposed:v.root.querySelector('.blueprint-copy').disabled};
    });
    assert.deepEqual(isolation,{selected:'latest',frozen:true,failed:true,disposed:true});
    const large=await page.evaluate(async()=>{
      const c=(await(await fetch('/tests/fixtures/memory20/45.json')).json()).circuit;
      const result=await png.createBlueprintPng({circuit:c,title:'Large circuit · 큰 회로',totalCost:1234,stars:3});
      return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
    }); await fs.writeFile(`${output}/large-card.png`,Buffer.from(large));
    const feedback=await page.evaluate(async()=>{
      const c={rows:8,cols:12,blocks:{},wires:{}};
      const add=(id,type,r,col,name)=>c.blocks[id]={id,type,pos:{r,c:col},name};
      add('i','INPUT',2,1,'A');add('d','D',2,4);add('o','OUTPUT',5,4,'GO');
      add('j','JUNCTION',5,1,'JUNC');add('or','OR',2,7);add('and','AND',5,7);add('not','NOT',5,10);add('button','INPUT',2,10,'FAULT');c.blocks.button.inputMode='button';
      add('j2','JUNCTION',7,1,'JUNC');add('named','JUNCTION',7,4,'CLOCK');
      const wire=(id,startBlockId,endBlockId,inputRole,path)=>c.wires[id]={id,startBlockId,endBlockId,inputRole,path:path.map(([r,c])=>({r,c}))};
      wire('enable','i','d','EN',[[2,1],[2,2],[2,3],[2,4]]);
      wire('feedback','d','d','D',[[2,4],[1,4],[0,4],[0,5],[0,6],[1,6],[2,6],[2,5],[2,4]]);
      wire('out','d','o',undefined,[[2,4],[3,4],[4,4],[5,4]]);
      const labels=[], original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){labels.push(text);return original.call(this,text,...args);};
      try {
        const result=await png.createBlueprintPng({circuit:c,title:'Self feedback / 자기 피드백',totalCost:70,stars:2});
        return {bytes:Array.from(new Uint8Array(await result.blob.arrayBuffer())),labels};
      } finally { CanvasRenderingContext2D.prototype.fillText=original; }
    });await fs.writeFile(`${output}/feedback-card.png`,Buffer.from(feedback.bytes));
    for (const label of ['J1','J2','CLOCK']) assert.ok(feedback.labels.includes(label), `Missing rendered junction label: ${label}`);
    const sizeFailure=await page.evaluate(async()=>{
      const c={rows:10000,cols:10000,blocks:{a:{id:'a',type:'INPUT',pos:{r:0,c:0}},b:{id:'b',type:'OUTPUT',pos:{r:9999,c:9999}}},wires:{}};
      let rejected=false;try{await png.createBlueprintPng({circuit:c,title:'Too large',totalCost:0});}catch{rejected=true;}
      const result=await png.createBlueprintPng({circuit:c,title:'Too large',totalCost:0,includeCircuit:false});
      return rejected&&result.blob.size>0&&result.height<400;
    });assert.ok(sizeFailure);
    await page.evaluate(()=>{host.replaceChildren();sharing.openBlueprintExport({rows:6,cols:6,blocks:{},wires:{}},'Empty','en');});
    assert.match(await page.locator('.blueprint-export .blueprint-status').innerText(),/no circuit/); assert.equal(await page.locator('.blueprint-export .blueprint-save').isDisabled(),true);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.close();
  }
  assert.equal(hashes[0],hashes[1]);assert.deepEqual(errors,[]);
  console.log('Blueprint browser passed: PNG pixels stable across DPR/runtime, record isolation, 1/2/3-star continuity and fixed layout, downloads/privacy, keyboard/zoom, mobile/KO/EN/reduced-motion, clipboard failures, file-share cancellation, async races/retry/disposal, tutorial/empty, large PNG. Native OS paste/mobile share remain manual checks.');
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
