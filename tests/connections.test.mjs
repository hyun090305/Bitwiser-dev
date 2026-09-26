import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeCircuit, newBlock, newWire } from '../src/canvas/model.js';
import { validateConnections, canConnect, canEditConnections, assignNewInputRole, normalizeAfterEdit, diagnosticMessage } from '../src/canvas/connections.js';
import { compileCircuit, evaluateCombinational, getExecutionState, tickCircuit } from '../src/canvas/evaluation.js';
import { isValidWirePath, hasValidWireLayout, snapshotCircuit, getCircuitStats } from '../src/canvas/circuitData.js';
import { gradeCircuit, gradeCircuitSync, GRADING_VERSION } from '../src/modules/circuitGrading.js';
import { validateSavedCircuitRecord } from '../src/modules/savedCircuitRecord.js';
import { validateStageCircuit } from '../src/modules/stageCircuit.js';
import { calculateCircuitCost, COST_RULES } from '../src/modules/circuitCost.js';
import { makeCostRecord, isCurrentCostRecord, stageRules } from '../src/modules/costRecords.js';
import { emptyProgress, validateProgress } from '../src/demo/records.js';
import { createDemoStore } from '../src/demo/store.js';
import { selfFeedbackCircuit, feedbackLevels, points } from './helpers/connection-circuits.mjs';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url)));
const add = (c, from, to, role) => {
  const id = `w${Object.keys(c.wires).length}`;
  const wire = newWire({ id, startBlockId:from, endBlockId:to, path:[], inputRole:role });
  if (role === undefined) assignNewInputRole(c, wire);
  c.wires[id] = wire;
  return wire;
};
function gate(type, count) {
  const c = makeCircuit();
  c.blocks.x = newBlock({ id:'x', type:'INPUT', name:'x', pos:{r:0,c:0} });
  c.blocks.g = newBlock({ id:'g', type, name:'g', pos:{r:2,c:2} });
  for (let i = 0; i < count; i++) add(c, 'x', 'g');
  return c;
}

test('482 AC-1/7: every placed primitive has the same arity in preview, compile, sync/async grading', async () => {
  for (const [type, min, max] of [['INPUT',0,0],['OUTPUT',1,1],['NOT',1,1],['JUNCTION',1,1],['AND',2,2],['OR',2,2],['D',1,2]]) {
    for (let count = 0; count <= 3; count++) {
      const c = gate(type, count), valid = count >= min && count <= max;
      assert.equal(!validateConnections(c).diagnostics.length, valid, `${type}/${count}`);
      assert.equal(!validateConnections(c, {complete:false}).diagnostics.length, count <= max, `${type}/${count} editing`);
      assert.equal(evaluateCombinational(c).ok, valid);
      assert.equal(compileCircuit(c).ok, valid);
      if (!valid) {
        if (type !== 'OUTPUT') {
          c.blocks.o = newBlock({id:'o',type:'OUTPUT',name:'o',pos:{r:4,c:4}});
          add(c,'x','o');
        }
        const inputs = type === 'INPUT' ? ['x','g'] : ['x'], outputs = type === 'OUTPUT' ? ['g'] : ['o'];
        const reference = { mode:'sequential', reference:{ inputs, outputs, stateCount:1, initialState:0, evaluate:()=>({outputs:0,nextState:0}) } };
        const sync = gradeCircuitSync(c, reference), asyncResult = await gradeCircuit(c, reference);
        assert.equal(sync.status, 'invalid'); assert.deepEqual(asyncResult, sync);
        assert.ok(sync.diagnostics.some(d => d.blockId === 'g'));
        assert.match(diagnosticMessage(sync.diagnostics[0], 'en'), /INPUT|OUTPUT|NOT|AND|OR|JUNCTION|D/);
      }
    }
  }
});

test('482 AC-1/2/4/6: direction, repeated-source inputs, fan-out, cycle and incremental repair', () => {
  const c = gate('AND', 0);
  assert.equal(canConnect(c,'x','g'),true); add(c,'x','g');
  assert.equal(canConnect(c,'x','g'),true); add(c,'x','g');
  assert.equal(canConnect(c,'x','g'),false);
  c.blocks.o = newBlock({id:'o',type:'OUTPUT',name:'o',pos:{r:4,c:4}});
  assert.equal(canConnect(c,'g','o'),true); add(c,'g','o');
  assert.equal(canConnect(c,'o','g'),false); assert.equal(canConnect(c,'g','x'),false);
  assert.equal(evaluateCombinational(c).ok,true);
  for (const type of ['OR','NOT','JUNCTION']) {
    const p=gate(type,0); assert.equal(canConnect(p,'g','g'),false);
  }
  const cycle=gate('NOT',0);
  cycle.blocks.n=newBlock({id:'n',type:'NOT',pos:{r:3,c:3}});
  add(cycle,'g','n'); assert.equal(canConnect(cycle,'n','g'),false);
  add(cycle,'n','g');
  assert.ok(validateConnections(cycle).diagnostics.some(d=>d.code==='COMBINATIONAL_CYCLE'));
  const before=structuredClone(cycle); delete cycle.wires.w1;
  assert.equal(canEditConnections(before,cycle),true);
  const invalid=gate('INPUT',2), partial=structuredClone(invalid); delete partial.wires.w1;
  assert.equal(canEditConnections(invalid,partial),true);
  assert.equal(canEditConnections(partial,invalid),false);
});

