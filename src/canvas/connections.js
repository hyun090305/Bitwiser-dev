// Logical rules shared by the editor, evaluator and grading. Spatial wire
// constraints remain in circuitData.isValidWirePath.
export const BLOCK_TYPES = new Set(['INPUT', 'OUTPUT', 'AND', 'OR', 'NOT', 'JUNCTION', 'D']);

export function incomingWires(circuit, blockId) {
  return Object.values(circuit.wires).filter(w =>
    w.endBlockId === blockId && circuit.blocks[w.startBlockId]);
}

export function maxInputs(type) {
  return { INPUT: 0, OUTPUT: 1, NOT: 1, AND: 2, OR: 2, JUNCTION: 1, D: 2 }[type] ?? 0;
}

export function canConnect(circuit, startId, endId) {
  const start = circuit.blocks[startId];
  const end = circuit.blocks[endId];
  if (!start || !end || start.type === 'OUTPUT' || end.type === 'INPUT' ||
      (startId === endId && start.type !== 'D') || incomingWires(circuit, endId).length >= maxInputs(end.type)) return false;
  let id = 'new-connection';
  while (circuit.wires[id]) id += '-';
  const wire = { id, startBlockId: startId, endBlockId: endId };
  assignNewInputRole(circuit, wire);
  return canEditConnections(circuit, { ...circuit, wires: { ...circuit.wires, [id]: wire } });
}

// A role belongs to the connection itself, so changing endpoint IDs while
// copying does not require a second reference remapping step.
export function assignNewInputRole(circuit, wire) {
  if (circuit.blocks[wire.endBlockId]?.type !== 'D') return;
  const previous = incomingWires(circuit, wire.endBlockId).filter(w => w.id !== wire.id);
  if (previous.length === 0) wire.inputRole = 'D';
  else if (previous.length === 1) {
    wire.inputRole = previous[0].inputRole === 'EN' ? 'D' : 'EN';
  }
}

