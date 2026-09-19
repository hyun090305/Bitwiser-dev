import { isValidWirePath } from '../../src/canvas/circuitData.js';

const key = p => `${p.r},${p.c}`;
const distance = (a,b) => Math.abs(a.r-b.r)+Math.abs(a.c-b.c);

export function checkGeometry(c) {
  const positions=new Map(),occupied=new Set();
  for(const b of Object.values(c.blocks)) {
    if(positions.has(key(b.pos)))throw new Error('Overlapping blocks');
    positions.set(key(b.pos),b);
  }
  for(const w of Object.values(c.wires)) {
    if(!isValidWirePath(w.path,{
      withinBounds:(r,col)=>r>=0&&col>=0&&r<c.rows&&col<c.cols,
      blockAt:p=>positions.get(key(p)),cellHasWire:p=>occupied.has(key(p))
    }))throw new Error(`Invalid compacted wire ${w.id}`);
    if(key(w.path[0])!==key(c.blocks[w.startBlockId].pos)||key(w.path.at(-1))!==key(c.blocks[w.endBlockId].pos))throw new Error('Detached endpoint');
    w.path.slice(1,-1).forEach(p=>occupied.add(key(p)));
  }
}

function skeleton(c) {
  const points=[],byPosition=new Map();
  const add=p=>{
    if(!byPosition.has(key(p))){byPosition.set(key(p),points.length);points.push({...p});}
    return byPosition.get(key(p));
  };
  const blocks=Object.fromEntries(Object.values(c.blocks).map(b=>[b.id,add(b.pos)]));
  const wires=Object.values(c.wires).map(w=>({id:w.id,vertices:w.path.filter((p,i,a)=>!i||i===a.length-1||a[i-1].r!==a[i+1].r&&a[i-1].c!==a[i+1].c).map(add)}));
  return {points,blocks,wires};
}

// Orthogonal compaction: each perpendicular segment may slide independently.
// Difference constraints preserve the left/right order of every overlapping
// shape, so no crossing or shared wire cell can be introduced by compression.
function compactAxis(c,axis) {
  const other=axis==='r'?'c':'r',{points,blocks,wires}=skeleton(c);
  const parent=points.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const join=(a,b)=>{parent[find(b)]=find(a);};
  for(const w of wires)for(let i=1;i<w.vertices.length;i++) {
    const a=w.vertices[i-1],b=w.vertices[i];
    if(points[a][axis]===points[b][axis])join(a,b);
  }
  const groups=new Map();
  points.forEach((p,i)=>{
    const root=find(i),v=groups.get(root)||{id:root,x:p[axis],lo:p[other],hi:p[other],next:new Map()};
    v.lo=Math.min(v.lo,p[other]);v.hi=Math.max(v.hi,p[other]);groups.set(root,v);
  });
  const constraints=(a,b,gap)=>{
    if(a===b)return;
    const v=groups.get(a);v.next.set(b,Math.max(v.next.get(b)||0,gap));
  };
  const horizontal=[];
  for(const w of wires)for(let i=1;i<w.vertices.length;i++) {
    let a=find(w.vertices[i-1]),b=find(w.vertices[i]);if(a===b)continue;
    if(groups.get(a).x>groups.get(b).x)[a,b]=[b,a];
    constraints(a,b,w.vertices.length===2?2:1);
    horizontal.push({a,b,y:points[w.vertices[i]][other],lo:groups.get(a).x,hi:groups.get(b).x});
  }
  const max=Math.max(...points.map(p=>p[other]));
  for(let y=0;y<=max;y++) {
    const shapes=[...groups.values()].filter(v=>v.lo<=y&&v.hi>=y).map(v=>({a:v.id,b:v.id,lo:v.x,hi:v.x}));
    shapes.push(...horizontal.filter(s=>s.y===y));
    shapes.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
    for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++) {
      const a=shapes[i],b=shapes[j];
      if(a.hi<b.lo)constraints(a.b,b.a,1);
    }
  }
  const values=new Map([...groups.keys()].map(id=>[id,0]));
  for(const v of [...groups.values()].sort((a,b)=>a.x-b.x))for(const [id,gap] of v.next)values.set(id,Math.max(values.get(id),values.get(v.id)+gap));
  points.forEach((p,i)=>p[axis]=values.get(find(i)));
  for(const [id,index] of Object.entries(blocks))c.blocks[id].pos={...points[index]};
  for(const w of wires) {
    const path=[{...points[w.vertices[0]]}];
    for(const index of w.vertices.slice(1)) {
      const target=points[index];let p=path.at(-1);
      while(distance(p,target)){p={r:p.r+Math.sign(target.r-p.r),c:p.c+Math.sign(target.c-p.c)};path.push(p);}
    }
    c.wires[w.id].path=path;
  }
  fitGrid(c,0);checkGeometry(c);
}

export function fitGrid(c,padding=2) {
  const points=[...Object.values(c.blocks).map(b=>b.pos),...Object.values(c.wires).flatMap(w=>w.path)];
  const minR=Math.min(...points.map(p=>p.r)),minC=Math.min(...points.map(p=>p.c));
  for(const p of points){p.r+=padding-minR;p.c+=padding-minC;}
  c.rows=Math.max(6,Math.max(...points.map(p=>p.r))+padding+1);
  c.cols=Math.max(6,Math.max(...points.map(p=>p.c))+padding+1);
  return c;
}

export function compactCircuit(source) {
  let best=structuredClone(source);
  for(const first of ['r','c']) {
    const c=structuredClone(source);
    for(let i=0;i<12;i++) {
      const before=JSON.stringify(c);
      compactAxis(c,first);compactAxis(c,first==='r'?'c':'r');
      if(JSON.stringify(c)===before)break;
    }
    const logicalBlocks=Object.values(c.blocks).filter(b=>b.type!=='JUNCTION').length;
    fitGrid(c,logicalBlocks<=11?1:2);
    if(c.rows*c.cols<best.rows*best.cols)best=c;
  }
  Object.values(best.blocks).forEach(b=>b.fixed=false);
  checkGeometry(best);
  return best;
}

