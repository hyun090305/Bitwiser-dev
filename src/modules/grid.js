const DEFAULT_GRID_SIZE = 6;

let gridRows = DEFAULT_GRID_SIZE;
let gridCols = DEFAULT_GRID_SIZE;

let playCircuit = null;
let playController = null;
let problemCircuit = null;
let problemController = null;

const circuitModifiedListeners = new Set();

export function getGridRows() {
  return gridRows;
}

export function getGridCols() {
  return gridCols;
}

export function getGridDimensions() {
  return [gridRows, gridCols];
}

export function setGridDimensions(rows, cols) {
  gridRows = rows;
  gridCols = cols;
}

export function getPlayCircuit() {
  return playCircuit;
}

export function getProblemCircuit() {
  return problemCircuit;
}

export function getActiveCircuit() {
  return problemCircuit || playCircuit;
}

export function getPlayController() {
  return playController;
}

export function getProblemController() {
  return problemController;
}

export function getActiveController() {
  return problemController || playController;
}

export function destroyPlayContext() {
  playController?.destroy?.();
  playController = null;
  playCircuit = null;
}

export function destroyProblemContext({ destroyController = true } = {}) {
  if (destroyController) {
    problemController?.destroy?.();
  }
  problemController = null;
  problemCircuit = null;
}

export function onCircuitModified(listener) {
  if (typeof listener !== 'function') return () => {};
  circuitModifiedListeners.add(listener);
  return () => {
    circuitModifiedListeners.delete(listener);
  };
}

function notifyCircuitModified() {
  circuitModifiedListeners.forEach(listener => {
    try {
      listener();
    } catch (err) {
      console.error('Error in circuit modified listener', err);
    }
  });
}

export function adjustGridZoom(containerId = 'canvasContainer') {
  const gridContainer = document.getElementById(containerId);
  if (!gridContainer) return;

  const margin = 20;
  let availableWidth = window.innerWidth - margin * 2;
  let availableHeight = window.innerHeight - margin * 2;

  if (containerId === 'canvasContainer') {
    const menuBar = document.getElementById('menuBar');
    if (menuBar) {
      const menuRect = menuBar.getBoundingClientRect();
      const isVertical = menuRect.height > menuRect.width;
      if (isVertical) {
        availableWidth -= menuRect.width;
      } else {
        availableHeight -= menuRect.height;
      }
    }
  }

  const firstCanvas = gridContainer.querySelector('canvas');
  if (!firstCanvas) return;

  const datasetWidth = parseFloat(firstCanvas.dataset?.baseWidth);
  const datasetHeight = parseFloat(firstCanvas.dataset?.baseHeight);
  const datasetDpr = parseFloat(firstCanvas.dataset?.dpr);
  let baseWidth;
  let baseHeight;

  if (Number.isFinite(datasetWidth) && Number.isFinite(datasetHeight)) {
    baseWidth = datasetWidth;
    baseHeight = datasetHeight;
  } else if (Number.isFinite(datasetDpr) && datasetDpr > 0) {
    baseWidth = firstCanvas.width / datasetDpr;
    baseHeight = firstCanvas.height / datasetDpr;
  } else {
    const dpr = window.devicePixelRatio || 1;
    baseWidth = firstCanvas.width / dpr;
    baseHeight = firstCanvas.height / dpr;
  }

  const scale = Math.min(
    availableWidth / baseWidth,
    availableHeight / baseHeight,
    1
  );

  gridContainer.querySelectorAll('canvas').forEach(c => {
    c.style.width = baseWidth * scale + 'px';
    c.style.height = baseHeight * scale + 'px';
    c.dataset.scale = scale;
  });
}

