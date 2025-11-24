import {
  lockOrientationLandscape,
  hideStageMapScreen,
  showGameScreen,
  showStageMapScreen,
  openUserProblemsFromShortcut
} from './navigation.js';
import { openLabModeFromShortcut } from './labMode.js';
import { createCamera } from '../canvas/camera.js';
import { drawGrid, setupCanvas } from '../canvas/renderer.js';
import { CELL } from '../canvas/model.js';
import {
  STAGE_NODE_LEVEL_MAP,
  STAGE_TYPE_META,
  gridSizeToWorldSize,
  gridToWorldPoint
} from './stageMapLayout.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

const SPECIAL_NODE_KEY = 'stageMapSpecialClears';
const STAGE_MAP_SPEC_PATH = 'stage_map.json';

const NODE_STYLE = {
  stage: {
    fill: '#0ea5e9',
    stroke: '#7dd3fc',
    text: '#e2e8f0'
  },
  rank: {
    fill: '#f59e0b',
    stroke: '#fbbf24',
    text: '#0f172a'
  },
  feature: {
    fill: '#a855f7',
    stroke: '#c084fc',
    text: '#f8fafc'
  },
  mode: {
    fill: '#22c55e',
    stroke: '#4ade80',
    text: '#0f172a'
  },
  locked: {
    fill: 'rgba(148, 163, 184, 0.28)',
    stroke: 'rgba(148, 163, 184, 0.5)',
    text: '#e2e8f0'
  },
  comingSoon: {
    fill: 'rgba(59, 130, 246, 0.18)',
    stroke: 'rgba(59, 130, 246, 0.4)',
    text: '#bfdbfe'
  }
};

let stageMapSpecPromise = null;

function loadStageMapSpec() {
  if (!stageMapSpecPromise) {
    stageMapSpecPromise = fetch(STAGE_MAP_SPEC_PATH).then(resp => resp.json());
  }
  return stageMapSpecPromise;
}

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

function gridPointToWorldCenter(point) {
  const base = gridToWorldPoint(point);
  return {
    x: base.x + CELL / 2,
    y: base.y + CELL / 2
  };
}

function rectCenter(rect) {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2
  };
}

