import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const circuit = JSON.parse(await fs.readFile(new URL('../tests/fixtures/demo/6-3.json', import.meta.url), 'utf8')).circuit;

// Use actual editor key handlers and canvas clicks, including a key pressed
// before either export dialog opens and released while the dialog is modal.
export async function verifyBlueprintHeldKeys(page, { demo = false } = {}) {
  const read = () => page.evaluate(async () => {
    const grid = await import('./src/modules/grid.js');
    const { snapshotCircuit } = await import('./src/canvas/circuitData.js');
    const { mode, spaceHeld, panning, wireTrace } = grid.getPlayController().state;
    return { circuit: snapshotCircuit(grid.getPlayCircuit()), mode, spaceHeld, panning, wireTrace };
  });
  const original = (await read()).circuit;
  await page.evaluate(async circuit => {
    const grid = await import('./src/modules/grid.js');
    grid.getPlayController().restoreCircuit(circuit); grid.adjustGridZoom();
  }, circuit);
  const before = (await read()).circuit;
  const controlKey = await page.evaluate(() => /Mac|iP(hone|ad|od)/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? 'Meta' : 'Control');
  const click = async locator => {
    const box = await locator.boundingBox();
    // Raw mouse events preserve Space and modifier keys across the click.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  for (const zoom of [false, true]) {
    for (const key of ['Shift', controlKey, 'Space']) {
      await page.locator('#wireMoveInfo').click();
      await page.keyboard.down(key);
      const held = await read();
      if (key === 'Space') assert.equal(held.spaceHeld, true);
      else assert.equal(held.mode, key === 'Shift' ? 'deleting' : 'wireDrawing');
      await click(page.locator(demo ? '#demoShareBtn' : '#exportGifBtn'));
      await page.locator('.blueprint-export .blueprint-share[data-state=ready]').waitFor();
      if (zoom) {
        await click(page.locator('.blueprint-export .blueprint-preview'));
        await page.locator('.blueprint-zoom[open]').waitFor();
      }
      await page.keyboard.up(key);
      const released = await read();
      assert.equal(released.mode, 'idle', `${key} release inside ${zoom ? 'zoom' : 'export'}`);
      assert.equal(released.spaceHeld, false);
      assert.equal(released.panning, false);
      assert.deepEqual(released.wireTrace, []);
      // Newly pressed editor shortcuts must still be blocked inside the dialog.
      const dialog = page.locator(zoom ? '.blueprint-zoom' : '.blueprint-export');
      await dialog.evaluate(node => { node.tabIndex = -1; node.focus(); });
      for (const command of ['Shift', controlKey, 'Space', 'ArrowRight', `${controlKey}+z`, 'r']) await page.keyboard.press(command);
      assert.equal(await dialog.evaluate(node => node.open), true);
      assert.deepEqual(await read(), released);
      if (zoom) await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.locator('.blueprint-export').waitFor({ state: 'detached' });
      const point = await page.locator('#overlayCanvas').evaluate((canvas, { r, c }) => {
        const box = canvas.getBoundingClientRect(), panel = Number(canvas.dataset.panelWidth);
        const scale = Number(canvas.dataset.gridViewportWidth) / Number(canvas.dataset.gridBaseWidth);
        return { x: box.x + panel + (2 + c * 52 + 25) * scale, y: box.y + (2 + r * 52 + 25) * scale };
      }, circuit.blocks.and.pos);
      await page.mouse.move(point.x, point.y);
      assert.equal(await page.evaluate(async () => (await import('./src/modules/grid.js')).getPlayController().state.hoverBlockId), 'and');
      await page.mouse.down();
      const pressed = await read();
      assert.equal(pressed.panning, false, `${key} must not leave panning active`);
      assert.equal(pressed.mode, 'idle');
      assert.deepEqual(pressed.wireTrace, []);
      await page.mouse.up();
      assert.deepEqual((await read()).circuit, before, `${key} must not alter the circuit after closing`);
    }
  }
  await page.evaluate(async circuit => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(circuit), original);
  console.log(`Blueprint held-key checks passed: ${demo ? 'demo' : 'full web'}, Shift/${controlKey}/Space, export + zoom.`);
}
