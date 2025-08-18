import { CELL, coord, newWire, newBlock } from './model.js';
import { drawGrid, renderContent, setupCanvas, drawBlock } from './renderer.js';
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
    draggingBlock: null,
    dragCandidate: null,
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
      const bid = Object.keys(circuit.blocks).find(id => {
        const b = circuit.blocks[id];
        return b.pos.r === cell.r && b.pos.c === cell.c;
      });
      if (bid) {
        state.dragCandidate = { id: bid, start: cell };
      }
    }
  });

  overlayCanvas.addEventListener('mouseup', e => {
    const { offsetX, offsetY } = e;
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 1) {
      const id = 'w' + Date.now();
      circuit.wires[id] = newWire({ id, path: [...state.wireTrace] });
      renderContent(contentCtx, circuit, 0);
    } else if (state.draggingBlock) {
      const cell = pxToCell(offsetX, offsetY);
      const id = state.draggingBlock.id || ('b' + Date.now());
      circuit.blocks[id] = newBlock({
        id,
        type: state.draggingBlock.type,
        name: state.draggingBlock.name,
        pos: cell
      });
      renderContent(contentCtx, circuit, 0);
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, circuit.cols * CELL, circuit.rows * CELL);
    } else if (state.dragCandidate) {
      const blk = circuit.blocks[state.dragCandidate.id];
      if (blk && blk.type === 'INPUT') {
        blk.value = !blk.value;
        evaluate(circuit);
      }
      state.dragCandidate = null;
    }
    state.wireTrace = [];
  });

  overlayCanvas.addEventListener('mousemove', e => {
    const { offsetX, offsetY } = e;
    const cell = pxToCell(offsetX, offsetY);
    if (state.mode === 'wireDrawing') {
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
    } else {
      if (state.dragCandidate && (cell.r !== state.dragCandidate.start.r || cell.c !== state.dragCandidate.start.c)) {
        const b = circuit.blocks[state.dragCandidate.id];
        if (b) {
          state.draggingBlock = {
            id: state.dragCandidate.id,
            type: b.type,
            name: b.name,
            origPos: b.pos
          };
          delete circuit.blocks[state.dragCandidate.id];
          renderContent(contentCtx, circuit, 0);
        }
        state.dragCandidate = null;
      }
      overlayCtx.clearRect(0, 0, circuit.cols * CELL, circuit.rows * CELL);
      if (state.draggingBlock) {
        overlayCtx.save();
        overlayCtx.globalAlpha = 0.5;
        drawBlock(overlayCtx, { type: state.draggingBlock.type, name: state.draggingBlock.name, pos: cell });
        overlayCtx.restore();
      }
    }
  });

  document.addEventListener('mouseup', e => {
    if (state.draggingBlock && e.target !== overlayCanvas) {
      if (state.draggingBlock.origPos) {
        const { id, type, name, origPos } = state.draggingBlock;
        circuit.blocks[id] = newBlock({ id, type, name, pos: origPos });
        renderContent(contentCtx, circuit, 0);
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, circuit.cols * CELL, circuit.rows * CELL);
    }
    state.dragCandidate = null;
  });

  function startBlockDrag(type, name) {
    state.draggingBlock = { type, name };
  }

  return { state, circuit, startBlockDrag };
}
