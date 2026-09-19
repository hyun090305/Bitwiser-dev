import fs from 'node:fs/promises';
import {memorySpecs,answersFor,exampleRowsFor,referenceGraphs} from './lib/memory-stage-specs.mjs';
import {routeReference,detourReference} from './lib/route-reference.mjs';
import {gradeCircuit} from '../src/modules/circuitGrading.js';
import {isValidWirePath} from '../src/canvas/circuitData.js';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,data)=>fs.writeFile(p,JSON.stringify(data,null,2)+'\n');
const levels=await read('levels.json'),en=await read('levels_en.json');
const selected=process.argv.slice(2).map(Number);
for(const [key,graph] of Object.entries(referenceGraphs)) {
  const id=Number(key);if(selected.length?!selected.includes(id):id===23)continue;
  if(levels.levelAnswers[id]?.referenceId?.startsWith('memory20:'))continue;
  const spec=memorySpecs.find(s=>s.id===id);
  let circuit;
  try {circuit=routeReference(graph,{seed:id,attempts:160000,fixedIO:id===23||id>=25});}
  catch(error){console.error(id,error.message);process.exitCode=1;continue;}
  if(id>=25) {
    for(const b of Object.values(circuit.blocks))if(b.type==='INPUT')b.inputMode=spec?.buttons.includes(b.name)?'button':'switch';
    const palette=Object.values(circuit.blocks).filter(b=>['INPUT','OUTPUT'].includes(b.type)).map(b=>({type:b.type,name:b.name,...(b.inputMode?{inputMode:b.inputMode}:{})}));
    palette.push(...(id===27?['NOT','AND','OR','JUNCTION']:['D','NOT','AND','OR','JUNCTION']).map(type=>({type})));
    const answers=id===27?Array.from({length:8},(_,n)=>({inputs:{A:n&1,B:(n>>1)&1,SEL:(n>>2)&1},expected:{OUT:(n>>((n&4)?1:0))&1}})):answersFor(spec);
    const selectorDesc=['SEL=0ならA、SEL=1ならBをOUTに出力する組合せ回路を作ってください。メモリは使いません。','Build a combinational selector: OUT=A when SEL=0, otherwise OUT=B. No memory is needed.'];
    const selectorHint=['SEL과 NOT SEL로 두 경로를 선택하고 OR로 합치세요.','Enable the two paths with SEL and NOT SEL, then combine them with OR.'];
    for(const [language,data] of [levels,en].entries()) {
      data.levelTitles[id]=spec?.title[language]||'2-to-1 Selector';
      data.levelGridSizes[id]=graph.size;data.levelBlockSets[id]=palette;
      data.levelFixedIO[id]={fixIO:true,grid:Object.values(circuit.blocks).filter(b=>b.fixed).map(b=>({index:b.pos.r*circuit.cols+b.pos.c,type:b.type,name:b.name,...(b.inputMode?{inputMode:b.inputMode}:{})}))};
      data.levelAnswers[id]=answers;
      data.levelDescriptions[id]={title:data.levelTitles[id],desc:spec?.desc[language]||selectorDesc[language],table:answers.mode==='sequential'?exampleRowsFor(spec):answers.map(row=>({...row.inputs,...row.expected}))};
      data.levelHints[`stage${id}`]={hints:[{type:language?'Explanation':'설명',content:spec?.hint[language]||selectorHint[language]}]};
    }
  }
  const result=await gradeCircuit(circuit,levels.levelAnswers[id]);
  if(!result.ok)throw new Error(`Reference ${id} failed: ${JSON.stringify(result)}`);
  for(const [tier,reference] of [[3,circuit],[2,detourReference(circuit)]]) {
    const positions=new Map(Object.values(reference.blocks).map(b=>[`${b.pos.r},${b.pos.c}`,b])),occupied=new Set();
    for(const wire of Object.values(reference.wires)) {
      if(!isValidWirePath(wire.path,{withinBounds:(r,c)=>r>=0&&c>=0&&r<reference.rows&&c<reference.cols,blockAt:p=>positions.get(`${p.r},${p.c}`),cellHasWire:p=>occupied.has(`${p.r},${p.c}`)}))throw new Error(`Invalid geometry ${id}/${tier}`);
      wire.path.slice(1,-1).forEach(p=>occupied.add(`${p.r},${p.c}`));
    }
    if(Object.values(reference.blocks).some(b=>Object.values(reference.wires).filter(w=>w.startBlockId===b.id).length>4))throw new Error('Outdegree exceeds 4');
    const folder=id>=32?'tests/fixtures/stages':'tests/fixtures/demo';
    await fs.mkdir(folder,{recursive:true});
    await write(`${folder}/${id}-${tier}.json`,{purpose:'Verified attainable budget, not a minimum claim',circuit:reference});
  }
  console.log(`Verified ${id}: ${Object.keys(circuit.blocks).length} blocks, ${result.total} cases`);
}
await write('levels.json',levels);await write('levels_en.json',en);
