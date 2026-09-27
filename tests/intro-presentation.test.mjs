import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatBlockLabels } from '../src/blockLabel.js';
import { formatIntroText, parseLogicRows } from '../src/modules/introPresentation.js';
import { stageRules } from '../src/modules/costRecords.js';

const languages = ['levels.json', 'levels_en.json'].map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
const orders = {
  9: ['IN1 IN2', 'OUT2 OUT1'],
  10: ['IN1 IN2 IN3', 'OUT2 OUT1'],
  11: ['IN1 IN2', 'OUT1 OUT2 OUT3 OUT4'],
  14: ['A1 A0 B1 B0', 'S2 S1 S0'],
  15: ['A1 A0 B1 B0', 'R1 R0'],
  17: ['A1 A0 B1 B0', 'P3 P2 P1 P0'],
  22: ['IN1 IN2', 'OUT1 OUT2 OUT3 OUT4'],
  23: ['IN1 IN2 IN3 IN4', 'OUT1 OUT2 OUT3 OUT4'],
  32: ['INC DEC', 'BIT1 BIT0'],
  33: ['LEVEL1 LEVEL0', 'LIGHT'],
  34: ['TIME1 TIME0 START', 'DONE'],
  38: ['D1 D0 ADDR WRITE', 'Q1 Q0'],
  39: ['D1 D0 SAVE UNDO', 'Q1 Q0 UNDO_AVAILABLE'],
  43: ['DATA RECEIVE', 'Q3 Q2 Q1 Q0 DONE'],
  44: ['D3 D2 D1 D0 START RESET', 'SERIAL VALID BUSY'],
  45: ['D1 D0 ADD RESET', 'Q1 Q0'],
  46: ['A2 A1 A0 B1 B0', 'Q2 Q1 Q0 R1 R0 COMPLETE']
};

test('497 AC-1: reuse block subscripts only for IO names, preserving ordinary numbers', () => {
  assert.equal(formatBlockLabels('IN1 IN2 OUT1 BIT0 A1 INC DEC AND'), 'IN₁ IN₂ OUT₁ BIT₀ A₁ INC DEC AND');
  const ports = ['IN1', 'IN2', 'IN3', 'OUT1', 'OUT2', 'OUT3', 'BIT1', 'BIT0'].map(name => ({type:'INPUT', name}));
  assert.equal(formatIntroText('IN1을 IN2와 OUT1으로. BIT1 BIT0=00, tick 10, 0/1, 0~3, STAGE 32, V2, AND.', ports),
    'IN₁을 IN₂와 OUT₁으로. BIT₁ BIT₀=00, tick 10, 0/1, 0~3, STAGE 32, V2, AND.');
  assert.equal(formatIntroText('OUT1·2·3=IN3·1·2. IN10 XIN1 IN1_suffix OUT1·9', ports), 'OUT₁·₂·₃=IN₃·₁·₂. IN10 XIN1 IN1_suffix OUT1·9');
});

test('497 AC-4/6: all 562 bilingual rows preserve raw keys, values, timing and authoritative data', () => {
  let count = 0;
  const rendered = [];
  for (const data of languages) {
    const before = structuredClone(data);
    const rules = Object.fromEntries(Object.keys(data.levelTitles).map(id => [id, stageRules(data, id)]));
    const rowsByStage = {};
    for (const [id, desc] of Object.entries(data.levelDescriptions)) {
      const blocks = data.levelBlockSets[id];
      const rows = parseLogicRows(id, desc.table, blocks);
      rowsByStage[id] = rows;
      assert.equal(rows.length, desc.table.length);
      rows.forEach((row, index) => {
        count++;
        const original = desc.table[index];
        assert.equal(row.tick, original.tick);
        assert.equal(row.observation, original.observation);
        const signals = [...row.inputSignals, ...row.outputSignals];
        assert.deepEqual(signals.map(s => s.key).sort(), Object.keys(original).filter(k => !['tick', 'observation'].includes(k)).sort());
        for (const signal of signals) assert.equal(signal.value, String(original[signal.key]).trim());
        for (const [side, type] of [['inputSignals','INPUT'], ['outputSignals','OUTPUT']]) {
          const expected = orders[id]?.[side === 'inputSignals' ? 0 : 1]?.split(' ')
            || blocks.filter(b => b.type === type).map(b => b.name);
          assert.deepEqual(row[side].map(s => s.label), expected, `${id}/${side}`);
        }
      });
      formatIntroText(desc.desc, blocks);
      for (const rule of desc.rules || []) rule.forEach(text => formatIntroText(text, blocks));
      assert.equal(stageRules(data, id), rules[id]);
    }
    assert.deepEqual(data, before);
    rendered.push(rowsByStage);
  }
  assert.equal(count, 562);
  assert.deepEqual(rendered[0], rendered[1]);
  assert.deepEqual(rendered[0][32].slice(0, 2).map(row => row.outputSignals.map(s => [s.label, s.value])),
    [[['BIT1','0'], ['BIT0','1']], [['BIT1','1'], ['BIT0','0']]]);
  assert.deepEqual(rendered[0][15][1].outputSignals, [{key:'S1',label:'R1',value:'1'}, {key:'S0',label:'R0',value:'1'}]);
});
