import { CELL, GAP, coord, newWire, newBlock } from './model.js';
import { drawGrid, renderContent, setupCanvas, drawBlock, drawPanel } from './renderer.js';
import { evaluateCircuit, startEngine } from './engine.js';

let keydownHandler = null;
let keyupHandler = null;

// Convert pixel coordinates to cell indices (clamped to grid)
export function pxToCell(x, y, circuit, offsetX = 0) {
  const r = Math.min(
    circuit.rows - 1,
    Math.max(0, Math.floor((y - GAP) / (CELL + GAP)))
  );
  const c = Math.min(
    circuit.cols - 1,
    Math.max(0, Math.floor((x - offsetX - GAP) / (CELL + GAP)))
  );
  return { r, c };
}

export function createController(canvasSet, circuit, ui = {}, options = {}) {
  const isApplePlatform =
    typeof navigator !== 'undefined' &&
    /Mac|iP(hone|ad|od)/i.test(
      navigator.userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent ||
        ''
    );

  function isControlLikeKey(event) {
    if (!isApplePlatform && event.key === 'Control') return true;
    return isApplePlatform && event.key === 'Meta';
  }
  const {
    palette = [],
    paletteGroups = [],
    panelWidth = 180,
    forceHideInOut = false,
    onCircuitModified,
    camera: externalCamera = null,
    unboundedGrid = false,
    canvasSize = null,
    panelDrawOptions = {}
  } = options;
  const gridDrawOptions = unboundedGrid
    ? { ...(panelDrawOptions.grid || {}), unbounded: true }
    : panelDrawOptions.grid;
  const panelStyleOptions = panelDrawOptions.panel;
  const camera = externalCamera && typeof externalCamera.screenToCell === 'function'
    ? externalCamera
    : null;
  const useCamera = Boolean(camera);
  const MIN_CAMERA_SCALE = 0.2;
  const MAX_CAMERA_SCALE = 3;
  const ZOOM_SENSITIVITY = 0.0015;
  const gap = 10;
  const PALETTE_ITEM_H = 50;
  const LABEL_H = 20;
  const GROUP_PADDING = 8;
  const { bgCanvas, contentCanvas, overlayCanvas } = canvasSet;
  let gridWidth = circuit.cols * (CELL + GAP) + GAP;
  let gridHeight = circuit.rows * (CELL + GAP) + GAP;
  let panelTotalWidth = panelWidth;
  let canvasHeight = gridHeight;
  let paletteItems = [];
  let groupRects = [];
  const clampToBounds = !unboundedGrid;
  const baseGridWidth = gridWidth;
  const baseGridHeight = gridHeight;

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
          hidden:
            forceHideInOut && (it.type === 'INPUT' || it.type === 'OUTPUT'),
        });
        currentY += PALETTE_ITEM_H;
      });
      const groupHeight = LABEL_H + 5 + g.items.length * PALETTE_ITEM_H + padding * 2 - 10;
      groupRects.push({ label: g.label, x, y, w: colWidth, h: groupHeight, padding });
      colHeights[gi] = y + groupHeight;
    });
    canvasHeight = Math.max(
      canvasHeight,
      Math.max(...colHeights) + 10
    );
  } else {
    panelTotalWidth = panelWidth;
    paletteItems = palette.map((type, i) => ({
      type,
      label: type,
      x: gap,
      y: 10 + i * PALETTE_ITEM_H,
      w: panelWidth - 2 * gap,
      h: PALETTE_ITEM_H - 20,
      hidden: forceHideInOut && (type === 'INPUT' || type === 'OUTPUT'),
    }));
    canvasHeight = Math.max(canvasHeight, palette.length * PALETTE_ITEM_H + 20);
  }

  let canvasWidth = panelTotalWidth + gridWidth;
  if (canvasSize && Number.isFinite(canvasSize.width) && Number.isFinite(canvasSize.height)) {
    canvasWidth = canvasSize.width;
    canvasHeight = canvasSize.height;
    gridWidth = Math.max(0, canvasWidth - panelTotalWidth);
    gridHeight = canvasHeight;
  }
  if (useCamera) {
    camera.setPanelWidth(panelTotalWidth);
    camera.setViewport(canvasWidth, canvasHeight);
  }
  let bgCtx = setupCanvas(bgCanvas, canvasWidth, canvasHeight);
  let contentCtx = setupCanvas(contentCanvas, canvasWidth, canvasHeight);
  let overlayCtx = setupCanvas(overlayCanvas, canvasWidth, canvasHeight);

  function updateCanvasMetadata() {
    [bgCanvas, contentCanvas, overlayCanvas].forEach(canvas => {
      if (!canvas || !canvas.dataset) return;
      canvas.dataset.panelWidth = String(panelTotalWidth);
      canvas.dataset.gridBaseWidth = String(baseGridWidth);
      canvas.dataset.gridBaseHeight = String(baseGridHeight);
    });
  }

  updateCanvasMetadata();

  const state = {
    mode: 'idle',
    placingType: null,
    wireTrace: [],
    startBlockId: null,
    draggingBlock: null,
    dragCandidate: null,
    hoverBlockId: null,
    pointerDown: null,
    pointerMoved: false,
    selection: null,
    selecting: false,
    selectStart: null,
    spaceHeld: false,
    panning: false,
    panLast: null,
  };

  const undoStack = [];
  const redoStack = [];
  let hasInitialSnapshot = false;

  const pitch = CELL + GAP;

  function getScale() {
    return useCamera ? camera.getScale() : 1;
  }

  function withinBounds(r, c) {
    if (!clampToBounds) return true;
    return r >= 0 && r < circuit.rows && c >= 0 && c < circuit.cols;
  }

  function pointerToCell(x, y) {
    if (useCamera) {
      return camera.screenToCell(x, y);
    }
    return pxToCell(x, y, circuit, panelTotalWidth);
  }

  function cellTopLeft(r, c) {
    if (useCamera) {
      return camera.worldToScreen(GAP + c * pitch, GAP + r * pitch);
    }
    return {
      x: panelTotalWidth + GAP + c * pitch,
      y: GAP + r * pitch
    };
  }

  function cellRect(r, c) {
    const topLeft = cellTopLeft(r, c);
    const size = CELL * getScale();
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: size,
      h: size
    };
  }

  function selectionRect(r1, c1, r2, c2) {
    if (useCamera) {
      const top = camera.worldToScreen(GAP + c1 * pitch, GAP + r1 * pitch);
      const bottom = camera.worldToScreen(GAP + c2 * pitch + CELL, GAP + r2 * pitch + CELL);
      return {
        x: top.x,
        y: top.y,
        w: bottom.x - top.x,
        h: bottom.y - top.y
      };
    }
    return {
      x: panelTotalWidth + GAP + c1 * pitch,
      y: GAP + r1 * pitch,
      w: (c2 - c1 + 1) * pitch - GAP,
      h: (r2 - r1 + 1) * pitch - GAP
    };
  }

  function refreshBackground() {
    drawGrid(bgCtx, circuit.rows, circuit.cols, panelTotalWidth, camera, gridDrawOptions);
    drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, groupRects, panelStyleOptions);
  }

  function refreshContent() {
    renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
    if (state.selection) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawSelection();
    }
  }

  if (useCamera) {
    camera.setOnChange(() => {
      refreshBackground();
      refreshContent();
    });
  }

  function resizeCanvas(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    canvasWidth = width;
    canvasHeight = height;
    gridWidth = Math.max(0, canvasWidth - panelTotalWidth);
    gridHeight = canvasHeight;
    bgCtx = setupCanvas(bgCanvas, canvasWidth, canvasHeight);
    contentCtx = setupCanvas(contentCanvas, canvasWidth, canvasHeight);
    overlayCtx = setupCanvas(overlayCanvas, canvasWidth, canvasHeight);
    updateCanvasMetadata();
    if (useCamera) {
      camera.setViewport(canvasWidth, canvasHeight);
    }
    refreshBackground();
    refreshContent();
  }

  function notifyCircuitModified() {
    if (typeof onCircuitModified === 'function') {
      try {
        onCircuitModified();
      } catch (err) {
        console.error('Error in onCircuitModified callback', err);
      }
    }
  }

  function snapshot() {
    undoStack.push(JSON.stringify(circuit));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    if (hasInitialSnapshot) {
      notifyCircuitModified();
    } else {
      hasInitialSnapshot = true;
    }
  }

  function applyState(str) {
    const data = JSON.parse(str);
    circuit.rows = data.rows;
    circuit.cols = data.cols;
    circuit.blocks = data.blocks || {};
    circuit.wires = data.wires || {};
    state.mode = 'idle';
    state.wireTrace = [];
    state.draggingBlock = null;
    state.selection = null;
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    syncPaletteWithCircuit();
    refreshBackground();
    renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
    updateUsageCounts();
    updateButtons();
    notifyCircuitModified();
  }

  function undo() {
    if (undoStack.length <= 1) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    applyState(prev);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    applyState(next);
  }

  drawGrid(bgCtx, circuit.rows, circuit.cols, panelTotalWidth, camera, gridDrawOptions);
  drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, groupRects, panelStyleOptions);
  startEngine(contentCtx, circuit, (ctx, circ, phase) =>
    renderContent(ctx, circ, phase, panelTotalWidth, state.hoverBlockId, camera)
  );

  function redrawPanel() {
    drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, groupRects, panelStyleOptions);
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
      if (forceHideInOut && (type === 'INPUT' || type === 'OUTPUT')) return;
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
    const wireCells = new Set();
    Object.values(circuit.wires).forEach(w => {
      w.path.slice(1, -1).forEach(p => wireCells.add(`${p.r},${p.c}`));
    });
    if (usedBlocksEl) usedBlocksEl.textContent = blockCount;
    if (usedWiresEl) usedWiresEl.textContent = wireCells.size;
  }

  function syncPaletteWithCircuit() {
    paletteItems.forEach(it => {
      if (it.type === 'INPUT' || it.type === 'OUTPUT') {
        if (forceHideInOut) {
          it.hidden = true;
        } else {
          const exists = Object.values(circuit.blocks).some(
            b => b.type === it.type && b.name === it.label
          );
          it.hidden = exists;
        }
      }
    });
    redrawPanel();
    updateUsageCounts();
  }

  function setIOPaletteNames(inputNames = [], outputNames = []) {
    const normalizedInputs = Array.isArray(inputNames) ? inputNames : [];
    const normalizedOutputs = Array.isArray(outputNames) ? outputNames : [];

    const updateGroupItems = (type, names) => {
      let index = 0;
      paletteGroups.forEach(group => {
        (group.items || []).forEach(item => {
          if (item.type === type) {
            const newLabel = names[index] || '';
            item.label = newLabel;
            index++;
          }
        });
      });
    };

    const updatePaletteItemsForType = (type, names) => {
      let index = 0;
      paletteItems.forEach(item => {
        if (item.type === type) {
          const newLabel = names[index] || '';
          item.label = newLabel;
          const shouldHide =
            !newLabel || (forceHideInOut && (type === 'INPUT' || type === 'OUTPUT'));
          item.hidden = shouldHide;
          index++;
        }
      });
    };

    updateGroupItems('INPUT', normalizedInputs);
    updateGroupItems('OUTPUT', normalizedOutputs);
    updatePaletteItemsForType('INPUT', normalizedInputs);
    updatePaletteItemsForType('OUTPUT', normalizedOutputs);

    syncPaletteWithCircuit();
  }

  function blockAt(cell) {
    return Object.values(circuit.blocks).find(b => b.pos.r === cell.r && b.pos.c === cell.c);
  }

  function cellHasWire(cell) {
    return Object.values(circuit.wires).some(w => w.path.some(p => p.r === cell.r && p.c === cell.c));
  }

  function clearSelection() {
    state.selection = null;
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  }

  function drawSelection() {
    const sel = state.selection;
    if (!sel) return;
    overlayCtx.save();
    overlayCtx.fillStyle = 'rgba(0,128,255,0.3)';
    sel.blocks.forEach(id => {
      const b = circuit.blocks[id];
      if (b) {
        const rect = cellRect(b.pos.r, b.pos.c);
        overlayCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
    });
    sel.wires.forEach(id => {
      const w = circuit.wires[id];
      if (w) {
        w.path.forEach(p => {
          const rect = cellRect(p.r, p.c);
          overlayCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
        });
      }
    });
    overlayCtx.restore();
  }

  function moveSelection(dr, dc) {
    const sel = state.selection;
    if (!sel || sel.cross) return false;

    for (const id of sel.blocks) {
      const b = circuit.blocks[id];
      if (!b || b.fixed) return false;
    }

    const occupiedBlocks = new Set();
    Object.entries(circuit.blocks).forEach(([id, b]) => {
      if (!sel.blocks.has(id)) occupiedBlocks.add(`${b.pos.r},${b.pos.c}`);
    });
    const occupiedWires = new Set();
    Object.entries(circuit.wires).forEach(([id, w]) => {
      if (!sel.wires.has(id)) {
        w.path.forEach(p => occupiedWires.add(`${p.r},${p.c}`));
      }
    });

    for (const id of sel.blocks) {
      const b = circuit.blocks[id];
      const nr = b.pos.r + dr;
      const nc = b.pos.c + dc;
      if (!withinBounds(nr, nc)) return false;
      if (occupiedBlocks.has(`${nr},${nc}`) || occupiedWires.has(`${nr},${nc}`)) return false;
    }

    for (const id of sel.wires) {
      const w = circuit.wires[id];
      for (const p of w.path) {
        const nr = p.r + dr;
        const nc = p.c + dc;
        if (!withinBounds(nr, nc)) return false;
        if (occupiedBlocks.has(`${nr},${nc}`) || occupiedWires.has(`${nr},${nc}`)) return false;
      }
    }

    sel.blocks.forEach(id => {
      const b = circuit.blocks[id];
      b.pos = { r: b.pos.r + dr, c: b.pos.c + dc };
    });
    sel.wires.forEach(id => {
      const w = circuit.wires[id];
      w.path = w.path.map(p => ({ r: p.r + dr, c: p.c + dc }));
    });

    sel.r1 += dr;
    sel.r2 += dr;
    sel.c1 += dc;
    sel.c2 += dc;

    renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawSelection();
    snapshot();
    return true;
  }

  function isValidWireTrace(trace) {
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

  function isValidWire(trace) {
    // Require at least one intermediate cell so adjacent blocks cannot be linked
    if (trace.length < 3) return false;
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
    const scale = parseFloat(e.target?.dataset.scale || '1');
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: (point.clientX - rect.left) / scale,
      y: (point.clientY - rect.top) / scale,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createKeydownHandler() {
    return e => {
      const key = e.key.toLowerCase();
      if (window.isScoring) {
        if (key === 'z' || key === 'y') e.preventDefault();
        else if (key === 'r') e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (isControlLikeKey(e)) {
        state.mode = 'wireDrawing';
        updateButtons();
      } else if (e.key === 'Shift') {
        state.mode = 'deleting';
        updateButtons();
      } else if (e.key === ' ') {
        e.preventDefault();
        state.spaceHeld = true;
      } else if (e.key.toLowerCase() === 'r') {
        if (!confirm(window.t('confirmDeleteAll'))) return;
        const fixed = {};
        Object.entries(circuit.blocks).forEach(([id, b]) => {
          if (b.fixed) fixed[id] = b;
        });
        circuit.blocks = fixed;
        circuit.wires = {};
        syncPaletteWithCircuit();
        refreshBackground();
        renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
        updateUsageCounts();
        clearSelection();
        snapshot();
      }
    };
  }

  function createKeyupHandler() {
    return e => {
      if (isControlLikeKey(e) && state.mode === 'wireDrawing') {
        state.mode = 'idle';
        state.wireTrace = [];
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        updateButtons();
      } else if (e.key === 'Shift' && state.mode === 'deleting') {
        state.mode = 'idle';
        updateButtons();
      } else if (e.key === ' ') {
        state.spaceHeld = false;
        if (state.panning) {
          state.panning = false;
          state.panLast = null;
        }
      }
    };
  }

  function attachKeyboardHandlers() {
    if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
    keydownHandler = createKeydownHandler();
    document.addEventListener('keydown', keydownHandler);

    if (keyupHandler) document.removeEventListener('keyup', keyupHandler);
    keyupHandler = createKeyupHandler();
    document.addEventListener('keyup', keyupHandler);
  }

  attachKeyboardHandlers();

  function destroy() {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    if (keyupHandler) {
      document.removeEventListener('keyup', keyupHandler);
      keyupHandler = null;
    }
  }

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
    state.pointerDown = { x, y };
    state.pointerMoved = false;
    let handled = false;
    const isMiddleButton = e.button === 1;
    const isPrimary = e.button === 0 || e.button === undefined;
    if (useCamera && (isMiddleButton || (state.spaceHeld && isPrimary))) {
      state.panning = true;
      state.panLast = { x, y };
      state.pointerDown = null;
      handled = true;
      e.preventDefault();
      return handled;
    }
    if (e.button === 2) {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToCell(x, y);
        state.selecting = true;
        state.selectStart = cell;
        state.selection = null;
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        handled = true;
      }
      e.preventDefault();
    } else {
      if (state.selection) {
        const inGrid = x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight;
        let inside = false;
        if (inGrid) {
          const cell = pointerToCell(x, y);
          if (
            cell.r >= state.selection.r1 &&
            cell.r <= state.selection.r2 &&
            cell.c >= state.selection.c1 &&
            cell.c <= state.selection.c2
          ) {
            inside = true;
          }
        }
        if (!inside) clearSelection();
      }
      if (x < panelTotalWidth) {
        const item = paletteItems.find(
          it =>
            it.type && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h
        );
        if (item) {
          state.draggingBlock = { type: item.type, name: item.label };
          handled = true;
        }
      } else if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToCell(x, y);
        if (state.mode === 'wireDrawing') {
          if (blockAt(cell)) {
            state.wireTrace = [coord(cell.r, cell.c)];
            handled = true;
          }
        } else if (state.mode === 'deleting') {
          let deleted = false;
          const bid = Object.keys(circuit.blocks).find(id => {
            const b = circuit.blocks[id];
            return b.pos.r === cell.r && b.pos.c === cell.c;
          });
          if (bid) {
            const b = circuit.blocks[bid];
            if (!b.fixed) {
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
              deleted = true;
            }
            handled = true;
          } else {
            Object.keys(circuit.wires).forEach(id => {
              const w = circuit.wires[id];
              if (w.path.some(p => p.r === cell.r && p.c === cell.c)) {
                const endB = circuit.blocks[w.endBlockId];
                if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
                delete circuit.wires[id];
                deleted = true;
              }
            });
          }
          renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
          updateUsageCounts();
          if (deleted) {
            clearSelection();
            snapshot();
          }
          handled = deleted;
        } else {
          const bid = Object.keys(circuit.blocks).find(id => {
            const b = circuit.blocks[id];
            return b.pos.r === cell.r && b.pos.c === cell.c;
          });
          if (bid) {
            const b = circuit.blocks[bid];
            if (!b.fixed) {
              state.dragCandidate = { id: bid, start: cell };
            }
            handled = true;
          }
        }
      }
    }
    return handled;
  }

  overlayCanvas.addEventListener('mousedown', handlePointerDown);
  overlayCanvas.addEventListener('touchstart', e => {
    const handled = handlePointerDown(e);
    if (handled) e.preventDefault();
  }, { passive: false });
  overlayCanvas.addEventListener('contextmenu', e => e.preventDefault());

  function handleWheel(e) {
    if (!useCamera) return;
    const deltaRaw = e.deltaY;
    if (deltaRaw === 0) return;
    const { x, y } = getPointerPos(e);
    const withinGrid =
      x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight;
    if (!withinGrid) return;
    const deltaMultiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 100 : 1;
    const delta = deltaRaw * deltaMultiplier;
    const zoomFactor = Math.exp(-delta * ZOOM_SENSITIVITY);
    const currentScale = camera.getScale();
    const nextScale = clamp(currentScale * zoomFactor, MIN_CAMERA_SCALE, MAX_CAMERA_SCALE);
    if (Math.abs(nextScale - currentScale) < 1e-4) {
      e.preventDefault();
      return;
    }
    camera.setScale(nextScale, x, y);
    e.preventDefault();
  }

  overlayCanvas.addEventListener('wheel', handleWheel, { passive: false });

  function handlePointerUp(e) {
    const { x, y } = getPointerPos(e);
    if (state.panning) {
      state.panning = false;
      state.panLast = null;
      state.pointerDown = null;
      return;
    }
    if (state.selecting && e.button === 2) {
      state.selecting = false;
      state.pointerDown = null;
      state.pointerMoved = false;
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToCell(x, y);
        const r1 = Math.min(state.selectStart.r, cell.r);
        const c1 = Math.min(state.selectStart.c, cell.c);
        const r2 = Math.max(state.selectStart.r, cell.r);
        const c2 = Math.max(state.selectStart.c, cell.c);
        const blocks = new Set();
        const wires = new Set();
        let cross = false;
        Object.entries(circuit.blocks).forEach(([id, b]) => {
          if (b.pos.r >= r1 && b.pos.r <= r2 && b.pos.c >= c1 && b.pos.c <= c2) {
            blocks.add(id);
          }
        });
        Object.entries(circuit.wires).forEach(([id, w]) => {
          const inside = w.path.every(p => p.r >= r1 && p.r <= r2 && p.c >= c1 && p.c <= c2);
          const intersects = w.path.some(p => p.r >= r1 && p.r <= r2 && p.c >= c1 && p.c <= c2);
          if (inside && blocks.has(w.startBlockId) && blocks.has(w.endBlockId)) {
            wires.add(id);
          } else if (intersects) {
            cross = true;
          }
        });
        state.selection = blocks.size || wires.size ? { r1, c1, r2, c2, blocks, wires, cross } : null;
      } else {
        state.selection = null;
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (state.selection) drawSelection();
      state.selectStart = null;
      return;
    }
    if (!state.pointerMoved && state.mode === 'idle') {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToCell(x, y);
        const blk = blockAt(cell);
        if (blk && blk.type === 'INPUT') {
          blk.value = !blk.value;
          evaluateCircuit(circuit);
          renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
        }
      }
    }
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 1) {
      if (isValidWire(state.wireTrace)) {
        const id = 'w' + Date.now();
        const startBlock = blockAt(state.wireTrace[0]);
        const endBlock = blockAt(state.wireTrace[state.wireTrace.length - 1]);
        circuit.wires[id] = newWire({ id, path: [...state.wireTrace], startBlockId: startBlock.id, endBlockId: endBlock.id });
        endBlock.inputs = [...(endBlock.inputs || []), startBlock.id];
        renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
        updateUsageCounts();
        clearSelection();
        snapshot();
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    } else if (state.draggingBlock) {
      let placed = false;
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToCell(x, y);
        if (state.draggingBlock.id) {
          const collision = blockAt(cell) || cellHasWire(cell);
          const target = collision ? state.draggingBlock.origPos : cell;
          const id = state.draggingBlock.id;
          circuit.blocks[id] = newBlock({
            id,
            type: state.draggingBlock.type,
            name: state.draggingBlock.name,
            pos: target,
          });
          placed = true;
          if (
            target.r === state.draggingBlock.origPos.r &&
            target.c === state.draggingBlock.origPos.c &&
            state.draggingBlock.wires
          ) {
            state.draggingBlock.wires.forEach(w => {
              circuit.wires[w.id] = w;
              const endB = circuit.blocks[w.endBlockId];
              if (endB) endB.inputs = [...(endB.inputs || []), w.startBlockId];
            });
          }
        } else if (!blockAt(cell) && !cellHasWire(cell)) {
          const id = 'b' + Date.now();
          circuit.blocks[id] = newBlock({
            id,
            type: state.draggingBlock.type,
            name: state.draggingBlock.name,
            pos: cell,
          });
          placed = true;
          if (
            state.draggingBlock.type === 'INPUT' ||
            state.draggingBlock.type === 'OUTPUT'
          ) {
            hidePaletteItem(
              state.draggingBlock.type,
              state.draggingBlock.name
            );
          }
        }
      } else if (
        state.draggingBlock.id &&
        (state.draggingBlock.type === 'INPUT' ||
          state.draggingBlock.type === 'OUTPUT')
      ) {
        showPaletteItem(
          state.draggingBlock.type,
          state.draggingBlock.name
        );
      }
      if (placed) {
        renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
        updateUsageCounts();
        snapshot();
      }
      if (placed || state.draggingBlock.id) clearSelection();
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (state.selection) drawSelection();
    }
    // Clear any pending drag candidate after pointer release
    state.dragCandidate = null;
    state.wireTrace = [];
    state.pointerDown = null;
    state.pointerMoved = false;
    if (state.selection) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawSelection();
    }
  }

    overlayCanvas.addEventListener('mouseup', handlePointerUp);
    overlayCanvas.addEventListener('touchend', handlePointerUp);

  function handlePointerMove(e) {
    const { x, y } = getPointerPos(e);
    if (state.panning) {
      if (state.panLast) {
        camera.pan(x - state.panLast.x, y - state.panLast.y);
        state.panLast = { x, y };
      }
      return;
    }
    if (state.pointerDown) {
      const dx = x - state.pointerDown.x;
      const dy = y - state.pointerDown.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) state.pointerMoved = true;
    }
    if (state.selecting) {
      if (x < panelTotalWidth || x >= canvasWidth || y < 0 || y >= gridHeight) {
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        return;
      }
      const cell = pointerToCell(x, y);
      const r1 = Math.min(state.selectStart.r, cell.r);
      const c1 = Math.min(state.selectStart.c, cell.c);
      const r2 = Math.max(state.selectStart.r, cell.r);
      const c2 = Math.max(state.selectStart.c, cell.c);
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      overlayCtx.save();
      overlayCtx.strokeStyle = 'rgba(0,128,255,0.8)';
      const dashScale = getScale();
      overlayCtx.lineWidth = 1 * dashScale;
      overlayCtx.setLineDash([4 * dashScale, 4 * dashScale]);
      const rect = selectionRect(r1, c1, r2, c2);
      overlayCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      overlayCtx.restore();
      return;
    }
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 0 && (e.buttons === 1 || e.touches)) {
      state.hoverBlockId = null;
      if (x < panelTotalWidth || x >= canvasWidth || y < 0 || y >= gridHeight) return;
      const cell = pointerToCell(x, y);
      const last = state.wireTrace[state.wireTrace.length - 1];
      if (!last || last.r !== cell.r || last.c !== cell.c) {
        state.wireTrace.push(coord(cell.r, cell.c));
        if (!isValidWireTrace(state.wireTrace)) {
          state.wireTrace = [];
          overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
          state.mode = 'idle';
          updateButtons();
          return;
        }
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      overlayCtx.save();
      overlayCtx.strokeStyle = 'rgba(17,17,17,0.4)';
      const lineScale = getScale();
      overlayCtx.lineWidth = 2 * lineScale;
      overlayCtx.setLineDash([8 * lineScale, 8 * lineScale]);
      overlayCtx.beginPath();
      const firstRect = cellRect(state.wireTrace[0].r, state.wireTrace[0].c);
      overlayCtx.moveTo(firstRect.x + firstRect.w / 2, firstRect.y + firstRect.h / 2);
      state.wireTrace.forEach(p => {
        const rc = cellRect(p.r, p.c);
        overlayCtx.lineTo(rc.x + rc.w / 2, rc.y + rc.h / 2);
      });
      overlayCtx.lineTo(x, y);
      overlayCtx.stroke();
      overlayCtx.restore();
    } else {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToCell(x, y);
        const hovered = blockAt(cell);
        state.hoverBlockId = hovered ? hovered.id : null;
        if (state.dragCandidate && (cell.r !== state.dragCandidate.start.r || cell.c !== state.dragCandidate.start.c)) {
          const b = circuit.blocks[state.dragCandidate.id];
          if (b) {
            const removedWires = [];
            Object.keys(circuit.wires).forEach(wid => {
              const w = circuit.wires[wid];
              if (w.startBlockId === state.dragCandidate.id || w.endBlockId === state.dragCandidate.id) {
                removedWires.push(w);
                const endB = circuit.blocks[w.endBlockId];
                if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
                delete circuit.wires[wid];
              }
            });
            state.draggingBlock = {
              id: state.dragCandidate.id,
              type: b.type,
              name: b.name,
              origPos: b.pos,
              wires: removedWires
            };
            delete circuit.blocks[state.dragCandidate.id];
            renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
            updateUsageCounts();
            clearSelection();
          }
          state.dragCandidate = null;
        }
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (state.draggingBlock) {
          overlayCtx.save();
          overlayCtx.globalAlpha = 0.5;
          drawBlock(
            overlayCtx,
            { type: state.draggingBlock.type, name: state.draggingBlock.name, pos: cell },
            panelTotalWidth,
            false,
            camera
          );
          overlayCtx.restore();
        }
        if (state.selection && !state.draggingBlock && state.wireTrace.length === 0) {
          drawSelection();
        }
      } else {
        state.hoverBlockId = null;
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (state.selection && !state.draggingBlock && state.wireTrace.length === 0) {
          drawSelection();
        }
      }
    }
  }

  overlayCanvas.addEventListener('mousemove', handlePointerMove);
  overlayCanvas.addEventListener('touchmove', e => {
    handlePointerMove(e);
    if (state.draggingBlock || state.wireTrace.length > 0 || state.dragCandidate) {
      e.preventDefault();
    }
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
      const scale = parseFloat(overlayCanvas.dataset.scale || '1');
      const point = e.changedTouches?.[0] || e;
      const ox = (point.clientX - rect.left) / scale;
      const oy = (point.clientY - rect.top) / scale;
      const outsideGrid =
        ox < panelTotalWidth ||
        ox >= canvasWidth ||
        oy < 0 ||
        oy >= gridHeight;
      if (outsideGrid && state.draggingBlock.id) {
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
        renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
        updateUsageCounts();
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    state.dragCandidate = null;
    state.pointerDown = null;
    state.pointerMoved = false;
  }

  document.addEventListener('mousemove', handleDocMove);
  document.addEventListener('touchmove', handleDocMove, { passive: false });
  document.addEventListener('mouseup', handleDocUp);
  document.addEventListener('touchend', handleDocUp);

  function startBlockDrag(type, name) {
    state.draggingBlock = { type, name };
  }

  function moveCircuit(dx, dy) {
    if (!dx && !dy) return false;
    const blocks = Object.values(circuit.blocks);
    const wires = Object.values(circuit.wires);
    const okBlocks = blocks.every(b => {
      const nr = b.pos.r + dy;
      const nc = b.pos.c + dx;
      return withinBounds(nr, nc);
    });
    const okWires = wires.every(w =>
      w.path.every(p => {
        const nr = p.r + dy;
        const nc = p.c + dx;
        return withinBounds(nr, nc);
      })
    );
    if (!okBlocks || !okWires) return false;
    blocks.forEach(b => {
      b.pos.r += dy;
      b.pos.c += dx;
    });
    wires.forEach(w => {
      w.path = w.path.map(p => ({ r: p.r + dy, c: p.c + dx }));
    });
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
    snapshot();
    return true;
  }

  function placeFixedIO(problem) {
    if (!problem?.fixIO || !problem.grid) return;
    problem.grid.forEach(state => {
      if (state.type === 'INPUT' || state.type === 'OUTPUT') {
        const r = Math.floor(state.index / circuit.cols);
        const c = state.index % circuit.cols;
        const id = 'fixed_' + state.name + '_' + state.index;
        circuit.blocks[id] = newBlock({
          id,
          type: state.type,
          name: state.name,
          pos: { r, c },
          value: state.type === 'INPUT' ? state.value === '1' : false,
          fixed: true,
        });
      }
    });
    syncPaletteWithCircuit();
    renderContent(contentCtx, circuit, 0, panelTotalWidth, state.hoverBlockId, camera);
    undoStack.length = 0;
    redoStack.length = 0;
    snapshot();
  }

  updateUsageCounts();
  snapshot();
  return {
    state,
    circuit,
    startBlockDrag,
    syncPaletteWithCircuit,
    setIOPaletteNames,
    moveCircuit,
    placeFixedIO,
    moveSelection,
    clearSelection,
    undo,
    redo,
    destroy,
    attachKeyboardHandlers,
    resizeCanvas,
  };
}
