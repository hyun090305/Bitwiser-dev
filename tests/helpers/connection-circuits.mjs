import { makeCircuit, newBlock, newWire } from '../../src/canvas/model.js';

export const points = route => route.map(([r, c]) => ({ r, c }));
export function selfFeedbackCircuit(role = 'D') {
  const c = makeCircuit(12, 18);
  for (const [id, type, r, col] of [['x', 'INPUT', 2, 0], ['d', 'D', 2, 4], ['o', 'OUTPUT', 0, 4]]) {
    c.blocks[id] = newBlock({ id, type, name: id, pos: { r, c: col }, inputMode: id === 'x' ? 'button' : undefined });
  }
  c.wires.loop = newWire({ id:'loop', startBlockId:'d', endBlockId:'d', inputRole:role,
    path:points([[2,4],[2,5],[2,6],[3,6],[4,6],[4,5],[4,4],[3,4],[2,4]]) });
  c.wires.output = newWire({ id:'output', startBlockId:'d', endBlockId:'o', path:points([[2,4],[1,4],[0,4]]) });
  if (role === 'EN') c.wires.data = newWire({ id:'data', startBlockId:'x', endBlockId:'d', inputRole:'D', path:points([[2,0],[2,1],[2,2],[2,3],[2,4]]) });
  return c;
}

export function feedbackLevels() {
  return { levelGridSizes:{25:[12,18]}, levelBlockSets:{25:[{type:'INPUT',name:'x',inputMode:'button'}, {type:'D'}, {type:'OUTPUT',name:'o'}]},
    levelAnswers:{25:{mode:'sequential',reference:{inputs:['x'],outputs:['o'],stateCount:1,initialState:0,evaluate:()=>({outputs:0,nextState:0})}}} };
}
