import { createCamera } from '../canvas/camera.js';

const DEFAULT_GRID_SIZE = 6;

let gridRows = DEFAULT_GRID_SIZE;
let gridCols = DEFAULT_GRID_SIZE;

let playCircuit = null;
let playController = null;
let playCamera = null;
let problemCircuit = null;
let problemController = null;
let problemCamera = null;

const CIRCUIT_CONTEXT = {
  PLAY: 'play',
  PROBLEM: 'problem',
  UNKNOWN: 'unknown'
};

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
  playController?.stopEngine?.();
  playController?.destroy?.();
  playController = null;
  playCircuit = null;
  playCamera = null;
}

export function destroyProblemContext({ destroyController = true } = {}) {
  if (destroyController) {
    problemController?.stopEngine?.();
    problemController?.destroy?.();
  }
  problemController = null;
  problemCircuit = null;
  if (destroyController) {
    problemCamera = null;
  }
}

export function onCircuitModified(listener) {
  if (typeof listener !== 'function') return () => {};
  circuitModifiedListeners.add(listener);
  return () => {
    circuitModifiedListeners.delete(listener);
  };
}

function resolveCircuitContext(context) {
  if (context === CIRCUIT_CONTEXT.PLAY || context === CIRCUIT_CONTEXT.PROBLEM) {
    return context;
  }
  if (context === CIRCUIT_CONTEXT.UNKNOWN) {
    return CIRCUIT_CONTEXT.UNKNOWN;
  }
  if (context && typeof context === 'object') {
    if (context === problemCircuit || context === problemController) {
      return CIRCUIT_CONTEXT.PROBLEM;
    }
    if (context === playCircuit || context === playController) {
      return CIRCUIT_CONTEXT.PLAY;
    }
  }

  if (problemController && !playController) {
    return CIRCUIT_CONTEXT.PROBLEM;
  }
  if (!problemController && playController) {
    return CIRCUIT_CONTEXT.PLAY;
  }

  const activeController = getActiveController();
  if (activeController === problemController) {
    return CIRCUIT_CONTEXT.PROBLEM;
  }
  if (activeController === playController) {
    return CIRCUIT_CONTEXT.PLAY;
  }

  return CIRCUIT_CONTEXT.UNKNOWN;
}

function notifyCircuitModified(context = CIRCUIT_CONTEXT.UNKNOWN) {
  const resolvedContext = resolveCircuitContext(context);
  circuitModifiedListeners.forEach(listener => {
    try {
      listener(resolvedContext);
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

  const panelWidth = parseFloat(firstCanvas.dataset?.panelWidth);
  const baseGridWidth = parseFloat(firstCanvas.dataset?.gridBaseWidth);
  const baseGridHeight = parseFloat(firstCanvas.dataset?.gridBaseHeight);

  const isProblemContainer = containerId === 'problemCanvasContainer';
  const controller = isProblemContainer ? problemController : playController;
  const camera = isProblemContainer ? problemCamera : playCamera;

  if (camera && typeof controller?.resizeCanvas === 'function') {
    const MIN_CAMERA_SCALE = 0.2;
    const resolvedPanelWidth = Number.isFinite(panelWidth)
      ? panelWidth
      : Math.max(0, baseWidth - (Number.isFinite(baseGridWidth) ? baseGridWidth : 0));
    const resolvedGridWidth = Number.isFinite(baseGridWidth)
      ? baseGridWidth
      : Math.max(0, baseWidth - resolvedPanelWidth);
    const resolvedGridHeight = Number.isFinite(baseGridHeight)
      ? baseGridHeight
      : baseHeight;

    const gridAvailableWidth = Math.max(0, availableWidth - resolvedPanelWidth);
    const gridAvailableHeight = Math.max(0, availableHeight);

    let scale = 1;
    if (resolvedGridWidth > 0) {
      if (gridAvailableWidth > 0) {
        scale = Math.min(scale, gridAvailableWidth / resolvedGridWidth);
      } else {
        scale = Math.min(scale, MIN_CAMERA_SCALE);
      }
    }
    if (resolvedGridHeight > 0) {
      if (gridAvailableHeight > 0) {
        scale = Math.min(scale, gridAvailableHeight / resolvedGridHeight);
      } else {
        scale = Math.min(scale, MIN_CAMERA_SCALE);
      }
    }

    if (!Number.isFinite(scale) || scale <= 0) {
      scale = MIN_CAMERA_SCALE;
    }

    if (scale > 1) {
      scale = 1;
    }

    if (scale < MIN_CAMERA_SCALE) {
      scale = MIN_CAMERA_SCALE;
    }

    const targetWidth = resolvedPanelWidth + resolvedGridWidth * scale;
    const targetHeight = resolvedGridHeight * scale;

    controller.resizeCanvas(targetWidth, targetHeight);
    camera.reset?.();
    camera.setScale?.(scale);

    gridContainer.querySelectorAll('canvas').forEach(c => {
      c.dataset.scale = scale;
    });
    return;
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
      const {
        onCircuitModified: customCircuitModified,
        camera: providedCamera,
        ...restOptions
      } = options;
      const gridContext = prefix ? CIRCUIT_CONTEXT.PROBLEM : CIRCUIT_CONTEXT.PLAY;
      const handleCircuitModified = () => {
        markCircuitModified(gridContext);
        if (typeof customCircuitModified === 'function') {
          try {
            customCircuitModified();
          } catch (err) {
            console.error('Error in custom onCircuitModified callback', err);
          }
        }
      };
      const circuit = makeCircuit(rows, cols);
      let camera = providedCamera || null;
      if (!camera) {
        if (prefix) {
          if (!problemCamera) {
            problemCamera = createCamera({ panelWidth: 180 });
          }
          camera = problemCamera;
        } else {
          if (!playCamera) {
            playCamera = createCamera({ panelWidth: 180 });
          }
          camera = playCamera;
        }
        camera?.reset?.();
      }
      const controller = createController(
        { bgCanvas, contentCanvas, overlayCanvas },
        circuit,
        {
          wireMoveInfo: document.getElementById(
            prefix ? `${prefix}WireMoveInfo` : 'wireMoveInfo'
          ),
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
          ...restOptions,
          camera,
          onCircuitModified: handleCircuitModified,
        }
      );
      if (prefix) {
        problemCircuit = circuit;
        problemController = controller;
        problemCamera = camera;
      } else {
        playCircuit = circuit;
        playController = controller;
        playCamera = camera;
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
    markCircuitModified(CIRCUIT_CONTEXT.PLAY);
  }
  if (problemCircuit) {
    problemCircuit.blocks = {};
    problemCircuit.wires = {};
    markCircuitModified(CIRCUIT_CONTEXT.PROBLEM);
  }
  playController?.clearSelection?.();
  problemController?.clearSelection?.();
}

export function clearWires() {
  if (playCircuit) {
    playCircuit.wires = {};
    markCircuitModified(CIRCUIT_CONTEXT.PLAY);
  }
  if (problemCircuit) {
    problemCircuit.wires = {};
    markCircuitModified(CIRCUIT_CONTEXT.PROBLEM);
  }
  playController?.clearSelection?.();
  problemController?.clearSelection?.();
}

export function markCircuitModified(context) {
  const resolvedContext = resolveCircuitContext(context);
  notifyCircuitModified(resolvedContext);
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
    const context = controller === problemController
      ? CIRCUIT_CONTEXT.PROBLEM
      : CIRCUIT_CONTEXT.PLAY;
    markCircuitModified(context);
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
