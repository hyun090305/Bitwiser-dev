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

function drawNode(ctx, camera, node, status, t = 0) {
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
      drawNode(ctx, camera, node, status, t);
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
      unlocked = prerequisitesMet;
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
