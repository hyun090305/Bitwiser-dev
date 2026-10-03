import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, _electron } from 'playwright';

const root=path.resolve('.'), out=path.join(root,'test-results/first-play-ux');
await fs.mkdir(out,{recursive:true});
const native=process.argv.includes('--electron');
const browser=native?null:await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const tutorial=JSON.parse(await fs.readFile('tests/fixtures/demo/0-tutorial.json','utf8')).circuit;
const report=[];
try {
  for (const surface of native?['electron']:['full','demo']) {
    let server,app;
    try {
      if (native) {
        const profile=await fs.mkdtemp(path.join(out,'profile-'));
        const env={...process.env,BITWISER_TEST_PROFILE:profile, BITWISER_TEST_VISIBLE:'1'};delete env.ELECTRON_RUN_AS_NODE;
        app=await _electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});
      } else {
        const files=surface==='demo'?path.join(root,'dist-web-demo'):root;
        server=createServer(async(req,res)=>{
          try {
            const name=new URL(req.url,'http://localhost').pathname,folder=name.startsWith('/tests/')?root:files,file=path.resolve(folder,'.'+(name==='/'?'/index.html':name));
            if (!file.startsWith(folder+path.sep)) return res.writeHead(403).end();
            const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.gif':'image/gif'};
            const body=await fs.readFile(file);
            res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
          } catch {res.writeHead(404).end();}
        });
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      }
      for (const lang of ['ko','en']) {
        const context=native?app.context():await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,serviceWorkers:'block'});
        const base=server?`http://127.0.0.1:${server.address().port}`:null;
        if (!native) await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
        await context.addInitScript(lang=>{
          try {localStorage.setItem('lang',lang);localStorage.setItem('autoSaveCircuit','false');} catch { /* Electron's initial about:blank has no storage origin. */ }
          window.alerts=[];window.alert=message=>alerts.push(message);
        },lang);
        const page=native?await app.firstWindow():await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        if (native) {
          await page.waitForURL('app://bitwiser/index.html');
          await page.evaluate(lang=>localStorage.setItem('lang',lang),lang);await page.reload();
          await page.setViewportSize({width:1440,height:1000});
        } else await page.goto(base);
        await page.waitForFunction(()=>document.getElementById('loadingStartBtn')?.disabled===false);
        await page.locator('#loadingStartBtn').click();
        const enter=async id=>{
          await page.evaluate(async id=>{
            const levels=await import('./src/modules/levels.js');
            levels.configureLevelModule({progressProvider:()=>[0]});await levels.startLevel(id);
            const nav=await import('./src/modules/navigation.js');nav.hideStageMapScreen();nav.showGameScreen();
          },id);
          await page.waitForFunction(()=>document.getElementById('startLevelBtn')?.disabled===false);
          await page.locator('#startLevelBtn').click();
        };
        const restore=c=>page.evaluate(async c=>(await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c),c);
        const read=()=>page.evaluate(async()=>{
          const g=await import('./src/modules/grid.js'),e=await import('./src/canvas/evaluation.js'),c=g.getPlayCircuit();
          return {tick:e.getExecutionState(c).tick,inputs:Object.fromEntries(Object.values(c.blocks).filter(b=>b.type==='INPUT').map(b=>[b.name,b.value])),output:Object.values(c.blocks).find(b=>b.type==='OUTPUT')?.value,
            design:JSON.stringify({rows:c.rows,cols:c.cols,blocks:Object.fromEntries(Object.entries(c.blocks).map(([id,b])=>[id,{id:b.id,type:b.type,name:b.name,pos:b.pos,fixed:b.fixed,inputMode:b.inputMode}])),wires:c.wires})};
        });
        const cell=async(r,c)=>page.locator('#overlayCanvas').evaluate((canvas,{r,c})=>{
          const bounds=canvas.getBoundingClientRect(),scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth);
          return {x:bounds.x+Number(canvas.dataset.panelWidth)+(27+c*52)*scale,y:bounds.y+(27+r*52)*scale};
        },{r,c});
        const clickCell=async(r,c)=>{const p=await cell(r,c);await page.mouse.click(p.x,p.y);};
        const draw=async cells=>{
          if (await page.evaluate(async()=>(await import('./src/modules/grid.js')).getPlayController().state.mode!=='wireDrawing')) await page.locator('#wireStatusInfo').click();
          const p=await cell(...cells[0]);
          await page.mouse.move(p.x,p.y);await page.mouse.down();
          for (const rc of cells.slice(1)) {const p=await cell(...rc);await page.mouse.move(p.x,p.y,{steps:3});}
          await page.mouse.up();
        };
        const marker=()=>page.locator('#contentCanvas').evaluate(canvas=>{
          const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          let count=0,minX=Infinity,minY=Infinity,maxX=0,maxY=0;
          for(let i=0;i<data.length;i+=4) if(data[i]>245&&data[i+1]>=130&&data[i+1]<=150&&data[i+2]>=150&&data[i+2]<=170&&data[i+3]>200) {
            count++;const x=(i/4)%canvas.width,y=Math.floor(i/4/canvas.width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
          }
          const ratio=canvas.getBoundingClientRect().width/canvas.width;
          return {count,minX:minX*ratio,minY:minY*ratio,maxX:maxX*ratio,maxY:maxY*ratio};
        });

        const waitForMarkerRemoval=()=>page.waitForFunction(()=>{
          const canvas=document.getElementById('contentCanvas');
          const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          for(let i=0;i<pixels.length;i+=4) if(pixels[i]>245&&pixels[i+1]>=130&&pixels[i+1]<=150&&pixels[i+2]>=150&&pixels[i+2]<=170&&pixels[i+3]>200) return false;
          return true;
        },null,{timeout:1500});
        await enter(0);
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'place');
        const unwired=structuredClone(tutorial);unwired.wires={};await restore(unwired);
        for(const wire of Object.values(tutorial.wires)) await draw(wire.path.map(({r,c})=>[r,c]));
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'input-in2');
        assert.equal(await page.evaluate(async()=>(await import('./src/modules/grid.js')).getPlayController().state.mode),'idle','Completing the wires must enable input clicks');
        assert.equal(await page.locator('#wireMoveInfo.active').count(),1);
        assert.equal(await page.locator('#wireStatusInfo.active').count(),0);
        const drawnDesign=(await read()).design;
        assert.deepEqual((await read()).inputs,{IN1:false,IN2:false});assert.equal((await read()).output,false);
        await clickCell(3,1);
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'input-in1');assert.equal((await read()).output,true);
        await clickCell(1,1);
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'grade');assert.equal((await read()).output,false);
        assert.equal((await read()).tick,0);assert.equal((await read()).design,drawnDesign);
        const disconnected=structuredClone(tutorial);disconnected.wires={};await restore(disconnected);
        const initial=structuredClone(tutorial);initial.blocks.a.value=true;initial.blocks.b.value=true;
        await restore(initial);
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'input-in2');
        assert.deepEqual((await read()).inputs,{IN1:false,IN2:false});assert.equal((await read()).output,false);
        const design=(await read()).design;
        await clickCell(3,1);
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'input-in1');
        assert.equal((await read()).output,true);assert.equal((await read()).tick,0);
        await clickCell(1,1);
        assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'grade');
        assert.equal((await read()).output,false);assert.equal((await read()).design,design);
        const mission=await page.locator('.tutorial-mission-overlay').innerText();
        if(lang==='en') assert.doesNotMatch(mission,/[가-힣]/);else assert.doesNotMatch(mission,/Press|Try|Check/);
        const broken=structuredClone(tutorial);delete broken.wires[Object.keys(broken.wires)[0]];
        await restore(broken);assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'wire');
        await restore(tutorial);assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'input-in2');
        await restore(initial);assert.deepEqual((await read()).inputs,{IN1:false,IN2:false});
        await clickCell(1,1);assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),'input-in2');
        assert.deepEqual((await read()).inputs,{IN1:false,IN2:false});
        await page.screenshot({path:path.join(out,`${surface}-${lang}-tutorial.png`)});
        await restore(tutorial);await page.setViewportSize({width:360,height:780});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        for(const [r,c,next] of [[3,1,'input-in1'],[1,1,'grade']]) {
          const point=await cell(r,c),instruction=await page.locator('.tutorial-mission-overlay').boundingBox();
          assert.ok(point.x<instruction.x||point.x>instruction.x+instruction.width||point.y<instruction.y||point.y>instruction.y+instruction.height,'The short mission does not cover the current input');
          await clickCell(r,c);
          assert.equal(await page.locator('.tutorial-mission-overlay').getAttribute('data-step'),next);
          if(next==='input-in1') await page.screenshot({path:path.join(out,`${surface}-${lang}-tutorial-narrow.png`)});
        }
        assert.equal((await read()).tick,0);assert.equal((await read()).design,design);
        await page.setViewportSize({width:1440,height:1000});

        await enter(6);
        await page.evaluate(async()=>{
          const s=await import('./src/modules/storage.js');s.setHintCooldown(Date.now()+24*3600000);
          window.cooldownBefore=s.getHintCooldown();window.lockReads=0;window.lockWrites=0;
          window.firebase={auth:()=>({currentUser:{uid:'first-play-test'}})};
          window.db={ref:key=>({once:async()=>{if(key.startsWith('hintLocks'))lockReads++;return {val:()=>key.startsWith('hintLocks')?Date.now()+48*3600000:0};},set:async()=>{if(key.startsWith('hintLocks'))lockWrites++;}})};
        });
        // No help overlay opens until the player asks for it.
        assert.equal(await page.locator('#hintModal').isVisible(),false);
        assert.equal(await page.locator('#controlsDialog[open]').count(),0);
        await page.locator('#hintBtn').click();
        assert.equal(await page.locator('#hintButtons button').nth(0).isEnabled(),true);
        await page.locator('#hintButtons button').nth(0).click();
        assert.equal(await page.locator('#hintMessage').isVisible(),true);
        assert.doesNotMatch(await page.locator('#hintMessage').innerText(),/[=∧∨~¬]/);
        assert.equal(await page.locator('#hintMessageModal').count(),0);
        assert.equal(await page.locator('#hintButtons button').nth(1).isEnabled(),true);
        await page.locator('#hintButtons button').nth(1).click();
        assert.equal(await page.locator('#hintTimerContainer').isVisible(),false);
        assert.equal(await page.locator('#adHintBtn:visible').count(),0);
        assert.deepEqual(await page.evaluate(async()=>({reads:lockReads,writes:lockWrites,cooldown:(await import('./src/modules/storage.js')).getHintCooldown()})),{reads:0,writes:0,cooldown:await page.evaluate(()=>cooldownBefore)});
        await page.setViewportSize({width:360,height:780});
        const hintBounds=await page.locator('.hint-panel').boundingBox();
        assert.ok(hintBounds.x>=0&&hintBounds.x+hintBounds.width<=360);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(out,`${surface}-${lang}-hint-narrow.png`)});
        await page.setViewportSize({width:1440,height:1000});
        await page.screenshot({path:path.join(out,`${surface}-${lang}-hint.png`)});
        await page.locator('#closeHintBtn').click();await page.locator('#hintBtn').click();
        assert.equal(await page.locator('#hintMessage').isVisible(),false);
        assert.equal(await page.locator('#hintButtons button').nth(1).isEnabled(),true);
        await page.locator('#closeHintBtn').click();await enter(7);
        await page.locator('#hintBtn').click();assert.equal(await page.locator('#hintButtons button').nth(0).isEnabled(),true);
        await page.locator('#hintButtons button').nth(0).click();
        assert.doesNotMatch(await page.locator('#hintMessage').innerText(),/[=∧∨~¬]/);
        await page.locator('#closeHintBtn').click();
        await page.evaluate(async()=>{(await import('./src/modules/levels.js')).getLevelHints().stage7={hints:[]};document.dispatchEvent(new Event('bitwiser:stageReady'));});
        assert.equal(await page.locator('#hintBtn').isVisible(),false);

        await enter(0);await restore(tutorial);
        await page.locator('.cost-total-trigger').hover();assert.equal(await page.locator('.cost-total-detail').isVisible(),true);
        await page.mouse.move(0,0);assert.equal(await page.locator('.cost-total-detail').isVisible(),false);
        await page.locator('.cost-total-trigger').focus();
        assert.equal(await page.locator('.cost-total-detail').isVisible(),true);
        assert.match(await page.locator('.cost-total-detail').innerText(),lang==='ko'?/블록 20 \/ 도선 4/:/Blocks 20 \/ Wires 4/);
        await page.setViewportSize({width:360,height:780});
        await page.locator('.cost-total-trigger').scrollIntoViewIfNeeded();
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await page.locator('.cost-total-trigger').focus();
        const costBounds=await page.locator('.cost-total-detail').boundingBox();
        assert.ok(costBounds.x>=0&&costBounds.x+costBounds.width<=360&&costBounds.y>=0&&costBounds.y+costBounds.height<=780,JSON.stringify({costBounds,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),trigger:await page.locator('.cost-total-trigger').boundingBox()}));
        await page.screenshot({path:path.join(out,`${surface}-${lang}-cost-narrow.png`)});
        await page.setViewportSize({width:1440,height:1000});
        await page.keyboard.press('Escape');assert.equal(await page.locator('.cost-total-detail').isVisible(),false);
        await page.locator('.cost-total-trigger').click();await restore(broken);
        assert.match(await page.locator('.cost-total-detail').innerText(),lang==='ko'?/도선 3/:/Wires 3/);
        const withMemory=structuredClone(tutorial);
        withMemory.blocks.d={id:'d',type:'D',pos:{r:0,c:0},value:false};
        withMemory.blocks.j={id:'j',type:'JUNCTION',pos:{r:5,c:0},value:false};
        await restore(withMemory);
        assert.match(await page.locator('.cost-total-detail').innerText(),lang==='ko'?/블록 41 \/ 도선 4/:/Blocks 41 \/ Wires 4/);
        assert.equal(await page.locator('.cost-total').innerText(),'45');
        await restore(broken);
        await page.mouse.click(0,0);assert.equal(await page.locator('.cost-total-detail').isVisible(),false);
        await page.locator('.circuit-diagnostic-badge').click();
        const missing=page.locator('.circuit-diagnostics button').filter({hasText:/NOT/});
        assert.match(await missing.innerText(),lang==='ko'?/입력 1개 부족/:/1 input missing/);
        await missing.click();assert.ok((await marker()).count>0);
        const selected=await marker(), not=await cell(1,3), canvas=await page.locator('#contentCanvas').boundingBox();
        assert.ok(not.x-canvas.x>=selected.minX&&not.x-canvas.x<=selected.maxX);
        assert.ok(not.y-canvas.y>=selected.minY&&not.y-canvas.y<=selected.maxY);
        await restore(tutorial);await page.waitForTimeout(3100);await waitForMarkerRemoval();assert.equal((await marker()).count,0);
        const atomic=await read();
        await draw([[1,1],[2,1]]);
        assert.match(await page.locator('.circuit-edit-notice').innerText(),lang==='ko'?/끝을 블록/:/End the wire/);
        assert.equal((await read()).design,atomic.design);assert.equal((await read()).tick,atomic.tick);assert.ok((await marker()).count>0);
        await page.waitForTimeout(3100);await waitForMarkerRemoval();assert.equal((await marker()).count,0);
        await draw([[4,4]]); // OUTPUT cannot be a source.
        assert.match(await page.locator('.circuit-edit-notice').innerText(),/OUTPUT/);
        await page.waitForTimeout(3100);await waitForMarkerRemoval();assert.equal((await marker()).count,0);
        await page.locator('#wireMoveInfo').click();await page.locator('#wireStatusInfo').click();
        const p=await cell(1,1);await page.mouse.move(p.x,p.y);await page.mouse.down();
        await page.keyboard.press('Escape');await page.mouse.up();
        assert.equal(await page.locator('.circuit-edit-notice').isVisible(),false);assert.equal((await marker()).count,0);

        await enter(1);
        await restore(JSON.parse(await fs.readFile('tests/fixtures/demo/1-3.json','utf8')).circuit);
        await page.locator('#gradeButton').click();
        const result=page.locator(surface==='demo'?'#demoDialog[open]':'#clearedModal');await result.waitFor({state:'visible'});
        await result.locator('.blueprint-share[data-state=ready]').waitFor();
        assert.equal(await result.locator('.blueprint-sharing').getAttribute('open'),null);
        assert.equal(await result.locator('.cost-ranking').isVisible(),false);
        assert.equal(await result.locator('.blueprint-preview').isVisible(),true);
        assert.equal(await result.locator('.blueprint-card .result-primary').count(),1);
        const map=result.locator('.result-primary'),designButton=result.locator(surface==='demo'?'.demo-result-design':'#clearedDesignBtn');
        assert.ok((await map.boundingBox()).y<(await result.locator('.blueprint-preview').boundingBox()).y);
        assert.equal(await map.isEnabled(),true);assert.equal(await designButton.isEnabled(),true);
        await result.locator('.blueprint-sharing summary').click();assert.equal(await result.locator('.blueprint-save').isVisible(),true);
        await result.locator('.blueprint-sharing summary').click();
        await result.locator('.cost-ranking-toggle').click();assert.equal(await result.locator('.cost-ranking').isVisible(),true);
        await result.locator('.cost-ranking-toggle').click();
        await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:360,height:780});
        assert.equal(await map.isVisible(),true);assert.ok((await map.boundingBox()).x>=0);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(out,`${surface}-${lang}-result-narrow.png`)});
        await designButton.click();assert.equal(await page.locator('#gameScreen').isVisible(),true);
        await page.locator('#gradeButton').click();await result.waitFor({state:'visible'});
        assert.equal(await result.locator('.blueprint-sharing').getAttribute('open'),null);
        await result.locator('.result-primary').click();await page.locator('#stageMapCanvas').waitFor({state:'visible'});
        assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>alerts),[]);
        report.push(`${surface}/${lang}: wire-tool completion switches mode/buttons, tutorial clicks/rollback without design/tick changes, free hints/cooldown isolation, cost, temporary errors, collapsed result/re-entry/narrow/reduced motion`);
        if(!native) {
          await page.goto(`${base}/tests/hint-harness.html?lang=${lang}`);await page.waitForFunction(()=>window.hintTestReady===true);
          await page.evaluate(()=>openTestHint(25));
          await page.waitForFunction(()=>document.getElementById('hint-step-0')?.disabled&&hintTimers.size===1);
          await page.evaluate(()=>openTestHint(6));
          assert.equal(await page.locator('#hint-step-0').isEnabled(),true);
          await page.waitForFunction(()=>document.getElementById('hint-step-1')?.disabled===false);
          assert.equal(await page.evaluate(()=>hintTimers.size),0);
          const locks=await page.evaluate(()=>hintReads.filter(path=>path.startsWith('hintLocks')).length);
          await page.locator('#hint-step-1').click();
          assert.equal(await page.evaluate(async()=>(await import('/src/modules/storage.js')).getHintProgress(6)),2);
          await page.waitForFunction(()=>hintServer['hintProgress/hint-test/stage6']===2);
          await page.evaluate(()=>openTestHint(7));await page.locator('#hint-step-0').click();
          assert.equal(await page.locator('#hint-step-1').isEnabled(),true);
          assert.equal(await page.evaluate(()=>hintReads.filter(path=>path.startsWith('hintLocks')).length),locks);
          assert.equal(await page.evaluate(()=>hintWrites.some(w=>w.path.startsWith('hintLocks'))),false);
          assert.equal(await page.evaluate(async()=>(await import('/src/modules/storage.js')).getHintCooldown()===initialCooldown),true);
          await page.evaluate(()=>document.dispatchEvent(new Event('bitwiser:stageReady')));
          assert.equal(await page.locator('#hintModal').isVisible(),false);assert.equal(await page.evaluate(()=>hintTimers.size),0);
          await page.evaluate(async()=>{
            (await import('/src/modules/storage.js')).setHintProgress(6,0);
            hintServer['hintProgress/hint-test/stage6']=2;holdHintReads=true;holdHintTransactions=true;openTestHint(6);
          });
          await page.locator('#hint-step-0').click();
          assert.equal(await page.locator('#hintMessage').isVisible(),true,'Viewing the hint must not wait for the account');
          assert.equal(await page.locator('#hint-step-1').isEnabled(),true);
          assert.equal(await page.evaluate(()=>hintServer['hintProgress/hint-test/stage6']),2,'Clicking before the account read must not reduce stored progress');
          assert.equal(await page.evaluate(()=>pendingHintReads.length),1);
          assert.equal(await page.evaluate(()=>pendingHintTransactions.length),1);
          await page.evaluate(()=>releaseHintReads());
          await page.waitForFunction(async()=>(await import('/src/modules/storage.js')).getHintProgress(6)===2);
          await page.evaluate(()=>releaseHintTransactions());
          await page.waitForFunction(()=>hintWrites.at(-1)?.path==='hintProgress/hint-test/stage6'&&hintWrites.at(-1).count===2);
          assert.equal(await page.evaluate(()=>hintServer['hintProgress/hint-test/stage6']),2);

          // Rapid clicks can complete their saves in reverse order; a stale read must not undo either save.
          await page.locator('#closeHintBtn').click();
          await page.evaluate(async()=>{
            (await import('/src/modules/storage.js')).setHintProgress(6,0);
            hintServer['hintProgress/hint-test/stage6']=0;openTestHint(6);
          });
          await page.locator('#hint-step-0').click();await page.locator('#hint-step-1').click();
          assert.equal(await page.locator('#hintMessage').isVisible(),true);
          assert.equal(await page.evaluate(()=>pendingHintTransactions.length),2);
          await page.evaluate(()=>releaseHintTransactions(true));
          await page.waitForFunction(()=>hintServer['hintProgress/hint-test/stage6']===2);
          await page.evaluate(()=>releaseHintReads());
          await page.waitForFunction(async()=>(await import('/src/modules/storage.js')).getHintProgress(6)===2);

          // A retry sees another client's higher value, and late acknowledgements cannot reopen a closed modal.
          await page.locator('#closeHintBtn').click();
          await page.evaluate(async()=>{
            (await import('/src/modules/storage.js')).setHintProgress(6,0);
            hintServer['hintProgress/hint-test/stage6']=0;openTestHint(6);
          });
          await page.locator('#hint-step-0').click();
          await page.evaluate(()=>{hintServer['hintProgress/hint-test/stage6']=2;document.dispatchEvent(new Event('bitwiser:stageReady'));releaseHintTransactions();releaseHintReads();});
          await page.waitForFunction(async()=>(await import('/src/modules/storage.js')).getHintProgress(6)===2);
          assert.equal(await page.locator('#hintModal').isVisible(),false);assert.equal(await page.evaluate(()=>hintTimers.size),0);
          assert.equal(await page.evaluate(()=>hintServer['hintProgress/hint-test/stage6']),2);
          assert.equal(await page.evaluate(()=>hintWrites.filter(w=>w.path.startsWith('hintProgress')).every(w=>w.method==='transaction')),true);
          assert.equal(await page.evaluate(()=>hintWrites.some(w=>w.path.startsWith('hintLocks'))),false);
          assert.equal(await page.evaluate(async()=>(await import('/src/modules/storage.js')).getHintCooldown()===initialCooldown),true);
          report.push(`${surface}/${lang}: signed-in remote progress retained; Chapter 1 neither reads nor writes the global account lock; other-chapter cooldown and timer cleanup retained`);
          report.push(`${surface}/${lang}: delayed account read, immediate hints during delayed saves, reversed save order, transaction retry and closed-modal acknowledgement retained monotonic progress`);
        }
        if(!native)await context.close();
      }
    } finally {await app?.close();if(server)await new Promise(resolve=>server.close(resolve));}
  }
  console.log(report.join('\n'));
} finally {await browser?.close();}
