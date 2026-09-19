import { initializeBgm } from './bgm.js';

const loadingState = {
  milestone: 0,
  totalTaskWeight: 0,
  completedTaskWeight: 0
};
let loadingDotElements = [];

const DOT_FONT_5X7 = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010']
};

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function createDotMap(text) {
  const chars = String(text || '').toUpperCase().split('');
  const rows = 7;
  const interLetterGap = 1;
  const defaultGlyph = DOT_FONT_5X7.I;
  const glyphWidth = 5;
  const width = chars.length * glyphWidth + Math.max(0, chars.length - 1) * interLetterGap;
  const matrix = Array.from({ length: rows }, () => Array(width).fill(0));

  let xOffset = 0;
  chars.forEach((char, index) => {
    const glyph = DOT_FONT_5X7[char] || defaultGlyph;
    for (let y = 0; y < rows; y += 1) {
      const row = glyph[y] || '00000';
      for (let x = 0; x < glyphWidth; x += 1) {
        if (row[x] === '1') {
          matrix[y][xOffset + x] = 1;
        }
      }
    }
    xOffset += glyphWidth;
    if (index !== chars.length - 1) {
      xOffset += interLetterGap;
    }
  });

  return matrix;
}

export function initializeLoadingDots() {
  const dotsRoot = document.getElementById('bitwiserDots');
  if (!dotsRoot) return;

  const map = createDotMap('BITWISER');
  const rows = map.length;
  const cols = map[0]?.length || 0;
  dotsRoot.style.gridTemplateColumns = `repeat(${cols}, var(--dot-size))`;
  dotsRoot.style.gridTemplateRows = `repeat(${rows}, var(--dot-size))`;

  dotsRoot.innerHTML = '';
  loadingDotElements = [];

  const activeCells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const pixel = document.createElement('span');
      pixel.className = 'bitwiser-loader__pixel';
      dotsRoot.appendChild(pixel);
      if (map[y][x] === 1) {
        activeCells.push({ x, y, pixel });
      }
    }
  }

  loadingDotElements = activeCells
    .sort((a, b) => (a.x - b.x) || (a.y - b.y))
    .map(cell => cell.pixel);
}

function renderLoadingProgress(forcedPercent = null) {
  const loadingText = document.getElementById('loadingText');
  if (loadingText) {
    loadingText.textContent = 'loading...';
  }

  const taskPercent = loadingState.totalTaskWeight > 0
    ? (loadingState.completedTaskWeight / loadingState.totalTaskWeight) * 100
    : 0;
  const percent = clampPercent(
    forcedPercent == null
      ? Math.max(loadingState.milestone, taskPercent)
      : forcedPercent
  );

  if (!loadingDotElements.length) return;
  const litCount = Math.round((loadingDotElements.length * percent) / 100);
  loadingDotElements.forEach((pixel, index) => {
    pixel.classList.toggle('on', index < litCount);
  });
}

export function setLoadingMilestone(percent) {
  loadingState.milestone = Math.max(loadingState.milestone, clampPercent(percent));
  renderLoadingProgress();
}

export function registerLoadingTask(promise, weight = 1) {
  if (!promise || typeof promise.then !== 'function') {
    return promise;
  }
  const taskWeight = Math.max(0.1, Number(weight) || 1);
  loadingState.totalTaskWeight += taskWeight;
  renderLoadingProgress();
  return promise.finally(() => {
    loadingState.completedTaskWeight += taskWeight;
    renderLoadingProgress();
  });
}

export function hideLoadingScreen({ onStart, startLabel, startAriaLabel } = {}) {
  renderLoadingProgress(100);
  const el = document.getElementById('loadingScreen');
  if (!el) return;

  if (el.dataset.complete === 'true') return;
  el.dataset.complete = 'true';

  const DISSOLVE_MS = 720;
  const loadingText = document.getElementById('loadingText');
  const startBtn = document.getElementById('loadingStartBtn');

  const dissolve = () => {
    el.classList.add('is-dissolving');
    return new Promise(resolve => setTimeout(() => {
      el.style.display = 'none';
      resolve();
    }, DISSOLVE_MS));
  };

  if (loadingText) {
    loadingText.textContent = 'ready';
  }

  el.classList.add('is-complete');

  if (!startBtn) {
    dissolve();
    return;
  }

  if (startLabel) startBtn.textContent = startLabel;
  if (startAriaLabel) startBtn.setAttribute('aria-label', startAriaLabel);
  startBtn.disabled = false;
  startBtn.addEventListener('click', () => {
    initializeBgm();
    dissolve().then(() => onStart?.());
  }, { once: true });
}
