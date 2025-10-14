import { CELL, GAP } from './model.js';
import { getActiveTheme, getThemeAccent } from '../themes.js';

export const CELL_CORNER_RADIUS = 3;

const PITCH = CELL + GAP;

const BASE_GRID_STYLE = {
  background: '#ffffff',
  panelFill: null,
  panelShadow: {
    color: 'rgba(15, 23, 42, 0.08)',
    blur: 16,
    offsetX: 0,
    offsetY: 4
  },
  gridFillA: null,
  gridFillB: null,
  gridStroke: '#ddd',
  gridLineWidth: 1,
  cellRadius: CELL_CORNER_RADIUS,
  borderColor: '#666',
  borderWidth: GAP
};

const BASE_PANEL_STYLE = {
  panelBackground: null,
  background: '#ffffff',
  border: 'rgba(148, 163, 184, 0.5)',
  labelColor: '#334155',
  itemGradient: ['#f0f0ff', '#d0d0ff'],
  itemFill: null,
  itemTextColor: '#111827',
  itemShadow: {
    color: 'rgba(15, 23, 42, 0.1)',
    blur: 12,
    offsetX: 0,
    offsetY: 4
  },
  itemBorderColor: 'rgba(148, 163, 184, 0.4)',
  itemBorderWidth: 1,
  itemRadius: 10
};

const BASE_BLOCK_STYLE = {
  fill: ['#f0f0ff', '#d0d0ff'],
  hoverFill: ['#fdfdff', '#c8c8ff'],
  textColor: '#000',
  radius: CELL_CORNER_RADIUS,
  shadow: {
    color: 'rgba(0,0,0,0.18)',
    blur: 12,
    offsetX: 0,
    offsetY: 6
  },
  hoverShadow: {
    color: 'rgba(0,0,0,0.25)',
    blur: 16,
    offsetX: 0,
    offsetY: 8
  },
  strokeColor: null,
  strokeWidth: 0,
  activeFill: null,
  activeTextColor: null,
  font: null
};

const BASE_WIRE_STYLE = {
  color: '#111',
  width: 2,
  dashPattern: [20, 20],
  nodeFill: '#ffe',
  nodeShadow: null,
  nodeRadius: CELL_CORNER_RADIUS
};

function mergeShadow(base, override) {
  if (override === null) return null;
  const baseObj =
    base && typeof base === 'object'
      ? { ...base }
      : base
      ? { color: base }
      : {};
  if (override === undefined) {
    return Object.keys(baseObj).length ? baseObj : null;
  }
  if (typeof override === 'string') {
    return { ...baseObj, color: override };
  }
  if (!override) {
    return Object.keys(baseObj).length ? baseObj : null;
  }
  return { ...baseObj, ...override };
}

