import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

// Optional baseline captures use the same app, circuits, camera and phase.
// Only the two visual modules are served from the requested Git revision.
const baseline = process.env.CIRCUIT_VISUAL_BASE;
const output = `test-results/circuit-visuals/${baseline ? 'before' : 'after'}`;
await fs.mkdir(output, { recursive: true });
const root = path.resolve('.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };
const overrides = new Map(baseline ? ['src/canvas/renderer.js', 'src/themes.js'].map(file =>
  [file, execFileSync('git', ['show', `${baseline}:${file}`])]) : []);
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/visuals.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<script src="gif.js"></script><body style="margin:0;background:#0f172a;color:#e2e8f0;font:14px sans-serif"></body>');
      return;
    }
    const file = path.resolve(root, '.' + (name.endsWith('/') ? `${name}index.html` : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const key = path.relative(root, file).replaceAll(path.sep, '/').replace(/^dist-web-demo\//, '');
    let body = overrides.get(key) || await fs.readFile(file);
    // Test-only access to the real Lab camera/controller; never shipped in src/.
    if (key === 'src/modules/labMode.js') body = `${body}\nwindow.visualLab = () => ({ labController, labCamera, labCircuit });`;
    if (key === 'src/modules/problemEditor.js') body = `${body}\nwindow.visualOpenProblem = enterProblemScreen;`;
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = { baseline: baseline || null, checks: [] };
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'ko');
    localStorage.setItem('bitwiserTheme', 'midnight-neon');
    localStorage.setItem('autoSaveCircuit', 'false');
  });
  await page.goto(`${base}/visuals.html`);
  const rendering = await page.evaluate(async baseline => {
    const { drawGrid, renderContent, drawWire, setupCanvas } = await import('/src/canvas/renderer.js');
    const { createCamera } = await import('/src/canvas/camera.js');
    const { getAvailableThemes } = await import('/src/themes.js');
    const { getExecutionState, tickCircuit } = await import('/src/canvas/evaluation.js');
    const check = (value, message) => { if (!value) throw new Error(message); };
    const circuit = { rows: 7, cols: 12, blocks: {}, wires: {} };
    const block = (id, type, r, c, value = false, inputMode) => {
      circuit.blocks[id] = { id, type, name: type === 'INPUT' ? 'IN1' : type === 'OUTPUT' ? 'OUT1' : type,
        pos: { r, c }, value, ...(inputMode ? { inputMode } : {}) };
    };
    const wire = (id, start, end, coords, inputRole) => {
      circuit.wires[id] = { id, startBlockId: start, endBlockId: end,
        path: coords.map(([r, c]) => ({ r, c })), ...(inputRole ? { inputRole } : {}) };
    };
    block('data', 'INPUT', 3, 0, true);
    block('enable', 'INPUT', 0, 4, true, 'button');
    block('memory', 'D', 3, 4);
    block('fork', 'JUNCTION', 3, 7);
    block('out', 'OUTPUT', 3, 11);
    block('not', 'NOT', 6, 7);
    block('out2', 'OUTPUT', 6, 11);
    circuit.blocks.enable.name = 'IN2'; circuit.blocks.out2.name = 'OUT2';
    wire('dataWire', 'data', 'memory', [[3,0],[3,1],[3,2],[3,3],[3,4]], 'D');
    wire('enableWire', 'enable', 'memory', [[0,4],[1,4],[2,4],[3,4]], 'EN');
    wire('q', 'memory', 'fork', [[3,4],[3,5],[3,6],[3,7]]);
    wire('branch1', 'fork', 'out', [[3,7],[3,8],[3,9],[3,10],[3,11]]);
    wire('branch2', 'fork', 'not', [[3,7],[4,7],[5,7],[6,7]]);
    wire('inverted', 'not', 'out2', [[6,7],[6,8],[6,9],[6,10],[6,11]]);
    check(tickCircuit(circuit).ok, 'memory scene must be valid');
    circuit.blocks.enable.value = true;
    window.visualCircuit = circuit;
    const state = getExecutionState(circuit);
    const snapshot = () => JSON.stringify({ circuit, state }, (_, v) => v instanceof Map ? [...v] : v);
    const before = snapshot();
    const checks = [];
    function canvas(id, width = 626, height = 366) {
      const c = document.createElement('canvas'); c.id = id;
      document.body.append(c);
      return setupCanvas(c, width, height);
    }
    const ctx = canvas('scene');
    drawGrid(ctx, circuit.rows, circuit.cols);
    renderContent(ctx, circuit, 7, 0, null, null, { preserveExisting: true });
    const capture = ctx.canvas.toDataURL();
    const portCtx = canvas('ports', 1000, 500);
    const matrix = { rows: 9, cols: 19, blocks: {}, wires: {} };
    const directions = [[0,-1],[-1,0],[0,1],[1,0]];
    // All four sides with D and EN together, including adjacent block names.
    for (let i = 0; i < 4; i++) {
      const pos = { r: 2, c: 2 + 5 * i }, id = `d${i}`;
      matrix.blocks[id] = { id, type: 'D', pos, value: i % 2 === 0 };
      for (let j = 0; j < 2; j++) {
        const [dr, dc] = directions[(i + j) % 4], start = { r: pos.r + dr, c: pos.c + dc };
        const source = `${id}-${j}`;
        matrix.blocks[source] = { id: source, type: 'INPUT', name: `IN${j+1}`, pos: start, value: !!j };
        matrix.wires[source] = { id: source, startBlockId: source, endBlockId: id, path: [start, pos], inputRole: j ? 'EN' : 'D' };
      }
    }
    // Unknown role remains visibly unknown; crossing wires get no junction dot.
    matrix.blocks.unknown = { id: 'unknown', type: 'D', pos: { r: 6, c: 2 }, value: false };
    matrix.wires.unknown = { path: [{ r:6,c:0 },{ r:6,c:1 },{ r:6,c:2 }], endBlockId: 'unknown' };
    matrix.wires.crossA = { path: [{ r:5,c:6 },{ r:5,c:7 },{ r:5,c:8 },{ r:5,c:9 }] };
    matrix.wires.crossB = { path: [{ r:4,c:8 },{ r:5,c:8 },{ r:6,c:8 },{ r:6,c:9 }] };
    for (const [i, type] of ['INPUT','OUTPUT','D','JUNCTION','AND','OR','XOR','NOT'].entries()) {
      matrix.blocks[`off${i}`] = { id: `off${i}`, type, pos: { r:8, c:i*2 }, value:false };
      matrix.blocks[`on${i}`] = { id: `on${i}`, type, pos: { r:7, c:i*2 }, value:true, inputMode:'button' };
    }
    const images = [];
    for (const theme of getAvailableThemes()) {
      drawGrid(portCtx, matrix.rows, matrix.cols, 0, null, { theme });
      renderContent(portCtx, matrix, 7, 0, null, null, { theme, preserveExisting:true });
      images.push({ theme:theme.id, url:portCtx.canvas.toDataURL() });
      for (const scale of [0.2, 0.26, 0.65, 1, 1.8]) {
        const cam = createCamera({ panelWidth: 30, scale });
        cam.setViewport(1000, 500); cam.pan(17, 11);
        for (const unbounded of [false, true]) {
          drawGrid(portCtx, matrix.rows, matrix.cols, 30, cam, { theme, unbounded });
          renderContent(portCtx, matrix, 7, 30, null, cam, { theme, preserveExisting:true });
          const p = cam.cellToScreenCell({ r:2, c:7 });
          check(JSON.stringify(cam.screenToCell(p.x + 25 * scale, p.y + 25 * scale)) === '{"r":2,"c":7}', 'camera/click mismatch');
        }
      }
    }
    checks.push('5 themes; finite/infinite cameras at 0.2/0.26/0.65/1/1.8 zoom and pan; four D/EN sides and unknown role');
    if (!baseline) {
      // Empty cell interiors must match exactly, while grid boundaries remain visible.
      drawGrid(ctx, 7, 12);
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].join(',');
      const empty = pixel(10, 10);
      check(pixel(62, 10) === empty && pixel(10, 62) === empty, 'checkerboard remains');
      check(pixel(54, 10) !== empty, 'grid boundary is missing');
      // At every phase the same route is visible, with no paint elsewhere in its cells.
      const wireCtx = canvas('wire', 314, 158);
      const w = { path:[{r:1,c:0},{r:1,c:1},{r:1,c:2},{r:1,c:3},{r:1,c:4},{r:1,c:5}] };
      for (let phase = 0; phase < 28; phase += 2) {
        wireCtx.clearRect(0, 0, 314, 158); drawWire(wireCtx, w, phase);
        for (let x = 28; x < 287; x++) check(wireCtx.getImageData(x,79,1,1).data[3] > 0, 'disconnected dash gap');
        check(wireCtx.getImageData(70,65,1,1).data[3] === 0, 'wire cell fill/shadow remains');
      }
      checks.push('uniform empty cells, continuous wire at every sampled phase, no off-route cell fill');
    }
    for (let phase = 0; phase < 120; phase++) renderContent(ctx, circuit, phase);
    check(snapshot() === before, 'rendering changed circuit or memory/tick state');
    checks.push('120 rendering frames preserve circuit, memory, tick and pending button pulse');
    return { checks, capture, images, circuit };
  }, !!baseline);
  const writeImage = async (name, url) => fs.writeFile(`${output}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  await writeImage('memory-scene', rendering.capture);
  for (const image of rendering.images) await writeImage(`ports-${image.theme}`, image.url);
  report.checks.push(...rendering.checks);
  const gif = await page.evaluate(async () => {
    const { createCircuitGif } = await import('/src/canvas/gifExport.js');
    return [...new Uint8Array(await (await createCircuitGif(window.visualCircuit)).arrayBuffer())];
  });
  await fs.writeFile(`${output}/flow.gif`, new Uint8Array(gif));

  for (const entry of ['', 'dist-web-demo/']) {
    await page.goto(`${base}/${entry}`);
    await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
    await page.locator('#loadingStartBtn').click();
    await page.evaluate(async () => {
      const levels = await import('./src/modules/levels.js');
      levels.configureLevelModule({ progressProvider: () => [0,6], canStartLevel: null });
      await levels.startLevel(25);
      const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
    });
    await page.locator('#startLevelBtn').click();
    await page.evaluate(async circuit => {
      const grid = await import('./src/modules/grid.js');
      await grid.setupGrid('canvasContainer', circuit.rows, circuit.cols, [
        { label:'IN/OUT', items:[{type:'INPUT'}, {type:'INPUT',inputMode:'button',label:'BUTTON'}, {type:'OUTPUT'}] },
        { label:'GATE', items:['D','NOT','AND','OR','JUNCTION'].map(type => ({type})) }
      ], { enableCopyPaste:true });
      const controller = grid.getPlayController();
      controller.restoreCircuit(circuit); controller.stopEngine();
      for (const [id,b] of Object.entries(circuit.blocks)) grid.getPlayCircuit().blocks[id].value = b.value;
      controller.refreshVisuals();
    }, rendering.circuit);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${output}/${entry ? 'demo' : 'full'}-ui.png` });
    assert.equal(await page.locator('#rightPanel').isVisible(), true);
    if (!entry) {
      await page.evaluate(async circuit => {
        await (await import('./src/modules/labMode.js')).openLabModeFromShortcut();
        const { labController } = window.visualLab();
        labController.restoreCircuit(circuit); labController.stopEngine();
      }, rendering.circuit);
      for (const scale of [0.2, 0.26, 0.65, 1, 1.8]) {
        await page.setViewportSize({ width: scale < 1 ? 1280 : 1440, height: 1000 });
        const click = await page.evaluate(scale => {
          const { labCamera, labCircuit, labController } = window.visualLab();
          labCamera.reset(); labCamera.setScale(scale); labCamera.pan(90, 45);
          labController.refreshVisuals();
          const cell = labCamera.cellToScreenCell(labCircuit.blocks.data.pos);
          const canvas = document.getElementById('labOverlayCanvas');
          const box = canvas.getBoundingClientRect();
          return { x:box.x + (cell.x + 25*scale)*box.width/Number(canvas.dataset.baseWidth),
            y:box.y + (cell.y + 25*scale)*box.height/Number(canvas.dataset.baseHeight), value:labCircuit.blocks.data.value };
        }, scale);
        await page.mouse.click(click.x, click.y);
        assert.equal(await page.evaluate(() => window.visualLab().labCircuit.blocks.data.value), !click.value,
          `Lab input hit testing after resize/pan/zoom ${scale}`);
      }
      await page.screenshot({ path:`${output}/lab-zoom.png` });
      await page.locator('#labExitBtn').click();
      await page.evaluate(() => window.visualOpenProblem('stageMapScreen'));
      await page.waitForFunction(async () => !!(await import('./src/modules/grid.js')).getProblemController());
      await page.evaluate(async () => {
        const grid = await import('./src/modules/grid.js');
        grid.getProblemController().stopEngine(); grid.getProblemController().refreshVisuals();
      });
      await page.screenshot({ path:`${output}/problem-editor.png` });
      report.checks.push('actual Lab clicks after resize/pan/zoom 0.2–1.8; problem editor canvas');
    }
  }
  report.checks.push('full web and built demo UI captured with identical circuit, inputs and stopped phase');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