// Call after an actual editor deletion, never on load/evaluation: malformed
// saved role assignments must remain visible as errors.
export function normalizeAfterEdit(circuit, previous) {
  for (const block of Object.values(circuit.blocks)) {
    if (block.type !== 'D') continue;
    if (previous && !incomingWires(previous, block.id).some(w => !circuit.wires[w.id] ||
        circuit.wires[w.id].endBlockId !== block.id)) continue;
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

export function diagnosticMessage(diagnostic, language = globalThis.window?.currentLang || globalThis.document?.documentElement?.lang || 'ko') {
  return language === 'en' ? diagnostic.messageEn || diagnostic.message : diagnostic.message;
}

// Existing invalid designs stay editable. An edit may retain or remove an old
// violation, but may not introduce a new one or increase its input excess.
export function canEditConnections(before, after) {
  const key = d => JSON.stringify([d.code, d.blockId, d.wireId]);
  const previous = new Map(validateConnections(before, { complete: false }).diagnostics.map(d => [key(d), d]));
  return validateConnections(after, { complete: false }).diagnostics.every(d => {
    const old = previous.get(key(d));
    if (d.code === 'INVALID_D_ROLES' && old) {
      const original = incomingWires(before, d.blockId);
      if (!incomingWires(after, d.blockId).every(w => original.some(p => p.id === w.id && p.inputRole === w.inputRole))) return false;
    }
    return old && (d.excess || 0) <= (old.excess || 0);
  });
}

export function validateConnections(circuit, { complete = true } = {}) {
  const diagnostics = [];
  const fail = (code, blockId, message, messageEn, extra = {}) => diagnostics.push({ code, blockId, message, messageEn, ...extra });
  const incoming = new Map();
  for (const [id, wire] of Object.entries(circuit.wires)) {
    if (wire.id !== id || !circuit.blocks[wire.startBlockId] || !circuit.blocks[wire.endBlockId]) {
      fail('INVALID_WIRE', wire.endBlockId, `도선 ${id}: 연결 대상 또는 ID가 올바르지 않습니다.`, `Wire ${id}: invalid endpoint or ID.`, { wireId: id });
      continue;
    }
    const start = circuit.blocks[wire.startBlockId], end = circuit.blocks[wire.endBlockId];
    if (start.type === 'OUTPUT') fail('OUTPUT_SOURCE', start.id, `OUTPUT ${start.name || start.id}: 출력에서 도선을 시작할 수 없습니다.`, `OUTPUT ${start.name || start.id}: cannot start a wire here.`, { wireId: id });
    if (end.type === 'INPUT') fail('INPUT_TARGET', end.id, `INPUT ${end.name || end.id}: 입력으로 도선을 연결할 수 없습니다.`, `INPUT ${end.name || end.id}: cannot receive a wire.`, { wireId: id });
    if (start.id === end.id && start.type !== 'D') fail('SELF_CONNECTION', start.id, `${start.type} ${start.name || start.id}: D만 자기 연결할 수 있습니다.`, `${start.type} ${start.name || start.id}: only D permits self-feedback.`, { wireId: id });
    if (!incoming.has(wire.endBlockId)) incoming.set(wire.endBlockId, []);
    incoming.get(wire.endBlockId).push(wire);
  }
  for (const [id, block] of Object.entries(circuit.blocks)) {
    if (block.id !== id || !BLOCK_TYPES.has(block.type)) {
      fail('INVALID_BLOCK', id, `블록 ${id}: 지원하지 않는 종류 또는 ID입니다.`, `Block ${id}: unsupported type or invalid ID.`);
    }
    if (block.type === 'INPUT' && block.inputMode != null && !['switch', 'button'].includes(block.inputMode)) {
      fail('INVALID_INPUT_MODE', id, `INPUT ${id}: switch 또는 button을 지정하세요.`, `INPUT ${id}: use switch or button mode.`);
    }
    const wires = incoming.get(id) || [];
    if (wires.length > maxInputs(block.type)) {
      fail('TOO_MANY_INPUTS', id, `${block.type} ${block.name || id}: 입력은 최대 ${maxInputs(block.type)}개입니다.`, `${block.type} ${block.name || id}: at most ${maxInputs(block.type)} input wires.`, { excess: wires.length - maxInputs(block.type) });
    }
    const required = block.type === 'D' ? 1 : maxInputs(block.type);
    if (complete && wires.length < required) fail(block.type === 'D' ? 'MISSING_D_INPUT' : 'MISSING_INPUT', id,
      `${block.type} ${block.name || id}: 입력 ${required}개가 필요합니다. (미완성)`,
      `${block.type} ${block.name || id}: needs ${required} input wire(s). (Incomplete)`);
    if (block.type !== 'D') continue;
    if (wires.length && (wires.filter(w => w.inputRole === 'D').length !== 1 ||
      wires.filter(w => w.inputRole === 'EN').length !== wires.length - 1 ||
      wires.some(w => !['D', 'EN'].includes(w.inputRole)))) {
      fail('INVALID_D_ROLES', id, `D ${block.name || id}: D/EN 역할 배정이 올바르지 않습니다.`, `D ${block.name || id}: invalid D/EN roles.`);
    }
  }
  // Iterative strongly connected components keep validation linear and avoid
  // recursion limits on large imported designs.
  // Edges entering D break combinational dependence: Q is a current-state source.
  const edges = Object.values(circuit.wires).filter(w => circuit.blocks[w.startBlockId] &&
    circuit.blocks[w.endBlockId] && circuit.blocks[w.endBlockId].type !== 'D');
  const outgoing = new Map(), reverse = new Map();
  for (const w of edges) {
    if (!outgoing.has(w.startBlockId)) outgoing.set(w.startBlockId, []);
    outgoing.get(w.startBlockId).push(w.endBlockId);
    if (!reverse.has(w.endBlockId)) reverse.set(w.endBlockId, []);
    reverse.get(w.endBlockId).push(w.startBlockId);
  }
  const visited = new Set(), finished = [];
  for (const id of Object.keys(circuit.blocks)) {
    if (visited.has(id)) continue;
    visited.add(id);
    const pending = [[id, 0]];
    while (pending.length) {
      const frame = pending.at(-1), next = outgoing.get(frame[0]) || [];
      if (frame[1] === next.length) { finished.push(frame[0]); pending.pop(); continue; }
      const target = next[frame[1]++];
      if (!visited.has(target)) { visited.add(target); pending.push([target, 0]); }
    }
  }
  const component = new Map();
  for (const root of finished.reverse()) {
    if (component.has(root)) continue;
    component.set(root, root);
    const pending = [root];
    while (pending.length) {
      for (const id of reverse.get(pending.pop()) || []) {
        if (!component.has(id)) { component.set(id, root); pending.push(id); }
      }
    }
  }
  for (const w of edges) if (component.get(w.startBlockId) === component.get(w.endBlockId)) {
    const id = w.startBlockId;
    fail('COMBINATIONAL_CYCLE', id, `블록 ${id}, 도선 ${w.id}: 모든 피드백 경로가 D를 통과해야 합니다.`,
      `Block ${id}, wire ${w.id}: every feedback path must pass through D.`, { wireId: w.id });
  }
  return { diagnostics, incoming };
}
