// Convert a certified planar netlist to editor geometry. Nets may share only
// their OWN branching tree; every branch becomes an explicit editor junction.
// The certificate guides routing; success is independently spatially checked.
export function routeHandoff(net, certificate, {seed=1, tries=160}={}) {
  const negotiated=negotiate(net,certificate,seed);
  if(negotiated)return negotiated;
  let randomState=seed;
  const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/2**32);
  const nodes=net.nodes, index=new Map(nodes.map((n,i)=>[n.id,i]));
  const edges=nodes.flatMap((n,to)=>n.inputs.map((id,pin)=>({from:index.get(id),to,pin})));
  let best=Infinity;
  for(const scale of [2,3,4,6,8,12,18]) {
    const margin=4*scale, coords=nodes.map(n=>certificate.positions[n.id]);
    const cols=Math.max(...coords.map(p=>p[0]))*scale+2*margin+1;
    const rows=Math.max(...coords.map(p=>p[1]))*scale+2*margin+1,size=rows*cols;
    const positions=coords.map(([x,y])=>(y*scale+margin)*cols+x*scale+margin);
    const blocks=new Int32Array(size).fill(-1);positions.forEach((p,i)=>blocks[p]=i);
    const r=p=>Math.floor(p/cols), c=p=>p%cols;
    const distance=(p,q)=>Math.abs(r(p)-r(q))+Math.abs(c(p)-c(q));
    for(let attempt=0;attempt<tries;attempt++) {
      const order=edges.map((_,i)=>i);
      for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      // Short edges first helps preserve the narrow faces of the embedding.
      if(attempt%3!==2)order.sort((a,b)=>distance(positions[edges[a].from],positions[edges[a].to])-distance(positions[edges[b].from],positions[edges[b].to]));
      const owner=new Int32Array(size).fill(-1), paths=[], trees=nodes.map((_,i)=>new Set([positions[i]]));
      let missing=0;
      for(const e of order) {
        const {from,to}=edges[e],start=positions[from],end=positions[to];
        const dr=r(end)-r(start),dc=c(end)-c(start),len=Math.hypot(dr,dc);
        const radius=scale*(attempt%3===0?0.8:attempt%3===1?1.8:3);
        const prev=new Int32Array(size).fill(-1),queue=[end];prev[end]=end;
        let found=-1;
        for(let head=0;head<queue.length&&found<0;head++) {
          const p=queue[head];
          const options=[p-cols,p+1,p+cols,p-1].filter(q=>q>=0&&q<size&&distance(p,q)===1);
          options.sort((a,b)=>distance(a,start)-distance(b,start));
          for(const q of options) {
            if(prev[q]!==-1)continue;
            if(trees[from].has(q)){prev[q]=p;found=q;break;}
            if(blocks[q]>=0||owner[q]>=0)continue;
            // Confine each route to its certified edge's corridor. This also
            // stops an early long wire enclosing an unrelated circuit vertex.
            if(Math.abs((r(q)-r(start))*dc-(c(q)-c(start))*dr)/len>radius)continue;
            if(r(q)<Math.min(r(start),r(end))-radius||r(q)>Math.max(r(start),r(end))+radius||c(q)<Math.min(c(start),c(end))-radius||c(q)>Math.max(c(start),c(end))+radius)continue;
            prev[q]=p;queue.push(q);
          }
        }
        if(found<0){missing++;break;}
        const path=[found];while(path.at(-1)!==end)path.push(prev[path.at(-1)]);
        path.slice(0,-1).forEach(p=>{if(p!==start)owner[p]=from;trees[from].add(p);});
        paths[e]=path;
      }
      best=Math.min(best,missing?edges.length-paths.filter(Boolean).length:0);
      if(!missing)return materialize(nodes,edges,paths,positions,cols);
    }
  }
  throw new Error(`${net.id}: no editor route; best ${best} remaining edges`);
}

