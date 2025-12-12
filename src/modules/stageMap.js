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
import { getActiveTheme } from '../themes.js';
import {
  STAGE_NODE_LEVEL_MAP,
  STAGE_TYPE_META,
  gridSizeToWorldSize,
  gridToWorldPoint
} from './stageMapLayout.js';
import { openStoryModal } from './story.js';
import { getLastAccessedLevel } from './storage.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

const SPECIAL_NODE_KEY = 'stageMapSpecialClears';
const STAGE_MAP_SPEC_PATH = 'stage_map.json';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutCubic = value => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

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
    fill: '#F6F6F6',
    stroke: '#FFFFFF',
    text: '#2E2E2E'
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

const STAGE_BLOCK_STYLE_FALLBACK = {
  fill: ['#d7dbff', '#b9c1ff'],
  activeFill: {
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: '#fef3c7' },
      { offset: 0.55, color: '#fde047' },
      { offset: 1, color: '#facc15' }
    ]
  },
  textColor: '#1f2937',
  activeTextColor: '#422006',
  shadow: {
    color: 'rgba(79, 70, 229, 0.18)',
    blur: 18,
    offsetX: 0,
    offsetY: 6
  },
  strokeColor: 'rgba(99, 102, 241, 0.4)',
  strokeWidth: 1.2
};

const TITLE_BADGE_BASE = {
  dropShadow: {
    color: 'rgba(13, 16, 23, 0.55)',
    blur: 14,
    offsetX: 0,
    offsetY: 4
  },
  highlight: {
    heightRatio: 0.2,
    color: 'rgba(255, 255, 255, 0.32)'
  },
  textColor: '#000000',
  textShadow: {
    color: 'rgba(0, 0, 0, 0.35)',
    offsetX: 0,
    offsetY: 2,
    blur: 4
  },
  subtitleColor: '#000000'
};

const RANK_TITLE_BADGES = {
  bit_solver: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#FFE6A2' },
        { offset: 0.55, color: '#F2C15C' },
        { offset: 1, color: '#D9A645' }
      ]
    },
    glow: { color: 'rgba(255, 214, 138, 0.3)', blur: 26 },
    bloom: { color: 'rgba(255, 244, 208, 0.15)' },
    border: { width: 1.5, color: '#FFD58A' },
    sparkle: {
      baseOpacity: 0.12,
      size: 6,
      color: '#ffffff',
      positions: [
        { x: 0.2, y: 0.46, scale: 0.9 },
        { x: 0.52, y: 0.32, scale: 1 },
        { x: 0.78, y: 0.56, scale: 1.1 }
      ]
    },
    textShadow: { color: '#C6933A', offsetY: 2, blur: 3 }
  },
  bit_wiser: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#FFECC5' },
        { offset: 0.5, color: '#F7C96D' },
        { offset: 1, color: '#C48A2D' }
      ]
    },
    glow: { color: 'rgba(255, 208, 130, 0.55)', blur: 32 },
    bloom: { color: 'rgba(255, 244, 208, 0.25)' },
    border: { width: 2.2, color: '#FFDE9B', inner: { inset: 2, color: 'rgba(255, 255, 255, 0.55)', width: 1 } },
    sparkle: {
      baseOpacity: 0.18,
      size: 6.6,
      color: '#fff7df',
      twinkle: true,
      period: 1500,
      positions: [
        { x: 0.16, y: 0.42, scale: 1 },
        { x: 0.35, y: 0.28, scale: 1.1 },
        { x: 0.55, y: 0.5, scale: 0.9 },
        { x: 0.72, y: 0.34, scale: 1.05 },
        { x: 0.86, y: 0.56, scale: 1.15 }
      ]
    },
    metallicSheen: { opacity: 0.35 },
    textShadow: { color: '#B87C1F', offsetY: 2, blur: 5 }
  },
  bit_master: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#FFF2D0' },
        { offset: 0.3, color: '#FFD16F' },
        { offset: 0.65, color: '#E1A23D' },
        { offset: 1, color: '#8A5A16' }
      ]
    },
    glow: { color: 'rgba(255, 210, 120, 0.9)', blur: 38 },
    bloom: { color: 'rgba(255, 220, 160, 0.4)' },
    border: {
      width: 3,
      color: '#FFE298',
      inner: { inset: 2.6, color: '#D49D3F', width: 1.4 }
    },
    halo: { color: 'rgba(255, 214, 147, 0.18)', radiusMultiplier: 2.2 },
    sparkle: {
      baseOpacity: 0.22,
      size: 7.2,
      color: '#fff7e1',
      twinkle: true,
      period: 1800,
      positions: [
        { x: 0.14, y: 0.4, scale: 1 },
        { x: 0.3, y: 0.25, scale: 0.9 },
        { x: 0.45, y: 0.55, scale: 1 },
        { x: 0.62, y: 0.33, scale: 1.05 },
        { x: 0.76, y: 0.52, scale: 1.12 },
        { x: 0.88, y: 0.3, scale: 0.95 }
      ]
    },
    particles: {
      count: 10,
      color: 'rgba(255, 242, 210, 0.12)',
      radius: 3.2,
      amplitude: 0.08,
      period: 2800
    },
    sweep: {
      period: 2500,
      widthRatio: 0.25,
      color: 'rgba(255, 255, 255, 0.35)',
      fade: true,
      fadePower: 1.2,
      alpha: 1
    },
    textShadow: { color: '#7A4E14', offsetY: 3, blur: 6 }
  }
};

function normalizeShadow(shadow, fallback) {
  if (shadow === null) return null;
  const base = fallback ? { ...fallback } : null;
  if (shadow === undefined) {
    return base;
  }
  if (!shadow) {
    return base;
  }
  if (typeof shadow === 'string') {
    return { ...(base || {}), color: shadow };
  }
  if (typeof shadow === 'object') {
    return { ...(base || {}), ...shadow };
  }
  return base;
}

