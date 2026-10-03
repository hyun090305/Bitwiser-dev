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
export function wirePathDiagnostic(trace, { withinBounds, blockAt, cellHasWire }, endpoints = true) {
  const fail = (code, message, messageEn, cell) => ({ code, message, messageEn,
    ...(cell ? { cell: { r: cell.r, c: cell.c }, ...(blockAt(cell) ? { blockId: blockAt(cell).id } : {}) } : {}) });
  if (!Array.isArray(trace) || trace.some(p => !p || !Number.isInteger(p.r) || !Number.isInteger(p.c))) {
    return fail('INVALID_WIRE_PATH', '도선은 이웃한 칸을 따라 연결하세요.', 'Route the wire through neighboring cells.');
  }
  const outside = trace.find(p => !withinBounds(p.r, p.c));
  if (outside) return fail('WIRE_OUTSIDE_GRID', '도선은 격자 안에서 연결하세요.', 'Keep the wire inside the grid.', outside);
  const start = trace.length ? blockAt(trace[0]) : null;
  const end = trace.length ? blockAt(trace.at(-1)) : null;
  const selfFeedback = start?.type === 'D' && start.id === end?.id && trace.length >= 5;
  if (endpoints) {
    if (!end && trace.length && cellHasWire(trace.at(-1))) return fail('WIRE_OVERLAP', '기존 도선과 겹칠 수 없습니다.', 'A wire cannot overlap an existing wire.', trace.at(-1));
    if (!start || !end) return fail('WIRE_EMPTY_ENDPOINT', '도선의 끝을 블록에 연결하세요.', 'End the wire on a block.', !start ? trace[0] : trace.at(-1));
    if (trace.length < 3) return fail('WIRE_ADJACENT_BLOCKS', '블록 사이에 빈 칸이 하나 이상 필요합니다.', 'Leave at least one empty cell between blocks.', trace.at(-1));
    if (start.id === end.id && !selfFeedback) return fail('WIRE_SELF_INTERSECTION', '도선이 자신과 겹칠 수 없습니다.', 'A wire cannot overlap itself.', trace.at(-1));
  }
  const seen = new Set();
  for (const [i, p] of trace.entries()) {
    const key = `${p.r},${p.c}`;
    if (seen.has(key) && !(selfFeedback && i === trace.length - 1 && p.r === trace[0].r && p.c === trace[0].c)) return fail('WIRE_SELF_INTERSECTION', '도선이 자신과 겹칠 수 없습니다.', 'A wire cannot overlap itself.', p);
    seen.add(key);
    if (i && Math.abs(p.r - trace[i - 1].r) + Math.abs(p.c - trace[i - 1].c) !== 1) return fail('INVALID_WIRE_PATH', '도선은 이웃한 칸을 따라 연결하세요.', 'Route the wire through neighboring cells.', p);
    if (i > 0 && i < trace.length - 1) {
      if (blockAt(p)) return fail('WIRE_THROUGH_BLOCK', '도선이 블록을 통과할 수 없습니다.', 'A wire cannot pass through a block.', p);
      if (cellHasWire(p)) return fail('WIRE_OVERLAP', '기존 도선과 겹칠 수 없습니다.', 'A wire cannot overlap an existing wire.', p);
    }
  }
  return null;
}

export function isValidWirePath(trace, context, endpoints = true) {
  return wirePathDiagnostic(trace, context, endpoints) === null;
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
