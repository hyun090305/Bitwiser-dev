import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron } from 'playwright';
import { selfFeedbackCircuit } from '../tests/helpers/connection-circuits.mjs';

const root=path.resolve('.'), native=process.argv.includes('--electron'), passed=[];
const out=path.join(root,'test-results/block-move');await fs.mkdir(out,{recursive:true});
const browser=native?null:await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
function circuit() {
  const c={rows:12,cols:18,blocks:{},wires:{}};
  for(const [id,type,r,col] of [['a','INPUT',2,2],['en','INPUT',0,6],['d','D',2,6],['b','OUTPUT',2,10],['branch','OUTPUT',6,2],['u','INPUT',7,8],['v','OUTPUT',7,12]]) {
    c.blocks[id]={id,type,name:id,pos:{r,c:col},value:false,fixed:id==='u'};
  }
  const wire=(id,from,to,route,inputRole)=>{c.wires[id]={id,startBlockId:from,endBlockId:to,path:route.map(([r,c])=>({r,c})),...(inputRole?{inputRole}:{})};};
  wire('data','a','d',[[2,2],[2,3],[2,4],[2,5],[2,6]],'D');
  wire('enable','en','d',[[0,6],[1,6],[2,6]],'EN');
  wire('out','d','b',[[2,6],[2,7],[2,8],[2,9],[2,10]]);
  wire('branch','a','branch',[[2,2],[3,2],[4,2],[5,2],[6,2]]);
  wire('unrelated','u','v',[[7,8],[7,9],[7,10],[7,11],[7,12]]);
  return c;
}
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
      await page.goto(base+'/tests/connection-harness.html');await page.waitForFunction(()=>window.testReady);
      // Freeze a nonzero runtime to distinguish editing from advancing/resetting time.
      await page.waitForFunction(()=>testController.tickRunner.isRunning());await page.locator('[data-memory-action=play]').click();
      const read=()=>page.evaluate(()=>testRead());
      const load=async c=>{
        await page.evaluate(async c=>{
          testController.restoreCircuit(c);
          const state=(await import('/src/canvas/evaluation.js')).getExecutionState(testCircuit);
          state.tick=5;state.memory.set('d',true);testController.refreshVisuals();
        },c);
      };
      const point=(r,c)=>page.locator('#overlay').evaluate((canvas,{r,c})=>{
        const box=canvas.getBoundingClientRect();return {x:box.x+220+27+c*52,y:box.y+27+r*52};
      },{r,c});
      const beginDrag=async(from,to)=>{
        const a=await point(...from),b=await point(...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});
      };
      const drag=async(from,to)=>{await beginDrag(from,to);await page.mouse.up();};
      const assertRuntime=(actual,before)=>{assert.equal(actual.tick,before.tick);assert.deepEqual(actual.memory,before.memory);assert.deepEqual(Object.fromEntries(actual.inputs),Object.fromEntries(before.inputs));};
      const checkHistory=async(before,after)=>{
        await page.locator('#undo').click();const undone=await read();assert.deepEqual(undone.design,before.design);assertRuntime(undone,before);
        await page.locator('#redo').click();const redone=await read();assert.deepEqual(redone.design,after.design);assertRuntime(redone,before);
      };
      for(const language of ['ko','en']) {
        await page.evaluate(lang=>{window.currentLang=lang;document.documentElement.lang=lang;},language);
        for(const id of ['d','a','b']) {
          await load(circuit());const before=await read(),from=before.design.blocks[id].pos;
          await drag([from.r,from.c],[from.r+1,from.c]);const after=await read();
          const expected=structuredClone(before.design);expected.blocks[id].pos.r++;
          for(const [key,w] of Object.entries(expected.wires))if(w.startBlockId===id||w.endBlockId===id)delete expected.wires[key];
          if(id==='a')expected.wires.enable.inputRole='D'; // The existing single-input normalization after deleting D's data wire.
          assert.deepEqual(after.design,expected,`${id}: only incident wires are removed; other paths remain`);
          assertRuntime(after,before);assert.equal(after.modified,before.modified+1);await checkHistory(before,after);
        }
        passed.push(`${surface}/${language}: A → D → B single moves, D/EN/output removal, A fan-out, unrelated wire, role normalization and Undo/Redo`);

        for(const role of ['D','EN']) {
          await load(selfFeedbackCircuit(role));const before=await read();
          await drag([2,4],[3,4]);const after=await read();
          assert.deepEqual(after.design.blocks.d.pos,{r:3,c:4});assert.deepEqual(after.design.wires,{});
          assertRuntime(after,before);await checkHistory(before,after);
        }
        // A last-column destination cannot preserve the old right-facing output route.
        // Rejection notices intentionally outlive restore/Undo; isolate the next valid move.
        await page.locator('.circuit-edit-notice').waitFor({state:'hidden',timeout:5000});
        await load(circuit());const edgeBefore=await read();await drag([2,6],[11,17]);const edge=await read();
        assert.deepEqual(edge.design.blocks.d.pos,{r:11,c:17});assert.deepEqual(Object.keys(edge.design.wires).sort(),['branch','unrelated']);
        assert.equal(await page.locator('.circuit-edit-notice').isVisible(),false);assertRuntime(edge,edgeBefore);await checkHistory(edgeBefore,edge);
        passed.push(`${surface}/${language}: self-D/self-EN detach, valid edge placement succeeds without routing, runtime preserved`);

        await load(circuit());const unchanged=await read();
        await beginDrag([2,6],[3,6]);const origin=await point(2,6);await page.mouse.move(origin.x,origin.y,{steps:12});await page.mouse.up();
        assert.deepEqual(await read(),unchanged,'Returning to the original cell keeps the complete design and history');
        for(const cancel of ['Escape','touchcancel']) {
          await beginDrag([2,6],[3,6]);
          if(cancel==='Escape')await page.keyboard.press('Escape');else await page.locator('#overlay').dispatchEvent('touchcancel');
          await page.mouse.up();assert.deepEqual(await read(),unchanged);
        }
        for(const target of [[7,10],[7,8]]) {
          await drag([2,6],target);assert.deepEqual(await read(),unchanged,'A wire collision/fixed-block rejection restores position, wires, runtime and history');
        }
        passed.push(`${surface}/${language}: same-cell return, Escape/touchcancel, occupied wire/fixed block rejection restore the original state`);

        await load(circuit());const groupBefore=await read();
        await page.locator('#select').click();await drag([0,1],[6,10]);await drag([2,6],[3,7]);const groupAfter=await read();
        const shifted=structuredClone(groupBefore.design);
        for(const id of ['a','en','d','b','branch']){shifted.blocks[id].pos.r++;shifted.blocks[id].pos.c++;}
        for(const [id,w] of Object.entries(shifted.wires))if(id!=='unrelated')w.path=w.path.map(({r,c})=>({r:r+1,c:c+1}));
        assert.deepEqual(groupAfter.design,shifted);assertRuntime(groupAfter,groupBefore);await checkHistory(groupBefore,groupAfter);
        passed.push(`${surface}/${language}: group movement keeps every selected wire path/role and leaves the unrelated circuit in place`);
      }
      assert.deepEqual(errors,[]);
    } finally {
      if(!native)await context?.close();await app?.close();if(server)await new Promise(resolve=>server.close(resolve));
    }
  }
  await fs.writeFile(path.join(out,native?'electron.json':'browser.json'),JSON.stringify({passed},null,2));
  console.log(passed.join('\n'));
} finally {await browser?.close();}
