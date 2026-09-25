import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { selfFeedbackCircuit } from '../tests/helpers/connection-circuits.mjs';

const root=path.resolve('.'), passed=[], errors=[];
await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
try {
  for (const surface of ['full','demo']) {
    const files=surface==='full'?root:path.join(root,'dist-web-demo');
    const server=createServer(async(req,res)=>{
      try {
        const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const base=name.startsWith('/tests/')?root:files, file=path.resolve(base,'.'+name);
        if (!file.startsWith(base+path.sep)) {res.writeHead(403).end();return;}
        const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
        res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
      } catch {res.writeHead(404).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
    page.on('pageerror',e=>errors.push(e.message));
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    const read=()=>page.evaluate(()=>testRead());
    const rejected=async(before,pattern)=>{
      assert.deepEqual(await read(),before);
      assert.equal(await page.locator('.circuit-edit-notice').isVisible(),true);
      assert.match(await page.locator('.circuit-edit-notice').innerText(),pattern);
      assert.equal(await page.locator('.circuit-diagnostic-badge').isVisible(),before.diagnostics.length>0);
      if (!before.diagnostics.length) assert.equal(await page.locator('[data-memory-action="play"]').isEnabled(),true);
    };
    const load=c=>page.evaluate(c=>testController.restoreCircuit(c),c);
    const point=async(r,c)=>page.locator('#overlay').evaluate((canvas,{r,c})=>{
      const box=canvas.getBoundingClientRect();return {x:box.x+220+2+c*52+25,y:box.y+2+r*52+25};
    },{r,c});
    const click=async(r,c)=>{const p=await point(r,c);await page.mouse.click(p.x,p.y);};
    const draw=async route=>{
      if (await page.evaluate(()=>testController.state.mode!=='wireDrawing')) await page.locator('#wire').click();
      const a=await point(...route[0]);
      await page.mouse.move(a.x,a.y); await page.mouse.down();
      for (const cell of route.slice(1)) {const p=await point(...cell);await page.mouse.move(p.x,p.y,{steps:3});}
      await page.mouse.up();
    };
    const drag=async(from,to)=>{
      const a=await point(...from),b=await point(...to);await page.mouse.move(a.x,a.y);await page.mouse.down();
      await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
    };
    const replace=async(type,cell)=>{
      await page.locator('#move').click();
      const box=await page.locator('#overlay').boundingBox(), index=['INPUT','OUTPUT','AND','OR','NOT','JUNCTION','D'].indexOf(type);
      await page.mouse.move(box.x+100,box.y+25+index*50);await page.mouse.down();
      const p=await point(...cell);await page.mouse.move(p.x,p.y,{steps:12});await page.mouse.up();
    };
    try {
      await page.goto(base+'/tests/connection-harness.html');await page.waitForFunction(()=>window.testReady && testController.tickRunner.isRunning());
      await page.locator('[data-memory-action=play]').click(); // Keep runtime fixed during atomic edit assertions.
      for (const language of ['ko','en']) {
        await page.evaluate(language=>{window.currentLang=language;document.documentElement.lang=language;},language);
        for (const role of ['D','EN']) {
          const c=selfFeedbackCircuit(role), paths=Object.values(c.wires).sort((a,b)=>a.id==='data'?-1:b.id==='data'?1:0).map(w=>w.path.map(p=>[p.r,p.c]));
          c.wires={};await load(c);
          assert.match(await page.locator('.circuit-diagnostics').textContent(),language==='en'?/Incomplete/:/미완성/);
          for (const route of paths) await draw(route);
          const built=await read();assert.deepEqual(built.diagnostics,[]);
          const loop=Object.values(built.design.wires).find(w=>w.startBlockId===w.endBlockId);
          assert.ok(loop);assert.equal(loop.inputRole,role);
          await page.evaluate(()=>testController.tickRunner.step());assert.equal((await read()).tick,1);
          assert.equal((await read()).memory[0][1],false);
          const before=await read();await replace('NOT',[2,4]);assert.deepEqual(await read(),before);
          await rejected(before,/D/);
          await page.locator('#move').click();await drag([2,4],[3,4]);
          let moved=await read();assert.deepEqual(moved.design.blocks.d.pos,{r:3,c:4});
          const movedLoop=Object.values(moved.design.wires).find(w=>w.startBlockId===w.endBlockId);
          assert.deepEqual(movedLoop.path[0],{r:3,c:4});assert.deepEqual(movedLoop.path.at(-1),{r:3,c:4});
          assert.equal(movedLoop.inputRole,role);assert.equal(moved.tick,1);
          await page.locator('#undo').click();assert.deepEqual((await read()).design,built.design);
          await page.locator('#redo').click();assert.deepEqual((await read()).design,moved.design);
          await load(selfFeedbackCircuit(role));
          await page.evaluate(async()=>{
            (await import('/src/canvas/evaluation.js')).getExecutionState(testCircuit).memory.set('d',true);
            testCircuit.blocks.x.value=true;
          });
          const atomic=await read();
          await page.locator('#move').click();await drag([2,4],[2,0]);assert.deepEqual(await read(),atomic);
          const start=await point(2,4),end=await point(5,4);
          for (const cancel of ['escape','touchcancel']) {
            await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});
            if (cancel==='escape') await page.keyboard.press('Escape');
            else await page.locator('#overlay').dispatchEvent('touchcancel');
            await page.mouse.up();assert.deepEqual(await read(),atomic);
          }
          await load(selfFeedbackCircuit(role));
          if (role==='EN') {
            const p=await point(2,4);await page.touchscreen.tap(p.x,p.y);
            assert.equal((await read()).design.wires.loop.inputRole,'D');
            await page.locator('#undo').click();assert.equal((await read()).design.wires.loop.inputRole,'EN');
          }
          await page.locator('#select').click();await drag([0,0],[4,6]);await drag([2,4],[3,5]);
          const shifted=await read();assert.deepEqual(shifted.design.blocks.d.pos,{r:3,c:5});
          assert.deepEqual(shifted.design.wires.loop.path[0],shifted.design.wires.loop.path.at(-1));
          assert.equal(shifted.cost,role==='D'?28:31);
          await page.locator('#undo').click();
          await page.locator('#select').click();await drag([0,0],[4,6]);await page.locator('#copy').click();
          await page.locator('#paste').click();await click(6,0);
          const pasted=await read(), loops=Object.values(pasted.design.wires).filter(w=>w.startBlockId===w.endBlockId);
          assert.equal(loops.length,2);assert.equal(loops[1].inputRole,role);assert.equal(pasted.cost,2*(role==='D'?28:31)+2);
          await page.locator('#undo').click();await page.locator('#redo').click();assert.deepEqual((await read()).design,pasted.design);
          await page.locator('#select').click();await drag([6,0],[10,6]);await page.locator('#del').click();await click(8,4);
          assert.equal(Object.values((await read()).design.blocks).filter(b=>b.type==='D').length,1);
          await page.locator('#undo').click();assert.deepEqual((await read()).design,pasted.design);
          passed.push(`${surface}/${language}: draw own ${role}, tick, rejected replacement, move, copy, delete, undo/redo`);
        }
        await load(selfFeedbackCircuit());
        let before=await read();await draw([[2,4],[2,3],[2,2],[2,1],[2,0]]);assert.deepEqual(await read(),before);
        await rejected(before,language==='en'?/INPUT.*cannot receive/:/INPUT.*연결할 수 없습니다/);
        await draw([[0,4],[0,3],[0,2],[0,1],[0,0],[1,0],[2,0]]);assert.deepEqual(await read(),before);
        await rejected(before,language==='en'?/OUTPUT.*cannot start/:/OUTPUT.*시작할 수 없습니다/);
        const notice=await page.locator('.circuit-edit-notice').innerText();
        const repeatedNoticeUpdates=await page.evaluate(()=>new Promise(resolve=>{
          let changes=0;const observer=new MutationObserver(records=>{changes+=records.length;});
          observer.observe(document.querySelector('.circuit-edit-notice'),{childList:true,attributes:true,characterData:true,subtree:true});
          requestAnimationFrame(()=>requestAnimationFrame(()=>{observer.disconnect();resolve(changes);}));
        }));
        assert.equal(repeatedNoticeUpdates,0);
        assert.equal(await page.locator('.circuit-edit-notice').innerText(),notice);
        await draw([[2,4],[2,3],[2,4]]);assert.deepEqual(await read(),before);
        await replace('OUTPUT',[2,4]);assert.deepEqual(await read(),before);
        await replace('INPUT',[2,4]);assert.deepEqual(await read(),before);
        // Imported violations are retained across unrelated edits and repaired a wire at a time.
        const invalid=selfFeedbackCircuit('EN');invalid.wires.data.inputRole='EN';await load(invalid);
        before=await read();assert.equal(before.diagnostics[0].code,'INVALID_D_ROLES');
        await replace('NOT',[7,10]);assert.equal((await read()).design.wires.data.inputRole,'EN');
        await page.locator('#undo').click();assert.deepEqual((await read()).design,before.design);
        await page.locator('#del').click();await click(2,2);
        assert.equal((await read()).design.wires.loop.inputRole,'D');assert.equal((await read()).diagnostics.length,0);
        await page.locator('#undo').click();assert.equal((await read()).diagnostics[0].code,'INVALID_D_ROLES');
        assert.match(await page.locator('.circuit-diagnostics').textContent(),language==='en'?/invalid D\/EN/:/역할 배정/);
        await page.screenshot({path:`test-results/connections-${surface}-${language}.png`});
        passed.push(`${surface}/${language}: direction, same-face return, atomic failure, imported roles and repair diagnostics`);
        // Copy a real IN->OUT fragment, then validate after connector merging.
        const fragment={rows:12,cols:18,blocks:{a:{id:'a',type:'INPUT',name:'a',pos:{r:0,c:0}},b:{id:'b',type:'OUTPUT',name:'b',pos:{r:0,c:2}}},
          wires:{w:{id:'w',startBlockId:'a',endBlockId:'b',path:[{r:0,c:0},{r:0,c:1},{r:0,c:2}]}}};
        await load(fragment);await page.locator('#select').click();await drag([0,0],[0,2]);await page.locator('#copy').click();
        for (const kind of ['OUTPUT_SOURCE','INPUT_TARGET','CYCLE','EXCESS']) {
          const target={rows:12,cols:18,blocks:{a:{id:'a',type:kind==='OUTPUT_SOURCE'?'OUTPUT':'JUNCTION',pos:{r:6,c:0}},b:{id:'b',type:kind==='INPUT_TARGET'?'INPUT':'JUNCTION',pos:{r:6,c:2}}},wires:{}};
          if (kind==='CYCLE') target.wires.old={id:'old',startBlockId:'b',endBlockId:'a',path:[[6,2],[5,2],[4,2],[4,1],[4,0],[5,0],[6,0]].map(([r,c])=>({r,c}))};
          if (kind==='EXCESS') {
            target.blocks.x={id:'x',type:'INPUT',pos:{r:8,c:2}};
            target.wires.old={id:'old',startBlockId:'x',endBlockId:'b',path:[[8,2],[7,2],[6,2]].map(([r,c])=>({r,c}))};
          }
          await load(target);const prior=await read();await page.locator('#paste').click();await click(6,0);assert.deepEqual(await read(),prior,kind);
          await rejected(prior,language==='en'?/Edit rejected:/:/편집 거부:/);
          await page.keyboard.press('Escape');assert.deepEqual(await read(),prior);
          assert.equal(await page.locator('.circuit-edit-notice').isVisible(),true);
        }
        // Replacing two-input AND cannot silently drop inputs to fit NOT/IN/OUT.
        const binary=selfFeedbackCircuit('EN');binary.blocks.d.type='AND';delete binary.wires.loop;
        binary.blocks.y={id:'y',type:'INPUT',name:'y',pos:{r:2,c:8}};
        binary.wires.second={id:'second',startBlockId:'y',endBlockId:'d',path:[[2,8],[2,7],[2,6],[2,5],[2,4]].map(([r,c])=>({r,c}))};
        binary.blocks.z={id:'z',type:'INPUT',name:'z',pos:{r:6,c:4}};
        await load(binary);const prior=await read();
        for (const type of ['NOT','INPUT','OUTPUT']) {
          await replace(type,[2,4]);await rejected(prior,language==='en'?/Edit rejected:/:/편집 거부:/);
        }
        await draw([[6,4],[5,4],[4,4],[3,4],[2,4]]);
        await rejected(prior,language==='en'?/AND.*at most 2/:/AND.*최대 2/);
        // Replacing D in a valid D->NOT->D circuit must explain the new cycle.
        const cycle=selfFeedbackCircuit();
        cycle.blocks.n={id:'n',type:'NOT',pos:{r:2,c:8}};delete cycle.wires.loop;
        cycle.wires.forward={id:'forward',startBlockId:'d',endBlockId:'n',path:[[2,4],[2,5],[2,6],[2,7],[2,8]].map(([r,c])=>({r,c}))};
        cycle.wires.back={id:'back',startBlockId:'n',endBlockId:'d',inputRole:'D',path:[[2,8],[3,8],[4,8],[4,7],[4,6],[4,5],[4,4],[3,4],[2,4]].map(([r,c])=>({r,c}))};
        await load(cycle);
        await page.evaluate(async()=>{
          const state=(await import('/src/canvas/evaluation.js')).getExecutionState(testCircuit);
          state.memory.set('d',true);state.tick=3;testCircuit.blocks.x.value=true;
        });
        const cycleBefore=await read();await replace('JUNCTION',[2,4]);
        await rejected(cycleBefore,language==='en'?/feedback path must pass through D/:/피드백 경로가 D를 통과/);
        await page.screenshot({path:`test-results/rejected-edit-${surface}-${language}.png`});
        await page.keyboard.press('Escape');
        await load(selfFeedbackCircuit());assert.equal(await page.locator('.circuit-edit-notice').isVisible(),true);
        passed.push(`${surface}/${language}: connector merge rejects directions/cycle/excess; binary replacement preserves all inputs`);
        passed.push(`${surface}/${language}: bilingual rejected-edit reasons, runtime/palette/history unchanged, separate evaluation state and notice retained across cancel/restore`);
      }
    } finally {await page.close();await new Promise(resolve=>server.close(resolve));}
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/connections-browser.json',JSON.stringify({passed,errors},null,2));
  console.log(JSON.stringify({passed,errors},null,2));
} finally {await browser.close();}
