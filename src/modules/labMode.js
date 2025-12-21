import { makeCircuit } from '../canvas/model.js';
import { createController } from '../canvas/controller.js';
import { createCamera } from '../canvas/camera.js';
import { onThemeChange } from '../themes.js';
import { buildPaletteGroups, getLevelBlockSets } from './levels.js';
import { initializeCircuitCommunity } from './circuitCommunity.js';
import {
  hideStageMapScreen,
  showStageMapScreen,
  showLabScreen as revealLabScreen,
  hideLabScreen as concealLabScreen
} from './navigation.js';

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
let labCommunityControls = null;
let originalGradeDisplay = '';
let originalGameTitleText = '';
let labThemeUnsub = null;

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
  if (!labCommunityControls) {
    labCommunityControls = document.getElementById('labCommunityControls');
  }
  if (labCommunityControls) {
    labCommunityControls.style.display = 'flex';
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
  if (!labCommunityControls) {
    labCommunityControls = document.getElementById('labCommunityControls');
  }
  if (labCommunityControls) {
    labCommunityControls.style.display = 'none';
  }
}

function removeLabResizeHandler() {
  if (labResizeHandler) {
    window.removeEventListener('resize', labResizeHandler);
    labResizeHandler = null;
  }
}

function applyCameraOptions(camera, options) {
  if (!camera || !options) return;
  
  if (Number.isFinite(options.scale)) {
    camera.setScale(options.scale);
  }
  
  const state = camera.getState();
  const currentOriginX = state.originX;
  const currentOriginY = state.originY;
  const currentScale = state.scale;
  
  const targetOriginX = Number.isFinite(options.originX) ? options.originX : currentOriginX;
  const targetOriginY = Number.isFinite(options.originY) ? options.originY : currentOriginY;
  
  // Calculate dx, dy required to move from current to target
  // pan(dx, dy) -> origin -= dx/scale
  // dx = (current - target) * scale
  const dx = (currentOriginX - targetOriginX) * currentScale;
  const dy = (currentOriginY - targetOriginY) * currentScale;
  
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    camera.pan(dx, dy);
  }
}

