import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAGES, CHAPTERS, canPlayStage, chapterAccess, preserveStageAccess } from '../src/modules/stageCatalog.js';
import { GRID_UNIT, stageWorldRect, straightStageEdge } from '../src/modules/stageMapLayout.js';
import { validateProgress, emptyProgress, makeRecord } from '../src/demo/records.js';
import { isUnlocked, DEMO_IDS, demoMap } from '../src/demo/catalog.js';
const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const reference = read('docs/stage-map-reference.json'), map = read('stage_map.json');
const byKey = new Map(STAGES.map(s => [s.layoutKey, s]));

test('Extras precedes Chapter 1 without dependencies or changes to demo feature gates', () => {
  assert.deepEqual(map.chapters.map(ch => ch.id), ['extras','chapter_1','chapter_2','chapter_3','chapter_4','chapter_5']);
  const extras = map.chapters[0], chapterOne = map.chapters[1];
  assert.equal(extras.numbered, false);assert.equal(extras.label, 'Auxiliary Systems');
  assert.ok(extras.anchor.x < chapterOne.anchor.x);
  assert.deepEqual(chapterOne.prerequisites, []);
  const cards = map.nodes.filter(n => n.chapterId === 'extras');
  assert.deepEqual(cards.map(n => n.id), ['lab','user_created_stages']);
  assert.deepEqual(cards[0].size, cards[1].size);assert.equal(cards[0].position.y, cards[1].position.y);
  assert.ok(cards.every(n => !n.gridPosition));
  assert.equal(map.edges.some(edge => cards.some(n => n.id === edge.from || n.id === edge.to)), false);
  const demo = demoMap(map);
  assert.equal(demo.nodes.find(n => n.id === 'lab').previewFeature, 'sandbox');
  assert.equal(demo.nodes.find(n => n.id === 'user_created_stages').previewFeature, 'problems');
  assert.equal(canPlayStage(0, []), true);
});

test('48 stable nodes match every approved slot, optional tag, parent and chapter gate', () => {
  assert.equal(STAGES.length, 48); assert.equal(map.edges.length, 44);
  assert.deepEqual(CHAPTERS.map(ch => ch.prerequisites), [[],[6],[30],[30],[30,14,32]]);
  for (const chapter of reference.chapters) for (const expected of chapter.nodes) {
    const stage = byKey.get(expected.layoutKey), node = map.nodes.find(n => n.id === stage.nodeId);
    assert.deepEqual(stage.gridPosition, expected.gridPosition);
    assert.deepEqual(node.gridPosition, expected.gridPosition);
    assert.equal(stage.optional, expected.optional);
    assert.equal(stage.chapterId, `chapter_${chapter.chapter}`);
    if (expected.knownLegacyNodeId) assert.equal(stage.nodeId, expected.knownLegacyNodeId);
    assert.equal('prerequisites' in stage, false);
    assert.deepEqual(map.edges.filter(e=>e.to===stage.nodeId).map(e=>e.from), expected.unlock.allOf.map(key => byKey.get(key).nodeId));
    const anchor = map.chapters.find(ch => ch.id === stage.chapterId).anchor;
    assert.deepEqual([node.position.x-anchor.x+node.size.w/2,node.position.y-anchor.y+node.size.h/2], expected.center);
  }
});

