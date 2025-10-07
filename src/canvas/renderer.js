import { CELL, GAP } from './model.js';

const PITCH = CELL + GAP;

function roundRect(ctx, x, y, w, h, r = 6) {
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

function drawInfiniteGrid(
  ctx,
  camera,
  {
    background = '#0d101a',
    panelFill = 'rgba(22, 26, 42, 0.6)',
    gridFillA = 'rgba(255,255,255,0.05)',
    gridFillB = 'rgba(255,255,255,0.08)',
    gridStroke = 'rgba(255,255,255,0.12)'
  } = {}
) {
  if (!camera) return;
  resetTransformAndClear(ctx);
  const { panelWidth, scale, originX, originY } = camera.getState();
  const baseWidth = Number.parseFloat(ctx.canvas.dataset?.baseWidth || '');
  const baseHeight = Number.parseFloat(ctx.canvas.dataset?.baseHeight || '');
  const dpr = Number.parseFloat(ctx.canvas.dataset?.dpr || '') || window.devicePixelRatio || 1;
  const width = Number.isFinite(baseWidth) ? baseWidth : ctx.canvas.width / dpr;
  const height = Number.isFinite(baseHeight) ? baseHeight : ctx.canvas.height / dpr;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  if (panelWidth > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = panelFill;
    ctx.fillRect(0, 0, panelWidth, height);
    ctx.restore();
  }

  const pitchScaled = PITCH * scale;
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

  ctx.save();
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const topLeft = camera.cellToScreenCell({ r, c });
      const { x, y } = topLeft;
      if (x + cellScaled < panelWidth - pitchScaled) continue;
      ctx.save();
      ctx.fillStyle = (r + c) % 2 === 0 ? gridFillA : gridFillB;
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = Math.max(1, scale);
      roundRect(ctx, x, y, cellScaled, cellScaled, 4 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

// Draw grid as individual tiles with gaps similar to GIF rendering
export function drawGrid(ctx, rows, cols, offsetX = 0, camera = null, options = {}) {
  if (camera) {
    drawInfiniteGrid(ctx, camera, options);
    return;
  }
  resetTransformAndClear(ctx);
  const width = cols * PITCH + GAP;
  const height = rows * PITCH + GAP;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(offsetX, 0, width, height);
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + GAP + c * PITCH;
      const y = GAP + r * PITCH;
      roundRect(ctx, x, y, CELL, CELL, 3);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#666';
  ctx.lineWidth = GAP;
  ctx.strokeRect(offsetX + GAP / 2, GAP / 2, width - GAP, height - GAP);
  ctx.restore();
}

// Blocks are drawn as rounded rectangles with text labels
export function drawBlock(ctx, block, offsetX = 0, hovered = false, camera = null) {
  const { r, c } = block.pos;
  let x;
  let y;
  let size = CELL;
  if (camera) {
    const point = camera.cellToScreenCell({ r, c });
    x = point.x;
    y = point.y;
    size = CELL * camera.getScale();
  } else {
    x = offsetX + GAP + c * PITCH;
    y = GAP + r * PITCH;
  }
  ctx.save();

  // Drop shadow for a subtle 3D effect
  const shadowScale = camera ? camera.getScale() : 1;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = (hovered ? 8 : 4) * shadowScale;
  ctx.shadowOffsetX = 2 * shadowScale;
  ctx.shadowOffsetY = 2 * shadowScale;

  // Gradient fill for depth
  const grad = ctx.createLinearGradient(x, y, x, y + size);
  if (hovered) {
    grad.addColorStop(0, '#fdfdff');
    grad.addColorStop(1, '#c8c8ff');
  } else {
    grad.addColorStop(0, '#f0f0ff');
    grad.addColorStop(1, '#d0d0ff');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, size, size, 6 * shadowScale);
  ctx.fill();

  // Highlight active INPUT/OUTPUT/JUNCTION blocks with a dashed border
  ctx.shadowColor = 'transparent';
  if (block.value && ['INPUT', 'OUTPUT', 'JUNCTION'].includes(block.type)) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2 * shadowScale;
    ctx.setLineDash([4 * shadowScale, 4 * shadowScale]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Text
  ctx.fillStyle = '#000';
  ctx.font = `bold ${16 * shadowScale}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(block.name || block.type, x + size / 2, y + size / 2);
  ctx.restore();
}

// Draw a wire path with flowing dashed line
export function drawWire(ctx, wire, phase = 0, offsetX = 0, camera = null) {
  if (!wire.path || wire.path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#111';
  const scale = camera ? camera.getScale() : 1;
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([20 * scale, 20 * scale]);
  ctx.lineDashOffset = (-phase * scale) % (40 * scale);
  for (let i = 1; i < wire.path.length - 1; i++) {
    const p = wire.path[i];
    ctx.fillStyle = '#ffe';
    const x = camera
      ? camera.cellToScreenCell(p).x
      : offsetX + GAP + p.c * PITCH;
    const y = camera
      ? camera.cellToScreenCell(p).y
      : GAP + p.r * PITCH;
    const size = CELL * scale;
    ctx.fillRect(x, y, size, size);
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
export function renderContent(ctx, circuit, phase = 0, offsetX = 0, hoverId = null, camera = null) {
  resetTransformAndClear(ctx);
  ctx.save();
  if (camera) {
    const { panelWidth, originX, originY, scale } = camera.getState();
    ctx.translate(panelWidth, 0);
    ctx.scale(scale, scale);
    ctx.translate(-originX, -originY);
    offsetX = 0;
  }
  Object.values(circuit.wires).forEach(w => drawWire(ctx, w, phase, offsetX, camera));
  Object.values(circuit.blocks).forEach(b =>
    drawBlock(ctx, b, offsetX, b.id === hoverId, camera)
  );
  ctx.restore();
}

// Draw palette on the left panel
export function drawPanel(ctx, items, panelWidth, canvasHeight, groups = [], options = {}) {
  const {
    background = '#ffffff',
    border = '#ddd',
    labelColor = '#555',
    itemGradient = ['#f0f0ff', '#d0d0ff']
  } = options;
  ctx.clearRect(0, 0, panelWidth, canvasHeight);
  groups.forEach(g => {
    ctx.save();
    ctx.fillStyle = background;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    roundRect(ctx, g.x, g.y, g.w, g.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = labelColor;
    // group headings in Noto Sans KR
    ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(g.label, g.x + g.w / 2, g.y + g.padding);
    ctx.restore();
  });
  items.forEach(item => {
    if (item.hidden) return;
    ctx.save();
    // mimic block appearance in palette items
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    const grad = ctx.createLinearGradient(item.x, item.y, item.x, item.y + item.h);
    grad.addColorStop(0, itemGradient[0]);
    grad.addColorStop(1, itemGradient[1]);
    ctx.fillStyle = grad;
    roundRect(ctx, item.x, item.y, item.w, item.h, 6);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label || item.type, item.x + item.w / 2, item.y + item.h / 2);
    ctx.restore();
  });
}
