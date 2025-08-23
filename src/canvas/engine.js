import { newBlock } from './model.js';

// Basic evaluation of the circuit without DOM traversal
export function evaluate(circuit) {
  const blocks = circuit.blocks;
  const getValue = id => blocks[id]?.value || false;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;
    Object.values(blocks).forEach(b => {
      const old = b.value;
      switch (b.type) {
        case 'INPUT':
          break; // value already set
        case 'NOT':
          b.value = !getValue(b.inputs?.[0]);
          break;
        case 'AND':
          b.value = (b.inputs || []).every(id => getValue(id));
          break;
        case 'OR':
          b.value = (b.inputs || []).some(id => getValue(id));
          break;
        case 'JUNCTION':
          // pass-through
          b.value = getValue(b.inputs?.[0]);
          break;
      }
      if (old !== b.value) changed = true;
    });
  }
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
  function tick() {
    phase = (phase + 2) % 40;
    renderer(ctx, circuit, phase);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
