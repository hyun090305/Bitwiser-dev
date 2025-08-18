import { CELL } from './model.js';

// Utility to prepare canvas for HiDPI displays
export function setupCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

// Draw grid lines snapped to half-pixels for crisp rendering
export function drawGrid(ctx, rows, cols, offsetX = 0) {
  ctx.save();
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    const y = r * CELL + 0.5;
    ctx.beginPath();
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + cols * CELL, y);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    const x = offsetX + c * CELL + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rows * CELL);
    ctx.stroke();
  }
  ctx.restore();
}

// Blocks are drawn as rounded rectangles with text labels
export function drawBlock(ctx, block, offsetX = 0) {
  const { r, c } = block.pos;
  const x = offsetX + c * CELL;
  const y = r * CELL;
  ctx.save();
  ctx.fillStyle = '#b3e5fc'; // light blue
  ctx.strokeStyle = '#1565c0'; // dark blue
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, CELL - 8, CELL - 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0d47a1';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(block.name || block.type, x + CELL / 2, y + CELL / 2);
  ctx.restore();
}

// Draw a wire path with flowing dashed line
export function drawWire(ctx, wire, phase = 0, offsetX = 0) {
  if (!wire.path || wire.path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.setLineDash([26, 26]);
  ctx.lineDashOffset = (-phase) % 52;
  ctx.beginPath();
  const start = wire.path[0];
  ctx.moveTo(offsetX + start.c * CELL + CELL / 2, start.r * CELL + CELL / 2);
  for (let i = 1; i < wire.path.length; i++) {
    const p = wire.path[i];
    ctx.lineTo(offsetX + p.c * CELL + CELL / 2, p.r * CELL + CELL / 2);
  }
  ctx.stroke();
  ctx.restore();
}

// Render the circuit: wires then blocks to keep z-order
export function renderContent(ctx, circuit, phase = 0, offsetX = 0) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  Object.values(circuit.wires).forEach(w => drawWire(ctx, w, phase, offsetX));
  Object.values(circuit.blocks).forEach(b => drawBlock(ctx, b, offsetX));
}

// Draw palette and trash area on the left panel
export function drawPanel(ctx, items, panelWidth, canvasHeight, trashRect) {
  ctx.clearRect(0, 0, panelWidth, canvasHeight);
  items.forEach(item => {
    ctx.save();
    if (item.kind === 'label') {
      // group title
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(item.label, item.x, item.y);
    } else {
      ctx.fillStyle = '#eee';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(item.x, item.y, item.w, item.h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label || item.type, item.x + item.w / 2, item.y + item.h / 2);
    }
    ctx.restore();
  });
  if (trashRect) {
    ctx.save();
    ctx.fillStyle = '#ffe5e5';
    ctx.strokeStyle = '#aa0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(trashRect.x, trashRect.y, trashRect.w, trashRect.h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#aa0000';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗑', trashRect.x + trashRect.w / 2, trashRect.y + trashRect.h / 2);
    ctx.restore();
  }
}
