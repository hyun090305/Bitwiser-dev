// Return the upstream block connected by a wire, if any.
// In the canvas model wires directly store start/end block ids so we can
// simply look up the block.  excludeBlock can be provided to avoid
// returning the same node when evaluating.
export function getBlockNodeFlow(circuit, wire, excludeBlock) {
  if (!wire || !wire.startBlockId) return null;
  if (excludeBlock && wire.startBlockId === excludeBlock.id) return null;
  return circuit.blocks[wire.startBlockId] || null;
}

// Compute the logical output of a single block given current values.
export function computeBlock(circuit, block, values) {
  // INPUT blocks simply keep their assigned value
  if (block.type === 'INPUT') {
    return values.get(block.id);
  }

  // gather incoming blocks via wires that end at this block
  const incoming = Object.values(circuit.wires)
    .filter(w => w.endBlockId === block.id)
    .map(w => getBlockNodeFlow(circuit, w, block))
    .filter(Boolean);

  const readyVals = incoming
    .map(b => values.get(b.id))
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
  Object.values(circuit.blocks)
    .filter(b => b.type === 'INPUT')
    .forEach(b => values.set(b.id, !!b.value));

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;
    Object.values(circuit.blocks).forEach(b => {
      const oldVal = values.get(b.id);
      const newVal = computeBlock(circuit, b, values);
      if (newVal !== undefined && newVal !== oldVal) {
        values.set(b.id, newVal);
        changed = true;
      }
    });
  }

  // apply computed values back to blocks
  Object.values(circuit.blocks).forEach(b => {
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
