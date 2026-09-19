// Logical rules shared by the editor, evaluator and grading. Spatial wire
// constraints remain in circuitData.isValidWirePath.
export const BLOCK_TYPES = new Set(['INPUT', 'OUTPUT', 'AND', 'OR', 'NOT', 'JUNCTION', 'D']);

export function incomingWires(circuit, blockId) {
  return Object.values(circuit.wires).filter(w =>
    w.endBlockId === blockId && circuit.blocks[w.startBlockId]);
}

export function maxInputs(type) {
  return type === 'D' ? 2 : ['OUTPUT', 'JUNCTION'].includes(type) ? 1 : Infinity;
}

export function canConnect(circuit, startId, endId) {
  const start = circuit.blocks[startId];
  const end = circuit.blocks[endId];
  return Boolean(start && end && incomingWires(circuit, endId).length < maxInputs(end.type));
}

// A role belongs to the connection itself, so changing endpoint IDs while
// copying does not require a second reference remapping step.
export function assignNewInputRole(circuit, wire) {
  if (circuit.blocks[wire.endBlockId]?.type !== 'D') return;
  const previous = incomingWires(circuit, wire.endBlockId).filter(w => w.id !== wire.id);
  if (previous.length === 0) wire.inputRole = 'D';
  else if (previous.length === 1) {
    previous[0].inputRole = 'D';
    wire.inputRole = 'EN';
  }
}

// Call after an actual editor deletion, never on load/evaluation: malformed
// saved role assignments must remain visible as errors.
export function normalizeAfterEdit(circuit) {
  for (const block of Object.values(circuit.blocks)) {
    if (block.type !== 'D') continue;
    const incoming = incomingWires(circuit, block.id);
    if (incoming.length === 1) incoming[0].inputRole = 'D';
  }
}

export function swapMemoryInputs(circuit, blockId) {
  if (circuit.blocks[blockId]?.type !== 'D') return false;
  const wires = incomingWires(circuit, blockId);
  if (wires.length !== 2 || new Set(wires.map(w => w.inputRole)).size !== 2 ||
      !wires.every(w => ['D', 'EN'].includes(w.inputRole))) return false;
  wires.forEach(w => { w.inputRole = w.inputRole === 'D' ? 'EN' : 'D'; });
  return true;
}

export function validateConnections(circuit) {
  const diagnostics = [];
  const fail = (code, blockId, message) => diagnostics.push({ code, blockId, message });
  const incoming = new Map();
  for (const [id, wire] of Object.entries(circuit.wires)) {
    if (wire.id !== id || !circuit.blocks[wire.startBlockId] || !circuit.blocks[wire.endBlockId]) {
      fail('INVALID_WIRE', wire.endBlockId, `도선 ${id}: 연결 대상 또는 ID가 올바르지 않습니다.`);
      continue;
    }
    if (!incoming.has(wire.endBlockId)) incoming.set(wire.endBlockId, []);
    incoming.get(wire.endBlockId).push(wire);
  }
  for (const [id, block] of Object.entries(circuit.blocks)) {
    if (block.id !== id || !BLOCK_TYPES.has(block.type)) {
      fail('INVALID_BLOCK', id, `블록 ${id}: 지원하지 않는 종류 또는 ID입니다.`);
    }
    if (block.type === 'INPUT' && block.inputMode != null && !['switch', 'button'].includes(block.inputMode)) {
      fail('INVALID_INPUT_MODE', id, `INPUT ${id}: switch 또는 button을 지정하세요.`);
    }
    const wires = incoming.get(id) || [];
    if (wires.length > maxInputs(block.type)) {
      fail('TOO_MANY_INPUTS', id, `${block.type} ${block.name || id}: 입력은 최대 ${maxInputs(block.type)}개입니다.`);
    }
    if (block.type !== 'D') continue;
    if (!wires.length) fail('MISSING_D_INPUT', id, `D ${block.name || id}: D 입력을 연결하세요. (미완성)`);
    else if (wires.filter(w => w.inputRole === 'D').length !== 1 ||
      wires.filter(w => w.inputRole === 'EN').length !== wires.length - 1 ||
      wires.some(w => !['D', 'EN'].includes(w.inputRole))) {
      fail('INVALID_D_ROLES', id, `D ${block.name || id}: D/EN 역할 배정이 올바르지 않습니다.`);
    }
  }
  return { diagnostics, incoming };
}