test('482 AC-3: role assignment never repairs imports; deletion only normalizes its own D', () => {
  const c=selfFeedbackCircuit('EN');
  const other=newBlock({id:'other',type:'D',pos:{r:6,c:8}}); c.blocks.other=other;
  const broken=add(c,'x','other','EN');
  const before=structuredClone(c); delete c.wires.data;
  normalizeAfterEdit(c,before);
  assert.equal(c.wires.loop.inputRole,'D'); assert.equal(broken.inputRole,'EN');
  const unchanged=structuredClone(c); normalizeAfterEdit(c,unchanged);
  assert.deepEqual(c,unchanged);
  delete broken.inputRole;
  const bad=structuredClone(c); assert.equal(canConnect(c,'x','other'),false); assert.deepEqual(c,bad);
});

test('482 AC-4/5/7: own D/EN loops sample old Q; failed ticks preserve all runtime state and recover', () => {
  for (const role of ['D','EN']) {
    const c=selfFeedbackCircuit(role), state=getExecutionState(c);
    assert.equal(hasValidWireLayout(c),true);
    assert.equal(gradeCircuitSync(c,feedbackLevels().levelAnswers[25]).ok,true);
    assert.equal(tickCircuit(c).ok,true); assert.equal(state.memory.get('d'),false);
    state.memory.set('d',true); c.blocks.x.value=true;
    assert.equal(tickCircuit(c).ok,true); assert.equal(state.memory.get('d'),true);
    c.blocks.x.value=false; tickCircuit(c); assert.equal(state.memory.get('d'),role==='D');
    c.blocks.x.value=true;
    for (const corrupt of [
      p=>{p.blocks.unused=newBlock({id:'unused',type:'AND',pos:{r:8,c:8}});},
      p=>{p.wires.loop.inputRole='EN'; if (p.wires.data) p.wires.data.inputRole='EN';},
      p=>{add(p,'o','x');},
      p=>{delete p.wires.output;}
    ]) {
      const backup=structuredClone(c); corrupt(c);
      const runtime=structuredClone(state), invalid=structuredClone(c);
      assert.equal(tickCircuit(c).ok,false); assert.deepEqual(state,runtime); assert.deepEqual(c,invalid);
      Object.assign(c,backup); assert.equal(tickCircuit(c).ok,true); c.blocks.x.value=true;
    }
  }
});

test('482 AC-5/8: only D endpoint repetition is legal; face reuse, interior repeats and collisions are rejected', () => {
  const c=selfFeedbackCircuit(), w=c.wires.loop;
  const context={withinBounds:(r,col)=>r>=0&&col>=0&&r<c.rows&&col<c.cols,
    blockAt:p=>Object.values(c.blocks).find(b=>b.pos.r===p?.r&&b.pos.c===p?.c),cellHasWire:()=>false};
  assert.equal(isValidWirePath(w.path,context),true); assert.equal(isValidWirePath(w.path,context,false),true);
  for (const route of [ [[2,4],[2,5],[2,4]], [[2,4],[2,5],[2,6],[2,5],[2,4]],
    [[2,4],[2,5],[3,5],[3,4],[2,4],[1,4],[0,4]] ]) assert.equal(isValidWirePath(points(route),context),false);
  c.blocks.d.type='NOT'; assert.equal(isValidWirePath(w.path,context),false); c.blocks.d.type='D';
  c.blocks.obstacle=newBlock({id:'obstacle',type:'INPUT',pos:{r:3,c:6}});
  assert.equal(hasValidWireLayout(c),false); delete c.blocks.obstacle;
  c.wires.overlap={...w,id:'overlap'}; assert.equal(hasValidWireLayout(c),false); delete c.wires.overlap;
  assert.equal(getCircuitStats(c).usedWires,8);
  assert.equal(calculateCircuitCost(c).totalCost,28); assert.equal(COST_RULES.version,'cost-v1');
  const small=makeCircuit(2,2); small.blocks.d=newBlock({id:'d',type:'D',pos:{r:0,c:0}});
  small.wires.loop={...w,path:points([[0,0],[0,1],[1,1],[1,0],[0,0]])};
  assert.doesNotThrow(()=>validateSavedCircuitRecord({version:3,circuit:small}));
});

