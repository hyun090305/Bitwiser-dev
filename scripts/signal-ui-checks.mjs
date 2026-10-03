import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatBlockLabels } from '../src/blockLabel.js';

const aliases = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/signal-aliases.json', import.meta.url), 'utf8'));
const numberedLabels = {
  1: [['IN1','IN₁'], ['OUT1','OUT₁']],
  33: [['L1','L₁'], ['L0','L₀']],
  46: [['Q2','Q₂'], ['R1','R₁']]
};

// Runs against the actual web/demo/Electron entry after the intro layout checks.
export async function verifySignalSurfaces(page, { ids, surface, lang, out }) {
  await page.setViewportSize({ width:1440, height:980 });
  await page.evaluate(async surface => {
    (await import('./src/modules/levels.js')).configureLevelModule({canStartLevel:()=>true});
    window.signalDraws = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    const click = HTMLAnchorElement.prototype.click;
    window.restoreSignalCapture = () => {
      CanvasRenderingContext2D.prototype.fillText = fill;
      HTMLAnchorElement.prototype.click = click;
    };
    // Electron doesn't emit Playwright's browser download event. Capture the
    // actual encoded link instead of opening an OS save dialog during tests.
    if (surface === 'electron') HTMLAnchorElement.prototype.click = function() {
      if (this.download && this.href.startsWith('blob:')) {
        fetch(this.href).then(r=>r.arrayBuffer()).then(bytes=>{
          window.signalDownload = {size:bytes.byteLength,signature:String.fromCharCode(...new Uint8Array(bytes).slice(0,6))};
        });
      } else click.call(this);
    };
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (window.captureSignals) {
        const point = this.getTransform().transformPoint(new DOMPoint(args[0], args[1]));
        const bounds = this.canvas.getBoundingClientRect();
        window.signalDraws.push({ text:String(text), attached:this.canvas.isConnected, canvas:this.canvas.id,
          x:bounds.x + point.x * bounds.width / this.canvas.width, y:bounds.y + point.y * bounds.height / this.canvas.height });
      }
      return fill.call(this, text, ...args);
    };
  }, surface);
  try {
    for (const id of ids.filter(id => id === 1 || aliases[id])) {
      await page.evaluate(async id => {
        window.signalDraws = []; window.captureSignals = true;
        await (await import('./src/modules/levels.js')).startLevel(id);
      }, id);
      await page.locator('#startLevelBtn').click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const palette = await page.evaluate(async () => {
        signalDraws = [];
        (await import('./src/modules/grid.js')).getPlayController().refreshVisuals();
        return signalDraws.filter(d=>d.canvas==='bgCanvas');
      });
      for (const [plain, block] of numberedLabels[id] || []) {
        const target = palette.find(d=>d.text===block);
        assert.ok(target, `${surface}/${lang}/${id}: literal palette label ${block}`);
        await page.mouse.move(target.x, target.y);
        assert.equal(await page.locator('.palette-cost-tooltip:not([hidden]) span').innerText(), plain);
      }
      const observed = await page.evaluate(async ({id,surface}) => {
        const levels = await import('./src/modules/levels.js');
        const grid = await import('./src/modules/grid.js');
        const { snapshotCircuit } = await import('./src/canvas/circuitData.js');
        const validateRecord = surface === 'demo' ? record => record : (await import('./src/modules/savedCircuitRecord.js')).validateSavedCircuitRecord;
        const controller = grid.getPlayController();
        const rawPorts = levels.getLoadedStageData().levelBlockSets[id].filter(b => ['INPUT','OUTPUT'].includes(b.type));
        const circuit = snapshotCircuit(controller.circuit);
        circuit.wires = {};
        circuit.blocks = Object.fromEntries(rawPorts.map((b,i) => [`port${i}`, {
          ...b, id:`port${i}`, pos:{r:1+Math.floor(i/(circuit.cols-2)),c:1+i%(circuit.cols-2)}, value:false
        }]));
        const original = JSON.stringify(snapshotCircuit(circuit));
        const restored = [];
        for (const version of (surface === 'demo' ? [3] : [2,3])) {
          signalDraws = [];
          controller.restoreCircuit(validateRecord({version,stageId:id,circuit}).circuit);
          controller.refreshVisuals();
          restored.push({ labels:signalDraws.map(d => d.text), design:JSON.stringify(snapshotCircuit(controller.circuit)) });
        }
        const { createGradingResultView } = await import('./src/modules/gradingResultView.js');
        const trace = [
          {type:'set',inputs:rawPorts.filter(b=>b.type==='INPUT').map(b=>({signal:b.name,value:1}))},
          {type:'expect',outputs:rawPorts.filter(b=>b.type==='OUTPUT').map(b=>({signal:b.name,actual:0,expected:1,passed:false})),observation:'after_tick'}
        ];
        const rawTrace = JSON.stringify(trace);
        const view = createGradingResultView({getCircuit:()=>controller.circuit});
        view.show({ok:false,status:'fail',trace},{stage:id});
        const traceLabels = [...document.querySelectorAll('dialog.grading-result-overlay[open] .trace-signal__name')].map(n=>n.textContent);
        view.close();
        const output = Object.values(controller.circuit.blocks).find(b=>b.type==='OUTPUT');
        view.show({ok:false,status:'invalid',diagnostics:[{blockId:output.id,message:`OUTPUT ${output.name}: missing input.`,messageEn:`OUTPUT ${output.name}: missing input.`}]},{stage:id});
        const diagnostic = document.querySelector('dialog.grading-result-overlay[open] .grading-result-message').textContent;
        view.destroy();
        window.signalDraft = snapshotCircuit(controller.circuit);
        window.captureSignals = false;
        return {stageId:controller.stageId, restored, original, ports:rawPorts, traceLabels, diagnostic,
          traceUnchanged:rawTrace===JSON.stringify(trace), fixed:Boolean(levels.getLoadedStageData().levelFixedIO[id]?.fixIO)};
      }, {id,surface});
      const context = `${surface}/${lang}/${id}`;
      assert.equal(observed.stageId, id, context);
      assert.ok(observed.traceUnchanged, context);
      assert.deepEqual(observed.traceLabels, ['INPUT','OUTPUT'].flatMap(type => observed.ports.filter(b=>b.type===type).map(b=>aliases[id]?.[b.name] || b.name)), context);
      assert.doesNotMatch(observed.traceLabels.join(' ') + observed.diagnostic, /[₀-₉]/);
      for (const restored of observed.restored) {
        assert.equal(restored.design, observed.original, `${context}: saved raw design preserved`);
        for (const [raw, label] of Object.entries(aliases[id] || {})) {
          assert.ok(restored.labels.includes(formatBlockLabels(label)), `${context}: restored block ${label}`);
          assert.ok(!restored.labels.includes(formatBlockLabels(raw)), `${context}: obsolete block ${raw}`);
          if (!observed.fixed) assert.ok(palette.some(d=>d.text===formatBlockLabels(label)), `${context}: palette ${label}`);
        }
        for (const [, block] of numberedLabels[id] || []) assert.ok(restored.labels.includes(block), `${context}: literal block ${block}`);
      }
      const firstOutput = observed.ports.find(b=>b.type==='OUTPUT').name;
      assert.ok(observed.diagnostic.includes(aliases[id]?.[firstOutput] || firstOutput), `${context}: diagnostic`);

      // Manual export uses the stage captured from the actual active controller.
      await page.evaluate(async ({surface,id,lang}) => {
        window.signalDraws = []; window.captureSignals = true;
        if (surface === 'demo') document.getElementById('demoShareBtn').click();
        else (await import('./src/modules/circuitShare.js')).handleGIFExport();
      }, {surface,id,lang});
      await page.locator('.blueprint-export .blueprint-share[data-state="ready"]').waitFor();
      const pngLabels = await page.evaluate(() => signalDraws.filter(d=>!d.attached).map(d=>d.text));
      for (const label of Object.values(aliases[id] || {})) assert.ok(pngLabels.join('').includes(formatBlockLabels(label)), `${context}: PNG ${label}`);
      for (const [, block] of numberedLabels[id] || []) assert.ok(pngLabels.includes(block), `${context}: literal PNG block ${block}`);
      if ([10,37,39,46].includes(id)) await page.screenshot({path:`${out}/${surface}-${lang}-signals-${id}.png`});
      // The saved GIF uses the same frozen stage context as the PNG preview.
      await page.evaluate(() => { window.signalDraws = []; window.signalDownload = null; });
      const download = surface === 'electron' ? null : page.waitForEvent('download');
      await page.locator('.blueprint-gif').click();
      if (download) {
        const file = await download;
        assert.equal(await file.failure(), null, `${context}: GIF download`);
      } else {
        await page.waitForFunction(()=>window.signalDownload);
        const file = await page.evaluate(()=>signalDownload);
        assert.match(file.signature,/^GIF8[79]a$/); assert.ok(file.size>6, `${context}: encoded GIF link`);
      }
      const gifLabels = await page.evaluate(() => signalDraws.filter(d=>!d.attached).map(d=>d.text));
      for (const label of Object.values(aliases[id] || {})) assert.ok(gifLabels.includes(formatBlockLabels(label)), `${context}: GIF ${label}`);
      for (const [, block] of numberedLabels[id] || []) assert.ok(gifLabels.includes(block), `${context}: literal GIF block ${block}`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => { window.captureSignals = false; });
    }
    if (surface !== 'demo') {
      const isolated = await page.evaluate(async () => {
        const levels = await import('./src/modules/levels.js');
        const grid = await import('./src/modules/grid.js');
        const { createBlueprintPng } = await import('./src/canvas/blueprintExport.js');
        const { createCircuitGif } = await import('./src/canvas/gifExport.js');
        const { snapshotCircuit } = await import('./src/canvas/circuitData.js');
        const { applyTraceEvent } = await import('./src/canvas/tracePlayback.js');
        const { renderContent } = await import('./src/canvas/renderer.js');
        const draft = {rows:6,cols:6,blocks:{i:{id:'i',type:'INPUT',name:'IN1',value:false,pos:{r:1,c:1}},o:{id:'o',type:'OUTPUT',name:'OUT1',value:false,pos:{r:1,c:3}}},
          wires:{w:{id:'w',startBlockId:'i',endBlockId:'o',path:[{r:1,c:1},{r:1,c:2},{r:1,c:3}]}}};
        let release;
        Object.defineProperty(document.fonts,'ready',{configurable:true,value:new Promise(resolve=>{release=resolve;})});
        const pending = createBlueprintPng({circuit:draft,title:'IN1 OUT1 tick 10',stageId:9});
        await levels.startLevel(37); // Another official context while PNG awaits fonts.
        signalDraws=[]; captureSignals=true;
        release(); await pending; delete document.fonts.ready;
        const png=signalDraws.filter(d=>!d.attached).map(d=>d.text);
        signalDraws=[];
        const gif = createCircuitGif(draft,{stageId:9,caption:'IN1 OUT1 tick 10'});
        await levels.startLevel(46);
        await gif;
        const gifLabels=signalDraws.filter(d=>!d.attached).map(d=>d.text);
        signalDraws=[];
        applyTraceEvent(draft,{type:'expect',outputs:[{signal:'OUT1',actual:0,expected:1,passed:false}]});
        const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;
        renderContent(canvas.getContext('2d'),draft,0,0,null,null,{stageId:9});
        const overlay=signalDraws.map(d=>d.text);
        signalDraws=[];
        renderContent(canvas.getContext('2d'),draft,0,0,null,null,{});
        const plainOverlay=signalDraws.map(d=>d.text);
        // Custom setup and Lab use no official-stage context, even after stage 46.
        const custom=await grid.setupGrid('canvasContainer',6,6,levels.buildPaletteGroups([{type:'INPUT',name:'IN1'},{type:'OUTPUT',name:'OUT1'}]),{deferPlayback:true});
        custom.restoreCircuit(snapshotCircuit(draft)); signalDraws=[];custom.refreshVisuals();
        const customLabels=signalDraws.map(d=>d.text), customStage=custom.stageId;
        document.getElementById('startLevelBtn').click();
        const lab=await import('./src/modules/labMode.js');
        lab.openLabModeFromShortcut();
        const controller=lab.getLabController(); controller.restoreCircuit(snapshotCircuit(draft));
        signalDraws=[];controller.refreshVisuals();
        const labLabels=signalDraws.map(d=>d.text), labStage=controller.stageId;
        captureSignals=false;
        return {png,gifLabels,overlay,plainOverlay,customLabels,customStage,labLabels,labStage};
      });
      for (const labels of [isolated.png,isolated.gifLabels]) {
        assert.ok(labels.includes('A') && labels.includes('SUM'), `${surface}: captured export stage survives navigation`);
        assert.ok(!labels.includes('IN₁') && !labels.includes('OUT₁'));
        assert.ok(labels.includes('IN1 OUT1 tick 10'), `${surface}: export caption uses ordinary digits`);
      }
      assert.ok(isolated.overlay.some(s=>s.startsWith('SUM  ') && s.includes('✕')), `${surface}: playback overlay aliases`);
      assert.ok(isolated.plainOverlay.includes('OUT1  0 ✕') && isolated.plainOverlay.includes('OUT₁'), `${surface}: plain playback text alongside subscript block`);
      assert.equal(isolated.customStage,null); assert.equal(isolated.labStage,null);
      for (const labels of [isolated.customLabels,isolated.labLabels]) assert.ok(labels.includes('IN₁') && labels.includes('OUT₁'), `${surface}: custom/Lab names`);
      // Lab export must use the Lab circuit, not the retained official controller.
      await page.evaluate(async () => { signalDraws=[];captureSignals=true;(await import('./src/modules/circuitShare.js')).handleGIFExport(); });
      await page.locator('.blueprint-export .blueprint-share[data-state="ready"]').waitFor();
      const labels=await page.evaluate(()=>signalDraws.filter(d=>!d.attached).map(d=>d.text));
      assert.ok(labels.includes('IN₁') && labels.includes('OUT₁'), `${surface}: Lab PNG uses block typography without official aliases`);
      await page.keyboard.press('Escape');
      await page.locator('#labExitBtn').click();
      await page.waitForFunction(()=>!document.body.classList.contains('lab-mode-active'));
    }
  } finally {
    await page.evaluate(()=>{ window.captureSignals=false;window.restoreSignalCapture(); });
  }
}
