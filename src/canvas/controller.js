import { CELL, coord, newWire } from './model.js';
import { drawGrid, renderContent, setupCanvas } from './renderer.js';
import { evaluate, startEngine } from './engine.js';

// Convert pixel coordinates to cell indices
export function pxToCell(x, y) {
  return { r: Math.floor(y / CELL), c: Math.floor(x / CELL) };
}

export function createController(canvasSet, circuit, ui = {}) {
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

  const wireBtn = ui.wireStatusInfo;
  const delBtn = ui.wireDeleteInfo;

  function updateButtons() {
    wireBtn?.classList.toggle('active', state.mode === 'wireDrawing');
    delBtn?.classList.toggle('active', state.mode === 'deleting');
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Control') {
      state.mode = 'wireDrawing';
      updateButtons();
    } else if (e.key === 'Shift') {
      state.mode = 'deleting';
      updateButtons();
    } else if (e.key.toLowerCase() === 'r') {
      circuit.blocks = {};
      circuit.wires = {};
      renderContent(contentCtx, circuit, 0);
    }
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'Control' && state.mode === 'wireDrawing') {
      state.mode = 'idle';
      state.wireTrace = [];
      overlayCtx.clearRect(0, 0, circuit.cols * CELL, circuit.rows * CELL);
      updateButtons();
    } else if (e.key === 'Shift' && state.mode === 'deleting') {
      state.mode = 'idle';
      updateButtons();
    }
  });

  wireBtn?.addEventListener('click', () => {
    state.mode = state.mode === 'wireDrawing' ? 'idle' : 'wireDrawing';
    updateButtons();
  });

  delBtn?.addEventListener('click', () => {
    state.mode = state.mode === 'deleting' ? 'idle' : 'deleting';
    updateButtons();
  });

  overlayCanvas.addEventListener('mousedown', e => {
    const { offsetX, offsetY } = e;
    const cell = pxToCell(offsetX, offsetY);
    if (state.mode === 'wireDrawing') {
      state.wireTrace = [coord(cell.r, cell.c)];
    } else if (state.mode === 'deleting') {
      const bid = Object.keys(circuit.blocks).find(id => {
        const b = circuit.blocks[id];
        return b.pos.r === cell.r && b.pos.c === cell.c;
      });
      if (bid) {
        delete circuit.blocks[bid];
      }
      Object.keys(circuit.wires).forEach(id => {
        if (circuit.wires[id].path.some(p => p.r === cell.r && p.c === cell.c)) {
          delete circuit.wires[id];
        }
      });
      renderContent(contentCtx, circuit, 0);
    } else {
      const blk = Object.values(circuit.blocks).find(b => b.pos.r === cell.r && b.pos.c === cell.c);
      if (blk && blk.type === 'INPUT') {
        blk.value = !blk.value;
        evaluate(circuit);
      }
    }
  });

  overlayCanvas.addEventListener('mouseup', e => {
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 1) {
      const id = 'w' + Date.now();
      circuit.wires[id] = newWire({ id, path: [...state.wireTrace] });
      renderContent(contentCtx, circuit, 0);
    }
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
