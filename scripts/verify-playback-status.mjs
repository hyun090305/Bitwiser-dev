import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron } from 'playwright';
import { verifyExternalEditCancellation } from './external-edit-checks.mjs';

const root = path.resolve('.'), passed = [], errors = [], measurements = [];
await fs.mkdir('test-results', { recursive: true });
const fixture = JSON.parse(await fs.readFile('tests/fixtures/demo/25-3.json', 'utf8')).circuit;
const empty = { ...fixture, blocks: {}, wires: {} };
const incomplete = structuredClone(fixture); delete incomplete.wires.w2;
const surfaces = process.argv.includes('--electron') ? ['electron'] : ['full', 'demo'];
const browser = surfaces[0] === 'electron' ? null : await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
try {
  for (const surface of surfaces) {
    let app, server, page;
    if (surface === 'electron') {
      const profile = await fs.mkdtemp(path.join(root, 'test-results', 'electron-playback-'));
      const env = { ...process.env, BITWISER_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
      app = await _electron.launch({ args: [path.join(root, 'scripts/electron-save-test-entry.cjs')], env });
      page = await app.firstWindow();
      await page.reload();
      await page.waitForFunction(() => document.getElementById('loadingStartBtn')?.disabled === false);
    } else {
      const files = surface === 'full' ? root : path.join(root, 'dist-web-demo');
      server = createServer(async (req, res) => {
        try {
          const name = new URL(req.url, 'http://localhost').pathname;
          const file = path.resolve(files, '.' + (name === '/' ? '/index.html' : name));
          if (!file.startsWith(files + path.sep)) { res.writeHead(403).end(); return; }
          const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.mp3': 'audio/mpeg' };
          const body = await fs.readFile(file);
          res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
        } catch { res.writeHead(404).end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      page = await browser.newPage({ hasTouch: true, serviceWorkers: 'block' });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      await page.goto(base);
    }
    page.on('pageerror', error => errors.push(error.stack));
    const read = () => page.evaluate(async () => {
      const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
      const c = g.getPlayCircuit(), s = e.getExecutionState(c);
      return { running: g.getPlayController().tickRunner.isRunning(), tick: s.tick,
        runtime: JSON.stringify({ c, s }, (_k, v) => v instanceof Map ? [...v] : v) };
    });
    const restore = c => page.evaluate(async c => (await import('./src/modules/grid.js')).getPlayController().restoreCircuit(c), c);
    const running = value => page.waitForFunction(async value => (await import('./src/modules/grid.js')).getPlayController().tickRunner.isRunning() === value, value);
    const box = () => page.evaluate(() => {
      const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      return { board: rect('#canvasContainer'), canvas: rect('#overlayCanvas'), bar: rect('.memory-playback-bar'), status: rect('.circuit-status-area') };
    });
    const point = id => page.locator('#overlayCanvas').evaluate(async (canvas, id) => {
      const g = await import('./src/modules/grid.js'), p = g.getPlayCircuit().blocks[id].pos, r = canvas.getBoundingClientRect();
      const scale = Number(canvas.dataset.gridViewportWidth) / Number(canvas.dataset.gridBaseWidth);
      return { x: r.x + Number(canvas.dataset.panelWidth) + (27 + p.c * 52) * scale, y: r.y + (27 + p.r * 52) * scale };
    }, id);
    const armProbe = () => page.evaluate(async () => {
      const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js');
      window.runtimeNow = () => JSON.stringify({ c: g.getPlayCircuit(), s: e.getExecutionState(g.getPlayCircuit()) }, (_k, v) => v instanceof Map ? [...v] : v);
      window.editProbe = {};
      if (window.editProbeInstalled) return;
      window.editProbeInstalled = true;
      document.addEventListener('mousedown', event => {
        if (event.target.id === 'overlayCanvas') window.editProbe.before = runtimeNow();
      }, true);
      document.addEventListener('mousedown', event => {
        if (event.target.id === 'overlayCanvas') window.editProbe.after = runtimeNow();
      });
      window.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.editProbe.cancelled = runtimeNow();
      });
    });
    const reject = async () => {
      await page.locator('#wireStatusInfo').click();
      const p = await point('OUT_VALUE'); await page.mouse.click(p.x, p.y);
    };
    try {
      await page.locator('#loadingStartBtn').click();
      if (surface === 'demo') await page.locator('#startLevelBtn').click(); // Wait for the initial tutorial launch to settle.
      for (const lang of ['ko', 'en']) for (const width of [1440, 420]) {
        await page.setViewportSize({ width, height: 980 });
        await page.evaluate(async lang => {
          window.currentLang = lang; document.documentElement.lang = lang;
          const levels = await import('./src/modules/levels.js');
          levels.configureLevelModule({ progressProvider: () => Array.from({ length: 48 }, (_, i) => i), canStartLevel: null });
          await levels.startLevel(25);
          const nav = await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
        }, lang);
        // Restoring while the intro is open must not execute anything.
        await restore(fixture); await page.waitForTimeout(600);
        assert.equal((await read()).tick, 0); assert.equal((await read()).running, false);
        await page.locator('#startLevelBtn').click(); await running(true);
        await page.locator('.memory-playback-speed input').fill('1');
        await page.waitForFunction(async () => (await import('./src/canvas/evaluation.js')).getExecutionState((await import('./src/modules/grid.js')).getPlayCircuit()).tick > 0);
        await page.locator('#wireMoveInfo').click();
        // Signal clicks/holds are not design edits: neither switch nor button
        // may pause playback or restart its tick interval while being pressed.
        await page.evaluate(async () => {
          const runner = (await import('./src/modules/grid.js')).getPlayController().tickRunner;
          const pause = runner.pause; window.inputPauses = 0;
          runner.pause = () => { window.inputPauses++; pause(); };
        });
        for (const id of ['DATA', 'LOAD']) {
          const p = await point(id), before = await read();
          await page.mouse.move(p.x, p.y); await page.mouse.down();
          await page.waitForTimeout(1100);
          assert.equal((await read()).running, true);
          assert.ok((await read()).tick > before.tick);
          await page.mouse.up();
          assert.equal(await page.evaluate(() => inputPauses), 0);
        }
        await page.locator('[data-memory-action=play]').click();
        const pausedInput = await read();
        for (const id of ['DATA', 'LOAD']) { const p = await point(id); await page.mouse.click(p.x, p.y); }
        await page.waitForTimeout(1100);
        assert.equal((await read()).running, false); assert.equal((await read()).tick, pausedInput.tick);
        await page.locator('[data-memory-action=play]').click();
        if (!process.argv.includes('--input-only')) await verifyExternalEditCancellation(page);
        if (process.argv.includes('--cancel-only')) {
          passed.push(`${surface}/${lang}/${width}: outside wire/selection release and Escape preserve runtime/history, clear previews, and retain playback intent`);
          console.log(passed.at(-1));
          continue;
        }
        if (process.argv.includes('--input-only')) {
          passed.push(`${surface}/${lang}/${width}: switch/button click and hold preserve automatic playback and manual pause without resetting ticks`);
          console.log(passed.at(-1));
          continue;
        }
        const baseline = await box();
        await page.locator('#wireDeleteInfo').click(); const lastD = await point('Q'); await page.mouse.click(lastD.x, lastD.y);
        await running(false); assert.deepEqual(await box(), baseline);
        assert.equal(await page.locator('.memory-playback-bar').isVisible(), true);
        await page.locator('#wireMoveInfo').click();
        await restore(empty); await running(false);
        assert.equal(await page.locator('.memory-playback-bar').isVisible(), true);
        assert.equal(await page.locator('[data-memory-action=play]').isDisabled(), true);
        assert.deepEqual(await box(), baseline);
        await restore(incomplete);
        const badge = page.locator('.circuit-diagnostic-badge'), details = page.locator('.circuit-diagnostics');
        assert.match(await badge.innerText(), lang === 'ko' ? /미완성/ : /Incomplete/);
        await badge.focus(); assert.equal(await details.isVisible(), true);
        await page.keyboard.press('Escape'); assert.equal(await details.isVisible(), false);
        await badge.hover(); assert.equal(await details.isVisible(), true);
        await page.mouse.move(0, 0); await page.locator('#gameTitle').focus();
        await badge.click(); assert.equal(await details.isVisible(), true);
        await page.mouse.click(0, 0);
        const tap = await badge.boundingBox();
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tap.x + tap.width / 2, y: tap.y + tap.height / 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach(); assert.equal(await details.isVisible(), true);
        assert.deepEqual(await box(), baseline);
        const locked = await read(); await page.waitForTimeout(1100); assert.equal((await read()).runtime, locked.runtime);
        await reject();
        assert.match(await page.locator('.circuit-edit-notice').innerText(), /OUTPUT/);
        const layout = await page.evaluate(() => {
          const rect = s => document.querySelector(s).getBoundingClientRect().toJSON();
          return { badge: rect('.circuit-diagnostic-badge'), toast: rect('.circuit-edit-notice'), canvas: rect('#overlayCanvas') };
        });
        assert.ok(layout.badge.bottom <= layout.canvas.top && layout.toast.bottom <= layout.canvas.top, JSON.stringify(layout));
        assert.ok(layout.toast.right <= layout.badge.left || layout.toast.bottom <= layout.badge.top || layout.badge.bottom <= layout.toast.top, JSON.stringify(layout));
        assert.deepEqual(await box(), baseline);
        await page.screenshot({ path: `test-results/playback-${surface}-${lang}-${width}.png` });
        measurements.push({ surface, lang, width, baseline, layout });
        await restore(fixture); await running(true);
        assert.equal(await badge.isVisible(), false); assert.deepEqual(await box(), baseline);
        // A manual pause survives restoration, a real D/EN swap, and repair.
        await page.locator('[data-memory-action=play]').click();
        await page.locator('#wireMoveInfo').click(); const d = await point('Q'); await page.mouse.click(d.x, d.y);
        await restore(incomplete); await restore(fixture); await page.waitForTimeout(1100);
        assert.equal((await read()).tick, 0); assert.equal((await read()).running, false);
        await page.locator('[data-memory-action=play]').click(); await running(true);
        await page.evaluate(async () => {
          const g = await import('./src/modules/grid.js'), e = await import('./src/canvas/evaluation.js'), c = g.getPlayCircuit();
          const s = e.getExecutionState(c); s.memory.set('Q', true); s.tick = 7;
          c.blocks.LOAD.value = true; c.blocks.DATA.value = true; e.previewCircuit(c);
        });
        // Refusal and cancel themselves preserve the full runtime; resume only schedules.
        await armProbe(); await reject(); await running(true);
        let probe = await page.evaluate(() => editProbe);
        assert.equal(probe.after, probe.before);
        await page.locator('#wireMoveInfo').click();
        const drag = await point('Q'); await page.mouse.move(drag.x, drag.y); await page.mouse.down();
        await page.mouse.move(drag.x + 15, drag.y + 15); await running(false);
        const paused = (await read()).tick; await page.waitForTimeout(1100); assert.equal((await read()).tick, paused);
        await page.keyboard.press('Escape'); await page.mouse.up(); await running(true);
        probe = await page.evaluate(() => editProbe);
        assert.equal(probe.cancelled, probe.before);
        // Repeated normal inputs cannot dismiss a toast. A new refusal resets its lifetime.
        // Measure inside the renderer so Electron IPC latency cannot consume the
        // toast's lifetime between a pointer command and an assertion.
        const out = await point('OUT_VALUE');
        const timing = await page.evaluate(async out => {
          const grid = await import('./src/modules/grid.js');
          const canvas = document.getElementById('overlayCanvas'), notice = document.querySelector('.circuit-edit-notice');
          const click = (x, y) => {
            for (const type of ['mousedown', 'mouseup']) canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
          };
          const refuse = () => {
            if (grid.getPlayController().state.mode !== 'wireDrawing') document.getElementById('wireStatusInfo').click();
            click(out.x, out.y);
          };
          return new Promise((resolve, reject) => {
            const samples = []; let renewed;
            const observer = new MutationObserver(() => {
              if (notice.hidden) {
                observer.disconnect(); clearTimeout(timeout);
                resolve({ samples, afterRenewal: performance.now() - renewed });
              }
            });
            const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Toast did not expire')); }, 8000);
            refuse(); observer.observe(notice, { attributes: true, attributeFilter: ['hidden'] });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', repeat: true, bubbles: true }));
            const r = canvas.getBoundingClientRect();
            click(r.x + Number(canvas.dataset.panelWidth) + 5, r.y + 5); // Empty circuit cell.
            canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.right - 2, clientY: r.bottom - 2 }));
            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
            samples.push(!notice.hidden);
            setTimeout(() => { samples.push(!notice.hidden); refuse(); renewed = performance.now(); }, 2100);
            setTimeout(() => samples.push(!notice.hidden), 3300); // Beyond the first timeout.
          });
        }, out);
        assert.deepEqual(timing.samples, [true, true, true]);
        assert.ok(timing.afterRenewal >= 2800 && timing.afterRenewal < 4000, JSON.stringify(timing));
        measurements.at(-1).timing = timing;
        assert.equal((await read()).running, true); assert.deepEqual(await box(), baseline);
        // Hidden/inert/background and grading/result gates resume without changing user intent.
        for (const gate of ['isScoring', 'isGradingResultOpen', 'inert', 'hidden', 'screen']) {
          await page.evaluate(gate => {
            if (gate === 'inert') document.getElementById('gameScreen').inert = true;
            else if (gate === 'screen') document.getElementById('gameScreen').style.display = 'none';
            else if (gate === 'hidden') Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            else window[gate] = true;
            document.dispatchEvent(new Event('bitwiser:scoring'));
          }, gate);
          await running(false); const stop = (await read()).runtime;
          await page.waitForTimeout(1100); assert.equal((await read()).runtime, stop);
          const resumed = await page.evaluate(gate => {
            if (gate === 'inert') document.getElementById('gameScreen').inert = false;
            else if (gate === 'screen') document.getElementById('gameScreen').style.display = 'flex';
            else if (gate === 'hidden') delete document.hidden;
            else window[gate] = false;
            document.dispatchEvent(new Event('bitwiser:scoring'));
            return runtimeNow();
          }, gate);
          assert.equal(resumed, stop); await running(true);
        }
        // Combinational stage uses the same badge/strip but cannot tick, even with D/button parts.
        await page.evaluate(async () => (await import('./src/modules/levels.js')).startLevel(1));
        await page.locator('#startLevelBtn').click(); await restore(incomplete);
        assert.equal(await page.locator('.memory-playback-bar').isVisible(), false);
        assert.equal(await badge.isVisible(), true); const combo = await box();
        await restore(fixture); await page.waitForTimeout(1100);
        assert.equal((await read()).tick, 0); assert.equal((await read()).running, false);
        assert.deepEqual(await box(), combo);
        console.log(`Verified ${surface}/${lang}/${width}`);
        passed.push(`${surface}/${lang}/${width}: fixed geometry, no-D bar, badge/popover, 3s toast/reset, autoplay/manual intent, outside wire/selection release, Escape, cancel/refusal and execution gates`);
      }
      assert.deepEqual(errors, []);
    } catch (e) {
      await page.screenshot({ path: `test-results/playback-${surface}-failure.png` }).catch(() => {}); throw e;
    } finally {
      if (app) await app.close(); else await page.close();
      if (server) await new Promise(resolve => server.close(resolve));
    }
  }
  await fs.writeFile(`test-results/playback-status${surfaces[0] === 'electron' ? '-electron' : ''}${process.argv.includes('--input-only') ? '-input' : process.argv.includes('--cancel-only') ? '-cancel' : ''}.json`, JSON.stringify({ passed, errors, measurements }, null, 2));
  console.log(JSON.stringify({ passed, errors }, null, 2));
} finally { await browser?.close(); }
