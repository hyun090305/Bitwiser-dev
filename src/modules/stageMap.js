import {
  lockOrientationLandscape,
  hideStageMapScreen,
  showGameScreen,
  showStageMapScreen,
  openUserProblemsFromShortcut
} from './navigation.js';
import { openLabModeFromShortcut } from './labMode.js';
import { STAGE_GRAPH, STAGE_TYPE_META, STAGE_MAP_BLUEPRINT } from './stageMapLayout.js';
import { makeCircuit, newBlock, newWire, coord, CELL, GAP } from '../canvas/model.js';
import { drawGrid, renderContent, setupCanvas } from '../canvas/renderer.js';
import { createCamera } from '../canvas/camera.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

const SPECIAL_NODE_KEY = 'stageMapSpecialClears';
const PITCH = CELL + GAP;

const GRID_STYLE = {
  background: 'rgba(15, 23, 42, 0.85)',
  gridStroke: 'rgba(148, 163, 184, 0.18)',
  gridLineWidth: 1,
  panelShadow: null,
  borderColor: 'rgba(15, 23, 42, 0.2)'
};

const STAGE_BLOCK_BASE_STYLE = {
  font: '700 20px "Noto Sans KR", sans-serif',
  subtitleSize: 13,
  subtitleColor: '#1e293b',
  radius: 18,
  hoverFill: ['#fff7ed', '#fed7aa'],
  hoverShadow: {
    color: 'rgba(248, 250, 252, 0.55)',
    blur: 30,
    offsetY: 18
  },
  shadow: {
    color: 'rgba(15, 23, 42, 0.45)',
    blur: 36,
    offsetY: 22
  }
};

const STAGE_TYPE_THEMES = {
  primitive_gate: {
    fill: ['#dbeafe', '#bfdbfe'],
    textColor: '#0f172a'
  },
  logic_stage: {
    fill: ['#ede9fe', '#ddd6fe'],
    textColor: '#4c1d95'
  },
  arith_stage: {
    fill: ['#fee2e2', '#fecaca'],
    textColor: '#7f1d1d'
  },
  mode: {
    fill: ['#fef3c7', '#fde68a'],
    textColor: '#713f12'
  },
  title: {
    fill: ['#fdf4ff', '#fae8ff'],
    textColor: '#6b21a8'
  }
};

const LOCKED_STYLE = {
  fill: ['#0f172a', '#1e293b'],
  textColor: '#94a3b8',
  subtitleColor: '#cbd5f5'
};

const CLEARED_STYLE = {
  fill: ['#fef3c7', '#fde68a'],
  textColor: '#92400e',
  subtitleColor: '#78350f'
};

const COMING_SOON_STYLE = {
  fill: ['#e2e8f0', '#cbd5f5'],
  textColor: '#475569',
  subtitleColor: '#475569'
};

const WIRE_STYLE_INACTIVE = {
  color: 'rgba(148, 163, 184, 0.45)',
  dashPattern: [26, 18],
  width: 2.5,
  nodeFill: 'rgba(248, 250, 252, 0.7)'
};

const WIRE_STYLE_ACTIVE = {
  color: '#fbbf24',
  dashPattern: [16, 12],
  width: 3.4,
  nodeFill: 'rgba(255, 247, 222, 0.95)',
  nodeShadow: 'rgba(251, 191, 36, 0.6)'
};

function loadSpecialNodeClears() {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SPECIAL_NODE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch (err) {
    console.warn('Failed to load special node progress', err);
    return new Set();
  }
}

function saveSpecialNodeClears(set) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SPECIAL_NODE_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to persist special node progress', err);
  }
}

function getTypeLabel(type) {
  const meta = STAGE_TYPE_META[type];
  if (!meta) return '';
  const text = translate(meta.labelKey);
  return typeof text === 'string' ? text : '';
}