const wireLength=c=>Object.values(c.wires).reduce((sum,w)=>sum+w.path.length-1,0);
const score=c=>c.rows*c.cols*2+wireLength(c);

// Local placement and rip-up/reroute improve the embedding itself before
// another orthogonal compaction pass. Only complete legal routes survive.
export function packCircuit(source,{seed=1,rounds=20}={}) {
  let randomState=seed>>>0;
  const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/2**32);
  const shuffle=a=>{for(let i=a.length-1;i;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const simplified=structuredClone(source);
  for(const b of Object.values(simplified.blocks))if(b.type==='JUNCTION') {
    const incoming=Object.values(simplified.wires).filter(w=>w.endBlockId===b.id);
    const outgoing=Object.values(simplified.wires).filter(w=>w.startBlockId===b.id);
    if(incoming.length===1&&outgoing.length===1&&incoming[0].startBlockId!==outgoing[0].endBlockId) {
      const a=incoming[0],z=outgoing[0];
      simplified.wires[z.id]={...z,startBlockId:a.startBlockId,path:[...a.path,...z.path.slice(1)]};
      delete simplified.wires[a.id];delete simplified.blocks[b.id];
    }
  }
  let c=compactCircuit(simplified),best=structuredClone(c);
  const reroute=(ids,moved,target)=>{
    const old=ids.map(id=>c.wires[id].path),block=moved&&c.blocks[moved],oldPos=block?.pos;
    if(block)block.pos=target;
    const blocked=new Uint8Array(c.rows*c.cols),cell=p=>p.r*c.cols+p.c;
    for(const b of Object.values(c.blocks))blocked[cell(b.pos)]=1;
    const selected=new Set(ids);
    for(const w of Object.values(c.wires))if(!selected.has(w.id))for(const p of w.path.slice(1,-1))blocked[cell(p)]=1;
    let ok=true;
    for(const id of shuffle([...ids])) {
      const w=c.wires[id],start=cell(c.blocks[w.startBlockId].pos),end=cell(c.blocks[w.endBlockId].pos);
      const prev=new Int32Array(blocked.length).fill(-1),queue=[start];prev[start]=start;
      const dirs=shuffle([-c.cols,1,c.cols,-1]);
      for(let i=0;i<queue.length&&prev[end]<0;i++) {
        const p=queue[i];
        for(const d of dirs) {
          const q=p+d;
          if(q<0||q>=blocked.length||Math.abs(Math.floor(p/c.cols)-Math.floor(q/c.cols))+Math.abs(p%c.cols-q%c.cols)!==1||prev[q]>=0||(blocked[q]&&q!==end)||(p===start&&q===end))continue;
          prev[q]=p;queue.push(q);
        }
      }
      if(prev[end]<0){ok=false;break;}
      const path=[end];while(path.at(-1)!==start)path.push(prev[path.at(-1)]);path.reverse();
      w.path=path.map(p=>({r:Math.floor(p/c.cols),c:p%c.cols}));
      path.slice(1,-1).forEach(p=>blocked[p]=1);
    }
    const costBefore=old.reduce((n,p)=>n+p.length,0),costAfter=ids.reduce((n,id)=>n+c.wires[id].path.length,0);
    // Occasional equal-cost moves allow a block to slide along a corridor.
    if(!ok||costAfter>costBefore) {
      ids.forEach((id,i)=>c.wires[id].path=old[i]);if(block)block.pos=oldPos;return false;
    }
    return true;
  };
  for(let round=0;round<rounds;round++) {
    for(const w of shuffle(Object.values(c.wires)))reroute([w.id]);
    const blockIds=Object.keys(c.blocks);
    for(let trial=0;trial<blockIds.length*12;trial++) {
      const id=blockIds[Math.floor(random()*blockIds.length)],block=c.blocks[id];
      const incident=Object.values(c.wires).filter(w=>w.startBlockId===id||w.endBlockId===id);
      if(!incident.length)continue;
      const destinations=incident.map(w=>c.blocks[w.startBlockId===id?w.endBlockId:w.startBlockId].pos);
      const near=destinations[Math.floor(random()*destinations.length)];
      const targets=[{r:block.pos.r+1,c:block.pos.c},{r:block.pos.r-1,c:block.pos.c},{r:block.pos.r,c:block.pos.c+1},{r:block.pos.r,c:block.pos.c-1},
        {r:Math.round((block.pos.r+near.r)/2),c:Math.round((block.pos.c+near.c)/2)}];
      const target=targets[Math.floor(random()*targets.length)];
      if(target.r<0||target.c<0||target.r>=c.rows||target.c>=c.cols)continue;
      if(Object.values(c.blocks).some(b=>key(b.pos)===key(target)))continue;
      const incidentIds=incident.map(w=>w.id),set=new Set(incidentIds);
      if(Object.values(c.wires).some(w=>!set.has(w.id)&&w.path.slice(1,-1).some(p=>key(p)===key(target))))continue;
      reroute(incidentIds,id,target);
    }
    c=compactCircuit(c);
    if(score(c)<score(best))best=structuredClone(c);
  }
  if(best.rows>best.cols) {
    const points=[...Object.values(best.blocks).map(b=>b.pos),...Object.values(best.wires).flatMap(w=>w.path)];
    for(const p of points)[p.r,p.c]=[p.c,p.r];
    [best.rows,best.cols]=[best.cols,best.rows];
  }
  checkGeometry(best);return best;
}
