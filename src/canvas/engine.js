function buildBlockAdjacency(circuit) {
  const incoming = new Map();
  const outgoing = new Map();

  Object.values(circuit.wires).forEach(wire => {
    const { startBlockId, endBlockId } = wire;
    if (!startBlockId || !endBlockId) return;

    if (!incoming.has(endBlockId)) {
      incoming.set(endBlockId, []);
    }
    incoming.get(endBlockId).push(startBlockId);

    if (!outgoing.has(startBlockId)) {
      outgoing.set(startBlockId, []);
    }
    outgoing.get(startBlockId).push(endBlockId);
  });

  return { incoming, outgoing };
}

// Compute the logical output of a single block given current values.
export function computeBlock(block, values, incomingMap) {
  // INPUT blocks simply keep their assigned value
  if (block.type === 'INPUT') {
    return values.get(block.id);
  }

  const incoming = incomingMap.get(block.id) || [];
  const readyVals = incoming
    .map(id => values.get(id))
    .filter(v => v !== undefined);

  switch (block.type) {
    case 'AND':
      return readyVals.every(v => v);
    case 'OR':
      return readyVals.some(v => v);
    case 'NOT':
      return !readyVals[0];
    case 'OUTPUT':
      return readyVals.some(v => v);
    case 'JUNCTION':
      return readyVals[0];
    default:
      return undefined;
  }
}

// Basic evaluation of the circuit using the in-memory circuit model
// instead of traversing DOM cells.
export function evaluateCircuit(circuit) {
  const values = new Map();
  const blocks = Object.values(circuit.blocks);

  blocks
    .filter(b => b.type === 'INPUT')
    .forEach(b => values.set(b.id, !!b.value));

  const { incoming, outgoing } = buildBlockAdjacency(circuit);

  const queue = [...blocks];
  const enqueued = new Set(queue.map(b => b.id));
  const maxIterations = Math.max(1, blocks.length * 10);
  let iterations = 0;

  while (queue.length && iterations < maxIterations) {
    iterations += 1;
    const block = queue.shift();
    enqueued.delete(block.id);

    const oldVal = values.get(block.id);
    const newVal = computeBlock(block, values, incoming);

    if (newVal === undefined || newVal === oldVal) {
      continue;
    }

    values.set(block.id, newVal);

    const downstream = outgoing.get(block.id) || [];
    downstream.forEach(id => {
      const next = circuit.blocks[id];
      if (!next || enqueued.has(id)) return;
      queue.push(next);
      enqueued.add(id);
    });
  }

  // apply computed values back to blocks
  blocks.forEach(b => {
    b.value = values.get(b.id) || false;
  });

  return circuit.blocks;
}

// Compute directional flow for each wire based on path
export function setWireFlows(circuit) {
  Object.values(circuit.wires).forEach(w => {
    const flow = [];
    for (let i = 0; i < w.path.length - 1; i++) {
      const a = w.path[i];
      const b = w.path[i + 1];
      if (b.r > a.r) flow.push('D');
      else if (b.r < a.r) flow.push('U');
      else if (b.c > a.c) flow.push('R');
      else if (b.c < a.c) flow.push('L');
    }
    w.flow = flow;
  });
}

// Animation loop helper
export function startEngine(ctx, circuit, renderer) {
  let phase = 0;
  let lastTime = null;
  let rafId = null;
  let running = true;
  const FLOW_SPEED = 60; // dash units per second (roughly 60fps equivalent)

  function scheduleNext() {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
  }

  function tick(time) {
    if (!running) return;
    rafId = null;
    // Recompute circuit values every frame based solely on the
    // in-memory circuit model so block states stay in sync with
    // current connections and input values.
    evaluateCircuit(circuit);
    if (lastTime === null) {
      lastTime = time;
    }
    const delta = time - lastTime;
    lastTime = time;
    // Advance the animation at a constant rate regardless of display refresh.
    phase += (delta / 1000) * FLOW_SPEED;
    if (phase > 1e6) {
      phase -= 1e6;
    }
    renderer(ctx, circuit, phase);
    scheduleNext();
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  scheduleNext();

  return {
    stop,
  };
}
