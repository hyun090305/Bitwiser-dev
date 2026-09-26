// Independent behavioral machines. A step advances time; observe reads the
// visible state without another transition or a particular circuit encoding.
export const MEMORY20_IDS = Object.freeze({
  'C4-01':25, 'C4-02':31, 'C4-03':28, 'C4-04':35, 'C4-05':30,
  'C4-06':32, 'C4-07':33, 'C4-08':36, 'C4-09':37, 'C4-10':34,
  'C5-01':45, 'C5-02':38, 'C5-03':39, 'C5-04':29, 'C5-05':43,
  'C5-06':44, 'C5-07':41, 'C5-08':42, 'C5-09':40, 'C5-10':46
});
// Keep published reference IDs stable when a slot is replaced.
export const memory20ReferenceId = slot => `memory20:${({
  'C4-06':'up-down-counter-no-reset', 'C4-07':'light-timing',
  'C4-10':'delay-timer', 'C5-04':'response-check'
})[slot] || slot}`;
const b = (n, i) => (n >>> i) & 1;
// Trusted puzzle policy: submitted INPUT modes cannot disable these checks.
const releaseButtons = {
  'up-down-counter-no-reset':['INC','DEC'], 'light-timing':[], 'delay-timer':['START'],
  'C4-01':['LOAD'], 'C4-03':['ACK'], 'response-check':['A','B'],
  'C4-05':['OPEN'], 'C4-06':['INC','DEC','RESET'], 'C4-07':['RESET'],
  'C4-09':['SUBMIT'], 'C4-10':['KICK'], 'C5-01':['ADD','RESET'],
  'C5-02':['WRITE'], 'C5-03':['SAVE','UNDO'], 'C5-05':['RECEIVE'],
  'C5-07':['PUSH','POP'], 'C5-08':['PUSH','POP'], 'C5-09':['SEND','TAKE']
};
// Each definition: inputs, outputs, initial memory, transition, initial output
// mask (zero unless explicitly specified, e.g. EMPTY starts at one).
// The build selects only demo definitions using these per-stage markers.
const specs = {
  // stage:C4-01
  'C4-01': [['DATA','LOAD'],['VALUE'],0,(s,x)=>{const q=x.LOAD?x.DATA:s;return [q,[q]];}],
  // stage:C4-02
  'C4-02': [['SIGNAL'],['RISE'],0,(s,x)=>[x.SIGNAL,[Number(!s&&x.SIGNAL)]]],
  // stage:C4-03
  'C4-03': [['FAULT','ACK'],['ALARM'],0,(s,x)=>{const q=x.FAULT?1:x.ACK?0:s;return [q,[q]];}],
  // stage:C4-04
  'C4-04': [['RAW'],['CLEAN'],[0,0,0],([p,o,c],x)=>{const q=x.RAW===p&&p===o?x.RAW:c;return [[x.RAW,p,q],[q]];}],
  // stage:C4-05
  'C4-05': [['OPEN'],['DOOR'],[0,0,0],([a,c],x)=>{const h=[x.OPEN,a,c];return [h,[Number(h.some(Boolean))]];}],
  // stage:C4-06
  'up-down-counter-no-reset': [['INC','DEC'],['BIT0','BIT1'],0,(s,x)=>{const q=(s+x.INC-x.DEC+4)%4;return [q,[b(q,0),b(q,1)]];}],
  // Archived RESET counter.
  'C4-06': [['INC','DEC','RESET'],['BIT0','BIT1'],0,(s,x)=>{const q=x.RESET?0:(s+x.INC-x.DEC+4)%4;return [q,[b(q,0),b(q,1)]];}],
  // stage:C4-07
  'light-timing': [['LEVEL0','LEVEL1'],['LIGHT'],0,(s,x)=>{const q=(s+1)%4;return [q,[Number(q<x.LEVEL0+2*x.LEVEL1)]];}],
  // Archived RESET brightness control, including its live input observation.
  'C4-07': [['DUTY0','DUTY1','RESET'],['PWM'],0,(s,x)=>{const q=x.RESET?0:(s+1)%4;return [q,[Number(q<x.DUTY0+2*x.DUTY1)]];}],
  // stage:C4-08
  'C4-08': [['REQ_A','REQ_B'],['A_OK','B_OK'],0,(s,x)=>{if(!x.REQ_A&&!x.REQ_B)return [s,[0,0]];const a=x.REQ_A&&x.REQ_B?1-s:x.REQ_A;return [a,[a,1-a]];}],
  // stage:C4-09
  'C4-09': [['SIGNAL','SUBMIT'],['UNLOCKED'],['',0],([h,o],x)=>{const t=x.SUBMIT?h+x.SIGNAL:h;const q=Number(o||t==='1001');return [[t.slice(-3),q],[q]];}],
  // stage:C4-10
  'delay-timer': [['TIME0','TIME1','START'],['DONE'],0,(remaining,x)=>{
    const duration=x.TIME0+2*x.TIME1;
    return x.START ? [duration,[Number(duration===0)]]
      : [Math.max(remaining-1,0),[Number(remaining===1)]];
  }],
  // Archived heartbeat watchdog; never reinterpret saved definitions.
  'C4-10': [['KICK'],['TIMEOUT'],0,(s,x)=>{const q=x.KICK?0:Math.min(s+1,3);return [q,[Number(q===3)]];}],
  // stage:C5-01
  'C5-01': [['D0','D1','ADD','RESET'],['Q0','Q1'],0,(s,x)=>{const q=x.RESET?0:(s+(x.ADD?x.D0+2*x.D1:0))%4;return [q,[b(q,0),b(q,1)]];}],
  // stage:C5-02
  'C5-02': [['D0','D1','ADDR','WRITE'],['Q0','Q1'],[0,0],(s,x)=>{const words=[...s];if(x.WRITE)words[x.ADDR]=x.D0+2*x.D1;const q=words[x.ADDR];return [words,[b(q,0),b(q,1)]];}],
  // stage:C5-03
  'C5-03': [['D0','D1','SAVE','UNDO'],['Q0','Q1','UNDO_AVAILABLE'],[0,0,0],([q,old,yes],x)=>{if(x.SAVE)[q,old,yes]=[x.D0+2*x.D1,q,1];else if(x.UNDO&&yes)[q,yes]=[old,0];return [[q,old,yes],[b(q,0),b(q,1),yes]];}],
  // stage:C5-04
  'response-check': [['A','B'],['GO'],[0,0],([a,b],x)=>{
    const seenA=Number(a||x.A),seenB=Number(b||x.B),go=Number(seenA&&seenB);
    return [go?[0,0]:[seenA,seenB],[go]];
  }],
  // Archived two-bit staging puzzle; old definitions still refer to this ID.
  'C5-04': [['D0','D1','WRITE','COMMIT','RESET'],['Q0','Q1'],[0,0],([s,q],x)=>{if(x.RESET)[s,q]=[0,0];else {if(x.COMMIT)q=s;if(x.WRITE)s=x.D0+2*x.D1;}return [[s,q],[b(q,0),b(q,1)]];}],
  // stage:C5-05
  'C5-05': [['DATA','RECEIVE'],['Q0','Q1','Q2','Q3','DONE'],['',0],([p,q],x)=>{let done=0;if(x.RECEIVE){p+=x.DATA;if(p.length===4){q=parseInt(p,2);p='';done=1;}}return [[p,q],[b(q,0),b(q,1),b(q,2),b(q,3),done]];}],
  // stage:C5-06
  'C5-06': [['D0','D1','D2','D3','START','RESET'],['SERIAL','VALID','BUSY'],['',0],([p,s],x)=>{let valid=0;if(x.RESET){p='';s=0;}else if(p){s=Number(p[0]);p=p.slice(1);valid=1;}else if(x.START){s=x.D3;p=`${x.D2}${x.D1}${x.D0}`;valid=1;}return [[p,s],[s,valid,Number(p.length>0)]];}],
  // stage:C5-07
  'C5-07': [['DATA','PUSH','POP'],['DATA_OUT','VALID','EMPTY','FULL'],[[],0],(s,x)=>bufferStep(s,x,false),4],
  // stage:C5-08
  'C5-08': [['DATA','PUSH','POP'],['DATA_OUT','VALID','EMPTY','FULL'],[[],0],(s,x)=>bufferStep(s,x,true),4],
  // stage:C5-09
  'C5-09': [['DATA','SEND','TAKE'],['FULL','DATA_OUT','VALID','ACCEPTED'],[-1,0],([p,last],x)=>{let valid=0,accepted=0;if(x.TAKE&&p!==-1){last=p;p=-1;valid=1;}if(x.SEND&&p===-1){p=x.DATA;accepted=1;}return [[p,last],[Number(p!==-1),last,valid,accepted]];}],
  // stage:end
};
function bufferStep([entries,last],x,fifo) {
  const q=[...entries];let valid=0;
  if(x.POP&&q.length){last=fifo?q.shift():q.pop();valid=1;}
  if(x.PUSH&&q.length<2)q.push(x.DATA);
  return [[q,last],[last,valid,Number(!q.length),Number(q.length===2)]];
}
const cache = new Map();
export function getMemory20Reference(slot) {
  if(cache.has(slot))return cache.get(slot);
  const spec=specs[slot];if(!spec)return undefined;
  const [inputs,outputs,initial,transition,initialOutputs=0]=spec;
  const visible=slot!=='C5-04'; // Preserve the archived staging reference.
  const lightTiming=slot==='C4-07'||slot==='light-timing';
  const liveInputs=lightTiming||slot==='C5-02';
  // Latched outputs are part of the state: GO=1 and initial GO=0 can share
  // response memory, but must never collapse into the same observation state.
  const states=[{memory:initial,output:initialOutputs}], known=new Map([[JSON.stringify(states[0]),0]]), table=[];
  for(let s=0;s<states.length;s++) {
    table[s]=[];
    for(let mask=0;mask<2**inputs.length;mask++) {
      const x=Object.fromEntries(inputs.map((name,i)=>[name,b(mask,i)]));
      const [memory,values]=transition(states[s].memory,x), output=values.reduce((n,v,i)=>n|(v<<i),0);
      const next={memory,output:visible&&!liveInputs?output:0}, key=JSON.stringify(next);
      if(!known.has(key)){known.set(key,states.length);states.push(next);}
      table[s][mask]={nextState:known.get(key),outputs:output};
    }
  }
  const ref=Object.freeze({inputs:Object.freeze(inputs),outputs:Object.freeze(outputs),initialState:0,stateCount:states.length,
    observeAt:'after_tick',evaluate:(state,input)=>table[state][input],
    ...(visible ? {observationMode:'visible',releaseButtons:Object.freeze(releaseButtons[slot]||[]),
      step:(state,input)=>table[state][input].nextState,
      observe:(state,input)=>lightTiming ? Number(states[state].memory < (input&3))
        : slot==='C5-02' ? states[state].memory[b(input,inputs.indexOf('ADDR'))]
        : states[state].output} : {})});
  cache.set(slot,ref);return ref;
}
