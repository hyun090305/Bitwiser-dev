import fs from 'node:fs';

export const memoryFixture = id => JSON.parse(fs.readFileSync(new URL(`../fixtures/memory20/${id}.json`, import.meta.url))).circuit;
export const automaticDoorShortcut = () => JSON.parse(fs.readFileSync(new URL('../fixtures/observations/30-shortcut.json', import.meta.url))).circuit;

// Logical counterexamples from #477. Added gates deliberately have no routed
// board layout: these exercise grading, not solution cost or physical legality.
function extend(circuit) {
  let serial = 0;
  return (type, sources) => {
    const id = `probe_${serial++}`;
    circuit.blocks[id] = { id, type, name:id, pos:{r:0,c:serial}, value:false };
    for (const source of sources) {
      const wire = `probe_wire_${serial++}`;
      circuit.wires[wire] = {id:wire, startBlockId:source, endBlockId:id, path:[], ...(type === 'D' ? {inputRole:'D'} : {})};
    }
    return id;
  };
}

export function responseCheckShortcut() {
  const circuit = memoryFixture(29), gate = extend(circuit);
  const a = Object.values(circuit.blocks).find(b => b.name === 'A').id;
  const output = Object.values(circuit.blocks).find(b => b.type === 'OUTPUT').id;
  const wire = Object.values(circuit.wires).find(w => w.endBlockId === output);
  const remembered = gate('D', [a]);
  const equal = gate('OR', [gate('AND', [a, remembered]), gate('AND', [gate('NOT', [a]), gate('NOT', [remembered])])]);
  wire.startBlockId = gate('AND', [wire.startBlockId, equal]);
  return circuit;
}

export function registeredAddressMemory() {
  const circuit = memoryFixture(38), gate = extend(circuit);
  const input = name => Object.values(circuit.blocks).find(b => b.type === 'INPUT' && b.name === name).id;
  const write = input('WRITE'), noWrite = gate('NOT', [write]);
  for (const bit of [0, 1]) {
    const output = Object.values(circuit.blocks).find(b => b.type === 'OUTPUT' && b.name === `Q${bit}`).id;
    const wire = Object.values(circuit.wires).find(w => w.endBlockId === output);
    wire.startBlockId = gate('D', [gate('OR', [gate('AND', [write, input(`D${bit}`)]), gate('AND', [noWrite, wire.startBlockId])])]);
  }
  return circuit;
}
