import { snapshotCircuit, isValidWirePath } from '../canvas/circuitData.js';

const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const validId = s => typeof s === 'string' && /^[\w-]{1,100}$/.test(s) && !['__proto__', 'constructor', 'prototype'].includes(s);
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function validateStageCircuit(raw, id, levels) {
  check(Number.isInteger(id) && levels.levelGridSizes[id] && plain(raw), 'Invalid stage/circuit');
  const [rows, cols] = levels.levelGridSizes[id];
  check(raw.rows === rows && raw.cols === cols && plain(raw.blocks) && plain(raw.wires), 'Invalid grid');
  check(Object.keys(raw.blocks).length <= rows * cols && Object.keys(raw.wires).length <= rows * cols, 'Circuit too large');
  const palette = levels.levelBlockSets[id];
  const fixed = levels.levelFixedIO?.[id]?.fixIO ? levels.levelFixedIO[id].grid : [];
  const types = new Set([...palette.map(b => b.type), 'JUNCTION']);
  const positions = new Map(), names = new Set();
  const withinBounds = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols;
  for (const [key, b] of Object.entries(raw.blocks)) {
    check(validId(key) && plain(b) && b.id === key && types.has(b.type), 'Invalid block');
    check(b.pos && Number.isInteger(b.pos.r) && Number.isInteger(b.pos.c) && withinBounds(b.pos.r, b.pos.c), 'Block outside grid');
    check(b.value === undefined || typeof b.value === 'boolean' || b.value === 0 || b.value === 1, 'Invalid signal');
    const expectedFixed = fixed.find(p => p.index === b.pos.r * cols + b.pos.c && p.type === b.type && p.name === b.name);
    check(Boolean(b.fixed) === Boolean(expectedFixed), 'Invalid fixed block');
    const pos = `${b.pos.r},${b.pos.c}`;
    check(!positions.has(pos), 'Overlapping blocks'); positions.set(pos, b);
    if (b.type === 'INPUT' || b.type === 'OUTPUT') {
      const declared = palette.find(p => p.type === b.type && p.name === b.name);
      check((b.inputMode || 'switch') === (declared?.inputMode || 'switch'), 'Unexpected input mode');
      check(palette.some(p => p.type === b.type && p.name === b.name) && !names.has(b.name), 'Invalid IO name');
      names.add(b.name);
    } else check(b.name === undefined || (typeof b.name === 'string' && b.name.length <= 40), 'Invalid block label');
  }
  check(fixed.every(p => Object.values(raw.blocks).some(b => b.fixed && b.type === p.type && b.name === p.name && b.pos.r * cols + b.pos.c === p.index)), 'Missing fixed IO');
  const occupied = new Set();
  const blockAt = p => positions.get(`${p?.r},${p?.c}`);
  for (const [key, w] of Object.entries(raw.wires)) {
    check(validId(key) && plain(w) && w.id === key && validId(w.startBlockId) && validId(w.endBlockId), 'Invalid wire');
    check(Array.isArray(w.path) && w.path.length <= rows * cols + 1 && isValidWirePath(w.path, {
      withinBounds, blockAt, cellHasWire: p => occupied.has(`${p.r},${p.c}`)
    }), 'Invalid wire path');
    check(blockAt(w.path[0])?.id === w.startBlockId && blockAt(w.path.at(-1))?.id === w.endBlockId, 'Invalid wire endpoints');
    w.path.slice(1, -1).forEach(p => occupied.add(`${p.r},${p.c}`));
  }
  return snapshotCircuit(raw);
}

