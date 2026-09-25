import test from 'node:test';
import assert from 'node:assert/strict';
import { blueprintLayout, BLUEPRINT } from '../src/canvas/blueprintExport.js';

test('blueprint retains authored paths, stable aliases/source colors and original coordinates', () => {
  const circuit = { rows: 30, cols: 40, blocks: {
    z: { id: 'z', type: 'D', pos: { r: 8, c: 12 }, value: true },
    a: { id: 'a', type: 'D', pos: { r: 4, c: 12 } },
    i: { id: 'i', type: 'INPUT', name: 'FAULT', pos: { r: 8, c: 8 } },
    g: { id: 'g', type: 'AND', name: 'CUSTOM', pos: { r: 9, c: 12 } }
  }, wires: {
    w: { id: 'w', startBlockId: 'z', endBlockId: 'z', inputRole: 'D', path: [{r:8,c:12},{r:8,c:14},{r:2,c:14},{r:2,c:12},{r:8,c:12}] },
    v: { id: 'v', startBlockId: 'i', endBlockId: 'z', inputRole: 'EN', path: [{r:8,c:8},{r:8,c:12}] }
  } };
  const before = structuredClone(circuit), layout = blueprintLayout(circuit);
  assert.deepEqual(circuit, before);
  assert.deepEqual(layout.aliases, {a:'D1',i:'FAULT',z:'D2',g:'CUSTOM'});
  assert.equal(layout.colors.i, BLUEPRINT.colors[0]); assert.equal(layout.colors.z, BLUEPRINT.colors[1]);
  assert.equal(layout.minR,2); assert.equal(layout.maxC,14);
  assert.equal(layout.point(circuit.blocks.z.pos).x-layout.point(circuit.blocks.i.pos).x,320);
  assert.deepEqual(layout.snapshot.wires, circuit.wires);
  circuit.blocks = Object.fromEntries(Object.entries(circuit.blocks).reverse());
  assert.deepEqual(blueprintLayout(circuit).aliases, layout.aliases);
  assert.deepEqual(blueprintLayout(circuit).colors, layout.colors);
  circuit.blocks.z.pos.r = 15; assert.equal(layout.snapshot.blocks.z.pos.r,8);
});

test('empty blueprint fails explicitly; disconnected drafts still have a layout', () => {
  assert.throws(()=>blueprintLayout({rows:6,cols:6,blocks:{},wires:{}}),/empty/);
  const layout=blueprintLayout({rows:6,cols:6,blocks:{a:{id:'a',type:'OUTPUT',name:'GO',pos:{r:3,c:4}}},wires:{}});
  assert.equal(layout.width,264);assert.equal(layout.height,264);assert.equal(layout.aliases.a,'GO');
});
