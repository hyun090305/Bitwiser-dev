import {
  lockOrientationLandscape,
  hideStageMapScreen,
  showGameScreen,
  showStageMapScreen
} from './navigation.js';

import { createCamera } from '../canvas/camera.js';
import { drawGrid, setupCanvas } from '../canvas/renderer.js';
import { CELL } from '../canvas/model.js';
import { drawStarRow } from './achievementStars.js';
import { getActiveTheme } from '../themes.js';
import { canPlayStage, chapterAccess } from './stageCatalog.js';
import { isExtrasCard, extrasCardText, drawExtrasCard, EXTRAS_SIGNAL_DURATION } from './stageMapExtras.js';
import {
  STAGE_NODE_LEVEL_MAP,
  STAGE_TYPE_META,
  stageWorldRect,
  straightStageEdge,
  gridSizeToWorldSize,
  gridToWorldPoint
} from './stageMapLayout.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

const SPECIAL_NODE_KEY = 'stageMapSpecialClears';
const STAGE_MAP_SPEC_PATH = 'stage_map.json';
const GLOBAL_CHAPTER_ID = 'global';
const CHAPTER_FADE_NODE_OPACITY = 0.22;
const CHAPTER_FADE_EDGE_OPACITY = 0.2;
const CHAPTER_GLOBAL_NODE_OPACITY = 0.55;
const CHAPTER_GLOBAL_EDGE_OPACITY = 0.5;
const STAGE_FOCUS_VERTICAL_ANCHOR = 0.42;
// Keep scale unchanged when focusing a stage (avoid automatic zoom-out)
const STAGE_FOCUS_SCALE_FACTOR = 1.0;
const BLUEPRINT_ARCHIVE_ROOT_ID = 'user_created_stages';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutCubic = value => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    fill: '#0f2a3a',
    stroke: '#67e8f9',
    text: '#e0faff'
  },
  locked: {
    fill: '#273448',
    stroke: 'rgba(148, 163, 184, 0.5)',
    text: '#e2e8f0'
  },
  comingSoon: {
    fill: '#1e304a',
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
    color: 'rgba(3, 8, 20, 0.45)',
    blur: 10,
    offsetX: 0,
    offsetY: 3
  },
  textColor: '#e9d9ad',
  chapterLabelColor: 'rgba(214, 196, 150, 0.82)',
  textShadow: {
    color: 'rgba(0, 0, 0, 0.32)',
    offsetX: 0,
    offsetY: 1,
    blur: 2
  }
};

const RANK_TITLE_BADGES = {
  bit_solver: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#0f1728' },
        { offset: 0.45, color: '#1a2335' },
        { offset: 1, color: '#232936' }
      ]
    },
    border: { width: 1.05, color: 'rgba(196, 170, 114, 0.82)' },
    pattern: { lines: 3, alpha: 0.08 },
    accentLine: { color: 'rgba(232, 205, 140, 0.55)', y: 0.19 },
    textShadow: { color: 'rgba(0, 0, 0, 0.26)', offsetY: 1, blur: 2 }
  },
  bit_wiser: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#141b2e' },
        { offset: 0.5, color: '#2a2f3c' },
        { offset: 1, color: '#252930' }
      ]
    },
    border: { width: 1.1, color: 'rgba(121, 181, 205, 0.86)' },
    pattern: { lines: 3, alpha: 0.085 },
    accentLine: { color: 'rgba(153, 191, 238, 0.58)', y: 0.2 },
    textShadow: { color: 'rgba(0, 0, 0, 0.28)', offsetY: 1, blur: 2.2 }
  },
  bit_master: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#1b2235' },
        { offset: 0.46, color: '#37392f' },
        { offset: 1, color: '#3c3c28' }
      ]
    },
    border: { width: 1.2, color: 'rgba(240, 237, 70, 0.9)' },
    pattern: { lines: 3, alpha: 0.09 },
    accentLine: { color: 'rgba(247, 219, 159, 0.62)', y: 0.2 },
    textShadow: { color: 'rgba(0, 0, 0, 0.3)', offsetY: 1, blur: 2.3 }
  },
  control_core: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#18152b' },
        { offset: 0.48, color: '#302744' },
        { offset: 1, color: '#292138' }
      ]
    },
    border: { width: 1.1, color: 'rgba(196, 154, 225, 0.86)' },
    pattern: { lines: 3, alpha: 0.085 },
    accentLine: { color: 'rgba(216, 180, 254, 0.58)', y: 0.2 },
    textColor: '#f0e4fa',
    chapterLabelColor: 'rgba(216, 180, 254, 0.8)',
    textShadow: { color: 'rgba(0, 0, 0, 0.3)', offsetY: 1, blur: 2.2 }
  },
  system_core: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#10231f' },
        { offset: 0.48, color: '#254038' },
        { offset: 1, color: '#1c332d' }
      ]
    },
    border: { width: 1.1, color: 'rgba(110, 205, 164, 0.86)' },
    pattern: { lines: 3, alpha: 0.085 },
    accentLine: { color: 'rgba(167, 243, 208, 0.56)', y: 0.2 },
    textColor: '#e1f7ed',
    chapterLabelColor: 'rgba(167, 243, 208, 0.8)',
    textShadow: { color: 'rgba(0, 0, 0, 0.3)', offsetY: 1, blur: 2.2 }
  },
  auxiliary_core: {
    gradient: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#0b1824' },
        { offset: 0.48, color: '#123043' },
        { offset: 1, color: '#102635' }
      ]
    },
    border: { width: 1.1, color: 'rgba(103, 232, 249, 0.82)' },
    pattern: { lines: 3, alpha: 0.08 },
    accentLine: { color: 'rgba(165, 243, 252, 0.54)', y: 0.2 },
    textColor: '#dffbff',
    chapterLabelColor: 'rgba(165, 243, 252, 0.78)',
    textShadow: { color: 'rgba(0, 0, 0, 0.3)', offsetY: 1, blur: 2.2 }
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

function inferChapterIdFromNode(node) {
  if (!node) return GLOBAL_CHAPTER_ID;
  if (node.id === 'bit_solver' || node.category === 'basic_logic') return 'chapter_1';
  if (node.id === 'bit_wiser' || node.category === 'control_logic') return 'chapter_2';
  if (node.id === 'bit_master' || node.category === 'arithmetic') return 'chapter_3';
  return GLOBAL_CHAPTER_ID;
}

function normalizeChapters(spec = {}, nodes = []) {
  const explicit = Array.isArray(spec.chapters) ? spec.chapters : [];
  if (explicit.length) {
    return explicit
      .map(ch => {
        const titlePosition = ch.title?.position || ch.anchor || { x: 0, y: 0 };
        const titleSize = ch.title?.size || { w: 27, h: 3 };
        const titleOrigin = gridToWorldPoint(titlePosition);
        const titleWorldSize = gridSizeToWorldSize(titleSize);
        const titleRect = {
          x: titleOrigin.x,
          y: titleOrigin.y,
          w: titleWorldSize.width,
          h: titleWorldSize.height
        };
        return {
          numbered: ch.numbered !== false,
          subtitle: ch.subtitle,
          prerequisites: ch.prerequisites || [],
          panel: ch.panel ? { rect: stageWorldRect(ch.panel.position, ch.panel.size) } : null,
          id: ch.id,
          label: ch.label || ch.id,
          order: Number.isFinite(ch.order) ? ch.order : 0,
          anchor: ch.anchor || null,
          title: {
            position: titlePosition,
            size: titleSize,
            styleId: ch.title?.styleId || null,
            rect: titleRect,
            center: rectCenter(titleRect)
          }
        };
      })
      .filter(ch => ch.id)
      .sort((a, b) => a.order - b.order);
  }

  const hasBasic = nodes.some(node => inferChapterIdFromNode(node) === 'chapter_1');
  const hasControl = nodes.some(node => inferChapterIdFromNode(node) === 'chapter_2');
  const hasArithmetic = nodes.some(node => inferChapterIdFromNode(node) === 'chapter_3');
  const fallback = [];
  if (hasBasic) fallback.push({ id: 'chapter_1', label: 'Logic Core', order: 1, anchor: { x: 0, y: 0 } });
  if (hasControl) fallback.push({ id: 'chapter_2', label: 'Memory Link', order: 2, anchor: { x: 36, y: 0 } });
  if (hasArithmetic) fallback.push({ id: 'chapter_3', label: 'Arithmetic Unit', order: 3, anchor: { x: 72, y: 0 } });
  return fallback;
}

function buildChapterState({ spec, nodes, nodeLookup }) {
  const chapters = normalizeChapters(spec, nodes);
  const chapterLookup = new Map(chapters.map(ch => [ch.id, ch]));
  const globals = new Set(Array.isArray(spec?.globals?.nodes) ? spec.globals.nodes : []);
  const nodesByChapter = new Map();

  nodes.forEach(node => {
    let chapterId = node.chapterId;
    if (globals.has(node.id)) chapterId = GLOBAL_CHAPTER_ID;
    if (!chapterId || (!chapterLookup.has(chapterId) && chapterId !== GLOBAL_CHAPTER_ID)) {
      chapterId = chapters.length ? inferChapterIdFromNode(node) : GLOBAL_CHAPTER_ID;
    }
    if (!chapterId || (!chapterLookup.has(chapterId) && chapterId !== GLOBAL_CHAPTER_ID)) {
      chapterId = GLOBAL_CHAPTER_ID;
    }
    node.chapterId = chapterId;
    if (!nodesByChapter.has(chapterId)) nodesByChapter.set(chapterId, []);
    nodesByChapter.get(chapterId).push(node);
    if (chapterId === GLOBAL_CHAPTER_ID) globals.add(node.id);
  });

  const chapterBounds = new Map();
  chapters.forEach(chapter => {
    const chapterNodes = (nodesByChapter.get(chapter.id) || [])
      .filter(node => !node.isUserProblem);
    const chapterItems = chapter.panel ? [chapter.panel, chapter.title] : chapter.title?.rect ? [...chapterNodes, chapter.title] : chapterNodes;
    if (chapterItems.length) {
      chapterBounds.set(chapter.id, calculateBounds(chapterItems));
    }
  });

  return {
    chapters,
    chapterLookup,
    nodesByChapter,
    chapterBounds,
    globalNodeIds: globals
  };
}

