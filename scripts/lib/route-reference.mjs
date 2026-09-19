// Deterministic placement/routing search. Success means actual nonintersecting,
// unit-step orthogonal paths, not an abstract planarity claim.
export function routeReference(graph, {seed=1, attempts=40000, fixedIO=false}={}) {
  let randomState=seed>>>0;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const [rows,cols]=graph.size, size=rows*cols;
  const nodes=graph.nodes, ids=new Map(nodes.map((n,i)=>[n[0],i]));
  const edges=graph.edges.map(([a,b,role])=>[ids.get(a),ids.get(b),role]);
  const fixed=new Set(fixedIO?nodes.flatMap((n,i)=>['INPUT','OUTPUT'].includes(n[1])?[i]:[]):[]);
  const movable=nodes.map((_,i)=>i).filter(i=>!fixed.has(i));
  const initial=nodes.map(n=>n[2]*cols+n[3]);
  const distance=(a,b)=>Math.abs(Math.floor(a/cols)-Math.floor(b/cols))+Math.abs(a%cols-b%cols);
  const neighbors=Array.from({length:size},(_,p)=>[p-cols,p+1,p+cols,p-1].filter(q=>q>=0&&q<size&&distance(p,q)===1));
  function route(positions,order) {
    const occupied=new Uint8Array(size);positions.forEach(p=>occupied[p]=1);
    const paths=Array(edges.length);let cost=0,missing=0;
    for(const e of order) {
      const [a,b]=edges[e],start=positions[a],end=positions[b];
      const previous=new Int16Array(size).fill(-1),queue=[start];previous[start]=start;
      let nearest=distance(start,end);
      for(let i=0;i<queue.length&&previous[end]===-1;i++) {
        const p=queue[i];
        for(const q of neighbors[p]) {
          if(previous[q]!==-1 || (occupied[q]&&q!==end) || (p===start&&q===end))continue;
          previous[q]=p;queue.push(q);nearest=Math.min(nearest,distance(q,end));
        }
      }
      if(previous[end]===-1){missing++;cost+=1000+nearest*12;continue;}
      const path=[end];while(path.at(-1)!==start)path.push(previous[path.at(-1)]);path.reverse();
      path.slice(1,-1).forEach(p=>occupied[p]=1);paths[e]=path;cost+=path.length;
    }
    return {cost,missing,paths};
  }
  let positions=[...initial],order=edges.map((_,i)=>i),current=route(positions,order),best=current;
  for(let iteration=0;current.missing&&iteration<attempts;iteration++) {
    let nextPositions=[...positions],nextOrder=[...order];
    if(random()<0.45) {
      const a=Math.floor(random()*order.length),b=Math.floor(random()*order.length);
      [nextOrder[a],nextOrder[b]]=[nextOrder[b],nextOrder[a]];
    } else {
      const index=movable[Math.floor(random()*movable.length)],old=positions[index];
      let target=random()<0.7?neighbors[old][Math.floor(random()*neighbors[old].length)]:Math.floor(random()*size);
      const other=positions.indexOf(target);
      if(other>=0&&fixed.has(other))continue;
      nextPositions[index]=target;if(other>=0)nextPositions[other]=old;
    }
    const next=route(nextPositions,nextOrder), temperature=10+160*(1-(iteration%4000)/4000);
    if(next.cost<current.cost||random()<Math.exp((current.cost-next.cost)/temperature)) {
      positions=nextPositions;order=nextOrder;current=next;
    }
    if(current.cost<best.cost)best=current;
    if(iteration&&iteration%8000===0&&current.missing) {positions=[...initial];current=route(positions,order);}
  }
  if(current.missing)throw new Error(`No physical layout found (best ${best.missing} unrouted wires; ${attempts} attempts)`);
  const blocks=Object.fromEntries(nodes.map(([id,type],i)=>[id,{id,type,name:id,pos:{r:Math.floor(positions[i]/cols),c:positions[i]%cols},value:false,...(fixed.has(i)?{fixed:true}:{})}]));
  const wires=Object.fromEntries(edges.map(([a,b,role],i)=>[`w${i}`,{id:`w${i}`,startBlockId:nodes[a][0],endBlockId:nodes[b][0],path:current.paths[i].map(p=>({r:Math.floor(p/cols),c:p%cols})),...(nodes[b][1]==='D'?{inputRole:role||'D'}:{})}]));
  return {rows,cols,blocks,wires};
}

export function detourReference(circuit) {
  const copy=structuredClone(circuit),occupied=new Set(Object.values(copy.blocks).map(b=>`${b.pos.r},${b.pos.c}`));
  Object.values(copy.wires).forEach(w=>w.path.forEach(p=>occupied.add(`${p.r},${p.c}`)));
  for(const wire of Object.values(copy.wires))for(let i=0;i<wire.path.length-1;i++) {
    const a=wire.path[i],b=wire.path[i+1];
    for(const sign of [-1,1]) {
      const dr=a.r===b.r?sign:0,dc=a.c===b.c?sign:0;
      const points=[{r:a.r+dr,c:a.c+dc},{r:b.r+dr,c:b.c+dc}];
      if(points.every(p=>p.r>=0&&p.r<copy.rows&&p.c>=0&&p.c<copy.cols&&!occupied.has(`${p.r},${p.c}`))) {
        wire.path.splice(i+1,0,...points);return copy;
      }
    }
  }
  throw new Error('No legal two-cell detour for the second reference');
}
