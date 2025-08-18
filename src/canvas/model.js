export const CELL = 50; // px — existing CSS cell size

export function makeCircuit(rows = 6, cols = 6) {
  return { rows, cols, blocks: {}, wires: {} };
}

export function coord(r, c) {
  return { r, c };
}

export function newBlock({ id, type, name, pos }) {
  return { id, type, name, pos, value: false };
}

export function newWire({ id, path, startBlockId, endBlockId }) {
  return { id, path, startBlockId, endBlockId, flow: [] };
}