function computeBlockBounds(block) {
  if (!block?.pos) return null;
  const { r, c } = block.pos;
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  const spanRows = Math.max(1, Math.round(block.span?.rows ?? block.span?.h ?? 1));
  const spanCols = Math.max(1, Math.round(block.span?.cols ?? block.span?.w ?? 1));
  const width = spanCols * CELL + Math.max(0, spanCols - 1) * GAP;
  const height = spanRows * CELL + Math.max(0, spanRows - 1) * GAP;
  const left = GAP + c * PITCH;
  const top = GAP + r * PITCH;
  return { left, top, right: left + width, bottom: top + height };
}

function buildStageCircuit(blueprint, { padding = 2 } = {}) {
  const nodes = blueprint?.nodes || [];
  const wires = blueprint?.wires || [];
  let maxRow = 0;
  let maxCol = 0;
  nodes.forEach(node => {
    if (!node?.block) return;
    maxRow = Math.max(maxRow, node.block.y + node.block.h);
    maxCol = Math.max(maxCol, node.block.x + node.block.w);
  });
  wires.forEach(wire => {
    (wire.path || []).forEach(point => {
      if (!point) return;
      maxRow = Math.max(maxRow, point.y);
      maxCol = Math.max(maxCol, point.x);
    });
  });
  const rowOffset = padding;
  const colOffset = padding;
  const totalRows = maxRow + rowOffset + 3;
  const totalCols = maxCol + colOffset + 3;
  const circuit = makeCircuit(totalRows, totalCols);
  const visuals = [];
  const wireRefs = [];

  nodes.forEach(node => {
    if (!node?.block) return;
    const pos = coord(node.block.y + rowOffset, node.block.x + colOffset);
    const block = newBlock({ id: node.id, type: 'STAGE', name: node.label, pos, fixed: true });
    block.span = { rows: node.block.h, cols: node.block.w };
    circuit.blocks[block.id] = block;
    visuals.push({ id: node.id, block, bounds: computeBlockBounds(block) });
  });

  wires.forEach(wire => {
    const path = (wire.path || []).map(point => coord(point.y + rowOffset, point.x + colOffset));
    const wireObj = newWire({ id: wire.id, path, startBlockId: wire.from, endBlockId: wire.to });
    wireObj.stageConnection = { from: wire.from, to: wire.to };
    circuit.wires[wire.id] = wireObj;
    wireRefs.push(wireObj);
  });

  const worldWidth = GAP + totalCols * PITCH;
  const worldHeight = GAP + totalRows * PITCH;

  return { circuit, visuals, wires: wireRefs, worldWidth, worldHeight };
}

