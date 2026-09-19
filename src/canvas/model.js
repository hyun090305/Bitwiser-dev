export const CELL = 50; // px — existing CSS cell size
export const GAP = 2;   // px gap between cells and around the grid

export function makeCircuit(rows = 6, cols = 6) {
  return { rows, cols, blocks: {}, wires: {} };
}

export function coord(r, c) {
  return { r, c };
}

export function newBlock({ id, type, name, pos, value = false, fixed = false, inputMode }) {
  return { id, type, name, pos, value: type === 'D' ? false : value, fixed,
    ...(type === 'INPUT' && inputMode ? { inputMode } : {}) };
}

export function newWire({ id, path, startBlockId, endBlockId, inputRole }) {
  return { id, path, startBlockId, endBlockId, flow: [], ...(inputRole ? { inputRole } : {}) };
}
