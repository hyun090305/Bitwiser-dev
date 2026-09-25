import { SUPPORTED_CIRCUIT_VERSIONS, snapshotCircuit, isValidWirePath } from '../canvas/circuitData.js';

export const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const validId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const check = condition => { if (!condition) throw new Error('Invalid saved circuit'); };
const optionalText = (value, max) => value == null || (typeof value === 'string' && value.length <= max);

export function validateSaveContext(context) {
  check(plain(context) && Object.keys(context).every(key => ['stageId', 'problemKey'].includes(key)));
  check(context.stageId == null || (Number.isSafeInteger(context.stageId) && context.stageId >= 0));
  check(optionalText(context.problemKey, 512));
  return { stageId: context.stageId ?? null, problemKey: context.stageId == null ? context.problemKey ?? null : null };
}

export function matchesSaveContext(record, context) {
  const own = validateSaveContext({ stageId: record.stageId, problemKey: record.problemKey });
  return own.stageId === context.stageId && own.problemKey === context.problemKey;
}

// Validate the entire design before restoration touches the active editor. This
// checks storage shape, not circuit correctness: unfinished/cyclic designs and
// legacy gate input counts must remain editable.
export function validateSavedCircuitRecord(record) {
  check(plain(record) && SUPPORTED_CIRCUIT_VERSIONS.includes(record.version));
  validateSaveContext({ stageId: record.stageId, problemKey: record.problemKey });
  check(optionalText(record.problemTitle, 4096));
  check(record.stageRevision == null || (typeof record.stageRevision === 'string' && record.stageRevision.length <= 200)
    || (Number.isSafeInteger(record.stageRevision) && record.stageRevision >= 0));
  check(record.timestamp == null || (typeof record.timestamp === 'string' && record.timestamp.length <= 64 && Number.isFinite(Date.parse(record.timestamp))));
  for (const key of ['usedBlocks', 'usedWires']) check(record[key] == null || (Number.isSafeInteger(record[key]) && record[key] >= 0));
  const raw = record.circuit;
  check(plain(raw) && Number.isInteger(raw.rows) && Number.isInteger(raw.cols)
    && raw.rows > 0 && raw.cols > 0 && raw.rows <= 512 && raw.cols <= 512 && plain(raw.blocks) && plain(raw.wires));
  check(Object.keys(raw.blocks).length <= raw.rows * raw.cols && Object.keys(raw.wires).length <= raw.rows * raw.cols);
  const types = new Set(['INPUT', 'OUTPUT', 'AND', 'OR', 'NOT', 'XOR', 'JUNCTION', 'D']);
  const positions = new Map();
  const withinBounds = (r, c) => r >= 0 && c >= 0 && r < raw.rows && c < raw.cols;
  for (const [id, block] of Object.entries(raw.blocks)) {
    check(validId(id) && plain(block) && block.id === id && types.has(block.type));
    check(plain(block.pos) && Number.isInteger(block.pos.r) && Number.isInteger(block.pos.c) && withinBounds(block.pos.r, block.pos.c));
    check(optionalText(block.name, 512) && (block.fixed === undefined || typeof block.fixed === 'boolean'));
    check(block.value === undefined || typeof block.value === 'boolean' || block.value === 0 || block.value === 1);
    check(block.inputMode === undefined || (block.type === 'INPUT' && ['button', 'switch'].includes(block.inputMode)));
    const key = `${block.pos.r},${block.pos.c}`;
    check(!positions.has(key)); positions.set(key, block);
  }
  const occupied = new Set();
  const blockAt = p => positions.get(`${p?.r},${p?.c}`);
  for (const [id, wire] of Object.entries(raw.wires)) {
    check(validId(id) && plain(wire) && wire.id === id && validId(wire.startBlockId) && validId(wire.endBlockId));
    check(Array.isArray(wire.path) && wire.path.length <= raw.rows * raw.cols + 1 && isValidWirePath(wire.path, {
      withinBounds, blockAt, cellHasWire: p => occupied.has(`${p.r},${p.c}`)
    }));
    check(blockAt(wire.path[0])?.id === wire.startBlockId && blockAt(wire.path.at(-1))?.id === wire.endBlockId);
    check(wire.inputRole == null || ['D', 'EN'].includes(wire.inputRole));
    wire.path.slice(1, -1).forEach(p => occupied.add(`${p.r},${p.c}`));
  }
  const metadata = Object.fromEntries(['version', 'stageId', 'stageRevision', 'problemKey', 'problemTitle',
    'timestamp', 'usedBlocks', 'usedWires'].filter(key => record[key] !== undefined).map(key => [key, record[key]]));
  return { ...metadata, circuit: snapshotCircuit(raw) };
}