function calculateBounds(nodes) {
  if (!nodes.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return nodes.reduce((acc, node) => ({
    minX: Math.min(acc.minX, node.rect.x),
    minY: Math.min(acc.minY, node.rect.y),
    maxX: Math.max(acc.maxX, node.rect.x + node.rect.w),
    maxY: Math.max(acc.maxY, node.rect.y + node.rect.h)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });
}

function buildNode(node, nodeTypes, getLevelTitle) {
  const defaultSize = nodeTypes[node.nodeType]?.defaultSize || {};
  const size = {
    w: node.size?.w ?? defaultSize.w ?? 1,
    h: node.size?.h ?? defaultSize.h ?? 1
  };
  const rectOrigin = gridToWorldPoint(node.position);
  const rectSize = gridSizeToWorldSize(size);
  const rect = { x: rectOrigin.x, y: rectOrigin.y, w: rectSize.width, h: rectSize.height };
  const level = STAGE_NODE_LEVEL_MAP[node.id] ?? null;
  const title = level ? (getLevelTitle?.(level) ?? node.label) : node.label;
  const comingSoon = node.nodeType === 'stage' && level == null;
  return {
    ...node,
    level,
    size,
    rect,
    center: rectCenter(rect),
    title,
    chapterName: getTypeLabel(node.nodeType),
    comingSoon
  };
}

function buildGraph(spec, { getLevelTitle } = {}) {
  const nodeTypes = spec?.nodeTypes || {};
  const nodes = (spec?.nodes || []).map(node => buildNode(node, nodeTypes, getLevelTitle));
  const nodeLookup = new Map(nodes.map(n => [n.id, n]));
  const dependencies = new Map();
  nodes.forEach(n => dependencies.set(n.id, []));

  const edges = (spec?.edges || []).map(edge => {
    const from = nodeLookup.get(edge.from);
    const to = nodeLookup.get(edge.to);
    if (!from || !to) return null;
    const waypoints = Array.isArray(edge.waypoints)
      ? edge.waypoints.map(pt => gridPointToWorldCenter(pt))
      : [];
    const points = [from.center, ...waypoints, to.center];
    const deps = dependencies.get(edge.to);
    if (deps) deps.push(edge.from);
    return {
      ...edge,
      points
    };
  }).filter(Boolean);

  const bounds = calculateBounds(nodes);
  return { nodes, edges, nodeLookup, dependencies, bounds };
}

function updatePanelState(panel, isOpen, backdrop) {
  if (!panel) return;
  panel.classList.toggle('stage-panel--open', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (backdrop) {
    backdrop.hidden = !isOpen;
  }
}

function drawEdge(ctx, camera, edge, active, t = 0) {
  if (!edge?.points?.length) return;
  // Only render edges when the source node is cleared/active.
  if (!active) return;

  ctx.save();
  ctx.beginPath();
  // Build the path in screen space so dash lengths are consistent visually.
  const screenPoints = edge.points.map(pt => camera.worldToScreen(pt.x, pt.y));
  screenPoints.forEach((screen, idx) => {
    if (idx === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });

  // Glow stroke behind the main wire
  ctx.lineWidth = Math.max(3, 4 * camera.getScale());
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(246, 203, 77, 0.18)';
  ctx.shadowColor = 'rgba(246, 203, 77, 0.35)';
  ctx.shadowBlur = 12;
  ctx.globalAlpha = 1;
  ctx.stroke();

  // Main animated dashed wire
  ctx.beginPath();
  screenPoints.forEach((screen, idx) => {
    if (idx === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });

  const baseDash = 18 * Math.max(1, camera.getScale());
  try {
    ctx.setLineDash([baseDash, baseDash]);
  } catch (e) {
    // setLineDash may throw in some older contexts; ignore gracefully
  }
  // Flow speed and offset use the RAF timestamp `t`. Negative offset makes
  // the apparent motion go from the first point (from) toward the last (to).
  ctx.lineDashOffset = -((t || 0) * 0.06) % (baseDash * 2);

  // Gradient along the first segment direction for a better wire look.
  const p0 = screenPoints[0];
  const p1 = screenPoints[screenPoints.length - 1];
  const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
  grad.addColorStop(0, '#fbbf24');
  grad.addColorStop(0.5, '#fb923c');
  grad.addColorStop(1, '#f97316');

  ctx.lineWidth = Math.max(2, 3 * camera.getScale());
  ctx.strokeStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.stroke();

  // reset dash to normal for other draw ops
  try {
    ctx.setLineDash([]);
  } catch (e) {}

  ctx.restore();
}

function drawNode(ctx, camera, node, status) {
  const { scale } = camera.getState();
  const topLeft = camera.worldToScreen(node.rect.x, node.rect.y);
  const width = node.rect.w * scale;
  const height = node.rect.h * scale;
  const radius = Math.min(12 * scale, Math.min(width, height) / 4);

  const baseStyle = status.locked
    ? NODE_STYLE.locked
    : node.comingSoon
      ? NODE_STYLE.comingSoon
      : NODE_STYLE[node.nodeType] || NODE_STYLE.stage;
  const borderColor = status.progressCleared ? (STAGE_TYPE_META[node.nodeType]?.accent || baseStyle.stroke) : baseStyle.stroke;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(topLeft.x + radius, topLeft.y);
  ctx.lineTo(topLeft.x + width - radius, topLeft.y);
  ctx.quadraticCurveTo(topLeft.x + width, topLeft.y, topLeft.x + width, topLeft.y + radius);
  ctx.lineTo(topLeft.x + width, topLeft.y + height - radius);
  ctx.quadraticCurveTo(topLeft.x + width, topLeft.y + height, topLeft.x + width - radius, topLeft.y + height);
  ctx.lineTo(topLeft.x + radius, topLeft.y + height);
  ctx.quadraticCurveTo(topLeft.x, topLeft.y + height, topLeft.x, topLeft.y + height - radius);
  ctx.lineTo(topLeft.x, topLeft.y + radius);
  ctx.quadraticCurveTo(topLeft.x, topLeft.y, topLeft.x + radius, topLeft.y);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, topLeft.y + height);
  gradient.addColorStop(0, baseStyle.fill);
  gradient.addColorStop(1, status.locked ? 'rgba(148, 163, 184, 0.35)' : baseStyle.stroke);
  ctx.fillStyle = gradient;
  ctx.shadowColor = status.progressCleared ? 'rgba(14, 165, 233, 0.5)' : 'rgba(15, 23, 42, 0.45)';
  ctx.shadowBlur = status.progressCleared ? 18 : 12;
  ctx.shadowOffsetY = 6;
  ctx.fill();

  ctx.lineWidth = Math.max(2, 2.4 * scale);
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.fillStyle = baseStyle.text;
  ctx.font = `700 ${Math.max(14, 16 * scale)}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const paddingX = 12 * scale;
  const paddingY = 10 * scale;
  let textX = topLeft.x + paddingX;
  let textY = topLeft.y + paddingY + (12 * scale);
  // Fit/truncate text so it doesn't overflow the node box
  const maxTextWidth = Math.max(8, width - paddingX * 2);
  function fitText(t) {
    if (!t) return '';
    if (ctx.measureText(t).width <= maxTextWidth) return t;
    // binary search trim
    let lo = 0, hi = t.length;
    let result = t;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const cand = t.slice(0, mid) + '…';
      if (ctx.measureText(cand).width <= maxTextWidth) {
        lo = mid;
        result = cand;
      } else {
        hi = mid - 1;
      }
    }
    if (ctx.measureText(result).width > maxTextWidth) {
      // fallback iterative trim
      let s = t;
      while (s.length && ctx.measureText(s + '…').width > maxTextWidth) s = s.slice(0, -1);
      result = s + (s.length < t.length ? '…' : '');
    }
    return result;
  }

  const titleText = fitText(node.title);
  ctx.fillText(titleText, textX, textY);

  ctx.font = `500 ${Math.max(11, 12 * scale)}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  textY += 18 * scale;
  ctx.fillStyle = status.locked ? 'rgba(241, 245, 249, 0.75)' : 'rgba(226, 232, 240, 0.95)';
  const chapterText = fitText(node.chapterName || '');
  ctx.fillText(chapterText, textX, textY);

  // Do not render the stage number (user requested)

  if (node.comingSoon) {
    ctx.font = `${600 * scale} ${Math.max(11, 12 * scale)}px 'Noto Sans KR', 'Inter', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
    ctx.fillText('Coming soon', topLeft.x + width - paddingX, topLeft.y + height - paddingY);
  } else if (status.locked) {
    ctx.font = `${600 * scale} ${Math.max(11, 12 * scale)}px 'Noto Sans KR', 'Inter', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.65)';
    ctx.fillText('Locked', topLeft.x + width - paddingX, topLeft.y + height - paddingY);
  }

  ctx.restore();
}

function isPointInsideNode(node, worldPoint) {
  if (!node?.rect) return false;
  return worldPoint.x >= node.rect.x && worldPoint.x <= node.rect.x + node.rect.w
    && worldPoint.y >= node.rect.y && worldPoint.y <= node.rect.y + node.rect.h;
}

export function initializeStageMap({
  getLevelTitle,
  isLevelUnlocked,
  getClearedLevels,
  startLevel,
  returnToEditScreen
} = {}) {
  const screenEl = document.getElementById('stageMapScreen');
  const canvas = document.getElementById('stageMapCanvas');
  const zoomInBtn = document.getElementById('stageMapZoomIn');
  const zoomOutBtn = document.getElementById('stageMapZoomOut');
  const zoomResetBtn = document.getElementById('stageMapZoomReset');
  const surface = document.getElementById('stageMapSurface');
  const panels = Array.from(document.querySelectorAll('.stage-panel'));
  const panelButtons = document.querySelectorAll('[data-panel-target]');
  const panelButtonByPanel = new Map();
  const panelBackdrop = document.getElementById('stagePanelBackdrop');

  if (!screenEl || !canvas || !surface) {
    return null;
  }

  const camera = createCamera({ scale: 1 });
  let ctx = canvas.getContext('2d');
  const state = {
    nodes: [],
    edges: [],
    nodeLookup: new Map(),
    dependencies: new Map(),
    nodeStatus: new Map(),
    openPanel: null,
    pointerStart: null,
    specialClears: loadSpecialNodeClears(),
    mapBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    hoverNode: null,
    dragging: false
  };

  // Only reinitialize the canvas when its CSS size or DPR changes.
  function ensureCanvasInitialized() {
    // Prefer the surface (parent container) size when available because
    // the canvas may be styled to fill its container rather than the
    // direct canvas bounding rect matching the viewport. Fall back to
    // parentElement, canvas rect, and finally the window viewport.
    const containerRect = (surface && typeof surface.getBoundingClientRect === 'function')
      ? surface.getBoundingClientRect()
      : (canvas.parentElement && typeof canvas.parentElement.getBoundingClientRect === 'function')
      ? canvas.parentElement.getBoundingClientRect()
      : canvas.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;
    const baseWidth = Math.max(1, Math.floor(containerRect.width || window.innerWidth || 1));
    const baseHeight = Math.max(1, Math.floor(containerRect.height || window.innerHeight || 1));

    // Compute expected internal pixel buffer size (CSS size × DPR).
    const expectedInternalWidth = Math.floor(baseWidth * dpr);
    const expectedInternalHeight = Math.floor(baseHeight * dpr);

    // Current internal buffer size on the canvas element.
    const currentInternalWidth = Number(canvas.width || 0);
    const currentInternalHeight = Number(canvas.height || 0);

    const prevDpr = Number.parseFloat(canvas.dataset?.dpr || '') || null;

    // Reinitialize when the actual internal buffer size or DPR doesn't
    // match the expected values derived from the container/viewport.
    if (
      currentInternalWidth !== expectedInternalWidth ||
      currentInternalHeight !== expectedInternalHeight ||
      prevDpr !== dpr
    ) {
      ctx = setupCanvas(canvas, Number(baseWidth), Number(baseHeight));
      // Use containerRect dimensions for camera viewport so the camera
      // aligns with the visible area the canvas is expected to fill.
      camera.setViewport(containerRect.width || window.innerWidth, containerRect.height || window.innerHeight);
    }
  }

  // Continuous render loop so wire animation flows smoothly.
  let _raf = null;
  let _lastVisible = true;
  function renderFrame(t) {
    if (!ctx) return;
    ensureCanvasInitialized();

    drawGrid(ctx, 1, 1, 0, camera, {
      unbounded: true,
      background: 'rgba(15, 23, 42, 0.92)',
      gridFillA: 'rgba(226, 232, 240, 0.035)',
      gridFillB: 'rgba(148, 163, 184, 0.05)',
      gridStroke: 'rgba(148, 163, 184, 0.35)'
    });

    state.edges.forEach(edge => {
      const fromStatus = state.nodeStatus.get(edge.from);
      // Only render wires when the source node is cleared
      const active = Boolean(fromStatus?.progressCleared);
      drawEdge(ctx, camera, edge, active, t);
    });

    state.nodes.forEach(node => {
      const status = state.nodeStatus.get(node.id) || { locked: false, progressCleared: false };
      drawNode(ctx, camera, node, status);
    });

    _raf = window.requestAnimationFrame(renderFrame);
  }

  function requestRender() {
    if (_raf == null) {
      _raf = window.requestAnimationFrame(renderFrame);
    }
  }

  function evaluateNodeStatus(node, memo, visiting, clearedLevels) {
    if (!node) return null;
    if (memo.has(node.id)) return memo.get(node.id);
    if (visiting.has(node.id)) return memo.get(node.id) || null;
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

    if (node.level) {
      const levelUnlocked = isLevelUnlocked?.(node.level) ?? true;
      unlocked = prerequisitesMet && levelUnlocked;
      locked = !unlocked;
      displayCleared = clearedLevels.has(node.level);
      progressCleared = displayCleared;
    } else if (node.nodeType === 'mode') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = state.specialClears.has(node.id);
      progressCleared = displayCleared;
    } else if (node.nodeType === 'rank') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = unlocked;
      progressCleared = unlocked;
    } else if (node.nodeType === 'feature') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = false;
      progressCleared = unlocked;
    } else if (node.comingSoon) {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = false;
      progressCleared = unlocked;
    }

    const result = { unlocked, locked, displayCleared, progressCleared };
    memo.set(node.id, result);
    return result;
  }

  function refreshNodeStates() {
    const cleared = new Set(getClearedLevels?.() ?? []);
    const memo = new Map();
    const visiting = new Set();
    state.nodes.forEach(node => {
      const status = evaluateNodeStatus(node, memo, visiting, cleared);
      state.nodeStatus.set(node.id, status || { locked: false, progressCleared: false });
    });
    requestRender();
  }

  function attachGraph(graph) {
    state.nodes = graph.nodes;
    state.edges = graph.edges;
    state.nodeLookup = graph.nodeLookup;
    state.dependencies = graph.dependencies;
    state.mapBounds = graph.bounds;
    refreshNodeStates();
    // Defer centering until the next animation frame so that the
    // canvas and layout have settled (prevents tiny bounding rects
    // when the stage map is being shown/animated). This avoids the
    // intermittent "minimized 2×2" appearance caused by centering
    // against an incorrect/too-small viewport.
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        try {
          ensureCanvasInitialized();
        } catch (e) {
          // ensureCanvasInitialized may rely on DOM APIs; swallow errors
          // here to avoid breaking initialization.
          console.warn('ensureCanvasInitialized failed during attachGraph RAF', e);
        }
        centerMap();
        requestRender();
      });
    } else {
      ensureCanvasInitialized();
      centerMap();
      requestRender();
    }
  }

  function centerMap() {
    const { minX, minY, maxX, maxY } = state.mapBounds;
    const rect = canvas.getBoundingClientRect();
    const { scale } = camera.getState();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const targetOriginX = Math.max(0, (minX + maxX) / 2 - (width / (2 * scale)));
    const targetOriginY = Math.max(0, (minY + maxY) / 2 - (height / (2 * scale)));
    const { originX, originY } = camera.getState();
    camera.pan(-(targetOriginX - originX) * scale, -(targetOriginY - originY) * scale);
    requestRender();
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${camera.getScale().toFixed(1)}×`;
    }
  }

  function handleZoom(delta, pivotX, pivotY) {
    const current = camera.getScale();
    const next = Math.max(0.6, Math.min(2.2, current + delta));
    camera.setScale(next, pivotX, pivotY);
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${camera.getScale().toFixed(1)}×`;
    }
    requestRender();
  }

  function resetView() {
    camera.reset();
    centerMap();
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${camera.getScale().toFixed(1)}×`;
    }
  }

  function handleModeShortcut(node) {
    if (node.id === 'lab') {
      openLabModeFromShortcut?.();
      markModeNodeCleared(node.id);
      return;
    }
    if (node.id === 'user_created_stages') {
      openUserProblemsFromShortcut?.();
      markModeNodeCleared(node.id);
    }
  }

  function handleFeatureShortcut(node) {
    if (!node) return;
    if (node.id === 'leaderboard') {
      const targetPanel = document.querySelector('#rankingPanel');
      if (targetPanel) {
        closeOpenPanel();
        state.openPanel = targetPanel;
        updatePanelState(targetPanel, true, panelBackdrop);
      }
      return;
    }
    if (node.id === 'credits' || node.id === 'story') {
      const msg = node.id === 'credits' ? 'Credits are coming soon.' : 'Story mode is coming soon.';
      window.alert?.(msg);
    }
  }

  function markModeNodeCleared(nodeId) {
    if (state.specialClears.has(nodeId)) return;
    state.specialClears.add(nodeId);
    saveSpecialNodeClears(state.specialClears);
    refreshNodeStates();
    document.dispatchEvent(new CustomEvent('stageMap:progressUpdated'));
  }

  async function launchStage(node) {
    if (!node || !node.level || typeof startLevel !== 'function') {
      return;
    }
    const status = state.nodeStatus.get(node.id);
    if (status?.locked) {
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
    const status = state.nodeStatus.get(node.id);
    if (status?.locked) return;
    if (node.nodeType === 'mode') {
      handleModeShortcut(node);
      return;
    }
    if (node.nodeType === 'feature') {
      handleFeatureShortcut(node);
      return;
    }
    if (!node.level) return;
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

  function handlePointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    state.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      world: camera.screenToWorld(event.clientX, event.clientY),
      moved: false
    };
    state.dragging = false;
  }

  function handlePointerMove(event) {
    if (!state.pointerStart) return;
    const dx = event.clientX - state.pointerStart.x;
    const dy = event.clientY - state.pointerStart.y;
    if (!state.dragging && Math.hypot(dx, dy) > 4) {
      state.dragging = true;
    }
    if (state.dragging) {
      camera.pan(dx, dy);
      state.pointerStart.x = event.clientX;
      state.pointerStart.y = event.clientY;
      requestRender();
    }
  }

  function handlePointerUp(event) {
    if (!state.pointerStart) return;
    const wasDragging = state.dragging;
    state.dragging = false;
    const start = state.pointerStart;
    state.pointerStart = null;
    canvas.releasePointerCapture?.(event.pointerId);

    if (!wasDragging) {
      const world = camera.screenToWorld(event.clientX, event.clientY);
      const clickedNode = state.nodes.find(node => isPointInsideNode(node, world));
      handleNodeActivation(clickedNode);
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey) {
      event.preventDefault();
      handleZoom(event.deltaY > 0 ? -0.08 : 0.08, event.clientX, event.clientY);
    }
  }

  function setupCanvasInteractions() {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
  }

  function onResize() {
    try {
      // Ensure canvas internal buffer and DPR are up-to-date before
      // updating the camera viewport. This prevents cases where the
      // canvas CSS size or devicePixelRatio changed but the internal
      // pixel buffer (and dataset) haven't been reinitialized yet,
      // which can cause the canvas to not fill the available area.
      ensureCanvasInitialized();
    } catch (e) {
      // Swallow errors from initialization to avoid breaking resize flow.
      // We'll still attempt to update viewport and render below.
      // eslint-disable-next-line no-console
      console.warn('ensureCanvasInitialized failed on resize', e);
    }
    const rect = canvas.getBoundingClientRect();
    camera.setViewport(rect.width, rect.height);
    requestRender();
  }

  camera.setOnChange(() => requestRender());
  setupCanvasInteractions();
  setupPanels();
  window.addEventListener('resize', onResize);

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => handleZoom(0.1));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => handleZoom(-0.1));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

  loadStageMapSpec()
    .then(spec => buildGraph(spec, { getLevelTitle }))
    .then(graph => {
      attachGraph(graph);
      requestRender();
    })
    .catch(err => {
      console.error('Failed to load stage map spec', err);
    });

  document.addEventListener('stageMap:progressUpdated', refreshNodeStates);
  document.addEventListener('stageMap:closePanels', closeOpenPanel);
  showStageMapScreen();

  requestRender();

  return {
    refresh: () => {
      refreshNodeStates();
    }
  };
}
