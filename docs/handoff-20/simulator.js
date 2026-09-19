/* Independent direct interpreter used by both the viewer and Node audit. */
function evaluateCircuit(net,state,input){
 const by=Object.fromEntries(net.nodes.map(n=>[n.id,n]));const vals={};const visiting=new Set();
 function get(id){if(id in vals)return vals[id];if(visiting.has(id))throw new Error('Combinational cycle '+id);visiting.add(id);
  const n=by[id];let v;if(n.type==='INPUT')v=input[id]||0;else if(n.type==='D'||n.type==='DE')v=state[id]||0;else if(n.type==='NOT')v=1^get(n.inputs[0]);else if(n.type==='AND')v=get(n.inputs[0])&get(n.inputs[1]);else if(n.type==='OR')v=get(n.inputs[0])|get(n.inputs[1]);else if(n.type==='OUTPUT')v=get(n.inputs[0]);else throw new Error('Unsupported '+n.type);
  visiting.delete(id);vals[id]=v;return v;
 }
 net.nodes.forEach(n=>get(n.id));return vals;
}
function circuitTick(net,state,input){const before=evaluateCircuit(net,state,input),next={};
 for(const n of net.nodes){if(n.type==='D')next[n.id]=before[n.inputs[0]];if(n.type==='DE')next[n.id]=before[n.inputs[1]]?before[n.inputs[0]]:(state[n.id]||0)}
 const after=evaluateCircuit(net,next,input),output={};for(const n of net.nodes)if(n.type==='OUTPUT')output[n.name||n.id]=after[n.id];return {state:next,output,values:after};
}
if(typeof module!=='undefined')module.exports={evaluateCircuit,circuitTick};
