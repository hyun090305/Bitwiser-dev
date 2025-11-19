import {
  lockOrientationLandscape,
  hideStageMapScreen,
  showGameScreen,
  showStageMapScreen,
  openUserProblemsFromShortcut
} from './navigation.js';
import { openLabModeFromShortcut } from './labMode.js';
import { STAGE_GRAPH, STAGE_TYPE_META } from './stageMapLayout.js';
import { createCamera } from '../canvas/camera.js';
import { drawGrid, drawWire, setupCanvas } from '../canvas/renderer.js';
import { CELL, GAP } from '../canvas/model.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

const SPECIAL_NODE_KEY = 'stageMapSpecialClears';
const PITCH = CELL + GAP;
const DEFAULT_CAMERA_SCALE = 0.75;
const GRID_MARGIN_CELLS = 12;
const STAGE_SPAN = STAGE_GRAPH.cellSpan ?? 3;
const STAGE_WORLD_SIZE = STAGE_SPAN * PITCH - GAP;
const GRID_STYLE = {
  unbounded: true,
  background: 'rgba(2, 6, 23, 0.95)',
  gridFillA: 'rgba(15, 23, 42, 0.9)',
  gridFillB: 'rgba(11, 16, 34, 0.9)',
  gridStroke: 'rgba(148, 163, 184, 0.35)',
  gridLineWidth: 1.1,
  panelShadow: null,
  borderColor: null
};
const INACTIVE_WIRE_STYLE = {
  color: 'rgba(148, 163, 184, 0.5)',
  width: 2.4,
  dashPattern: [],
  nodeFill: 'rgba(15, 23, 42, 0.85)',
  nodeShadow: { color: 'rgba(15, 23, 42, 0.4)', blur: 6, offsetY: 2 }
};
const ACTIVE_WIRE_STYLE = {
  color: '#fbbf24',
  width: 3,
  dashPattern: [],
  nodeFill: '#fde68a',
  nodeShadow: { color: 'rgba(251, 191, 36, 0.65)', blur: 12, offsetY: 4 }
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

function gridToWorld(r, c) {
  return {
    x: GAP + c * PITCH,
    y: GAP + r * PITCH
  };
}

function getAnchorCell(node, anchor = 'E') {
  if (!node?.gridPosition) return null;
  const { r, c } = node.gridPosition;
  const center = Math.floor(STAGE_SPAN / 2);
  switch (anchor) {
    case 'N':
      return { r: r - 1, c: c + center };
    case 'S':
      return { r: r + STAGE_SPAN, c: c + center };
    case 'W':
      return { r: r + center, c: c - 1 };
    case 'E':
      return { r: r + center, c: c + STAGE_SPAN };
    default:
      return null;
  }
}

function expandPathPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const expanded = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    const current = { r: point.r, c: point.c };
    if (i === 0) {
      expanded.push(current);
      continue;
    }
    const prev = expanded[expanded.length - 1];
    if (prev.r !== current.r && prev.c !== current.c) {
      console.warn('Stage map connection requires axis-aligned points', prev, current);
      return expanded;
    }
    if (prev.r === current.r) {
      const step = current.c >= prev.c ? 1 : -1;
      for (let col = prev.c + step; col !== current.c + step; col += step) {
        expanded.push({ r: current.r, c: col });
      }
    } else {
      const step = current.r >= prev.r ? 1 : -1;
      for (let row = prev.r + step; row !== current.r + step; row += step) {
        expanded.push({ r: row, c: current.c });
      }
    }
  }
  return expanded;
}

