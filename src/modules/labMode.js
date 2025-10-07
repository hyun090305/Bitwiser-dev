import { makeCircuit } from '../canvas/model.js';
import { createController } from '../canvas/controller.js';
import { createCamera } from '../canvas/camera.js';
import { buildPaletteGroups, getLevelBlockSets } from './levels.js';

function collectPaletteGroups() {
  const blockSets = typeof getLevelBlockSets === 'function' ? getLevelBlockSets() : {};
  const unique = new Map();
  Object.values(blockSets).forEach(list => {
    (list || []).forEach(block => {
      if (!block || !block.type) return;
      if (block.type === 'INPUT' || block.type === 'OUTPUT') return;
      const key = `${block.type}:${block.name || ''}`;
      if (!unique.has(key)) {
        unique.set(key, {
          type: block.type,
          name: block.name,
        });
      }
    });
  });

  if (!unique.size) {
    [
      { type: 'AND' },
      { type: 'OR' },
      { type: 'NOT' },
      { type: 'XOR' },
      { type: 'JUNCTION', name: 'JUNC' }
    ].forEach(block => {
      unique.set(`${block.type}:${block.name || ''}`, block);
    });
  }

  const dynamicInputs = Array.from({ length: 5 }).map((_, i) => ({
    type: 'INPUT',
    name: `IN${i + 1}`,
  }));
  const dynamicOutputs = Array.from({ length: 5 }).map((_, i) => ({
    type: 'OUTPUT',
    name: `OUT${i + 1}`,
  }));
  const otherBlocks = Array.from(unique.values()).map(block => ({
    type: block.type,
    name: block.name,
  }));
  const blocks = [...dynamicInputs, ...dynamicOutputs, ...otherBlocks];
  return buildPaletteGroups(blocks);
}

let labInitialized = false;
let labController = null;
let labCircuit = null;
let labCamera = null;
let rightPanelPlaceholder = null;
let originalGradeDisplay = '';
let originalGameTitleText = '';

function moveRightPanelInto(container) {
  const rightPanel = document.getElementById('rightPanel');
  if (!rightPanel || !container) return;
  if (!rightPanelPlaceholder) {
    rightPanelPlaceholder = document.createElement('div');
    rightPanelPlaceholder.style.display = 'none';
    rightPanel.parentElement?.insertBefore(rightPanelPlaceholder, rightPanel);
  }
  container.appendChild(rightPanel);
  const gradeButton = document.getElementById('gradeButton');
  if (gradeButton) {
    originalGradeDisplay = gradeButton.style.display;
    gradeButton.style.display = 'none';
  }
  rightPanel.classList.add('lab-right-panel');
}

function restoreRightPanel() {
  const rightPanel = document.getElementById('rightPanel');
  if (!rightPanel || !rightPanelPlaceholder?.parentElement) return;
  rightPanel.classList.remove('lab-right-panel');
  rightPanelPlaceholder.parentElement.insertBefore(rightPanel, rightPanelPlaceholder);
  const gradeButton = document.getElementById('gradeButton');
  if (gradeButton) {
    gradeButton.style.display = originalGradeDisplay;
  }
}

function createLabController() {
  const bgCanvas = document.getElementById('labBgCanvas');
  const contentCanvas = document.getElementById('labContentCanvas');
  const overlayCanvas = document.getElementById('labOverlayCanvas');
  if (!bgCanvas || !contentCanvas || !overlayCanvas) return;

  labCircuit = makeCircuit(24, 24);
  const paletteGroups = collectPaletteGroups();
  labCamera = createCamera({ panelWidth: 220 });

  const { innerWidth, innerHeight } = window;
  labController = createController(
    { bgCanvas, contentCanvas, overlayCanvas },
    labCircuit,
    {
      wireStatusInfo: document.getElementById('wireStatusInfo'),
      wireDeleteInfo: document.getElementById('wireDeleteInfo'),
      usedBlocksEl: document.getElementById('usedBlocks'),
      usedWiresEl: document.getElementById('usedWires')
    },
    {
      paletteGroups,
      panelWidth: 220,
      camera: labCamera,
      dynamicPaletteConfig: {
        INPUT: { prefix: 'IN', startIndex: 1 },
        OUTPUT: { prefix: 'OUT', startIndex: 1 },
      },
      unboundedGrid: true,
      canvasSize: { width: innerWidth, height: innerHeight },
      panelDrawOptions: {
        grid: {
          background: '#e4ecff',
          panelFill: '#eef2ff',
          gridFillA: 'rgba(148, 163, 184, 0.16)',
          gridFillB: 'rgba(148, 163, 184, 0.24)',
          gridStroke: 'rgba(99, 102, 241, 0.28)'
        },
        panel: {
          panelBackground: '#f8faff',
          background: '#f0f4ff',
          border: 'rgba(148, 163, 184, 0.55)',
          labelColor: '#1e293b',
          itemGradient: ['rgba(226, 232, 255, 0.95)', 'rgba(199, 210, 254, 0.92)']
        }
      }
    }
  );

  const resizeObserver = () => {
    if (!labController?.resizeCanvas) return;
    labController.resizeCanvas(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resizeObserver);
}

function showLabScreen() {
  const labScreen = document.getElementById('labScreen');
  if (!labScreen) return;
  const firstScreen = document.getElementById('firstScreen');
  if (firstScreen) firstScreen.style.display = 'none';
  moveRightPanelInto(labScreen);
  labScreen.style.display = 'block';
  document.body.classList.add('lab-mode-active');
  const titleEl = document.getElementById('gameTitle');
  if (titleEl) {
    if (!originalGameTitleText) {
      originalGameTitleText = titleEl.textContent || '';
    }
    titleEl.textContent = '🔬 Lab Mode';
  }
  if (!labInitialized) {
    createLabController();
    labInitialized = true;
  } else {
    labController?.resizeCanvas?.(window.innerWidth, window.innerHeight);
  }
}

function hideLabScreen() {
  const labScreen = document.getElementById('labScreen');
  if (!labScreen) return;
  labScreen.style.display = 'none';
  restoreRightPanel();
  const firstScreen = document.getElementById('firstScreen');
  if (firstScreen) firstScreen.style.display = '';
  document.body.classList.remove('lab-mode-active');
  const titleEl = document.getElementById('gameTitle');
  if (titleEl) {
    const fallbackTitle = originalGameTitleText || '🧠 Bitwiser';
    titleEl.textContent = fallbackTitle;
  }
}

export function initializeLabMode() {
  const labBtn = document.getElementById('labBtn');
  if (!labBtn) return;
  const exitBtn = document.getElementById('labExitBtn');

  labBtn.addEventListener('click', () => {
    showLabScreen();
  });

  exitBtn?.addEventListener('click', () => {
    hideLabScreen();
  });
}
