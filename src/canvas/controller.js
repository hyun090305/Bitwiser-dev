import { connectionDiagnostics, editConnectionDiagnostics, wireStartDiagnostic, assignNewInputRole, normalizeAfterEdit, swapMemoryInputs, incomingWires } from './connections.js';
import { getExecutionState, synchronizeExecution, resetExecution, toggleButton, getEvaluationResult } from './evaluation.js';
import { createMemoryControls, D_HELP } from '../modules/memoryControls.js';
import { COST_RULES } from '../modules/circuitCost.js';
import { snapshotCircuit, getCircuitStats, isValidWirePath, hasValidWireLayout } from './circuitData.js';
import { CELL, GAP, coord, newWire, newBlock } from './model.js';
import {
  drawGrid,
  renderContent,
  setupCanvas,
  drawBlock,
  drawPanel,
  roundRect,
  CELL_CORNER_RADIUS
} from './renderer.js';
import { getActiveTheme } from '../themes.js';
import { evaluateCircuit, markCircuitDirty, startEngine } from './engine.js';
import {
  playItemDropSound,
  playItemPickupSound,
  playRemoveSound,
  playWirePlacingSound
} from '../modules/bgm.js';

let keydownHandler = null;
let keyupHandler = null;

let sharedClipboard = null;
const sharedClipboardListeners = new Set();

function cloneClipboard(data) {
  if (!data) return null;
  const blocks = Array.isArray(data.blocks)
    ? data.blocks.map(block => ({
        offset: {
          r: Number.isFinite(block?.offset?.r) ? block.offset.r : 0,
          c: Number.isFinite(block?.offset?.c) ? block.offset.c : 0,
        },
        type: block?.type,
        name: block?.name,
        value: Boolean(block?.value),
        inputMode: block?.inputMode,
      }))
    : [];
  const wires = Array.isArray(data.wires)
    ? data.wires.map(wire => ({
        path: Array.isArray(wire?.path)
          ? wire.path.map(step => ({
              r: Number.isFinite(step?.r) ? step.r : 0,
              c: Number.isFinite(step?.c) ? step.c : 0,
            }))
          : [],
        startBlock: wire?.startBlock,
        endBlock: wire?.endBlock,
        inputRole: wire?.inputRole,
      }))
    : [];
  return { blocks, wires };
}

function getSharedClipboard() {
  return cloneClipboard(sharedClipboard);
}

function setSharedClipboard(nextClipboard) {
  sharedClipboard = nextClipboard ? cloneClipboard(nextClipboard) : null;
  sharedClipboardListeners.forEach(listener => {
    try {
      listener(sharedClipboard);
    } catch (err) {
      console.error('Error notifying clipboard listeners', err);
    }
  });
}

