import {
  lockOrientationLandscape,
  hideStageMapScreen,
  showGameScreen,
  showStageMapScreen,
  openUserProblemsFromShortcut
} from './navigation.js';
import { openLabModeFromShortcut } from './labMode.js';
import { STAGE_GRAPH, STAGE_TYPE_META } from './stageMapLayout.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

const SPECIAL_NODE_KEY = 'stageMapSpecialClears';

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

function createNodeElement(node) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `stage-node ${STAGE_TYPE_META[node.type]?.className ?? ''}`;
  button.dataset.nodeId = node.id;
  if (node.level) {
    button.dataset.stage = String(node.level);
  }
  button.style.left = `${node.x}px`;
  button.style.top = `${node.y}px`;
  const icon = document.createElement('span');
  icon.className = 'stage-node__icon';
  icon.textContent = node.icon ?? STAGE_TYPE_META[node.type]?.icon ?? '';
  const body = document.createElement('span');
  body.className = 'stage-node__body';
  body.innerHTML = `
    <span class="stage-node__chapter">${node.chapterName}</span>
    <span class="stage-node__title">${node.title}</span>
    <span class="stage-node__status"></span>
  `;
  button.appendChild(icon);
  button.appendChild(body);
  button.setAttribute('aria-label', `${node.title}`);
  return button;
}

function buildMapNodes({ getLevelTitle } = {}) {
  const nodes = STAGE_GRAPH.nodes.map(node => {
    const [x, y] = node.position;
    const title = node.level
      ? (getLevelTitle?.(node.level) ?? node.label)
      : node.label;
    return {
      ...node,
      x,
      y,
      title,
      chapterName: getTypeLabel(node.type)
    };
  });
  const width = Math.max(1400, Math.max(...nodes.map(node => node.x)) + 200);
  const height = Math.max(900, Math.max(...nodes.map(node => node.y)) + 200);
  return { nodes, mapSize: { width, height }, edges: [...STAGE_GRAPH.edges] };
}

function updatePanelState(panel, isOpen, backdrop) {
  if (!panel) return;
  panel.classList.toggle('stage-panel--open', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (backdrop) {
    backdrop.hidden = !isOpen;
  }
}

function createConnectionPath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const bend = Math.min(160, Math.hypot(dx, dy) * 0.35);
  const controlY = dy >= 0 ? midY - bend : midY + bend;
  const controlX = midX + Math.sign(dx || 1) * Math.min(60, Math.abs(dy) * 0.25);
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
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
  const connectionsSvg = document.getElementById('stageMapConnections');
  const zoomInBtn = document.getElementById('stageMapZoomIn');
  const zoomOutBtn = document.getElementById('stageMapZoomOut');
  const zoomResetBtn = document.getElementById('stageMapZoomReset');
  const surface = document.getElementById('stageMapSurface');
  const panels = Array.from(document.querySelectorAll('.stage-panel'));
  const panelButtons = document.querySelectorAll('[data-panel-target]');
  const panelButtonByPanel = new Map();
  const panelBackdrop = document.getElementById('stagePanelBackdrop');

  if (!screenEl || !viewport || !nodesLayer || !connectionsSvg) {
    return null;
  }

  const state = {
    nodes: [],
    nodeLookup: new Map(),
    elements: new Map(),
    edges: [],
    dependencies: new Map(),
    nodeStatus: new Map(),
    scale: 1,
    translateX: 0,
    translateY: 0,
    openPanel: null,
    pointerStart: null,
    specialClears: loadSpecialNodeClears()
  };

  function updateConnections() {
    state.edges.forEach(edge => {
      const status = state.nodeStatus.get(edge.from);
      const active = Boolean(status?.progressCleared);
      edge.element.classList.toggle('stage-connection--active', active);
    });
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
    const { nodes, mapSize, edges } = buildMapNodes({ getLevelTitle });
    state.nodes = nodes;
    state.nodeLookup = new Map(nodes.map(node => [node.id, node]));
    state.dependencies = new Map();
    nodes.forEach(node => {
      state.dependencies.set(node.id, []);
    });
    edges.forEach(edge => {
      const deps = state.dependencies.get(edge.to);
      if (deps) deps.push(edge.from);
    });
    viewport.style.setProperty('--map-width', `${mapSize.width}px`);
    viewport.style.setProperty('--map-height', `${mapSize.height}px`);
    nodesLayer.innerHTML = '';
    connectionsSvg.innerHTML = '';
    connectionsSvg.setAttribute('viewBox', `0 0 ${mapSize.width} ${mapSize.height}`);
    connectionsSvg.setAttribute('width', mapSize.width);
    connectionsSvg.setAttribute('height', mapSize.height);
    state.elements.clear();
    state.edges = [];

    edges.forEach(edge => {
      const from = state.nodeLookup.get(edge.from);
      const to = state.nodeLookup.get(edge.to);
      if (!from || !to) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', createConnectionPath(from, to));
      path.classList.add('stage-connection');
      path.dataset.from = edge.from;
      path.dataset.to = edge.to;
      connectionsSvg.appendChild(path);
      state.edges.push({ ...edge, element: path });
    });

    nodes.forEach(node => {
      const el = createNodeElement(node);
      el.addEventListener('click', () => {
        handleNodeActivation(node);
      });
      nodesLayer.appendChild(el);
      state.elements.set(node.id, el);
    });

    refreshNodeStates();
  }

  function updateViewport() {
    viewport.style.setProperty('--map-scale', String(state.scale));
    viewport.style.setProperty('--map-translate-x', `${state.translateX}px`);
    viewport.style.setProperty('--map-translate-y', `${state.translateY}px`);
  }

  function handleZoom(delta) {
    state.scale = Math.max(0.6, Math.min(1.6, state.scale + delta));
    updateViewport();
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${state.scale.toFixed(1)}×`;
    }
  }

  function resetView() {
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    updateViewport();
    if (zoomResetBtn) {
      zoomResetBtn.textContent = '1×';
    }
  }

  function attachPanHandlers() {
    if (!surface) return;

    surface.addEventListener('pointerdown', event => {
      if (event.target.closest('.stage-panel') || event.target.closest('.hud-button') || event.target.closest('.stage-node')) {
        return;
      }
      surface.setPointerCapture(event.pointerId);
      state.pointerStart = {
        x: event.clientX - state.translateX,
        y: event.clientY - state.translateY
      };
    });

    surface.addEventListener('pointermove', event => {
      if (!state.pointerStart) return;
      state.translateX = event.clientX - state.pointerStart.x;
      state.translateY = event.clientY - state.pointerStart.y;
      updateViewport();
    });

    surface.addEventListener('pointerup', () => {
      state.pointerStart = null;
    });

    surface.addEventListener('wheel', event => {
      if (!event.ctrlKey) {
        event.preventDefault();
        handleZoom(event.deltaY > 0 ? -0.05 : 0.05);
      }
    }, { passive: false });
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

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => handleZoom(0.1));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => handleZoom(-0.1));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

  attachNodes();
  attachPanHandlers();
  setupPanels();

  document.addEventListener('stageMap:progressUpdated', refreshNodeStates);
  document.addEventListener('stageMap:closePanels', closeOpenPanel);
  showStageMapScreen();

  return {
    refresh: () => {
      attachNodes();
    }
  };
}
