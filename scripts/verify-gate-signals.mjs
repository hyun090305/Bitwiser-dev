import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium, _electron as electron } from 'playwright';

const root = path.resolve('.'), native = process.argv.includes('--electron');
const output = 'test-results/gate-signals';
await fs.mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let name = new URL(req.url, 'http://localhost').pathname;
    // The same checker imports the built demo's modules through relative URLs.
    if (name === '/dist-web-demo/scripts/check-circuit-rendering.mjs') name = '/scripts/check-circuit-rendering.mjs';
    const file = path.resolve(root, '.' + (name.endsWith('/') ? name + 'index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, app;
const report = [];
try {
  if (!native) browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  for (const surface of native ? ['electron'] : ['full', 'demo']) for (const lang of ['ko', 'en']) {
    const size = lang === 'ko' ? { width: 1440, height: 980 } : { width: 900, height: 650 };
    if (native) {
      const profile = await fs.mkdtemp(path.join(root, 'test-results', 'gate-signals-electron-'));
      const env = { ...process.env, BITWISER_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
      app = await electron.launch({ args: [path.join(root, 'scripts/electron-save-test-entry.cjs')], env });
    }
    const context = native ? app.context() : await browser.newContext({ viewport: size, deviceScaleFactor: lang === 'ko' ? 1 : 2, serviceWorkers: 'block' });
    if (!native) await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await context.addInitScript(lang => {
      if (location.protocol === 'about:') return;
      window.firebase = { initializeApp() {}, database: () => undefined };
      localStorage.setItem('lang', lang); localStorage.setItem('autoSaveCircuit', 'false');
    }, lang);
    const page = native ? await app.firstWindow() : await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (native) { await page.waitForURL('app://bitwiser/index.html'); await page.setViewportSize(size); await page.reload(); }
    else await page.goto(`${base}/${surface === 'demo' ? 'dist-web-demo/' : ''}`);
    await page.locator('#loadingStartBtn').click(); await page.locator('#loadingScreen').waitFor({ state: 'hidden' });
    const styles = await page.evaluate(async () => (await import('./scripts/check-circuit-rendering.mjs')).checkGateSignals());
    if (surface !== 'demo') await page.evaluate(async () => {
      await (await import('./src/modules/levels.js')).startLevel(1);
      const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
    });
    await page.locator('#startLevelBtn').click();
    let combinations = 0;
    for (const type of ['AND', 'OR', 'NOT']) {
      await page.evaluate(async type => {
        const { createGateCircuit } = await import('./scripts/check-circuit-rendering.mjs');
        const { createCamera } = await import('./src/canvas/camera.js');
        const grid = await import('./src/modules/grid.js'), circuit = createGateCircuit(type);
        window.gateCamera = createCamera({ panelWidth: 180 });
        await grid.setupGrid('canvasContainer', circuit.rows, circuit.cols, [{ label: 'GATES', items: ['INPUT', 'OUTPUT', 'AND', 'OR', 'NOT'].map(type => ({ type })) }], { camera: window.gateCamera });
        grid.getPlayController().restoreCircuit(circuit);
      }, type);
      const cases = type === 'NOT' ? [[false, false], [true, false]] : [[false, false], [false, true], [true, false], [true, true]];
      for (const [a, b] of cases) {
        for (const [id, value] of [['a', a], ['b', b]]) {
          const click = await page.evaluate(async ({ id, value }) => {
            const circuit = (await import('./src/modules/grid.js')).getPlayCircuit(), block = circuit.blocks[id];
            if (!block || block.value === value) return null;
            const p = window.gateCamera.cellToScreenCell(block.pos), scale = window.gateCamera.getScale();
            const canvas = document.getElementById('overlayCanvas'), rect = canvas.getBoundingClientRect();
            return { x: rect.x + (p.x + 25 * scale) * rect.width / Number(canvas.dataset.baseWidth), y: rect.y + (p.y + 25 * scale) * rect.height / Number(canvas.dataset.baseHeight) };
          }, { id, value });
          if (click) await page.mouse.click(click.x, click.y);
        }
        const expected = type === 'AND' ? a && b : type === 'OR' ? a || b : !a;
        await page.waitForFunction(async expected => (await import('./src/modules/grid.js')).getPlayCircuit().blocks.g.value === expected, expected);
        const view = await page.evaluate(async () => {
          const grid = await import('./src/modules/grid.js'), circuit = grid.getPlayCircuit();
          grid.getPlayController().refreshVisuals();
          const canvas = document.getElementById('contentCanvas'), ctx = canvas.getContext('2d');
          const p = window.gateCamera.cellToScreenCell(circuit.blocks.g.pos), scale = window.gateCamera.getScale(), dpr = Number(canvas.dataset.dpr || window.devicePixelRatio);
          return { a: circuit.blocks.a.value, b: circuit.blocks.b?.value, pixel: [...ctx.getImageData(Math.floor((p.x + 10 * scale) * dpr), Math.floor((p.y + 10 * scale) * dpr), 1, 1).data] };
        });
        assert.equal(view.a, a); if (type !== 'NOT') assert.equal(view.b, b);
        assert.equal(view.pixel.join() === '242,240,223,255', expected, `${surface}/${lang}/${type}/${a}/${b}: displayed signal`);
        combinations++;
      }
      await page.screenshot({ path: `${output}/${surface}-${lang}-${type}.png` });
    }
    assert.deepEqual(errors, []);
    report.push({ surface, lang, size, styles, actualInputClickCombinations: combinations });
    console.log(JSON.stringify(report.at(-1)));
    if (native) { await app.close(); app = null; } else await context.close();
  }
  await fs.writeFile(`${output}/${native ? 'electron' : 'browser'}-report.json`, JSON.stringify(report, null, 2));
} finally {
  await app?.close(); await browser?.close(); await new Promise(resolve => server.close(resolve));
}
