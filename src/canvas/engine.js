import { previewCircuit } from './evaluation.js';
export * from './evaluation.js';
const dirtyCircuits = new WeakSet();

export function markCircuitDirty(circuit) {
  if (circuit && typeof circuit === 'object') {
    dirtyCircuits.add(circuit);
  }
}

function consumeCircuitDirty(circuit) {
  if (!circuit || typeof circuit !== 'object') {
    return false;
  }
  if (!dirtyCircuits.has(circuit)) {
    return false;
  }
  dirtyCircuits.delete(circuit);
  return true;
}

// Compatibility adapter: dirty rendering never advances logical time.
export function evaluateCircuit(circuit) {
  const blocks = previewCircuit(circuit);
  dirtyCircuits.delete(circuit);
  return blocks;
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
    // Only recompute block states when another part of the system flagged
    // the circuit as dirty. This avoids unnecessary work for interactions
    // like panning that do not alter the circuit topology or inputs.
    if (consumeCircuitDirty(circuit)) {
      evaluateCircuit(circuit);
    }
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

  evaluateCircuit(circuit);
  scheduleNext();

  return {
    stop,
  };
}
