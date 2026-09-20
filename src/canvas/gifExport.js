import { CELL, GAP } from './model.js';
import { snapshotCircuit } from './circuitData.js';
import { WIRE_FLOW_SPEED } from './engine.js';
import { drawGrid, renderContent, getWireFlowPeriod } from './renderer.js';
import { getActiveTheme } from '../themes.js';

export async function createCircuitGif(circuit, { caption = '' } = {}) {
  // Freeze the displayed values as well as the design. A design snapshot alone
  // resets D/button values; evaluating it would also lose the current Q state.
  const snapshot = snapshotCircuit(circuit);
  for (const [id, block] of Object.entries(circuit.blocks)) {
    snapshot.blocks[id].value = block.value;
  }
  const options = { theme: getActiveTheme(), preserveExisting: true };
  const width = snapshot.cols * (CELL + GAP) + GAP;
  const gridHeight = snapshot.rows * (CELL + GAP) + GAP;
  const height = gridHeight + (caption ? 48 : 0);
  const makeCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.dataset.dpr = '1';
    return canvas;
  };
  const background = makeCanvas();
  const backgroundCtx = background.getContext('2d', { willReadFrequently: true });
  drawGrid(backgroundCtx, snapshot.rows, snapshot.cols, 0, null, options);
  if (caption) {
    backgroundCtx.fillStyle = '#f8fafc';
    backgroundCtx.fillRect(0, gridHeight, width, 48);
    backgroundCtx.fillStyle = '#312e81';
    backgroundCtx.font = '12px sans-serif';
    backgroundCtx.fillText(caption, 8, gridHeight + 28, width - 16);
  }
  const canvas = makeCanvas();
  // Encoding reads every frame. Keep one rendering backend throughout capture;
  // automatic GPU-to-CPU switching can otherwise change shadows mid-animation.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const gif = new GIF({
    workers: 2, workerScript: 'gif.worker.js', quality: 10,
    width, height, repeat: 0, globalPalette: true
  });
  // GIF delays use centiseconds. Sample one complete dash period at ~33 fps,
  // excluding the duplicated endpoint so the loop boundary is one normal step.
  const delay = 30;
  const period = getWireFlowPeriod(options);
  const frameCount = period > 0 && Object.keys(snapshot.wires).length
    ? Math.max(2, Math.round(period / (WIRE_FLOW_SPEED * delay / 1000))) : 1;
  for (let frame = 0; frame < frameCount; frame++) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(background, 0, 0);
    renderContent(ctx, snapshot, period * frame / frameCount, 0, null, null, options);
    gif.addFrame(ctx, { delay, copy: true });
    // Yield for the UI, but never use wall-clock time or the live canvas as a
    // frame source: timer throttling and editing cannot disturb this loop.
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { gif.abort(); reject(new Error('GIF export timed out')); }, 30000);
    gif.on('finished', blob => { clearTimeout(timeout); resolve(blob); });
    gif.on('abort', () => { clearTimeout(timeout); reject(new Error('GIF export aborted')); });
    try { gif.render(); } catch (error) { clearTimeout(timeout); reject(error); }
  });
}
