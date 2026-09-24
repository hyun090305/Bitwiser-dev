import fs from 'node:fs/promises';
import { packCircuit } from './lib/compact-circuit.mjs';
import { MEMORY20_IDS, memory20ReferenceId } from '../src/modules/memory20References.js';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
const report=[];
for(const [slot,id] of Object.entries(MEMORY20_IDS)) {
  const selected=process.argv.slice(2).filter(v=>!v.startsWith('--'));
  if(selected.length&&!selected.includes(slot))continue;
  const file=`tests/fixtures/memory20/${id}.json`,fixture=JSON.parse(await fs.readFile(file,'utf8'));
  const before=[fixture.circuit.rows,fixture.circuit.cols];
  let circuit=fixture.circuit;
  const attempts=process.argv.includes('--search')?8:1;
  // Response Check keeps the user-selected 12x12 board (#475).
  if(id!==29)for(let attempt=0;attempt<attempts;attempt++)circuit=packCircuit(circuit,{seed:id+attempt*7919,rounds:80});
  if(!gradeCircuitSync(circuit,{mode:'sequential',referenceId:memory20ReferenceId(slot)}).ok)throw new Error(`${slot}: grading failed`);
  await fs.writeFile(file,JSON.stringify({...fixture,circuit})+'\n');
  report.push({slot,id,before,after:[circuit.rows,circuit.cols]});
  console.log(`${slot} / ${id}: ${before.join('x')} -> ${circuit.rows}x${circuit.cols}`);
}
await fs.writeFile('test-results/memory20-compaction.json',JSON.stringify(report,null,2)+'\n');
