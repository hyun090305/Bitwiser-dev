import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { wirePathDiagnostic, isValidWirePath } from '../src/canvas/circuitData.js';
import { validateConnections } from '../src/canvas/connections.js';
import { beforeFirstPlay } from './helpers/first-play.mjs';
import { calculateCircuitCost } from '../src/modules/circuitCost.js';
const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));

test('502 AC-7: spatial failures identify their cause/cell, while valid D feedback and partial traces retain their rules', () => {
  const blocks = [{id:'in',type:'INPUT',pos:{r:0,c:0}}, {id:'out',type:'OUTPUT',pos:{r:0,c:2}}, {id:'near',type:'AND',pos:{r:1,c:0}}, {id:'d',type:'D',pos:{r:3,c:3}}];
  const context = { withinBounds:(r,c)=>r>=0&&c>=0&&r<6&&c<6, blockAt:p=>blocks.find(b=>b.pos.r===p.r&&b.pos.c===p.c), cellHasWire:p=>p.r===2&&p.c===0 };
  const path = points => points.map(([r,c])=>({r,c}));
  for (const [points, code, cell, complete] of [
    [[[0,0],[1,0]], 'WIRE_ADJACENT_BLOCKS', [1,0], true],
    [[[0,0],[0,1]], 'WIRE_EMPTY_ENDPOINT', [0,1], true],
    [[[0,0],[1,0],[1,1]], 'WIRE_THROUGH_BLOCK', [1,0], false],
    [[[1,0],[2,0],[3,0]], 'WIRE_OVERLAP', [2,0], false],
    [[[0,0],[-1,0]], 'WIRE_OUTSIDE_GRID', [-1,0], false]
  ]) {
    const diagnostic = wirePathDiagnostic(path(points), context, complete);
    assert.equal(diagnostic.code, code); assert.deepEqual(diagnostic.cell, {r:cell[0],c:cell[1]});
    assert.ok(diagnostic.message && diagnostic.messageEn); assert.equal(isValidWirePath(path(points),context,complete),false);
  }
  for (const [points, complete] of [[[[0,0],[0,1],[0,2]],true], [[[0,0],[0,1]],false], [[[3,3],[3,4],[4,4],[4,3],[3,3]],true]]) {
    assert.equal(isValidWirePath(path(points),context,complete),true);
  }
});

test('502 AC-8: an AND with one incoming wire reports exactly one missing input without repeating its label', () => {
  const circuit = {blocks:{i:{id:'i',type:'INPUT'},g:{id:'g',type:'AND',name:'AND'}},wires:{w:{id:'w',startBlockId:'i',endBlockId:'g'}}};
  const [diagnostic] = validateConnections(circuit).diagnostics;
  assert.equal(diagnostic.blockId,'g'); assert.equal(diagnostic.missing,1);
  assert.equal(diagnostic.message,'AND: 입력 1개 부족'); assert.equal(diagnostic.messageEn,'AND: 1 input missing');
});

test('502 AC-2/4/6: bilingual hints give direction before construction, and the tutorial snapshot retains cost 24', () => {
  for (const file of ['levels.json','levels_en.json']) {
    const data = read(file), previous = beforeFirstPlay(data,file);
    assert.notEqual(data.levelDescriptions[0].desc,previous.levelDescriptions[0].desc);
    for (const id of [6,7]) {
      const hints=data.levelHints[`stage${id}`].hints;
      assert.equal(hints.length,2); assert.doesNotMatch(hints[0].content,/[=∧∨~¬]/);
      assert.equal(hints[0].type,file==='levels.json'?'생각의 방향':'Direction');
      assert.equal(hints[1].type,file==='levels.json'?'구성 방법':'Build it');
    }
    const circuit=read('tests/fixtures/demo/0-tutorial.json').circuit;
    assert.equal(calculateCircuitCost(circuit).totalCost,24);
  }
});
