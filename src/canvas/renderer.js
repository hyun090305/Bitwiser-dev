import { CELL, GAP } from './model.js';

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
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

// Draw grid as individual tiles with gaps similar to GIF rendering
// Context should be pre-translated and scaled so grid starts at (0,0)
export function drawGrid(ctx, rows, cols) {
  const width = cols * (CELL + GAP) + GAP;
  const height = rows * (CELL + GAP) + GAP;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = GAP + c * (CELL + GAP);
      const y = GAP + r * (CELL + GAP);
      roundRect(ctx, x, y, CELL, CELL, 3);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#666';
  ctx.lineWidth = GAP;
  ctx.strokeRect(GAP / 2, GAP / 2, width - GAP, height - GAP);
  ctx.restore();
}

// Blocks are drawn as rounded rectangles with text labels
// Context should be transformed before calling
export function drawBlock(ctx, block, hovered = false) {
  const { r, c } = block.pos;
  const x = GAP + c * (CELL + GAP);
  const y = GAP + r * (CELL + GAP);
  ctx.save();

  // Drop shadow for a subtle 3D effect
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = hovered ? 8 : 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Gradient fill for depth
  const grad = ctx.createLinearGradient(x, y, x, y + CELL);
  if (hovered) {
    grad.addColorStop(0, '#fdfdff');
    grad.addColorStop(1, '#c8c8ff');
  } else {
    grad.addColorStop(0, '#f0f0ff');
    grad.addColorStop(1, '#d0d0ff');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, CELL, CELL, 6);
  ctx.fill();

  // Text
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#000';
  ctx.font = 'bold 16px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(block.name || block.type, x + CELL / 2, y + CELL / 2);
  ctx.restore();
}

// Draw a wire path with flowing dashed line
// Context should be transformed before calling
export function drawWire(ctx, wire, phase = 0) {
  if (!wire.path || wire.path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.setLineDash([20, 20]);
  ctx.lineDashOffset = (-phase) % 40;
  for (let i = 1; i < wire.path.length - 1; i++) {
    const p = wire.path[i];
    ctx.fillStyle = '#ffe';
    const x = GAP + p.c * (CELL + GAP);
    const y = GAP + p.r * (CELL + GAP);
    ctx.fillRect(x, y, CELL, CELL);
  }
  ctx.beginPath();
  const start = wire.path[0];
  ctx.moveTo(
    GAP + start.c * (CELL + GAP) + CELL / 2,
    GAP + start.r * (CELL + GAP) + CELL / 2
  );
  for (let i = 1; i < wire.path.length; i++) {
    const p = wire.path[i];
    ctx.lineTo(
      GAP + p.c * (CELL + GAP) + CELL / 2,
      GAP + p.r * (CELL + GAP) + CELL / 2
    );
  }
  ctx.stroke();
  ctx.restore();
}

// Render the circuit: wires then blocks to keep z-order
// Context should be transformed and cleared by caller
export function renderContent(ctx, circuit, phase = 0, hoverId = null) {
  Object.values(circuit.wires).forEach(w => drawWire(ctx, w, phase));
  Object.values(circuit.blocks).forEach(b =>
    drawBlock(ctx, b, b.id === hoverId)
  );
}

// Draw palette and trash area on the left panel
export function drawPanel(ctx, items, panelWidth, canvasHeight, trashRect, groups = []) {
  ctx.clearRect(0, 0, panelWidth, canvasHeight);
  groups.forEach(g => {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    roundRect(ctx, g.x, g.y, g.w, g.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#555';
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
    // palette item style matches block appearance
    ctx.fillStyle = '#dcd8ff';
    ctx.strokeStyle = '#a4a1de';
    ctx.lineWidth = 2;
    roundRect(ctx, item.x, item.y, item.w, item.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3f3d96';
    ctx.font = '14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label || item.type, item.x + item.w / 2, item.y + item.h / 2);
    ctx.restore();
  });
  if (trashRect) {
    ctx.save();
    ctx.fillStyle = '#fff2f2';
    ctx.strokeStyle = '#c44';
    ctx.lineWidth = 2;
    roundRect(ctx, trashRect.x, trashRect.y, trashRect.w, trashRect.h, 6);
    ctx.fill();
    ctx.setLineDash([6,4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c44';
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗑', trashRect.x + 8, trashRect.y + trashRect.h / 2);
    ctx.fillText('Drag here to delete', trashRect.x + 28, trashRect.y + trashRect.h / 2);
    ctx.restore();
  }
}
