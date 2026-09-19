import fs from 'node:fs/promises';
import {routeReference,detourReference} from './lib/route-reference.mjs';
import {gradeCircuitSync} from '../src/modules/circuitGrading.js';
const graph={size:[9,7],nodes:[['IN1','INPUT',0,0],['IN2','INPUT',0,2],['IN3','INPUT',0,4],['IN4','INPUT',0,6],['OUT1','OUTPUT',8,0],['OUT2','OUTPUT',8,2],['OUT3','OUTPUT',8,4],['OUT4','OUTPUT',8,6],['n4','NOT',2,5],['n3','NOT',2,3],['n2','NOT',2,1],['c3','AND',4,3],['c2','AND',4,1],['a1','AND',6,0],['a2','AND',6,2],['a3','AND',6,4]],edges:[['IN4','OUT4'],['IN4','n4'],['IN3','n3'],['IN2','n2'],['n4','c3'],['n3','c3'],['c3','c2'],['n2','c2'],['c2','a1'],['IN1','a1'],['c3','a2'],['IN2','a2'],['n4','a3'],['IN3','a3'],['a1','OUT1'],['a2','OUT2'],['a3','OUT3']]};
const levels=JSON.parse(await fs.readFile('levels.json','utf8'));
for(let seed=1;seed<=30;seed++) {
  let circuit;
  try { circuit=routeReference(graph,{seed,attempts:200000,fixedIO:true}); }
  catch(error) { console.log(seed,error.message); continue; }
  if(!gradeCircuitSync(circuit,levels.levelAnswers[23]).ok)throw new Error('Wrong priority logic');
  for(const [tier,c] of [[3,circuit],[2,detourReference(circuit)]])await fs.writeFile(`tests/fixtures/demo/23-${tier}.json`,JSON.stringify({purpose:'Verified attainable budget, not a minimum claim',circuit:c},null,2)+'\n');
  console.log('Found actual layout',seed);process.exit(0);
}
process.exitCode=1;
