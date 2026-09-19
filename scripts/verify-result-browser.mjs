import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const root = path.resolve('.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'ko-KR' });
await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
await context.addInitScript(() => {
  localStorage.setItem('lang', 'ko'); localStorage.setItem('autoSaveCircuit', 'false'); localStorage.setItem('bitwiserTheme', 'midnight-neon');
  window.traceLabels = [];
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
    if (this.canvas.id === 'contentCanvas' && String(text).includes('✕')) {
      const point = this.getTransform().transformPoint(new DOMPoint(x, y));
      const bounds = this.canvas.getBoundingClientRect();
      window.traceLabels.push({ text, x: bounds.x + point.x * bounds.width / this.canvas.width, y: bounds.y + point.y * bounds.height / this.canvas.height });
    }
    return fill.call(this, text, x, y, ...args);
  };
});
const page = await context.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.stack));
try {
  await fs.mkdir('test-results/result-trace', { recursive: true });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
  await page.locator('#loadingStartBtn').click();
  await page.evaluate(async () => {
    const levels = await import('/src/modules/levels.js');
    levels.configureLevelModule({ progressProvider: () => [0, 6, 30, 31] });
    await levels.startLevel(35);
    const nav = await import('/src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
  });
  await page.screenshot({ path: 'test-results/result-trace/stage-reference.png' });
  await page.locator('#startLevelBtn').click();
  const fixture = JSON.parse(await fs.readFile('tests/fixtures/stages/35-3.json', 'utf8')).circuit;
  for (const [id, wire] of Object.entries(fixture.wires)) if (wire.endBlockId === 'CLEAN') delete fixture.wires[id];
  await page.evaluate(async c => {
    const grid = await import('/src/modules/grid.js'); grid.getPlayController().restoreCircuit(c);
    window.originalCircuit = JSON.stringify(grid.getPlayCircuit());
  }, fixture);
  await page.locator('#gradeButton').click();
  await page.locator('#gradingResultOverlay[open]').waitFor();
  assert.match(await page.locator('.grading-result-header').innerText(), /CONTROL FLOW · STAGE 35/);
  assert.equal(await page.locator('#gameScreen .status-toolbar').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  assert.equal(await page.locator('.trace-event--init').count(), 1);
  assert.equal(await page.locator('.trace-event[data-failed=true]').count(), 1);
  await page.screenshot({ path: 'test-results/result-trace/stage35-failure.png' });
  // Native modal and the controller both protect the design. Arrow keys remain
  // available to the horizontally scrollable event region.
  await page.keyboard.press('r'); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(async () => JSON.stringify((await import('/src/modules/grid.js')).getPlayCircuit()) === originalCircuit), true);
  await page.locator('#gradingReplayBtn').click();
  await page.waitForFunction(() => !document.getElementById('gradingReplayBtn').disabled, null, { timeout: 25000 });
  await page.waitForFunction(() => traceLabels.length > 0);
  const label = await page.evaluate(() => traceLabels.at(-1));
  const panel = await page.locator('#gradingResultOverlay .grading-result-panel').boundingBox();
  assert.ok(label.y > 0 && label.y < panel.y, `Output badge must remain above replay panel: ${JSON.stringify({ label, panel })}`);
  assert.ok(label.x > 0 && label.x < 1440);
  await page.screenshot({ path: 'test-results/result-trace/stage35-replay.png' });
  await page.locator('#gradingResultEditBtn').click();
  assert.equal(await page.locator('#gameScreen .status-toolbar').evaluate(el => getComputedStyle(el).visibility), 'visible');
  assert.equal(await page.locator('#gradeButton').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(async () => JSON.stringify((await import('/src/modules/grid.js')).getPlayCircuit()) === originalCircuit), true);

  // Invalid connectivity uses the same shell and offers no fabricated trace.
  await page.evaluate(async () => {
    const grid = await import('/src/modules/grid.js'), c = grid.getPlayCircuit();
    const memory = Object.values(c.blocks).find(b => b.type === 'D');
    for (const [id, w] of Object.entries(c.wires)) if (w.endBlockId === memory.id) delete c.wires[id];
  });
  await page.locator('#gradeButton').click(); await page.locator('#gradingResultOverlay[open]').waitFor();
  assert.match(await page.locator('#gradingResultTitle').innerText(), /잘못된 연결/);
  assert.equal(await page.locator('#gradingReplayBtn').count(), 0);
  await page.screenshot({ path: 'test-results/result-trace/invalid.png' });
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const levels = await import('/src/modules/levels.js'); await levels.startLevel(1);
  });
  await page.locator('#startLevelBtn').click();
  const combinational = JSON.parse(await fs.readFile('tests/fixtures/demo/1-3.json', 'utf8')).circuit;
  for (const [id, w] of Object.entries(combinational.wires)) if (combinational.blocks[w.endBlockId].type === 'OUTPUT') delete combinational.wires[id];
  await page.evaluate(async c => (await import('/src/modules/grid.js')).getPlayController().restoreCircuit(c), combinational);
  await page.locator('#gradeButton').click(); await page.locator('#gradingResultOverlay[open]').waitFor();
  assert.equal(await page.locator('.trace-event--set').count(), 1);
  assert.equal(await page.locator('.trace-event--expect').count(), 1);
  assert.equal(await page.locator('.trace-event--tick').count(), 0);
  assert.equal(await page.locator('.trace-event--init').count(), 0);
  await page.screenshot({ path: 'test-results/result-trace/combinational.png' });
  await page.evaluate(() => document.dispatchEvent(new Event('bitwiser:leavePlay')));
  assert.equal(await page.locator('#gradingResultOverlay').isVisible(), false);
  assert.equal(await page.evaluate(() => window.isGradingResultOpen), false);
  assert.deepEqual(errors, []);
  console.log('Full result browser passed: Stage 35 trace/replay, visible output badge, toolbar/keyboard lock, focus and runtime restoration, invalid connections, combinational trace, navigation cleanup.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
