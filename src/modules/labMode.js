import { makeCircuit } from '../canvas/model.js';
import { createController } from '../canvas/controller.js';
import { createCamera } from '../canvas/camera.js';
import { buildPaletteGroups, getLevelBlockSets } from './levels.js';

function getAvailableIONames(circuit, count = 5) {
  const collectNames = (type, prefix) => {
    const used = new Set();
    const pattern = new RegExp(`^${prefix}(\\d+)$`);
    if (circuit?.blocks) {
      Object.values(circuit.blocks).forEach(block => {
        if (block.type !== type || typeof block.name !== 'string') return;
        const match = block.name.match(pattern);
        if (match) {
          const idx = Number.parseInt(match[1], 10);
          if (Number.isFinite(idx)) used.add(idx);
        }
      });
    }
    const names = [];
    let cursor = 1;
    while (names.length < count) {
      if (!used.has(cursor)) {
        names.push(`${prefix}${cursor}`);
      }
      cursor += 1;
    }
    return names;
  };

  return {
    inputs: collectNames('INPUT', 'IN'),
    outputs: collectNames('OUTPUT', 'OUT'),
  };
}

function collectPaletteGroups(circuit) {
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

  const { inputs, outputs } = getAvailableIONames(circuit, 5);
  const blocks = [
    ...inputs.map(name => ({ type: 'INPUT', name })),
    ...outputs.map(name => ({ type: 'OUTPUT', name })),
    ...Array.from(unique.values()).map(block => ({
      type: block.type,
      name: block.name,
    })),
  ];
  return buildPaletteGroups(blocks);
}

let labInitialized = false;
let labController = null;
let labCircuit = null;
let labCamera = null;
let labResizeHandler = null;
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

function removeLabResizeHandler() {
  if (labResizeHandler) {
    window.removeEventListener('resize', labResizeHandler);
    labResizeHandler = null;
  }
}

function createLabController({ preserveCircuit = false } = {}) {
  const bgCanvas = document.getElementById('labBgCanvas');
  const contentCanvas = document.getElementById('labContentCanvas');
  const overlayCanvas = document.getElementById('labOverlayCanvas');
  if (!bgCanvas || !contentCanvas || !overlayCanvas) return;

  const reuseExistingCircuit = preserveCircuit && labCircuit && labController;
  const { innerWidth, innerHeight } = window;

  if (reuseExistingCircuit) {
    removeLabResizeHandler();
    labResizeHandler = () => {
      if (!labController?.resizeCanvas) return;
      labController.resizeCanvas(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', labResizeHandler);

    const { inputs, outputs } = getAvailableIONames(labCircuit, 5);
    labController.setIOPaletteNames?.(inputs, outputs);
    labController.resizeCanvas?.(innerWidth, innerHeight);
    labController.attachKeyboardHandlers?.();
    return;
  }

  if (!labCircuit) {
    labCircuit = makeCircuit(24, 24);
  }

  if (!labCamera) {
    labCamera = createCamera({ panelWidth: 220 });
  }

  const paletteGroups = collectPaletteGroups(labCircuit);

  const applyDynamicIOPalette = () => {
    if (!labController) return;
    const { inputs, outputs } = getAvailableIONames(labCircuit, 5);
    labController.setIOPaletteNames?.(inputs, outputs);
  };

  labController = createController(
    { bgCanvas, contentCanvas, overlayCanvas },
    labCircuit,
    {
      wireMoveInfo: document.getElementById('wireMoveInfo'),
      wireStatusInfo: document.getElementById('wireStatusInfo'),
      wireDeleteInfo: document.getElementById('wireDeleteInfo'),
      wireSelectInfo: document.getElementById('wireSelectInfo'),
      undoButton: document.getElementById('undoBtn'),
      redoButton: document.getElementById('redoBtn'),
      usedBlocksEl: document.getElementById('usedBlocks'),
      usedWiresEl: document.getElementById('usedWires')
    },
    {
      paletteGroups,
      panelWidth: 220,
      camera: labCamera,
      unboundedGrid: true,
      canvasSize: { width: innerWidth, height: innerHeight },
      onCircuitModified: applyDynamicIOPalette,
      panelDrawOptions: {
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

  applyDynamicIOPalette();

  removeLabResizeHandler();
  labResizeHandler = () => {
    if (!labController?.resizeCanvas) return;
    labController.resizeCanvas(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', labResizeHandler);

  labController.attachKeyboardHandlers?.();
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
  createLabController({ preserveCircuit: labInitialized });
  labInitialized = true;
}

function hideLabScreen() {
  const labScreen = document.getElementById('labScreen');
  if (!labScreen) return;
  labScreen.style.display = 'none';
  restoreRightPanel();
  const firstScreen = document.getElementById('firstScreen');
  if (firstScreen) firstScreen.style.display = '';
  document.body.classList.remove('lab-mode-active');
  removeLabResizeHandler();
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