// Negotiated congestion: routes may overlap during search, then repeatedly
// pay for contested cells until every independent signal owns its own cells.
function negotiate(net,certificate,seed) {
  const nodes=net.nodes,index=new Map(nodes.map((n,i)=>[n.id,i]));
  const edges=nodes.flatMap((n,to)=>n.inputs.map((id,pin)=>({from:index.get(id),to,pin})));
  let randomState=seed;
  const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/2**32);
  for(const scale of [1,2,3,4]) {
    const coords=nodes.map(n=>certificate.positions[n.id]),margin=6;
    const cols=Math.max(...coords.map(p=>p[0]))*scale+2*margin+1,rows=Math.max(...coords.map(p=>p[1]))*scale+2*margin+1,size=rows*cols;
    const positions=coords.map(([x,y])=>(y*scale+margin)*cols+x*scale+margin);
    if(new Set(positions).size!==positions.length)continue;
    const blocks=new Int32Array(size).fill(-1);positions.forEach((p,i)=>blocks[p]=i);
    const groups=nodes.map((_,i)=>edges.flatMap((e,k)=>e.from===i?[k]:[]));
    const occupancy=new Int16Array(size),history=new Float32Array(size),owned=nodes.map(()=>new Set());
    const r=p=>Math.floor(p/cols),c=p=>p%cols;
    const adjacent=p=>[p-cols,...(c(p)<cols-1?[p+1]:[]),p+cols,...(c(p)>0?[p-1]:[])].filter(q=>q>=0&&q<size);
    const dist=(a,b)=>Math.abs(r(a)-r(b))+Math.abs(c(a)-c(b));
    let best=Infinity;
    for(let iteration=0;iteration<240;iteration++) {
      const order=nodes.map((_,i)=>i),paths=[];
      for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      let missing=false;
      for(const from of order) {
        for(const p of owned[from])occupancy[p]--;
        owned[from].clear();
        const tree=new Set([positions[from]]);
        const group=[...groups[from]].sort((a,b)=>dist(positions[from],positions[edges[a].to])-dist(positions[from],positions[edges[b].to]));
        for(const e of group) {
          const start=positions[from],end=positions[edges[e].to];
          const costs=new Float64Array(size).fill(Infinity),prev=new Int32Array(size).fill(-1),heap=[];
          function push(p,cost) {let i=heap.length;heap.push([p,cost]);while(i){const parent=(i-1)>>1;if(heap[parent][1]<=cost)break;heap[i]=heap[parent];i=parent;}heap[i]=[p,cost];}
          function pop() {const result=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let child=2*i+1;if(child+1<heap.length&&heap[child+1][1]<heap[child][1])child++;if(heap[child][1]>=last[1])break;heap[i]=heap[child];i=child;}heap[i]=last;}return result;}
          costs[end]=0;push(end,0);let found=-1;
          const dr=r(end)-r(start),dc=c(end)-c(start),len=Math.hypot(dr,dc);
          while(heap.length&&found<0) {
            const [p,cost]=pop();if(cost>costs[p])continue;
            for(const q of adjacent(p)) {
              if(tree.has(q)){prev[q]=p;found=q;break;}
              if(blocks[q]>=0)continue;
              const off=Math.abs((r(q)-r(start))*dc-(c(q)-c(start))*dr)/len;
              const next=cost+1+occupancy[q]*(6+iteration*0.65)+history[q]*3+off*0.04;
              if(next<costs[q]){costs[q]=next;prev[q]=p;push(q,next);}
            }
          }
          if(found<0){missing=true;break;}
          const path=[found];while(path.at(-1)!==end)path.push(prev[path.at(-1)]);
          for(const p of path.slice(0,-1))if(p!==start){tree.add(p);owned[from].add(p);}
          paths[e]=path;
        }
        for(const p of owned[from])occupancy[p]++;
      }
      let conflicts=0;
      for(let p=0;p<size;p++)if(occupancy[p]>1){conflicts++;history[p]+=occupancy[p]-1;}
      if(!missing&&!conflicts)return materialize(nodes,edges,paths,positions,cols);
      if(conflicts<best){best=conflicts;if(iteration%20===0)console.log(`${net.id} routing scale ${scale}: ${conflicts} contested cells`);}
    }
  }
  return null;
}

