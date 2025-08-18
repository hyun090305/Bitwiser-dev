import { CELL, coord } from './model.js';
import { drawGrid, renderContent, setupCanvas } from './renderer.js';
import { evaluate, startEngine } from './engine.js';

// Convert pixel coordinates to cell indices
export function pxToCell(x, y) {
  return { r: Math.floor(y / CELL), c: Math.floor(x / CELL) };
}

export function createController(canvasSet, circuit) {
  const { bgCanvas, contentCanvas, overlayCanvas } = canvasSet;
  const bgCtx = setupCanvas(bgCanvas, circuit.cols * CELL, circuit.rows * CELL);
  const contentCtx = setupCanvas(contentCanvas, circuit.cols * CELL, circuit.rows * CELL);
  const overlayCtx = setupCanvas(overlayCanvas, circuit.cols * CELL, circuit.rows * CELL);
  drawGrid(bgCtx, circuit.rows, circuit.cols);
  startEngine(contentCtx, circuit, renderContent);

  const state = {
    mode: 'idle',
    placingType: null,
    wireTrace: [],
    startBlockId: null,
  };

  overlayCanvas.addEventListener('mousedown', e => {
    const { offsetX, offsetY } = e;
    const cell = pxToCell(offsetX, offsetY);
    state.mode = 'placingBlock';
    state.lastCell = cell;
  });
  overlayCanvas.addEventListener('mouseup', () => {
    state.mode = 'idle';
    state.wireTrace = [];
    overlayCtx.clearRect(0, 0, circuit.cols * CELL, circuit.rows * CELL);
  });

  overlayCanvas.addEventListener('mousemove', e => {
    if (state.mode !== 'wireDrawing') return;
    const { offsetX, offsetY } = e;
    const cell = pxToCell(offsetX, offsetY);
    const last = state.wireTrace[state.wireTrace.length - 1];
    if (!last || last.r !== cell.r || last.c !== cell.c) {
      state.wireTrace.push(coord(cell.r, cell.c));
      overlayCtx.clearRect(0, 0, circuit.cols * CELL, circuit.rows * CELL);
      overlayCtx.save();
      overlayCtx.strokeStyle = 'rgba(17,17,17,0.4)';
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([8, 8]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(state.wireTrace[0].c * CELL + CELL / 2, state.wireTrace[0].r * CELL + CELL / 2);
      state.wireTrace.forEach(p => {
        overlayCtx.lineTo(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2);
      });
      overlayCtx.stroke();
      overlayCtx.restore();
    }
  });

  return { state, circuit };
}
