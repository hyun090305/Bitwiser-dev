// Numeric, detached execution plan. The arrays are private and never mutated
// after compilation; each evaluator owns its own reusable signal buffer.
const TYPES = { INPUT: 0, D: 1, AND: 2, OR: 3, NOT: 4, OUTPUT: 5, JUNCTION: 6 };

export function compilePlan(circuit, plan) {
  const ids = [...plan.order];
  const index = new Map(ids.map((id, i) => [id, i]));
  const types = Uint8Array.from(ids, id => TYPES[circuit.blocks[id].type]);
  const offsets = new Uint32Array(ids.length + 1);
  const sources = [];
  ids.forEach((id, i) => {
    offsets[i] = sources.length;
    for (const source of plan.incoming.get(id) || []) sources.push(index.get(source));
  });
  offsets[ids.length] = sources.length;
  const edges = Uint32Array.from(sources);
  const ports = type => ids.filter(id => circuit.blocks[id].type === type);
  const inputIds = ports('INPUT'), outputIds = ports('OUTPUT'), memoryIds = ports('D');
  const inputIndices = Uint32Array.from(inputIds, id => index.get(id));
  const outputIndices = Uint32Array.from(outputIds, id => index.get(id));
  const memoryIndices = Uint32Array.from(memoryIds, id => index.get(id));
  const dataIndices = Uint32Array.from(memoryIds, id => index.get(plan.wires.get(id).find(w => w.inputRole === 'D').startBlockId));
  const enableIndices = Int32Array.from(memoryIds, id => {
    const wire = plan.wires.get(id).find(w => w.inputRole === 'EN');
    return wire ? index.get(wire.startBlockId) : -1;
  });
  const inputNames = inputIds.map(id => circuit.blocks[id].name);
  const outputNames = outputIds.map(id => circuit.blocks[id].name);

  return Object.freeze({
    inputIds: Object.freeze(inputIds), outputIds: Object.freeze(outputIds), memoryIds: Object.freeze(memoryIds),
    inputNames: Object.freeze(inputNames), outputNames: Object.freeze(outputNames),
    createEvaluator() {
      const values = new Uint8Array(ids.length);
      // A borrowed result, valid until this evaluator's next call. No allocation
      // is needed in the exhaustive search's inner loop.
      const result = { outputs: 0, nextState: 0 };
      function settle() {
        for (let i = 0; i < ids.length; i++) {
          const begin = offsets[i], end = offsets[i + 1];
          switch (types[i]) {
            case 0: case 1: break;
            case 2: {
              let value = 1;
              for (let j = begin; j < end; j++) value &= values[edges[j]];
              values[i] = value; break;
            }
            case 3: case 5: {
              let value = 0;
              for (let j = begin; j < end; j++) value |= values[edges[j]];
              values[i] = value; break;
            }
            // Preserve legacy first-input NOT, including NOT() = 1.
            case 4: values[i] = begin === end ? 1 : 1 - values[edges[begin]]; break;
            case 6: values[i] = begin === end ? 0 : values[edges[begin]]; break;
          }
        }
      }
      return {
        evaluate(state, input) {
          for (let i = 0; i < inputIndices.length; i++) values[inputIndices[i]] = (input >>> i) & 1;
          for (let i = 0; i < memoryIndices.length; i++) values[memoryIndices[i]] = (state >>> i) & 1;
          settle();
          let outputs = 0, nextState = 0;
          for (let i = 0; i < outputIndices.length; i++) outputs |= values[outputIndices[i]] << i;
          for (let i = 0; i < memoryIndices.length; i++) {
            const enabled = enableIndices[i] < 0 || values[enableIndices[i]];
            nextState |= values[enabled ? dataIndices[i] : memoryIndices[i]] << i;
          }
          result.outputs = outputs; result.nextState = nextState;
          return result;
        },
        // The editor uses the identical gate kernel, with unrestricted Map
        // state instead of the bounded bitmask used by exhaustive grading.
        evaluateMaps(inputs, memory) {
          for (let i = 0; i < inputIds.length; i++) values[inputIndices[i]] = Boolean(inputs.get(inputIds[i]));
          for (let i = 0; i < memoryIds.length; i++) values[memoryIndices[i]] = Boolean(memory.get(memoryIds[i]));
          settle();
          return new Map(ids.map((id, i) => [id, Boolean(values[i])]));
        }
      };
    }
  });
}
