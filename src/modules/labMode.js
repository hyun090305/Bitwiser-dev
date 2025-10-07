import { CELL, GAP } from '../canvas/model.js';

const DEFAULT_BLOCKS = [
  { type: 'INPUT', label: 'IN A' },
  { type: 'INPUT', label: 'IN B' },
  { type: 'AND', label: 'AND' },
  { type: 'OR', label: 'OR' },
  { type: 'NOT', label: 'NOT' },
  { type: 'JUNCTION', label: 'JUNC' },
  { type: 'OUTPUT', label: 'OUT' }
];

const PALETTE_WIDTH = 260;
const SAMPLE_BLOCKS = [
  { id: 'inA', type: 'INPUT', label: 'IN A', pos: { r: 3, c: 2 } },
  { id: 'inB', type: 'INPUT', label: 'IN B', pos: { r: 5, c: 2 } },
  { id: 'and', type: 'AND', label: 'AND', pos: { r: 4, c: 6 } },
  { id: 'out', type: 'OUTPUT', label: 'OUT', pos: { r: 4, c: 10 } }
];

const SAMPLE_WIRES = [
  {
    path: [
      { r: 3, c: 2 },
      { r: 3, c: 3 },
      { r: 3, c: 4 },
      { r: 3, c: 5 },
      { r: 4, c: 5 },
      { r: 4, c: 6 }
    ]
  },
  {
    path: [
      { r: 5, c: 2 },
      { r: 5, c: 3 },
      { r: 5, c: 4 },
      { r: 5, c: 5 },
      { r: 4, c: 5 },
      { r: 4, c: 6 }
    ]
  },
  {
    path: [
      { r: 4, c: 6 },
      { r: 4, c: 7 },
      { r: 4, c: 8 },
      { r: 4, c: 9 },
      { r: 4, c: 10 }
    ]
  }
];

