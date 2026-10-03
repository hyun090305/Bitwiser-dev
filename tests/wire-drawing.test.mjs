import test from 'node:test';
import assert from 'node:assert/strict';
import { wireSegmentCells } from '../src/canvas/wireDrawing.js';

const cells=(from,to)=>[...wireSegmentCells(from,to)].map(({r,c})=>[r,c]);
test('sparse strokes visit every cell horizontally and vertically in both directions',()=>{
  assert.deepEqual(cells({x:2.5,y:4.5},{x:6.5,y:4.5}),[[4,3],[4,4],[4,5],[4,6]]);
  assert.deepEqual(cells({x:6.5,y:4.5},{x:2.5,y:4.5}),[[4,5],[4,4],[4,3],[4,2]]);
  assert.deepEqual(cells({x:4.5,y:2.5},{x:4.5,y:6.5}),[[3,4],[4,4],[5,4],[6,4]]);
  assert.deepEqual(cells({x:4.5,y:6.5},{x:4.5,y:2.5}),[[5,4],[4,4],[3,4],[2,4]]);
  assert.deepEqual(cells({x:2.1,y:4.2},{x:2.9,y:4.8}),[]);
});
test('diagonal strokes follow actual boundary crossings with an orthogonal corner tie',()=>{
  assert.deepEqual(cells({x:0.5,y:0.5},{x:2.5,y:2.5}),[[0,1],[1,1],[1,2],[2,2]]);
  assert.deepEqual(cells({x:0.1,y:0.9},{x:1.1,y:1.9}),[[1,0],[1,1]]);
  assert.deepEqual(cells({x:0.9,y:0.1},{x:1.9,y:1.1}),[[0,1],[1,1]]);
  assert.deepEqual(cells({x:0,y:0},{x:-1.2,y:-1.2}),[[0,-1],[-1,-1],[-1,-2],[-2,-2]]);
});
test('event sampling density does not drop cells, cross diagonally or repeat a cell',()=>{
  const from={x:4.123,y:4.321};
  for(const to of [{x:9.7,y:8.4},{x:-1.7,y:8.4},{x:9.7,y:-1.4},{x:-1.7,y:-1.4}]) {
    const sparse=cells(from,to),dense=[];let last=from;
    for(let i=1;i<=97;i++) {
      const next={x:from.x+(to.x-from.x)*i/97,y:from.y+(to.y-from.y)*i/97};
      dense.push(...cells(last,next));last=next;
    }
    assert.deepEqual(dense,sparse);
    assert.deepEqual(sparse.at(-1),[Math.floor(to.y),Math.floor(to.x)]);
    const all=[[Math.floor(from.y),Math.floor(from.x)],...sparse];
    assert.equal(new Set(all.map(p=>p.join(','))).size,all.length);
    for(let i=1;i<all.length;i++)assert.equal(Math.abs(all[i][0]-all[i-1][0])+Math.abs(all[i][1]-all[i-1][1]),1);
  }
});