function applyScaledShadow(ctx, shadow, scale = 1) {
  if (!shadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  const spec = typeof shadow === 'object' ? { ...shadow } : { color: shadow };
  if (typeof spec.blur === 'number') spec.blur *= scale;
  if (typeof spec.offsetX === 'number') spec.offsetX *= scale;
  if (typeof spec.offsetY === 'number') spec.offsetY *= scale;
  ctx.shadowColor = spec.color || 'transparent';
  ctx.shadowBlur = spec.blur ?? 0;
  ctx.shadowOffsetX = spec.offsetX ?? 0;
  ctx.shadowOffsetY = spec.offsetY ?? 0;
}

function createFillStyle(ctx, fill, x, y, w, h) {
  if (!fill) return null;
  if (Array.isArray(fill)) {
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    const step = fill.length > 1 ? 1 / (fill.length - 1) : 1;
    fill.forEach((color, index) => {
      gradient.addColorStop(Math.min(1, Math.max(0, index * step)), color);
    });
    return gradient;
  }
  if (typeof fill === 'object') {
    if (fill.type === 'linear') {
      const angle = (fill.angle ?? 90) * (Math.PI / 180);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const halfW = w / 2;
      const halfH = h / 2;
      const centerX = x + halfW;
      const centerY = y + halfH;
      const extent = Math.abs(w * dx) + Math.abs(h * dy) || 1;
      const startX = centerX - (dx * extent) / 2;
      const startY = centerY - (dy * extent) / 2;
      const endX = centerX + (dx * extent) / 2;
      const endY = centerY + (dy * extent) / 2;
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      (fill.stops || []).forEach(stop => {
        const offset = Math.min(1, Math.max(0, stop.offset ?? 0));
        gradient.addColorStop(offset, stop.color);
      });
      return gradient;
    }
    if (typeof fill.color === 'string') {
      return fill.color;
    }
    if (Array.isArray(fill.stops)) {
      const validStop = fill.stops.find(stop => typeof stop?.color === 'string');
      if (validStop) {
        return validStop.color;
      }
    }
  }
  if (typeof fill === 'string') {
    return fill;
  }
  return null;
}

function getStageBlockStyle() {
  const theme = typeof getActiveTheme === 'function' ? getActiveTheme() : null;
  const block = theme?.block || {};
  const fill = block.fill ?? STAGE_BLOCK_STYLE_FALLBACK.fill;
  const activeFill = block.activeFill ?? STAGE_BLOCK_STYLE_FALLBACK.activeFill;
  const textColor = block.textColor ?? STAGE_BLOCK_STYLE_FALLBACK.textColor;
  const activeTextColor = block.activeTextColor ?? STAGE_BLOCK_STYLE_FALLBACK.activeTextColor;
  const shadow = normalizeShadow(block.shadow, STAGE_BLOCK_STYLE_FALLBACK.shadow);
  const strokeColor = block.strokeColor ?? STAGE_BLOCK_STYLE_FALLBACK.strokeColor;
  const strokeWidth = Number.isFinite(block.strokeWidth)
    ? block.strokeWidth
    : STAGE_BLOCK_STYLE_FALLBACK.strokeWidth;
  return { fill, activeFill, textColor, activeTextColor, shadow, strokeColor, strokeWidth };
}

function buildRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawInsetRoundedRect(ctx, x, y, width, height, radius, inset, lineWidth, strokeStyle) {
  const adj = Math.max(0, inset);
  buildRoundedRectPath(ctx, x + adj, y + adj, width - adj * 2, height - adj * 2, Math.max(0, radius - adj));
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
}

function drawSparkle(ctx, x, y, size, color, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, size * 0.2);
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.globalAlpha *= 0.5;
  ctx.stroke();
  ctx.restore();
}

