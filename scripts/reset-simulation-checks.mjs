import assert from 'node:assert/strict';

// Runs against the real full/demo/Electron editor, in both languages and widths.
export async function verifySimulationReset(page, { fixture, surface, lang, width }) {
  const reset = page.locator('[data-memory-action=reset]');
  const play = page.locator('[data-memory-action=play]');
  const speed = page.locator('.memory-playback-speed input');
  let dialogs = 0;
  const dismiss = async dialog => { dialogs++; await dialog.dismiss(); };
  page.on('dialog', dismiss);
  const restore = data => page.evaluate(async data =>
    (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(data), data);
  const read = () => page.evaluate(async () => {
    const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
    const { snapshotCircuit } = await import('./src/canvas/circuitData.js');
    const { calculateCircuitCost } = await import('./src/modules/circuitCost.js');
    const c = g.getPlayCircuit(), s = e.getExecutionState(c), runner = g.getPlayController().tickRunner;
    const design = snapshotCircuit(c);
    // Saved switches are deliberately changed by reset. Everything else is design.
    for (const b of Object.values(design.blocks)) if (b.type === 'INPUT') b.value = false;
    return { tick: s.tick, memory: [...s.memory], inputs: Object.values(c.blocks).filter(b => b.type === 'INPUT').map(b => b.value),
      lastTick: s.lastTick, currentInputs: [...s.currentInputs], values: Object.fromEntries(Object.values(c.blocks).map(b => [b.id, b.value])),
      running: runner.isRunning(), interval: runner.getInterval(), design, cost: calculateCircuitCost(c),
      undo: document.getElementById('undoBtn').disabled, redo: document.getElementById('redoBtn').disabled,
      diagnostics: e.getEvaluationResult(c).diagnostics };
  });
  const assertReset = state => {
    assert.equal(state.tick, 0); assert.equal(state.running, false);
    assert.ok(state.memory.every(([, value]) => value === false));
    assert.ok(state.inputs.every(value => value === false));
    assert.equal(state.lastTick, null); assert.deepEqual(state.currentInputs, []);
  };
  const point = id => page.locator('#overlayCanvas').evaluate(async (canvas, id) => {
    const c = (await import('./src/modules/grid.js')).getPlayCircuit();
    const p = c.blocks[id].pos, r = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.gridViewportWidth) / Number(canvas.dataset.gridBaseWidth);
    return { x: r.x + Number(canvas.dataset.panelWidth) + (27 + p.c * 52) * scale, y: r.y + (27 + p.r * 52) * scale };
  }, id);
  const clickBlock = async id => { const p = await point(id); await page.mouse.click(p.x, p.y); };
  try {
    await restore(fixture);
    await reset.click(); assertReset(await read());
    await speed.fill('1');
    // Space can start in the editor and end on the reset button. Its keyup
    // must reach the shared controller so the next block drag does not pan.
    await page.locator('#wireMoveInfo').click();
    await page.evaluate(() => document.activeElement.blur());
    const interaction = () => page.evaluate(async () => {
      const { state } = (await import('./src/modules/grid.js')).getPlayController();
      return { spaceHeld: state.spaceHeld, panning: state.panning,
        dragId: state.draggingBlock?.id || state.dragCandidate?.id || null };
    });
    await page.keyboard.down('Space');
    assert.equal((await interaction()).spaceHeld, true);
    const resetBox = await reset.boundingBox();
    await page.mouse.click(resetBox.x + resetBox.width / 2, resetBox.y + resetBox.height / 2);
    assert.equal(await reset.evaluate(el => el === document.activeElement), true);
    await page.keyboard.up('Space');
    assert.deepEqual(await interaction(), { spaceHeld: false, panning: false, dragId: null });
    const beforeDrag = await read(), drag = await point('Q');
    await page.mouse.move(drag.x, drag.y); await page.mouse.down();
    await page.mouse.move(drag.x + 15, drag.y + 15);
    assert.deepEqual(await interaction(), { spaceHeld: false, panning: false, dragId: 'Q' });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await read(), beforeDrag);
    // Two real edits then undo leave both undo and redo populated.
    await page.locator('#wireMoveInfo').click();
    await clickBlock('Q'); await clickBlock('Q'); await page.locator('#undoBtn').click();
    assert.equal(await page.locator('#undoBtn').isEnabled(), true);
    assert.equal(await page.locator('#redoBtn').isEnabled(), true);
    const label = lang === 'en' ? 'Reset simulation' : '실행 초기화';
    assert.equal(await reset.getAttribute('aria-label'), label);
    assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1);
    const tip = page.locator('.memory-playback-reset-tooltip');
    await reset.hover(); assert.equal(await tip.isVisible(), true); assert.equal(await tip.innerText(), label);
    await page.mouse.move(0, 0); await play.focus(); await page.keyboard.press('Tab');
    assert.equal(await reset.evaluate(el => el === document.activeElement), true);
    assert.equal(await tip.isVisible(), true);
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { play: rect('[data-memory-action=play]'), reset: rect('[data-memory-action=reset]'),
        speed: rect('.memory-playback-speed'), tick: rect('.memory-playback-tick'), bar: rect('.memory-playback-bar'),
        tip: rect('.memory-playback-reset-tooltip'), viewport: innerWidth };
    });
    assert.ok(layout.reset.left >= layout.play.right && layout.reset.left - layout.play.right < 12, JSON.stringify(layout));
    assert.ok(Math.abs((layout.play.top + layout.play.bottom) - (layout.reset.top + layout.reset.bottom)) < 2);
    for (const key of ['play', 'reset', 'speed', 'tick', 'tip']) {
      assert.ok(layout[key].left >= 0 && layout[key].right <= layout.viewport, JSON.stringify(layout));
    }
    for (const a of ['play', 'reset']) for (const b of ['speed', 'tick']) {
      const x = layout[a], y = layout[b];
      assert.ok(x.left >= y.right || y.left >= x.right || x.top >= y.bottom || y.top >= x.bottom, JSON.stringify(layout));
    }
    await page.screenshot({ path: `test-results/reset-${surface}-${lang}-${width}.png` });

    for (const playing of [true, false]) {
      if (playing) await play.click();
      // Commit a real sample, then leave both inputs on before the UI reset.
      await page.evaluate(async () => {
        const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
        const c = g.getPlayCircuit(); c.blocks.DATA.value = c.blocks.LOAD.value = true;
        g.getPlayController().tickRunner.step(); c.blocks.LOAD.value = true; e.previewCircuit(c);
      });
      const before = await read();
      assert.ok(before.tick > 0); assert.deepEqual(before.memory, [['Q', true]]);
      assert.ok(before.inputs.every(Boolean)); assert.notEqual(before.lastTick, null);
      assert.equal(before.running, playing);
      await reset.click();
      const after = await read(); assertReset(after);
      assert.deepEqual(after.design, before.design); assert.deepEqual(after.cost, before.cost);
      assert.equal(after.undo, before.undo); assert.equal(after.redo, before.redo);
      assert.equal(after.interval, 1000);
      assert.equal(await page.locator('.memory-playback-tick').innerText(), 'TICK 000');
      for (const key of ['Enter', 'Space']) {
        await clickBlock('DATA'); assert.equal((await read()).values.DATA, true);
        await reset.focus(); await page.keyboard.press(key); assertReset(await read());
      }
      await page.waitForTimeout(1100); assertReset(await read());
    }

    // Existing redo and undo still apply the same D/EN edits after resetting.
    const beforeHistory = (await read()).design;
    await page.locator('#redoBtn').click();
    assert.notDeepEqual((await read()).design.wires, beforeHistory.wires);
    await page.locator('#undoBtn').click(); assert.deepEqual((await read()).design, beforeHistory);
    await clickBlock('DATA'); await speed.fill('5');
    assert.equal((await read()).values.DATA, true);
    for (const gate of ['isScoring', 'isGradingResultOpen', 'inert', 'hidden', 'screen', 'page']) {
      for (const enabled of [true, false]) {
        await page.evaluate(({ gate, enabled }) => {
          if (gate === 'inert') document.getElementById('gameScreen').inert = enabled;
          else if (gate === 'hidden') {
            if (enabled) Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            else delete document.hidden;
            document.dispatchEvent(new Event('visibilitychange'));
          } else if (gate === 'screen') document.getElementById('gameScreen').style.display = enabled ? 'none' : 'flex';
          else if (gate === 'page') window.dispatchEvent(new Event(enabled ? 'pagehide' : 'pageshow'));
          else window[gate] = enabled;
          document.dispatchEvent(new Event('bitwiser:scoring'));
        }, { gate, enabled });
        if (enabled && gate.startsWith('is')) {
          assert.equal(await reset.isDisabled(), true);
          const locked = await read();
          // Even an event dispatched past the disabled UI must hit the lock guard.
          await reset.dispatchEvent('click'); assert.deepEqual(await read(), locked);
        }
      }
    }
    await page.waitForTimeout(400);
    assert.equal((await read()).running, false); assert.equal((await read()).tick, 0);
    assert.equal((await read()).interval, 200);
    const resumed = await play.evaluate(async button => {
      button.click();
      const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
      return { tick: e.getExecutionState(g.getPlayCircuit()).tick, running: g.getPlayController().tickRunner.isRunning() };
    });
    assert.deepEqual(resumed, { tick: 0, running: true });
    await page.waitForFunction(async () => {
      const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
      return e.getExecutionState(g.getPlayCircuit()).tick > 0;
    });
    await reset.click(); assertReset(await read());

    const noD = structuredClone(fixture);
    delete noD.blocks.LOAD; delete noD.wires.w1;
    noD.blocks.Q.type = 'NOT'; delete noD.wires.w0.inputRole;
    const incomplete = structuredClone(fixture); delete incomplete.wires.w2;
    const invalid = structuredClone(fixture); invalid.wires.w0.inputRole = 'EN';
    for (const design of [{ ...fixture, blocks: {}, wires: {} }, incomplete, invalid, noD]) {
      await restore(design);
      const before = await read();
      const badge = await page.locator('.circuit-diagnostic-badge').textContent();
      assert.equal(await reset.isVisible(), true); assert.equal(await reset.isEnabled(), true);
      for (let i = 0; i < 3; i++) {
        await reset.click(); const after = await read(); assertReset(after);
        assert.deepEqual(after.diagnostics, before.diagnostics);
        assert.equal(await page.locator('.circuit-diagnostic-badge').textContent(), badge);
        if (before.diagnostics.length) assert.equal(after.values.OUT_VALUE, null);
      }
      if (design === noD) assert.equal((await read()).values.OUT_VALUE, true);
    }
    // Repair/restore keeps reset's pause, but must retain saved switch values.
    const saved = structuredClone(fixture); saved.blocks.DATA.value = true;
    await restore(saved); await page.waitForTimeout(400);
    const loaded = await read();
    assert.equal(loaded.values.DATA, true); assert.equal(loaded.tick, 0); assert.equal(loaded.running, false);
    assert.equal(dialogs, 0);
    return { surface, lang, width, layout };
  } finally { page.off('dialog', dismiss); }
}
