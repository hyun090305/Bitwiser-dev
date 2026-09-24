import fs from 'node:fs/promises';
import { routeHandoff } from './lib/route-handoff.mjs';
import { packCircuit } from './lib/compact-circuit.mjs';
import { isValidWirePath } from '../src/canvas/circuitData.js';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { MEMORY20_IDS, memory20ReferenceId } from '../src/modules/memory20References.js';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const root='docs/handoff-20';
const reroute=process.argv.includes('--reroute'),selected=process.argv.slice(2).filter(x=>!x.startsWith('--'));
for(const entry of await read(`${root}/catalog.json`)) {
  if(selected.length&&!selected.includes(entry.slot))continue;
  const id=MEMORY20_IDS[entry.slot],file=`tests/fixtures/memory20/${id}.json`;
  const existing=await read(file).catch(()=>null);
  const derived=await read(`test-results/memory20-layout/${entry.slot}.json`).catch(()=>null);
  const net=derived?.net||await read(`${root}/${entry.circuit}`),cert=derived?.certificate||await read(`${root}/${entry.certificate}`);
  const c=!reroute&&existing?existing.circuit:packCircuit(routeHandoff(net,cert,{seed:entry.number}),{seed:id,rounds:80});
  const positions=new Map(Object.values(c.blocks).map(b=>[`${b.pos.r},${b.pos.c}`,b])),occupied=new Set();
  for(const w of Object.values(c.wires)) {
    if(!isValidWirePath(w.path,{withinBounds:(r,col)=>r>=0&&col>=0&&r<c.rows&&col<c.cols,blockAt:p=>positions.get(`${p.r},${p.c}`),cellHasWire:p=>occupied.has(`${p.r},${p.c}`)}))throw new Error(`${entry.slot}: illegal wire ${w.id}`);
    w.path.slice(1,-1).forEach(p=>occupied.add(`${p.r},${p.c}`));
  }
  const result=gradeCircuitSync(c,{mode:'sequential',referenceId:memory20ReferenceId(entry.slot)});
  if(!result.ok)throw new Error(`${entry.slot}: ${JSON.stringify(result)}`);
  await fs.mkdir('tests/fixtures/memory20',{recursive:true});
  await fs.writeFile(file,JSON.stringify({slot:entry.slot,sourceVariant:entry.selected_variant,logicalBlocks:entry.blocks,circuit:c})+'\n');
  console.log(`${entry.slot} -> ${id}: ${c.rows}x${c.cols}, ${Object.keys(c.blocks).length} placed blocks, ${result.transitions} transitions`);
}
