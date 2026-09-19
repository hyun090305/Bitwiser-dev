import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CATALOG_VERSION, STAGES, chapterAccess, canPlayStage, preserveStageAccess } from '../src/modules/stageCatalog.js';
import { STAGE_MAP_EDGES } from '../src/modules/stageMapTopology.js';
import { DEMO_IDS, isUnlocked } from '../src/demo/catalog.js';
import { emptyProgress, makeRecord, validateProgress } from '../src/demo/records.js';
import { getStageAccessRecord, setStageAccessRecord } from '../src/modules/storage.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const chapters = [
  { id: 'chapter_1', gate: [], stages: [0,1,2,3,4,5,6] },
  { id: 'chapter_2', gate: [6], stages: [25,7,26,27,28,29,30,23,11,31] },
  { id: 'chapter_3', gate: [30], stages: [9,8,10,14,17,13,16,24,15,18] },
  { id: 'chapter_4', gate: [30], stages: [12,21,32,33,34,35,36,37,20,22,19] },
  { id: 'chapter_5', gate: [30,14,32], stages: [38,39,40,41,42,43,44,45,46] }
];

test('AC-1–5: every playable stage opens with only its exact chapter gate', () => {
  for (const chapter of chapters) {
    assert.deepEqual(STAGES.filter(s => s.chapterId === chapter.id && s.status === 'playable').map(s => s.id).sort((a,b) => a-b), [...chapter.stages].sort((a,b) => a-b));
    assert.equal(chapterAccess(chapter.id, chapter.gate).unlocked, true);
    for (const id of chapter.stages) assert.equal(canPlayStage(id, chapter.gate), true, `stage ${id}`);
    for (const missing of chapter.gate) {
      const incomplete = chapter.gate.filter(id => id !== missing);
      assert.equal(chapterAccess(chapter.id, incomplete).unlocked, false);
      for (const id of chapter.stages) assert.equal(canPlayStage(id, incomplete), false, `stage ${id} without ${missing}`);
    }
  }
  for (const id of [null, undefined, -1, 47, '30', NaN]) assert.equal(canPlayStage(id, [], { unlockedChapters: chapters.map(c => c.id), unlockedStages: [id] }), false);
  assert.equal(chapterAccess('unknown').unlocked, false);
});

test('AC-10: legacy stage access and cleared replays grant their entire chapter', () => {
  for (const chapter of chapters) for (const retainedId of chapter.stages) {
    for (const id of chapter.stages) {
      assert.equal(canPlayStage(id, [], { unlockedStages: [retainedId] }), true);
      assert.equal(canPlayStage(id, [retainedId]), true);
    }
    const migrated = preserveStageAccess([], { catalogVersion: 3, unlockedStages: [retainedId] });
    assert.equal(migrated.catalogVersion, CATALOG_VERSION);
    assert.ok(migrated.unlockedChapters.includes(chapter.id));
    assert.deepEqual(preserveStageAccess([], migrated), migrated);
  }
  assert.equal(chapterAccess('chapter_3', [null], { unlockedStages: [null, 999] }).unlocked, false);
});

test('AC-10: full-version v1–v3 local records retain access in the existing storage key', () => {
  const data = new Map([['username', 'chapter-access-test'], ['unrelated-draft', 'keep']]);
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  try {
    for (const catalogVersion of [1,2,3]) {
      const previous = { catalogVersion, unlockedStages: [44], unlockedChapters: ['chapter_3'] };
      data.set('stageMapAccess_v3_chapter-access-test', JSON.stringify(previous));
      const cleared = [6], migrated = preserveStageAccess(cleared, getStageAccessRecord());
      setStageAccessRecord(migrated);
      assert.deepEqual(getStageAccessRecord(), migrated);
      for (const chapter of [chapters[1], chapters[2], chapters[4]]) {
        for (const id of chapter.stages) assert.equal(canPlayStage(id, cleared, migrated), true);
      }
      assert.deepEqual(preserveStageAccess(cleared, migrated), migrated);
      assert.deepEqual(cleared, [6]);
      assert.deepEqual(previous, { catalogVersion, unlockedStages: [44], unlockedChapters: ['chapter_3'] });
    }
    assert.equal(data.get('unrelated-draft'), 'keep');
  } finally { delete globalThis.localStorage; }
});

test('AC-10: only pre-v3 progress retains the former common later-chapter gate', () => {
  for (const catalogVersion of [1,2,3,4]) {
    const migrated = preserveStageAccess([30], { catalogVersion });
    assert.equal(chapterAccess('chapter_5', [30], migrated).unlocked, catalogVersion < 3);
    assert.deepEqual(preserveStageAccess([30], migrated), migrated);
  }
});

test('AC-9–10: demo v1–v3 backup migration preserves records and chapter access', () => {
  const levels = read('levels.json');
  const best = makeRecord(read('tests/fixtures/demo/6-3.json').circuit, 6, levels);
  const draft = { circuitVersion: 3, circuit: read('tests/fixtures/demo/31-3.json').circuit };
  for (const catalogVersion of [1,2,3]) {
    const raw = { ...emptyProgress(), catalogVersion, unlockedStages: [31], unlockedChapters: ['chapter_2'],
      stages: { 6: { best, bestStars: best }, 31: { draft } }, lastStageId: 31, hints: { 6: 2, 31: 1 }, settings: { lang: 'ko' } };
    const before = structuredClone(raw), migrated = validateProgress(raw, levels, {}, []);
    assert.equal(migrated.catalogVersion, 4);
    for (const id of DEMO_IDS) assert.equal(isUnlocked(id, [6], migrated), true);
    for (const key of ['stages','lastStageId','hints','settings','archivedStages','archivedHints']) assert.deepEqual(migrated[key], raw[key]);
    assert.deepEqual(validateProgress(migrated, levels, {}, []), migrated);
    assert.deepEqual(raw, before);
  }
  const retainedOnly = validateProgress({ ...emptyProgress(), catalogVersion: 3, unlockedStages: [30], lastStageId: 30 }, levels, {}, []);
  assert.deepEqual(retainedOnly.stages, {});
  for (const id of DEMO_IDS) assert.equal(isUnlocked(id, [], retainedOnly), true);
  for (const id of [9,12,38]) assert.equal(isUnlocked(id, [], retainedOnly), false);
});

test('AC-6: separate topology reproduces every baseline arrow and generated map byte for byte', () => {
  const baseline = fs.readFileSync(path.join(root, 'stage_map.json'), 'utf8').replaceAll('\r\n', '\n');
  assert.deepEqual(STAGE_MAP_EDGES, JSON.parse(baseline).edges.map(({ from, to }) => ({ from, to })));
  assert.ok(STAGES.every(stage => !('prerequisites' in stage)));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bitwiser-map-'));
  try {
    fs.writeFileSync(path.join(directory, 'stage_map.json'), baseline);
    fs.copyFileSync(path.join(root, 'levels_en.json'), path.join(directory, 'levels_en.json'));
    execFileSync(process.execPath, [path.join(root, 'scripts/restructure-stage-map.mjs')], { cwd: directory });
    assert.equal(fs.readFileSync(path.join(directory, 'stage_map.json'), 'utf8'), baseline);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('bitwiser-map-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
