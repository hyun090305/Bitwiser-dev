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
      { type: 'INPUT', name: 'A' },
      { type: 'INPUT', name: 'B' },
      { type: 'OUTPUT', name: 'OUT' },
      { type: 'AND' },
      { type: 'OR' },
      { type: 'NOT' },
      { type: 'XOR' },
      { type: 'JUNCTION', name: 'JUNC' }
    ].forEach(block => {
      unique.set(`${block.type}:${block.name || ''}`, block);
    });
  }

  const blocks = Array.from(unique.values()).map(block => ({
    type: block.type,
    name: block.name,
  }));
  return buildPaletteGroups(blocks);
}

let labInitialized = false;
let labController = null;
let labCircuit = null;
let labCamera = null;
let rightPanelPlaceholder = null;
let originalGradeDisplay = '';

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
      unboundedGrid: true,
      canvasSize: { width: innerWidth, height: innerHeight },
      panelDrawOptions: {
        grid: {
          background: '#eef2ff',
          panelFill: 'rgba(248,250,252,0.96)',
          gridFillA: 'rgba(148,163,184,0.16)',
          gridFillB: 'rgba(148,163,184,0.28)',
          gridStroke: 'rgba(100,116,139,0.25)'
        },
        panel: {
          background: '#ffffff',
          border: 'rgba(148,163,184,0.55)',
          labelColor: '#1e293b',
          itemGradient: ['rgba(241,245,249,1)', 'rgba(226,232,240,1)']
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