export function setupGrid(
  containerId,
  rows,
  cols,
  paletteGroups,
  options = {}
) {
  setGridDimensions(rows, cols);
  const container = document.getElementById(containerId);
  if (!container) return Promise.resolve();
  const prefix = containerId === 'problemCanvasContainer' ? 'problem' : '';
  const bgCanvas = document.getElementById(prefix ? `${prefix}BgCanvas` : 'bgCanvas');
  const contentCanvas = document.getElementById(prefix ? `${prefix}ContentCanvas` : 'contentCanvas');
  const overlayCanvas = document.getElementById(prefix ? `${prefix}OverlayCanvas` : 'overlayCanvas');

  if (prefix) {
    // Clean up the existing problem controller before creating a new one.
    destroyProblemContext({ destroyController: true });
  } else {
    destroyPlayContext();
  }

  return import('../canvas/model.js').then(m => {
    const { makeCircuit } = m;
    return import('../canvas/controller.js').then(c => {
      const { createController } = c;
      const circuit = makeCircuit(rows, cols);
      const controller = createController(
        { bgCanvas, contentCanvas, overlayCanvas },
        circuit,
        {
          wireStatusInfo: document.getElementById(
            prefix ? `${prefix}WireStatusInfo` : 'wireStatusInfo'
          ),
          wireDeleteInfo: document.getElementById(
            prefix ? `${prefix}WireDeleteInfo` : 'wireDeleteInfo'
          ),
          usedBlocksEl: document.getElementById(
            prefix ? `${prefix}UsedBlocks` : 'usedBlocks'
          ),
          usedWiresEl: document.getElementById(
            prefix ? `${prefix}UsedWires` : 'usedWires'
          )
        },
        {
          paletteGroups,
          panelWidth: 180,
          ...options,
        }
      );
      if (prefix) {
        problemCircuit = circuit;
        problemController = controller;
      } else {
        playCircuit = circuit;
        playController = controller;
      }
      adjustGridZoom(containerId);
      return controller;
    });
  });
}

export function clearGrid() {
  if (playCircuit) {
    playCircuit.blocks = {};
    playCircuit.wires = {};
  }
  if (problemCircuit) {
    problemCircuit.blocks = {};
    problemCircuit.wires = {};
  }
  markCircuitModified();
  playController?.clearSelection?.();
  problemController?.clearSelection?.();
}

export function clearWires() {
  if (playCircuit) {
    playCircuit.wires = {};
  }
  if (problemCircuit) {
    problemCircuit.wires = {};
  }
  markCircuitModified();
  playController?.clearSelection?.();
  problemController?.clearSelection?.();
}

export function markCircuitModified() {
  notifyCircuitModified();
  playController?.syncPaletteWithCircuit?.();
  problemController?.syncPaletteWithCircuit?.();
}

export function moveCircuit(dx, dy, { isProblemFixed = false } = {}) {
  const controller = getActiveController();
  if (!controller) return;
  const hasSelection = controller.state?.selection;
  let moved = false;
  if (hasSelection) {
    moved = controller.moveSelection?.(dy, dx);
  } else {
    if (controller === problemController && isProblemFixed) return;
    moved = controller.moveCircuit(dx, dy);
  }
  if (moved) {
    markCircuitModified();
  }
}

export function setupMenuToggle() {
  const menuBar = document.getElementById('menuBar');
  const gameArea = document.getElementById('gameArea');
  const toggleBtn = document.getElementById('menuToggleBtn');
  if (!menuBar || !gameArea || !toggleBtn) return;

  menuBar.addEventListener('transitionend', e => {
    if (e.propertyName === 'width') {
      adjustGridZoom();
    }
  });

  toggleBtn.addEventListener('click', () => {
    menuBar.classList.toggle('collapsed');
    gameArea.classList.toggle('menu-collapsed');
    adjustGridZoom();
  });
}

export function collapseMenuBarForMobile({ onAfterCollapse } = {}) {
  const menuBar = document.getElementById('menuBar');
  const gameArea = document.getElementById('gameArea');
  if (!menuBar || !gameArea) return;

  if (window.matchMedia('(max-width: 1024px)').matches) {
    menuBar.classList.add('collapsed');
    gameArea.classList.add('menu-collapsed');
  } else {
    menuBar.classList.remove('collapsed');
    gameArea.classList.remove('menu-collapsed');
  }

  adjustGridZoom();
  onAfterCollapse?.();
}