function buildNode(node, nodeTypes, getLevelTitle) {
  const defaultSize = nodeTypes[node.nodeType]?.defaultSize || {};
  const size = {
    w: node.size?.w ?? defaultSize.w ?? 1,
    h: node.size?.h ?? defaultSize.h ?? 1
  };
  const rectOrigin = gridToWorldPoint(node.position);
  const rectSize = gridSizeToWorldSize(size);
  const rect = node.gridPosition || isExtrasCard(node) ? stageWorldRect(node.position, size)
    : { x: rectOrigin.x, y: rectOrigin.y, w: rectSize.width, h: rectSize.height };
  const level = node.previewFeature ? null : STAGE_NODE_LEVEL_MAP[node.id] ?? null;
  const title = node.nodeType === 'rank' ? String(node.label).toUpperCase()
    : level != null ? (getLevelTitle?.(level) ?? node.label) : node.label;
  const comingSoon = node.nodeType === 'stage' && level == null && !node.isUserProblem && !node.previewFeature;
  return {
    ...node,
    chapterId: node.chapterId || GLOBAL_CHAPTER_ID,
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
  const chapterState = buildChapterState({ spec, nodes, nodeLookup });
  const dependencies = new Map();
  nodes.forEach(n => dependencies.set(n.id, []));

  const edges = (spec?.edges || []).map((edge, index) => {
    const from = nodeLookup.get(edge.from);
    const to = nodeLookup.get(edge.to);
    if (!from || !to) return null;
    const waypoints = Array.isArray(edge.waypoints)
      ? edge.waypoints.map(pt => gridPointToWorldCenter(pt))
      : [];
    const points = edge.style === 'straight' ? straightStageEdge(from, to) : [from.center, ...waypoints, to.center];
    const deps = dependencies.get(edge.to);
    if (deps) deps.push(edge.from);
    const edgeId = edge.id ?? `${edge.from}->${edge.to}-${index}`;
    return {
      ...edge,
      id: edgeId,
      edgeType: edge.edgeType || 'progression',
      points
    };
  }).filter(Boolean);

  const titleItems = chapterState.chapters.map(chapter => chapter.title).filter(title => title?.rect);
  const bounds = calculateBounds([...nodes, ...titleItems]);
  return {
    nodes,
    edges,
    nodeLookup,
    dependencies,
    bounds,
    chapters: chapterState.chapters,
    chapterLookup: chapterState.chapterLookup,
    nodesByChapter: chapterState.nodesByChapter,
    chapterBounds: chapterState.chapterBounds,
    globalNodeIds: chapterState.globalNodeIds
  };
}

function updatePanelState(panel, isOpen, backdrop) {
  if (!panel) return;
  panel.classList.toggle('stage-panel--open', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (backdrop) {
    backdrop.hidden = !isOpen;
  }
}

function drawEdge(ctx, camera, edge, active, t = 0, highlight = null, opacity = 1) {
  if (!edge?.points?.length) return;
  const points = edge.points.map(pt => camera.worldToScreen(pt.x, pt.y));
  const scale = camera.getScale();
  const end = points.at(-1), previous = points.at(-2);
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
  const arrow = 12 * scale;
  ctx.save();
  ctx.globalAlpha = opacity * (active ? 1 : 0.8);
  ctx.strokeStyle = active ? '#86dccd' : '#7795ac';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - arrow * Math.cos(angle - 0.45), end.y - arrow * Math.sin(angle - 0.45));
  ctx.lineTo(end.x - arrow * Math.cos(angle + 0.45), end.y - arrow * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
  // A short completion highlight is local to the affected connection.
  if (active && highlight?.alpha > 0) {
    ctx.globalAlpha = opacity * highlight.alpha;
    ctx.strokeStyle = '#e2fff3';
    ctx.lineWidth = 5 * scale;
    ctx.beginPath();
    points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawRankTitleNode(ctx, camera, node, status, t = 0, isHovered = false, isPressed = false, highlight = null) {
  const spec = RANK_TITLE_BADGES[node.id];
  if (!spec || !status?.progressCleared) {
    return false;
  }
  const { scale } = camera.getState();
  const topLeft = camera.worldToScreen(node.rect.x, node.rect.y);
  const width = node.rect.w * scale;
  const height = node.rect.h * scale;
  const radius = Math.min(7 * scale, Math.min(width, height) / 6);
  const rect = { x: topLeft.x, y: topLeft.y, w: width, h: height };
  const pathBuilder = () => buildRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);

  ctx.save();

  applyScaledShadow(ctx, spec.dropShadow ?? TITLE_BADGE_BASE.dropShadow, scale);
  pathBuilder();
  const fillStyle = createFillStyle(ctx, spec.gradient, rect.x, rect.y, rect.w, rect.h) || '#facc15';
  ctx.fillStyle = fillStyle;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (spec.pattern) {
    ctx.save();
    pathBuilder();
    ctx.clip();
    const lineCount = Math.max(2, Math.min(4, spec.pattern.lines || 3));
    const alpha = spec.pattern.alpha ?? 0.08;
    ctx.strokeStyle = `rgba(255, 240, 205, ${alpha})`;
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    for (let i = 0; i < lineCount; i += 1) {
      const y = rect.y + rect.h * (0.36 + i * 0.16);
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w * 0.08, y);
      ctx.lineTo(rect.x + rect.w * 0.92, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (spec.accentLine) {
    ctx.save();
    pathBuilder();
    ctx.clip();
    const y = rect.y + rect.h * (spec.accentLine.y ?? 0.2);
    const accentGradient = ctx.createLinearGradient(rect.x, y, rect.x + rect.w, y);
    accentGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    accentGradient.addColorStop(0.2, spec.accentLine.color || 'rgba(240, 214, 156, 0.56)');
    accentGradient.addColorStop(0.8, spec.accentLine.color || 'rgba(240, 214, 156, 0.56)');
    accentGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = accentGradient;
    ctx.lineWidth = Math.max(1, 1.1 * scale);
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.06, y);
    ctx.lineTo(rect.x + rect.w * 0.94, y);
    ctx.stroke();
    ctx.restore();
  }

  if (spec.border?.width) {
    pathBuilder();
    ctx.lineWidth = Math.max(spec.border.width * scale, 0.9);
    ctx.strokeStyle = spec.border.color;
    ctx.stroke();
  }

  const isActive = Boolean(isHovered || isPressed || (highlight && (highlight.alpha ?? 0) > 0));
  if (isActive) {
    const activeAlpha = clamp(highlight?.alpha ?? 0.85, 0.2, 1);
    ctx.save();
    pathBuilder();
    ctx.lineWidth = Math.max(1.4 * scale, 1.2);
    ctx.strokeStyle = `rgba(245, 221, 170, ${0.75 * activeAlpha})`;
    ctx.shadowColor = `rgba(245, 221, 170, ${0.48 * activeAlpha})`;
    ctx.shadowBlur = 14 * Math.max(scale, 0.8);
    ctx.stroke();
    ctx.restore();
  }

  const textColor = spec.textColor || TITLE_BADGE_BASE.textColor;
  const chapterLabelColor = spec.chapterLabelColor || TITLE_BADGE_BASE.chapterLabelColor;
  const mainFontSize = rect.h * 0.31;
  const chapterFontSize = 16 * scale;

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
      const candidate = `${text.slice(0, mid)}...`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        low = mid;
        result = candidate;
      } else {
        high = mid - 1;
      }
    }
    if (ctx.measureText(result).width > maxWidth) {
      let shortened = text;
      while (shortened.length && ctx.measureText(`${shortened}...`).width > maxWidth) {
        shortened = shortened.slice(0, -1);
      }
      result = shortened + (shortened.length < text.length ? '...' : '');
    }
    return result;
  };

  const chapterNumberMatch = String(node.chapterId || '').match(/chapter_(\d+)/i);
  const chapterNumber = chapterNumberMatch ? chapterNumberMatch[1] : '';
  const chapterLabel = chapterNumber ? `CHAPTER ${chapterNumber}` : 'EXTRAS';
  const chapterText = clampText(chapterLabel, rect.w * 0.82);
  const titleText = clampText(String(node.title || '').toUpperCase(), rect.w * 0.88);
  const chapterY = rect.y + rect.h * 0.2;
  const titleY = rect.y + rect.h * 0.5;

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = chapterLabelColor;
  ctx.font = `600 ${chapterFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  ctx.fillText(chapterText, rect.x + rect.w / 2, chapterY);

  ctx.globalAlpha = 1;
  ctx.fillStyle = textColor;
  ctx.font = `900 ${mainFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  ctx.fillText(titleText, rect.x + rect.w / 2, titleY);

  ctx.font = `500 ${16 * scale}px 'Noto Sans KR', sans-serif`;
  ctx.fillStyle = chapterLabelColor;
  ctx.fillText(clampText(node.subtitle || '', rect.w * 0.94), rect.x + rect.w / 2, rect.y + rect.h * 0.8);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  ctx.restore();
  return true;
}

function drawNode(ctx, camera, node, status, t = 0, isHovered = false, isPressed = false, highlight = null) {
  if (node.nodeType === 'rank' && RANK_TITLE_BADGES[node.id]) {
    const handled = drawRankTitleNode(ctx, camera, node, status, t, isHovered, isPressed, highlight);
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
      ? (node.comingSoon ? NODE_STYLE.comingSoon : NODE_STYLE.locked)
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
  // Theme fills may be translucent; keep the card face opaque over the grid.
  drawRounded();
  ctx.fillStyle = '#152234';
  ctx.fill();

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
      ctx.fillStyle = '#fff6e1';
      ctx.fill();

      // Clear direct shadow before radial glow.
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
    gradient.addColorStop(1, status.locked ? '#35435a' : baseStyle.stroke);
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
  
  let fontSize = (node.gridPosition ? 25 : 18) * scale;
  if (node.id === 'lab' || node.id === 'user_created_stages') {
    fontSize = 22 * scale;
  }
  if (node.isUserProblem) {
    fontSize = 16 * scale;
  }

  ctx.font = `700 ${fontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const paddingX = (node.gridPosition ? 14 : 12) * scale;
  const paddingY = 10 * scale;
  let textX = topLeft.x + paddingX;
  let textY = topLeft.y + paddingY + (12 * scale);

  const isCenteredNode = Boolean(node.gridPosition) || node.id === 'lab'
    || node.id === 'user_created_stages';

  if (isCenteredNode) {
    ctx.textAlign = 'center';
    textX = topLeft.x + width / 2;
    textY = topLeft.y + height / 2;
  }
  if (node.isUserProblem) {
    textY = topLeft.y + paddingY + 7 * scale;
  }
  if (node.gridPosition) {
    ctx.font = `600 ${16 * scale}px 'Noto Sans KR', sans-serif`;
    if (node.optional) {
      ctx.textAlign = 'right';
      ctx.fillText(window.currentLang === 'ko' ? '선택' : 'Optional', topLeft.x + width - paddingX, topLeft.y + 26 * scale);
    }
    ctx.textAlign = 'center';
    textY = topLeft.y + height * 0.46;
    ctx.font = `700 ${fontSize}px 'Noto Sans KR', sans-serif`;
  }

  const maxTextWidth = Math.max(8, width - paddingX * 2);
  
  function wrapText(text) {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxTextWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  const cardTitle = node.id === 'automatic_door' && window.currentLang === 'ko' ? '자동문' : node.title;
  let titleLines = wrapText(cardTitle);
  if (node.gridPosition) {
    while ((titleLines.length > 2 || titleLines.some(line => ctx.measureText(line).width > maxTextWidth)) && fontSize > 21 * scale) {
      fontSize -= scale;
      ctx.font = `700 ${fontSize}px 'Noto Sans KR', sans-serif`;
      titleLines = wrapText(cardTitle);
    }
  }
  const lineHeight = fontSize * 1.2;
  const displayTitleLines = node.isUserProblem ? titleLines.slice(0, 1) : node.gridPosition ? titleLines.slice(0, 2) : titleLines;

  if (isCenteredNode) {
    textY -= (displayTitleLines.length - 1) * lineHeight / 2;
  }

  displayTitleLines.forEach((line, i) => {
    ctx.fillText(line, textX, textY + i * lineHeight);
  });

  if (!isCenteredNode) {
    textY += (displayTitleLines.length - 1) * lineHeight;
  }

  ctx.font = `500 ${12 * scale}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  textY += 18 * scale;

  const chapterText = ''; // Chapter text is hidden now
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

  if (node.isUserProblem) {
    const meta = node.archiveMeta || {};
    const difficultyValue = Math.max(0, Math.min(5, Number(meta.difficulty || 0)));
    const starText = difficultyValue > 0 ? '★'.repeat(difficultyValue) : '-';
    const solvedCount = Number(meta.solvedCount || 0);
    const date = meta.timestampValue ? new Date(meta.timestampValue) : null;
    const dateText = date
      ? `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
      : '--.--';
    const metaFontSize = Math.max(13 * scale, 10);
    const metaMaxWidth = width - paddingX * 2 - 6 * scale;
    const fitText = (text) => {
      if (ctx.measureText(text).width <= metaMaxWidth) return text;
      let fitted = text;
      while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > metaMaxWidth) {
        fitted = fitted.slice(0, -1);
      }
      return `${fitted}…`;
    };
    ctx.save();
    ctx.font = `700 ${metaFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const panelX = topLeft.x + paddingX - 4 * scale;
    const panelY = topLeft.y + height - paddingY - 48 * scale;
    const panelW = width - paddingX * 2 + 8 * scale;
    const panelH = 45 * scale;
    buildRoundedRectPath(ctx, panelX, panelY, panelW, panelH, 7 * scale);
    const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    panelGradient.addColorStop(0, 'rgba(8, 47, 73, 0.66)');
    panelGradient.addColorStop(1, 'rgba(15, 76, 99, 0.46)');
    ctx.fillStyle = panelGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.28)';
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(panelX + 8 * scale, panelY + 23 * scale);
    ctx.lineTo(panelX + panelW - 8 * scale, panelY + 23 * scale);
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.18)';
    ctx.lineWidth = Math.max(0.7, 0.7 * scale);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(panelX + panelW / 2, panelY + 27 * scale);
    ctx.lineTo(panelX + panelW / 2, panelY + panelH - 7 * scale);
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.16)';
    ctx.stroke();

    const labelFontSize = Math.max(8.5 * scale, 7);
    const valueFontSize = Math.max(12 * scale, 9.5);
    const starFontSize = Math.max(16 * scale, 12);
    const leftX = topLeft.x + paddingX;
    const rightEdge = panelX + panelW - 10 * scale;
    const centerDividerX = panelX + panelW / 2;
    const labelColor = 'rgba(186, 230, 253, 0.72)';
    ctx.font = `700 ${labelFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.fillText('난이도', leftX, panelY + 11 * scale);
    ctx.font = `800 ${starFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'right';
    ctx.fillText(starText, rightEdge, panelY + 11.5 * scale);

    const columnY = panelY + 34 * scale;
    ctx.textAlign = 'left';
    ctx.font = `700 ${labelFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.fillText('해결', leftX, columnY);
    ctx.font = `800 ${metaFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = '#ecfeff';
    ctx.fillText(String(solvedCount), leftX + 31 * scale, columnY);

    const rightX = centerDividerX + 9 * scale;
    ctx.font = `700 ${labelFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.fillText('날짜', rightX, columnY);
    ctx.font = `800 ${metaFontSize}px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(207, 250, 254, 0.92)';
    ctx.textAlign = 'right';
    ctx.fillText(dateText, rightEdge, columnY);
    ctx.restore();
  }

  if (node.gridPosition) {
    ctx.font = `600 ${16 * scale}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = titleColor;
    const ko = window.currentLang === 'ko';
    const stateLabel = node.previewFeature ? (ko ? '정식판' : 'Full version')
      : node.comingSoon ? (ko ? '예정' : 'Coming soon')
      : status.locked ? (ko ? '잠김' : 'Locked')
      : status.progressCleared ? ''
      : (ko ? '플레이 가능' : 'Ready');
    ctx.fillText(stateLabel, topLeft.x + width / 2, topLeft.y + height - 42 * scale);
    if (!stateLabel && status.progressCleared && node.level !== 0) {
      drawStarRow(ctx, topLeft.x + width / 2, topLeft.y + height - 42 * scale, Math.max(1, status.stars || 1), { size: 32 * scale, gap: 4 * scale });
    }
  } else if (node.previewFeature) {
    ctx.font = `700 ${10 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a5d8e8';
    ctx.fillText('FULL VERSION', topLeft.x + width / 2, topLeft.y + height - 12 * scale);
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
  if (node?.previewFeature && status) return true;
  if (!node || !status || status.locked || node.comingSoon) {
    return false;
  }
  if (node.nodeType === 'stage') {
    return node.level != null || node.isUserProblem;
  }
  return node.nodeType === 'mode'
    || node.nodeType === 'feature';
}

function injectUserProblems(spec, userProblems = []) {
  if (!Array.isArray(userProblems) || userProblems.length === 0) return;
  const root = spec.nodes.find(node => node.id === BLUEPRINT_ARCHIVE_ROOT_ID);
  if (!root?.position || !root?.size) return;

  const nodeSize = 3;
  const problemNodeSize = { w: 3, h: 3 };
  const collides = (position, placed) => placed.some(node => (
    position.x < node.position.x + node.size.w + 2
    && position.x + problemNodeSize.w + 2 > node.position.x
    && position.y < node.position.y + node.size.h + 2
    && position.y + problemNodeSize.h + 2 > node.position.y
  ));
  const adjacentPosition = (parent, direction) => {
    const parentSize = parent.size || { w: nodeSize, h: nodeSize };
    if (direction.x > 0) {
      return {
        x: parent.position.x + parentSize.w + 2,
        y: Math.round(parent.position.y + (parentSize.h - problemNodeSize.h) / 2)
      };
    }
    if (direction.x < 0) {
      return {
        x: parent.position.x - problemNodeSize.w - 2,
        y: Math.round(parent.position.y + (parentSize.h - problemNodeSize.h) / 2)
      };
    }
    return {
      x: Math.round(parent.position.x + (parentSize.w - problemNodeSize.w) / 2),
      y: parent.position.y + parentSize.h + 2
    };
  };
  const directionsForParent = parent => parent.id === root.id
    ? [{ x: 0, y: 1 }]
    : [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];

  const sortedProblems = [...userProblems].sort((a, b) => {
    const titleCompare = String(a?.title || '').localeCompare(String(b?.title || ''));
    if (titleCompare !== 0) return titleCompare;
    return String(a?.key || '').localeCompare(String(b?.key || ''));
  });

  spec.edges = spec.edges || [];
  const placed = [{
    id: root.id,
    position: { ...root.position },
    size: { ...root.size }
  }];

  sortedProblems.forEach((problem, index) => {
    if (!problem?.key) return;
    const random = createSeededRandom(hashString(`${problem.key}:${problem.title}:${index}`));
    let parent = placed[Math.floor(random() * placed.length)] || placed[0];
    let pos = null;

    for (let attempt = 0; attempt < 80 && !pos; attempt += 1) {
      if (attempt > 0 && attempt % 12 === 0) {
        parent = placed[Math.floor(random() * placed.length)] || placed[0];
      }
      const directions = directionsForParent(parent)
        .sort(() => random() - 0.5);
      for (const direction of directions) {
        const candidate = adjacentPosition(parent, direction);
        if (!collides(candidate, placed)) {
          pos = candidate;
          break;
        }
      }
    }

    if (!pos) {
      for (const fallbackParent of placed) {
        for (const direction of directionsForParent(fallbackParent)) {
          const candidate = adjacentPosition(fallbackParent, direction);
          if (!collides(candidate, placed)) {
            parent = fallbackParent;
            pos = candidate;
            break;
          }
        }
        if (pos) break;
      }
    }

    if (!pos) {
      parent = placed[placed.length - 1] || placed[0];
      pos = adjacentPosition(parent, { x: 0, y: 1 });
    }

    const nodeId = `user_problem_${problem.key}`;
    const childNode = {
      id: nodeId,
      label: problem.title || problem.key,
      nodeType: 'stage',
      category: 'user',
      chapterId: root.chapterId || GLOBAL_CHAPTER_ID,
      position: pos,
      size: { ...problemNodeSize },
      isUserProblem: true,
      problemKey: problem.key,
      solvedByMe: Boolean(problem.solvedByMe),
      archiveVisible: true,
      archiveMeta: {
        key: problem.key,
        title: problem.title || problem.key,
        creator: problem.creator || '',
        difficulty: Number.parseInt(problem.difficulty, 10) || 0,
        solvedCount: Number.parseInt(problem.solvedCount, 10) || 0,
        timestampValue: Number.parseInt(problem.timestampValue, 10) || 0
      }
    };
    spec.nodes.push(childNode);
    placed.push(childNode);
    spec.edges.push({
      from: parent.id,
      to: nodeId,
      style: 'orthogonal',
      edgeType: 'blueprint'
    });
  });
}

export function initializeStageMap({
  getLevelTitle,
  isLevelUnlocked,
  getClearedLevels,
  startLevel,
  returnToEditScreen,
  mapSpec = null,
  onlineFeatures = true,
  getStageStars = null,
  onFeatureLocked = null,
  getStageAccess = () => ({})
} = {}) {
  const screenEl = document.getElementById('stageMapScreen');
  const canvas = document.getElementById('stageMapCanvas');
  const zoomResetBtn = document.getElementById('stageMapZoomReset');
  const chapterPrevBtn = document.getElementById('stageMapChapterPrev');
  const chapterNextBtn = document.getElementById('stageMapChapterNext');
  const chapterLabelEl = document.getElementById('stageMapChapterLabel');
  const chapterNavEl = document.querySelector('.stage-map-chapter-nav');
  const blueprintToolsEl = document.getElementById('blueprintArchiveTools');
  const blueprintSearchInput = document.getElementById('blueprintArchiveSearch');
  const blueprintSortSelect = document.getElementById('blueprintArchiveSort');
  const blueprintSortDirectionSelect = document.getElementById('blueprintArchiveSortDirection');
  const blueprintDifficultySelect = document.getElementById('blueprintArchiveDifficulty');
  const blueprintSolvedMinInput = document.getElementById('blueprintArchiveSolvedMin');
  const blueprintShowSolvedBtn = document.getElementById('blueprintArchiveShowSolved');
  const blueprintShowUnsolvedBtn = document.getElementById('blueprintArchiveShowUnsolved');
  const infoToggleBtn = document.getElementById('stageMapInfoToggleBtn');
  const surface = document.getElementById('stageMapSurface');
  const stageMapInfoEl = surface?.querySelector('.stage-map-info') || null;
  const panels = Array.from(document.querySelectorAll('.stage-panel'));
  const panelButtons = document.querySelectorAll('[data-panel-target]');
  const panelButtonByPanel = new Map();
  const panelBackdrop = document.getElementById('stagePanelBackdrop');

  if (!screenEl || !canvas || !surface) {
    return null;
  }

  canvas.style.cursor = 'default';
  // The map accepts card taps, but native scroll/zoom gestures cannot move it.
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
    activePointers: new Set(),
    specialClears: onlineFeatures ? loadSpecialNodeClears() : new Set(),
    mapBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    hoverNode: null,
    focusedExtraId: null,
    extraSignalStarts: new Map(),
    pressedNode: null,
    dragging: false,
    edgesBySource: new Map(),
    chapters: [],
    chapterLookup: new Map(),
    chapterStatus: new Map(),
    nodesByChapter: new Map(),
    chapterBounds: new Map(),
    globalNodeIds: new Set(),
    currentChapterId: null,
    pointerWorld: null,
    pointerType: null,
    focusHighlight: null,
    edgeHighlights: new Map(),
    pendingFocus: null,
    cameraAnimation: null,
    archiveMode: {
      active: false,
      previousChapterId: null,
      query: '',
      sort: 'name',
      sortDirection: 'asc',
      difficulty: 'all',
      solvedMin: 0,
      showSolved: true,
      showUnsolved: true
    },
    transition: {
      active: false,
      startTime: 0,
      targetNode: null,
      uiTriggered: false,
      startCamera: null,
      returnCamera: null
    }
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

    // Compute expected internal pixel buffer size (CSS size 횞 DPR).
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

  function startLabTransition(node) {
    state.transition.active = true;
    state.transition.startTime = performance.now();
    state.transition.targetNode = node;
    state.transition.uiTriggered = false;
    state.transition.startCamera = { ...camera.getState() };
    state.transition.returnCamera = { ...camera.getState() };
    requestRender();
  }

  function updateTransition(now) {
    const elapsed = now - state.transition.startTime;

    // Phase C: Grid Expansion (280-650ms)
    if (elapsed >= 280 && elapsed < 650) {
      const progress = (elapsed - 280) / (650 - 280);
      const ease = easeOutCubic(progress);

      const startScale = state.transition.startCamera.scale;
      const startOriginX = state.transition.startCamera.originX;
      const startOriginY = state.transition.startCamera.originY;

      // Target state: Minimal movement. Just zoom to 1.0 (Lab default).
      // We keep the origin the same (no panning) to avoid "flying" across the map.
      const targetScale = 1.0;
      const targetOriginX = startOriginX;
      const targetOriginY = startOriginY;

      const currentScale = startScale + (targetScale - startScale) * ease;
      const currentOriginX = startOriginX + (targetOriginX - startOriginX) * ease;
      const currentOriginY = startOriginY + (targetOriginY - startOriginY) * ease;
      
      camera.setScale(currentScale);
      
      // Force camera to the interpolated position
      const { originX, originY } = camera.getState();
      const dx = -(currentOriginX - originX) * currentScale;
      const dy = -(currentOriginY - originY) * currentScale;
      
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        camera.pan(dx, dy);
      }
    }

    // Phase D: Lab UI Materialize (650ms+)
    if (elapsed >= 650 && !state.transition.uiTriggered) {
      state.transition.uiTriggered = true;
      
      // Calculate Lab Mode camera state to match current visual
      const { originX, originY, scale } = camera.getState();
      // Lab Mode has panelWidth=220. Stage Map has panelWidth=0.
      // To align grids: OriginX_Lab = OriginX_Stage + 220/Scale
      const labOriginX = originX + 220 / scale;

      if (onlineFeatures) import('./labMode.js').then(({ openLabModeFromShortcut }) => openLabModeFromShortcut({
        camera: {
          scale: scale,
          originX: labOriginX,
          originY: originY
        }
      }));
    }

    if (elapsed >= 800) {
      state.transition.active = false;
      state.transition.targetNode = null;
    }
  }

  function getChapterStageBounds(chapterId) {
    if (!chapterId) return null;
    const stageNodes = state.nodes.filter(node => (
      node.chapterId === chapterId
      && !node.isUserProblem
      && (node.nodeType === 'stage' || node.nodeType === 'mode' || node.nodeType === 'feature')
    ));
    if (!stageNodes.length) return null;
    return calculateBounds(stageNodes);
  }

  function drawChapterCircuitFrame(ctx, camera, chapter) {
    if (!chapter.panel?.rect || chapter.id === 'extras') return;
    const rect = chapter.panel.rect;
    const pos = camera.worldToScreen(rect.x, rect.y), scale = camera.getScale();
    ctx.save();
    ctx.globalAlpha = state.currentChapterId === chapter.id ? 0.3 : 0.1;
    ctx.strokeStyle = RANK_TITLE_BADGES[chapter.title.styleId]?.border?.color || '#7795ac';
    ctx.lineWidth = scale;
    buildRoundedRectPath(ctx, pos.x, pos.y, rect.w * scale, rect.h * scale, 8 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function drawChapterCircuitFrames(ctx, camera) {
    if (state.archiveMode.active) return;
    (state.chapters || []).forEach(chapter => drawChapterCircuitFrame(ctx, camera, chapter));
  }

  function drawChapterTitles(ctx, camera, timestamp) {
    if (state.archiveMode.active) return;
    (state.chapters || []).forEach(chapter => {
      if (!chapter.title?.rect) return;
      const status = state.chapterStatus.get(chapter.id) || { locked: true, progressCleared: false };
      const presentation = {
        id: chapter.title.styleId,
        nodeType: 'rank',
        chapterId: chapter.id,
        title: chapter.label,
        subtitle: chapter.subtitle?.[window.currentLang === 'ko' ? 'ko' : 'en'] || '',
        rect: chapter.title.rect
      };
      const opacity = !state.currentChapterId || state.currentChapterId === chapter.id
        ? 1 : CHAPTER_FADE_NODE_OPACITY;
      ctx.globalAlpha = opacity * (status.locked ? 0.5 : 1);
      drawNode(ctx, camera, presentation, {
        ...status,
        locked: false,
        progressCleared: true
      }, timestamp, false, false, null);
      ctx.globalAlpha = 1;
    });
  }

  // Continuous render loop so wire animation flows smoothly.
  let _raf = null;
  let _lastVisible = true;
  function renderFrame(t) {
    if (!ctx) return;
    const timestamp = typeof t === 'number' ? t : performance.now();
    ensureCanvasInitialized();

    if (state.transition.active) {
      updateTransition(timestamp);
    }

    updateCameraAnimation(timestamp);

    const defaultGridStyle = {
      background: 'rgba(15, 23, 42, 0.96)',
      gridFillA: 'rgba(226, 232, 240, 0.008)',
      gridFillB: 'rgba(148, 163, 184, 0.014)',
      gridStroke: 'rgba(148, 163, 184, 0.12)'
    };

    let gridStyle = defaultGridStyle;

    if (state.transition.returningFromLab) {
      const elapsed = timestamp - state.transition.startTime;
      const duration = 600;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        const ease = easeOutCubic(progress);
        
        // Lab Theme Colors (Light)
        const labGridStyle = {
          background: '#ffffff',
          gridFillA: '#ffffff',
          gridFillB: '#eef2ff',
          gridStroke: '#ddd'
        };

        gridStyle = {
          background: lerpColor(labGridStyle.background, defaultGridStyle.background, ease),
          gridFillA: lerpColor(labGridStyle.gridFillA, defaultGridStyle.gridFillA, ease),
          gridFillB: lerpColor(labGridStyle.gridFillB, defaultGridStyle.gridFillB, ease),
          gridStroke: lerpColor(labGridStyle.gridStroke, defaultGridStyle.gridStroke, ease)
        };
      } else {
        state.transition.returningFromLab = false;
      }
    } else if (state.transition.active) {
      const elapsed = timestamp - state.transition.startTime;
      // Phase C: Grid Expansion (280-650ms)
      if (elapsed >= 280) {
        const progress = Math.min(1, (elapsed - 280) / (650 - 280));
        const ease = easeOutCubic(progress);
        const theme = getActiveTheme();
        const targetGrid = theme?.grid || {};
        
        gridStyle = {
          background: lerpColor(defaultGridStyle.background, targetGrid.background || '#ffffff', ease),
          gridFillA: lerpColor(defaultGridStyle.gridFillA, targetGrid.gridFillA || '#ffffff', ease),
          gridFillB: lerpColor(defaultGridStyle.gridFillB, targetGrid.gridFillB || '#eef2ff', ease),
          gridStroke: lerpColor(defaultGridStyle.gridStroke, targetGrid.gridStroke || '#ddd', ease)
        };
      }
    }

    drawGrid(ctx, 1, 1, 0, camera, {
      unbounded: true,
      ...gridStyle
    });

    if (state.pointerWorld && state.pointerType !== 'touch') {
      const pointerScreen = camera.worldToScreen(state.pointerWorld.x, state.pointerWorld.y);
      ctx.save();
      const gaussianRadius = 360;
      const gaussian = ctx.createRadialGradient(
        pointerScreen.x,
        pointerScreen.y,
        0,
        pointerScreen.x,
        pointerScreen.y,
        gaussianRadius
      );
      // Multi-stop falloff approximates gaussian distribution without a hard edge.
      gaussian.addColorStop(0, 'rgba(248, 250, 252, 0.11)');
      gaussian.addColorStop(0.12, 'rgba(241, 245, 249, 0.09)');
      gaussian.addColorStop(0.3, 'rgba(226, 232, 240, 0.06)');
      gaussian.addColorStop(0.55, 'rgba(203, 213, 225, 0.03)');
      gaussian.addColorStop(0.78, 'rgba(148, 163, 184, 0.012)');
      gaussian.addColorStop(1, 'rgba(148, 163, 184, 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gaussian;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    state.edges.forEach(edge => {
      const fromStatus = state.nodeStatus.get(edge.from);
      // All routes render their base wire; only cleared sources carry pulses.
      const isUserEdge = state.archiveMode.active && edge.edgeType === 'blueprint';
                         
      const active = Boolean(fromStatus?.progressCleared || isUserEdge);
      let highlight = resolveEdgeHighlight(edge.id, timestamp);

      let edgeAlpha = resolveEdgeOpacity(edge);
      if (edgeAlpha <= 0) return;
      if (state.transition.active) {
        const elapsed = timestamp - state.transition.startTime;
        const isTargetSource = state.transition.targetNode && edge.from === state.transition.targetNode.id;
        
        if (isTargetSource && elapsed < 280) {
          // Strong flow for target edges
          highlight = { progress: (elapsed / 280), alpha: 1 };
        } else if (elapsed >= 120 && !isTargetSource) {
          // Fade out others
          edgeAlpha *= 0.15;
        }
      }

      drawEdge(ctx, camera, edge, active, timestamp, highlight, edgeAlpha);
      ctx.globalAlpha = 1;
    });

    drawChapterCircuitFrames(ctx, camera);
    drawChapterTitles(ctx, camera, timestamp);

    state.nodes.forEach(node => {
      const status = state.nodeStatus.get(node.id) || { locked: false, progressCleared: false };
      const isHovered = Boolean(state.hoverNode?.id === node.id || state.focusedExtraId === node.id
        || (!isExtrasCard(node) && state.selectedNodeId === node.id));
      const isPressed = Boolean(state.pressedNode && state.pressedNode.id === node.id);
      let highlight = resolveNodeHighlight(node.id, timestamp);

      let nodeAlpha = resolveNodeOpacity(node);
      if (nodeAlpha <= 0) return;
      if (state.transition.active) {
        const elapsed = timestamp - state.transition.startTime;
        const isTarget = state.transition.targetNode && node.id === state.transition.targetNode.id;

        if (isTarget && elapsed < 120) {
          // Pulse target
          highlight = { pulse: 1.0 + 0.1 * Math.sin((elapsed / 120) * Math.PI) };
        } else if (elapsed >= 120 && !isTarget) {
          // Fade out others
          nodeAlpha *= 0.15;
        }
      }

      ctx.globalAlpha = nodeAlpha;
      if (isExtrasCard(node)) {
        const signalStart = state.extraSignalStarts.get(node.id);
        const signalProgress = signalStart == null ? null : (timestamp - signalStart) / EXTRAS_SIGNAL_DURATION;
        if (signalProgress >= 1) state.extraSignalStarts.delete(node.id);
        drawExtrasCard(ctx, camera, node, status, { active: isHovered, pressed: isPressed, signalProgress, language: window.currentLang });
      } else {
        drawNode(ctx, camera, node, status, timestamp, isHovered, isPressed, highlight);
      }
      ctx.globalAlpha = 1;
    });
    syncExtrasControls();

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
    if (node.previewFeature) {
      const result = { unlocked: false, locked: true, displayCleared: false, progressCleared: false, stars: null };
      memo.set(node.id, result);
      return result;
    }
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
      displayCleared = clearedLevels.has(node.level);
      unlocked = typeof isLevelUnlocked === 'function'
        ? Boolean(isLevelUnlocked(node.level)) : canPlayStage(node.level, [...clearedLevels]);
      locked = !unlocked;
      progressCleared = displayCleared;
    } else if (node.nodeType === 'mode') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = state.specialClears.has(node.id);
      progressCleared = displayCleared;
    } else if (node.nodeType === 'feature') {
      unlocked = prerequisitesMet;
      locked = !unlocked;
      displayCleared = false;
      progressCleared = unlocked;
    } else if (node.comingSoon) {
      unlocked = false;
      locked = true;
      displayCleared = false;
      progressCleared = false;
    }

    // Force unlock for the blueprint archive gateway and legacy user problem nodes.
    if (node.id === 'user_created_stages' || node.isUserProblem) {
      unlocked = true;
      locked = false;
      if (node.isUserProblem && node.solvedByMe) {
        displayCleared = true;
        progressCleared = true;
      }
    }

    const result = { unlocked, locked, displayCleared, progressCleared,
      stars: getStageStars && node.level != null ? getStageStars(node.level) : null };
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
    state.chapterStatus.clear();
    state.chapters.forEach(chapter => {
      const entry = chapterAccess(chapter.id, [...cleared], getStageAccess());
      const unlocked = chapter.numbered ? entry.unlocked : true;
      state.chapterStatus.set(chapter.id, {
        ...entry, unlocked,
        locked: !unlocked,
        displayCleared: unlocked,
        progressCleared: unlocked
      });
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
    refreshChapterNav();
    requestRender();
  }

  function attachGraph(graph) {
    state.nodes = graph.nodes;
    state.edges = graph.edges;
    state.nodeLookup = graph.nodeLookup;
    state.dependencies = graph.dependencies;
    state.chapters = Array.isArray(graph.chapters) ? graph.chapters : [];
    state.chapterLookup = graph.chapterLookup || new Map();
    state.nodesByChapter = graph.nodesByChapter || new Map();
    state.chapterBounds = graph.chapterBounds || new Map();
    state.globalNodeIds = graph.globalNodeIds || new Set();
    state.currentChapterId = state.chapterLookup.has('chapter_1') ? 'chapter_1' : state.chapters[0]?.id || null;
    state.mapBounds = graph.bounds;
    state.focusHighlight = null;
    state.edgeHighlights = new Map();
    rebuildEdgesBySource();
    clearHoverNode();
    clearPressedNode();
    refreshChapterNav();
    refreshNodeStates();
    applyBlueprintArchiveFilters();
    if (state.pendingFocus) {
      const pending = state.pendingFocus;
      state.pendingFocus = null;
      focusLevel(pending.level, pending.options);
    }
    // Defer centering until the next animation frame so that the
    // canvas and layout have settled (prevents tiny bounding rects
    // when the stage map is being shown/animated). This avoids the
    // intermittent "minimized 2횞2" appearance caused by centering
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
        
        const chapterOne = state.chapterLookup.get('chapter_1');
        const bitSolverNode = state.nodes.find(n => n.id === 'bit_solver');
        const targetChapterId = chapterOne?.id || bitSolverNode?.chapterId || state.chapters[0]?.id || null;

        if (targetChapterId) {
          focusChapter(targetChapterId, { animate: false });
        } else {
          centerMap();
        }
        requestRender();
      });
    } else {
      ensureCanvasInitialized();
      const chapterOne = state.chapterLookup.get('chapter_1');
      const bitSolverNode = state.nodes.find(n => n.id === 'bit_solver');
      const targetChapterId = chapterOne?.id || bitSolverNode?.chapterId || state.chapters[0]?.id || null;

      if (targetChapterId) {
        focusChapter(targetChapterId, { animate: false });
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
    // Keep the stage-map camera fixed. Do not change scale or pan when
    // focusing a node. Only trigger visual celebration/highlight when
    // requested.
    executeNextFrame(() => {
      ensureCanvasInitialized();
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
    const targetChapterId = node.chapterId;
    if (targetChapterId && state.currentChapterId && targetChapterId !== state.currentChapterId) {
      focusChapter(targetChapterId, { animate: opts.animate });
      executeNextFrame(() => {
        setTimeout(() => focusNode(node, { ...opts, animate: false }), 180);
      });
      return;
    }
    if (targetChapterId && !state.currentChapterId) {
      setCurrentChapter(targetChapterId);
      refreshChapterNav();
    }
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

  function isGlobalNode(node) {
    if (!node) return false;
    return node.chapterId === GLOBAL_CHAPTER_ID || state.globalNodeIds.has(node.id);
  }

  function isCurrentChapterNode(node) {
    if (!node) return false;
    if (!state.currentChapterId) return true;
    return node.chapterId === state.currentChapterId;
  }

  function isBlueprintArchiveNode(node) {
    return Boolean(node && (node.id === BLUEPRINT_ARCHIVE_ROOT_ID || node.isUserProblem));
  }

  function isNodeVisibleInCurrentMode(node) {
    if (!state.archiveMode.active) {
      return !node?.isUserProblem;
    }
    return node?.id === BLUEPRINT_ARCHIVE_ROOT_ID
      || (node?.isUserProblem && node.archiveVisible);
  }

  function resolveNodeOpacity(node) {
    if (!isNodeVisibleInCurrentMode(node)) return 0;
    if (state.archiveMode.active) return 1;
    if (!state.currentChapterId) return 1;
    if (isCurrentChapterNode(node)) return 1;
    if (isGlobalNode(node)) return CHAPTER_GLOBAL_NODE_OPACITY;
    return CHAPTER_FADE_NODE_OPACITY;
  }

  function resolveEdgeOpacity(edge) {
    const fromNode = state.nodeLookup.get(edge.from);
    const toNode = state.nodeLookup.get(edge.to);
    if (state.archiveMode.active) {
      return isNodeVisibleInCurrentMode(fromNode) && isNodeVisibleInCurrentMode(toNode) ? 1 : 0;
    }
    if (fromNode?.isUserProblem || toNode?.isUserProblem) return 0;
    if (!state.currentChapterId) return 1;
    const fromGlobal = isGlobalNode(fromNode);
    const toGlobal = isGlobalNode(toNode);
    if (fromGlobal || toGlobal) return CHAPTER_GLOBAL_EDGE_OPACITY;
    if (fromNode?.chapterId === state.currentChapterId && toNode?.chapterId === state.currentChapterId) {
      return 1;
    }
    return CHAPTER_FADE_EDGE_OPACITY;
  }

  function updateNodeGridGeometry(node, position) {
    if (!node || !position) return;
    node.position = { x: position.x, y: position.y };
    const rectOrigin = gridToWorldPoint(node.position);
    const rectSize = gridSizeToWorldSize(node.size || { w: 3, h: 3 });
    node.rect = { x: rectOrigin.x, y: rectOrigin.y, w: rectSize.width, h: rectSize.height };
    node.center = rectCenter(node.rect);
  }

  function rebuildEdgesBySource() {
    state.edgesBySource = new Map();
    state.edges.forEach(edge => {
      if (!state.edgesBySource.has(edge.from)) {
        state.edgesBySource.set(edge.from, []);
      }
      state.edgesBySource.get(edge.from).push(edge);
    });
  }

  function getArchiveAdjacentPosition(parent, direction) {
    const nodeSize = 3;
    const problemNodeSize = { w: 3, h: 3 };
    const parentSize = parent.size || { w: nodeSize, h: nodeSize };
    if (direction.x > 0) {
      return {
        x: parent.position.x + parentSize.w + 2,
        y: Math.round(parent.position.y + (parentSize.h - problemNodeSize.h) / 2)
      };
    }
    if (direction.x < 0) {
      return {
        x: parent.position.x - problemNodeSize.w - 2,
        y: Math.round(parent.position.y + (parentSize.h - problemNodeSize.h) / 2)
      };
    }
    return {
      x: Math.round(parent.position.x + (parentSize.w - problemNodeSize.w) / 2),
      y: parent.position.y + parentSize.h + 2
    };
  }

  function getArchiveDirectionsForParent(parent) {
    return parent?.id === BLUEPRINT_ARCHIVE_ROOT_ID
      ? [{ x: 0, y: 1 }]
      : [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  }

  function isArchivePositionBlocked(position, placed) {
    const problemNodeSize = { w: 3, h: 3 };
    return placed.some(node => (
      position.x < node.position.x + node.size.w + 2
      && position.x + problemNodeSize.w + 2 > node.position.x
      && position.y < node.position.y + node.size.h + 2
      && position.y + problemNodeSize.h + 2 > node.position.y
    ));
  }

  function sortArchiveNodes(nodes) {
    const sort = state.archiveMode.sort || 'name';
    const direction = state.archiveMode.sortDirection === 'desc' ? -1 : 1;
    const byName = (a, b) => String(a.archiveMeta?.title || a.title || '')
      .localeCompare(String(b.archiveMeta?.title || b.title || ''));
    const sorted = [...nodes].sort((a, b) => {
      if (sort === 'date') {
        const diff = (a.archiveMeta?.timestampValue || 0) - (b.archiveMeta?.timestampValue || 0);
        return diff || byName(a, b);
      }
      if (sort === 'difficulty') {
        const diff = (a.archiveMeta?.difficulty || 0) - (b.archiveMeta?.difficulty || 0);
        return diff || byName(a, b);
      }
      if (sort === 'solved') {
        const diff = (a.archiveMeta?.solvedCount || 0) - (b.archiveMeta?.solvedCount || 0);
        return diff || byName(a, b);
      }
      return byName(a, b);
    });
    return direction === -1 ? sorted.reverse() : sorted;
  }

  function matchesArchiveFilter(node) {
    if (!node?.isUserProblem) return false;
    const meta = node.archiveMeta || {};
    const query = String(state.archiveMode.query || '').trim().toLowerCase();
    const creator = String(meta.creator || '').toLowerCase();
    const title = String(meta.title || node.title || '').toLowerCase();
    const key = String(meta.key || node.problemKey || '').toLowerCase();
    const date = meta.timestampValue
      ? new Date(meta.timestampValue).toLocaleDateString().toLowerCase()
      : '';
    if (query) {
      const fromMatch = query.match(/^from:(.+)$/);
      if (fromMatch) {
        if (!creator.includes(fromMatch[1].trim())) return false;
      } else if (![title, creator, key, date].some(value => value.includes(query))) {
        return false;
      }
    }
    const difficulty = state.archiveMode.difficulty || 'all';
    if (difficulty !== 'all' && Number(meta.difficulty || 0) !== Number(difficulty)) return false;
    const solvedMin = Number(state.archiveMode.solvedMin || 0);
    if (Number(meta.solvedCount || 0) < solvedMin) return false;
    if (!state.archiveMode.showSolved && node.solvedByMe) return false;
    if (!state.archiveMode.showUnsolved && !node.solvedByMe) return false;
    return true;
  }

  function applyBlueprintArchiveFilters() {
    const root = state.nodeLookup.get(BLUEPRINT_ARCHIVE_ROOT_ID);
    if (!root) return;
    const allProblemNodes = state.nodes.filter(node => node.isUserProblem);
    allProblemNodes.forEach(node => {
      node.archiveVisible = false;
    });
    const visibleNodes = sortArchiveNodes(allProblemNodes.filter(matchesArchiveFilter));
    const placed = [root];
    const blueprintEdges = [];

    visibleNodes.forEach((node, index) => {
      const seed = hashString(`${node.problemKey}:${node.archiveMeta?.title}:${index}:${state.archiveMode.sort}`);
      const random = createSeededRandom(seed);
      let parent = placed[Math.floor(random() * placed.length)] || root;
      let position = null;

      for (let attempt = 0; attempt < 80 && !position; attempt += 1) {
        if (attempt > 0 && attempt % 12 === 0) {
          parent = placed[Math.floor(random() * placed.length)] || root;
        }
        const directions = getArchiveDirectionsForParent(parent).sort(() => random() - 0.5);
        for (const direction of directions) {
          const candidate = getArchiveAdjacentPosition(parent, direction);
          if (!isArchivePositionBlocked(candidate, placed)) {
            position = candidate;
            break;
          }
        }
      }

      if (!position) {
        for (const fallbackParent of placed) {
          for (const direction of getArchiveDirectionsForParent(fallbackParent)) {
            const candidate = getArchiveAdjacentPosition(fallbackParent, direction);
            if (!isArchivePositionBlocked(candidate, placed)) {
              parent = fallbackParent;
              position = candidate;
              break;
            }
          }
          if (position) break;
        }
      }

      if (!position) {
        parent = placed[placed.length - 1] || root;
        position = getArchiveAdjacentPosition(parent, { x: 0, y: 1 });
      }

      updateNodeGridGeometry(node, position);
      node.archiveVisible = true;
      placed.push(node);
      blueprintEdges.push({
        id: `${parent.id}->${node.id}-archive`,
        from: parent.id,
        to: node.id,
        edgeType: 'blueprint',
        style: 'orthogonal',
        points: [parent.center, node.center]
      });
    });

    state.edges = state.edges.filter(edge => edge.edgeType !== 'blueprint').concat(blueprintEdges);
    rebuildEdgesBySource();
    state.edgeHighlights.clear();
    requestRender();
  }

  function refreshChapterNav() {
    const chapters = state.chapters || [];
    const active = chapters.find(ch => ch.id === state.currentChapterId) || chapters[0] || null;
    const activeIndex = active ? chapters.findIndex(ch => ch.id === active.id) : -1;
    if (chapterLabelEl) {
      chapterLabelEl.textContent = state.archiveMode.active
        ? (translate('blueprintArchiveTitle') || 'External Blueprint Archive')
        : active ? active.label.toUpperCase() : '';
    }
    if (chapterNavEl) chapterNavEl.dataset.chapterId = active?.id || '';
    if (chapterPrevBtn) {
      const toExtras = active?.id === 'chapter_1' && chapters[activeIndex - 1]?.id === 'extras';
      chapterPrevBtn.textContent = '←';
      chapterPrevBtn.disabled = state.archiveMode.active || !active || activeIndex <= 0;
      chapterPrevBtn.setAttribute('aria-label', toExtras ? (window.currentLang === 'ko' ? '실험실·유저 문제' : 'Lab · User Puzzles') : translate('stageMapChapterPrevAria') || 'Previous chapter');
    }
    if (chapterNextBtn) {
      const toChapterOne = active?.id === 'extras' && chapters[activeIndex + 1]?.id === 'chapter_1';
      chapterNextBtn.textContent = '→';
      chapterNextBtn.disabled = state.archiveMode.active || !active || activeIndex < 0 || activeIndex >= chapters.length - 1;
      chapterNextBtn.setAttribute('aria-label', toChapterOne ? 'Chapter 1' : translate('stageMapChapterNextAria') || 'Next chapter');
    }
    if (chapterNavEl) {
      chapterNavEl.hidden = Boolean(state.archiveMode.active);
    }
    if (blueprintToolsEl) {
      blueprintToolsEl.hidden = !state.archiveMode.active;
    }
  }

  function setCurrentChapter(chapterId) {
    const next = chapterId && state.chapterLookup.has(chapterId)
      ? chapterId
      : (state.chapters[0]?.id || null);
    if (state.currentChapterId === next) {
      refreshChapterNav();
      return;
    }
    state.currentChapterId = next;
    state.focusedExtraId = null;
    state.extraSignalStarts.clear();
    clearHoverNode();
    clearPressedNode();
    refreshChapterNav();
    document.dispatchEvent(new CustomEvent('stageMap:chapterChanged', {
      detail: {
        chapterId: next,
        chapter: next ? state.chapterLookup.get(next) : null
      }
    }));
  }

  function getChapterAnchorWorld(chapter) {
    if (!chapter) return null;
    if (chapter.title?.center) {
      return { x: chapter.title.center.x, y: chapter.title.center.y };
    }
    if (chapter.anchor) {
      const pt = gridPointToWorldCenter(chapter.anchor);
      return { x: pt.x, y: pt.y };
    }
    const bounds = state.chapterBounds.get(chapter.id);
    if (bounds) {
      return {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
      };
    }
    return null;
  }

  function focusChapter(chapterId, { animate = true } = {}) {
    if (!state.chapters.length) return;
    const chapter = state.chapterLookup.get(chapterId) || state.chapters[0];
    if (!chapter) return;
    setCurrentChapter(chapter.id);
    executeNextFrame(() => {
      ensureCanvasInitialized();
      const focusBounds = state.chapterBounds.get(chapter.id);
      const anchor = getChapterAnchorWorld(chapter);
      if (!anchor && !focusBounds) return;
      const { scale, viewportWidth, viewportHeight } = camera.getState();
      const safeViewportWidth = viewportWidth || canvas.clientWidth || 1;
      const safeViewportHeight = viewportHeight || canvas.clientHeight || 1;
      const topPadding = clamp(safeViewportHeight * 0.024, 12, 24);
      const bottomPadding = Math.max(64, (chapterNavEl?.getBoundingClientRect().height || 46) + 40);
      const availableHeight = Math.max(1, safeViewportHeight - topPadding - bottomPadding);
      const availableWidth = Math.max(1, safeViewportWidth - Math.max(32, safeViewportWidth * 0.07));
      let nextScale = scale;

      const viewportKey = `${safeViewportWidth}:${safeViewportHeight}`;
      if (focusBounds && state.chapterFitViewport !== viewportKey) {
        state.chapterFitViewport = viewportKey;
        const boundsWidth = Math.max(focusBounds.maxX - focusBounds.minX, CELL);
        const boundsHeight = Math.max(focusBounds.maxY - focusBounds.minY, CELL);
        const fitScaleX = availableWidth / boundsWidth;
        const fitScaleY = availableHeight / boundsHeight;
        nextScale = Math.max(0.2, Math.min(2.2, Math.min(fitScaleX, fitScaleY)));
        if (Number.isFinite(nextScale) && Math.abs(nextScale - scale) > 1e-4) {
          camera.setScale(nextScale, safeViewportWidth / 2, safeViewportHeight / 2);
        }
      }

      const focusCenter = focusBounds
        ? {
          x: (focusBounds.minX + focusBounds.maxX) / 2,
          y: (focusBounds.minY + focusBounds.maxY) / 2
        }
        : anchor;
      const widthWorld = safeViewportWidth / Math.max(nextScale, 1e-6);
      panToOrigin(
        {
          x: focusCenter.x - widthWorld / 2,
          y: focusCenter.y - (topPadding + availableHeight / 2) / Math.max(nextScale, 1e-6)
        },
        { animate, duration: 520 }
      );
      requestRender();
    });
  }

  function focusBlueprintArchive({ animate = true } = {}) {
    executeNextFrame(() => {
      ensureCanvasInitialized();
      const rootNode = state.nodeLookup.get(BLUEPRINT_ARCHIVE_ROOT_ID);
      if (!rootNode) return;
      const { scale, viewportWidth, viewportHeight } = camera.getState();
      const safeViewportWidth = viewportWidth || canvas.clientWidth || 1;
      const safeViewportHeight = viewportHeight || canvas.clientHeight || 1;
      const nextScale = Math.max(0.55, Math.min(1.0, scale < 0.55 ? 0.85 : scale));
      if (Number.isFinite(nextScale) && Math.abs(nextScale - scale) > 1e-4) {
        camera.setScale(nextScale, safeViewportWidth / 2, safeViewportHeight / 2);
      }
      const widthWorld = safeViewportWidth / Math.max(nextScale, 1e-6);
      const heightWorld = safeViewportHeight / Math.max(nextScale, 1e-6);
      const focusCenter = {
        x: rootNode.center.x,
        y: rootNode.center.y
      };
      panToOrigin(
        {
          x: focusCenter.x - widthWorld / 2,
          y: focusCenter.y - heightWorld / 2
        },
        { animate, duration: 520 }
      );
      requestRender();
    });
  }

  function enterBlueprintArchive(node) {
    state.archiveMode.previousChapterId = state.currentChapterId;
    state.archiveMode.active = true;
    setCurrentChapter(node?.chapterId || 'extras');
    clearHoverNode();
    clearPressedNode();
    triggerHighlightForNode(node);
    focusBlueprintArchive({ animate: true });
    refreshChapterNav();
    requestRender();
  }

  function exitBlueprintArchive() {
    const targetChapterId = state.archiveMode.previousChapterId || 'extras';
    state.archiveMode.active = false;
    state.archiveMode.previousChapterId = null;
    state.focusHighlight = null;
    state.edgeHighlights.clear();
    clearHoverNode();
    clearPressedNode();
    focusChapter(targetChapterId, { animate: true });
    refreshChapterNav();
    requestRender();
  }

  function shiftChapter(delta, options = {}) {
    if (state.archiveMode.active) return;
    if (!state.chapters.length) return;
    const chapters = state.chapters;
    const currentIndex = Math.max(0, chapters.findIndex(ch => ch.id === state.currentChapterId));
    const nextIndex = clamp(currentIndex + delta, 0, chapters.length - 1);
    const nextChapter = chapters[nextIndex];
    if (!nextChapter) return;
    focusChapter(nextChapter.id, options);
  }

  function prevChapter(options = {}) {
    shiftChapter(-1, options);
  }

  function nextChapter(options = {}) {
    shiftChapter(1, options);
  }
  function syncViewportPreservingCenter() {
    const before = camera.getState();
    const beforeWidth = before.viewportWidth || canvas.clientWidth || window.innerWidth || 1;
    const beforeHeight = before.viewportHeight || canvas.clientHeight || window.innerHeight || 1;
    const centerBefore = camera.screenToWorld(beforeWidth / 2, beforeHeight / 2);

    try {
      ensureCanvasInitialized();
    } catch (e) {
      console.warn('ensureCanvasInitialized failed while syncing stage map viewport', e);
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || surface?.getBoundingClientRect?.().width || window.innerWidth || 1;
    const height = rect.height || surface?.getBoundingClientRect?.().height || window.innerHeight || 1;
    camera.setViewport(width, height);

    const after = camera.getState();
    const centerAfter = camera.screenToWorld(
      (after.viewportWidth || width) / 2,
      (after.viewportHeight || height) / 2
    );
    const dx = (centerAfter.x - centerBefore.x) * after.scale;
    const dy = (centerAfter.y - centerBefore.y) * after.scale;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      camera.pan(dx, dy);
    }
    requestRender();
  }

  function scheduleViewportSync() {
    executeNextFrame(() => {
      syncViewportPreservingCenter();
      executeNextFrame(syncViewportPreservingCenter);
    });
  }

  function refitCurrentView({ animate = false } = {}) {
    if (!state.nodes.length) return;
    if (state.archiveMode.active) {
      focusBlueprintArchive({ animate });
    } else if (state.currentChapterId) {
      focusChapter(state.currentChapterId, { animate });
    } else {
      centerMap();
    }
    refreshZoomIndicator();
  }

  function scheduleViewportRefit({ animate = false } = {}) {
    executeNextFrame(() => {
      try {
        ensureCanvasInitialized();
      } catch (e) {
        console.warn('ensureCanvasInitialized failed while refitting stage map viewport', e);
      }
      const rect = canvas.getBoundingClientRect();
      camera.setViewport(rect.width || window.innerWidth || 1, rect.height || window.innerHeight || 1);
      refitCurrentView({ animate });
      executeNextFrame(() => refitCurrentView({ animate: false }));
    });
  }

  function updateCanvasCursor() {
    if (!canvas) return;
    if (state.dragging || state.activePointers.size > 1) {
      canvas.style.cursor = 'default';
      return;
    }
    if (state.hoverNode || state.pressedNode) {
      canvas.style.cursor = 'pointer';
      return;
    }
    canvas.style.cursor = 'default';
  }

  function setHoverNode(nextNode) {
    const prevId = state.hoverNode?.id || null;
    const nextId = nextNode?.id || null;
    if (prevId === nextId) {
      updateCanvasCursor();
      return;
    }
    state.hoverNode = nextNode || null;
    if (isExtrasCard(nextNode)) state.extraSignalStarts.set(nextNode.id, performance.now());
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
      if (!isNodeVisibleInCurrentMode(node)) return false;
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
      startLabTransition(node);
      markModeNodeCleared(node.id);
      return;
    }
    if (node.id === BLUEPRINT_ARCHIVE_ROOT_ID) {
      markModeNodeCleared(node.id);
      if (state.archiveMode.active) {
        exitBlueprintArchive();
      } else {
        enterBlueprintArchive(node);
      }
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
    state.selectedNodeId = node.id;
    requestRender();
    if (node.previewFeature) { onFeatureLocked?.(node.previewFeature); return; }
    const status = state.nodeStatus.get(node.id);
    if (status?.locked) return;
    if (node.chapterId && node.chapterId !== GLOBAL_CHAPTER_ID) {
      setCurrentChapter(node.chapterId);
    }

    if (node.isUserProblem) {
      if (onlineFeatures) import('./problemEditor.js').then(m => m.previewUserProblem(node.problemKey));
      return;
    }

    if (node.nodeType === 'mode') {
      handleModeShortcut(node);
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
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    state.activePointers.add(event.pointerId);
    state.pointerType = event.pointerType || state.pointerType;
    state.pointerWorld = camera.screenToWorld(event.clientX, event.clientY);

    if (state.activePointers.size >= 2) {
      // Ignore the entire multi-touch sequence, including the last finger's release.
      state.pointerStart = null;
      clearHoverNode();
      clearPressedNode();
      return;
    }

    state.pointerStart = {
      pointerId: event.pointerId,
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

    state.pointerType = event.pointerType || state.pointerType;
    state.pointerWorld = camera.screenToWorld(event.clientX, event.clientY);

    if (!state.pointerStart) return;
    const dx = event.clientX - state.pointerStart.x;
    const dy = event.clientY - state.pointerStart.y;
    if (!state.pointerStart.moved && Math.hypot(dx, dy) > 4) {
      state.pointerStart.moved = true;
      state.dragging = true;
      clearHoverNode();
      clearPressedNode();
      updateCanvasCursor();
    }
    // Movement only cancels the tap. Camera movement belongs to chapter navigation.
    if (state.pointerStart.moved) return;
    const hovered = updateHoverFromPoint(event.clientX, event.clientY);
    if (hovered) {
      setPressedNode(hovered);
    } else {
      clearPressedNode();
    }
  }

  function handlePointerUp(event) {
    if (!state.activePointers.has(event.pointerId)) return;
    const start = state.pointerStart;
    const wasDragging = Boolean(state.dragging || start?.moved || (start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4));
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.activePointers.delete(event.pointerId);

    state.dragging = false;
    state.pointerStart = null;
    state.pointerWorld = camera.screenToWorld(event.clientX, event.clientY);
    updateCanvasCursor();

    if (!start || start.pointerId !== event.pointerId || wasDragging) {
      clearPressedNode();
      updateHoverFromPoint(event.clientX, event.clientY);
      return;
    }

    const world = camera.screenToWorld(event.clientX, event.clientY);
    const clickedNode = state.nodes.find(node => (
      isNodeVisibleInCurrentMode(node) && isPointInsideNode(node, world) && isPointInsideNode(node, start.world)
    ));
    handleNodeActivation(clickedNode);
    clearPressedNode();
    updateHoverFromPoint(event.clientX, event.clientY);
  }

  function handleWheel(event) {
    // Includes trackpad pinch events delivered as Ctrl+wheel.
    event.preventDefault();
  }

  function handlePointerHover(event) {
    state.pointerType = event.pointerType || state.pointerType;
    state.pointerWorld = camera.screenToWorld(event.clientX, event.clientY);
    requestRender();
    if (state.activePointers.size) {
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
    state.pointerWorld = null;
    requestRender();
    clearHoverNode();
    clearPressedNode();
  }

  function setStageMapInfoVisible(visible) {
    if (!stageMapInfoEl) return;
    const nextVisible = Boolean(visible);
    stageMapInfoEl.classList.toggle('stage-map-info--hidden', !nextVisible);
    if (infoToggleBtn) {
      infoToggleBtn.setAttribute('aria-pressed', nextVisible ? 'true' : 'false');
      infoToggleBtn.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
      const labelKey = nextVisible ? 'stageMapInfoHideAria' : 'stageMapInfoShowAria';
      const label = translate(labelKey);
      if (label && label !== labelKey) {
        infoToggleBtn.setAttribute('aria-label', label);
        infoToggleBtn.setAttribute('title', label);
      }
    }
  }

  function handlePointerCancel(event) {
    if (!state.activePointers.has(event.pointerId)) return;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.activePointers.delete(event.pointerId);
    state.pointerStart = null;
    state.dragging = false;

    updateCanvasCursor();
    if (state.activePointers.size === 0) {
      state.pointerWorld = null;
    }
    clearHoverNode();
    clearPressedNode();
    requestRender();
  }

  function setupCanvasInteractions() {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointermove', handlePointerHover);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('lostpointercapture', handlePointerCancel);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    // Also block native zoom over map controls, without affecting other screens.
    screenEl.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    }, { passive: false });
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      screenEl.addEventListener(type, event => event.preventDefault(), { passive: false });
    }
  }

  // Transparent semantic buttons make the canvas cards reachable by Tab and Enter/Space.
  // Pointer input stays with the canvas so dragging still cancels a card tap.
  const extraControls = document.createElement('div');
  extraControls.className = 'stage-map-extra-controls';
  extraControls.hidden = true;
  surface.append(extraControls);
  const extraButtons = new Map(['lab', 'user_created_stages'].map(id => {
    const button = document.createElement('button');
    button.type = 'button';button.dataset.extraNode = id;
    button.addEventListener('focus', () => {
      state.focusedExtraId = id;
      state.extraSignalStarts.set(id, performance.now());
      requestRender();
    });
    button.addEventListener('blur', () => {
      if (state.focusedExtraId === id) state.focusedExtraId = null;
      requestRender();
    });
    button.addEventListener('click', () => {
      const node = state.nodeLookup.get(id);
      if (state.currentChapterId === 'extras' && !state.archiveMode.active && isNodeInteractive(node, state.nodeStatus.get(id))) handleNodeActivation(node);
    });
    extraControls.append(button);
    return [id, button];
  }));

  function syncExtrasControls() {
    extraControls.hidden = state.currentChapterId !== 'extras' || state.archiveMode.active;
    if (extraControls.hidden) return;
    extraButtons.forEach((button, id) => {
      const node = state.nodeLookup.get(id);
      button.hidden = !node;
      if (!node) return;
      const pos = camera.worldToScreen(node.rect.x, node.rect.y), scale = camera.getScale();
      const { title, caption } = extrasCardText(node, window.currentLang);
      button.setAttribute('aria-label', `${title} · ${caption}`);
      button.disabled = !isNodeInteractive(node, state.nodeStatus.get(id));
      Object.assign(button.style, { left: `${pos.x}px`, top: `${pos.y}px`, width: `${node.rect.w * scale}px`, height: `${node.rect.h * scale}px` });
    });
  }

  function onResize() {
    if (screenEl?.getAttribute('aria-hidden') === 'true' || screenEl?.style.display === 'none') {
      return;
    }
    scheduleViewportRefit({ animate: false });
  }

  camera.setOnChange(() => requestRender());
  setupCanvasInteractions();
  setupPanels();
  window.addEventListener('resize', onResize);

  if (infoToggleBtn) {
    setStageMapInfoVisible(false);
    infoToggleBtn.addEventListener('click', () => {
      const hidden = stageMapInfoEl?.classList.contains('stage-map-info--hidden');
      setStageMapInfoVisible(Boolean(hidden));
    });
  }
  if (chapterPrevBtn) chapterPrevBtn.addEventListener('click', () => prevChapter({ animate: true }));
  if (chapterNextBtn) chapterNextBtn.addEventListener('click', () => nextChapter({ animate: true }));
  const handleArchiveFilterChange = () => {
    state.archiveMode.query = blueprintSearchInput?.value || '';
    state.archiveMode.sort = blueprintSortSelect?.value || 'name';
    state.archiveMode.sortDirection = blueprintSortDirectionSelect?.value || 'asc';
    state.archiveMode.difficulty = blueprintDifficultySelect?.value || 'all';
    state.archiveMode.solvedMin = Math.max(0, Number.parseInt(blueprintSolvedMinInput?.value || '0', 10) || 0);
    state.archiveMode.showSolved = blueprintShowSolvedBtn?.getAttribute('aria-pressed') !== 'false';
    state.archiveMode.showUnsolved = blueprintShowUnsolvedBtn?.getAttribute('aria-pressed') !== 'false';
    applyBlueprintArchiveFilters();
    if (state.archiveMode.active) {
      focusBlueprintArchive({ animate: true });
    }
  };
  blueprintSearchInput?.addEventListener('input', handleArchiveFilterChange);
  blueprintSortSelect?.addEventListener('change', handleArchiveFilterChange);
  blueprintSortDirectionSelect?.addEventListener('change', handleArchiveFilterChange);
  blueprintDifficultySelect?.addEventListener('change', handleArchiveFilterChange);
  blueprintSolvedMinInput?.addEventListener('input', handleArchiveFilterChange);
  const toggleArchiveButton = button => {
    if (!button) return;
    const next = button.getAttribute('aria-pressed') === 'false';
    button.setAttribute('aria-pressed', next ? 'true' : 'false');
    handleArchiveFilterChange();
  };
  blueprintShowSolvedBtn?.addEventListener('click', () => toggleArchiveButton(blueprintShowSolvedBtn));
  blueprintShowUnsolvedBtn?.addEventListener('click', () => toggleArchiveButton(blueprintShowUnsolvedBtn));

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!screenEl || screenEl.getAttribute('aria-hidden') === 'true' || !screenEl.getClientRects().length || state.openPanel) return;
    const tag = (event.target?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prevChapter({ animate: true });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nextChapter({ animate: true });
    }
  });

  Promise.all([
    mapSpec ? Promise.resolve(mapSpec) : loadStageMapSpec(),
    onlineFeatures ? import('./problemEditor.js').then(m => m.getUserProblems()) : Promise.resolve([])
  ])
    .then(([spec, userProblems]) => {
      const specClone = JSON.parse(JSON.stringify(spec));
      injectUserProblems(specClone, userProblems);
      return buildGraph(specClone, { getLevelTitle });
    })
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

  document.addEventListener('stageMap:shown', () => {
    scheduleViewportSync();
  });

  document.addEventListener('stageMap:returnFromLab', (e) => {
    const { camera: camState } = e.detail || {};
    const stageCameraState = state.transition.returnCamera || camState;
    state.transition.returnCamera = null;
    if (stageCameraState) {
      if (Number.isFinite(stageCameraState.scale)) {
        camera.setScale(stageCameraState.scale);
      }
      
      const targetOriginX = Number.isFinite(stageCameraState.originX) ? stageCameraState.originX : 0;
      const targetOriginY = Number.isFinite(stageCameraState.originY) ? stageCameraState.originY : 0;
      
      const current = camera.getState();
      // Calculate delta to pan to target
      // pan(dx, dy) subtracts dx/scale from origin.
      // target = current - dx/scale => dx = (current - target) * scale
      const dx = (current.originX - targetOriginX) * current.scale;
      const dy = (current.originY - targetOriginY) * current.scale;
      
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        camera.pan(dx, dy);
      }
    }
    
    state.transition.returningFromLab = true;
    state.transition.startTime = performance.now();
    scheduleViewportSync();
    requestRender();
  });

  return {
    refresh: () => {
      refreshNodeStates();
    },
    focusLevel,
    focusChapter,
    prevChapter,
    nextChapter,
    celebrateLevel
  };
}

function parseColor(input) {
  if (!input) return { r: 0, g: 0, b: 0, a: 1 };
  if (input.startsWith('#')) {
    const hex = input.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      };
    }
  }
  if (input.startsWith('rgba')) {
    const parts = input.match(/[\d.]+/g);
    if (!parts) return { r: 0, g: 0, b: 0, a: 1 };
    return {
      r: parseFloat(parts[0]),
      g: parseFloat(parts[1]),
      b: parseFloat(parts[2]),
      a: parseFloat(parts[3])
    };
  }
  if (input.startsWith('rgb')) {
    const parts = input.match(/[\d.]+/g);
    if (!parts) return { r: 0, g: 0, b: 0, a: 1 };
    return {
      r: parseFloat(parts[0]),
      g: parseFloat(parts[1]),
      b: parseFloat(parts[2]),
      a: 1
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function lerpColor(c1, c2, t) {
  const start = parseColor(c1);
  const end = parseColor(c2);
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  const a = start.a + (end.a - start.a) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}