function materialize(nodes,edges,paths,positions,cols) {
  const blocks={},wires={},pos=p=>({r:Math.floor(p/cols)*2,c:(p%cols)*2});
  nodes.forEach((n,i)=>{blocks[n.id]={id:n.id,type:n.type==='DE'?'D':n.type,name:n.name||n.id,pos:pos(positions[i]),value:false,
    fixed:false,...(n.type==='INPUT'?{inputMode:n.mode||'switch'}:{})};});
  const wire=(source,target,points,role)=>{
    const id=`w${Object.keys(wires).length}`,path=[pos(points[0])];
    for(const p of points.slice(1)){const a=path.at(-1),b=pos(p);path.push({r:(a.r+b.r)/2,c:(a.c+b.c)/2},b);}
    wires[id]={id,startBlockId:source,endBlockId:target,path,...(role?{inputRole:role}:{})};
  };
  nodes.forEach((node,source)=>{
    const outgoing=new Map(),incoming=new Map(),terminals=new Map();
    edges.forEach((edge,i)=>{
      if(edge.from!==source)return;
      const path=paths[i];
      for(let j=0;j<path.length-1;j++){
        if(!outgoing.has(path[j]))outgoing.set(path[j],new Set());
        outgoing.get(path[j]).add(path[j+1]);incoming.set(path[j+1],path[j]);
      }
      const target=nodes[edge.to];terminals.set(path.at(-1),{id:target.id,role:['D','DE'].includes(target.type)?edge.pin===1?'EN':'D':null});
    });
    const junctions=new Map();
    for(const [p,next] of outgoing)if(next.size>1&&p!==positions[source]){
      const id=`branch_${source}_${junctions.size}`;junctions.set(p,id);blocks[id]={id,type:'JUNCTION',pos:pos(p),value:false,fixed:false};
    }
    for(const [start,id] of [[positions[source],node.id],...junctions]) {
      for(const next of outgoing.get(start)||[]) {
        const path=[start,next];let current=next;
        while(!junctions.has(current)&&!terminals.has(current)){
          const nexts=[...(outgoing.get(current)||[])];
          if(nexts.length!==1)throw new Error('Invalid routing tree');
          current=nexts[0];path.push(current);
        }
        const target=terminals.get(current);
        wire(id,target?.id||junctions.get(current),path,target?.role);
      }
    }
  });
  return compactHandoff({blocks,wires});
}

export function compactHandoff({blocks,wires}) {
  // Compact unused straight rows/columns while keeping every occupied line
  // and one empty cell between endpoints; unit-step geometry is rebuilt.
  function compact(axis) {
    const other=axis==='r'?'c':'r',important=new Set();
    Object.values(blocks).forEach(b=>important.add(b.pos[axis]));
    Object.values(wires).forEach(w=>w.path.forEach((p,i,a)=>{
      if(i&&i<a.length-1&&(a[i-1][other]!==a[i+1][other]))important.add(p[axis]);
    }));
    const sorted=[...important].sort((a,b)=>a-b),mapping=new Map();
    for(const [i,v] of sorted.entries()) {
      let next=i?mapping.get(sorted[i-1])+1:2;
      for(const w of Object.values(wires)) {
        const a=w.path[0],b=w.path.at(-1);
        if(a[other]===b[other]&&Math.max(a[axis],b[axis])===v)next=Math.max(next,(mapping.get(Math.min(a[axis],b[axis]))??0)+2);
      }
      mapping.set(v,next);
    }
    const map=v=>{if(mapping.has(v))return mapping.get(v);let i=0;while(sorted[i+1]<v)i++;return mapping.get(sorted[i])+1;};
    Object.values(blocks).forEach(b=>{b.pos[axis]=map(b.pos[axis]);});
    Object.values(wires).forEach(w=>{
      const points=w.path.map(p=>({...p,[axis]:map(p[axis])})),path=[points[0]];
      for(const p of points.slice(1)){
        const a=path.at(-1);let r=a.r,c=a.c;
        while(r!==p.r||c!==p.c){r+=Math.sign(p.r-r);c+=Math.sign(p.c-c);path.push({r,c});}
      }
      w.path=path;
    });
  }
  compact('r');compact('c');
  return {rows:Math.max(...Object.values(blocks).map(b=>b.pos.r),...Object.values(wires).flatMap(w=>w.path.map(p=>p.r)))+3,
    cols:Math.max(...Object.values(blocks).map(b=>b.pos.c),...Object.values(wires).flatMap(w=>w.path.map(p=>p.c)))+3,blocks,wires};
}
