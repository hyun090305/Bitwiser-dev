import { makeCircuit } from '../canvas/model.js';
import { createController } from '../canvas/controller.js';
import { createCamera } from '../canvas/camera.js';
import { buildPaletteGroups, getLevelBlockSets } from './levels.js';
import { initializeCircuitCommunity } from './circuitCommunity.js';

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
let labCommunityApi = null;

function clampDimension(value, fallback = 24) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(50, Math.max(1, Math.round(num)));
}

function sanitizeCircuitData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = {
    rows: clampDimension(raw.rows),
    cols: clampDimension(raw.cols),
    blocks: {},
    wires: {}
  };

  const sourceBlocks = raw.blocks && typeof raw.blocks === 'object' ? raw.blocks : {};
  Object.entries(sourceBlocks).forEach(([id, block]) => {
    if (!id || !block || typeof block !== 'object') return;
    const pos = block.pos || {};
    const r = Number(pos.r);
    const c = Number(pos.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    const entry = {
      id,
      type: typeof block.type === 'string' ? block.type : '',
      pos: { r: Math.round(r), c: Math.round(c) },
      value: Boolean(block.value),
      fixed: Boolean(block.fixed)
    };
    if (typeof block.name === 'string' && block.name.trim()) {
      entry.name = block.name.trim();
    }
    result.blocks[id] = entry;
  });

  const sourceWires = raw.wires && typeof raw.wires === 'object' ? raw.wires : {};
  Object.entries(sourceWires).forEach(([id, wire]) => {
    if (!id || !wire || typeof wire !== 'object') return;
    const path = Array.isArray(wire.path)
      ? wire.path
          .map(point => {
            const r = Number(point?.r);
            const c = Number(point?.c);
            if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
            return { r: Math.round(r), c: Math.round(c) };
          })
          .filter(Boolean)
      : [];
    result.wires[id] = {
      id,
      path,
      startBlockId: typeof wire.startBlockId === 'string' ? wire.startBlockId : null,
      endBlockId: typeof wire.endBlockId === 'string' ? wire.endBlockId : null,
      flow: Array.isArray(wire.flow) ? wire.flow.slice() : []
    };
  });

  return result;
}

function getLabCircuitSnapshot() {
  if (!labCircuit) return null;
  return sanitizeCircuitData(labCircuit);
}

function importCircuitFromCommunity(snapshot) {
  const sanitized = sanitizeCircuitData(snapshot);
  if (!sanitized) return false;
  labCircuit = sanitized;
  createLabController({ preserveCircuit: false });
  return true;
}

function setLabCommunityActionsVisible(visible) {
  const actions = document.getElementById('labCommunityActions');
  if (!actions) return;
  actions.hidden = !visible;
}

function ensureCommunityIntegration() {
  if (labCommunityApi) return;
  labCommunityApi = initializeCircuitCommunity({
    getCircuitSnapshot: getLabCircuitSnapshot,
    importCircuit: importCircuitFromCommunity,
    onLabRevealed: () => {
      labController?.attachKeyboardHandlers?.();
    }
  });
}

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
  setLabCommunityActionsVisible(false);
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

  if (labController) {
    labController.stopEngine?.();
    labController.destroy?.();
    labController = null;
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
  ensureCommunityIntegration();
  labCommunityApi?.hideCommunityScreen?.();
  moveRightPanelInto(labScreen);
  setLabCommunityActionsVisible(true);
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
  labCommunityApi?.hideCommunityScreen?.();
  setLabCommunityActionsVisible(false);
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

  ensureCommunityIntegration();

  labBtn.addEventListener('click', () => {
    showLabScreen();
  });

  exitBtn?.addEventListener('click', () => {
    hideLabScreen();
  });
}