export function initializeStageMap({
  getLevelTitle,
  isLevelUnlocked,
  getClearedLevels,
  startLevel,
  returnToEditScreen
} = {}) {
  const screenEl = document.getElementById('stageMapScreen');
  const viewport = document.getElementById('stageMapViewport');
  const bgCanvas = document.getElementById('stageMapBgCanvas');
  const contentCanvas = document.getElementById('stageMapContentCanvas');
  const overlayCanvas = document.getElementById('stageMapOverlayCanvas');
  const zoomInBtn = document.getElementById('stageMapZoomIn');
  const zoomOutBtn = document.getElementById('stageMapZoomOut');
  const zoomResetBtn = document.getElementById('stageMapZoomReset');
  const panels = Array.from(document.querySelectorAll('.stage-panel'));
  const panelButtons = document.querySelectorAll('[data-panel-target]');
  const panelButtonByPanel = new Map();
  const panelBackdrop = document.getElementById('stagePanelBackdrop');

  if (!screenEl || !viewport || !bgCanvas || !contentCanvas || !overlayCanvas) {
    return null;
  }

  const blueprintNodeMap = new Map((STAGE_MAP_BLUEPRINT.nodes || []).map(node => [node.id, node]));
  const { circuit, visuals, wires, worldWidth, worldHeight } = buildStageCircuit(STAGE_MAP_BLUEPRINT);

  const camera = createCamera();
  const state = {
    nodes: [],
    nodeLookup: new Map(),
    dependencies: new Map(),
    nodeStatus: new Map(),
    openPanel: null,
    specialClears: loadSpecialNodeClears(),
    hoverNodeId: null,
    pointerState: null,
    lockedFeedbackId: null,
    lockedFeedbackTimeout: null,
    circuit,
    nodeVisuals: visuals,
    nodeVisualLookup: new Map(visuals.map(v => [v.id, v])),
    blockByNode: new Map(Object.entries(circuit.blocks || {})),
    wires,
    viewportSize: { width: 0, height: 0 },
    ctx: { grid: null, content: null },
    camera,
    worldSize: { width: worldWidth, height: worldHeight },
    animationPhase: 0,
    lastFrameTime: 0,
    animationHandle: null
  };

  camera.setBounds(worldWidth, worldHeight, { clamp: true });

  function updateZoomLabel() {
    if (!zoomResetBtn) return;
    const scale = camera.getScale?.() ?? 1;
    zoomResetBtn.textContent = `${scale.toFixed(1)}×`;
  }

  function drawScene() {
    if (!state.ctx.grid || !state.ctx.content) return;
    drawGrid(state.ctx.grid, circuit.rows, circuit.cols, 0, camera, GRID_STYLE);
    renderContent(
      state.ctx.content,
      circuit,
      state.animationPhase,
      0,
      state.hoverNodeId,
      camera,
      STAGE_BLOCK_BASE_STYLE
    );
  }

  function animationLoop(timestamp) {
    state.animationHandle = window.requestAnimationFrame(animationLoop);
    if (screenEl.offsetParent === null) {
      state.lastFrameTime = timestamp;
      return;
    }
    const delta = state.lastFrameTime ? timestamp - state.lastFrameTime : 16;
    state.lastFrameTime = timestamp;
    state.animationPhase = (state.animationPhase + delta * 0.02) % 2000;
    drawScene();
  }

  function setHoverNode(nodeId) {
    if (state.hoverNodeId === nodeId) return;
    state.hoverNodeId = nodeId;
    drawScene();
  }

  function hitTest(worldX, worldY) {
    for (const visual of state.nodeVisuals) {
      const bounds = visual.bounds;
      if (!bounds) continue;
      if (worldX >= bounds.left && worldX <= bounds.right && worldY >= bounds.top && worldY <= bounds.bottom) {
        return visual.id;
      }
    }
    return null;
  }

  function getPointerPosition(event) {
    const rect = overlayCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function updatePointerHover(event) {
    if (state.pointerState) return;
    const pos = getPointerPosition(event);
    const world = camera.screenToWorld(pos.x, pos.y);
    const nodeId = hitTest(world.x, world.y);
    setHoverNode(nodeId);
  }

  function handlePointerDown(event) {
    overlayCanvas.setPointerCapture(event.pointerId);
    const pos = getPointerPosition(event);
    const world = camera.screenToWorld(pos.x, pos.y);
    const nodeId = hitTest(world.x, world.y);
    state.pointerState = {
      id: event.pointerId,
      nodeId,
      isPanning: !nodeId,
      moved: false,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
    if (nodeId) {
      setHoverNode(nodeId);
    }
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!state.pointerState) {
      updatePointerHover(event);
      return;
    }
    const pointer = state.pointerState;
    const dx = event.clientX - pointer.lastClientX;
    const dy = event.clientY - pointer.lastClientY;
    pointer.lastClientX = event.clientX;
    pointer.lastClientY = event.clientY;
    if (pointer.isPanning) {
      camera.pan(dx, dy);
      updateZoomLabel();
      drawScene();
      pointer.moved = true;
      return;
    }
    const travel = Math.hypot(dx, dy);
    if (travel > 4) {
      pointer.isPanning = true;
      pointer.nodeId = null;
      setHoverNode(null);
      return;
    }
    const pos = getPointerPosition(event);
    const world = camera.screenToWorld(pos.x, pos.y);
    const nodeId = hitTest(world.x, world.y);
    setHoverNode(nodeId);
  }

  function resetPointerState() {
    if (state.pointerState) {
      try {
        overlayCanvas.releasePointerCapture(state.pointerState.id);
      } catch (err) {
        // ignore
      }
    }
    state.pointerState = null;
  }

  function handlePointerUp(event) {
    if (!state.pointerState || state.pointerState.id !== event.pointerId) {
      updatePointerHover(event);
      return;
    }
    const pointer = state.pointerState;
    resetPointerState();
    if (pointer.isPanning || !pointer.nodeId) {
      return;
    }
    const node = state.nodeLookup.get(pointer.nodeId);
    if (node) {
      handleNodeActivation(node);
    }
  }

  function handleWheel(event) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    const pos = getPointerPosition(event);
    const currentScale = camera.getScale?.() ?? 1;
    camera.setScale(currentScale * factor, pos.x, pos.y);
    updateZoomLabel();
    drawScene();
  }

  function fitCameraToWorld() {
    const { width, height } = state.viewportSize;
    if (!width || !height) return;
    const stageWidth = state.worldSize.width;
    const stageHeight = state.worldSize.height;
    if (!stageWidth || !stageHeight) return;
    const paddingFactor = 1.1;
    const scaleX = width / (stageWidth * paddingFactor);
    const scaleY = height / (stageHeight * paddingFactor);
    const scale = Math.min(scaleX, scaleY);
    if (Number.isFinite(scale) && scale > 0) {
      camera.setScale(scale);
    }
    const stateInfo = camera.getState?.();
    const effectiveScale = stateInfo?.scale ?? scale;
    if (!effectiveScale) return;
    const visibleWidth = width / effectiveScale;
    const visibleHeight = height / effectiveScale;
    const targetOriginX = Math.max(0, (stageWidth - visibleWidth) / 2);
    const targetOriginY = Math.max(0, (stageHeight - visibleHeight) / 2);
    const dx = ((stateInfo?.originX ?? 0) - targetOriginX) * effectiveScale;
    const dy = ((stateInfo?.originY ?? 0) - targetOriginY) * effectiveScale;
    camera.pan(dx, dy);
    updateZoomLabel();
    drawScene();
  }

  function resizeViewport(forceFit = false) {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(200, Math.floor(rect.width));
    const height = Math.max(200, Math.floor(rect.height));
    state.viewportSize = { width, height };
    state.ctx.grid = setupCanvas(bgCanvas, width, height);
    state.ctx.content = setupCanvas(contentCanvas, width, height);
    setupCanvas(overlayCanvas, width, height);
    camera.setViewport(width, height);
    if (forceFit) {
      fitCameraToWorld();
    } else {
      drawScene();
    }
  }

  function buildNodeStyle(node) {
    const base = { ...STAGE_BLOCK_BASE_STYLE, ...(STAGE_TYPE_THEMES[node.type] || {}) };
    let style = base;
    if (node.comingSoon) {
      style = { ...style, ...COMING_SOON_STYLE };
    }
    if (node.status?.displayCleared) {
      style = { ...style, ...CLEARED_STYLE };
    } else if (node.status?.locked) {
      style = { ...style, ...LOCKED_STYLE };
    }
    if (state.lockedFeedbackId === node.id) {
      style = {
        ...style,
        strokeColor: '#f87171',
        strokeWidth: 2.5
      };
    }
    return style;
  }

  function updateWireStyles() {
    state.wires.forEach(wire => {
      const sourceId = wire.stageConnection?.from ?? wire.startBlockId;
      const status = sourceId ? state.nodeStatus.get(sourceId) : null;
      const active = Boolean(status?.progressCleared);
      wire.style = active ? WIRE_STYLE_ACTIVE : WIRE_STYLE_INACTIVE;
    });
  }

  function updateBlockStyles() {
    state.nodes.forEach(node => {
      const block = state.blockByNode.get(node.id);
      if (!block) return;
      block.name = node.title;
      const statusText = node.status ? translate(node.status.statusKey) : '';
      block.subtitle = statusText || '';
      block.style = buildNodeStyle(node);
    });
    updateWireStyles();
    drawScene();
  }

  function evaluateNodeStatus(node, memo, visiting, clearedLevels) {
    if (!node) return null;
    if (memo.has(node.id)) {
      return memo.get(node.id);
    }
    if (visiting.has(node.id)) {
      console.warn('Stage map cycle detected at node', node.id);
      return null;
    }
    visiting.add(node.id);
    const deps = state.dependencies.get(node.id) ?? [];
    const depStatuses = deps.map(depId => {
      const depNode = state.nodeLookup.get(depId);
      return evaluateNodeStatus(depNode, memo, visiting, clearedLevels);
    }).filter(Boolean);
    visiting.delete(node.id);
    const prerequisitesMet = depStatuses.every(status => status.progressCleared);

    let unlocked = prerequisitesMet;
    let locked = !unlocked;
    let displayCleared = false;
    let progressCleared = false;
    let statusKey = 'stageDetailLockedMessage';

    if (node.level) {
      const levelUnlocked = isLevelUnlocked?.(node.level) ?? true;
      unlocked = prerequisitesMet && levelUnlocked;
      locked = !unlocked;
      displayCleared = (clearedLevels.has(node.level));
      progressCleared = displayCleared;
      statusKey = displayCleared
        ? 'stageDetailClearedMessage'
        : (unlocked ? 'stageDetailReadyMessage' : 'stageDetailLockedMessage');
    } else if (node.type === 'mode') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = state.specialClears.has(node.id);
      progressCleared = displayCleared;
      statusKey = displayCleared
        ? 'stageDetailShortcutCleared'
        : (unlocked ? 'stageDetailShortcutReady' : 'stageDetailLockedMessage');
    } else if (node.type === 'title') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = unlocked;
      progressCleared = unlocked;
      statusKey = unlocked ? 'stageDetailTitleUnlocked' : 'stageDetailTitleLocked';
    } else if (node.autoClear) {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = false;
      progressCleared = unlocked;
      statusKey = node.comingSoon ? 'stageDetailComingSoonStatus' : 'stageDetailReadyMessage';
    }

    const result = { unlocked, locked, displayCleared, progressCleared, statusKey };
    memo.set(node.id, result);
    return result;
  }

  function refreshNodeStates() {
    const cleared = new Set(getClearedLevels?.() ?? []);
    const memo = new Map();
    const visiting = new Set();
    state.nodes.forEach(node => {
      const status = evaluateNodeStatus(node, memo, visiting, cleared);
      node.status = status;
    });
    state.nodeStatus = memo;
    updateBlockStyles();
  }

  function attachNodes() {
    const nodes = STAGE_GRAPH.nodes.map(node => {
      const blueprint = blueprintNodeMap.get(node.id);
      const title = node.level
        ? (getLevelTitle?.(node.level) ?? node.label)
        : node.label;
      return {
        ...node,
        block: blueprint?.block || null,
        title,
        chapterName: getTypeLabel(node.type)
      };
    });
    state.nodes = nodes;
    state.nodeLookup = new Map(nodes.map(node => [node.id, node]));
    state.dependencies = new Map();
    nodes.forEach(node => state.dependencies.set(node.id, []));
    STAGE_GRAPH.edges.forEach(edge => {
      const deps = state.dependencies.get(edge.to);
      if (deps) deps.push(edge.from);
    });
    refreshNodeStates();
  }

  function updatePanelState(panel, isOpen, backdrop) {
    if (!panel) return;
    panel.classList.toggle('stage-panel--open', isOpen);
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (backdrop) {
      backdrop.hidden = !isOpen;
    }
  }

  function closeOpenPanel() {
    if (!state.openPanel) return;
    updatePanelState(state.openPanel, false, panelBackdrop);
    panelButtonByPanel.get(state.openPanel)?.setAttribute('aria-expanded', 'false');
    state.openPanel = null;
    showStageMapScreen();
  }

  function setupPanels() {
    panels.forEach(panel => {
      panel.setAttribute('aria-hidden', 'true');
      const closeBtn = panel.querySelector('[data-panel-close]');
      closeBtn?.addEventListener('click', () => closeOpenPanel());
    });

    panelButtons.forEach(btn => {
      const targetSelector = btn.getAttribute('data-panel-target');
      const targetPanel = document.querySelector(targetSelector);
      if (!targetPanel) return;
      panelButtonByPanel.set(targetPanel, btn);
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        const isOpen = state.openPanel === targetPanel;
        closeOpenPanel();
        if (!isOpen) {
          state.openPanel = targetPanel;
          updatePanelState(targetPanel, true, panelBackdrop);
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    panelBackdrop?.addEventListener('click', closeOpenPanel);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeOpenPanel();
      }
    });
  }

  function markModeNodeCleared(nodeId) {
    if (state.specialClears.has(nodeId)) return;
    state.specialClears.add(nodeId);
    saveSpecialNodeClears(state.specialClears);
    refreshNodeStates();
    document.dispatchEvent(new CustomEvent('stageMap:progressUpdated'));
  }

  function handleModeShortcut(node) {
    if (node.mode === 'lab') {
      openLabModeFromShortcut?.();
      markModeNodeCleared(node.id);
      return;
    }
    if (node.mode === 'userProblems') {
      openUserProblemsFromShortcut?.();
      markModeNodeCleared(node.id);
    }
  }

  async function launchStage(node) {
    if (!node || !node.level || typeof startLevel !== 'function') {
      return;
    }
    if (node.status?.locked) {
      return;
    }
    lockOrientationLandscape?.();
    returnToEditScreen?.();
    closeOpenPanel();
    try {
      await startLevel(node.level);
      hideStageMapScreen();
      showGameScreen();
      document.body.classList.add('game-active');
    } catch (err) {
      console.error(err);
    }
  }

  function triggerLockedFeedback(nodeId) {
    state.lockedFeedbackId = nodeId;
    window.clearTimeout(state.lockedFeedbackTimeout);
    state.lockedFeedbackTimeout = window.setTimeout(() => {
      state.lockedFeedbackId = null;
      updateBlockStyles();
    }, 450);
    updateBlockStyles();
  }

  function handleNodeActivation(node) {
    if (!node) return;
    if (node.type === 'mode') {
      if (node.status?.unlocked) {
        handleModeShortcut(node);
      } else {
        triggerLockedFeedback(node.id);
      }
      return;
    }
    if (!node.level) {
      return;
    }
    if (node.status?.locked) {
      triggerLockedFeedback(node.id);
      return;
    }
    launchStage(node);
  }

  function handleZoom(delta, pivot) {
    const current = camera.getScale?.() ?? 1;
    const next = current * (delta > 0 ? 1.15 : 0.87);
    if (pivot) {
      camera.setScale(next, pivot.x, pivot.y);
    } else {
      camera.setScale(next);
    }
    updateZoomLabel();
    drawScene();
  }

  function resetView() {
    fitCameraToWorld();
  }

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => handleZoom(1));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => handleZoom(-1));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

  overlayCanvas.addEventListener('pointerdown', handlePointerDown);
  overlayCanvas.addEventListener('pointermove', handlePointerMove);
  overlayCanvas.addEventListener('pointerup', handlePointerUp);
  overlayCanvas.addEventListener('pointercancel', resetPointerState);
  overlayCanvas.addEventListener('pointerleave', () => setHoverNode(null));
  overlayCanvas.addEventListener('wheel', handleWheel, { passive: false });

  window.addEventListener('resize', () => resizeViewport(false));

  camera.setOnChange(() => {
    updateZoomLabel();
    drawScene();
  });

  attachNodes();
  setupPanels();
  resizeViewport(true);
  updateZoomLabel();
  drawScene();
  animationLoop(performance.now());

  document.addEventListener('stageMap:progressUpdated', refreshNodeStates);
  document.addEventListener('stageMap:closePanels', closeOpenPanel);
  showStageMapScreen();

  return {
    refresh: () => {
      attachNodes();
    }
  };
}
