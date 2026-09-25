import assert from 'node:assert/strict';

// Exercise the real toolbar and document-level release path. Capture state in
// the event handlers so a later, correctly scheduled tick cannot skew the check.
export async function verifyExternalEditCancellation(page) {
  await page.evaluate(async () => {
    const grid = await import('./src/modules/grid.js');
    const evaluation = await import('./src/canvas/evaluation.js');
    const { calculateCircuitCost } = await import('./src/modules/circuitCost.js');
    window.externalEditSnapshot = () => {
      const circuit = grid.getPlayCircuit();
      return JSON.stringify({ circuit, runtime: evaluation.getExecutionState(circuit), cost: calculateCircuitCost(circuit),
        undo: document.getElementById('undoBtn').disabled, redo: document.getElementById('redoBtn').disabled
      }, (_key, value) => value instanceof Map ? [...value] : value);
    };
    if (window.externalEditProbeInstalled) return;
    window.externalEditProbeInstalled = true;
    const recordStart = event => {
      if (event.target.id === 'overlayCanvas' && window.externalEditProbe?.armed) {
        const circuit = grid.getPlayCircuit(), runtime = evaluation.getExecutionState(circuit);
        runtime.tick = 37; runtime.memory.set('Q', true);
        circuit.blocks.DATA.value = true; circuit.blocks.LOAD.value = true;
        evaluation.previewCircuit(circuit);
        window.externalEditProbe.before = window.externalEditSnapshot();
      }
    };
    document.addEventListener('mousedown', recordStart, true);
    document.addEventListener('touchstart', recordStart, true);
    const recordEnd = event => {
      const probe = window.externalEditProbe;
      if (!probe?.armed || (event.type === 'keydown' && event.key !== 'Escape')) return;
      probe.after = window.externalEditSnapshot();
      const state = grid.getPlayController().state;
      probe.state = { trace: state.wireTrace.length, selecting: state.selecting, start: state.selectStart,
        down: state.pointerDown, moved: state.pointerMoved, mode: state.mode };
      const canvas = document.getElementById('overlayCanvas');
      probe.previewPixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(value => value !== 0);
      probe.armed = false;
    };
    window.addEventListener('mouseup', recordEnd);
    window.addEventListener('touchend', recordEnd);
    window.addEventListener('keydown', recordEnd);
  });
  const running = value => page.waitForFunction(async value =>
    (await import('./src/modules/grid.js')).getPlayController().tickRunner.isRunning() === value, value);
  const point = (r, c) => page.locator('#overlayCanvas').evaluate((canvas, { r, c }) => {
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.gridViewportWidth) / Number(canvas.dataset.gridBaseWidth);
    return { x: rect.x + Number(canvas.dataset.panelWidth) + (27 + c * 52) * scale, y: rect.y + (27 + r * 52) * scale };
  }, { r, c });
  // Leave a redo entry to detect both accidental snapshots and history loss.
  await page.locator('[data-memory-action=play]').click(); await running(false);
  await page.locator('#wireMoveInfo').click();
  const d = await point(2, 2); await page.mouse.click(d.x, d.y);
  await page.locator('#undoBtn').click();
  assert.equal(await page.locator('#redoBtn').isEnabled(), true);
  await page.locator('[data-memory-action=play]').click(); await running(true);
  for (const manualPause of [false, true]) {
    if (manualPause) { await page.locator('[data-memory-action=play]').click(); await running(false); }
    for (const scenario of ['wire-outside', 'selection-outside', 'selection-escape', 'wire-touch-outside', 'selection-touch-outside']) {
      const wire = scenario.startsWith('wire'), touch = scenario.includes('touch');
      await page.locator(wire ? '#wireStatusInfo' : '#wireSelectInfo').click();
      await page.evaluate(() => { window.externalEditProbe = { armed: true }; });
      const start = await point(1, 1), end = await point(1, 2);
      const cdp = touch ? await page.context().newCDPSession(page) : null;
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      } else {
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 4 });
      }
      await running(false);
      const active = await page.evaluate(async () => {
        const s = (await import('./src/modules/grid.js')).getPlayController().state;
        return { trace: s.wireTrace.length, selecting: s.selecting };
      });
      assert.equal(wire ? active.trace : active.selecting, wire ? 2 : true);
      if (scenario.endsWith('outside')) {
        const outside = await page.locator('#wireMoveInfo').boundingBox();
        const target = { x: outside.x + outside.width / 2, y: outside.y + outside.height / 2 };
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        } else {
          await page.mouse.move(target.x, target.y); await page.mouse.up();
        }
      } else {
        await page.keyboard.press('Escape'); await page.mouse.up();
      }
      const probe = await page.evaluate(() => window.externalEditProbe);
      assert.equal(probe.after, probe.before, `${scenario}: design/runtime/cost/history changed during cancellation`);
      assert.deepEqual(probe.state, { trace: 0, selecting: false, start: null, down: null, moved: false, mode: 'idle' }, scenario);
      assert.equal(probe.previewPixels, false, `${scenario}: preview was not cleared`);
      await running(!manualPause);
      if (manualPause) {
        await page.waitForTimeout(1100);
        assert.equal(await page.evaluate(() => window.externalEditSnapshot()), probe.before, `${scenario}: manual pause was lost`);
      } else {
        await page.waitForFunction(async () => {
          const grid = await import('./src/modules/grid.js'), evaluation = await import('./src/canvas/evaluation.js');
          return evaluation.getExecutionState(grid.getPlayCircuit()).tick > 37;
        });
      }
    }
  }
  await page.locator('[data-memory-action=play]').click(); await running(true);
}
