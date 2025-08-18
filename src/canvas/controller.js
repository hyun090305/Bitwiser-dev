import { CELL, coord, newWire, newBlock } from './model.js';
import { drawGrid, renderContent, setupCanvas, drawBlock, drawPanel } from './renderer.js';
import { evaluate, startEngine } from './engine.js';

// Convert pixel coordinates to cell indices (clamped to grid)
export function pxToCell(x, y, circuit, offsetX = 0) {
  const r = Math.min(circuit.rows - 1, Math.max(0, Math.floor(y / CELL)));
  const c = Math.min(circuit.cols - 1, Math.max(0, Math.floor((x - offsetX) / CELL)));
  return { r, c };
}

export function createController(canvasSet, circuit, ui = {}, options = {}) {
  const { palette = [], paletteGroups = [], panelWidth = 120 } = options;
  const gap = 10;
  const PALETTE_ITEM_H = 50;
  const LABEL_H = 20;
  const { bgCanvas, contentCanvas, overlayCanvas } = canvasSet;
  let panelTotalWidth = panelWidth;
  let canvasHeight = circuit.rows * CELL;
  let paletteItems = [];

  if (paletteGroups.length > 0) {
    const colWidth = (panelWidth - (paletteGroups.length + 1) * gap) / paletteGroups.length;
    panelTotalWidth = panelWidth;
    let colHeights = new Array(paletteGroups.length).fill(0);
    paletteGroups.forEach((g, gi) => {
      let x = gap + gi * (colWidth + gap);
      let y = 10;
      paletteItems.push({ kind: 'label', label: g.label, x, y, w: colWidth, h: LABEL_H });
      y += LABEL_H + 5;
      g.items.forEach(it => {
        paletteItems.push({ type: it.type, label: it.label || it.type, x, y, w: colWidth, h: PALETTE_ITEM_H - 10 });
        y += PALETTE_ITEM_H;
      });
      colHeights[gi] = y;
    });
    canvasHeight = Math.max(canvasHeight, Math.max(...colHeights) + PALETTE_ITEM_H);
    var trashRect = { x: gap, y: canvasHeight - PALETTE_ITEM_H, w: panelTotalWidth - 2 * gap, h: PALETTE_ITEM_H - 20 };
  } else {
    panelTotalWidth = panelWidth;
    paletteItems = palette.map((type, i) => ({
      type,
      label: type,
      x: gap,
      y: 10 + i * PALETTE_ITEM_H,
      w: panelWidth - 2 * gap,
      h: PALETTE_ITEM_H - 20,
    }));
    canvasHeight = Math.max(canvasHeight, palette.length * PALETTE_ITEM_H + 60);
    var trashRect = { x: gap, y: canvasHeight - PALETTE_ITEM_H, w: panelWidth - 2 * gap, h: PALETTE_ITEM_H - 20 };
  }

  const canvasWidth = panelTotalWidth + circuit.cols * CELL;
  const bgCtx = setupCanvas(bgCanvas, canvasWidth, canvasHeight);
  const contentCtx = setupCanvas(contentCanvas, canvasWidth, canvasHeight);
  const overlayCtx = setupCanvas(overlayCanvas, canvasWidth, canvasHeight);
  drawGrid(bgCtx, circuit.rows, circuit.cols, panelTotalWidth);
  drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, trashRect);
  startEngine(contentCtx, circuit, (ctx, circ, phase) => renderContent(ctx, circ, phase, panelTotalWidth));

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
      renderContent(contentCtx, circuit, 0, panelTotalWidth);
      updateUsageCounts();
    }
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'Control' && state.mode === 'wireDrawing') {
      state.mode = 'idle';
      state.wireTrace = [];
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
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
    if (offsetX < panelTotalWidth) {
      const item = paletteItems.find(it =>
        it.type &&
        offsetX >= it.x && offsetX <= it.x + it.w &&
        offsetY >= it.y && offsetY <= it.y + it.h
      );
      if (item) {
        state.draggingBlock = { type: item.type, name: item.label };
      }
      return;
    }
    if (offsetX >= panelTotalWidth && offsetX < canvasWidth && offsetY >= 0 && offsetY < circuit.rows * CELL) {
      const cell = pxToCell(offsetX, offsetY, circuit, panelTotalWidth);
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
        renderContent(contentCtx, circuit, 0, panelTotalWidth);
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
        renderContent(contentCtx, circuit, 0, panelTotalWidth);
        updateUsageCounts();
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    } else if (state.draggingBlock) {
      if (offsetX >= panelTotalWidth && offsetX < canvasWidth && offsetY >= 0 && offsetY < circuit.rows * CELL) {
        const cell = pxToCell(offsetX, offsetY, circuit, panelTotalWidth);
        const id = state.draggingBlock.id || ('b' + Date.now());
        circuit.blocks[id] = newBlock({
          id,
          type: state.draggingBlock.type,
          name: state.draggingBlock.name,
          pos: cell
        });
        renderContent(contentCtx, circuit, 0, panelTotalWidth);
        updateUsageCounts();
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
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
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 0 && e.buttons === 1) {
      if (offsetX < panelTotalWidth || offsetX >= canvasWidth || offsetY < 0 || offsetY >= circuit.rows * CELL) return;
      const cell = pxToCell(offsetX, offsetY, circuit, panelTotalWidth);
      const last = state.wireTrace[state.wireTrace.length - 1];
      if (!last || last.r !== cell.r || last.c !== cell.c) {
        state.wireTrace.push(coord(cell.r, cell.c));
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        overlayCtx.save();
        overlayCtx.strokeStyle = 'rgba(17,17,17,0.4)';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([8, 8]);
        overlayCtx.beginPath();
        overlayCtx.moveTo(panelTotalWidth + state.wireTrace[0].c * CELL + CELL / 2, state.wireTrace[0].r * CELL + CELL / 2);
        state.wireTrace.forEach(p => {
          overlayCtx.lineTo(panelTotalWidth + p.c * CELL + CELL / 2, p.r * CELL + CELL / 2);
        });
        overlayCtx.stroke();
        overlayCtx.restore();
      }
    } else {
      if (offsetX >= panelTotalWidth && offsetX < canvasWidth && offsetY >= 0 && offsetY < circuit.rows * CELL) {
        const cell = pxToCell(offsetX, offsetY, circuit, panelTotalWidth);
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
            renderContent(contentCtx, circuit, 0, panelTotalWidth);
            updateUsageCounts();
          }
          state.dragCandidate = null;
        }
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (state.draggingBlock) {
          overlayCtx.save();
          overlayCtx.globalAlpha = 0.5;
          drawBlock(overlayCtx, { type: state.draggingBlock.type, name: state.draggingBlock.name, pos: cell }, panelTotalWidth);
          overlayCtx.restore();
        }
      } else {
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      }
    }
  });

  document.addEventListener('mousemove', e => {
    if (!state.draggingBlock) return;
    const rect = overlayCanvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
  });

  document.addEventListener('mouseup', e => {
    if (state.draggingBlock) {
      const rect = overlayCanvas.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      const overTrash = ox >= trashRect.x && ox <= trashRect.x + trashRect.w && oy >= trashRect.y && oy <= trashRect.y + trashRect.h;
      if (overTrash && state.draggingBlock.id) {
        Object.keys(circuit.wires).forEach(wid => {
          const w = circuit.wires[wid];
          if (w.startBlockId === state.draggingBlock.id || w.endBlockId === state.draggingBlock.id) {
            const endB = circuit.blocks[w.endBlockId];
            if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
            delete circuit.wires[wid];
          }
        });
        renderContent(contentCtx, circuit, 0, panelTotalWidth);
        updateUsageCounts();
      } else if (ox < panelTotalWidth || ox >= canvasWidth || oy < 0 || oy >= circuit.rows * CELL) {
        if (state.draggingBlock.origPos) {
          const { id, type, name, origPos } = state.draggingBlock;
          circuit.blocks[id] = newBlock({ id, type, name, pos: origPos });
          renderContent(contentCtx, circuit, 0, panelTotalWidth);
          updateUsageCounts();
        }
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    state.dragCandidate = null;
  });

  function startBlockDrag(type, name) {
    state.draggingBlock = { type, name };
  }

  updateUsageCounts();
  return { state, circuit, startBlockDrag };
}
