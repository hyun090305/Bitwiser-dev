import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron } from 'playwright';
import { selfFeedbackCircuit } from '../tests/helpers/connection-circuits.mjs';

const root=path.resolve('.'), native=process.argv.includes('--electron'), passed=[];
const out=path.join(root,'test-results/wire-drag');await fs.mkdir(out,{recursive:true});
const browser=native?null:await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const block=(id,type,r,c)=>({id,type,name:id,pos:{r,c},value:false});
const circuit=()=>({rows:12,cols:18,blocks:{a:block('a','INPUT',4,2),n:block('n','NOT',4,6),b:block('b','OUTPUT',4,10),d:block('d','D',9,15)},wires:{}});
const wire=(id,from,to,route)=>({id,startBlockId:from,endBlockId:to,path:route.map(([r,c])=>({r,c}))});
try {
  for(const surface of native?['electron']:['full','demo']) {
    let server,app,context;
    try {
      if(native) {
        const env={...process.env,BITWISER_TEST_PROFILE:await fs.mkdtemp(path.join(out,'profile-')),BITWISER_TEST_VISIBLE:'1'};delete env.ELECTRON_RUN_AS_NODE;
        app=await _electron.launch({args:[path.join(root,'scripts/electron-save-test-entry.cjs')],env});context=app.context();
      } else {
        const files=surface==='demo'?path.join(root,'dist-web-demo'):root;
        server=createServer(async(req,res)=>{
          try {
            const name=new URL(req.url,'http://localhost').pathname,base=name.startsWith('/tests/')?root:files,file=path.resolve(base,'.'+name);
            if(!file.startsWith(base+path.sep))return res.writeHead(403).end();
            const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
            res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
          } catch {res.writeHead(404).end();}
        });
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,serviceWorkers:'block'});
      }
      const base=native?'app://bitwiser':`http://127.0.0.1:${server.address().port}`;
      if(!native)await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
      const page=native?await app.firstWindow():await context.newPage(),errors=[];
      if(native)await page.waitForURL('app://bitwiser/index.html');
      page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1000});
      await page.goto(base+'/tests/connection-harness.html');await page.waitForFunction(()=>window.testReady && testController.tickRunner.isRunning());
      await page.locator('[data-memory-action=play]').click();
      const read=()=>page.evaluate(()=>testRead());
      const load=async c=>{
        await page.evaluate(async c=>{
          testController.restoreCircuit(c);
          const state=(await import('/src/canvas/evaluation.js')).getExecutionState(testCircuit);
          state.tick=5;state.memory.set('d',true);testController.refreshVisuals();
        },c);
      };
      const point=(r,c)=>page.locator('#overlay').evaluate((canvas,{r,c})=>{
        const box=canvas.getBoundingClientRect();
        if(window.testCamera){const p=testCamera.cellToScreenCell({r,c}),half=25*testCamera.getScale();return {x:box.x+p.x+half,y:box.y+p.y+half};}
        return {x:box.x+220+27+c*52,y:box.y+27+r*52};
      },{r,c});
      const begin=async route=>{
        if(await page.evaluate(()=>testController.state.mode!=='wireDrawing'))await page.locator('#wire').click();const p=await point(...route[0]);await page.mouse.move(p.x,p.y);await page.mouse.down();
        for(const cell of route.slice(1)){const p=await point(...cell);await page.mouse.move(p.x,p.y);}
      };
      const runtime=(actual,before)=>{
        assert.equal(actual.tick,before.tick);assert.deepEqual(actual.memory,before.memory);assert.deepEqual(actual.inputs,before.inputs);
      };
      const connected=async(before,from='a',to='n')=>{
        const after=await read(),added=Object.values(after.design.wires).filter(w=>!before.design.wires[w.id]);
        assert.equal(added.length,1,'Exactly one wire is committed');const w=added[0];
        assert.equal(w.startBlockId,from);assert.equal(w.endBlockId,to);
        assert.deepEqual(w.path[0],after.design.blocks[from].pos);assert.deepEqual(w.path.at(-1),after.design.blocks[to].pos);
        for(let i=1;i<w.path.length;i++)assert.equal(Math.abs(w.path[i].r-w.path[i-1].r)+Math.abs(w.path[i].c-w.path[i-1].c),1);
        runtime(after,before);assert.equal(after.modified,before.modified+1);
        await page.locator('#undo').click();const undone=await read();assert.deepEqual(undone.design,before.design);runtime(undone,before);assert.equal(undone.undo,before.undo);
        await page.locator('#redo').click();assert.deepEqual((await read()).design,after.design);
        return w;
      };
      for(const language of ['ko','en']) {
        await page.evaluate(lang=>{window.currentLang=lang;document.documentElement.lang=lang;},language);
        await load(circuit());let before=await read();
        await begin([[4,2],[4,3],[4,4],[4,5],[4,6],[4,7],[4,10]]);
        assert.deepEqual(await read(),before,'Reaching a block keeps a preview until release');
        assert.deepEqual(await page.evaluate(()=>testController.state.wireTrace.at(-1)),{r:4,c:6},`${surface}/${language}: target preview`);
        await page.mouse.up();await connected(before);
        passed.push(`${surface}/${language}: overshoot stops at the first block; release commits once; Undo/Redo and Q/tick/button state preserved`);

        for(const [start,end,past] of [
          [[4,2],[4,6],[4,11]],[[4,10],[4,6],[4,0]],[[2,6],[6,6],[10,6]],[[9,6],[5,6],[1,6]],
          [[2,2],[6,6],[8,8]],[[8,8],[4,4],[2,2]]
        ]) {
          const c=circuit();delete c.blocks.b;c.blocks.a.pos={r:start[0],c:start[1]};c.blocks.n.pos={r:end[0],c:end[1]};
          await load(c);before=await read();await begin([start,past]);await page.mouse.up();await connected(before);
        }
        // Missing move events at release and a jump outside the canvas must still hit an intervening target.
        for(const mode of ['outside','release-only','touch']) {
          await load(circuit());before=await read();const a=await point(4,2),b=await point(4,20);
          await page.locator('#wire').click();
          if(mode==='touch') {
            await page.locator('#overlay').evaluate((canvas,{a,b})=>{
              const send=(type,p)=>{const touch=new Touch({identifier:1,target:canvas,clientX:p.x,clientY:p.y});canvas.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));};
              send('touchstart',a);send('touchmove',b);send('touchend',b);
            },{a,b});
          } else {
            await page.mouse.move(a.x,a.y);await page.mouse.down();
            if(mode==='outside')await page.mouse.move(b.x,b.y);
            else await page.locator('body').dispatchEvent('mouseup',{clientX:b.x,clientY:b.y,button:0});
            await page.mouse.up();
          }
          await connected(before);
        }
        passed.push(`${surface}/${language}: sparse horizontal/vertical/diagonal events, mouse/touch overshoot outside, final release position`);

        for(const cancel of ['Escape','touchcancel']) {
          await load(circuit());before=await read();await begin([[4,2],[4,10]]);
          if(cancel==='Escape')await page.keyboard.press('Escape');else await page.locator('#overlay').dispatchEvent('touchcancel');
          await page.mouse.up();assert.deepEqual(await read(),before);
        }
        for(const [kind,ko,en] of [
          ['input',/INPUT.*연결할 수 없습니다/,/INPUT.*cannot receive/],
          ['full',/최대 1/,/at most 1/],
          ['adjacent',/빈 칸이 하나/,/one empty cell/],
          ['overlap',/기존 도선과 겹칠/,/overlap an existing wire/],
          ['outside',/격자 안/,/inside the grid/]
        ]) {
          const c=circuit();
          if(kind==='input')c.blocks.n.type='INPUT';
          if(kind==='adjacent')c.blocks.n.pos.c=3;
          if(kind==='full'){c.blocks.x=block('x','INPUT',2,6);c.wires.old=wire('old','x','n',[[2,6],[3,6],[4,6]]);}
          if(kind==='overlap'){c.blocks.x=block('x','INPUT',2,4);c.blocks.y=block('y','OUTPUT',6,4);c.wires.old=wire('old','x','y',[[2,4],[3,4],[4,4],[5,4],[6,4]]);}
          if(kind==='outside'){delete c.blocks.n;delete c.blocks.b;}
          await load(c);before=await read();await begin([[4,2],[4,20]]);await page.mouse.up();
          assert.deepEqual(await read(),before,kind);assert.match(await page.locator('.circuit-edit-notice').innerText(),language==='ko'?ko:en);
        }
        passed.push(`${surface}/${language}: Escape/touchcancel are atomic; invalid first target, capacity, adjacency, interpolated wire collision and incomplete outside stroke retain specific errors`);

        // Sparse closed loops must retain the D/EN role, including returning through the original D block.
        for(const role of ['D','EN']) {
          const c=selfFeedbackCircuit(role);delete c.wires.loop;await load(c);before=await read();
          await begin([[2,4],[2,6],[4,6],[4,4],[1,4]]);await page.mouse.up();
          assert.equal((await connected(before,'d','d')).inputRole,role);
        }
        passed.push(`${surface}/${language}: fast D self-feedback preserves D/EN roles`);
      }
      for(const unbounded of [false,true]) {
        await page.evaluate(async unbounded=>{
          testController.destroy();
          const {createCamera}=await import('/src/canvas/camera.js');
          const {createController}=await import('/src/canvas/controller.js');
          window.testCamera=createCamera();const el=id=>document.getElementById(id);
          window.testController=createController({bgCanvas:el('bg'),contentCanvas:el('content'),overlayCanvas:el('overlay')},testCircuit,{
            wireMoveInfo:el('move'),wireStatusInfo:el('wire'),undoButton:el('undo'),redoButton:el('redo')
          },{executionMode:'sequential',panelWidth:220,palette:['INPUT','OUTPUT','AND','OR','NOT','JUNCTION','D'],
            camera:testCamera,unboundedGrid:unbounded,deferPlayback:true,onCircuitModified:()=>testModified++});
          testCamera.setScale(unbounded?0.65:1.3);testCamera.pan(unbounded?240:-80,unbounded?160:-40);
        },unbounded);
        const c=circuit(),start=unbounded?[-3,-3]:[4,2],target=unbounded?[-3,1]:[4,6],past=unbounded?[-3,6]:[4,10];
        c.blocks.a.pos={r:start[0],c:start[1]};c.blocks.n.pos={r:target[0],c:target[1]};delete c.blocks.b;
        await load(c);const before=await read();await begin([start,past]);await page.mouse.up();await connected(before);
        passed.push(`${surface}: fast overshoot with camera zoom/pan (${unbounded?'unbounded negative cells':'bounded grid'})`);
      }
      assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`${surface}.png`)});
    } finally {if(context&&!native)await context.close();if(app)await app.close();if(server)await new Promise(resolve=>server.close(resolve));}
  }
} finally {if(browser)await browser.close();}
await fs.writeFile(path.join(out,native?'electron.json':'browser.json'),JSON.stringify({passed},null,2));
console.log(JSON.stringify({passed},null,2));
