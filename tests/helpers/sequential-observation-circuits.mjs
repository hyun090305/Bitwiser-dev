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

const inputId = (circuit, name) => Object.values(circuit.blocks).find(b => b.type === 'INPUT' && b.name === name).id;
const outputWire = (circuit, name) => {
  const output = Object.values(circuit.blocks).find(b => b.type === 'OUTPUT' && b.name === name).id;
  return Object.values(circuit.wires).find(w => w.endBlockId === output);
};
const xor = (gate, a, b) => gate('OR', [gate('AND', [a, gate('NOT', [b])]), gate('AND', [gate('NOT', [a]), b])]);

export function dataChangeShortcut() {
  const circuit = memoryFixture(25), gate = extend(circuit), data = inputId(circuit, 'DATA');
  const wire = outputWire(circuit, 'VALUE'), sampled = gate('D', [data]);
  wire.startBlockId = xor(gate, wire.startBlockId, xor(gate, data, sampled));
  return circuit;
}

export function riseInputShortcut() {
  const circuit = memoryFixture(31), gate = extend(circuit), wire = outputWire(circuit, 'RISE');
  wire.startBlockId = gate('AND', [wire.startBlockId, inputId(circuit, 'SIGNAL')]);
  return circuit;
}

export function initialOutputShortcut() {
  const circuit = memoryFixture(25), gate = extend(circuit), data = inputId(circuit, 'DATA');
  const wire = outputWire(circuit, 'VALUE');
  const one = gate('OR', [data, gate('NOT', [data])]), clocked = gate('D', [one]);
  wire.startBlockId = gate('OR', [wire.startBlockId, gate('NOT', [clocked])]);
  return circuit;
}

export function writeInputShortcut() {
  const circuit = memoryFixture(38), gate = extend(circuit), data = inputId(circuit, 'D0');
  const wire = outputWire(circuit, 'Q0'), sampled = gate('D', [data]);
  const leak = gate('AND', [inputId(circuit, 'WRITE'), xor(gate, data, sampled)]);
  wire.startBlockId = xor(gate, wire.startBlockId, leak);
  return circuit;
}