function buildMapGeometry({ getLevelTitle } = {}) {
  const nodes = STAGE_GRAPH.nodes.map(node => ({
    ...node,
    gridPosition: { ...node.gridPosition },
    chapterName: getTypeLabel(node.type),
    title: node.level ? (getLevelTitle?.(node.level) ?? node.label) : node.label
  }));
  const lookup = new Map(nodes.map(node => [node.id, node]));
  let maxRow = 0;
  let maxCol = 0;
  nodes.forEach(node => {
    maxRow = Math.max(maxRow, node.gridPosition.r + STAGE_SPAN);
    maxCol = Math.max(maxCol, node.gridPosition.c + STAGE_SPAN);
  });
  const rawConnections = STAGE_GRAPH.connections ?? STAGE_GRAPH.edges ?? [];
  const connections = rawConnections.map(conn => {
    const fromNode = lookup.get(conn.from);
    const toNode = lookup.get(conn.to);
    if (!fromNode || !toNode) return null;
    const start = getAnchorCell(fromNode, conn.startAnchor);
    const end = getAnchorCell(toNode, conn.endAnchor);
    if (!start || !end) return null;
    const controls = Array.isArray(conn.path) ? conn.path.map(pt => ({ r: pt.r, c: pt.c })) : [];
    const path = expandPathPoints([start, ...controls, end]);
    path.forEach(pt => {
      if (Number.isFinite(pt?.r)) maxRow = Math.max(maxRow, pt.r);
      if (Number.isFinite(pt?.c)) maxCol = Math.max(maxCol, pt.c);
    });
    return {
      id: `${conn.from}->${conn.to}`,
      from: conn.from,
      to: conn.to,
      path,
      active: false
    };
  }).filter(Boolean);
  const gridRows = maxRow + STAGE_SPAN + GRID_MARGIN_CELLS;
  const gridCols = maxCol + STAGE_SPAN + GRID_MARGIN_CELLS;
  const worldWidth = GAP + gridCols * PITCH;
  const worldHeight = GAP + gridRows * PITCH;
  return { nodes, lookup, connections, gridRows, gridCols, worldWidth, worldHeight };
}

function createNodeElement(node) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `stage-node ${STAGE_TYPE_META[node.type]?.className ?? ''}`;
  button.dataset.nodeId = node.id;
  if (node.level) {
    button.dataset.stage = String(node.level);
  }
  button.setAttribute('aria-label', node.title || node.label);
  const chip = document.createElement('span');
  chip.className = 'stage-node__chip';
  chip.innerHTML = `
    <span class="stage-node__icon">${node.icon ?? STAGE_TYPE_META[node.type]?.icon ?? ''}</span>
    <span class="stage-node__text">
      <span class="stage-node__chapter">${node.chapterName ?? ''}</span>
      <span class="stage-node__title">${node.title ?? ''}</span>
    </span>
  `;
  const status = document.createElement('span');
  status.className = 'stage-node__status';
  button.appendChild(chip);
  button.appendChild(status);
  return button;
}