function applyShadow(ctx, shadow) {
  if (!shadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  const spec = typeof shadow === 'object' ? shadow : { color: shadow };
  ctx.shadowColor = spec.color || 'transparent';
  ctx.shadowBlur = spec.blur ?? 0;
  ctx.shadowOffsetX = spec.offsetX ?? 0;
  ctx.shadowOffsetY = spec.offsetY ?? 0;
}

function applyScaledShadow(ctx, shadow, scale = 1) {
  if (!shadow) {
    applyShadow(ctx, null);
    return;
  }
  const spec = typeof shadow === 'object' ? { ...shadow } : { color: shadow };
  if (spec.blur != null) spec.blur *= scale;
  if (spec.offsetX != null) spec.offsetX *= scale;
  if (spec.offsetY != null) spec.offsetY *= scale;
  applyShadow(ctx, spec);
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
  if (typeof fill === 'object' && fill.type === 'linear') {
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
  return fill;
}

function resolveSolidColor(fill) {
  if (!fill) return null;
  if (Array.isArray(fill)) {
    return fill.find(color => typeof color === 'string') || null;
  }
  if (typeof fill === 'object') {
    if (typeof fill.color === 'string') {
      return fill.color;
    }
    if (Array.isArray(fill.stops)) {
      const stopWithColor = fill.stops.find(stop => typeof stop?.color === 'string');
      if (stopWithColor) {
        return stopWithColor.color;
      }
    }
  }
  if (typeof fill === 'string') {
    return fill;
  }
  return null;
}

function resolveGridStyle(options = {}) {
  const { theme: themeOverride, panelShadow, ...overrides } = options || {};
  const theme = themeOverride || getActiveTheme();
  const themeGrid = theme?.grid || {};
  const base = { ...BASE_GRID_STYLE, ...themeGrid };
  const style = { ...base, ...overrides };
  const resolvedBackground =
    resolveSolidColor(style.background) ??
    resolveSolidColor(base.background) ??
    BASE_GRID_STYLE.background;
  style.background = resolvedBackground;
  const baseShadow = mergeShadow(BASE_GRID_STYLE.panelShadow, themeGrid.panelShadow);
  const resolvedShadow = mergeShadow(baseShadow, panelShadow);
  style.panelShadow = resolvedShadow;
  style.cellRadius = CELL_CORNER_RADIUS;
  return style;
}

function resolvePanelStyle(options = {}) {
  const { theme: themeOverride, itemShadow, ...overrides } = options || {};
  const theme = themeOverride || getActiveTheme();
  const themePanel = theme?.panel || {};
  const base = { ...BASE_PANEL_STYLE, ...themePanel };
  const style = { ...base, ...overrides };
  style.itemShadow = mergeShadow(mergeShadow(BASE_PANEL_STYLE.itemShadow, themePanel.itemShadow), itemShadow);
  return style;
}

function resolveBlockStyle(options = {}) {
  const { theme: themeOverride, shadow, hoverShadow, ...overrides } = options || {};
  const theme = themeOverride || getActiveTheme();
  const themeBlock = theme?.block || {};
  const base = { ...BASE_BLOCK_STYLE, ...themeBlock };
  const style = { ...base, ...overrides };
  style.shadow = mergeShadow(mergeShadow(BASE_BLOCK_STYLE.shadow, themeBlock.shadow), shadow);
  style.hoverShadow = mergeShadow(mergeShadow(BASE_BLOCK_STYLE.hoverShadow, themeBlock.hoverShadow), hoverShadow);
  style.radius = CELL_CORNER_RADIUS;
  style.font = style.font || base.font || null;
  style.activeFill = style.activeFill || getThemeAccent(theme);
  style.activeTextColor = style.activeTextColor || '#ffffff';
  return style;
}

function resolveWireStyle(options = {}) {
  const { theme: themeOverride, ...overrides } = options || {};
  const theme = themeOverride || getActiveTheme();
  const themeWire = theme?.wire || {};
  const base = { ...BASE_WIRE_STYLE, ...themeWire };
  const style = { ...base, ...overrides };
  style.nodeShadow = mergeShadow(mergeShadow(BASE_WIRE_STYLE.nodeShadow, themeWire.nodeShadow), overrides.nodeShadow);
  style.nodeRadius = CELL_CORNER_RADIUS;
  return style;
}

export function roundRect(ctx, x, y, w, h, r = CELL_CORNER_RADIUS) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Utility to prepare canvas for HiDPI displays
export function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  if (canvas.dataset) {
    canvas.dataset.baseWidth = String(width);
    canvas.dataset.baseHeight = String(height);
    canvas.dataset.dpr = String(dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

function resetTransformAndClear(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawInfiniteGrid(ctx, camera, options = {}) {
  if (!camera) return;
  resetTransformAndClear(ctx);
  const { panelWidth, scale, originX, originY } = camera.getState();
  const baseWidth = Number.parseFloat(ctx.canvas.dataset?.baseWidth || '');
  const baseHeight = Number.parseFloat(ctx.canvas.dataset?.baseHeight || '');
  const dpr = Number.parseFloat(ctx.canvas.dataset?.dpr || '') || window.devicePixelRatio || 1;
  const width = Number.isFinite(baseWidth) ? baseWidth : ctx.canvas.width / dpr;
  const height = Number.isFinite(baseHeight) ? baseHeight : ctx.canvas.height / dpr;

  const gridStyle = resolveGridStyle(options);
  const {
    panelFill,
    panelShadow,
    gridFillA,
    gridFillB,
    gridStroke,
    gridLineWidth,
    cellRadius
  } = gridStyle;

  if (panelWidth > 0 && panelFill) {
    ctx.save();
    applyShadow(ctx, panelShadow);
    const panelFillStyle = createFillStyle(ctx, panelFill, 0, 0, panelWidth, height) || panelFill;
    ctx.fillStyle = panelFillStyle;
    ctx.fillRect(0, 0, panelWidth, height);
    ctx.restore();
  }

  const cellScaled = CELL * scale;

  const visibleWidth = (width - panelWidth) / scale;
  const visibleHeight = height / scale;
  const startWorldX = originX;
  const endWorldX = originX + visibleWidth;
  const startWorldY = originY;
  const endWorldY = originY + visibleHeight;

  const startCol = Math.floor((startWorldX - GAP) / PITCH) - 1;
  const endCol = Math.ceil((endWorldX - GAP) / PITCH) + 1;
  const startRow = Math.floor((startWorldY - GAP) / PITCH) - 1;
  const endRow = Math.ceil((endWorldY - GAP) / PITCH) + 1;

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const topLeft = camera.cellToScreenCell({ r, c });
      const { x, y } = topLeft;
      if (x + cellScaled <= panelWidth) continue;
      const hasChecker = gridFillA != null || gridFillB != null;
      const fillSpec = hasChecker
        ? gridFillA && gridFillB
          ? (r + c) % 2 === 0
            ? gridFillA
            : gridFillB
          : gridFillA || gridFillB
        : null;
      const scaledRadius = Math.max(0, cellRadius * scale);
      roundRect(ctx, x, y, cellScaled, cellScaled, scaledRadius);
      if (fillSpec) {
        const fillStyle = createFillStyle(ctx, fillSpec, x, y, cellScaled, cellScaled) || fillSpec;
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = Math.max(gridLineWidth, gridLineWidth * scale);
      ctx.stroke();
    }
  }
}

// Draw grid as individual tiles with gaps similar to GIF rendering
export function drawGrid(ctx, rows, cols, offsetX = 0, camera = null, options = {}) {
  const { unbounded, ...styleOptions } = options || {};
  if (unbounded && camera) {
    drawInfiniteGrid(ctx, camera, styleOptions);
    return;
  }
  const gridStyle = resolveGridStyle(styleOptions);
  const {
    panelFill,
    panelShadow,
    gridFillA,
    gridFillB,
    gridStroke,
    gridLineWidth,
    cellRadius,
    borderColor,
    borderWidth
  } = gridStyle;

  resetTransformAndClear(ctx);

  if (camera) {
    const { panelWidth, scale, originX, originY } = camera.getState();
    const baseWidth = Number.parseFloat(ctx.canvas.dataset?.baseWidth || '');
    const baseHeight = Number.parseFloat(ctx.canvas.dataset?.baseHeight || '');
    const dpr = Number.parseFloat(ctx.canvas.dataset?.dpr || '') || window.devicePixelRatio || 1;
    const width = Number.isFinite(baseWidth) ? baseWidth : ctx.canvas.width / dpr;
    const height = Number.isFinite(baseHeight) ? baseHeight : ctx.canvas.height / dpr;

    ctx.save();
    if (panelWidth > 0 && panelFill) {
      ctx.save();
      applyShadow(ctx, panelShadow);
      const panelFillStyle = createFillStyle(ctx, panelFill, 0, 0, panelWidth, height) || panelFill;
      ctx.fillStyle = panelFillStyle;
      ctx.fillRect(0, 0, panelWidth, height);
      ctx.restore();
    }

    const visibleWidth = (width - panelWidth) / scale;
    const visibleHeight = height / scale;
    const startWorldX = originX;
    const endWorldX = originX + visibleWidth;
    const startWorldY = originY;
    const endWorldY = originY + visibleHeight;

    const startCol = Math.max(0, Math.floor((startWorldX - GAP) / PITCH) - 1);
    const endCol = Math.min(cols - 1, Math.ceil((endWorldX - GAP) / PITCH) + 1);
    const startRow = Math.max(0, Math.floor((startWorldY - GAP) / PITCH) - 1);
    const endRow = Math.min(rows - 1, Math.ceil((endWorldY - GAP) / PITCH) + 1);

    if (startCol <= endCol && startRow <= endRow) {
      const scaledCell = CELL * scale;
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const topLeft = camera.cellToScreenCell({ r, c });
          const { x, y } = topLeft;
          if (x + scaledCell <= panelWidth) continue;
          const hasChecker = gridFillA != null || gridFillB != null;
          const fillSpec = hasChecker
            ? gridFillA && gridFillB
              ? (r + c) % 2 === 0
                ? gridFillA
                : gridFillB
              : gridFillA || gridFillB
            : null;
          const scaledRadius = Math.max(0, cellRadius * scale);
          roundRect(ctx, x, y, scaledCell, scaledCell, scaledRadius);
          if (fillSpec) {
            const fillStyle = createFillStyle(ctx, fillSpec, x, y, scaledCell, scaledCell) || fillSpec;
            ctx.fillStyle = fillStyle;
            ctx.fill();
          }
          ctx.strokeStyle = gridStroke;
          ctx.lineWidth = Math.max(gridLineWidth, gridLineWidth * scale);
          ctx.stroke();
        }
      }
    }

    if (borderColor && borderWidth > 0 && rows > 0 && cols > 0) {
      const scaledBorderWidth = Math.max(borderWidth, borderWidth * scale);
      const topLeft = camera.worldToScreen(GAP, GAP);
      const bottomRight = camera.worldToScreen(
        GAP + (cols - 1) * PITCH + CELL,
        GAP + (rows - 1) * PITCH + CELL
      );
      const rectX = topLeft.x - scaledBorderWidth / 2;
      const rectY = topLeft.y - scaledBorderWidth / 2;
      const rectWidth = bottomRight.x - topLeft.x + scaledBorderWidth;
      const rectHeight = bottomRight.y - topLeft.y + scaledBorderWidth;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = scaledBorderWidth;
      ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
    }

    ctx.restore();
    return;
  }

  const width = cols * PITCH + GAP;
  const height = rows * PITCH + GAP;
  ctx.save();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + GAP + c * PITCH;
      const y = GAP + r * PITCH;
      const hasChecker = gridFillA != null || gridFillB != null;
      const fillSpec = hasChecker
        ? gridFillA && gridFillB
          ? (r + c) % 2 === 0
            ? gridFillA
            : gridFillB
          : gridFillA || gridFillB
        : null;
      roundRect(ctx, x, y, CELL, CELL, cellRadius);
      if (fillSpec) {
        const fillStyle = createFillStyle(ctx, fillSpec, x, y, CELL, CELL) || fillSpec;
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = gridLineWidth;
      ctx.stroke();
    }
  }
  if (borderColor && borderWidth > 0) {
    const innerWidth = width - 2 * GAP;
    const innerHeight = height - 2 * GAP;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(
      offsetX + GAP - borderWidth / 2,
      GAP - borderWidth / 2,
      innerWidth + borderWidth,
      innerHeight + borderWidth
    );
  }
  ctx.restore();
}

// Blocks are drawn as rounded rectangles with text labels
export function drawBlock(
  ctx,
  block,
  offsetX = 0,
  hovered = false,
  camera = null,
  options = {}
) {
  const style = resolveBlockStyle(options);
  const { r, c } = block.pos;
  let x;
  let y;
  let size = CELL;
  const scale = camera ? camera.getScale() : 1;
  if (camera) {
    const point = camera.cellToScreenCell({ r, c });
    x = point.x;
    y = point.y;
    size = CELL * scale;
  } else {
    x = offsetX + GAP + c * PITCH;
    y = GAP + r * PITCH;
  }
  ctx.save();

  const isActive = Boolean(
    block.value && ['INPUT', 'OUTPUT', 'JUNCTION'].includes(block.type)
  );
  const blockRadius = Math.max(0, style.radius * scale);
  const fillSpec = isActive && style.activeFill
    ? style.activeFill
    : hovered && style.hoverFill
    ? style.hoverFill
    : style.fill;
  applyScaledShadow(ctx, hovered ? style.hoverShadow : style.shadow, scale);
  const fillStyle = createFillStyle(ctx, fillSpec, x, y, size, size) || fillSpec || '#f0f0ff';
  ctx.fillStyle = fillStyle;
  roundRect(ctx, x, y, size, size, blockRadius);
  ctx.fill();

  if (style.strokeColor && style.strokeWidth > 0) {
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(style.strokeWidth * scale, 0.6);
    ctx.strokeStyle = style.strokeColor;
    roundRect(ctx, x, y, size, size, blockRadius);
    ctx.stroke();
  }

  ctx.shadowColor = 'transparent';

  const baseFont = style.font || `bold 16px "Noto Sans KR", sans-serif`;
  const fontMatch = baseFont.match(/(\d+(?:\.\d+)?)px/);
  let resolvedFont;
  if (fontMatch) {
    const px = parseFloat(fontMatch[1]);
    const scaled = Math.max(0, px * scale);
    resolvedFont = baseFont.replace(fontMatch[0], `${scaled}px`);
  } else {
    const fallbackSize = Math.max(0, 16 * scale);
    resolvedFont = `bold ${fallbackSize}px "Noto Sans KR", sans-serif`;
  }
  const textColor = isActive && style.activeTextColor ? style.activeTextColor : style.textColor;
  ctx.fillStyle = textColor || '#000';
  ctx.font = resolvedFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(block.name || block.type, x + size / 2, y + size / 2);
  ctx.restore();
}

// Draw a wire path with flowing dashed line
export function drawWire(
  ctx,
  wire,
  phase = 0,
  offsetX = 0,
  camera = null,
  options = {}
) {
  if (!wire.path || wire.path.length < 2) return;
  const style = resolveWireStyle(options);
  ctx.save();
  const scale = camera ? camera.getScale() : 1;
  const lineWidth = Math.max((style.width || 2) * scale, 1);
  ctx.strokeStyle = style.color || '#111';
  ctx.lineWidth = lineWidth;
  const pattern = Array.isArray(style.dashPattern)
    ? style.dashPattern.map(v => v * scale)
    : [];
  if (pattern.length > 0) {
    ctx.setLineDash(pattern);
    const patternLength = pattern.reduce((sum, value) => sum + value, 0) || 1;
    const offsetUnits = ((phase * scale) % patternLength + patternLength) % patternLength;
    ctx.lineDashOffset = -offsetUnits;
  } else {
    ctx.setLineDash([]);
  }

  for (let i = 1; i < wire.path.length - 1; i++) {
    const p = wire.path[i];
    const point = camera
      ? camera.cellToScreenCell(p)
      : { x: offsetX + GAP + p.c * PITCH, y: GAP + p.r * PITCH };
    const size = CELL * scale;
    const radius = Math.max(0, (style.nodeRadius ?? CELL_CORNER_RADIUS) * scale);
    ctx.save();
    applyScaledShadow(ctx, style.nodeShadow, scale);
    const nodeFill =
      createFillStyle(ctx, style.nodeFill, point.x, point.y, size, size) ||
      style.nodeFill ||
      '#ffe';
    ctx.fillStyle = nodeFill;
    roundRect(ctx, point.x, point.y, size, size, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  const start = wire.path[0];
  const startPos = camera
    ? camera.cellToScreenCell(start)
    : { x: offsetX + GAP + start.c * PITCH, y: GAP + start.r * PITCH };
  ctx.moveTo(startPos.x + (CELL * scale) / 2, startPos.y + (CELL * scale) / 2);
  for (let i = 1; i < wire.path.length; i++) {
    const p = wire.path[i];
    const pos = camera
      ? camera.cellToScreenCell(p)
      : { x: offsetX + GAP + p.c * PITCH, y: GAP + p.r * PITCH };
    ctx.lineTo(pos.x + (CELL * scale) / 2, pos.y + (CELL * scale) / 2);
  }
  ctx.stroke();
  ctx.restore();
}

// Render the circuit: wires then blocks to keep z-order
export function renderContent(
  ctx,
  circuit,
  phase = 0,
  offsetX = 0,
  hoverId = null,
  camera = null,
  options = {}
) {
  const { preserveExisting, ...styleOptions } = options || {};
  if (preserveExisting) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
  } else {
    resetTransformAndClear(ctx);
  }
  const panelClipWidth = offsetX;
  const baseWidth = Number.parseFloat(ctx.canvas.dataset?.baseWidth || '');
  const baseHeight = Number.parseFloat(ctx.canvas.dataset?.baseHeight || '');
  const dpr = Number.parseFloat(ctx.canvas.dataset?.dpr || '') || window.devicePixelRatio || 1;
  const clipWidth = Number.isFinite(baseWidth) ? baseWidth : ctx.canvas.width / dpr;
  const clipHeight = Number.isFinite(baseHeight) ? baseHeight : ctx.canvas.height / dpr;
  ctx.save();
  if (panelClipWidth > 0) {
    ctx.beginPath();
    ctx.rect(
      panelClipWidth,
      0,
      Math.max(0, clipWidth - panelClipWidth),
      clipHeight
    );
    ctx.clip();
  }
  if (camera) {
    offsetX = 0;
  }
  Object.values(circuit.wires).forEach(w =>
    drawWire(ctx, w, phase, offsetX, camera, styleOptions)
  );
  Object.values(circuit.blocks).forEach(b =>
    drawBlock(ctx, b, offsetX, b.id === hoverId, camera, styleOptions)
  );
  ctx.restore();
}

// Draw palette on the left panel
export function drawPanel(ctx, items, panelWidth, canvasHeight, groups = [], options = {}) {
  const style = resolvePanelStyle(options);
  const {
    background,
    border,
    labelColor,
    itemGradient,
    itemFill,
    itemTextColor,
    itemShadow,
    itemBorderColor,
    itemBorderWidth,
    itemRadius,
    panelBackground
  } = style;

  ctx.clearRect(0, 0, panelWidth, canvasHeight);
  if (panelBackground) {
    const panelFill = createFillStyle(ctx, panelBackground, 0, 0, panelWidth, canvasHeight) || panelBackground;
    ctx.save();
    ctx.fillStyle = panelFill;
    ctx.fillRect(0, 0, panelWidth, canvasHeight);
    ctx.restore();
  }

  const groupRadius = itemRadius ?? 8;

  groups.forEach(g => {
    ctx.save();
    const groupFill = createFillStyle(ctx, background, g.x, g.y, g.w, g.h) || background;
    ctx.fillStyle = groupFill;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    roundRect(ctx, g.x, g.y, g.w, g.h, groupRadius);
    ctx.fill();
    if (border) ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(g.label, g.x + g.w / 2, g.y + g.padding);
    ctx.restore();
  });

  items.forEach(item => {
    if (item.hidden) return;
    ctx.save();
    applyShadow(ctx, itemShadow);
    let fillStyle = null;
    if (itemFill) {
      fillStyle = createFillStyle(ctx, itemFill, item.x, item.y, item.w, item.h) || itemFill;
    }
    if (!fillStyle) {
      if (Array.isArray(itemGradient)) {
        const grad = ctx.createLinearGradient(item.x, item.y, item.x, item.y + item.h);
        const step = itemGradient.length > 1 ? 1 / (itemGradient.length - 1) : 1;
        itemGradient.forEach((color, index) => {
          grad.addColorStop(Math.min(1, Math.max(0, index * step)), color);
        });
        fillStyle = grad;
      } else if (itemGradient) {
        fillStyle = itemGradient;
      } else {
        fillStyle = '#f0f0ff';
      }
    }
    ctx.fillStyle = fillStyle;
    const radius = itemRadius ?? 8;
    roundRect(ctx, item.x, item.y, item.w, item.h, radius);
    ctx.fill();
    applyShadow(ctx, null);
    if (itemBorderColor && itemBorderWidth > 0) {
      ctx.strokeStyle = itemBorderColor;
      ctx.lineWidth = itemBorderWidth;
      roundRect(ctx, item.x, item.y, item.w, item.h, radius);
      ctx.stroke();
    }
    ctx.fillStyle = itemTextColor || '#000';
    ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label || item.type, item.x + item.w / 2, item.y + item.h / 2);
    ctx.restore();
  });
}
