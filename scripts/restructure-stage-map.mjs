import fs from 'node:fs/promises';
import { CHAPTERS, STAGES } from '../src/modules/stageCatalog.js';
import { STAGE_MAP_EDGES } from '../src/modules/stageMapTopology.js';
import { stageSlotPosition, STAGE_PANEL, STAGE_CARD, EXTRAS_CARD, EXTRAS_CARD_GAP } from '../src/modules/stageMapLayout.js';
const spec = JSON.parse(await fs.readFile('stage_map.json', 'utf8'));
const levels = JSON.parse(await fs.readFile('levels_en.json', 'utf8'));
const old = new Map(spec.nodes.map(node => [node.id, node]));
const chapters = CHAPTERS.map((chapter, i) => {
  const anchor = { x: i * 30 + 2, y: 4 };
  return { id: chapter.id, label: chapter.title, subtitle: chapter.subtitle, order: chapter.order,
    prerequisites: chapter.prerequisites, anchor, panel: { position: anchor, size: STAGE_PANEL },
    title: { position: { x: anchor.x, y: 1 }, size: { w: STAGE_PANEL.w, h: 2.75 }, styleId: chapter.titleStyleId } };
});
const nodes = STAGES.map(stage => ({
  ...old.get(stage.nodeId), id: stage.nodeId, label: levels.levelTitles[stage.id] || stage.title,
  nodeType: 'stage', chapterId: stage.chapterId, optional: stage.optional, status: stage.status,
  layoutKey: stage.layoutKey, gridPosition: stage.gridPosition,
  position: stageSlotPosition(stage.gridPosition, chapters.find(ch => ch.id === stage.chapterId).anchor), size: { ...STAGE_CARD }
}));
const extrasAnchor = { x: -28, y: 4 };
const extrasLeft = extrasAnchor.x + (STAGE_PANEL.w - 2 * EXTRAS_CARD.w - EXTRAS_CARD_GAP) / 2;
for (const [index, id] of ['lab', 'user_created_stages'].entries()) {
  nodes.push({ ...old.get(id), chapterId: 'extras',
    position: { x: extrasLeft + index * (EXTRAS_CARD.w + EXTRAS_CARD_GAP), y: extrasAnchor.y + (STAGE_PANEL.h - EXTRAS_CARD.h) / 2 },
    size: { ...EXTRAS_CARD } });
}
chapters.unshift({ id: 'extras', label: 'Auxiliary Systems', order: 0, numbered: false, anchor: extrasAnchor,
  panel: { position: extrasAnchor, size: STAGE_PANEL },
  title: { position: { x: extrasAnchor.x, y: 1 }, size: { w: 25, h: 2.75 }, styleId: 'auxiliary_core' } });
const edges = STAGE_MAP_EDGES.map(({ from, to }) => {
  const parent = STAGES.find(s => s.nodeId === from);
  const stage = STAGES.find(s => s.nodeId === to);
  const dx = stage.gridPosition.column - parent.gridPosition.column;
  const dy = stage.gridPosition.row - parent.gridPosition.row;
  if (parent.chapterId !== stage.chapterId || Math.abs(dx) + Math.abs(dy) !== 1 || dx < 0) {
    throw new Error(`Invalid stage-map edge: ${parent.nodeId} -> ${stage.nodeId}`);
  }
  return { from: parent.nodeId, to: stage.nodeId, style: 'straight', edgeType: 'progression' };
});
const nodeTypes = { ...spec.nodeTypes }; delete nodeTypes.rank;
await fs.writeFile('stage_map.json', JSON.stringify({ ...spec, nodeTypes, chapters, nodes, edges }, null, 2) + '\n');
console.log(`${STAGES.length} stages, ${edges.length} adjacent straight arrows; stable IDs and release status preserved.`);