function drawSparkles(ctx, rect, config, scale, t = 0) {
  if (!config?.positions?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const baseOpacity = config.baseOpacity ?? 0.12;
  const baseSize = (config.size ?? 6) * scale;
  const period = config.period ?? 1600;
  config.positions.forEach((pos, idx) => {
    const size = baseSize * (pos.scale ?? 1);
    let alpha = baseOpacity;
    if (config.twinkle) {
      const phase = (idx * 0.37 + (pos.phase || 0)) * Math.PI * 2;
      alpha *= 0.55 + 0.45 * Math.sin(((t || 0) / period) * Math.PI * 2 + phase);
    }
    const x = rect.x + rect.w * pos.x;
    const y = rect.y + rect.h * pos.y;
    drawSparkle(ctx, x, y, size, config.color || '#ffffff', Math.max(0, alpha));
  });
  ctx.restore();
}

function drawDriftingParticles(ctx, rect, config, scale, t = 0) {
  if (!config?.count) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const period = Math.max(800, config.period ?? 2600);
  const amplitude = config.amplitude ?? 0.08;
  const baseRadius = (config.radius ?? 3) * scale;
  for (let i = 0; i < config.count; i += 1) {
    const seed = (i + 1) * 97;
    const baseX = (i + 0.5) / (config.count + 1);
    const baseY = ((seed % 37) / 37) * 0.6 + 0.2;
    const phase = ((seed % 23) / 23) * Math.PI * 2;
    const progress = ((t || 0) / period) * Math.PI * 2;
    const offset = Math.sin(progress + phase) * amplitude;
    const x = rect.x + rect.w * (baseX + offset);
    const y = rect.y + rect.h * baseY;
    const radius = baseRadius * (0.7 + ((seed % 13) / 13) * 0.6);
    const alpha = (config.baseOpacity ?? 0.12) * (0.6 + 0.4 * Math.cos(progress * 1.3 + phase));
    drawSparkle(ctx, x, y, radius, config.color || 'rgba(255, 255, 255, 0.25)', Math.max(0, alpha));
  }
  ctx.restore();
}

function drawHighlightSweep(ctx, rect, config, t = 0, pathBuilder) {
  if (!config) return;
  const period = Math.max(400, config.period ?? 2400);
  const widthRatio = config.widthRatio ?? 0.25;
  const sweepWidth = rect.w * widthRatio;
  const progress = ((t || 0) % period) / period;
  const startX = rect.x - sweepWidth + progress * (rect.w + sweepWidth * 2);
  const endX = startX + sweepWidth;
  ctx.save();
  pathBuilder();
  ctx.clip();
  const gradient = ctx.createLinearGradient(startX, rect.y, endX, rect.y + rect.h);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.5, config.color || 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  const prevAlpha = ctx.globalAlpha;
  const fadeEnabled = config.fade ?? false;
  const fadePower = Math.max(0.5, config.fadePower ?? 1);
  const fadeFactor = fadeEnabled ? Math.pow(Math.sin(progress * Math.PI), fadePower) : 1;
  const alpha = Math.max(0, Math.min(1, config.alpha ?? 1)) * fadeFactor;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x - sweepWidth, rect.y, rect.w + sweepWidth * 2, rect.h);
  ctx.globalAlpha = prevAlpha;
  ctx.restore();
}

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
  const title = level != null ? (getLevelTitle?.(level) ?? node.label) : node.label;
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

  const edges = (spec?.edges || []).map((edge, index) => {
    const from = nodeLookup.get(edge.from);
    const to = nodeLookup.get(edge.to);
    if (!from || !to) return null;
    const waypoints = Array.isArray(edge.waypoints)
      ? edge.waypoints.map(pt => gridPointToWorldCenter(pt))
      : [];
    const points = [from.center, ...waypoints, to.center];
    const deps = dependencies.get(edge.to);
    if (deps) deps.push(edge.from);
    const edgeId = edge.id ?? `${edge.from}->${edge.to}-${index}`;
    return {
      ...edge,
      id: edgeId,
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

function drawEdge(ctx, camera, edge, active, t = 0, highlight = null) {
  if (!edge?.points?.length) return;
  const highlightActive = Boolean(highlight && highlight.alpha > 0);
  if (!active && !highlightActive) return;

  const screenPoints = edge.points.map(pt => camera.worldToScreen(pt.x, pt.y));

  if (active) {
    ctx.save();
    ctx.beginPath();
    screenPoints.forEach((screen, idx) => {
      if (idx === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });

    ctx.lineWidth = Math.max(3, 4 * camera.getScale());
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(246, 203, 77, 0.18)';
    ctx.shadowColor = 'rgba(246, 203, 77, 0.35)';
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 1;
    ctx.stroke();

    ctx.beginPath();
    screenPoints.forEach((screen, idx) => {
      if (idx === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });

    const baseDash = 18 * Math.max(1, camera.getScale());
    try {
      ctx.setLineDash([baseDash, baseDash]);
    } catch (e) {
      // Ignore dash errors silently to keep compatibility with older canvases.
    }
    ctx.lineDashOffset = -((t || 0) * 0.06) % (baseDash * 2);

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

    try {
      ctx.setLineDash([]);
    } catch (e) {}

    ctx.restore();
  }

  if (highlightActive) {
    const progress = clamp(highlight.progress ?? 0, 0, 1);
    const alpha = clamp(highlight.alpha ?? 1, 0, 1);
    let totalLength = 0;
    for (let i = 1; i < screenPoints.length; i += 1) {
      const prev = screenPoints[i - 1];
      const current = screenPoints[i];
      totalLength += Math.hypot(current.x - prev.x, current.y - prev.y);
    }
    if (totalLength > 0) {
      const drawLength = Math.max(0.0001, totalLength * progress);
      ctx.save();
      ctx.beginPath();
      screenPoints.forEach((screen, idx) => {
        if (idx === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      });
      try {
        ctx.setLineDash([drawLength, totalLength]);
        ctx.lineDashOffset = totalLength * 0.02;
      } catch (e) {}
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3.2, 4.4 * camera.getScale());
      ctx.strokeStyle = 'rgba(255, 213, 128, 1)';
      ctx.shadowColor = `rgba(255, 200, 92, ${0.45 * alpha})`;
      ctx.shadowBlur = 24 * alpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      ctx.stroke();
      try {
        ctx.setLineDash([]);
      } catch (e) {}
      ctx.restore();
    }
  }
}

function drawRankTitleNode(ctx, camera, node, status, t = 0) {
  const spec = RANK_TITLE_BADGES[node.id];
  if (!spec || !status?.progressCleared) {
    return false;
  }
  const { scale } = camera.getState();
  const topLeft = camera.worldToScreen(node.rect.x, node.rect.y);
  const width = node.rect.w * scale;
  const height = node.rect.h * scale;
  const radius = Math.min(18 * scale, Math.min(width, height) / 3);
  const rect = { x: topLeft.x, y: topLeft.y, w: width, h: height };
  const pathBuilder = () => buildRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);

  ctx.save();

  if (spec.halo) {
    const haloRadius = Math.max(width, height) * (spec.halo.radiusMultiplier ?? 2);
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;
    const haloGradient = ctx.createRadialGradient(centerX, centerY, Math.max(width, height) * 0.4, centerX, centerY, haloRadius);
    haloGradient.addColorStop(0, spec.halo.color || 'rgba(255, 255, 255, 0.15)');
    haloGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = haloGradient;
    ctx.fillRect(centerX - haloRadius, centerY - haloRadius, haloRadius * 2, haloRadius * 2);
    ctx.restore();
  }

  applyScaledShadow(ctx, spec.dropShadow ?? TITLE_BADGE_BASE.dropShadow, scale);
  pathBuilder();
  const fillStyle = createFillStyle(ctx, spec.gradient, rect.x, rect.y, rect.w, rect.h) || '#facc15';
  ctx.fillStyle = fillStyle;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const highlight = { ...TITLE_BADGE_BASE.highlight, ...(spec.highlight || {}) };
  if (highlight) {
    ctx.save();
    pathBuilder();
    ctx.clip();
    const highlightHeight = rect.h * (highlight.heightRatio ?? 0.2);
    const highlightGradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + highlightHeight);
    highlightGradient.addColorStop(0, highlight.color || TITLE_BADGE_BASE.highlight.color);
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlightGradient;
    ctx.fillRect(rect.x, rect.y, rect.w, highlightHeight);
    ctx.restore();
  }

  if (spec.bloom) {
    ctx.save();
    pathBuilder();
    ctx.clip();
    const centerX = rect.x + rect.w * 0.45;
    const centerY = rect.y + rect.h * 0.5;
    const bloomGradient = ctx.createRadialGradient(centerX, centerY, Math.min(rect.w, rect.h) * 0.12, centerX, centerY, Math.max(rect.w, rect.h));
    bloomGradient.addColorStop(0, spec.bloom.color);
    bloomGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = bloomGradient;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  if (spec.metallicSheen) {
    ctx.save();
    pathBuilder();
    ctx.clip();
    const sheen = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h * 0.6);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.5, `rgba(255, 255, 255, ${spec.metallicSheen.opacity})`);
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sheen;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  if (spec.glow) {
    ctx.save();
    pathBuilder();
    ctx.shadowColor = spec.glow.color;
    ctx.shadowBlur = (spec.glow.blur ?? 30) * scale;
    ctx.lineWidth = Math.max((spec.glow.strokeWidth ?? 2) * scale, 0.8);
    ctx.strokeStyle = spec.glow.strokeColor || spec.border?.color || '#fff7d6';
    ctx.stroke();
    ctx.restore();
  }

  if (spec.border?.width) {
    pathBuilder();
    ctx.lineWidth = Math.max(spec.border.width * scale, 0.9);
    ctx.strokeStyle = spec.border.color;
    ctx.stroke();
    if (spec.border.inner) {
      const inner = spec.border.inner;
      const innerWidth = Math.max((inner.width ?? 1) * scale, 0.6);
      drawInsetRoundedRect(
        ctx,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        radius,
        inner.inset ?? Math.max(1.5, inner.width || 1),
        innerWidth,
        inner.color || 'rgba(255, 255, 255, 0.45)'
      );
    }
  }

  drawHighlightSweep(ctx, rect, spec.sweep, t, pathBuilder);

  if (spec.particles) {
    drawDriftingParticles(ctx, rect, spec.particles, scale, t);
  }

  drawSparkles(ctx, rect, spec.sparkle, scale, t);

  const textColor = spec.textColor || TITLE_BADGE_BASE.textColor;
  const subtitleColor = spec.subtitleColor || TITLE_BADGE_BASE.subtitleColor;
  const mainFontSize = Math.max(18, 20 * scale);
  const subtitleSize = Math.max(12, 13 * scale);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.font = `900 ${mainFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  const textShadow = { ...TITLE_BADGE_BASE.textShadow, ...(spec.textShadow || {}) };
  ctx.shadowColor = textShadow.color;
  ctx.shadowBlur = (textShadow.blur ?? 4) * scale;
  ctx.shadowOffsetX = (textShadow.offsetX ?? 0) * scale;
  ctx.shadowOffsetY = (textShadow.offsetY ?? 0) * scale;

  const clampText = (text, maxWidth) => {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    let low = 0;
    let high = text.length;
    let result = text;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = text.slice(0, mid) + '…';
      if (ctx.measureText(candidate).width <= maxWidth) {
        low = mid;
        result = candidate;
      } else {
        high = mid - 1;
      }
    }
    if (ctx.measureText(result).width > maxWidth) {
      let shortened = text;
      while (shortened.length && ctx.measureText(shortened + '…').width > maxWidth) {
        shortened = shortened.slice(0, -1);
      }
      result = shortened + (shortened.length < text.length ? '…' : '');
    }
    return result;
  };

  const titleText = clampText(node.title, rect.w * 0.84);
  ctx.fillText(titleText, rect.x + rect.w / 2, rect.y + rect.h / 2 - Math.max(4 * scale, 6));

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = subtitleColor;
  ctx.font = `700 ${subtitleSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  const subtitle = clampText(node.chapterName || '', rect.w * 0.8);
  if (subtitle) {
    ctx.fillText(subtitle, rect.x + rect.w / 2, rect.y + rect.h - Math.max(12 * scale, 14));
  }
  ctx.globalAlpha = 1;

  ctx.restore();
  return true;
}

function drawNode(ctx, camera, node, status, t = 0, isHovered = false, isPressed = false, highlight = null) {
  if (node.nodeType === 'rank' && RANK_TITLE_BADGES[node.id]) {
    const handled = drawRankTitleNode(ctx, camera, node, status, t);
    if (handled) {
      return;
    }
  }
  const { scale } = camera.getState();
  const topLeft = camera.worldToScreen(node.rect.x, node.rect.y);
  const width = node.rect.w * scale;
  const height = node.rect.h * scale;
  const radius = Math.min(12 * scale, Math.min(width, height) / 4);

  const isStageNode = node.nodeType === 'stage' && !status.locked;
  const stageStyle = isStageNode ? getStageBlockStyle() : null;
  const stageCleared = stageStyle ? Boolean(status.progressCleared) && !node.comingSoon : false;

  const baseStyle = stageStyle
    ? null
    : status.locked
      ? NODE_STYLE.locked
      : node.comingSoon
        ? NODE_STYLE.comingSoon
        : NODE_STYLE[node.nodeType] || NODE_STYLE.stage;

  const accentColor = STAGE_TYPE_META[node.nodeType]?.accent;
  const borderColor = stageStyle
    ? stageCleared
      ? accentColor || stageStyle.strokeColor
      : stageStyle.strokeColor
    : status.progressCleared
      ? accentColor || baseStyle.stroke
      : baseStyle.stroke;

  ctx.save();
  if (highlight?.pulse) {
    const centerScreen = camera.worldToScreen(node.center.x, node.center.y);
    ctx.translate(centerScreen.x, centerScreen.y);
    ctx.scale(highlight.pulse, highlight.pulse);
    ctx.translate(-centerScreen.x, -centerScreen.y);
  }
  const drawRounded = () => buildRoundedRectPath(ctx, topLeft.x, topLeft.y, width, height, radius);

  if (stageStyle) {
    if (stageCleared) {
      // Match the active block visual language: warm halo + radial glow
      const haloShadow = {
        color: 'rgba(255, 220, 180, 0.22)',
        blur: 18,
        offsetX: 0,
        offsetY: 4
      };
      applyScaledShadow(ctx, haloShadow, scale);
      drawRounded();
      // base warm fill behind the glow (same as blocks)
      ctx.fillStyle = 'rgba(255, 246, 225, 0.96)';
      ctx.fill();

      // clear direct shadow before radial glow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Use same center/radius heuristics as drawBlock for consistent glow
      const centerX = topLeft.x + width * 0.42;
      const centerY = topLeft.y + height * 0.38;
      const minSize = Math.min(width, height);
      const innerRadius = Math.max(minSize * 0.06, 0);
      const outerRadius = Math.max(minSize * 0.6, innerRadius + 0.1);
      const glowGradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
      glowGradient.addColorStop(0, 'rgba(255, 255, 235, 0.12)');
      glowGradient.addColorStop(0.58, 'rgba(255, 235, 160, 0.08)');
      glowGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
      ctx.globalCompositeOperation = 'lighter';
      drawRounded();
      ctx.fillStyle = glowGradient;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // Note: do not apply an extra opaque active overlay here so the glow
      // matches the block appearance; the node's active text color and
      // border are still applied below.
    } else {
      applyScaledShadow(ctx, stageStyle.shadow, scale);
      drawRounded();
      const fillStyle = createFillStyle(ctx, stageStyle.fill, topLeft.x, topLeft.y, width, height) || stageStyle.fill;
      ctx.fillStyle = fillStyle || '#d7dbff';
      ctx.fill();
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const strokeWidth = stageStyle.strokeWidth ?? 0;
    if (borderColor && strokeWidth > 0) {
      ctx.lineWidth = Math.max(strokeWidth * scale, 0.6);
      ctx.strokeStyle = borderColor;
      drawRounded();
      ctx.stroke();
    }
  } else {
    drawRounded();
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
  }

  if (isPressed) {
    ctx.save();
    drawRounded();
    ctx.fillStyle = stageStyle
      ? 'rgba(15, 23, 42, 0.08)'
      : 'rgba(15, 23, 42, 0.18)';
    ctx.fill();
    ctx.lineWidth = Math.max(2 * scale, 1.2);
    ctx.strokeStyle = stageStyle ? 'rgba(250, 204, 21, 0.9)' : 'rgba(248, 250, 252, 0.85)';
    ctx.shadowColor = stageStyle ? 'rgba(250, 204, 21, 0.35)' : 'rgba(148, 163, 184, 0.4)';
    ctx.shadowBlur = 10 * Math.max(1, scale);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3 * Math.max(1, scale);
    drawRounded();
    ctx.stroke();
    ctx.restore();
  }

  if (isHovered && !isPressed) {
    ctx.save();
    const hoverStroke = stageStyle
      ? 'rgba(250, 204, 21, 0.85)'
      : 'rgba(248, 250, 252, 0.9)';
    const hoverGlow = stageStyle
      ? 'rgba(250, 204, 21, 0.5)'
      : 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = Math.max(2.6 * scale, 2);
    ctx.strokeStyle = hoverStroke;
    ctx.shadowColor = hoverGlow;
    ctx.shadowBlur = 16 * Math.max(scale, 0.8);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4 * Math.max(scale, 0.8);
    drawRounded();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = stageStyle ? 0.12 : 0.08;
    ctx.fillStyle = stageStyle
      ? 'rgba(250, 204, 21, 0.25)'
      : 'rgba(148, 163, 184, 0.25)';
    drawRounded();
    ctx.fill();
    ctx.restore();
  }

  const titleColor = stageStyle
    ? stageCleared
      ? stageStyle.activeTextColor || stageStyle.textColor
      : stageStyle.textColor
    : baseStyle.text;
  ctx.fillStyle = titleColor;
  ctx.font = `700 ${Math.max(14, 16 * scale)}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const paddingX = 12 * scale;
  const paddingY = 10 * scale;
  let textX = topLeft.x + paddingX;
  let textY = topLeft.y + paddingY + (12 * scale);
  const maxTextWidth = Math.max(8, width - paddingX * 2);
  function fitText(t) {
    if (!t) return '';
    if (ctx.measureText(t).width <= maxTextWidth) return t;
    let lo = 0;
    let hi = t.length;
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

  const chapterText = fitText(node.chapterName || '');
  if (stageStyle) {
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stageCleared
      ? stageStyle.activeTextColor || stageStyle.textColor
      : stageStyle.textColor;
    ctx.globalAlpha = stageCleared ? 0.88 : 0.78;
    ctx.fillText(chapterText, textX, textY);
    ctx.globalAlpha = prevAlpha;
  } else {
    ctx.fillStyle = status.locked ? 'rgba(241, 245, 249, 0.75)' : 'rgba(226, 232, 240, 0.95)';
    ctx.fillText(chapterText, textX, textY);
  }

  if (node.comingSoon) {
    ctx.font = `${600 * scale} ${Math.max(11, 12 * scale)}px 'Noto Sans KR', 'Inter', sans-serif`;
    ctx.textAlign = 'right';
    if (stageStyle) {
      const prevAlpha = ctx.globalAlpha;
      ctx.fillStyle = stageCleared
        ? stageStyle.activeTextColor || stageStyle.textColor
        : stageStyle.textColor;
      ctx.globalAlpha = 0.82;
      ctx.fillText('Coming soon', topLeft.x + width - paddingX, topLeft.y + height - paddingY);
      ctx.globalAlpha = prevAlpha;
    } else {
      ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
      ctx.fillText('Coming soon', topLeft.x + width - paddingX, topLeft.y + height - paddingY);
    }
  } else if (status.locked) {
    ctx.font = `${600 * scale} ${Math.max(11, 12 * scale)}px 'Noto Sans KR', 'Inter', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.65)';
    ctx.fillText('Locked', topLeft.x + width - paddingX, topLeft.y + height - paddingY);
  }

  if (highlight && (highlight.alpha ?? 0) > 0) {
    const alpha = clamp(highlight.alpha ?? 1, 0, 1);
    const glow = clamp(highlight.glow ?? alpha, 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = 'rgba(255, 246, 200, 0.85)';
    drawRounded();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 208, 103, 1)';
    ctx.lineWidth = Math.max(3.2 * scale, 2.6);
    ctx.shadowColor = `rgba(255, 188, 66, ${0.55 * alpha})`;
    ctx.shadowBlur = 28 * Math.max(glow, 0.2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    drawRounded();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function isPointInsideNode(node, worldPoint) {
  if (!node?.rect) return false;
  return worldPoint.x >= node.rect.x && worldPoint.x <= node.rect.x + node.rect.w
    && worldPoint.y >= node.rect.y && worldPoint.y <= node.rect.y + node.rect.h;
}

function isNodeInteractive(node, status) {
  if (!node || !status || status.locked || node.comingSoon) {
    return false;
  }
  if (node.nodeType === 'stage') {
    return node.level != null;
  }
  return node.nodeType === 'mode'
    || node.nodeType === 'feature'
    || node.nodeType === 'rank';
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

  canvas.style.cursor = 'grab';
  // Prevent the browser from using touch gestures (scroll/zoom) on the
  // canvas/surface so pointer events can be used reliably for panning on
  // mobile devices.
  try {
    canvas.style.touchAction = canvas.style.touchAction || 'none';
    surface.style.touchAction = surface.style.touchAction || 'none';
  } catch (e) {
    // Ignore failures assigning style in very old browsers/environments.
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
    activePointers: new Map(),
    pinchState: null,
    specialClears: loadSpecialNodeClears(),
    mapBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    hoverNode: null,
    pressedNode: null,
    dragging: false,
    edgesBySource: new Map(),
    focusHighlight: null,
    edgeHighlights: new Map(),
    pendingFocus: null,
    pendingMemoryRestored: null,
    cameraAnimation: null
  };

  function executeNextFrame(fn) {
    if (typeof fn !== 'function') return;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => fn());
    } else {
      setTimeout(() => fn(), 16);
    }
  }

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
    const timestamp = typeof t === 'number' ? t : performance.now();
    ensureCanvasInitialized();
    updateCameraAnimation(timestamp);

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
      const highlight = resolveEdgeHighlight(edge.id, timestamp);
      drawEdge(ctx, camera, edge, active, timestamp, highlight);
    });

    state.nodes.forEach(node => {
      const status = state.nodeStatus.get(node.id) || { locked: false, progressCleared: false };
      const isHovered = Boolean(state.hoverNode && state.hoverNode.id === node.id);
      const isPressed = Boolean(state.pressedNode && state.pressedNode.id === node.id);
      const highlight = resolveNodeHighlight(node.id, timestamp);
      drawNode(ctx, camera, node, status, timestamp, isHovered, isPressed, highlight);
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

    if (node.level != null) {
      // Stage nodes unlock purely from stage_map edge requirements.
      if (typeof isLevelUnlocked === 'function') {
        // Preserve legacy side effects without letting the callback gate access.
        try {
          isLevelUnlocked(node.level);
        } catch (err) {
          console.warn('isLevelUnlocked callback threw', err);
        }
      }
      displayCleared = clearedLevels.has(node.level);
      unlocked = prerequisitesMet || displayCleared;
      locked = !unlocked;
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
      progressCleared = false;
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
    if (state.hoverNode) {
      const hoverStatus = state.nodeStatus.get(state.hoverNode.id);
      if (!isNodeInteractive(state.hoverNode, hoverStatus)) {
        clearHoverNode();
      }
    }
    if (state.pressedNode) {
      const pressedStatus = state.nodeStatus.get(state.pressedNode.id);
      if (!isNodeInteractive(state.pressedNode, pressedStatus)) {
        clearPressedNode();
      }
    }
    requestRender();
  }

  function attachGraph(graph) {
    state.nodes = graph.nodes;
    state.edges = graph.edges;
    state.nodeLookup = graph.nodeLookup;
    state.dependencies = graph.dependencies;
    state.mapBounds = graph.bounds;
    state.focusHighlight = null;
    state.edgeHighlights = new Map();
    state.edgesBySource = new Map();
    state.edges.forEach(edge => {
      if (!state.edgesBySource.has(edge.from)) {
        state.edgesBySource.set(edge.from, []);
      }
      state.edgesBySource.get(edge.from).push(edge);
    });
    clearHoverNode();
    clearPressedNode();
    refreshNodeStates();
    if (state.pendingFocus) {
      const pending = state.pendingFocus;
      state.pendingFocus = null;
      focusLevel(pending.level, pending.options);
    }
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
        
        const lastLevel = getLastAccessedLevel();
        const lastLevelNode = lastLevel ? state.nodes.find(n => n.level === Number(lastLevel)) : null;
        const bitSolverNode = state.nodes.find(n => n.id === 'bit_solver');

        if (lastLevelNode) {
          focusNode(lastLevelNode, { animate: false });
        } else if (bitSolverNode) {
          focusNode(bitSolverNode, { animate: false });
        } else {
          centerMap();
        }
        requestRender();
      });
    } else {
      ensureCanvasInitialized();
      const lastLevel = getLastAccessedLevel();
      const lastLevelNode = lastLevel ? state.nodes.find(n => n.level === Number(lastLevel)) : null;
      const bitSolverNode = state.nodes.find(n => n.id === 'bit_solver');

      if (lastLevelNode) {
        focusNode(lastLevelNode, { animate: false });
      } else if (bitSolverNode) {
        focusNode(bitSolverNode, { animate: false });
      } else {
        centerMap();
      }
      requestRender();
    }
  }

  function panToOrigin(targetOrigin, { animate = true, duration = 650 } = {}) {
    if (!targetOrigin) return;
    const { originX, originY } = camera.getState();
    const targetX = Number.isFinite(targetOrigin.x) ? targetOrigin.x : originX;
    const targetY = Number.isFinite(targetOrigin.y) ? targetOrigin.y : originY;
    if (!animate) {
      const dx = (originX - targetX) * camera.getScale();
      const dy = (originY - targetY) * camera.getScale();
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        camera.pan(dx, dy);
      }
      refreshZoomIndicator();
      state.cameraAnimation = null;
      requestRender();
      return;
    }

    state.cameraAnimation = {
      from: { x: originX, y: originY },
      to: { x: targetX, y: targetY },
      startTime: performance.now(),
      duration: Math.max(200, duration || 0)
    };
    requestRender();
  }

  function updateCameraAnimation(timestamp) {
    const anim = state.cameraAnimation;
    if (!anim) return;
    const elapsed = timestamp - anim.startTime;
    if (elapsed >= anim.duration) {
      state.cameraAnimation = null;
      const { originX, originY } = camera.getState();
      const dx = (originX - anim.to.x) * camera.getScale();
      const dy = (originY - anim.to.y) * camera.getScale();
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        camera.pan(dx, dy);
      }
      refreshZoomIndicator();
      return;
    }
    const progress = easeOutCubic(elapsed / Math.max(1, anim.duration));
    const desiredX = anim.from.x + (anim.to.x - anim.from.x) * progress;
    const desiredY = anim.from.y + (anim.to.y - anim.from.y) * progress;
    const { originX, originY } = camera.getState();
    const dx = (originX - desiredX) * camera.getScale();
    const dy = (originY - desiredY) * camera.getScale();
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      camera.pan(dx, dy);
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
    panToOrigin({ x: targetOriginX, y: targetOriginY }, { animate: false });
  }

  function triggerHighlightForNode(node) {
    if (!node) return;
    const now = performance.now();
    state.focusHighlight = {
      nodeId: node.id,
      startTime: now,
      duration: 1100,
      hold: 900
    };
    state.edgeHighlights.clear();
    const outgoing = state.edgesBySource.get(node.id) || [];
    outgoing.forEach((edge, index) => {
      state.edgeHighlights.set(edge.id, {
        startTime: now + index * 120,
        duration: 900,
        hold: 700
      });
    });
    requestRender();
  }

  function resolveNodeHighlight(nodeId, timestamp) {
    const info = state.focusHighlight;
    if (!info || info.nodeId !== nodeId) return null;
    const elapsed = timestamp - info.startTime;
    if (elapsed < 0) return null;
    const duration = info.duration || 0;
    const hold = info.hold || 0;
    if (elapsed > duration + hold) {
      if (state.focusHighlight?.nodeId === nodeId) {
        state.focusHighlight = null;
      }
      return null;
    }
    const progress = duration > 0 ? easeOutCubic(Math.min(elapsed / duration, 1)) : 1;
    const fade = elapsed > duration
      ? Math.max(0, 1 - ((elapsed - duration) / Math.max(1, hold)))
      : 1;
    const pulse = 1 + 0.08 * (1 - progress) * fade;
    const glow = clamp(fade, 0, 1);
    const alpha = clamp(fade, 0, 1);
    return { pulse, glow, alpha };
  }

  function resolveEdgeHighlight(edgeId, timestamp) {
    const info = state.edgeHighlights.get(edgeId);
    if (!info) return null;
    const elapsed = timestamp - info.startTime;
    if (elapsed < 0) return null;
    const duration = info.duration || 0;
    const hold = info.hold || 0;
    if (elapsed > duration + hold) {
      state.edgeHighlights.delete(edgeId);
      return null;
    }
    const progress = duration > 0 ? easeOutCubic(Math.min(elapsed / duration, 1)) : 1;
    const fade = elapsed > duration
      ? Math.max(0, 1 - ((elapsed - duration) / Math.max(1, hold)))
      : 1;
    return { progress, alpha: fade };
  }

  function focusNode(node, { animate = true, celebrate = false } = {}) {
    if (!node) return;
    executeNextFrame(() => {
      ensureCanvasInitialized();
      const { scale, viewportWidth, viewportHeight } = camera.getState();
      const widthWorld = (viewportWidth || canvas.clientWidth || 1) / Math.max(scale, 1e-6);
      const heightWorld = (viewportHeight || canvas.clientHeight || 1) / Math.max(scale, 1e-6);
      const rawTarget = {
        x: node.center.x - widthWorld / 2,
        y: node.center.y - heightWorld / 2
      };
      // 이전에는 맵 경계(`state.mapBounds`)에 맞춰 클램프(clamp)하여
      // 뷰포트가 맵 밖으로 나가지 않도록 했습니다. 요청에 따라
      // 맵 경계와 비교하지 않고 원래 계산한 목표 위치(`rawTarget`)를
      // 그대로 사용하도록 변경합니다.
      const targetOrigin = rawTarget;
      panToOrigin(targetOrigin, { animate, duration: 650 });
      if (celebrate) {
        triggerHighlightForNode(node);
      }
      requestRender();
    });
  }

  function focusLevel(level, options = {}) {
    const normalizedLevel = Number(level);
    const opts = { animate: true, celebrate: false, ...options };
    if (!state.nodes.length) {
      state.pendingFocus = { level: normalizedLevel, options: opts };
      return;
    }
    const node = state.nodes.find(n => n.level === normalizedLevel);
    if (!node) return;
    focusNode(node, opts);
  }

  function celebrateLevel(level, options = {}) {
    focusLevel(level, { ...options, celebrate: true });
  }

  function refreshZoomIndicator() {
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${camera.getScale().toFixed(1)}×`;
    }
  }

  function handleZoom(delta, pivotX, pivotY) {
    const current = camera.getScale();
    const next = Math.max(0.6, Math.min(2.2, current + delta));
    camera.setScale(next, pivotX, pivotY);
    refreshZoomIndicator();
    requestRender();
  }

  function resetView() {
    camera.reset();
    centerMap();
    refreshZoomIndicator();
  }

  function updateCanvasCursor() {
    if (!canvas) return;
    if (state.dragging || state.pinchState) {
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (state.hoverNode || state.pressedNode) {
      canvas.style.cursor = 'pointer';
      return;
    }
    canvas.style.cursor = 'grab';
  }

  function setHoverNode(nextNode) {
    const prevId = state.hoverNode?.id || null;
    const nextId = nextNode?.id || null;
    if (prevId === nextId) {
      updateCanvasCursor();
      return;
    }
    state.hoverNode = nextNode || null;
    updateCanvasCursor();
    requestRender();
  }

  function clearHoverNode() {
    if (!state.hoverNode) {
      updateCanvasCursor();
      return;
    }
    state.hoverNode = null;
    updateCanvasCursor();
    requestRender();
  }

  function findHoverableNode(worldPoint) {
    if (!worldPoint) return null;
    return state.nodes.find(node => {
      if (!isPointInsideNode(node, worldPoint)) return false;
      const status = state.nodeStatus.get(node.id);
      return isNodeInteractive(node, status);
    }) || null;
  }

  function updateHoverFromPoint(clientX, clientY) {
    if (!canvas || state.dragging) {
      updateCanvasCursor();
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) {
      clearHoverNode();
      return null;
    }
    const world = camera.screenToWorld(clientX, clientY);
    const hovered = findHoverableNode(world);
    if (!hovered) {
      clearHoverNode();
      return null;
    }
    setHoverNode(hovered);
    return hovered;
  }

  function setPressedNode(nextNode) {
    const prevId = state.pressedNode?.id || null;
    const nextId = nextNode?.id || null;
    if (prevId === nextId) {
      updateCanvasCursor();
      return;
    }
    state.pressedNode = nextNode || null;
    updateCanvasCursor();
    requestRender();
  }

  function clearPressedNode() {
    if (!state.pressedNode) {
      updateCanvasCursor();
      return;
    }
    state.pressedNode = null;
    updateCanvasCursor();
    requestRender();
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
    if (node.id === 'story') {
      closeOpenPanel();
      openStoryModal();
      return;
    }
    if (node.id === 'credits') {
      window.alert?.('Credits are coming soon.');
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
    if (!node || node.level == null || typeof startLevel !== 'function') {
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
    if (node.level == null) return;
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

  function addActivePointer(event) {
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function updateActivePointer(event) {
    if (state.activePointers.has(event.pointerId)) {
      state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
  }

  function removeActivePointer(event) {
    state.activePointers.delete(event.pointerId);
  }

  function beginPinchGesture() {
    const entries = Array.from(state.activePointers.entries());
    if (entries.length < 2) {
      return;
    }
    const [first, second] = entries;
    const a = first?.[1];
    const b = second?.[1];
    if (!a || !b) {
      return;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    const initialDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;

    state.pinchState = {
      pointerIds: [first[0], second[0]],
      initialDistance,
      initialScale: camera.getScale(),
      lastCenter: { x: centerX, y: centerY }
    };
    state.pointerStart = null;
    state.dragging = false;
    clearHoverNode();
    clearPressedNode();
    updateCanvasCursor();
  }

  function getPinchPointers() {
    const pinch = state.pinchState;
    if (!pinch) return null;
    const first = state.activePointers.get(pinch.pointerIds[0]);
    const second = state.activePointers.get(pinch.pointerIds[1]);
    if (!first || !second) return null;
    return [
      { id: pinch.pointerIds[0], x: first.x, y: first.y },
      { id: pinch.pointerIds[1], x: second.x, y: second.y }
    ];
  }

  function updatePinchGesture() {
    const pinch = state.pinchState;
    if (!pinch) return;
    const pointers = getPinchPointers();
    if (!pointers) {
      if (state.activePointers.size >= 2) {
        beginPinchGesture();
      }
      return;
    }
    const [a, b] = pointers;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance <= 0) {
      distance = pinch.initialDistance || 1;
    }
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;

    const ratio = distance / Math.max(pinch.initialDistance || 1, 1);
    const desiredScale = pinch.initialScale * ratio;
    const clampedScale = Math.max(0.6, Math.min(2.2, desiredScale));
    camera.setScale(clampedScale, centerX, centerY);
    refreshZoomIndicator();

    if (pinch.lastCenter) {
      const deltaX = centerX - pinch.lastCenter.x;
      const deltaY = centerY - pinch.lastCenter.y;
      if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
        camera.pan(deltaX, deltaY);
      }
    }

    pinch.lastCenter = { x: centerX, y: centerY };
    pinch.initialScale = camera.getScale();
    pinch.initialDistance = distance;
    requestRender();
  }

  function endPinchGesture() {
    state.pinchState = null;
    refreshZoomIndicator();
    updateCanvasCursor();
  }

  function syncPointerStartFromRemainingPointer() {
    if (state.activePointers.size !== 1) {
      state.pointerStart = null;
      return;
    }
    const [, position] = state.activePointers.entries().next().value;
    if (!position) {
      state.pointerStart = null;
      return;
    }
    state.pointerStart = {
      x: position.x,
      y: position.y,
      world: camera.screenToWorld(position.x, position.y),
      moved: false
    };
    state.dragging = false;
  }

  function handlePointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    addActivePointer(event);

    if (state.activePointers.size >= 2) {
      beginPinchGesture();
      return;
    }

    state.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      world: camera.screenToWorld(event.clientX, event.clientY),
      moved: false
    };
    state.dragging = false;
    const hovered = updateHoverFromPoint(event.clientX, event.clientY);
    if (hovered) {
      setPressedNode(hovered);
    } else {
      clearPressedNode();
    }
    updateCanvasCursor();
  }

  function handlePointerMove(event) {
    if (!state.activePointers.has(event.pointerId)) {
      return;
    }

    updateActivePointer(event);

    if (state.activePointers.size >= 2 || state.pinchState) {
      if (!state.pinchState && state.activePointers.size >= 2) {
        beginPinchGesture();
      }
      if (state.pinchState) {
        updatePinchGesture();
      }
      return;
    }

    if (!state.pointerStart) return;
    const dx = event.clientX - state.pointerStart.x;
    const dy = event.clientY - state.pointerStart.y;
    if (!state.dragging && Math.hypot(dx, dy) > 4) {
      state.dragging = true;
      clearHoverNode();
      clearPressedNode();
      updateCanvasCursor();
    }
    if (state.dragging) {
      camera.pan(dx, dy);
      state.pointerStart.x = event.clientX;
      state.pointerStart.y = event.clientY;
      requestRender();
      return;
    }
    const hovered = updateHoverFromPoint(event.clientX, event.clientY);
    if (hovered) {
      setPressedNode(hovered);
    } else {
      clearPressedNode();
    }
  }

  function handlePointerUp(event) {
    const start = state.pointerStart;
    const wasDragging = state.dragging;
    const hadPinch = Boolean(state.pinchState);

    if (state.activePointers.has(event.pointerId)) {
      updateActivePointer(event);
    }

    canvas.releasePointerCapture?.(event.pointerId);
    removeActivePointer(event);

    if (hadPinch || state.pinchState) {
      if (state.activePointers.size >= 2) {
        beginPinchGesture();
        return;
      }
      endPinchGesture();
      if (state.activePointers.size === 1) {
        syncPointerStartFromRemainingPointer();
        updateCanvasCursor();
        return;
      }
      state.pointerStart = null;
      state.dragging = false;
      updateCanvasCursor();
      return;
    }

    state.dragging = false;
    state.pointerStart = null;
    updateCanvasCursor();

    if (!start || wasDragging) {
      clearPressedNode();
      updateHoverFromPoint(event.clientX, event.clientY);
      return;
    }

    const world = camera.screenToWorld(event.clientX, event.clientY);
    const clickedNode = state.nodes.find(node => isPointInsideNode(node, world));
    handleNodeActivation(clickedNode);
    clearPressedNode();
    updateHoverFromPoint(event.clientX, event.clientY);
  }

  function handleWheel(event) {
    if (!event.ctrlKey) {
      event.preventDefault();
      handleZoom(event.deltaY > 0 ? -0.08 : 0.08, event.clientX, event.clientY);
    }
  }

  function handlePointerHover(event) {
    if (state.pointerStart || state.pinchState) {
      return;
    }
    if (state.pressedNode) {
      clearPressedNode();
    }
    updateHoverFromPoint(event.clientX, event.clientY);
  }

  function handlePointerLeave(event) {
    if (state.activePointers.has(event.pointerId)) {
      return;
    }
    if (state.pointerStart || state.pinchState) return;
    clearHoverNode();
    clearPressedNode();
  }

  function handlePointerCancel(event) {
    canvas.releasePointerCapture?.(event.pointerId);
    if (state.activePointers.has(event.pointerId)) {
      removeActivePointer(event);
    }

    if (state.pinchState) {
      if (state.activePointers.size >= 2) {
        beginPinchGesture();
      } else {
        endPinchGesture();
      }
    }

    if (state.activePointers.size === 1 && !state.pinchState) {
      syncPointerStartFromRemainingPointer();
    } else {
      state.pointerStart = null;
      state.dragging = false;
    }

    updateCanvasCursor();
    clearHoverNode();
    clearPressedNode();
  }

  function setupCanvasInteractions() {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointermove', handlePointerHover);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointercancel', handlePointerCancel);
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

  function triggerMemoryRestoredAnimation(levelId, storyNumber) {
    state.pendingMemoryRestored = { levelId, storyNumber };
  }

  function runMemoryRestoredAnimation({ levelId, storyNumber }) {
    const levelNode = state.nodes.find(n => n.level === levelId);
    const storyNode = state.nodes.find(n => n.id === 'story');

    if (!levelNode || !storyNode) return;

    const { scale } = camera.getState();
    const startWorldX = levelNode.rect.x + levelNode.rect.w / 2;
    const startWorldY = levelNode.rect.y + levelNode.rect.h / 4;
    const endWorldX = storyNode.rect.x + storyNode.rect.w / 2;
    const endWorldY = storyNode.rect.y + storyNode.rect.h / 2;

    // worldToScreen returns coordinates relative to the canvas/viewport.
    // Since we are appending the element to 'surface' (which contains the canvas),
    // these coordinates should be correct relative to the surface's top-left.
    // However, if the surface has padding or if the camera offset includes the panel width,
    // we need to be careful.
    // The camera.worldToScreen adds 'panel' width to x.
    // Let's check if 'surface' is the offset parent.
    
    // We need to calculate the initial positions based on the CURRENT camera state.
    // But since the element is absolutely positioned in 'surface', and 'surface'
    // is the container for the canvas, the coordinates from worldToScreen should match
    // the visual position on the canvas.
    
    // The issue might be that the animation runs over time, but the camera might move?
    // Or simply that the initial calculation is done once.
    // If the user pans/zooms WHILE the animation is playing, the HTML element won't move with the canvas.
    // To fix this perfectly, we would need to update the element's position on every frame
    // based on the camera's current transform.
    
    // For now, let's assume the camera is static during the animation or the user accepts it detaching.
    // If the user says "position changes slightly depending on initial screen view",
    // it might be due to 'panel' offset in camera or some CSS transform on the surface?
    
    // Actually, let's look at how 'surface' is styled.
    // .stage-map-surface { position: relative; ... }
    // The canvas is inside it.
    // camera.worldToScreen(x,y) returns { x: panel + (x - originX) * scale, y: ... }
    // 'panel' is the width of the side panel if any. In stageMap, panelWidth is likely 0.
    
    // Let's create a helper to update position.
    
    const el = document.createElement('div');
    el.className = 'memory-restored-anim';
    el.textContent = `기억 #${storyNumber} 복원됨`;
    Object.assign(el.style, {
      position: 'absolute',
      transform: 'translate(-50%, -50%)',
      color: '#fbbf24',
      fontWeight: 'bold',
      fontSize: '1.2rem',
      textShadow: '0 2px 4px rgba(0,0,0,0.5)',
      pointerEvents: 'none',
      zIndex: '1000',
      opacity: '0',
      whiteSpace: 'nowrap',
      transition: 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1)' // Removed top/left transition
    });

    if (surface) {
      surface.appendChild(el);
    } else {
      document.body.appendChild(el);
    }

    let startTime = null;
    const duration = 2300; // Total duration
    const moveDelay = 1500;
    const moveDuration = 800;

    function updateAnim(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      // Re-calculate positions based on current camera state to stick to the map
      const currentStartPos = camera.worldToScreen(startWorldX, startWorldY);
      const currentEndPos = camera.worldToScreen(endWorldX, endWorldY);
      
      // Initial float up
      let targetX = currentStartPos.x;
      let targetY = currentStartPos.y;
      
      if (elapsed < moveDelay) {
        // Floating up phase
        const floatProgress = Math.min(elapsed / 1000, 1);
        // Ease out for float up
        const floatOffset = 40 * (1 - Math.pow(1 - floatProgress, 3)); 
        targetY -= floatOffset;
        
        el.style.opacity = Math.min(elapsed / 200, 1); // Fade in quickly
      } else {
        // Moving to target phase
        const moveProgress = Math.min((elapsed - moveDelay) / moveDuration, 1);
        const ease = 1 - Math.pow(1 - moveProgress, 3); // Ease out cubic
        
        // Interpolate between floated start and end
        const floatedStartY = currentStartPos.y - 40;
        
        targetX = currentStartPos.x + (currentEndPos.x - currentStartPos.x) * ease;
        targetY = floatedStartY + (currentEndPos.y - floatedStartY) * ease;
        
        // Fade out and scale down at the end
        if (moveProgress > 0.5) {
             el.style.opacity = 1 - (moveProgress - 0.5) * 2;
             const scale = 1 - (moveProgress - 0.5);
             el.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }
      }

      el.style.left = `${targetX}px`;
      el.style.top = `${targetY}px`;

      if (elapsed < duration) {
        requestAnimationFrame(updateAnim);
      } else {
        el.remove();
      }
    }

    requestAnimationFrame(updateAnim);
  }

  document.addEventListener('stageMap:shown', () => {
    if (state.pendingMemoryRestored) {
      setTimeout(() => {
        runMemoryRestoredAnimation(state.pendingMemoryRestored);
        state.pendingMemoryRestored = null;
      }, 500);
    }
  });

  return {
    refresh: () => {
      refreshNodeStates();
    },
    focusLevel,
    celebrateLevel,
    triggerMemoryRestoredAnimation
  };
}