test('482 AC-8: v2/v3 designs, malformed roles and legacy directions survive storage without logical repair', () => {
  for (const version of [2,3]) for (const role of ['D','EN']) {
    const circuit=selfFeedbackCircuit(role);
    assert.deepEqual(validateSavedCircuitRecord({version,circuit}).circuit,snapshotCircuit(circuit));
    assert.deepEqual(validateStageCircuit(circuit,25,feedbackLevels()),snapshotCircuit(circuit));
    delete circuit.wires.loop.inputRole;
    assert.deepEqual(validateSavedCircuitRecord({version,circuit}).circuit,snapshotCircuit(circuit));
    assert.equal(evaluateCombinational(circuit).ok,false);
    circuit.wires.output.startBlockId='missing';
    assert.throws(()=>validateSavedCircuitRecord({version,circuit}));
  }
  const c=read('tests/fixtures/demo/1-3.json').circuit;
  const w=c.wires.w1; [w.startBlockId,w.endBlockId]=[w.endBlockId,w.startBlockId]; w.path.reverse();
  assert.equal(evaluateCombinational(c).ok,false);
  assert.deepEqual(validateSavedCircuitRecord({version:2,circuit:c}).circuit,snapshotCircuit(c));
});

test('482 AC-8/9: demo feedback drafts and old invalid achievements round-trip without promoting costs', () => {
  const levels=feedbackLevels(), map=new Map(), storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  const store=createDemoStore({storage,levels,budgets:{},themeIds:[]});
  store.state.unlockedStages=[25];
  assert.equal(store.setDraft(25,selfFeedbackCircuit('EN')),true);
  const backup=store.exportBackup(); assert.equal(store.replace(store.parseBackup(backup)),true);
  assert.deepEqual(store.state.stages[25].draft.circuit,snapshotCircuit(selfFeedbackCircuit('EN')));
  const real=read('levels.json'), raw=emptyProgress(), old=read('tests/fixtures/demo/1-3.json').circuit;
  old.blocks.extra=newBlock({id:'extra',type:'NOT',pos:{r:5,c:5}});
  const record={circuitVersion:2,circuit:old,gradingVersion:5,pricingVersion:'cost-v1',stageId:1,stageRules:stageRules(real,1),totalCost:22,stars:3};
  raw.stages[1]={best:record,bestStars:record,draft:{circuitVersion:2,circuit:old}};
  const good=makeCostRecord(read('tests/fixtures/demo/2-3.json').circuit,2,real);
  raw.stages[2]={best:good,bestStars:good};
  const restored=validateProgress(raw,real,{},[]);
  assert.deepEqual(restored.stages[1].best.circuit,snapshotCircuit(old));
  assert.equal(restored.stages[1].best.stars,3); assert.equal(restored.stages[1].best.gradingVersion,5);
  assert.equal(isCurrentCostRecord(restored.stages[1].best,real,1),false);
  assert.equal(isCurrentCostRecord(restored.stages[2].best,real,2),true);
  assert.throws(()=>makeCostRecord(old,1,real)); assert.equal(GRADING_VERSION,6);
});

test('482 AC-10, 491 AC-4: all 84 shipped examples retain layout, grade and occupied-cell costs in both languages', () => {
  const levels=read('levels.json'), en=read('levels_en.json'); let count=0; const ids=new Set();
  for (const folder of ['demo','stages','memory20']) for (const name of fs.readdirSync(new URL(`./fixtures/${folder}/`,import.meta.url))) {
    if (!name.endsWith('.json')) continue;
    const record=read(`tests/fixtures/${folder}/${name}`), c=record.circuit, id=Number.parseInt(name,10);
    assert.deepEqual(validateConnections(c).diagnostics,[],`${folder}/${name}`);
    for (const language of [levels,en]) {
      const snapshot=validateStageCircuit(c,id,language);
      assert.equal(gradeCircuitSync(snapshot,language.levelAnswers[id]).ok,true,`${folder}/${name}`);
      assert.deepEqual(calculateCircuitCost(snapshot),calculateCircuitCost(c));
    }
    count++; ids.add(id);
  }
  assert.equal(count,84); assert.equal(ids.size,33);
});
