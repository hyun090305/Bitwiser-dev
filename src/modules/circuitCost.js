// Change the version whenever prices OR occupancy accounting change.
export const COST_RULES = Object.freeze({
  version: 'cost-v1',
  prices: Object.freeze({ WIRE: 1, JUNCTION: 1, NOT: 10, AND: 10, OR: 10, D: 20, INPUT: 0, OUTPUT: 0 })
});

export function calculateCircuitCost(circuit, rules = COST_RULES) {
  if (!circuit?.blocks || !circuit?.wires) throw new Error('Circuit placement is required');
  const counts = Object.fromEntries(Object.keys(rules.prices).map(type => [type, 0]));
  const blockCells = new Set();
  for (const block of Object.values(circuit.blocks)) {
    if (!Object.hasOwn(rules.prices, block.type) || block.type === 'WIRE') {
      throw new Error(`No cost policy for component: ${block.type}`);
    }
    counts[block.type]++;
    blockCells.add(`${block.pos.r},${block.pos.c}`);
  }
  const wireCells = new Set();
  for (const wire of Object.values(circuit.wires)) {
    // Endpoints are blocks, not wire cells. Shared/turning cells count once.
    for (const p of wire.path.slice(1, -1)) {
      const key = `${p.r},${p.c}`;
      if (!blockCells.has(key)) wireCells.add(key);
    }
  }
  counts.WIRE = wireCells.size;
  const breakdown = Object.entries(counts).map(([type, count]) => {
    const unitCost = rules.prices[type];
    if (!Number.isSafeInteger(unitCost) || unitCost < 0) throw new Error(`Invalid price: ${type}`);
    return { type, count, unitCost, subtotal: count * unitCost };
  });
  const totalCost = breakdown.reduce((sum, line) => sum + line.subtotal, 0);
  if (!Number.isSafeInteger(totalCost)) throw new Error('Cost exceeds integer range');
  return { pricingVersion: rules.version, totalCost, counts, breakdown };
}

export function validateStarThresholds(thresholds) {
  const { twoStarMaxCost: two = null, threeStarMaxCost: three = null } = thresholds || {};
  if (two === null && three === null) return { status: 'pending' };
  if (![two, three].every(n => Number.isSafeInteger(n) && n >= 0) || three > two) {
    return { status: 'invalid', message: 'Both star costs must be nonnegative integers, with threeStarMaxCost <= twoStarMaxCost.' };
  }
  return { status: 'ready', two, three };
}

export function evaluateCostStars(id, passed, totalCost, thresholds) {
  if (Number(id) === 0 || !passed) return 0;
  if (!Number.isSafeInteger(totalCost) || totalCost < 0) throw new Error('Verified cost required');
  const target = validateStarThresholds(thresholds);
  if (target.status !== 'ready') return 1;
  return totalCost <= target.three ? 3 : totalCost <= target.two ? 2 : 1;
}
