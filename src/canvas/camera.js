import { CELL, GAP } from './model.js';

const PITCH = CELL + GAP;

export function createCamera({ panelWidth = 0, scale = 1 } = {}) {
  let originX = 0;
  let originY = 0;
  let currentScale = scale;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let panel = panelWidth;
  let changeHandler = null;

  function notifyChange() {
    if (typeof changeHandler === 'function') {
      changeHandler(getState());
    }
  }

  function setViewport(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    viewportWidth = width;
    viewportHeight = height;
    notifyChange();
  }

  function setPanelWidth(width) {
    if (!Number.isFinite(width)) return;
    panel = width;
    notifyChange();
  }

  function pan(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    originX -= dx / currentScale;
    originY -= dy / currentScale;
    notifyChange();
  }

  function setScale(nextScale, pivotX, pivotY) {
    if (!Number.isFinite(nextScale) || nextScale <= 0) return;
    if (pivotX !== undefined && pivotY !== undefined) {
      const before = screenToWorld(pivotX, pivotY);
      currentScale = nextScale;
      const after = screenToWorld(pivotX, pivotY);
      originX += before.x - after.x;
      originY += before.y - after.y;
    } else {
      currentScale = nextScale;
    }
    notifyChange();
  }

  function screenToWorld(x, y) {
    return {
      x: originX + (x - panel) / currentScale,
      y: originY + y / currentScale
    };
  }

  function worldToScreen(x, y) {
    return {
      x: panel + (x - originX) * currentScale,
      y: (y - originY) * currentScale
    };
  }

  function screenToCell(x, y) {
    const world = screenToWorld(x, y);
    return {
      r: Math.floor((world.y - GAP) / PITCH),
      c: Math.floor((world.x - GAP) / PITCH)
    };
  }

  function cellToScreenCell({ r, c }) {
    const worldX = GAP + c * PITCH;
    const worldY = GAP + r * PITCH;
    return worldToScreen(worldX, worldY);
  }

  function getScale() {
    return currentScale;
  }

  function getState() {
    return {
      originX,
      originY,
      scale: currentScale,
      viewportWidth,
      viewportHeight,
      panelWidth: panel
    };
  }

  function setOnChange(handler) {
    changeHandler = typeof handler === 'function' ? handler : null;
  }

  function reset() {
    originX = 0;
    originY = 0;
    currentScale = scale;
    notifyChange();
  }

  return {
    pan,
    setScale,
    setViewport,
    setPanelWidth,
    screenToCell,
    screenToWorld,
    worldToScreen,
    cellToScreenCell,
    getScale,
    getState,
    setOnChange,
    reset
  };
}
