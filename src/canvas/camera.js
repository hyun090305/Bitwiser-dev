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
  let worldWidth = Number.POSITIVE_INFINITY;
  let worldHeight = Number.POSITIVE_INFINITY;
  let clampToBounds = false;
  let minScaleForBounds = 0;

  function getEffectiveViewportWidth() {
    return Math.max(0, viewportWidth - panel);
  }

  function getEffectiveViewportHeight() {
    return Math.max(0, viewportHeight);
  }

  function hasFiniteWidth() {
    return Number.isFinite(worldWidth);
  }

  function hasFiniteHeight() {
    return Number.isFinite(worldHeight);
  }

  function clampNumber(value, min, max) {
    if (min > max) {
      return (min + max) / 2;
    }
    return Math.max(min, Math.min(max, value));
  }

  function clampOrigin() {
    if (!clampToBounds) return;
    const effectiveWidth = getEffectiveViewportWidth();
    const effectiveHeight = getEffectiveViewportHeight();
    if (hasFiniteWidth() && currentScale > 0) {
      const visibleWidth = effectiveWidth / currentScale;
      const maxOriginX = worldWidth - visibleWidth;
      if (Number.isFinite(maxOriginX)) {
        if (maxOriginX >= 0) {
          originX = clampNumber(originX, 0, maxOriginX);
        } else {
          originX = maxOriginX / 2;
        }
      }
    }
    if (hasFiniteHeight() && currentScale > 0) {
      const visibleHeight = effectiveHeight / currentScale;
      const maxOriginY = worldHeight - visibleHeight;
      if (Number.isFinite(maxOriginY)) {
        if (maxOriginY >= 0) {
          originY = clampNumber(originY, 0, maxOriginY);
        } else {
          originY = maxOriginY / 2;
        }
      }
    }
  }

  function updateBoundConstraints() {
    if (!clampToBounds) {
      minScaleForBounds = 0;
      return;
    }
    const effectiveWidth = getEffectiveViewportWidth();
    const effectiveHeight = getEffectiveViewportHeight();
    let nextMinScale = 0;
    if (hasFiniteWidth() && worldWidth > 0 && effectiveWidth > 0) {
      nextMinScale = Math.max(nextMinScale, effectiveWidth / worldWidth);
    }
    if (hasFiniteHeight() && worldHeight > 0 && effectiveHeight > 0) {
      nextMinScale = Math.max(nextMinScale, effectiveHeight / worldHeight);
    }
    if (!Number.isFinite(nextMinScale) || nextMinScale < 0) {
      nextMinScale = 0;
    }
    minScaleForBounds = nextMinScale;
    if (minScaleForBounds > 0 && currentScale < minScaleForBounds) {
      currentScale = minScaleForBounds;
    }
    clampOrigin();
  }

  function clampScaleToBounds(nextScale) {
    let scaleValue = nextScale;
    if (!Number.isFinite(scaleValue) || scaleValue <= 0) return null;
    if (clampToBounds && minScaleForBounds > 0) {
      scaleValue = Math.max(scaleValue, minScaleForBounds);
    }
    return scaleValue;
  }

  function notifyChange() {
    if (typeof changeHandler === 'function') {
      changeHandler(getState());
    }
  }

  function setViewport(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    viewportWidth = width;
    viewportHeight = height;
    updateBoundConstraints();
    notifyChange();
  }

  function setPanelWidth(width) {
    if (!Number.isFinite(width)) return;
    panel = width;
    updateBoundConstraints();
    notifyChange();
  }

  function pan(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const beforeX = originX;
    const beforeY = originY;
    originX -= dx / currentScale;
    originY -= dy / currentScale;
    clampOrigin();
    const changed =
      Math.abs(originX - beforeX) > 1e-6 ||
      Math.abs(originY - beforeY) > 1e-6;
    if (changed) notifyChange();
    return changed;
  }

  function setScale(nextScale, pivotX, pivotY) {
    const clamped = clampScaleToBounds(nextScale);
    if (!Number.isFinite(clamped) || clamped <= 0) return false;
    const beforeScale = currentScale;
    const beforeOriginX = originX;
    const beforeOriginY = originY;
    if (pivotX !== undefined && pivotY !== undefined) {
      const before = screenToWorld(pivotX, pivotY);
      currentScale = clamped;
      const after = screenToWorld(pivotX, pivotY);
      originX += before.x - after.x;
      originY += before.y - after.y;
    } else {
      currentScale = clamped;
    }
    clampOrigin();
    const changed =
      Math.abs(currentScale - beforeScale) > 1e-6 ||
      Math.abs(originX - beforeOriginX) > 1e-6 ||
      Math.abs(originY - beforeOriginY) > 1e-6;
    if (changed) notifyChange();
    return changed;
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

  function setBounds(width, height, { clamp = true } = {}) {
    const normalizedWidth = Number.isFinite(width) && width >= 0
      ? width
      : Number.POSITIVE_INFINITY;
    const normalizedHeight = Number.isFinite(height) && height >= 0
      ? height
      : Number.POSITIVE_INFINITY;
    worldWidth = normalizedWidth;
    worldHeight = normalizedHeight;
    clampToBounds = Boolean(clamp) && (hasFiniteWidth() || hasFiniteHeight());
    updateBoundConstraints();
    notifyChange();
  }

  function setOnChange(handler) {
    changeHandler = typeof handler === 'function' ? handler : null;
  }

  function reset() {
    originX = 0;
    originY = 0;
    currentScale = scale;
    updateBoundConstraints();
    notifyChange();
  }

  return {
    pan,
    setScale,
    setViewport,
    setPanelWidth,
    setBounds,
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
