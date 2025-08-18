import { CELL, coord, newWire, newBlock } from './model.js';
import { drawGrid, renderContent, setupCanvas, drawBlock } from './renderer.js';
import { evaluate, startEngine } from './engine.js';

const PANEL_CELLS = 3;
const PANEL_WIDTH = PANEL_CELLS * CELL;

// Convert pixel coordinates to cell indices (clamped to grid)
export function pxToCell(x, y, circuit, xOffset = 0) {
  const r = Math.min(circuit.rows - 1, Math.max(0, Math.floor(y / CELL)));
  const c = Math.min(
    circuit.cols - 1,
    Math.max(0, Math.floor((x - xOffset) / CELL))
  );
  return { r, c };
}

export function createController(canvasSet, circuit, ui = {}) {
  const { bgCanvas, contentCanvas, overlayCanvas } = canvasSet;
  const width = PANEL_WIDTH + circuit.cols * CELL;
  const height = circuit.rows * CELL;
  const bgCtx = setupCanvas(bgCanvas, width, height);
  const contentCtx = setupCanvas(contentCanvas, width, height);
  const overlayCtx = setupCanvas(overlayCanvas, width, height);
  drawGrid(bgCtx, circuit.rows, circuit.cols, PANEL_WIDTH);

  const paletteBlocks = [
    { type: 'INPUT', name: 'IN', pos: { r: 0, c: 0 } },
    { type: 'AND', name: 'AND', pos: { r: 1, c: 0 } },
    { type: 'OR', name: 'OR', pos: { r: 2, c: 0 } },
    { type: 'NOT', name: 'NOT', pos: { r: 3, c: 0 } },
    { type: 'OUTPUT', name: 'OUT', pos: { r: 4, c: 0 } }
  ];
  const trashCell = { r: circuit.rows - 1, c: 0 };

  function drawPanel() {
    paletteBlocks.forEach(b => drawBlock(bgCtx, b));
    bgCtx.save();
    bgCtx.fillStyle = '#eee';
    bgCtx.fillRect(trashCell.c * CELL, trashCell.r * CELL, CELL, CELL);
    bgCtx.fillStyle = '#333';
    bgCtx.font = '20px sans-serif';
    bgCtx.textAlign = 'center';
    bgCtx.textBaseline = 'middle';
    bgCtx.fillText('🗑️', trashCell.c * CELL + CELL / 2, trashCell.r * CELL + CELL / 2);
    bgCtx.restore();
    bgCtx.save();
    bgCtx.strokeStyle = '#999';
    bgCtx.beginPath();
    bgCtx.moveTo(PANEL_WIDTH, 0);
    bgCtx.lineTo(PANEL_WIDTH, height);
    bgCtx.stroke();
    bgCtx.restore();
  }
  drawPanel();

  startEngine(contentCtx, circuit, (ctx, circ, phase) => renderContent(ctx, circ, phase, PANEL_WIDTH));

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
  const usedBlocksEl = ui.usedBlocksEl;
  const usedWiresEl = ui.usedWiresEl;

  function updateUsageCounts() {
    const blockCount = Object.keys(circuit.blocks).length;
    const wireCount = Object.keys(circuit.wires).length;
    if (usedBlocksEl) usedBlocksEl.textContent = blockCount;
    if (usedWiresEl) usedWiresEl.textContent = wireCount;
  }

  function blockAt(cell) {
    return Object.values(circuit.blocks).find(b => b.pos.r === cell.r && b.pos.c === cell.c);
  }

  function cellHasWire(cell) {
    return Object.values(circuit.wires).some(w => w.path.some(p => p.r === cell.r && p.c === cell.c));
  }

  function isValidWire(trace) {
    if (trace.length < 2) return false;
    const startBlock = blockAt(trace[0]);
    const endBlock = blockAt(trace[trace.length - 1]);
    if (!startBlock || !endBlock || startBlock.id === endBlock.id) return false;
    const seen = new Set();
    for (let i = 0; i < trace.length; i++) {
      const p = trace[i];
      const key = `${p.r},${p.c}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (i > 0) {
        const prev = trace[i - 1];
        const dr = Math.abs(p.r - prev.r);
        const dc = Math.abs(p.c - prev.c);
        if (dr + dc !== 1) return false;
      }
      if (i > 0 && i < trace.length - 1) {
        if (blockAt(p) || cellHasWire(p)) return false;
      }
    }
    return true;
  }

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
      renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
      updateUsageCounts();
    }
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'Control' && state.mode === 'wireDrawing') {
      state.mode = 'idle';
      state.wireTrace = [];
      overlayCtx.clearRect(0, 0, width, height);
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
    if (offsetX < PANEL_WIDTH) {
      const r = Math.floor(offsetY / CELL);
      const block = paletteBlocks.find(b => b.pos.r === r);
      if (block) startBlockDrag(block.type, block.name);
      return;
    }
    const cell = pxToCell(offsetX, offsetY, circuit, PANEL_WIDTH);
    if (state.mode === 'wireDrawing') {
      state.wireTrace = [coord(cell.r, cell.c)];
    } else if (state.mode === 'deleting') {
      const bid = Object.keys(circuit.blocks).find(id => {
        const b = circuit.blocks[id];
        return b.pos.r === cell.r && b.pos.c === cell.c;
      });
      if (bid) {
        delete circuit.blocks[bid];
        Object.keys(circuit.wires).forEach(wid => {
          const w = circuit.wires[wid];
          if (w.startBlockId === bid || w.endBlockId === bid) {
            const endB = circuit.blocks[w.endBlockId];
            if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
            delete circuit.wires[wid];
          }
        });
      } else {
        Object.keys(circuit.wires).forEach(id => {
          const w = circuit.wires[id];
          if (w.path.some(p => p.r === cell.r && p.c === cell.c)) {
            const endB = circuit.blocks[w.endBlockId];
            if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
            delete circuit.wires[id];
          }
        });
      }
      renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
      updateUsageCounts();
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
      if (isValidWire(state.wireTrace)) {
        const id = 'w' + Date.now();
        const startBlock = blockAt(state.wireTrace[0]);
        const endBlock = blockAt(state.wireTrace[state.wireTrace.length - 1]);
        circuit.wires[id] = newWire({ id, path: [...state.wireTrace], startBlockId: startBlock.id, endBlockId: endBlock.id });
        endBlock.inputs = [...(endBlock.inputs || []), startBlock.id];
        renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
        updateUsageCounts();
      }
      overlayCtx.clearRect(0, 0, width, height);
    } else if (state.draggingBlock) {
      const withinGrid =
        offsetX >= PANEL_WIDTH &&
        offsetX < PANEL_WIDTH + circuit.cols * CELL &&
        offsetY >= 0 &&
        offsetY < circuit.rows * CELL;
      if (withinGrid) {
        const cell = pxToCell(offsetX, offsetY, circuit, PANEL_WIDTH);
        const id = state.draggingBlock.id || ('b' + Date.now());
        circuit.blocks[id] = newBlock({
          id,
          type: state.draggingBlock.type,
          name: state.draggingBlock.name,
          pos: cell
        });
        renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
        updateUsageCounts();
        state.draggingBlock = null;
        overlayCtx.clearRect(0, 0, width, height);
      }
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
    const cell = pxToCell(offsetX, offsetY, circuit, PANEL_WIDTH);
    if (state.mode === 'wireDrawing') {
      const last = state.wireTrace[state.wireTrace.length - 1];
      if (!last || last.r !== cell.r || last.c !== cell.c) {
        state.wireTrace.push(coord(cell.r, cell.c));
        overlayCtx.clearRect(0, 0, width, height);
        overlayCtx.save();
        overlayCtx.strokeStyle = 'rgba(17,17,17,0.4)';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([8, 8]);
        overlayCtx.beginPath();
        overlayCtx.moveTo(
          PANEL_WIDTH + state.wireTrace[0].c * CELL + CELL / 2,
          state.wireTrace[0].r * CELL + CELL / 2
        );
        state.wireTrace.forEach(p => {
          overlayCtx.lineTo(PANEL_WIDTH + p.c * CELL + CELL / 2, p.r * CELL + CELL / 2);
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
          Object.keys(circuit.wires).forEach(wid => {
            const w = circuit.wires[wid];
            if (w.startBlockId === state.dragCandidate.id || w.endBlockId === state.dragCandidate.id) {
              const endB = circuit.blocks[w.endBlockId];
              if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
              delete circuit.wires[wid];
            }
          });
          renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
          updateUsageCounts();
        }
        state.dragCandidate = null;
      }
      overlayCtx.clearRect(0, 0, width, height);
      if (state.draggingBlock) {
        overlayCtx.save();
        overlayCtx.globalAlpha = 0.5;
        drawBlock(overlayCtx, { type: state.draggingBlock.type, name: state.draggingBlock.name, pos: cell }, PANEL_WIDTH);
        overlayCtx.restore();
      }
    }
  });

  document.addEventListener('mousemove', e => {
    if (!state.draggingBlock) return;
    const rect = overlayCanvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      overlayCtx.clearRect(0, 0, width, height);
    }
  });

  document.addEventListener('mouseup', e => {
    if (state.draggingBlock) {
      const rect = overlayCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const overTrash =
        x >= trashCell.c * CELL &&
        x <= trashCell.c * CELL + CELL &&
        y >= trashCell.r * CELL &&
        y <= trashCell.r * CELL + CELL;
      const inGrid =
        x >= PANEL_WIDTH &&
        x < PANEL_WIDTH + circuit.cols * CELL &&
        y >= 0 &&
        y < circuit.rows * CELL;
      if (overTrash && state.draggingBlock.id) {
        Object.keys(circuit.wires).forEach(wid => {
          const w = circuit.wires[wid];
          if (w.startBlockId === state.draggingBlock.id || w.endBlockId === state.draggingBlock.id) {
            const endB = circuit.blocks[w.endBlockId];
            if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
            delete circuit.wires[wid];
          }
        });
        renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
        updateUsageCounts();
      } else if (!inGrid) {
        if (state.draggingBlock.origPos) {
          const { id, type, name, origPos } = state.draggingBlock;
          circuit.blocks[id] = newBlock({ id, type, name, pos: origPos });
          renderContent(contentCtx, circuit, 0, PANEL_WIDTH);
          updateUsageCounts();
        }
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, width, height);
    }
    state.dragCandidate = null;
  });

  function startBlockDrag(type, name) {
    state.draggingBlock = { type, name };
  }

  updateUsageCounts();
  return { state, circuit, startBlockDrag };
}
