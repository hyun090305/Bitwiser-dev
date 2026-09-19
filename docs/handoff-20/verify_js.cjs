/* Standard-library-only cross-check of the interpreter embedded in the HTML. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'Bitwiser_20_Final_Answers.html'),'utf8');
const blocks=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const context={module:{exports:{}}};vm.createContext(context);
vm.runInContext(blocks[1].split('const ITEMS=')[0],context);
const {circuitTick}=context.module.exports;
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'tests/exhaustive_transitions.json'),'utf8'));
let count=0;
for(const group of cases){
 const net=JSON.parse(fs.readFileSync(path.join(__dirname,'circuits',group.slot+'.json'),'utf8'));
 for(const [before,inputs,after,outputs] of group.transitions){
  const state=Object.fromEntries(group.memories.map((k,i)=>[k,before[i]]));
  const u=Object.fromEntries(group.inputs.map((k,i)=>[k,inputs[i]]));
  const r=circuitTick(net,state,u);
  assert.deepStrictEqual(group.memories.map(k=>r.state[k]),after);
  assert.deepStrictEqual(group.outputs.map(k=>r.output[k]),outputs);count++;
 }
}
const result={passed:true,stages:cases.length,python_javascript_transition_comparisons:count,scope:'Primitive interpreter from the delivered HTML vs independent Python results; no DOM or rendering dependency'};
fs.writeFileSync(path.join(__dirname,'javascript_verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
