import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatBlockLabels } from '../src/blockLabel.js';
import { formatIntroText, parseLogicRows } from '../src/modules/introPresentation.js';
import { stageRules } from '../src/modules/costRecords.js';
import { signalDisplayName, signalDisplayText, blockDisplayName, blockDisplayLabel, hintDisplayText, diagnosticDisplayText } from '../src/signalPresentation.js';
import { blueprintLayout } from '../src/canvas/blueprintExport.js';

const aliases = JSON.parse(fs.readFileSync(new URL('./fixtures/signal-aliases.json', import.meta.url), 'utf8'));
const introText = JSON.parse(fs.readFileSync(new URL('./fixtures/intro-text.json', import.meta.url), 'utf8'));
const copy = JSON.parse(fs.readFileSync('scripts/data/stage-copy.json', 'utf8'));

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

test('497 AC-1: only block labels use subscripts; bilingual prose uses literal plain-digit expectations', () => {
  assert.equal(formatBlockLabels('IN1 IN2 OUT1 BIT0 A1 INC DEC AND'), 'IN₁ IN₂ OUT₁ BIT₀ A₁ INC DEC AND');
  assert.equal(formatIntroText('IN1을 IN2와 OUT1으로. BIT1 BIT0=00, tick 10, 0/1, 0~3, STAGE 32, V2, AND.'),
    'IN1을 IN2와 OUT1으로. BIT1 BIT0=00, tick 10, 0/1, 0~3, STAGE 32, V2, AND.');
  assert.equal(formatIntroText('OUT1·2·3=IN3·1·2. IN10 XIN1 IN1_suffix OUT1·9', 21), 'OUT1·2·3=IN3·1·2. IN10 XIN1 IN1_suffix OUT1·9');
  for (const [index, lang] of ['ko', 'en'].entries()) {
    for (const [id, desc] of Object.entries(languages[index].levelDescriptions)) {
      const expected = introText[id];
      assert.equal(formatIntroText(desc.desc, id), expected?.[lang] ?? copy[id][lang], `${id}/${lang}/desc`);
      assert.deepEqual(desc.rules.map(rule => rule.map(text => formatIntroText(text, id))),
        copy[id].rules[lang].map((rule, i) => expected?.rules?.[lang]?.[i] ?? rule), `${id}/${lang}/rules`);
      assert.doesNotMatch(formatIntroText(desc.desc + JSON.stringify(desc.rules), id), /[₀-₉]/);
    }
  }
  for (const [type, raw, stageId, plain, block] of [
    ['INPUT', 'IN1', 1, 'IN1', 'IN₁'], ['OUTPUT', 'OUT1', 1, 'OUT1', 'OUT₁'],
    ['INPUT', 'LEVEL1', 33, 'L1', 'L₁'], ['INPUT', 'LEVEL0', 33, 'L0', 'L₀'],
    ['OUTPUT', 'Q2', 46, 'Q2', 'Q₂']
  ]) {
    assert.equal(blockDisplayName(type, raw, stageId), plain);
    assert.equal(blockDisplayLabel(type, raw, stageId), block);
    const circuit = {rows:2,cols:2,blocks:{b:{id:'b',type,name:raw,pos:{r:0,c:0}}},wires:{}};
    assert.equal(blueprintLayout(circuit, 1, stageId).aliases.b, block);
  }
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
          assert.deepEqual(row[side].map(s => s.label), expected.map(key => aliases[id]?.[key] || key), `${id}/${side}`);
        }
      });
      formatIntroText(desc.desc, id);
      for (const rule of desc.rules || []) rule.forEach(text => formatIntroText(text, id));
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

test('497 AC-7/8: official aliases preserve raw designs and require an explicit target stage', () => {
  for (const [stageId, names] of Object.entries(aliases)) {
    const blocks = Object.fromEntries(Object.keys(names).map((name, c) => [name, { id:name, type:'INPUT', name, pos:{r:0,c} }]));
    const circuit = { rows:2, cols:8, blocks, wires:{} }, before = structuredClone(circuit);
    const official = blueprintLayout(circuit, 1, stageId), custom = blueprintLayout(circuit);
    for (const [raw, display] of Object.entries(names)) {
      assert.equal(signalDisplayName(raw, stageId), display);
      assert.equal(official.aliases[raw], formatBlockLabels(display));
      assert.equal(custom.aliases[raw], formatBlockLabels(raw));
      assert.equal(signalDisplayName(raw), raw);
      assert.equal(blockDisplayLabel('AND', raw, stageId), formatBlockLabels(raw));
      assert.equal(signalDisplayText(`X${raw} ${raw}_suffix`, stageId), `X${raw} ${raw}_suffix`);
    }
    assert.deepEqual(circuit, before);
    assert.deepEqual(official.snapshot, custom.snapshot);
  }
  assert.equal(signalDisplayName('SIGNAL', 31), 'SIG');
  assert.equal(signalDisplayName('SIGNAL', 37), 'BIT');
  assert.equal(signalDisplayName('SIGNAL', 1), 'SIGNAL');
  assert.equal(signalDisplayText('LEVEL LEVEL1 LEVEL0', 33), 'L L1 L0');
  assert.equal(signalDisplayText('IN1·2·3를 더해 OUT2 OUT1로 출력하세요.', 10), 'A·B·CIN을 더해 COUT SUM으로 출력하세요.');
  assert.equal(signalDisplayText('IN1/2/3', 10), 'A/B/CIN');
  assert.equal(signalDisplayText('GO를 켜고 SERIAL로 보내세요.', 29), 'DONE을 켜고 SERIAL로 보내세요.');
  assert.equal(signalDisplayText('SIGNAL이 바뀌면', 31), 'SIG가 바뀌면');
  assert.equal(signalDisplayText('IN1·2·3 COMPLETE LEVEL'), 'IN1·2·3 COMPLETE LEVEL');
  assert.equal(diagnosticDisplayText('OUTPUT COMPLETE: missing input.', {type:'OUTPUT'}, 46), 'OUTPUT DONE: missing input.');
  assert.equal(diagnosticDisplayText('D COMPLETE: missing input.', {type:'D'}, 46), 'D COMPLETE: missing input.');
  assert.equal(hintDisplayText(languages[0].levelHints.stage30.hints[0].content, 30), '최근 세 번의 IN을 기억하고, 하나라도 1이면 OUT=1을 유지하세요.');
  assert.match(hintDisplayText(languages[1].levelHints.stage37.hints[0].content, 37), /keep FOUND=1 after finding the pattern/);
  for (const data of languages) {
    const hints = data.levelHints.stage10.hints;
    assert.equal(hintDisplayText(hints[1].content, 10), 'COUT = (A∧B)∨(B∧CIN)∨(CIN∧A), SUM = (A XOR B) XOR CIN');
    assert.doesNotMatch(hintDisplayText(hints[2].content, 10), /\bC\b/);
  }
});