function subscribeSharedClipboard(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  sharedClipboardListeners.add(listener);
  return () => {
    sharedClipboardListeners.delete(listener);
  };
}

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
    executionMode = 'combinational',
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
  const MIN_CAMERA_SCALE = 0.1;
  const MAX_CAMERA_SCALE = 3;
  const ZOOM_SENSITIVITY = 0.0015;
  const gap = 10;
  const PALETTE_ITEM_H = 50;
  const LABEL_H = 20;
  const GROUP_PADDING = 8;
  const MAX_GRID_ROWS = 15;
  const MAX_GRID_COLS = 15;
  const { bgCanvas, contentCanvas, overlayCanvas } = canvasSet;
  let gridWidth = circuit.cols * (CELL + GAP) + GAP;
  let gridHeight = circuit.rows * (CELL + GAP) + GAP;
  let panelTotalWidth = panelWidth;
  let canvasHeight = gridHeight;
  let paletteItems = [];
  let paletteCostTooltip = null;
  let groupRects = [];
  const clampToBounds = !unboundedGrid;
  let baseGridWidth = gridWidth;
  let baseGridHeight = gridHeight;
  let dynamicMinCanvasHeight;

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
          inputMode: it.inputMode,
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

  dynamicMinCanvasHeight = canvasHeight;

  let canvasWidth = panelTotalWidth + gridWidth;
  if (canvasSize && Number.isFinite(canvasSize.width) && Number.isFinite(canvasSize.height)) {
    canvasWidth = canvasSize.width;
    canvasHeight = canvasSize.height;
    gridWidth = Math.max(0, canvasWidth - panelTotalWidth);
    gridHeight = canvasHeight;
  }
  if (useCamera) {
    camera.setPanelWidth(panelTotalWidth);
    camera.setViewport(canvasWidth, canvasHeight, {
      gridWidth,
      gridHeight,
    });
    camera.setBounds(
      clampToBounds ? baseGridWidth : undefined,
      clampToBounds ? baseGridHeight : undefined,
      { clamp: clampToBounds }
    );
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
      canvas.dataset.gridViewportWidth = String(Math.max(0, gridWidth));
      canvas.dataset.gridViewportHeight = String(Math.max(0, gridHeight));
      canvas.dataset.minCanvasHeight = String(dynamicMinCanvasHeight);
    });
  }

  updateCanvasMetadata();

  const renderOptions = {
    tutorialHighlights: [],
    tutorialWireGuides: []
  };

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
    selectionDrag: null,
    spaceHeld: false,
    panning: false,
    panLast: null,
    pinch: null,
    clipboard: getSharedClipboard(),
    pastePreview: null,
    copyPasteEnabled: Boolean(options.enableCopyPaste),
    tutorialHighlights: renderOptions.tutorialHighlights,
    tutorialWireGuides: renderOptions.tutorialWireGuides,
  };

  const eventBindings = [];
  const passiveFalseOption = { passive: false };

  let uniqueIdCounter = 0;

  function nextUniqueId(prefix) {
    uniqueIdCounter = (uniqueIdCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `${prefix}${Date.now().toString(36)}_${uniqueIdCounter.toString(36)}`;
  }

  function bindEvent(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler, options);
    eventBindings.push({ target, type, handler, options });
  }

  function removeBoundEvents() {
    while (eventBindings.length) {
      const { target, type, handler, options } = eventBindings.pop();
      target?.removeEventListener(type, handler, options);
    }
  }

  const undoStack = [];
  const redoStack = [];
  let hasInitialSnapshot = false;
  let engineHandle = null;
  const memoryControls = createMemoryControls(circuit, overlayCanvas, {
    executionMode,
    // INPUT press is a signal interaction until it actually moves to another
    // cell. A mere drag candidate must not cancel/restart the playback timer.
    isEditing: () => Boolean(state.draggingBlock ||
      (state.dragCandidate && circuit.blocks[state.dragCandidate.id]?.type !== 'INPUT') || state.selectionDrag ||
      state.wireTrace.length || state.selecting || state.mode === 'pasting')
  });
  let lastEvaluation = null;
  function isLocked() { return Boolean(window.isScoring || window.isGradingResultOpen); }
  function beginEdit() {
    memoryControls.beginEdit();
  }

  function rejectEdit(diagnostics, report = true) {
    if (report) memoryControls.showEditRejection(diagnostics);
    return false;
  }

  function rejectLayout(report = true) {
    return rejectEdit([{ code: 'INVALID_LAYOUT',
      message: '블록과 도선이 겹치지 않도록 격자 안에 배치하고, 도선은 빈 칸을 거쳐 연결하세요.',
      messageEn: 'Keep blocks and wires inside the grid without overlaps; route wires through empty cells.' }], report);
  }

  function canCommitEdit(candidate, before = circuit, report = false) {
    const diagnostics = editConnectionDiagnostics(before, candidate);
    if (diagnostics.length) return rejectEdit(diagnostics, report);
    return validLayout(candidate) || rejectLayout(report);
  }


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

  function pointerToBoundedCell(x, y) {
    const cell = pointerToCell(x, y);
    if (clampToBounds && !withinBounds(cell.r, cell.c)) {
      return null;
    }
    return cell;
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
    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
    if (state.selection) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawSelection();
    }
  }

  function normalizeTutorialHighlight(entry) {
    if (!entry) return null;
    const sourcePos = entry.pos || entry;
    const r = Number.isFinite(sourcePos?.r) ? sourcePos.r : null;
    const c = Number.isFinite(sourcePos?.c) ? sourcePos.c : null;
    if (!Number.isInteger(r) || !Number.isInteger(c)) {
      return null;
    }
    const label = typeof entry.label === 'string' && entry.label.trim().length > 0
      ? entry.label.trim()
      : '';
    return {
      pos: { r, c },
      label
    };
  }

  function setTutorialHighlights(highlights) {
    const normalized = Array.isArray(highlights)
      ? highlights.map(normalizeTutorialHighlight).filter(Boolean)
      : [];
    const current = state.tutorialHighlights || [];
    const unchanged =
      current.length === normalized.length &&
      current.every((item, index) => {
        const next = normalized[index];
        return (
          next &&
          item.pos.r === next.pos.r &&
          item.pos.c === next.pos.c &&
          item.label === next.label
        );
      });
    if (unchanged) {
      return;
    }
    renderOptions.tutorialHighlights = normalized;
    state.tutorialHighlights = normalized;
    refreshContent();
  }

  function normalizeTutorialWireGuide(entry) {
    if (!entry) return null;
    const sourcePath = Array.isArray(entry.path) ? entry.path : [];
    const normalizedPath = sourcePath
      .map(step => {
        const r = Number.isFinite(step?.r) ? step.r : null;
        const c = Number.isFinite(step?.c) ? step.c : null;
        if (!Number.isInteger(r) || !Number.isInteger(c)) {
          return null;
        }
        return { r, c };
      })
      .filter(Boolean);
    if (normalizedPath.length < 2) {
      return null;
    }
    const label = typeof entry.label === 'string' && entry.label.trim().length > 0
      ? entry.label.trim()
      : '';
    return {
      path: normalizedPath,
      label
    };
  }

  function setTutorialWireGuides(guides) {
    const normalized = Array.isArray(guides)
      ? guides.map(normalizeTutorialWireGuide).filter(Boolean)
      : [];
    const current = state.tutorialWireGuides || [];
    const unchanged =
      current.length === normalized.length &&
      current.every((item, index) => {
        const next = normalized[index];
        if (!next) return false;
        if (item.label !== next.label) return false;
        if (item.path.length !== next.path.length) return false;
        for (let i = 0; i < item.path.length; i += 1) {
          const a = item.path[i];
          const b = next.path[i];
          if (a.r !== b.r || a.c !== b.c) {
            return false;
          }
        }
        return true;
      });
    if (unchanged) {
      return;
    }
    renderOptions.tutorialWireGuides = normalized;
    state.tutorialWireGuides = normalized;
    refreshContent();
  }

  if (useCamera) {
    let cameraRaf = null;
    const requestFrame =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : cb => setTimeout(cb, 16);
    const cancelFrame =
      typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : clearTimeout;
    const flushCameraRefresh = () => {
      cameraRaf = null;
      refreshBackground();
      refreshContent();
    };
    camera.setOnChange(() => {
      if (cameraRaf != null) return;
      cameraRaf = requestFrame(flushCameraRefresh);
    });
    const previousDestroy = destroy;
    destroy = function destroyWithCameraCleanup() {
      if (cameraRaf != null) {
        cancelFrame(cameraRaf);
        cameraRaf = null;
      }
      if (typeof camera.setOnChange === 'function') {
        camera.setOnChange(null);
      }
      previousDestroy();
    };
  }

  function resolveMinCanvasHeight(options) {
    if (options && typeof options === 'object' && options !== null) {
      const override = Number.parseFloat(options.minHeight);
      if (Number.isFinite(override)) {
        dynamicMinCanvasHeight = Math.max(0, override);
      }
    }
    return dynamicMinCanvasHeight;
  }

  function resizeCanvas(width, height, options) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    const normalizedGridHeight = Math.max(0, height);
    const normalizedCanvasWidth = Math.max(width, panelTotalWidth);
    const normalizedGridWidth = Math.max(0, normalizedCanvasWidth - panelTotalWidth);
    const effectiveMinHeight = resolveMinCanvasHeight(options);
    const nextCanvasHeight = Math.max(normalizedGridHeight, effectiveMinHeight);

    canvasWidth = normalizedCanvasWidth;
    canvasHeight = nextCanvasHeight;
    gridWidth = normalizedGridWidth;
    gridHeight = normalizedGridHeight;

    bgCtx = setupCanvas(bgCanvas, canvasWidth, canvasHeight);
    contentCtx = setupCanvas(contentCanvas, canvasWidth, canvasHeight);
    overlayCtx = setupCanvas(overlayCanvas, canvasWidth, canvasHeight);
    updateCanvasMetadata();
    if (useCamera) {
      camera.setViewport(canvasWidth, canvasHeight, {
        gridWidth,
        gridHeight,
      });
    }
    refreshBackground();
    refreshContent();
  }

  function notifyCircuitModified() {
    beginEdit();
    synchronizeExecution(circuit);
    markCircuitDirty(circuit);
    evaluateCircuit(circuit);
    memoryControls.refresh();
    if (typeof onCircuitModified === 'function') {
      try {
        onCircuitModified();
      } catch (err) {
        console.error('Error in onCircuitModified callback', err);
      }
    }
  }

  function setMode(nextMode) {
    if (isLocked()) return;
    const previousMode = state.mode;
    if (previousMode === nextMode) {
      updateButtons();
      return;
    }
    state.mode = nextMode;
    if (previousMode === 'pasting' && nextMode !== 'pasting') {
      state.pastePreview = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (state.selection) {
        drawSelection();
      }
    }
    if (nextMode !== 'pasting') {
      state.pastePreview = null;
    }
    updateButtons();
  }

  function designKey(design) {
    const data = snapshotCircuit(design);
    return JSON.stringify([data.rows, data.cols,
      Object.keys(data.blocks).sort().map(id => data.blocks[id]),
      Object.keys(data.wires).sort().map(id => data.wires[id])]);
  }

  function snapshot(normalize = true) {
    const previous = undoStack.length ? JSON.parse(undoStack.at(-1)) : null;
    if (normalize && previous) normalizeAfterEdit(circuit, previous);
    const next = JSON.stringify(snapshotCircuit(circuit));
    if (previous && designKey(previous) === designKey(circuit)) return;
    undoStack.push(next);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    if (hasInitialSnapshot) {
      notifyCircuitModified();
    } else {
      hasInitialSnapshot = true;
    }
    updateButtons();
  }

  function applyState(str) {
    const data = JSON.parse(str);
    circuit.rows = data.rows;
    circuit.cols = data.cols;
    circuit.blocks = data.blocks || {};
    circuit.wires = data.wires || {};
    state.selection = null;
    state.selectionDrag = null;
    setMode('idle');
    state.wireTrace = [];
    state.draggingBlock = null;
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    syncPaletteWithCircuit();
    refreshBackground();
    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
    updateUsageCounts();
    notifyCircuitModified();
  }

  function undo() {
    if (isLocked()) return;
    beginEdit();
    if (undoStack.length <= 1) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    applyState(prev);
  }

  function redo() {
    if (isLocked()) return;
    beginEdit();
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    applyState(next);
  }

  drawGrid(bgCtx, circuit.rows, circuit.cols, panelTotalWidth, camera, gridDrawOptions);
  drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, groupRects, panelStyleOptions);
  engineHandle = startEngine(contentCtx, circuit, (ctx, circ, phase) => {
    renderContent(ctx, circ, phase, panelTotalWidth, state.hoverBlockId, camera, renderOptions);
    if (lastEvaluation !== getEvaluationResult(circ)) {
      lastEvaluation = getEvaluationResult(circ);
      memoryControls.refresh();
    }
    memoryControls.syncPlayback();
  });

  function redrawPanel() {
    drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, groupRects, panelStyleOptions);
  }

  function refreshVisuals() {
    drawGrid(bgCtx, circuit.rows, circuit.cols, panelTotalWidth, camera, gridDrawOptions);
    drawPanel(bgCtx, paletteItems, panelTotalWidth, canvasHeight, groupRects, panelStyleOptions);
    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
  }

  function normalizePaletteLabel(type, label) {
    if (typeof label === 'string' && label.length) {
      return label;
    }
    if (type === 'JUNCTION') {
      return 'JUNC';
    }
    return type;
  }

  function hidePaletteCost() {
    if (paletteCostTooltip) paletteCostTooltip.hidden = true;
  }

  function updatePaletteCost(e, x, y) {
    const item = !e.touches && !e.buttons && !state.draggingBlock && !state.panning
      && !state.selectionDrag && !state.pinch && !state.wireTrace.length && state.mode !== 'pasting'
      ? paletteItems.find(it => !it.hidden && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h)
      : null;
    if (!item) { hidePaletteCost(); return; }
    if (!paletteCostTooltip) {
      paletteCostTooltip = document.createElement('div');
      paletteCostTooltip.className = 'palette-cost-tooltip';
      paletteCostTooltip.setAttribute('role', 'tooltip');
      const label = document.createElement('span'), price = document.createElement('strong');
      paletteCostTooltip.append(label, price); document.body.append(paletteCostTooltip);
    }
    const ko = (window.currentLang || document.documentElement.lang || 'ko') === 'ko';
    paletteCostTooltip.firstElementChild.textContent = normalizePaletteLabel(item.type, item.label);
    paletteCostTooltip.lastElementChild.textContent = `${ko ? '비용' : 'Cost'} ${COST_RULES.prices[item.type] ?? '—'}`;
    paletteCostTooltip.hidden = false;
    const { width, height } = paletteCostTooltip.getBoundingClientRect();
    const left = Math.min(e.clientX + 14, window.innerWidth - width - 8);
    const top = e.clientY + 18 + height <= window.innerHeight - 8 ? e.clientY + 18 : e.clientY - height - 12;
    paletteCostTooltip.style.left = `${Math.max(8, left)}px`;
    paletteCostTooltip.style.top = `${Math.max(8, top)}px`;
  }

  function findPaletteItem(type, label, predicate = () => true) {
    const resolvedLabel = normalizePaletteLabel(type, label);
    return paletteItems.find(
      it => it.type === type && it.label === resolvedLabel && predicate(it)
    );
  }

  function hidePaletteItem(type, label) {
    const item = findPaletteItem(type, label, it => !it.hidden);
    if (item) {
      item.hidden = true;
      redrawPanel();
    }
  }

  function showPaletteItem(type, label) {
    const item = findPaletteItem(type, label, it => it.hidden);
    if (item) {
      if (forceHideInOut && (type === 'INPUT' || type === 'OUTPUT')) return;
      item.hidden = false;
      redrawPanel();
    }
  }

  function returnBlockToPalette(type, label) {
    if (!type) return;
    showPaletteItem(type, label);
  }

  function replaceExistingBlock(existingBlock, nextBlock) {
    if (!existingBlock || !nextBlock?.type) return false;
    if (existingBlock.fixed) return rejectEdit([{ code: 'FIXED_BLOCK', blockId: existingBlock.id,
      message: `${existingBlock.name || existingBlock.id}: 고정 블록은 교체할 수 없습니다.`,
      messageEn: `${existingBlock.name || existingBlock.id}: fixed blocks cannot be replaced.` }]);

    const candidate = structuredClone(circuit);
    Object.assign(candidate.blocks[existingBlock.id], nextBlock);
    if (nextBlock.type !== 'INPUT') delete candidate.blocks[existingBlock.id].inputMode;
    if (nextBlock.type === 'D' && existingBlock.type !== 'D') {
      incomingWires(candidate, existingBlock.id).forEach((w, i) => { w.inputRole = i ? 'EN' : 'D'; });
    }
    if (!canCommitEdit(candidate, circuit, true)) return false;
    const previousType = existingBlock.type;
    returnBlockToPalette(existingBlock.type, existingBlock.name);

    existingBlock.type = nextBlock.type;
    existingBlock.name = nextBlock.name;
    if (nextBlock.type === 'INPUT') {
      existingBlock.value = Boolean(nextBlock.value);
    } else if (typeof nextBlock.value === 'boolean') {
      existingBlock.value = nextBlock.value;
    }
    existingBlock.fixed = false;
    if (nextBlock.type === 'INPUT') existingBlock.inputMode = nextBlock.inputMode || 'switch';
    else delete existingBlock.inputMode;
    if (nextBlock.type === 'D' && previousType !== 'D') {
      incomingWires(circuit, existingBlock.id).forEach((w, i) => { w.inputRole = i ? 'EN' : 'D'; });
    }

    return true;
  }

  const moveBtn = ui.wireMoveInfo;
  const wireBtn = ui.wireStatusInfo;
  const delBtn = ui.wireDeleteInfo;
  const selectBtn = ui.wireSelectInfo;
  const copyBtn = ui.copyButton;
  const pasteBtn = ui.pasteButton;
  const undoBtn = ui.undoButton;
  const redoBtn = ui.redoButton;
  const usedBlocksEl = ui.usedBlocksEl;
  const usedWiresEl = ui.usedWiresEl;

  bindEvent(undoBtn, 'click', e => {
    e.preventDefault();
    undo();
  });

  bindEvent(redoBtn, 'click', e => {
    e.preventDefault();
    redo();
  });

  bindEvent(copyBtn, 'click', e => {
    e.preventDefault();
    copySelection();
  });

  bindEvent(pasteBtn, 'click', e => {
    e.preventDefault();
    togglePasteMode();
  });

  function updateUsageCounts() {
    const { usedBlocks, usedWires } = getCircuitStats(circuit);
    if (usedBlocksEl) usedBlocksEl.textContent = usedBlocks;
    if (usedWiresEl) usedWiresEl.textContent = usedWires;
  }

  function updateCopyPasteButtons() {
    const enabled = Boolean(state.copyPasteEnabled);
    const hasSelection = Boolean(state.selection && state.selection.blocks?.size);
    const hasClipboard = Boolean(state.clipboard);

    const toolbar = copyBtn?.parentElement;
    if (toolbar && typeof toolbar.hidden === 'boolean') {
      toolbar.hidden = !enabled;
    }

    if (copyBtn) {
      copyBtn.hidden = !enabled;
      copyBtn.disabled = !enabled || !hasSelection;
    }

    if (pasteBtn) {
      pasteBtn.hidden = !enabled;
      pasteBtn.disabled = !enabled || !hasClipboard;
      pasteBtn.classList.toggle('active', state.mode === 'pasting');
    }
  }

  const unsubscribeSharedClipboard = subscribeSharedClipboard(nextClipboard => {
    const incomingClipboard = nextClipboard ? cloneClipboard(nextClipboard) : null;
    const hadClipboard = Boolean(state.clipboard);
    state.clipboard = incomingClipboard;
    if (state.mode === 'pasting') {
      if (!state.clipboard) {
        setMode('idle');
        return;
      }
      const previewCell = state.pastePreview?.cell;
      if (previewCell) {
        const valid = canPasteClipboardAt(previewCell, state.clipboard);
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        drawClipboardPreview(previewCell, valid);
        state.pastePreview = { cell: previewCell, valid };
      }
    }
    if (hadClipboard !== Boolean(state.clipboard)) {
      updateCopyPasteButtons();
    }
  });

  function setCopyPasteEnabled(enabled) {
    const normalized = Boolean(enabled);
    state.copyPasteEnabled = normalized;
    if (!normalized && state.mode === 'pasting') {
      setMode('idle');
      return;
    }
    updateButtons();
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

  function isConnectorType(type) {
    return type === 'INPUT' || type === 'OUTPUT' || type === 'JUNCTION';
  }

  function cellHasWire(cell) {
    return Object.values(circuit.wires).some(w => w.path.some(p => p.r === cell.r && p.c === cell.c));
  }

  function isRowEmpty(rowIndex) {
    if (rowIndex < 0 || rowIndex >= circuit.rows) return true;
    const hasBlock = Object.values(circuit.blocks).some(block => block.pos.r === rowIndex);
    if (hasBlock) return false;
    return !Object.values(circuit.wires).some(wire =>
      (wire.path || []).some(point => point.r === rowIndex)
    );
  }

  function isColEmpty(colIndex) {
    if (colIndex < 0 || colIndex >= circuit.cols) return true;
    const hasBlock = Object.values(circuit.blocks).some(block => block.pos.c === colIndex);
    if (hasBlock) return false;
    return !Object.values(circuit.wires).some(wire =>
      (wire.path || []).some(point => point.c === colIndex)
    );
  }

  function shiftCircuit(dx, dy) {
    if (!dx && !dy) return true;
    const blocks = Object.values(circuit.blocks);
    const wires = Object.values(circuit.wires);
    const okBlocks = blocks.every(block =>
      withinBounds(block.pos.r + dy, block.pos.c + dx)
    );
    const okWires = wires.every(wire =>
      (wire.path || []).every(point => withinBounds(point.r + dy, point.c + dx))
    );
    if (!okBlocks || !okWires) return false;
    blocks.forEach(block => {
      block.pos.r += dy;
      block.pos.c += dx;
    });
    wires.forEach(wire => {
      wire.path = (wire.path || []).map(point => ({
        r: point.r + dy,
        c: point.c + dx,
      }));
    });
    return true;
  }

  function applyGridGeometry() {
    baseGridWidth = circuit.cols * (CELL + GAP) + GAP;
    baseGridHeight = circuit.rows * (CELL + GAP) + GAP;
    const targetWidth = panelTotalWidth + baseGridWidth;
    resizeCanvas(targetWidth, baseGridHeight);
    if (useCamera) {
      camera.setBounds(
        clampToBounds ? baseGridWidth : undefined,
        clampToBounds ? baseGridHeight : undefined,
        { clamp: clampToBounds }
      );
    }
  }

  function canExpandGrid(direction) {
    if (direction === 'top' || direction === 'bottom') {
      return circuit.rows < MAX_GRID_ROWS;
    }
    if (direction === 'left' || direction === 'right') {
      return circuit.cols < MAX_GRID_COLS;
    }
    return false;
  }

  function canShrinkGrid(direction) {
    if (direction === 'top') {
      if (circuit.rows <= 1) return false;
      return isRowEmpty(0);
    }
    if (direction === 'bottom') {
      if (circuit.rows <= 1) return false;
      return isRowEmpty(circuit.rows - 1);
    }
    if (direction === 'left') {
      if (circuit.cols <= 1) return false;
      return isColEmpty(0);
    }
    if (direction === 'right') {
      if (circuit.cols <= 1) return false;
      return isColEmpty(circuit.cols - 1);
    }
    return false;
  }

  function expandGrid(direction) {
    if (isLocked()) return false;
    if (!canExpandGrid(direction)) return false;
    if (direction === 'top') {
      const previousRows = circuit.rows;
      circuit.rows += 1;
      if (!shiftCircuit(0, 1)) {
        circuit.rows = previousRows;
        return false;
      }
    } else if (direction === 'bottom') {
      circuit.rows += 1;
    } else if (direction === 'left') {
      const previousCols = circuit.cols;
      circuit.cols += 1;
      if (!shiftCircuit(1, 0)) {
        circuit.cols = previousCols;
        return false;
      }
    } else if (direction === 'right') {
      circuit.cols += 1;
    } else {
      return false;
    }
    applyGridGeometry();
    snapshot();
    return true;
  }

  function shrinkGrid(direction) {
    if (isLocked()) return false;
    if (!canShrinkGrid(direction)) return false;
    if (direction === 'top') {
      if (!shiftCircuit(0, -1)) return false;
      circuit.rows = Math.max(1, circuit.rows - 1);
    } else if (direction === 'bottom') {
      circuit.rows = Math.max(1, circuit.rows - 1);
    } else if (direction === 'left') {
      if (!shiftCircuit(-1, 0)) return false;
      circuit.cols = Math.max(1, circuit.cols - 1);
    } else if (direction === 'right') {
      circuit.cols = Math.max(1, circuit.cols - 1);
    } else {
      return false;
    }
    applyGridGeometry();
    snapshot();
    return true;
  }

  function clearSelection() {
    state.selection = null;
    state.selectionDrag = null;
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    updateCopyPasteButtons();
  }

  function canDeleteSelection() {
    const sel = state.selection;
    if (!sel) return false;

    let hasDeletable = false;

    for (const id of sel.blocks) {
      const block = circuit.blocks[id];
      if (!block) continue;
      if (block.fixed) return false;
      hasDeletable = true;
    }

    for (const id of sel.wires) {
      if (circuit.wires[id]) {
        hasDeletable = true;
      }
    }

    return hasDeletable;
  }

  function deleteSelection() {
    if (isLocked()) return false;
    const sel = state.selection;
    if (!sel || !canDeleteSelection()) return false;

    const blocksToDelete = Array.from(sel.blocks).filter(id => circuit.blocks[id]);
    const wiresToDelete = new Set(sel.wires);

    blocksToDelete.forEach(id => {
      Object.entries(circuit.wires).forEach(([wid, wire]) => {
        if (wire.startBlockId === id || wire.endBlockId === id) {
          wiresToDelete.add(wid);
        }
      });
    });

    let deleted = false;

    wiresToDelete.forEach(wid => {
      const wire = circuit.wires[wid];
      if (!wire) return;
      const endBlock = circuit.blocks[wire.endBlockId];
      if (endBlock) {
        endBlock.inputs = (endBlock.inputs || []).filter(
          inputId => inputId !== wire.startBlockId
        );
      }
      delete circuit.wires[wid];
      deleted = true;
    });

    blocksToDelete.forEach(id => {
      const block = circuit.blocks[id];
      if (!block) return;
      if (block.type === 'INPUT' || block.type === 'OUTPUT') {
        showPaletteItem(block.type, block.name);
      }
      delete circuit.blocks[id];
      deleted = true;
    });

    if (deleted) {
      playRemoveSound();
      renderContent(
        contentCtx,
        circuit,
        0,
        panelTotalWidth,
        state.hoverBlockId,
        camera,
        renderOptions
      );
      updateUsageCounts();
      clearSelection();
      snapshot();
    }

    return deleted;
  }

  function expandSelectionConnections(blocks, wires) {
    const queue = [...blocks];
    while (queue.length) {
      const current = queue.shift();
      Object.entries(circuit.wires).forEach(([wid, w]) => {
        if (wires.has(wid)) {
          return;
        }
        if (w.startBlockId === current || w.endBlockId === current) {
          wires.add(wid);
          const otherId = w.startBlockId === current ? w.endBlockId : w.startBlockId;
          if (otherId && circuit.blocks[otherId] && !blocks.has(otherId)) {
            blocks.add(otherId);
            queue.push(otherId);
          }
        }
      });
    }
  }

  function computeSelectionBounds(blocks, wires) {
    let minR = Infinity;
    let minC = Infinity;
    let maxR = -Infinity;
    let maxC = -Infinity;

    const updateBounds = (r, c) => {
      if (r < minR) minR = r;
      if (c < minC) minC = c;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    };

    blocks.forEach(id => {
      const b = circuit.blocks[id];
      if (b) updateBounds(b.pos.r, b.pos.c);
    });

    wires.forEach(id => {
      const w = circuit.wires[id];
      if (w) {
        w.path.forEach(p => updateBounds(p.r, p.c));
      }
    });

    if (!Number.isFinite(minR) || !Number.isFinite(minC) || !Number.isFinite(maxR) || !Number.isFinite(maxC)) {
      return null;
    }

    return { r1: minR, c1: minC, r2: maxR, c2: maxC };
  }

  function selectionHasCross(initialBounds, wires) {
    if (!initialBounds) return false;
    let cross = false;
    Object.entries(circuit.wires).forEach(([id, w]) => {
      if (cross || wires.has(id)) return;
      if (
        w.path.some(
          p =>
            p.r >= initialBounds.r1 &&
            p.r <= initialBounds.r2 &&
            p.c >= initialBounds.c1 &&
            p.c <= initialBounds.c2
        )
      ) {
        cross = true;
      }
    });
    return cross;
  }

  function drawSelection({ offset = { dr: 0, dc: 0 }, invalid = false } = {}) {
    const sel = state.selection;
    if (!sel) return;
    overlayCtx.save();
    const dr = Number.isFinite(offset?.dr) ? offset.dr : 0;
    const dc = Number.isFinite(offset?.dc) ? offset.dc : 0;
    overlayCtx.fillStyle = invalid ? 'rgba(255,0,0,0.35)' : 'rgba(0,128,255,0.3)';
    const radius = Math.max(0, CELL_CORNER_RADIUS * getScale());
    const fillRoundedCell = rect => {
      overlayCtx.beginPath();
      roundRect(overlayCtx, rect.x, rect.y, rect.w, rect.h, radius);
      overlayCtx.fill();
    };
    sel.blocks.forEach(id => {
      const b = circuit.blocks[id];
      if (b) {
        const rect = cellRect(b.pos.r + dr, b.pos.c + dc);
        fillRoundedCell(rect);
      }
    });
    sel.wires.forEach(id => {
      const w = circuit.wires[id];
      if (w) {
        w.path.forEach(p => {
          const rect = cellRect(p.r + dr, p.c + dc);
          fillRoundedCell(rect);
        });
      }
    });
    overlayCtx.restore();
  }

  function buildClipboardFromSelection() {
    const sel = state.selection;
    if (!sel) return null;
    const origin = { r: sel.r1, c: sel.c1 };
    const blocks = [];
    const blockIndexMap = new Map();

    Array.from(sel.blocks || []).forEach(id => {
      const block = circuit.blocks[id];
      if (!block) return;
      const offset = {
        r: block.pos.r - origin.r,
        c: block.pos.c - origin.c,
      };
      blockIndexMap.set(id, blocks.length);
      blocks.push({
        offset,
        type: block.type,
        name: block.name,
        value: Boolean(block.value),
        inputMode: block.inputMode,
      });
    });

    const wires = [];
    Array.from(sel.wires || []).forEach(id => {
      const wire = circuit.wires[id];
      if (!wire || !Array.isArray(wire.path)) return;
      const startIdx = blockIndexMap.get(wire.startBlockId);
      const endIdx = blockIndexMap.get(wire.endBlockId);
      if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx)) return;
      wires.push({
        path: wire.path.map(p => ({ r: p.r - origin.r, c: p.c - origin.c })),
        startBlock: startIdx,
        endBlock: endIdx,
        inputRole: wire.inputRole,
      });
    });

    if (!blocks.length && !wires.length) {
      return null;
    }

    return { blocks, wires };
  }

  function copySelection() {
    if (!state.copyPasteEnabled) return false;
    const clipboard = buildClipboardFromSelection();
    if (!clipboard) return false;
    const normalized = cloneClipboard(clipboard);
    state.clipboard = normalized;
    setSharedClipboard(normalized);
    updateCopyPasteButtons();
    return true;
  }

  function canPasteClipboardAt(anchor, clipboard, report = false) {
    if (!clipboard) return false;
    if ((clipboard.blocks || []).some(b => b.type === 'D' && !paletteItems.some(p => p.type === 'D'))) return rejectEdit([{
      code: 'BLOCK_UNAVAILABLE', message: '이 문제에서는 D를 붙여넣을 수 없습니다.',
      messageEn: 'D cannot be pasted in this stage.' }], report);
    const blockTargets = new Map();

    for (const block of clipboard.blocks || []) {
      const targetR = anchor.r + block.offset.r;
      const targetC = anchor.c + block.offset.c;
      if (!withinBounds(targetR, targetC)) return rejectLayout(report);
      const targetCell = { r: targetR, c: targetC };
      const existing = blockAt(targetCell);
      if (existing) {
        if (!isConnectorType(existing.type) || !isConnectorType(block.type)) return rejectLayout(report);
      } else {
        if (cellHasWire(targetCell)) return rejectLayout(report);
      }
      blockTargets.set(`${targetR},${targetC}`, {
        existing: Boolean(existing),
      });
    }

    for (const wire of clipboard.wires || []) {
      const targetBlock = clipboard.blocks[wire.endBlock];
      if (!targetBlock) return rejectLayout(report);
      const path = wire.path || [];
      for (let i = 0; i < path.length; i += 1) {
        const step = path[i];
        const targetR = anchor.r + step.r;
        const targetC = anchor.c + step.c;
        if (!withinBounds(targetR, targetC)) return rejectLayout(report);
        const key = `${targetR},${targetC}`;
        const isEndpoint = i === 0 || i === path.length - 1;
        const targetInfo = blockTargets.get(key);
        const targetCell = { r: targetR, c: targetC };
        if (!isEndpoint || !targetInfo) {
          if (blockAt(targetCell)) return rejectLayout(report);
        }
        if (cellHasWire(targetCell)) {
          if (!(isEndpoint && targetInfo && targetInfo.existing)) {
            return rejectLayout(report);
          }
        }
      }
    }

    // Check the actual merged/converted blocks, not the clipboard's IO types.
    const candidate = structuredClone(circuit), ids = new Map();
    const unique = (collection, prefix) => {
      let id = prefix;
      while (collection[id]) id += '-';
      return id;
    };
    clipboard.blocks.forEach((block, index) => {
      const pos = { r: anchor.r + block.offset.r, c: anchor.c + block.offset.c };
      const existing = blockAt(pos);
      const id = existing?.id || unique(candidate.blocks, `paste-b-${index}`);
      ids.set(index, id);
      if (!existing) candidate.blocks[id] = newBlock({ id, type: ['INPUT', 'OUTPUT'].includes(block.type) ? 'JUNCTION' : block.type, pos });
    });
    for (const [index, wire] of clipboard.wires.entries()) {
      const id = unique(candidate.wires, `paste-w-${index}`);
      candidate.wires[id] = newWire({ ...wire, id, startBlockId: ids.get(wire.startBlock), endBlockId: ids.get(wire.endBlock),
        path: wire.path.map(p => ({ r: anchor.r + p.r, c: anchor.c + p.c })) });
    }
    return canCommitEdit(candidate, circuit, report);
  }

  function drawClipboardPreview(anchor, invalid = false) {
    const clipboard = state.clipboard;
    if (!clipboard) return;
    overlayCtx.save();
    overlayCtx.fillStyle = invalid ? 'rgba(255,0,0,0.35)' : 'rgba(0,128,255,0.3)';
    const radius = Math.max(0, CELL_CORNER_RADIUS * getScale());
    const fillRoundedCell = rect => {
      overlayCtx.beginPath();
      roundRect(overlayCtx, rect.x, rect.y, rect.w, rect.h, radius);
      overlayCtx.fill();
    };

    (clipboard.blocks || []).forEach(block => {
      const rect = cellRect(anchor.r + block.offset.r, anchor.c + block.offset.c);
      fillRoundedCell(rect);
    });

    (clipboard.wires || []).forEach(wire => {
      (wire.path || []).forEach(step => {
        const rect = cellRect(anchor.r + step.r, anchor.c + step.c);
        fillRoundedCell(rect);
      });
    });

    overlayCtx.restore();
  }

  function applyClipboardAt(anchor) {
    if (isLocked()) return false;
    beginEdit();
    const clipboard = state.clipboard;
    if (!clipboard || !canPasteClipboardAt(anchor, clipboard, true)) return false;

    const blockIdMap = new Map();
    (clipboard.blocks || []).forEach((block, index) => {
      const target = {
        r: anchor.r + block.offset.r,
        c: anchor.c + block.offset.c,
      };
      const existing = blockAt(target);
      if (existing && isConnectorType(existing.type) && isConnectorType(block.type)) {
        blockIdMap.set(index, existing.id);
        return;
      }
      const id = nextUniqueId('b');
      const shouldConvert = block.type === 'INPUT' || block.type === 'OUTPUT';
      const type = shouldConvert ? 'JUNCTION' : block.type;
      const name = type === 'JUNCTION' ? 'JUNC' : block.name;
      const value = shouldConvert ? false : Boolean(block.value);
      circuit.blocks[id] = newBlock({
        id,
        type,
        name,
        pos: target,
        value,
        fixed: false,
      });
      blockIdMap.set(index, id);
    });

    clipboard.wires.forEach(wire => {
      const startId = blockIdMap.get(wire.startBlock);
      const endId = blockIdMap.get(wire.endBlock);
      if (!startId || !endId) return;
      const id = nextUniqueId('w');
      const path = (wire.path || []).map(step => ({
        r: anchor.r + step.r,
        c: anchor.c + step.c,
      }));
      circuit.wires[id] = newWire({
        id,
        path,
        startBlockId: startId,
        endBlockId: endId,
        inputRole: wire.inputRole,
      });
      const endBlock = circuit.blocks[endId];
      if (endBlock) {
        const existing = Array.isArray(endBlock.inputs) ? endBlock.inputs : [];
        if (!existing.includes(startId)) {
          endBlock.inputs = [...existing, startId];
        }
      }
    });

    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
    updateUsageCounts();

    clearSelection();

    state.pastePreview = null;
    setMode('idle');
    state.pointerDown = null;
    state.pointerMoved = false;
    snapshot();
    updateCopyPasteButtons();
    return true;
  }

  function togglePasteMode() {
    if (!state.copyPasteEnabled || !state.clipboard) {
      return;
    }
    if (state.mode === 'pasting') {
      setMode('idle');
      return;
    }
    state.pastePreview = null;
    setMode('pasting');
  }

  function canMoveSelection(dr, dc) {
    const sel = state.selection;
    if (!sel || sel.cross) return false;

    if (dr === 0 && dc === 0) return true;

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

    const candidate = structuredClone(circuit);
    sel.blocks.forEach(id => { candidate.blocks[id].pos.r += dr; candidate.blocks[id].pos.c += dc; });
    sel.wires.forEach(id => { candidate.wires[id].path = candidate.wires[id].path.map(p => ({ r: p.r + dr, c: p.c + dc })); });
    return canCommitEdit(candidate);
  }

  function moveSelection(dr, dc) {
    if (isLocked()) return false;
    const sel = state.selection;
    if (!canMoveSelection(dr, dc)) return false;

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

    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawSelection();
    snapshot();
    return true;
  }

  function wireValidationContext() {
    return { withinBounds: (r, c) => !clampToBounds || withinBounds(r, c), blockAt, cellHasWire };
  }
  function validLayout(candidate) {
    return hasValidWireLayout(candidate, (r, c) => !clampToBounds || withinBounds(r, c));
  }
  function isValidWireTrace(trace) {
    return isValidWirePath(trace, wireValidationContext(), false);
  }
  function isValidWire(trace) {
    const start = blockAt(trace[0]), end = blockAt(trace.at(-1));
    if (start && end) {
      const diagnostics = connectionDiagnostics(circuit, start.id, end.id);
      if (diagnostics.length) return rejectEdit(diagnostics);
    }
    return isValidWirePath(trace, wireValidationContext()) || rejectLayout();
  }

  function hasMemoryConnections(drag) {
    return drag.type === 'D' || drag.wires?.some(w => circuit.blocks[w.endBlockId]?.type === 'D');
  }

  // Moving a memory or its input keeps connection IDs/roles. Route around
  // occupied cells; if there is no valid space, put the block and wires back.
  function restoreMemoryDragWires(drag) {
    const block = circuit.blocks[drag.id];
    if (!block || !hasMemoryConnections(drag)) return;
    const restored = [];
    const occupied = new Set(Object.values(circuit.wires).flatMap(w => w.path.slice(1, -1).map(p => `${p.r},${p.c}`)));
    for (const w of drag.wires || []) {
      if (circuit.wires[w.id]) continue;
      const start = circuit.blocks[w.startBlockId]?.pos;
      const end = circuit.blocks[w.endBlockId]?.pos;
      if (!start || !end) break;
      const queue = [[{ ...start }]];
      const visited = new Set([`${start.r},${start.c}`]);
      const oldStart = w.path[0], oldEnd = w.path.at(-1);
      const departure = { r: w.path[1].r - oldStart.r, c: w.path[1].c - oldStart.c };
      const approach = { r: w.path.at(-2).r - oldEnd.r, c: w.path.at(-2).c - oldEnd.c };
      let path = null;
      for (let i = 0; i < queue.length && i < 4096 && !path; i++) {
        const trail = queue[i];
        const last = trail.at(-1);
        for (const [dr, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
          if (trail.length === 1 && (dr !== departure.r || dc !== departure.c)) continue;
          const p = { r: last.r + dr, c: last.c + dc };
          const key = `${p.r},${p.c}`;
          if (!withinBounds(p.r,p.c) || p.r < Math.min(start.r,end.r)-4 || p.r > Math.max(start.r,end.r)+4 ||
              p.c < Math.min(start.c,end.c)-4 || p.c > Math.max(start.c,end.c)+4) continue;
          if (p.r === end.r && p.c === end.c) {
            if (trail.length >= 2 && last.r === end.r + approach.r && last.c === end.c + approach.c) { path = [...trail,p]; break; }
            continue;
          }
          if (visited.has(key) || occupied.has(key) || blockAt(p)) continue;
          visited.add(key); queue.push([...trail,p]);
        }
      }
      if (!path) break;
      restored.push({ ...w, path });
      path.slice(1,-1).forEach(p => occupied.add(`${p.r},${p.c}`));
    }
    const missing = (drag.wires || []).filter(w => !circuit.wires[w.id]);
    if (restored.length === missing.length) restored.forEach(w => { circuit.wires[w.id] = w; });
    else {
      block.pos = { ...drag.origPos };
      (drag.wires || []).forEach(w => { circuit.wires[w.id] = w; });
      rejectLayout();
    }
  }

  function updateButtons() {
    const isWireMode = state.mode === 'wireDrawing';
    const isDeleteMode = state.mode === 'deleting';
    const isSelectMode = state.mode === 'selecting';
    const isPasteMode = state.mode === 'pasting';
    moveBtn?.classList.toggle(
      'active',
      !isWireMode && !isDeleteMode && !isSelectMode && !isPasteMode
    );
    wireBtn?.classList.toggle('active', isWireMode);
    delBtn?.classList.toggle('active', isDeleteMode);
    selectBtn?.classList.toggle('active', isSelectMode);
    pasteBtn?.classList.toggle('active', isPasteMode);
    const canUndo = undoStack.length > 1;
    const canRedo = redoStack.length > 0;
    if (undoBtn) {
      undoBtn.disabled = !canUndo;
    }
    if (redoBtn) {
      redoBtn.disabled = !canRedo;
    }
    updateCopyPasteButtons();
  }

  // 공통 포인터 좌표 계산 (마우스/터치)
  function getPointerPos(e) {
    const rect = e.target.getBoundingClientRect();
    const shouldNormalize = !useCamera;
    const rawScale = shouldNormalize
      ? parseFloat(e.target?.dataset.scale || '1')
      : 1;
    const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: (point.clientX - rect.left) / scale,
      y: (point.clientY - rect.top) / scale,
    };
  }

  function getCanvasRelativePos(clientX, clientY) {
    const rect = overlayCanvas.getBoundingClientRect();
    const scale = parseFloat(overlayCanvas.dataset.scale || '1');
    const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
      x: (clientX - rect.left) / normalizedScale,
      y: (clientY - rect.top) / normalizedScale
    };
  }

  function getTouchById(touchList, identifier) {
    if (!touchList) return null;
    for (let i = 0; i < touchList.length; i++) {
      const touch = touchList[i];
      if (touch.identifier === identifier) return touch;
    }
    return null;
  }

  function startPinch(e) {
    if (!useCamera || !e.touches || e.touches.length < 2) return false;
    const [first, second] = [e.touches[0], e.touches[1]];
    const p1 = getCanvasRelativePos(first.clientX, first.clientY);
    const p2 = getCanvasRelativePos(second.clientX, second.clientY);
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!Number.isFinite(distance) || distance <= 0) return false;
    const world1 = camera.screenToWorld(p1.x, p1.y);
    const world2 = camera.screenToWorld(p2.x, p2.y);
    state.pinch = {
      id1: first.identifier,
      id2: second.identifier,
      startDistance: distance,
      startScale: camera.getScale(),
      world1,
      world2
    };
    state.pointerDown = null;
    state.pointerMoved = false;
    state.panning = false;
    state.panLast = null;
    return true;
  }

  function updatePinch(e) {
    if (!state.pinch || !useCamera) return false;
    const pinch = state.pinch;
    const touch1 = getTouchById(e.touches, pinch.id1);
    const touch2 = getTouchById(e.touches, pinch.id2);
    if (!touch1 || !touch2) {
      endPinch();
      return false;
    }
    const pos1 = getCanvasRelativePos(touch1.clientX, touch1.clientY);
    const pos2 = getCanvasRelativePos(touch2.clientX, touch2.clientY);
    const distance = Math.hypot(pos2.x - pos1.x, pos2.y - pos1.y);
    if (!Number.isFinite(distance) || distance <= 0) {
      return false;
    }
    const previousScale = camera.getState().scale;
    const scaleRatio = distance / pinch.startDistance;
    const targetScale = clamp(pinch.startScale * scaleRatio, MIN_CAMERA_SCALE, MAX_CAMERA_SCALE);
    camera.setScale(targetScale);
    const { scale: appliedScale, originX, originY } = camera.getState();
    const scaleChanged = Math.abs(appliedScale - previousScale) > 1e-4;
    const desiredOriginX1 = pinch.world1.x - (pos1.x - panelTotalWidth) / appliedScale;
    const desiredOriginY1 = pinch.world1.y - pos1.y / appliedScale;
    const desiredOriginX2 = pinch.world2.x - (pos2.x - panelTotalWidth) / appliedScale;
    const desiredOriginY2 = pinch.world2.y - pos2.y / appliedScale;
    const desiredOriginX = (desiredOriginX1 + desiredOriginX2) / 2;
    const desiredOriginY = (desiredOriginY1 + desiredOriginY2) / 2;
    const deltaOriginX = originX - desiredOriginX;
    const deltaOriginY = originY - desiredOriginY;
    let panChanged = false;
    if (Math.abs(deltaOriginX) > 1e-4 || Math.abs(deltaOriginY) > 1e-4) {
      panChanged = camera.pan(deltaOriginX * appliedScale, deltaOriginY * appliedScale);
    }
    if (!scaleChanged && !panChanged && scaleRatio < 1 && clampToBounds) {
      endPinch();
      return false;
    }
    return scaleChanged || panChanged;
  }

  function endPinch() {
    state.pinch = null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createKeydownHandler() {
    return e => {
      const key = e.key.toLowerCase();
      if (isLocked()) {
        if (key === 'z' || key === 'y') e.preventDefault();
        else if (key === 'r') e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (key === 'c') {
        if (state.copyPasteEnabled && state.selection) {
          const copied = copySelection();
          if (copied) {
            e.preventDefault();
            return;
          }
        }
      }
      if (key === 'v') {
        if (state.copyPasteEnabled && state.clipboard) {
          e.preventDefault();
          togglePasteMode();
          return;
        }
      }
      if (key === 'escape' && (state.draggingBlock || state.wireTrace.length || state.selectionDrag || state.mode === 'pasting')) {
        e.preventDefault();
        cancelInteraction();
        return;
      }
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
        setMode('wireDrawing');
      } else if (e.key === 'Shift') {
        setMode('deleting');
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
        renderContent(
          contentCtx,
          circuit,
          0,
          panelTotalWidth,
          state.hoverBlockId,
          camera,
          renderOptions
        );
        updateUsageCounts();
        clearSelection();
        snapshot();
      }
    };
  }

  function createKeyupHandler() {
    return e => {
      if (isControlLikeKey(e) && state.mode === 'wireDrawing') {
        state.wireTrace = [];
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        setMode('idle');
      } else if (e.key === 'Shift' && state.mode === 'deleting') {
        setMode('idle');
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

  function stopEngine() {
    memoryControls.runner.pause();
    if (engineHandle && typeof engineHandle.stop === 'function') {
      engineHandle.stop();
    }
    engineHandle = null;
  }

  function destroy() {
    stopEngine();
    paletteCostTooltip?.remove();
    memoryControls.destroy();
    removeBoundEvents();
    try {
      unsubscribeSharedClipboard();
    } catch (err) {
      console.error('Error unsubscribing shared clipboard listener', err);
    }
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    if (keyupHandler) {
      document.removeEventListener('keyup', keyupHandler);
      keyupHandler = null;
    }
  }

  bindEvent(moveBtn, 'click', () => {
    setMode('idle');
  });

  bindEvent(wireBtn, 'click', () => {
    setMode(state.mode === 'wireDrawing' ? 'idle' : 'wireDrawing');
  });

  bindEvent(delBtn, 'click', () => {
    setMode(state.mode === 'deleting' ? 'idle' : 'deleting');
  });

  bindEvent(selectBtn, 'click', () => {
    setMode(state.mode === 'selecting' ? 'idle' : 'selecting');
  });

  setCopyPasteEnabled(state.copyPasteEnabled);

  function handlePointerDown(e) {
    hidePaletteCost();
    if (isLocked()) return false;
    if (state.pinch) return true;
    const { x, y } = getPointerPos(e);
    const target = x >= panelTotalWidth ? blockAt(pointerToBoundedCell(x, y) || {}) : null;
    if (x < panelTotalWidth || (target && target.type !== 'INPUT') || ['wireDrawing', 'deleting', 'pasting'].includes(state.mode)) beginEdit();
    const isMiddleButton = e.button === 1;
    const isPrimary = e.button === 0 || e.button === undefined;
    const isSecondary = e.button === 2;
    if (useCamera && (isMiddleButton || (state.spaceHeld && isPrimary))) {
      state.panning = true;
      state.panLast = { x, y };
      state.pointerDown = null;
      state.pointerMoved = false;
      e.preventDefault();
      return true;
    }
    if (state.mode === 'pasting') {
      state.pointerDown = null;
      state.pointerMoved = false;
      if (isSecondary) {
        e.preventDefault();
        setMode('idle');
        return true;
      }
      if (isPrimary && state.clipboard) {
        if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
          const cell = pointerToBoundedCell(x, y);
          if (cell) {
            const valid = canPasteClipboardAt(cell, state.clipboard, true);
            if (valid) {
              applyClipboardAt(cell);
            } else {
              overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
              drawClipboardPreview(cell, true);
              state.pastePreview = { cell, valid: false };
            }
          }
        }
        e.preventDefault();
      }
      return true;
    }
    state.pointerDown = { x, y, time: performance.now(), primary: isPrimary };
    state.pointerMoved = false;
    let handled = false;
    const isSelectionTrigger = e.button === 2 || (state.mode === 'selecting' && isPrimary);
    if (isSelectionTrigger) {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (cell) {
          state.selecting = true;
          state.selectStart = cell;
          state.selection = null;
          overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
          updateCopyPasteButtons();
          handled = true;
        }
      }
      if (e.button === 2 && state.mode !== 'selecting') {
        setMode('selecting');
      }
      e.preventDefault();
    } else {
      if (state.selection) {
        const inGrid = x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight;
        let inside = false;
        if (inGrid) {
          const cell = pointerToBoundedCell(x, y);
          if (cell) {
            if (
              cell.r >= state.selection.r1 &&
              cell.r <= state.selection.r2 &&
              cell.c >= state.selection.c1 &&
              cell.c <= state.selection.c2
            ) {
              inside = true;
              if (state.mode === 'deleting' && isPrimary) {
                const deleted = deleteSelection();
                if (deleted) {
                  state.pointerDown = null;
                  return true;
                }
              }
              if (state.mode === 'idle' && isPrimary) {
                state.selectionDrag = {
                  start: cell,
                  currentOffset: { dr: 0, dc: 0 },
                  valid: true,
                };
                state.pointerMoved = false;
                return true;
              }
            }
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
          state.draggingBlock = { type: item.type, name: item.label, value: false, inputMode: item.inputMode };
          playItemPickupSound();
          handled = true;
        }
      } else if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (!cell) {
          return handled;
        }
        if (state.mode === 'wireDrawing') {
          const block = blockAt(cell);
          if (block) {
            const diagnostic = wireStartDiagnostic(block);
            if (diagnostic) rejectEdit([diagnostic]);
            else state.wireTrace = [coord(cell.r, cell.c)];
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
          renderContent(
            contentCtx,
            circuit,
            0,
            panelTotalWidth,
            state.hoverBlockId,
            camera,
            renderOptions
          );
          updateUsageCounts();
          if (deleted) {
            playRemoveSound();
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
          } else if (
            useCamera &&
            isPrimary &&
            state.mode === 'idle' &&
            !bid &&
            !cellHasWire(cell)
          ) {
            state.panning = true;
            state.panLast = { x, y };
            state.pointerDown = null;
            handled = true;
          }
        }
      }
    }
    return handled;
  }

  const handleOverlayTouchStart = e => {
    if (useCamera && e.touches && e.touches.length >= 2) {
      const started = startPinch(e);
      if (started) {
        return;
      }
    }
    const handled = handlePointerDown(e);
    if (handled && !(clampToBounds && state.panning)) e.preventDefault();
  };

  const handleOverlayContextMenu = e => {
    e.preventDefault();
  };

  bindEvent(overlayCanvas, 'mousedown', handlePointerDown);
  bindEvent(overlayCanvas, 'touchstart', handleOverlayTouchStart, passiveFalseOption);
  bindEvent(overlayCanvas, 'contextmenu', handleOverlayContextMenu);

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

  bindEvent(overlayCanvas, 'wheel', handleWheel, passiveFalseOption);

  function finishSelectionDrag(x = null, y = null) {
    if (!state.selectionDrag) return false;
    const dragState = state.selectionDrag;
    let offset = dragState.currentOffset || { dr: 0, dc: 0 };
    let candidateValid = dragState.valid;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (cell) {
          offset = {
            dr: cell.r - dragState.start.r,
            dc: cell.c - dragState.start.c,
          };
          candidateValid = canMoveSelection(offset.dr, offset.dc);
        }
      } else {
        candidateValid = false;
      }
    }
    state.selectionDrag = null;
    const moved = offset.dr !== 0 || offset.dc !== 0;
    const canApply = moved && candidateValid;
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (canApply) {
      moveSelection(offset.dr, offset.dc);
    } else if (state.selection) {
      if (moved && !candidateValid) rejectLayout();
      drawSelection();
    }
    state.pointerDown = null;
    state.pointerMoved = false;
    return canApply;
  }

  function handlePointerUp(e) {
    if (isLocked()) return;
    if (state.pinch) {
      if (!e.touches || e.touches.length < 2) {
        endPinch();
      }
      state.pointerDown = null;
      state.pointerMoved = false;
      return;
    }
    const { x, y } = getPointerPos(e);
    if (state.panning) {
      state.panning = false;
      state.panLast = null;
      state.pointerDown = null;
      return;
    }
    if (state.mode === 'pasting') {
      state.pointerDown = null;
      state.pointerMoved = false;
      return;
    }
    if (state.selectionDrag) {
      finishSelectionDrag(x, y);
      return;
    }
    if (state.selecting) {
      state.selecting = false;
      state.pointerDown = null;
      state.pointerMoved = false;
      if (
        state.selectStart &&
        x >= panelTotalWidth &&
        x < canvasWidth &&
        y >= 0 &&
        y < gridHeight
      ) {
        const cell = pointerToBoundedCell(x, y);
        if (cell) {
          const r1 = Math.min(state.selectStart.r, cell.r);
          const c1 = Math.min(state.selectStart.c, cell.c);
          const r2 = Math.max(state.selectStart.r, cell.r);
          const c2 = Math.max(state.selectStart.c, cell.c);
          const blocks = new Set();
          const wires = new Set();
          const initialBounds = { r1, c1, r2, c2 };
          Object.entries(circuit.blocks).forEach(([id, b]) => {
            if (b.pos.r >= r1 && b.pos.r <= r2 && b.pos.c >= c1 && b.pos.c <= c2) {
              blocks.add(id);
            }
          });
          if (blocks.size) {
            expandSelectionConnections(blocks, wires);
          }
          const bounds = computeSelectionBounds(blocks, wires);
          if (bounds) {
            const cross = selectionHasCross(initialBounds, wires);
            state.selection = { ...bounds, blocks, wires, cross };
          } else {
            state.selection = null;
          }
        } else {
          state.selection = null;
        }
      } else {
        state.selection = null;
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (state.selection) drawSelection();
      state.selectStart = null;
      updateCopyPasteButtons();
      if (state.mode === 'selecting') {
        setMode('idle');
      }
      return;
    }
    if (state.pointerDown?.primary && !state.pointerMoved && !state.draggingBlock && state.mode === 'idle') {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (cell) {
          const blk = blockAt(cell);
          if (blk?.type === 'D' && performance.now() - state.pointerDown.time < 500) {
            if (swapMemoryInputs(circuit, blk.id)) snapshot();
          }
          if (blk && blk.type === 'INPUT') {
            if (blk.inputMode === 'button') toggleButton(circuit, blk.id);
            else blk.value = !blk.value;
            memoryControls.refresh();
            evaluateCircuit(circuit);
            renderContent(
              contentCtx,
              circuit,
              0,
              panelTotalWidth,
              state.hoverBlockId,
              camera,
              renderOptions
            );
          }
        }
      }
    }
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 1) {
      if (isValidWire(state.wireTrace)) {
        const id = nextUniqueId('w');
        const startBlock = blockAt(state.wireTrace[0]);
        const endBlock = blockAt(state.wireTrace[state.wireTrace.length - 1]);
        circuit.wires[id] = newWire({ id, path: [...state.wireTrace], startBlockId: startBlock.id, endBlockId: endBlock.id });
        assignNewInputRole(circuit, circuit.wires[id]);
        endBlock.inputs = [...(endBlock.inputs || []), startBlock.id];
        renderContent(
          contentCtx,
          circuit,
          0,
          panelTotalWidth,
          state.hoverBlockId,
          camera,
          renderOptions
        );
        updateUsageCounts();
        clearSelection();
        snapshot();
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    } else if (state.draggingBlock) {
      let placed = false;
      let shouldPlayDropSound = false;
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (!cell) {
          if (state.draggingBlock.id) {
            const id = state.draggingBlock.id;
            const target = state.draggingBlock.origPos;
            circuit.blocks[id] = newBlock({
              ...state.draggingBlock,
              id,
              type: state.draggingBlock.type,
              name: state.draggingBlock.name,
              pos: target,
            });
            placed = true;
            if (state.draggingBlock.wires) {
              state.draggingBlock.wires.forEach(w => {
                circuit.wires[w.id] = w;
                const endB = circuit.blocks[w.endBlockId];
                if (endB) endB.inputs = [...(endB.inputs || []), w.startBlockId];
              });
            }
          } else if (
            state.draggingBlock.type === 'INPUT' ||
            state.draggingBlock.type === 'OUTPUT'
          ) {
            showPaletteItem(
              state.draggingBlock.type,
              state.draggingBlock.name
            );
          }
        } else if (state.draggingBlock.id) {
          const existingBlock = blockAt(cell);
          const occupiedByWire = cellHasWire(cell);
          if (existingBlock && !hasMemoryConnections(state.draggingBlock)) {
            const replaced = replaceExistingBlock(existingBlock, {
              type: state.draggingBlock.type,
              name: state.draggingBlock.name,
              value: state.draggingBlock.value,
              inputMode: state.draggingBlock.inputMode,
            });
            if (replaced) {
              placed = true;
              shouldPlayDropSound = true;
            }
          }
          if (!placed) {
            const collision = Boolean(existingBlock) || occupiedByWire;
            if (collision && !existingBlock) rejectLayout();
            if (collision && hasMemoryConnections(state.draggingBlock)) rejectLayout();
            const target = collision ? state.draggingBlock.origPos : cell;
            const id = state.draggingBlock.id;
            circuit.blocks[id] = newBlock({
              ...state.draggingBlock,
              id,
              type: state.draggingBlock.type,
              name: state.draggingBlock.name,
              pos: target,
            });
            placed = true;
            shouldPlayDropSound = !collision;
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
          }
        } else {
          const existingBlock = blockAt(cell);
          const occupiedByWire = cellHasWire(cell);
          if (!existingBlock && !occupiedByWire) {
            const id = 'b' + Date.now();
            circuit.blocks[id] = newBlock({
              ...state.draggingBlock,
              id,
              type: state.draggingBlock.type,
              name: state.draggingBlock.name,
              pos: cell,
            });
            placed = true;
            shouldPlayDropSound = true;
          } else if (existingBlock) {
            const replaced = replaceExistingBlock(existingBlock, {
              type: state.draggingBlock.type,
              name: state.draggingBlock.name,
              value: state.draggingBlock.value,
              inputMode: state.draggingBlock.inputMode,
            });
            placed = replaced;
            if (replaced) {
              shouldPlayDropSound = true;
            }
          }
          if (
            placed &&
            (state.draggingBlock.type === 'INPUT' ||
              state.draggingBlock.type === 'OUTPUT')
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
      const removedExistingBlock =
        !placed && Boolean(state.draggingBlock && state.draggingBlock.id);
      if (placed) {
        if (state.draggingBlock.id) restoreMemoryDragWires(state.draggingBlock);
        const before = state.draggingBlock.before;
        if (before && !canCommitEdit(circuit, before, true)) {
          circuit.blocks = before.blocks;
          circuit.wires = before.wires;
          shouldPlayDropSound = false;
        }
        if (shouldPlayDropSound) {
          playItemDropSound();
        }
        renderContent(
          contentCtx,
          circuit,
          0,
          panelTotalWidth,
          state.hoverBlockId,
          camera,
          renderOptions
        );
        syncPaletteWithCircuit();
        if (!before || designKey(before) !== designKey(circuit)) snapshot();
        else {
          // A rejected or unchanged drag must not capture unrelated switch
          // changes in undo history, normalize roles, or change runtime values.
          circuit.blocks = before.blocks;
          circuit.wires = before.wires;
        }
      } else if (removedExistingBlock) {
        syncPaletteWithCircuit();
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

  bindEvent(overlayCanvas, 'mouseup', handlePointerUp);
  bindEvent(overlayCanvas, 'touchend', handlePointerUp);

  function handlePointerMove(e) {
    if (isLocked()) { hidePaletteCost(); return false; }
    const { x, y } = getPointerPos(e);
    updatePaletteCost(e, x, y);
    if (x < panelTotalWidth) overlayCanvas.title = '';
    if (state.panning) {
      if (state.panLast) {
        const moved = camera.pan(x - state.panLast.x, y - state.panLast.y);
        state.panLast = { x, y };
        return moved;
      }
      return false;
    }
    if (state.mode === 'pasting' && state.clipboard) {
      let previewCell = null;
      let valid = false;
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (cell) {
          previewCell = cell;
          valid = canPasteClipboardAt(cell, state.clipboard);
        }
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (previewCell) {
        drawClipboardPreview(previewCell, !valid);
        state.pastePreview = { cell: previewCell, valid };
      } else {
        state.pastePreview = null;
        if (state.selection) {
          drawSelection();
        }
      }
      return true;
    }
    if (state.selectionDrag && state.selection) {
      let offset = state.selectionDrag.currentOffset || { dr: 0, dc: 0 };
      let valid = true;
      let hasCell = false;
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (cell) {
          offset = {
            dr: cell.r - state.selectionDrag.start.r,
            dc: cell.c - state.selectionDrag.start.c,
          };
          state.selectionDrag.currentOffset = offset;
          hasCell = true;
          const moved = offset.dr !== 0 || offset.dc !== 0;
          if (moved) {
            state.pointerMoved = true;
          }
          valid = canMoveSelection(offset.dr, offset.dc);
          state.selectionDrag.valid = valid;
        }
      } else {
        valid = false;
        state.selectionDrag.valid = false;
      }
      const invalidHighlight = (!valid || !hasCell) && (offset.dr !== 0 || offset.dc !== 0);
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawSelection({ offset, invalid: invalidHighlight });
      return true;
    }
    if (state.pointerDown) {
      const dx = x - state.pointerDown.x;
      const dy = y - state.pointerDown.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) state.pointerMoved = true;
    }
    if (state.selecting) {
      if (x < panelTotalWidth || x >= canvasWidth || y < 0 || y >= gridHeight) {
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        return false;
      }
      const cell = pointerToBoundedCell(x, y);
      if (!cell || !state.selectStart) {
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        return false;
      }
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
      return false;
    }
    if (state.mode === 'wireDrawing' && state.wireTrace.length > 0 && (e.buttons === 1 || e.touches)) {
      state.hoverBlockId = null;
      if (x < panelTotalWidth || x >= canvasWidth || y < 0 || y >= gridHeight) return true;
      const cell = pointerToBoundedCell(x, y);
      if (!cell) return true;
      const last = state.wireTrace[state.wireTrace.length - 1];
      if (!last || last.r !== cell.r || last.c !== cell.c) {
        state.wireTrace.push(coord(cell.r, cell.c));
        if (!isValidWireTrace(state.wireTrace)) {
          const start = blockAt(state.wireTrace[0]), end = blockAt(state.wireTrace.at(-1));
          const diagnostics = start && end ? connectionDiagnostics(circuit, start.id, end.id) : [];
          if (diagnostics.length) rejectEdit(diagnostics);
          else rejectLayout();
          state.wireTrace = [];
          overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
          setMode('idle');
          return false;
        }
        playWirePlacingSound();
      }
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      overlayCtx.save();
      const activeTheme = getActiveTheme();
      const isDarkTheme = /midnight|dark|neon|night/i.test(String(activeTheme?.id || ''));
      overlayCtx.strokeStyle = isDarkTheme ? 'rgba(255,255,255,0.9)' : 'rgba(17,17,17,0.4)';
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
      return true;
    } else {
      if (x >= panelTotalWidth && x < canvasWidth && y >= 0 && y < gridHeight) {
        const cell = pointerToBoundedCell(x, y);
        if (!cell) {
          state.hoverBlockId = null;
          overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
          if (state.selection && !state.draggingBlock && state.wireTrace.length === 0) {
            drawSelection();
          }
          return Boolean(state.draggingBlock || state.wireTrace.length > 0 || state.dragCandidate);
        }
        const hovered = blockAt(cell);
        state.hoverBlockId = hovered ? hovered.id : null;
        overlayCanvas.title = hovered?.type === 'D' ? D_HELP
          : hovered?.inputMode === 'button' ? '클릭/탭: 입력 켜기/끄기 · 다음 tick 후 자동으로 꺼짐' : '';
        if (state.dragCandidate && (cell.r !== state.dragCandidate.start.r || cell.c !== state.dragCandidate.start.c)) {
          beginEdit();
          const b = circuit.blocks[state.dragCandidate.id];
          if (b) {
            const before = structuredClone(circuit);
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
              value: b.value,
              inputMode: b.inputMode,
              origPos: b.pos,
              wires: removedWires,
              before
            };
            playItemPickupSound();
            delete circuit.blocks[state.dragCandidate.id];
            renderContent(
              contentCtx,
              circuit,
              0,
              panelTotalWidth,
              state.hoverBlockId,
              camera,
              renderOptions
            );
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
            { type: state.draggingBlock.type, name: state.draggingBlock.name,
              inputMode: state.draggingBlock.inputMode, pos: cell },
            panelTotalWidth,
            false,
            camera
          );
          overlayCtx.restore();
        }
        if (state.selection && !state.draggingBlock && state.wireTrace.length === 0) {
          drawSelection();
        }
        return Boolean(state.draggingBlock || state.dragCandidate);
      } else {
        state.hoverBlockId = null;
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (state.selection && !state.draggingBlock && state.wireTrace.length === 0) {
          drawSelection();
        }
        return Boolean(state.draggingBlock || state.dragCandidate);
      }
    }
    return Boolean(state.draggingBlock || state.wireTrace.length > 0 || state.dragCandidate);
  }

  const handleOverlayTouchMove = e => {
    const isCancelable = e.cancelable;
    if (state.pinch) {
      const handled = updatePinch(e);
      if (handled && isCancelable) {
        e.preventDefault();
      }
      return;
    }
    if (!isCancelable) {
      return;
    }
    const handled = handlePointerMove(e);
    if (handled && isCancelable) {
      e.preventDefault();
    }
  };

  const handleOverlayTouchEndPinch = e => {
    if (state.pinch && (!e.touches || e.touches.length < 2)) {
      endPinch();
    }
  };

  function cancelInteraction() {
    if (state.pinch) endPinch();
    const before = state.draggingBlock?.before;
    if (before) {
      circuit.blocks = before.blocks;
      circuit.wires = before.wires;
    }
    state.draggingBlock = null;
    state.dragCandidate = null;
    state.selectionDrag = null;
    state.wireTrace = [];
    state.pointerDown = null;
    state.pointerMoved = false;
    state.selecting = false;
    state.panning = false;
    setMode('idle');
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    syncPaletteWithCircuit();
    refreshVisuals();
    updateUsageCounts();
  }

  bindEvent(overlayCanvas, 'mousemove', handlePointerMove);
  bindEvent(overlayCanvas, 'mouseleave', hidePaletteCost);
  bindEvent(document, 'pointerdown', hidePaletteCost, true);
  bindEvent(document, 'keydown', hidePaletteCost);
  bindEvent(document, 'scroll', hidePaletteCost, true);
  bindEvent(window, 'blur', hidePaletteCost);
  bindEvent(window, 'resize', hidePaletteCost);
  bindEvent(overlayCanvas, 'touchmove', handleOverlayTouchMove, passiveFalseOption);
  bindEvent(overlayCanvas, 'touchend', handleOverlayTouchEndPinch);
  bindEvent(overlayCanvas, 'touchcancel', cancelInteraction);

  function handleDocMove(e) {
    if (!state.draggingBlock) return;
    if (!e.cancelable) {
      return;
    }
    const rect = overlayCanvas.getBoundingClientRect();
    const point = e.touches?.[0] || e;
    if (point.clientX < rect.left || point.clientX >= rect.right || point.clientY < rect.top || point.clientY >= rect.bottom) {
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    if (e.touches && e.cancelable) {
      e.preventDefault();
    }
  }

  function handleDocUp(e) {
    if (isLocked()) return false;
    const rect = overlayCanvas.getBoundingClientRect();
    const scale = parseFloat(overlayCanvas.dataset.scale || '1');
    const point = e.changedTouches?.[0] || e;
    const ox = (point.clientX - rect.left) / scale;
    const oy = (point.clientY - rect.top) / scale;
    if (state.draggingBlock) {
      let removedExistingBlock = false;
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
        removedExistingBlock = true;
        Object.keys(circuit.wires).forEach(wid => {
          const w = circuit.wires[wid];
          if (w.startBlockId === state.draggingBlock.id || w.endBlockId === state.draggingBlock.id) {
            const endB = circuit.blocks[w.endBlockId];
            if (endB) endB.inputs = (endB.inputs || []).filter(x => x !== w.startBlockId);
            delete circuit.wires[wid];
          }
        });
        renderContent(
          contentCtx,
          circuit,
          0,
          panelTotalWidth,
          state.hoverBlockId,
          camera,
          renderOptions
        );
        updateUsageCounts();
      }
      state.draggingBlock = null;
      overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (removedExistingBlock) {
        playRemoveSound();
        snapshot();
      }
    }
    if (state.selectionDrag) {
      finishSelectionDrag(ox, oy);
    }
    state.dragCandidate = null;
    state.pointerDown = null;
    state.pointerMoved = false;
  }

  bindEvent(document, 'mousemove', handleDocMove);
  bindEvent(document, 'touchmove', handleDocMove, passiveFalseOption);
  bindEvent(document, 'mouseup', handleDocUp);
  bindEvent(document, 'touchend', handleDocUp);

  function startBlockDrag(type, name) {
    if (isLocked()) return;
    beginEdit();
    state.draggingBlock = { type, name, value: false };
    playItemPickupSound();
  }

  function moveCircuit(dx, dy) {
    if (isLocked()) return false;
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
    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
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
          // Fixed IN/OUT blocks always start in the disabled (0) state.
          value: false,
          fixed: true,
          inputMode: state.inputMode,
        });
      }
    });
    syncPaletteWithCircuit();
    renderContent(
      contentCtx,
      circuit,
      0,
      panelTotalWidth,
      state.hoverBlockId,
      camera,
      renderOptions
    );
    undoStack.length = 0;
    redoStack.length = 0;
    snapshot();
  }

  updateUsageCounts();
  snapshot(false);
  if (!options.deferPlayback) memoryControls.setReady();
  function restoreDesign(data) {
    beginEdit();
    applyState(JSON.stringify(data));
    resetExecution(circuit);
    undoStack.length = 0;
    redoStack.length = 0;
    hasInitialSnapshot = false;
    snapshot(false);
    memoryControls.refresh();
  }
  return {
    restoreCircuit: restoreDesign,
    state,
    circuit,
    tickRunner: memoryControls.runner,
    setPlaybackReady: memoryControls.setReady,
    getPlaybackBarHeight: memoryControls.getHeight,
    getStatusBarHeight: memoryControls.getStatusHeight,
    startBlockDrag,
    syncPaletteWithCircuit,
    setIOPaletteNames,
    moveCircuit,
    placeFixedIO,
    setTutorialHighlights,
    setTutorialWireGuides,
    moveSelection,
    clearSelection,
    undo,
    redo,
    stopEngine,
    setCopyPasteEnabled,
    destroy,
    attachKeyboardHandlers,
    resizeCanvas,
    expandGrid,
    shrinkGrid,
    canExpandGrid,
    canShrinkGrid,
    refreshVisuals,
    createTraceView() {
      if (!camera) return null;
      const saved = camera.getState();
      return {
        focus(ids, bottomScreen) {
          const targets = ids.map(id => circuit.blocks[id]).filter(Boolean);
          if (!targets.length) return;
          const bounds = overlayCanvas.getBoundingClientRect();
          const availableHeight = Math.min(gridHeight, (bottomScreen - bounds.top - 65) * canvasHeight / bounds.height);
          if (availableHeight < 60) return;
          // Clamp against the unobscured viewport during replay, so blocks near
          // the bottom of a bounded grid can be brought above the trace dock.
          camera.setViewport(canvasWidth, canvasHeight, { gridWidth, gridHeight: availableHeight });
          const points = targets.map(b => camera.cellToScreenCell(b.pos));
          const state = camera.getState(), size = CELL * state.scale;
          const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)) + size;
          const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y)) + size;
          if (minX < state.panelWidth + 20 || maxX > canvasWidth - 20 || minY < 20 || maxY > availableHeight) {
            camera.pan((state.panelWidth + canvasWidth) / 2 - (minX + maxX) / 2,
              availableHeight / 2 - (minY + maxY) / 2);
          }
        },
        restore() {
          camera.setViewport(canvasWidth, canvasHeight, { gridWidth, gridHeight });
          camera.setScale(saved.scale);
          const current = camera.getState();
          camera.pan((current.originX - saved.originX) * saved.scale, (current.originY - saved.originY) * saved.scale);
        }
      };
    },
  };
}
