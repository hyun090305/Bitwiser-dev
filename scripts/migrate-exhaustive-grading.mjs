import fs from 'node:fs/promises';
import { memorySpecs, answersFor, exampleRowsFor } from './lib/memory-stage-specs.mjs';

// Idempotently refresh runtime specifications and presentation examples without
// rerouting unrelated reference circuits or rewriting their efficiency budgets.
for (const [language, file] of ['levels.json', 'levels_en.json'].entries()) {
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const spec of memorySpecs) {
    if(data.levelAnswers[spec.id]?.referenceId?.startsWith('memory20:'))continue;
    data.levelAnswers[spec.id] = answersFor(spec);
    data.levelDescriptions[spec.id] = { title: spec.title[language], desc: spec.desc[language], table: exampleRowsFor(spec) };
    data.levelHints[`stage${spec.id}`] = { hints: [{ type: language ? 'Explanation' : '설명', content: spec.hint[language] }] };
  }
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
}
// Stage 31 now exposes the combinational detection pulse. Preserve the legal
// routed path by joining the two wires through the removed output register.
for (const tier of [2, 3]) {
  const file = `tests/fixtures/demo/31-${tier}.json`;
  const fixture = JSON.parse(await fs.readFile(file, 'utf8')), c = fixture.circuit;
  if (c.blocks.r?.type === 'D') {
    const incoming = Object.values(c.wires).find(w => w.endBlockId === 'r');
    const outgoing = Object.values(c.wires).find(w => w.startBlockId === 'r');
    incoming.endBlockId = outgoing.endBlockId;
    incoming.path = [...incoming.path, ...outgoing.path.slice(1)];
    delete incoming.inputRole;
    delete c.wires[outgoing.id]; delete c.blocks.r;
    await fs.writeFile(file, JSON.stringify(fixture, null, 2) + '\n');
  }
}
