import { CELL, GAP } from '../canvas/model.js';
import { STAGES } from './stageCatalog.js';

export const GRID_UNIT = CELL + GAP;
export const STAGE_PANEL = { w: 25, h: 17 };
export const STAGE_CARD = { w: 4, h: 4 };
// At the shared 1440×1000 camera fit: about 320×280 px with a 60 px gap.
export const EXTRAS_CARD = { w: 7.2, h: 6.3 };
export const EXTRAS_CARD_GAP = 1.35;

export function stageSlotPosition({ column, row }, anchor = { x: 0, y: 0 }) {
  return { x: anchor.x + 2.5 - STAGE_CARD.w / 2 + 5 * (column - 1), y: anchor.y + 3.5 - STAGE_CARD.h / 2 + 5 * (row - 1) };
}

// Stage panels use exact geometric units, independent of the tiny canvas grid gaps.
export function stageWorldRect(position, size) {
  const origin = gridToWorldPoint(position);
  return { ...origin, w: size.w * GRID_UNIT, h: size.h * GRID_UNIT };
}

export function straightStageEdge(from, to) {
  const dx = Math.sign(to.center.x - from.center.x), dy = Math.sign(to.center.y - from.center.y);
  if (Math.abs(dx) + Math.abs(dy) !== 1 || dx < 0) throw new Error('Invalid stage-map direction');
  return [
    { x: from.center.x + dx * from.rect.w / 2, y: from.center.y + dy * from.rect.h / 2 },
    { x: to.center.x - dx * to.rect.w / 2, y: to.center.y - dy * to.rect.h / 2 }
  ];
}

export const STAGE_NODE_LEVEL_MAP = Object.fromEntries(STAGES.filter(s => s.status === 'playable').map(s => [s.nodeId, s.id]));

export const STAGE_TYPE_META = {
  stage: { color: '#38bdf8', accent: '#0ea5e9' },
  rank: { color: '#f59e0b', accent: '#f97316' },
  feature: { color: '#F6F6F6', accent: '#E5E7EB' },
  mode: { color: '#38bdf8', accent: '#67e8f9' }
};

export function gridToWorldPoint({ x, y }) {
  return {
    x: GAP + x * GRID_UNIT,
    y: GAP + y * GRID_UNIT
  };
}

export function gridSizeToWorldSize({ w, h }) {
  return {
    width: w * GRID_UNIT - GAP,
    height: h * GRID_UNIT - GAP
  };
}