function updatePanelState(panel, isOpen, backdrop) {
  if (!panel) return;
  panel.classList.toggle('stage-panel--open', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (backdrop) {
    backdrop.hidden = !isOpen;
  }
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
  const nodesLayer = document.getElementById('stageMapNodes');
  const canvas = document.getElementById('stageMapCanvas');
  const zoomInBtn = document.getElementById('stageMapZoomIn');
  const zoomOutBtn = document.getElementById('stageMapZoomOut');
  const zoomResetBtn = document.getElementById('stageMapZoomReset');
  const surface = document.getElementById('stageMapSurface');
  const panels = Array.from(document.querySelectorAll('.stage-panel'));
  const panelButtons = document.querySelectorAll('[data-panel-target]');
  const panelButtonByPanel = new Map();
  const panelBackdrop = document.getElementById('stagePanelBackdrop');

  if (!screenEl || !viewport || !nodesLayer || !canvas) {
    return null;
  }

  const state = {
    nodes: [],
    nodeLookup: new Map(),
    dependencies: new Map(),
    nodeStatus: new Map(),
    elements: new Map(),
    wires: [],
    scaleReadout: zoomResetBtn,
    specialClears: loadSpecialNodeClears(),
    camera: null,
    ctx: null,
    canvas,
    viewport,
    pointerStart: null,
    gridRows: 0,
    gridCols: 0,
    worldWidth: 0,
    worldHeight: 0,
    renderPending: false,
    hasCentered: false,
    resizeHandler: null,
    openPanel: null
  };

  function scheduleRender() {
    if (state.renderPending) return;
    state.renderPending = true;
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : cb => setTimeout(cb, 16);
    raf(() => {
      state.renderPending = false;
      renderMap();
    });
  }

  function renderMap() {
    if (!state.ctx || !state.camera) return;
    drawGrid(state.ctx, state.gridRows, state.gridCols, 0, state.camera, GRID_STYLE);
    state.wires.forEach(wire => {
      drawWire(state.ctx, wire, 0, 0, state.camera, wire.active ? ACTIVE_WIRE_STYLE : INACTIVE_WIRE_STYLE);
    });
  }

  function updateNodePositions() {
    if (!state.camera) return;
    const scale = state.camera.getScale();
    state.nodes.forEach(node => {
      const el = state.elements.get(node.id);
      if (!el) return;
      const topLeft = gridToWorld(node.gridPosition.r, node.gridPosition.c);
      const screenPoint = state.camera.worldToScreen(topLeft.x, topLeft.y);
      const size = STAGE_WORLD_SIZE * scale;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.transform = `translate(${screenPoint.x}px, ${screenPoint.y}px)`;
      el.style.setProperty('--stage-node-font-size', `${Math.max(12, 14 * scale)}px`);
      el.style.setProperty('--stage-node-status-size', `${Math.max(10, 11 * scale)}px`);
    });
  }

  function updateZoomDisplay() {
    if (!state.scaleReadout || !state.camera) return;
    const scale = state.camera.getScale();
    state.scaleReadout.textContent = `${scale.toFixed(2)}×`;
  }

  function handleCameraChange() {
    updateNodePositions();
    updateZoomDisplay();
    scheduleRender();
  }

  function resizeCanvas() {
    if (!state.viewport || !state.canvas) return;
    const rect = state.viewport.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    state.ctx = setupCanvas(state.canvas, rect.width, rect.height);
    if (state.camera) {
      state.camera.setViewport(rect.width, rect.height, { gridWidth: rect.width, gridHeight: rect.height });
    }
    updateNodePositions();
    scheduleRender();
  }

  function centerCamera(force = false) {
    if (!state.camera) return;
    if (state.hasCentered && !force) return;
    const camState = state.camera.getState();
    const effectiveWidth = Math.max(0, (camState.viewportWidth ?? 0) - (camState.panelWidth ?? 0));
    const effectiveHeight = Math.max(0, camState.viewportHeight ?? 0);
    if (effectiveWidth === 0 || effectiveHeight === 0 || !Number.isFinite(camState.scale) || camState.scale <= 0) {
      return;
    }
    const visibleWidth = effectiveWidth / camState.scale;
    const visibleHeight = effectiveHeight / camState.scale;
    const targetX = Math.max(0, (state.worldWidth - visibleWidth) / 2);
    const targetY = Math.max(0, (state.worldHeight - visibleHeight) / 2);
    const dx = (camState.originX - targetX) * camState.scale;
    const dy = (camState.originY - targetY) * camState.scale;
    state.camera.pan(dx, dy);
    state.hasCentered = true;
  }

  function adjustZoom(factor, pivotX, pivotY) {
    if (!state.camera || !Number.isFinite(factor)) return;
    const current = state.camera.getScale();
    const next = Math.max(0.45, Math.min(2.4, current * factor));
    const pivot = state.viewport.getBoundingClientRect();
    const px = pivotX ?? pivot.width / 2;
    const py = pivotY ?? pivot.height / 2;
    state.camera.setScale(next, px, py);
  }

  function resetView() {
    if (!state.camera) return;
    state.hasCentered = false;
    state.camera.reset();
    centerCamera(true);
    updateZoomDisplay();
    scheduleRender();
  }

  function updateConnections() {
    state.wires.forEach(wire => {
      const status = state.nodeStatus.get(wire.from);
      wire.active = Boolean(status?.progressCleared);
    });
    scheduleRender();
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
      displayCleared = clearedLevels.has(node.level);
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
      const el = state.elements.get(node.id);
      if (el && status) {
        el.classList.toggle('stage-node--locked', status.locked);
        el.classList.toggle('stage-node--cleared', status.displayCleared);
        el.classList.toggle('stage-node--preview', Boolean(node.comingSoon));
        const statusEl = el.querySelector('.stage-node__status');
        if (statusEl) {
          const text = translate(status.statusKey);
          statusEl.textContent = typeof text === 'string' ? text : '';
        }
      }
    });
    state.nodeStatus = memo;
    updateConnections();
  }

  function attachNodes() {
    const geometry = buildMapGeometry({ getLevelTitle });
    state.nodes = geometry.nodes;
    state.nodeLookup = geometry.lookup;
    state.dependencies = new Map();
    state.nodes.forEach(node => {
      state.dependencies.set(node.id, []);
    });
    geometry.connections.forEach(conn => {
      const deps = state.dependencies.get(conn.to);
      if (deps) deps.push(conn.from);
    });
    state.wires = geometry.connections;
    state.gridRows = geometry.gridRows;
    state.gridCols = geometry.gridCols;
    state.worldWidth = geometry.worldWidth;
    state.worldHeight = geometry.worldHeight;

    nodesLayer.innerHTML = '';
    state.elements.clear();
    state.nodes.forEach(node => {
      const el = createNodeElement(node);
      el.addEventListener('click', () => handleNodeActivation(node));
      nodesLayer.appendChild(el);
      state.elements.set(node.id, el);
    });

    if (!state.camera) {
      state.camera = createCamera({ panelWidth: 0, scale: DEFAULT_CAMERA_SCALE });
      state.camera.setOnChange(handleCameraChange);
    }
    state.camera.setBounds(state.worldWidth, state.worldHeight, { clamp: true });
    state.hasCentered = false;
    resizeCanvas();
    centerCamera(true);
    refreshNodeStates();
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

  function handleNodeActivation(node) {
    if (!node) return;
    if (node.type === 'mode') {
      if (node.status?.unlocked) {
        handleModeShortcut(node);
      }
      return;
    }
    if (!node.level) {
      return;
    }
    if (node.status?.locked) {
      const el = state.elements.get(node.id);
      if (el) {
        el.classList.add('stage-node--locked-feedback');
        window.setTimeout(() => el.classList.remove('stage-node--locked-feedback'), 400);
      }
      return;
    }
    launchStage(node);
  }

  function closeOpenPanel() {
    if (!state.openPanel) return;
    updatePanelState(state.openPanel, false, panelBackdrop);
    panelButtonByPanel.get(state.openPanel)?.setAttribute('aria-expanded', 'false');
    state.openPanel = null;
    showStageMapScreen();
  }

  function attachPanHandlers() {
    if (!surface) return;
    surface.addEventListener('pointerdown', event => {
      if (event.target.closest('.stage-panel') || event.target.closest('.hud-button') || event.target.closest('.stage-node')) {
        return;
      }
      surface.setPointerCapture(event.pointerId);
      state.pointerStart = { x: event.clientX, y: event.clientY };
    });

    surface.addEventListener('pointermove', event => {
      if (!state.pointerStart || !state.camera) return;
      const dx = event.clientX - state.pointerStart.x;
      const dy = event.clientY - state.pointerStart.y;
      if (dx === 0 && dy === 0) return;
      state.camera.pan(dx, dy);
      state.pointerStart = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    }, { passive: false });

    const releasePointer = () => {
      state.pointerStart = null;
    };
    surface.addEventListener('pointerup', releasePointer);
    surface.addEventListener('pointercancel', releasePointer);

    surface.addEventListener('wheel', event => {
      if (!state.camera) return;
      if (!event.ctrlKey) {
        event.preventDefault();
        const rect = state.viewport.getBoundingClientRect();
        const pivotX = event.clientX - rect.left;
        const pivotY = event.clientY - rect.top;
        const factor = event.deltaY < 0 ? 1.1 : 0.9;
        adjustZoom(factor, pivotX, pivotY);
      }
    }, { passive: false });
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

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => adjustZoom(1.15));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => adjustZoom(0.87));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

  attachNodes();
  attachPanHandlers();
  setupPanels();

  const handleResize = () => {
    resizeCanvas();
    centerCamera();
  };
  state.resizeHandler = handleResize;
  window.addEventListener('resize', state.resizeHandler);

  document.addEventListener('stageMap:progressUpdated', refreshNodeStates);
  document.addEventListener('stageMap:closePanels', closeOpenPanel);
  showStageMapScreen();

  return {
    refresh: () => {
      attachNodes();
    }
  };
}
