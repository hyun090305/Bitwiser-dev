import { CELL, GAP, coord, newWire, newBlock } from './model.js';
import { drawGrid, renderContent, setupCanvas, drawBlock, drawPanel } from './renderer.js';
import { evaluate, startEngine } from './engine.js';

// Convert pixel coordinates to cell indices, considering scale and pan.
export function pxToCell(x, y, circuit, panelOffset = 0, scale = 1, pan = { x: 0, y: 0 }) {
  const gx = (x - panelOffset - pan.x) / scale;
  const gy = (y - pan.y) / scale;
  const gridW = circuit.cols * (CELL + GAP) + GAP;
  const gridH = circuit.rows * (CELL + GAP) + GAP;
  if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return null;
  const r = Math.floor((gy - GAP) / (CELL + GAP));
  const c = Math.floor((gx - GAP) / (CELL + GAP));
  return { r, c };
}

export function createController(canvasSet, circuit, ui = {}, options = {}) {
  const { palette = [], paletteGroups = [], panelWidth = 180 } = options;
  const gap = 10;
  const PALETTE_ITEM_H = 50;
  const LABEL_H = 20;
  const GROUP_PADDING = 8;
  const { bgCanvas, contentCanvas, overlayCanvas } = canvasSet;
  const gridWidth = circuit.cols * (CELL + GAP) + GAP;
  const gridHeight = circuit.rows * (CELL + GAP) + GAP;
  let panelTotalWidth = panelWidth;
  let canvasHeight = gridHeight;
  let paletteItems = [];
  let groupRects = [];
  let gridScale = 1;
  let gridOffset = { x: 0, y: 0 };

  if (paletteGroups.length > 0) {
    const colWidth =
      (panelWidth - (paletteGroups.length + 1) * gap) / paletteGroups.length;
    panelTotalWidth = panelWidth;
    let colHeights = new Array(paletteGroups.length).fill(0);
    paletteGroups.forEach((g, gi) => {
      const x = gap + gi * (colWidth + gap);
      const y = 10;
      const padding = GROUP_PADDING;
      let currentY = y + padding + LABEL_H + 5;
      g.items.forEach(it => {
        paletteItems.push({
          type: it.type,
          label: it.label || it.type,
          x: x + padding,
          y: currentY,
          w: colWidth - 2 * padding,
          h: PALETTE_ITEM_H - 20,
          hidden: false,
        });
        currentY += PALETTE_ITEM_H;
      });
      const groupHeight = LABEL_H + 5 + g.items.length * PALETTE_ITEM_H + padding * 2 - 10;
      groupRects.push({ label: g.label, x, y, w: colWidth, h: groupHeight, padding });
      colHeights[gi] = y + groupHeight;
    });
    canvasHeight = Math.max(
      canvasHeight,
      Math.max(...colHeights) + PALETTE_ITEM_H
    );
    var trashRect = {
      x: gap,
      y: canvasHeight - PALETTE_ITEM_H,
      w: panelTotalWidth - 2 * gap,
      h: PALETTE_ITEM_H - 20,
    };
  } else {
    panelTotalWidth = panelWidth;
    paletteItems = palette.map((type, i) => ({
      type,
      label: type,
      x: gap,
      y: 10 + i * PALETTE_ITEM_H,
      w: panelWidth - 2 * gap,
      h: PALETTE_ITEM_H - 20,
      hidden: false,
    }));
    canvasHeight = Math.max(canvasHeight, palette.length * PALETTE_ITEM_H + 60);
    var trashRect = { x: gap, y: canvasHeight - PALETTE_ITEM_H, w: panelWidth - 2 * gap, h: PALETTE_ITEM_H - 20 };
  }

  const canvasWidth = panelTotalWidth + gridWidth;
  const bgCtx = setupCanvas(bgCanvas, canvasWidth, canvasHeight);
  const contentCtx = setupCanvas(contentCanvas, canvasWidth, canvasHeight);
  const overlayCtx = setupCanvas(overlayCanvas, canvasWidth, canvasHeight);

  const state = {
    mode: 'idle',
    placingType: null,
    wireTrace: [],
    startBlockId: null,
    draggingBlock: null,
    dragCandidate: null,
    hoverBlockId: null,
  };

  let isPinching = false;
  let lastPinchDist = 0;
  let lastMid = { x: 0, y: 0 };

  function touchDist(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  function touchMid(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  function drawBackground() {
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, trashRect, groupRects);
    bgCtx.save();
    bgCtx.translate(panelTotalWidth + gridOffset.x, gridOffset.y);
    bgCtx.scale(gridScale, gridScale);
    drawGrid(bgCtx, circuit.rows, circuit.cols, 0);
    bgCtx.restore();
  }

  function drawForeground(phase = 0) {
    contentCtx.setTransform(1, 0, 0, 1, 0, 0);
    contentCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    contentCtx.save();
    contentCtx.translate(panelTotalWidth + gridOffset.x, gridOffset.y);
    contentCtx.scale(gridScale, gridScale);
    renderContent(contentCtx, circuit, phase, 0, state.hoverBlockId);
    contentCtx.restore();
  }

  drawBackground();
  drawForeground();
  startEngine(contentCtx, circuit, (ctx, circ, phase) => {
    drawForeground(phase);
  });

  function redrawPanel() {
    drawBackground();
  }

  function hidePaletteItem(type, label) {
    const item = paletteItems.find(it => it.type === type && it.label === label);
    if (item) {
      item.hidden = true;
      redrawPanel();
    }
  }

  function showPaletteItem(type, label) {
    const item = paletteItems.find(it => it.type === type && it.label === label);
    if (item) {
      item.hidden = false;
      redrawPanel();
    }
  }

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

  // 공통 포인터 좌표 계산 (마우스/터치)
  function getPointerPos(e) {
    const rect = e.target.getBoundingClientRect();
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    };
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
      paletteItems.forEach(it => it.hidden = false);
      redrawPanel();
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

  function handlePointerDown(e) {
    const { x, y } = getPointerPos(e);
    if (x < panelTotalWidth) {
      const item = paletteItems.find(
        it =>
          it.type && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h
      );
      if (item) {
        state.draggingBlock = { type: item.type, name: item.label };
      }
      return;
    }
    const cell = pxToCell(x, y, circuit, panelTotalWidth, gridScale, gridOffset);
    if (cell) {
      if (state.mode === 'wireDrawing') {
        state.wireTrace = [coord(cell.r, cell.c)];
      } else if (state.mode === 'deleting') {
        const bid = Object.keys(circuit.blocks).find(id => {
          const b = circuit.blocks[id];
          return b.pos.r === cell.r && b.pos.c === cell.c;
        });
        if (bid) {
          const b = circuit.blocks[bid];
          if (b && (b.type === 'INPUT' || b.type === 'OUTPUT')) {
            showPaletteItem(b.type, b.name);
          }
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
        drawForeground();
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
  }

  overlayCanvas.addEventListener('mousedown', handlePointerDown);
  overlayCanvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      isPinching = true;
      state.wireTrace = [];
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      lastPinchDist = touchDist(e.touches[0], e.touches[1]);
      const rect = overlayCanvas.getBoundingClientRect();
      const m = touchMid(e.touches[0], e.touches[1]);
      lastMid = { x: m.x - rect.left, y: m.y - rect.top };
      return;
    }
    e.preventDefault();
    handlePointerDown(e);
  }, { passive: false });

  function handlePointerUp(e) {
    const { x, y } = getPointerPos(e);
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 1) {
      if (isValidWire(state.wireTrace)) {
        const id = 'w' + Date.now();
        const startBlock = blockAt(state.wireTrace[0]);
        const endBlock = blockAt(state.wireTrace[state.wireTrace.length - 1]);
        circuit.wires[id] = newWire({ id, path: [...state.wireTrace], startBlockId: startBlock.id, endBlockId: endBlock.id });
        endBlock.inputs = [...(endBlock.inputs || []), startBlock.id];
        drawForeground();
        updateUsageCounts();
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    } else if (state.draggingBlock) {
      const cell = pxToCell(x, y, circuit, panelTotalWidth, gridScale, gridOffset);
      if (cell) {
        const id = state.draggingBlock.id || ('b' + Date.now());
        circuit.blocks[id] = newBlock({
          id,
          type: state.draggingBlock.type,
          name: state.draggingBlock.name,
          pos: cell,
        });
        if (
          state.draggingBlock.type === 'INPUT' ||
          state.draggingBlock.type === 'OUTPUT'
        ) {
          hidePaletteItem(
            state.draggingBlock.type,
            state.draggingBlock.name
          );
        }
      } else {
        if (
          state.draggingBlock.id &&
          (state.draggingBlock.type === 'INPUT' ||
            state.draggingBlock.type === 'OUTPUT')
        ) {
          showPaletteItem(
            state.draggingBlock.type,
            state.draggingBlock.name
          );
        }
      }
      drawForeground();
      updateUsageCounts();
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
  }

  overlayCanvas.addEventListener('mouseup', handlePointerUp);
  overlayCanvas.addEventListener('touchend', e => {
    if (isPinching) {
      if (e.touches.length < 2) isPinching = false;
      return;
    }
    handlePointerUp(e);
  });

  function handlePointerMove(e) {
    const { x, y } = getPointerPos(e);
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 0 && (e.buttons === 1 || e.touches)) {
      state.hoverBlockId = null;
      const cell = pxToCell(x, y, circuit, panelTotalWidth, gridScale, gridOffset);
      if (!cell) return;
      const last = state.wireTrace[state.wireTrace.length - 1];
      if (!last || last.r !== cell.r || last.c !== cell.c) {
        state.wireTrace.push(coord(cell.r, cell.c));
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        overlayCtx.save();
        overlayCtx.translate(panelTotalWidth + gridOffset.x, gridOffset.y);
        overlayCtx.scale(gridScale, gridScale);
        overlayCtx.strokeStyle = 'rgba(17,17,17,0.4)';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([8, 8]);
        overlayCtx.beginPath();
        overlayCtx.moveTo(
          GAP + state.wireTrace[0].c * (CELL + GAP) + CELL / 2,
          GAP + state.wireTrace[0].r * (CELL + GAP) + CELL / 2
        );
        state.wireTrace.forEach(p => {
          overlayCtx.lineTo(
            GAP + p.c * (CELL + GAP) + CELL / 2,
            GAP + p.r * (CELL + GAP) + CELL / 2
          );
        });
        overlayCtx.stroke();
        overlayCtx.restore();
      }
    } else {
      const cell = pxToCell(x, y, circuit, panelTotalWidth, gridScale, gridOffset);
      if (cell) {
        const hovered = blockAt(cell);
        state.hoverBlockId = hovered ? hovered.id : null;
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
            drawForeground();
            updateUsageCounts();
          }
          state.dragCandidate = null;
        }
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (state.draggingBlock) {
          overlayCtx.save();
          overlayCtx.globalAlpha = 0.5;
          overlayCtx.translate(panelTotalWidth + gridOffset.x, gridOffset.y);
          overlayCtx.scale(gridScale, gridScale);
          drawBlock(
            overlayCtx,
            { type: state.draggingBlock.type, name: state.draggingBlock.name, pos: cell },
            0
          );
          overlayCtx.restore();
        }
      } else {
        state.hoverBlockId = null;
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      }
    }
  }

  overlayCanvas.addEventListener('mousemove', handlePointerMove);
  overlayCanvas.addEventListener('touchmove', e => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const rect = overlayCanvas.getBoundingClientRect();
      const m = touchMid(e.touches[0], e.touches[1]);
      const mid = { x: m.x - rect.left, y: m.y - rect.top };
      const scaleFactor = dist / lastPinchDist;
      gridScale = Math.min(Math.max(gridScale * scaleFactor, 0.5), 3);
      gridOffset.x = mid.x - (mid.x - gridOffset.x) * scaleFactor;
      gridOffset.y = mid.y - (mid.y - gridOffset.y) * scaleFactor;
      gridOffset.x += mid.x - lastMid.x;
      gridOffset.y += mid.y - lastMid.y;
      lastPinchDist = dist;
      lastMid = mid;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawBackground();
      drawForeground();
      return;
    }
    e.preventDefault();
    handlePointerMove(e);
  }, { passive: false });

  function handleDocMove(e) {
    if (!state.draggingBlock) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const point = e.touches?.[0] || e;
    if (point.clientX < rect.left || point.clientX >= rect.right || point.clientY < rect.top || point.clientY >= rect.bottom) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    if (e.touches) e.preventDefault();
  }

  function handleDocUp(e) {
    if (state.draggingBlock) {
      const rect = overlayCanvas.getBoundingClientRect();
      const point = e.changedTouches?.[0] || e;
      const ox = point.clientX - rect.left;
      const oy = point.clientY - rect.top;
      const overTrash =
        ox >= trashRect.x &&
        ox <= trashRect.x + trashRect.w &&
        oy >= trashRect.y &&
        oy <= trashRect.y + trashRect.h;
      if (overTrash && state.draggingBlock.id) {
        if (
          state.draggingBlock.type === 'INPUT' ||
          state.draggingBlock.type === 'OUTPUT'
        ) {
          showPaletteItem(state.draggingBlock.type, state.draggingBlock.name);
        }
        Object.keys(circuit.wires).forEach(wid => {
          const w = circuit.wires[wid];
          if (w.startBlockId === state.draggingBlock.id || w.endBlockId === state.draggingBlock.id) {
            const endB = circuit.blocks[w.endBlockId];
            if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
            delete circuit.wires[wid];
          }
        });
        drawForeground();
        updateUsageCounts();
      } else {
        const cell = pxToCell(ox, oy, circuit, panelTotalWidth, gridScale, gridOffset);
        if (!cell && state.draggingBlock.origPos) {
          const { id, type, name, origPos } = state.draggingBlock;
          circuit.blocks[id] = newBlock({ id, type, name, pos: origPos });
          drawForeground();
          updateUsageCounts();
        }
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    state.dragCandidate = null;
  }

  document.addEventListener('mousemove', handleDocMove);
  document.addEventListener('touchmove', handleDocMove, { passive: false });
  document.addEventListener('mouseup', handleDocUp);
  document.addEventListener('touchend', handleDocUp);

  function startBlockDrag(type, name) {
    state.draggingBlock = { type, name };
  }

  updateUsageCounts();
  return { state, circuit, startBlockDrag };
}
