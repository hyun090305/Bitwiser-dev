import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { initialOutputShortcut, responseCheckShortcut, registeredAddressMemory } from '../tests/helpers/sequential-observation-circuits.mjs';

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
  // Keep valid connectivity so the exhaustive grader produces a counterexample.
  // Disconnecting an output now correctly produces an invalid-arity result.
  const gate = Object.values(fixture.blocks).find(block => block.type === 'AND');
  assert.ok(gate, 'Stage 35 must have an AND gate to fault');
  gate.type = 'OR';
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
  const inverter = Object.values(combinational.blocks).find(block => block.type === 'NOT');
  assert.ok(inverter, 'Stage 1 must have a NOT gate to fault');
  inverter.type = 'JUNCTION';
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
  const definitions = JSON.parse(await fs.readFile('levels.json', 'utf8'));
  for (const language of ['ko', 'en']) for (const [stage, circuit, observation, phaseLabel] of [
    [25, initialOutputShortcut(), 'initial', language === 'ko' ? '초기 상태' : 'Initial state'],
    [38, registeredAddressMemory(), 'after_set', language === 'ko' ? '입력 변경 후 (tick 없음)' : 'After input change (no tick)'],
    [29, responseCheckShortcut(), 'after_tick', language === 'ko' ? 'tick 완료 후' : 'After completed tick']
  ]) {
    await page.setViewportSize(language === 'ko' ? { width: 1440, height: 980 } : { width: 420, height: 850 });
    await page.evaluate(async ({ stage, language }) => {
      window.currentLang = language; document.documentElement.lang = language;
      const levels = await import('/src/modules/levels.js');
      levels.configureLevelModule({ progressProvider: () => Array.from({ length: 47 }, (_, id) => id) });
      await levels.startLevel(stage);
      const nav = await import('/src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
    }, { stage, language });
    await page.locator('#startLevelBtn').click();
    const expected = await page.evaluate(async ({ circuit, answers }) => {
      const grid = await import('/src/modules/grid.js'); grid.getPlayController().restoreCircuit(circuit);
      const c = grid.getPlayCircuit();
      const { getExecutionState, tickCircuit, previewCircuit } = await import('/src/canvas/evaluation.js');
      const { getTraceHighlight } = await import('/src/canvas/tracePlayback.js');
      for (const b of Object.values(c.blocks)) if (b.type === 'INPUT') b.value = true;
      tickCircuit(c); previewCircuit(c);
      window.phaseSnapshot = () => JSON.stringify({ c, execution: getExecutionState(c) }, (_key, value) => value instanceof Map ? [...value] : value);
      window.phaseBefore = window.phaseSnapshot();
      window.phaseStep = () => ({
        execution: JSON.parse(JSON.stringify(getExecutionState(c), (_key, value) => value instanceof Map ? [...value] : value)),
        inputs: Object.fromEntries(Object.values(c.blocks).filter(b => b.type === 'INPUT').map(b => [b.name, Number(b.value)])),
        outputs: Object.fromEntries(Object.values(c.blocks).filter(b => b.type === 'OUTPUT').map(b => [b.name, Number(b.value)])),
        highlight: getTraceHighlight(c)
      });
      window.traceLabels = [];
      return (await import('/src/modules/circuitGrading.js')).gradeCircuitSync(c, answers);
    }, { circuit, answers: definitions.levelAnswers[stage] });
    assert.equal(expected.observation, observation);
    assert.equal(expected.trace.at(-2).type, {initial:'init',after_set:'set',after_tick:'tick'}[observation]);
    assert.equal(expected.trace.at(-1).type, 'expect');
    await page.locator('#gradeButton').click();
    await page.locator('#gradingResultOverlay[data-state=failed]').waitFor();
    assert.equal(await page.locator('.trace-event[data-failed=true]').getAttribute('data-observation'), observation);
    assert.equal(await page.locator('.trace-event[data-failed=true] .trace-event__observation').innerText(), phaseLabel);
    assert.ok((await page.locator('.grading-result-message').innerText()).includes(phaseLabel));
    assert.deepEqual(await page.locator('.trace-event').evaluateAll(nodes => nodes.map(n => ({ type: n.dataset.eventType, observation: n.dataset.observation || null }))),
      expected.trace.map(e => ({ type: e.type, observation: e.observation || null })));
    for (const [index, event] of expected.trace.entries()) if (event.type === 'tick') {
      const hint = await page.locator(`.trace-event[data-event-index="${index}"] .trace-event__hint`).innerText();
      assert.ok(hint.includes(language === 'en' ? 'TICK COMPLETE' : 'tick 완료'));
      for (const signal of event.releaseInputs) assert.ok(hint.includes(`${signal.signal}=0`));
    }
    const bounds = await page.locator('.grading-result-panel').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= (language === 'ko' ? 1440 : 420));
    await page.screenshot({ path: `test-results/result-trace/${observation}-${language}.png` });
    await page.locator('#gradingReplayBtn').click();
    let previous, ticks = 0;
    for (let i = 0; i < expected.trace.length; i++) {
      await page.waitForFunction(index => document.querySelector('.trace-event[aria-current=step]')?.dataset.eventIndex === String(index), i);
      const current = await page.evaluate(() => window.phaseStep()), event = expected.trace[i];
      if (event.type === 'tick') {
        ticks++;
        assert.equal(event.tickMode, 'visible');
        for (const signal of event.releaseInputs) assert.equal(current.inputs[signal.signal], 0);
        for (const output of expected.trace[i+1].outputs) assert.equal(current.outputs[output.signal], output.actual, 'TICK already displays the fully released result');
      }
      assert.equal(current.execution.tick, ticks);
      if (previous && event.type !== 'tick') assert.deepEqual(current.execution, previous.execution, 'SET/EXPECT must not advance execution state');
      if (event.type === 'set') assert.deepEqual(current.inputs, Object.fromEntries(event.inputs.map(s => [s.signal, s.value])));
      if (event.type === 'expect') {
        assert.equal(current.highlight.observation, event.observation);
        for (const output of event.outputs) assert.equal(current.outputs[output.signal], output.actual);
        assert.deepEqual(current.highlight.blocks.map(b => b.actual), event.outputs.map(s => s.actual));
      }
      previous = current;
    }
    await page.waitForFunction(() => !document.getElementById('gradingReplayBtn').disabled);
    assert.equal(await page.locator('.grading-result-observation').isVisible(), false);
    assert.ok((await page.locator('.grading-result-progress').innerText()).includes(phaseLabel));
    await page.waitForFunction(() => window.traceLabels.length > 0);
    assert.ok((await page.evaluate(() => window.phaseStep().highlight.blocks)).some(b => !b.passed));
    await page.screenshot({ path: `test-results/result-trace/${observation}-${language}-replay.png` });
    await page.locator('#gradingResultEditBtn').click();
    assert.equal(await page.evaluate(() => window.phaseSnapshot() === window.phaseBefore), true);
    // Restart, then cancel through both Escape and stage navigation.
    await page.locator('#gradeButton').click();
    await page.locator('#gradingResultOverlay[data-state=failed]').waitFor();
    await page.locator('#gradingReplayBtn').click();
    await page.waitForFunction(() => document.querySelector('.trace-event[aria-current=step]')?.dataset.eventIndex === '0');
    if (language === 'ko') await page.keyboard.press('Escape');
    else await page.evaluate(() => document.dispatchEvent(new Event('bitwiser:leavePlay')));
    assert.equal(await page.locator('#gradingResultOverlay').isVisible(), false);
    assert.equal(await page.evaluate(() => window.phaseSnapshot() === window.phaseBefore), true);
  }
  assert.deepEqual(errors, []);
  console.log('Full result browser passed: Stage 35 trace/replay, initial/SET/completed-tick failure phases in Korean/English and desktop/mobile, exact inputs/outputs and released TICK frames, visible output badge, toolbar/keyboard lock, focus/runtime restoration, invalid connections, combinational trace, navigation cleanup.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
