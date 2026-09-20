import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name.endsWith('/gif-test.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<script src="gif.js"></script>');
      return;
    }
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await fs.mkdir('test-results', { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const report = [];
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  for (const [entry, dpr] of [['', 1], ['dist-web-demo/', 2]]) {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/${entry}gif-test.html`);
    const result = await page.evaluate(async () => {
      const { createCircuitGif } = await import('./src/canvas/gifExport.js');
      const themes = await import('./src/themes.js');
      const { getExecutionState, tickCircuit } = await import('./src/canvas/evaluation.js');
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const circuit = {
        rows: 3, cols: 6,
        blocks: {
          input: { id: 'input', type: 'INPUT', inputMode: 'button', pos: { r: 1, c: 0 }, value: true },
          memory: { id: 'memory', type: 'D', pos: { r: 1, c: 5 }, value: false }
        },
        wires: { wire: { id: 'wire', startBlockId: 'input', endBlockId: 'memory', inputRole: 'D',
          path: Array.from({ length: 6 }, (_, c) => ({ r: 1, c })) } }
      };
      check(tickCircuit(circuit).ok, 'Fixture tick failed');
      circuit.blocks.input.value = true; // A pending button pulse must survive export.
      const state = getExecutionState(circuit);
      const stateSnapshot = () => JSON.stringify({ circuit, state }, (_, value) => value instanceof Map ? [...value] : value);
      const before = stateSnapshot();
      async function decode(blob) {
        const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        check(track.repetitionCount === Infinity, 'GIF must loop forever');
        const frames = [], durations = [];
        for (let index = 0; index < track.frameCount; index++) {
          const { image } = await decoder.decode({ frameIndex: index });
          const canvas = document.createElement('canvas');
          canvas.width = image.displayWidth; canvas.height = image.displayHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0);
          frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
          durations.push(image.duration);
          image.close();
        }
        decoder.close();
        return { frames, durations };
      }
      const checks = [];
      let sample;
      for (const theme of themes.getAvailableThemes()) {
        themes.setActiveTheme(theme.id);
        const blob = await createCircuitGif(circuit, { caption: '회로 흐름 / Circuit flow' });
        const { frames, durations } = await decode(blob);
        check(frames.length >= 15, `${theme.id}: insufficient motion samples`);
        check(frames[0].length === 314 * 206 * 4, 'Full grid/caption dimensions changed with DPR');
        check(durations.every(value => value === 30000), 'Uneven encoded frame timing');
        const differences = frames.map((frame, index) => {
          const next = frames[(index + 1) % frames.length];
          let changed = 0;
          for (let i = 0; i < frame.length; i += 4) {
            if (frame[i] === next[i] && frame[i + 1] === next[i + 1] && frame[i + 2] === next[i + 2]) continue;
            const x = (i / 4) % 314, y = Math.floor(i / 4 / 314);
            // Active blocks have translucent glow, so the wire can remain
            // visible under their edges as well as between the endpoints.
            check(x >= 27 && x <= 287 && y >= 76 && y <= 82, `${theme.id}: static pixels flicker at ${x},${y}`);
            changed++;
          }
          check(changed > 0, `${theme.id}: duplicate/stalled frame ${index}`);
          return changed;
        });
        const seam = differences.at(-1), interior = differences.slice(0, -1);
        check(seam >= Math.min(...interior) * 0.8 && seam <= Math.max(...interior) * 1.2,
          `${theme.id}: discontinuous loop seam: ${differences}`);
        check(stateSnapshot() === before,
          'Export changed D memory, tick, button, or design');
        checks.push({ theme: theme.id, frames: frames.length, differences, bytes: blob.size });
        if (!sample) sample = Array.from(new Uint8Array(await blob.arrayBuffer()));
      }
      // Changing the live circuit after export starts cannot enter later frames.
      const pending = createCircuitGif(circuit);
      circuit.blocks.input.value = false;
      circuit.blocks.memory.value = false;
      circuit.wires.wire.path[2].r = 2;
      const frozen = await pending;
      const frozenFrames = (await decode(frozen)).frames;
      check(frozenFrames.length === checks.at(-1).frames, 'Live edits changed the GIF frame count');
      // Compare against this GIF's first (pre-edit) frame: independent canvas
      // rasterizations/quantization need not produce byte-identical palettes.
      for (let frame = 1; frame < frozenFrames.length; frame++) {
        for (let i = 0; i < frozenFrames[0].length; i += 4) {
          const x = (i / 4) % 314, y = Math.floor(i / 4 / 314);
          if (x >= 27 && x <= 287 && y >= 76 && y <= 82) continue;
          check(frozenFrames[0][i] === frozenFrames[frame][i] &&
            frozenFrames[0][i + 1] === frozenFrames[frame][i + 1] &&
            frozenFrames[0][i + 2] === frozenFrames[frame][i + 2], `Live edits leaked into frame ${frame} at ${x},${y}`);
        }
      }
      const still = await decode(await createCircuitGif({ rows: 3, cols: 6, blocks: {}, wires: {} }));
      check(still.frames.length === 1, 'Empty circuit should produce a valid still GIF');
      return { checks, sample, statePreserved: true, editsIsolated: true, emptyCircuit: true };
    });
    assert.deepEqual(errors, []);
    await fs.writeFile(`test-results/gif-flow-${dpr}x.gif`, new Uint8Array(result.sample));
    report.push({ entry: entry || 'full', dpr, ...result, sample: undefined });
    if (!entry) {
      const largeCircuit = JSON.parse(await fs.readFile('tests/fixtures/stages/46-3.json', 'utf8')).circuit;
      const large = await page.evaluate(async circuit => {
        const { createCircuitGif } = await import('./src/canvas/gifExport.js');
        const started = performance.now();
        const blob = await createCircuitGif(circuit);
        const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
        await decoder.tracks.ready;
        const { image } = await decoder.decode({ frameIndex: decoder.tracks.selectedTrack.frameCount - 1 });
        const result = { width: image.displayWidth, height: image.displayHeight, bytes: blob.size,
          elapsedMs: Math.round(performance.now() - started) };
        image.close(); decoder.close();
        return result;
      }, largeCircuit);
      assert.equal(large.width, largeCircuit.cols * 52 + 2);
      assert.equal(large.height, largeCircuit.rows * 52 + 2);
      report.at(-1).largestStage = large;
    }
    await page.close();
  }
  await fs.writeFile('test-results/gif-flow.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
