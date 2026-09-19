import { STAGES, canPlayStage, MEMORY_GATE } from '../modules/stageCatalog.js';
const stages = STAGES.filter(s => s.status === 'playable' && ['chapter_1','chapter_2'].includes(s.chapterId));
export const DEMO_IDS = Object.freeze(stages.map(s => s.id));
export const DEMO_NODES = Object.freeze(stages.map(s => s.nodeId));
export const DEMO_NODE_LEVELS = Object.freeze(Object.fromEntries(stages.map(s => [s.nodeId,s.id])));
export const DEMO_END_STAGE = MEMORY_GATE;
export function isDemoStage(id) { return Number.isInteger(id) && DEMO_IDS.includes(id); }
export function isUnlocked(id, cleared, access = {}) { return isDemoStage(id) && canPlayStage(id, cleared, access); }
export function demoMap(spec) {
  const nodes = spec.nodes.filter(n => n.nodeType !== 'stage' || DEMO_NODES.includes(n.id)).map(node => {
    const shell = {id:node.id,nodeType:node.nodeType,chapterId:node.chapterId,position:node.position,size:node.size,label:node.label,gridPosition:node.gridPosition,layoutKey:node.layoutKey};
    if (DEMO_NODES.includes(node.id)) return {...shell, optional:node.optional};
    if (node.id === 'lab') return {...shell,previewFeature:'sandbox'};
    if (node.id === 'user_created_stages') return {...shell,previewFeature:'problems'};
    return {...shell,...(!['chapter_1','chapter_2'].includes(node.chapterId)?{previewFeature:'stages'}:{})};
  });
  const included = new Set(nodes.map(n => n.id));
  return {grid:spec.grid,nodeTypes:spec.nodeTypes,chapters:spec.chapters,globals:{nodes:[]},nodes,
    edges:spec.edges.filter(e => included.has(e.from) && included.has(e.to)).map(e => ({from:e.from,to:e.to,style:e.style,edgeType:e.edgeType,waypoints:e.waypoints}))};
}
