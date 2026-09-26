import fs from 'node:fs/promises';
import { MEMORY20_IDS, memory20ReferenceId } from '../src/modules/memory20References.js';
import { gradeCircuitSync } from '../src/modules/circuitGrading.js';
import { validateStageCircuit } from '../src/modules/stageCircuit.js';
import { calculateCircuitCost } from '../src/modules/circuitCost.js';
import { memory20Copy } from './lib/memory20-copy.mjs';
import { memory20Korean } from './lib/memory20-player-copy.mjs';
import { detourReference } from './lib/route-reference.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,data)=>fs.writeFile(p,JSON.stringify(data,null,2)+'\n');
const root='docs/handoff-20',catalog=await read(`${root}/catalog.json`),examples=await read(`${root}/tests/acceptance_examples.json`);
const languages=await Promise.all(['levels.json','levels_en.json'].map(read)),report=[];
// Keep the previous published board contracts so backups can retain old
// designs without coercing removed/renamed ports into the new puzzle.
for(const data of languages)for(const id of Object.values(MEMORY20_IDS)) {
  if(data.levelAnswers[id]&&data.levelAnswers[id].referenceId?.startsWith('memory20:')!==true) {
    (data.levelLegacyDefinitions??={})[id]=Object.fromEntries(['levelGridSizes','levelBlockSets','levelFixedIO','levelAnswers'].map(key=>[key,data[key][id]]));
  }
  if(data.levelRevisions?.[id]==='memory20-final-2026-09-18') {
    (data.levelPreviousLayouts??={})[id]=[Object.fromEntries(['levelGridSizes','levelBlockSets','levelFixedIO','levelAnswers'].map(key=>[key,structuredClone(data[key][id])]))];
  }
  const previousResponseLayout=data.levelAnswers[id]?.referenceId==='memory20:response-check'&&data.levelGridSizes[id]?.join('x')!=='12x12';
  if(id===29&&(data.levelAnswers[id]?.referenceId==='memory20:C5-04'||previousResponseLayout)) {
    const definition=Object.fromEntries(['levelGridSizes','levelBlockSets','levelFixedIO','levelAnswers'].map(key=>[key,structuredClone(data[key][id])]));
    const previous=(data.levelPreviousLayouts??={})[id]??=[];
    if(!previous.some(item=>JSON.stringify(item)===JSON.stringify(definition)))previous.push(definition);
  }
  if([32,33,34].includes(id)&&['memory20:C4-06','memory20:C4-07','memory20:C4-10'].includes(data.levelAnswers[id]?.referenceId)) {
    const definition=Object.fromEntries(['levelGridSizes','levelBlockSets','levelFixedIO','levelAnswers'].map(key=>[key,structuredClone(data[key][id])]));
    const previous=(data.levelPreviousLayouts??={})[id]??=[];
    if(!previous.some(item=>JSON.stringify(item)===JSON.stringify(definition)))previous.push(definition);
  }
}
for(const entry of catalog) {
  const id=MEMORY20_IDS[entry.slot],fixture=await read(`tests/fixtures/memory20/${id}.json`),c=fixture.circuit;
  if(id===29&&(c.rows!==12||c.cols!==12))throw new Error('Response Check must retain its 12x12 board');
  const [titleKo,ko,hintKo]=memory20Korean[entry.slot];
  const [titleEn,descEn,hintEn]=memory20Copy[entry.slot];
  const palette=Object.values(c.blocks).filter(b=>['INPUT','OUTPUT'].includes(b.type)).map(b=>({type:b.type,name:b.name,...(b.type==='INPUT'?{inputMode:b.inputMode}:{})}));
  palette.push(...['D','NOT','AND','OR','JUNCTION'].map(type=>({type})));
  const answers={mode:'sequential',referenceId:memory20ReferenceId(entry.slot)};
  const table=entry.slot==='C4-07'?[0,1,2,3].map(n=>({LEVEL0:n&1,LEVEL1:n>>1,LIGHT:Array.from({length:4},(_,p)=>Number(p<n)).join(' ')}))
    :entry.slot==='C5-10'?[[0,3],[2,3],[6,2],[7,1],[7,3]].map(([A,B])=>Object.fromEntries([
    ...Array.from({length:3},(_,i)=>[`A${i}`,(A>>>i)&1]),...Array.from({length:2},(_,i)=>[`B${i}`,(B>>>i)&1]),
    ...Array.from({length:3},(_,i)=>[`Q${i}`,(Math.floor(A/B)>>>i)&1]),...Array.from({length:2},(_,i)=>[`R${i}`,((A%B)>>>i)&1]),['COMPLETE',1]
  ]))
    :examples.find(e=>e.slot===entry.slot).trace.map(row=>({tick:row.tick,observation:'after',...row.inputs,...row.outputs}));
  for(const [language,data] of languages.entries()) {
    data.levelTitles[id]=language?titleEn:titleKo;
    data.levelGridSizes[id]=[c.rows,c.cols];data.levelBlockSets[id]=palette;
    data.levelFixedIO[id]={fixIO:false,grid:[]};
    data.levelAnswers[id]=answers;
    data.levelDescriptions[id]={title:data.levelTitles[id],desc:language?descEn:ko,table};
    data.levelHints[`stage${id}`]={hints:[{type:language?'Explanation':'설명',content:language?hintEn:hintKo}]};
    data.levelStarThresholds[id]??={twoStarMaxCost:null,threeStarMaxCost:null};
    (data.levelRevisions??={})[id]=[32,33,34].includes(id)?'control-stages-2026-09-26':id===29?'response-check-2026-09-24':'memory20-free-compact-2026-09-18';
    validateStageCircuit(c,id,data);
  }
  const result=gradeCircuitSync(c,answers);if(!result.ok)throw new Error(`${id}: ${JSON.stringify(result)}`);
  const folder=id>=32?'tests/fixtures/stages':'tests/fixtures/demo';
  for(const [tier,circuit] of [[3,c],[2,detourReference(c)]])await write(`${folder}/${id}-${tier}.json`,{purpose:'Verified final handoff reference; not a minimum or an authored star threshold',circuit});
  report.push({slot:entry.slot,id,title:titleKo,logicalBlocks:entry.blocks,placedBlocks:Object.keys(c.blocks).length,
    previousGrid:languages[0].levelPreviousLayouts?.[id]?.[0]?.levelGridSizes,grid:[c.rows,c.cols],fixedIO:false,padding:id===29||entry.blocks<=11?1:2,
    ...calculateCircuitCost(c),transitions:result.transitions});
}
for(const [i,file] of ['levels.json','levels_en.json'].entries())await write(file,languages[i]);
await write('docs/memory20-integration.json',report);
console.log(`Integrated ${report.length} final memory puzzles; existing IDs and star thresholds retained.`);
