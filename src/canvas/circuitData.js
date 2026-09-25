// Version 3 adds D and per-wire inputRole, plus optional INPUT inputMode.
export const CIRCUIT_VERSION = 3;
export const SUPPORTED_CIRCUIT_VERSIONS = [2, 3];

export function getCircuitStats(circuit) {
  const blockCounts = {};
  for (const block of Object.values(circuit?.blocks || {})) {
    blockCounts[block.type] = (blockCounts[block.type] || 0) + 1;
  }
  const cells = new Set();
  for (const wire of Object.values(circuit?.wires || {})) {
    for (const point of (wire.path || []).slice(1, -1)) cells.add(`${point.r},${point.c}`);
  }
  return { blockCounts, usedBlocks: Object.values(blockCounts).reduce((a, b) => a + b, 0), usedWires: cells.size };
}

export function snapshotCircuit(circuit) {
  return {
    rows: circuit.rows, cols: circuit.cols,
    blocks: Object.fromEntries(Object.entries(circuit.blocks).map(([id, b]) => [id, {
      id, type: b.type, ...(b.name ? { name: b.name } : {}), pos: { ...b.pos },
      value: b.type === 'INPUT' && b.inputMode !== 'button' ? Boolean(b.value) : false, fixed: Boolean(b.fixed),
      ...(b.type === 'INPUT' && b.inputMode ? { inputMode: b.inputMode } : {})
    }])),
    wires: Object.fromEntries(Object.entries(circuit.wires).map(([id, w]) => [id, {
      id, startBlockId: w.startBlockId, endBlockId: w.endBlockId,
      path: w.path.map(p => ({ r: p.r, c: p.c })),
      ...(w.inputRole != null ? { inputRole: w.inputRole } : {})
    }]))
  };
}

// The editor requires at least one empty cell between endpoints, orthogonal
// unit steps, and no intersections with blocks, other wires, or itself.
export function isValidWirePath(trace, { withinBounds, blockAt, cellHasWire }, endpoints = true) {
  if (!Array.isArray(trace) || (endpoints && trace.length < 3)) return false;
  if (trace.some(p => !p || !Number.isInteger(p.r) || !Number.isInteger(p.c))) return false;
  const start = trace.length ? blockAt(trace[0]) : null;
  const end = trace.length ? blockAt(trace.at(-1)) : null;
  const selfFeedback = start?.type === 'D' && start.id === end?.id && trace.length >= 5;
  if (endpoints) {
    if (!start || !end || (start.id === end.id && !selfFeedback)) return false;
  }
  const seen = new Set();
  return trace.every((p, i) => {
    if (!p || !Number.isInteger(p.r) || !Number.isInteger(p.c) || !withinBounds(p.r, p.c)) return false;
    const key = `${p.r},${p.c}`;
    if (seen.has(key) && !(selfFeedback && i === trace.length - 1 && p.r === trace[0].r && p.c === trace[0].c)) return false;
    seen.add(key);
    if (i && Math.abs(p.r - trace[i - 1].r) + Math.abs(p.c - trace[i - 1].c) !== 1) return false;
    return !(i > 0 && i < trace.length - 1 && (blockAt(p) || cellHasWire(p)));
  });
}

// Validate a proposed editor transaction, including overlaps between new wires.
// Logical completeness is deliberately separate so unfinished designs can move.
export function hasValidWireLayout(circuit, withinBounds = (r, c) => r >= 0 && c >= 0 && r < circuit.rows && c < circuit.cols) {
  const positions = new Map(), occupied = new Set();
  for (const block of Object.values(circuit.blocks)) {
    const { r, c } = block.pos;
    const key = `${r},${c}`;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !withinBounds(r, c) || positions.has(key)) return false;
    positions.set(key, block);
  }
  const blockAt = p => positions.get(`${p?.r},${p?.c}`);
  for (const wire of Object.values(circuit.wires)) {
    if (!isValidWirePath(wire.path, { withinBounds, blockAt, cellHasWire: p => occupied.has(`${p.r},${p.c}`) }) ||
        blockAt(wire.path[0])?.id !== wire.startBlockId || blockAt(wire.path.at(-1))?.id !== wire.endBlockId) return false;
    wire.path.slice(1, -1).forEach(p => occupied.add(`${p.r},${p.c}`));
  }
  return true;
}