function createLabController({ preserveCircuit = false, cameraOptions = null } = {}) {
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
    labController.setCopyPasteEnabled?.(true);
    
    // Even if reusing, we might want to apply camera options if provided (e.g. re-entering from stage map)
    if (cameraOptions && labCamera) {
      applyCameraOptions(labCamera, cameraOptions);
    }
    return;
  }

  if (!labCircuit) {
    labCircuit = makeCircuit(24, 24);
  }

  if (!labCamera) {
    labCamera = createCamera({ panelWidth: 220 });
  }
  
  if (cameraOptions) {
    applyCameraOptions(labCamera, cameraOptions);
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
      copyButton: document.getElementById('copySelectionBtn'),
      pasteButton: document.getElementById('pasteSelectionBtn'),
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
      enableCopyPaste: true,
    }
  );

  labThemeUnsub?.();
  labThemeUnsub = onThemeChange(() => {
    labController?.refreshVisuals?.();
  });

  applyDynamicIOPalette();

  removeLabResizeHandler();
  labResizeHandler = () => {
    if (!labController?.resizeCanvas) return;
    labController.resizeCanvas(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', labResizeHandler);

  labController.attachKeyboardHandlers?.();
}

function showLabModeUI(options = {}) {
  const labScreen = document.getElementById('labScreen');
  if (!labScreen) return;
  hideStageMapScreen();
  moveRightPanelInto(labScreen);
  revealLabScreen();

  // Apply entry animations
  const rightPanel = document.getElementById('rightPanel');
  if (rightPanel) {
    rightPanel.classList.remove('lab-ui-slide-in-right');
    void rightPanel.offsetWidth; // Trigger reflow
    rightPanel.classList.add('lab-ui-slide-in-right');
  }

  const titleEl = document.getElementById('gameTitle');
  if (titleEl) {
    if (!originalGameTitleText) {
      originalGameTitleText = titleEl.textContent || '';
    }
    titleEl.textContent = '🔬 Lab Mode';
    titleEl.classList.remove('lab-ui-fade-in');
    void titleEl.offsetWidth;
    titleEl.classList.add('lab-ui-fade-in');
    titleEl.style.animationDelay = '0.1s';
  }
  createLabController({ 
    preserveCircuit: labInitialized,
    cameraOptions: options.camera
  });
  labInitialized = true;
}

function hideLabModeUI() {
  const labScreen = document.getElementById('labScreen');
  if (!labScreen) return;
  
  // Capture camera state before destroying controller
  let returnCameraState = null;
  if (labCamera) {
    const { originX, originY, scale } = labCamera.getState();
    // Convert Lab Origin to Stage Map Origin
    // StageOriginX = LabOriginX - 220/Scale
    const stageOriginX = originX - 220 / scale;
    returnCameraState = {
      scale,
      originX: stageOriginX,
      originY
    };
  }

  concealLabScreen();
  restoreRightPanel();
  showStageMapScreen();
  
  if (returnCameraState) {
    document.dispatchEvent(new CustomEvent('stageMap:returnFromLab', {
      detail: { camera: returnCameraState }
    }));
  }

  removeLabResizeHandler();
  labController?.destroy?.();
  labController = null;
  if (labThemeUnsub) {
    try {
      labThemeUnsub();
    } catch (err) {
      console.error('Error unsubscribing lab theme listener', err);
    }
    labThemeUnsub = null;
  }
  const titleEl = document.getElementById('gameTitle');
  if (titleEl) {
    const fallbackTitle = originalGameTitleText || '🧠 Bitwiser';
    titleEl.textContent = fallbackTitle;
  }
}

function applyCircuitToLabData(newCircuit) {
  if (!newCircuit || typeof newCircuit !== 'object') {
    console.warn('Invalid circuit data provided to lab loader');
    return false;
  }
  const rows = Number(newCircuit.rows) || (labCircuit?.rows ?? 24);
  const cols = Number(newCircuit.cols) || (labCircuit?.cols ?? 24);
  if (!Number.isFinite(rows) || !Number.isFinite(cols)) {
    console.warn('Circuit dimensions are not finite');
    return false;
  }
  const blocks = newCircuit.blocks && typeof newCircuit.blocks === 'object' ? newCircuit.blocks : {};
  const wires = newCircuit.wires && typeof newCircuit.wires === 'object' ? newCircuit.wires : {};
  let clonedBlocks = {};
  let clonedWires = {};
  try {
    clonedBlocks = JSON.parse(JSON.stringify(blocks));
    clonedWires = JSON.parse(JSON.stringify(wires));
  } catch (err) {
    console.error('Failed to clone circuit data for lab mode', err);
    return false;
  }
  labCircuit = {
    rows,
    cols,
    blocks: clonedBlocks,
    wires: clonedWires,
  };
  labController?.destroy?.();
  labController = null;
  createLabController({ preserveCircuit: false });
  return true;
}

export function initializeLabMode() {
  const labBtn = document.getElementById('labBtn');
  const exitBtn = document.getElementById('labExitBtn');

  labBtn?.addEventListener('click', () => {
    showLabModeUI();
  });

  exitBtn?.addEventListener('click', () => {
    startExitSequence();
  });

  initializeCircuitCommunity({
    getCircuit: () => labCircuit,
    applyCircuit: circuitData => applyCircuitToLabData(circuitData),
    ensureLabVisible: () => showLabModeUI(),
    translate: typeof t === 'function' ? t : undefined,
  });
}

function startExitSequence() {
  if (!labCamera || !labController) {
    hideLabModeUI();
    return;
  }

  const state = labCamera.getState();
  const currentScale = state.scale;
  const targetScale = 0.8; // Minimum scale for smooth transition to Stage Map

  if (currentScale >= targetScale) {
    hideLabModeUI();
    return;
  }

  // Animate zoom to targetScale
  const startTime = performance.now();
  const duration = 300;
  const startScale = currentScale;
  
  // Zoom towards center of viewport
  const viewportW = state.viewportWidth || window.innerWidth;
  const viewportH = state.viewportHeight || window.innerHeight;
  const panelW = state.panelWidth || 220;
  const pivotX = panelW + (viewportW - panelW) / 2;
  const pivotY = viewportH / 2;

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    
    const nextScale = startScale + (targetScale - startScale) * ease;
    labCamera.setScale(nextScale, pivotX, pivotY);
    labController.refreshVisuals?.();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      hideLabModeUI();
    }
  }

  requestAnimationFrame(animate);
}

export function openLabModeFromShortcut(options) {
  showLabModeUI(options);
}
