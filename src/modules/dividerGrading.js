export const DIVIDER_INPUTS = Object.freeze(['A0','A1','A2','B0','B1']);
export const DIVIDER_OUTPUTS = Object.freeze(['Q0','Q1','Q2','R0','R1','COMPLETE']);
const bits=(value,prefix,width)=>Object.fromEntries(Array.from({length:width},(_,i)=>[prefix+i,(value>>>i)&1]));
// tick must update all memories together and return settled POST-tick outputs.
// This judge accepts any implementation completing on ticks 1..10.
export function judgeDivision(tick,A,B) {
  if(!Number.isInteger(A)||!Number.isInteger(B)||A<0||A>7||B<1||B>3)throw new Error('Division domain: A=0..7, B=1..3');
  const inputs={...bits(A,'A',3),...bits(B,'B',2)}, observations=[];
  for(let t=1;t<=10;t++) {
    const actual=tick({...inputs});observations.push({...actual});
    if(actual.COMPLETE) {
      const expected={...bits(Math.floor(A/B),'Q',3),...bits(A%B,'R',2),COMPLETE:1};
      const ok=DIVIDER_OUTPUTS.every(name=>Number(actual[name])===expected[name]);
      return {ok,tick:t,reason:ok?'correct':'wrong_first_complete',inputs,actual,expected,observations};
    }
  }
  return {ok:false,tick:10,reason:'completion_timeout',inputs,actual:observations.at(-1),expected:{COMPLETE:1},observations};
}

export function* verifyDivider(compiled, {maxTransitions=Infinity,timedOut=()=>false}={}) {
  let transitions=0,completed=0;
  const results=[];
  for(let A=0;A<8;A++)for(let B=1;B<4;B++) {
    let state=0;
    const evaluator=compiled.createEvaluator();
    const limit={};let result;
    try { result=judgeDivision(inputs=>{
      if(transitions>=maxTransitions||timedOut()) {limit.reason=transitions>=maxTransitions?'TRANSITION_LIMIT':'TIME_LIMIT';throw limit;}
      const mask=compiled.inputNames.reduce((n,name,i)=>n|(inputs[name]<<i),0);
      state=evaluator.evaluate(state,mask).nextState;
      const output=evaluator.evaluate(state,mask).outputs;
      transitions++;
      return Object.fromEntries(compiled.outputNames.map((name,i)=>[name,(output>>>i)&1]));
    },A,B); } catch(error) {
      if(error!==limit)throw error;
      return {ok:false,status:'incomplete',reason:limit.reason,states:0,transitions,completed,total:24};
    }
    if(!result.ok) {
      const trace=[{type:'init',memory:compiled.memoryIds.map(blockId=>({blockId,signal:blockId,value:0}))},
        {type:'set',inputs:compiled.inputNames.map((signal,i)=>({signal,blockId:compiled.inputIds[i],value:result.inputs[signal]}))}];
      result.observations.forEach((actual,i)=>{
        trace.push({type:'tick'});
        const expected=i===result.observations.length-1?result.expected:{COMPLETE:0};
        trace.push({type:'expect',outputs:Object.entries(expected).map(([signal,value])=>({
          signal,blockId:compiled.outputIds[compiled.outputNames.indexOf(signal)],actual:Number(actual[signal]),expected:value,passed:Number(actual[signal])===value
        }))});
      });
      return {...result,status:'fail',sequential:true,states:0,transitions,completed,total:24,trace};
    }
    completed++;results.push({A,B,tick:result.tick});
    yield {phase:'search',states:0,transitions,completed,total:24};
  }
  return {ok:true,status:'pass',sequential:true,states:0,transitions,completed,total:24,results};
}