function drawGrid(ctx, camera, paletteWidth) {
  const cssWidth = parseFloat(ctx.canvas.dataset.cssWidth || ctx.canvas.width);
  const cssHeight = parseFloat(ctx.canvas.dataset.cssHeight || ctx.canvas.height);
  ctx.save();
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const scale = camera.scale;
  const cellSize = CELL * scale;
  const gap = GAP * scale;
  const step = cellSize + gap;

  const offsetX = (camera.x % step + step) % step;
  const offsetY = (camera.y % step + step) % step;

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;

  for (let x = paletteWidth - offsetX; x < cssWidth; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }

  for (let y = -offsetY; y < cssHeight; y += step) {
    ctx.beginPath();
    ctx.moveTo(paletteWidth, y);
    ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPalette(ctx, palette, paletteWidth) {
  ctx.save();
  ctx.translate(0, 0);
  ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
  const cssHeight = parseFloat(ctx.canvas.dataset.cssHeight || ctx.canvas.height);
  ctx.fillRect(24, 24, paletteWidth - 48, cssHeight - 48);
  ctx.shadowColor = 'transparent';

  const innerX = 24;
  const innerWidth = paletteWidth - 48;
  const itemHeight = 52;
  const itemRadius = 10;

  ctx.font = '600 16px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e2e8f0';

  palette.forEach((block, index) => {
    const y = 56 + index * (itemHeight + 12);
    roundedRect(ctx, innerX + 16, y, innerWidth - 32, itemHeight, itemRadius);
    const gradient = ctx.createLinearGradient(
      innerX + 16,
      y,
      innerX + 16,
      y + itemHeight
    );
    gradient.addColorStop(0, 'rgba(79, 70, 229, 0.85)');
    gradient.addColorStop(1, 'rgba(129, 140, 248, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(block.label || block.type, innerX + innerWidth / 2, y + itemHeight / 2);
    ctx.fillStyle = '#e2e8f0';
  });

  ctx.restore();
}

function drawSampleCircuit(ctx, camera, paletteWidth) {
  const scale = camera.scale;
  const step = (CELL + GAP) * scale;
  const cellSize = CELL * scale;
  const baseX = paletteWidth + GAP * scale - camera.x;
  const baseY = GAP * scale - camera.y;

  ctx.save();
  ctx.lineWidth = Math.max(1.5, 2.5 * scale);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.75)';
  ctx.lineCap = 'round';
  SAMPLE_WIRES.forEach(wire => {
    const [first, ...rest] = wire.path;
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(
      baseX + first.c * step + cellSize / 2,
      baseY + first.r * step + cellSize / 2
    );
    rest.forEach(point => {
      ctx.lineTo(
        baseX + point.c * step + cellSize / 2,
        baseY + point.r * step + cellSize / 2
      );
    });
    ctx.stroke();
  });
  ctx.restore();

  SAMPLE_BLOCKS.forEach(block => {
    const x = baseX + block.pos.c * step;
    const y = baseY + block.pos.r * step;
    const radius = 10 * scale;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = 12 * scale;
    ctx.shadowOffsetX = 4 * scale;
    ctx.shadowOffsetY = 6 * scale;
    roundedRect(ctx, x, y, cellSize, cellSize, radius);
    const gradient = ctx.createLinearGradient(x, y, x, y + cellSize);
    if (block.type === 'OUTPUT') {
      gradient.addColorStop(0, 'rgba(248, 250, 252, 0.95)');
      gradient.addColorStop(1, 'rgba(148, 163, 184, 0.95)');
    } else if (block.type === 'INPUT') {
      gradient.addColorStop(0, 'rgba(129, 140, 248, 0.95)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.95)');
    } else {
      gradient.addColorStop(0, 'rgba(96, 165, 250, 0.95)');
      gradient.addColorStop(1, 'rgba(37, 99, 235, 0.95)');
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = `${Math.max(14, 18 * scale)}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(block.label, x + cellSize / 2, y + cellSize / 2);
    ctx.restore();
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function setupResize(canvas) {
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.dataset.dpr = String(dpr);
    canvas.dataset.cssWidth = String(rect.width);
    canvas.dataset.cssHeight = String(rect.height);
    const ctx = canvas.getContext('2d');
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
  };
  resize();
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
}

export function initializeLabMode({
  labButtonId = 'labBtn',
  labScreenId = 'labScreen',
  labCanvasId = 'labCanvas',
  labPanelHostId = 'labRightPanel',
  rightPanelId = 'rightPanel',
  exitButtonId = 'labExitBtn'
} = {}) {
  const labBtn = document.getElementById(labButtonId);
  const labScreen = document.getElementById(labScreenId);
  const labCanvas = document.getElementById(labCanvasId);
  const panelHost = document.getElementById(labPanelHostId);
  const rightPanel = document.getElementById(rightPanelId);
  if (!labBtn || !labScreen || !labCanvas || !panelHost || !rightPanel) {
    return;
  }

  const originalParent = rightPanel.parentElement;
  const originalSibling = rightPanel.nextSibling;
  const titleEl = rightPanel.querySelector('#gameTitle');
  const originalTitle = titleEl?.textContent ?? '';

  let spacePressed = false;
  const camera = { x: 0, y: 0, scale: 1 };
  const state = { panning: false, startX: 0, startY: 0, startCamX: 0, startCamY: 0 };
  let stopResize = null;
  let animationId = null;

  const ctx = labCanvas.getContext('2d');

  function render() {
    drawGrid(ctx, camera, PALETTE_WIDTH);
    drawPalette(ctx, DEFAULT_BLOCKS, PALETTE_WIDTH);
    drawSampleCircuit(ctx, camera, PALETTE_WIDTH);
    animationId = requestAnimationFrame(render);
  }

  function onMouseDown(event) {
    if (event.button === 1 || (event.button === 0 && spacePressed)) {
      state.panning = true;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.startCamX = camera.x;
      state.startCamY = camera.y;
      event.preventDefault();
    }
  }

  function onMouseMove(event) {
    if (!state.panning) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    camera.x = state.startCamX - dx;
    camera.y = state.startCamY - dy;
  }

  function onMouseUp(event) {
    if (event.button === 1 || event.button === 0) {
      state.panning = false;
    }
  }

  function onWheel(event) {
    const prevScale = camera.scale;
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const nextScale = Math.min(2.5, Math.max(0.5, prevScale * scaleFactor));
    if (nextScale === prevScale) return;
    const rect = labCanvas.getBoundingClientRect();
    const focusX = event.clientX - rect.left;
    const focusY = event.clientY - rect.top;
    camera.x = (camera.x + focusX) * (nextScale / prevScale) - focusX;
    camera.y = (camera.y + focusY) * (nextScale / prevScale) - focusY;
    camera.scale = nextScale;
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (event.code === 'Space') {
      spacePressed = true;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (event.code === 'Space') {
      spacePressed = false;
    }
  }

  function exitLabMode() {
    labScreen.classList.remove('active');
    labScreen.style.display = 'none';
    rightPanel.classList.remove('lab-fixed');
    const gradeBtn = rightPanel.querySelector('#gradeButton');
    if (gradeBtn) gradeBtn.style.display = '';
    spacePressed = false;
    state.panning = false;
    if (titleEl) titleEl.textContent = originalTitle;
    if (originalParent) {
      if (originalSibling) {
        originalParent.insertBefore(rightPanel, originalSibling);
      } else {
        originalParent.appendChild(rightPanel);
      }
    }
    document.getElementById('firstScreen')?.style.removeProperty('display');
    document.getElementById('firstScreen')?.removeAttribute('aria-hidden');
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    labCanvas.removeEventListener('mousedown', onMouseDown);
    labCanvas.removeEventListener('mousemove', onMouseMove);
    labCanvas.removeEventListener('wheel', onWheel);
    document.removeEventListener('mouseup', onMouseUp);
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    stopResize?.();
    stopResize = null;
  }

  function enterLabMode() {
    document.getElementById('firstScreen')?.setAttribute('aria-hidden', 'true');
    document.getElementById('firstScreen')?.style.setProperty('display', 'none');
    labScreen.style.display = 'block';
    labScreen.classList.add('active');
    panelHost.appendChild(rightPanel);
    rightPanel.classList.add('lab-fixed');
    const gradeBtn = rightPanel.querySelector('#gradeButton');
    if (gradeBtn) gradeBtn.style.display = 'none';
    if (titleEl) titleEl.textContent = '🔬 Bitwiser Lab';
    let exitBtn = rightPanel.querySelector(`#${exitButtonId}`);
    if (!exitBtn) {
      exitBtn = document.createElement('button');
      exitBtn.id = exitButtonId;
      exitBtn.className = 'main-button';
      exitBtn.textContent = '← 메인으로';
      exitBtn.addEventListener('click', exitLabMode);
      rightPanel.prepend(exitBtn);
    }

    if (!labScreen.contains(exitBtn)) {
      rightPanel.prepend(exitBtn);
    }

    stopResize?.();
    stopResize = setupResize(labCanvas);

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    labCanvas.addEventListener('mousedown', onMouseDown);
    labCanvas.addEventListener('mousemove', onMouseMove);
    labCanvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('mouseup', onMouseUp);
    if (animationId === null) {
      render();
    }
  }

  labBtn.addEventListener('click', () => {
    enterLabMode();
  });
}

export default initializeLabMode;