test('all arrows have two border points, equal length, no intersections, and one connected DAG per chapter', () => {
  const nodeById = new Map(map.nodes.filter(n => n.gridPosition).map(n => {
    const rect = stageWorldRect(n.position, n.size);
    return [n.id, {...n, rect, center:{x:rect.x+rect.w/2,y:rect.y+rect.h/2}}];
  }));
  const segments = [];
  for (const edge of map.edges) {
    const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
    assert.equal(from.chapterId,to.chapterId); assert.equal(edge.style,'straight'); assert.ok(!edge.waypoints);
    const dx=to.gridPosition.column-from.gridPosition.column,dy=to.gridPosition.row-from.gridPosition.row;
    assert.equal(Math.abs(dx)+Math.abs(dy),1); assert.ok(dx>=0);
    const points = straightStageEdge(from,to); assert.equal(points.length,2);
    assert.equal(Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),GRID_UNIT);
    const [a,b]=points, box={minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};
    for(const other of segments) assert.ok(box.maxX<other.minX||box.minX>other.maxX||box.maxY<other.minY||box.minY>other.maxY,'arrows overlap or cross');
    segments.push(box);
    for(const node of nodeById.values()) {
      const r=node.rect;
      assert.ok(box.maxX<=r.x||box.minX>=r.x+r.w||box.maxY<=r.y||box.minY>=r.y+r.h,'card penetration');
    }
  }
  for (const [i,ch] of CHAPTERS.entries()) {
    const nodes=STAGES.filter(s=>s.chapterId===ch.id), edges=map.edges.filter(e=>nodeById.get(e.from).chapterId===ch.id);
    assert.equal(nodes.length,[7,10,11,11,9][i]);assert.equal(edges.length,[6,10,10,10,8][i]);
    assert.equal(edges.length-nodes.length+1,i===1?1:0);
    const entry=nodes.find(s=>!edges.some(e=>e.to===s.nodeId));assert.deepEqual(entry.gridPosition,{column:1,row:2});
    const reached=new Set(), visit=(id,path=[])=>{
      assert.ok(!path.includes(id),'directed cycle');reached.add(id);
      edges.filter(e=>e.from===id).forEach(e=>visit(e.to,[...path,id]));
    };
    visit(entry.nodeId);assert.equal(reached.size,nodes.length);
  }
});

test('chapter admission retains exact gates and rejects unknown stages', () => {
  assert.deepEqual(CHAPTERS.map(ch=>ch.prerequisites),[[],[6],[30],[30],[30,14,32]]);
  for(const cleared of [[],[30],[30,14],[14,32]])assert.equal(chapterAccess('chapter_5',cleared).unlocked,false);
  assert.equal(chapterAccess('chapter_5',[30,14,32]).unlocked,true);
  for(const id of [null,48])assert.equal(canPlayStage(id,STAGES.map(s=>s.id),{unlockedStages:[id]}),false);
});

test('legacy access migrates once without fabricating clears, and new progress cannot use old rules', () => {
  const cleared=[30,11], copy=[...cleared];
  const legacy=preserveStageAccess(cleared,{}, {legacy:true});
  assert.equal(canPlayStage(12,cleared,legacy),true);assert.equal(chapterAccess('chapter_5',cleared,legacy).unlocked,true);
  assert.deepEqual(preserveStageAccess(cleared,legacy),legacy);assert.deepEqual(cleared,copy);
  const fresh=preserveStageAccess(cleared);assert.equal(canPlayStage(12,cleared,fresh),true);
  assert.equal(chapterAccess('chapter_5',cleared,fresh).unlocked,false);
  assert.equal(canPlayStage(12,[12]),true);
  assert.equal(canPlayStage(34,[],{unlockedStages:[34]}),true);
});

test('version 2 demo draft, best records, hints and unlocked rising edge survive an idempotent backup migration', () => {
  const levels=read('levels.json'), raw=emptyProgress();raw.catalogVersion=2;
  const record=makeRecord(read('tests/fixtures/demo/29-3.json').circuit,29,levels,{});
  raw.stages[29]={best:record,bestStars:record};
  raw.stages[31]={draft:{circuitVersion:2,circuit:read('tests/fixtures/demo/31-3.json').circuit}};
  raw.lastStageId=31;raw.hints[31]=1;
  const next=validateProgress(raw,levels,{},[]);
  assert.equal(next.catalogVersion,4);assert.equal(next.lastStageId,31);assert.equal(next.hints[31],1);
  assert.equal(isUnlocked(31,[29],next),true);assert.equal(isUnlocked(31,[29]),true);
  assert.deepEqual(next.stages[29],raw.stages[29]);assert.equal(next.stages[30],undefined);
  assert.deepEqual(validateProgress(next,levels,{},[]),next);
  assert.ok(next.unlockedStages.every(id=>DEMO_IDS.includes(id)));
});
