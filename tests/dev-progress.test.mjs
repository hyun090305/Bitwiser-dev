import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createDevProgress, DEV_PROGRESS_KEY, presetProgress } from '../src/dev/progress.js';
import { canPlayStage, chapterAccess, playableStages } from '../src/modules/stageCatalog.js';
import { renderDevShell } from '../scripts/dev-shell.cjs';

const data = JSON.parse(fs.readFileSync(new URL('../levels.json', import.meta.url)));
const circuit = JSON.parse(fs.readFileSync(new URL('fixtures/demo/6-3.json', import.meta.url))).circuit;
function setup(initial = []) {
  const values = new Map(initial);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const create = () => createDevProgress({ storage, getLevels: () => data });
  return { values, storage, create, store: create() };
}
const can = (store, id) => canPlayStage(id, store.cleared(), store.access());

test('DEV: all-unlock preserves clears/stars; explicit lock beats gates, retained access and clears', () => {
  const { store } = setup();
  store.setStage(1, 2);
  store.unlockAll();
  assert.deepEqual(store.cleared(), [1]);
  assert.equal(store.stars(1), 2);
  assert.ok(playableStages().every(s => can(store, s.id)));
  store.setStage(30, 3); store.setStage(9, 2);
  store.setChapter('chapter_3', 'locked');
  assert.equal(chapterAccess('chapter_3', store.cleared(), store.access()).unlocked, false);
  assert.equal(can(store, 9), false);
  store.setChapter('chapter_3', 'default');
  assert.equal(can(store, 9), true);
  store.setChapter('chapter_1', 'locked');
  assert.equal(can(store, 0), false);
  assert.equal(can(store, 999), false);
});

test('DEV: before-unlock presets keep their gate incomplete and transition on a real clear', () => {
  const { store } = setup();
  store.applyPreset('before-ch2');
  assert.equal(can(store, 6), true); assert.equal(can(store, 25), false);
  assert.ok(!store.cleared().includes(6));
  const result = store.recordClear(6, circuit);
  assert.equal(result.record.stars, 2); assert.equal(can(store, 25), true);
  store.applyPreset('before-ch34');
  assert.equal(can(store, 30), true);
  assert.equal(can(store, 9), false); assert.equal(can(store, 12), false);
  const door = JSON.parse(fs.readFileSync(new URL('fixtures/demo/30-3.json', import.meta.url))).circuit;
  store.recordClear(30, door);
  assert.equal(can(store, 9), true); assert.equal(can(store, 12), false);
  assert.equal(can(store, 38), false);
});

test('DEV: restart retains overrides and stars; reset restores this launch snapshot only', () => {
  const { store, create, values } = setup([['username', 'real-player'], ['bitwiser:cost-progress:v1:real-player', 'untouched']]);
  store.setStage(6, 2); store.setChapter('chapter_2', 'locked');
  const reopened = create();
  const initial = reopened.snapshot();
  assert.equal(reopened.stars(6), 2); assert.equal(can(reopened, 25), false);
  reopened.applyPreset('complete');
  assert.equal(reopened.cleared().length, 48);
  reopened.reset();
  assert.deepEqual(reopened.snapshot(), initial);
  assert.equal(values.get('username'), 'real-player');
  assert.equal(values.get('bitwiser:cost-progress:v1:real-player'), 'untouched');
  reopened.applyPreset('fresh');
  assert.deepEqual(reopened.cleared(), []); assert.equal(can(reopened, 25), false);
});

test('DEV: lowering stars and removing a clear replaces display without fabricating a best record', () => {
  const { store } = setup();
  store.recordClear(6, circuit); assert.ok(store.best(6));
  for (const stars of [3, 2, 1]) {
    store.setStage(6, stars); assert.equal(store.stars(6), stars); assert.equal(store.best(6), null);
  }
  store.setStage(6, null);
  assert.equal(store.stars(6), 0); assert.deepEqual(store.cleared(), []);
  assert.equal(can(store, 25), false, 'a single XOR clear does not reach 18 stars');
  store.setStage(0, 3); assert.equal(store.stars(0), 0);
  assert.throws(() => store.setStage(1, 4)); assert.throws(() => store.setStage(999, 1));
  assert.throws(() => store.setChapter('missing', 'unlocked'));
  assert.throws(() => presetProgress('invalid'));
});

test('DEV: a failed grade cannot change progress or unlock a gate', () => {
  const { store } = setup();
  store.applyPreset('before-ch2'); const before = store.snapshot();
  assert.throws(() => store.recordClear(6, { rows: 6, cols: 6, blocks: {}, wires: {} }));
  assert.deepEqual(store.snapshot(), before);
});

test('DEV: corrupt saves are backed up; write failures remain visible and session-only', () => {
  const { store, values } = setup([[DEV_PROGRESS_KEY, '{broken']]);
  assert.equal(store.saved, false);
  store.setStage(1, 3);
  assert.equal(values.get(`${DEV_PROGRESS_KEY}:recovery`), '{broken');
  const errors = [];
  const failing = createDevProgress({ storage: { getItem: () => null, setItem: () => { throw new Error('full'); } }, getLevels: () => data, onFailure: error => errors.push(error.message) });
  failing.setStage(1, 2);
  assert.equal(failing.saved, false); assert.equal(failing.stars(1), 2); assert.deepEqual(errors, ['full']);
});

test('DEV: shell removes online SDK/worker and production packaging excludes developer entries', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const dev = renderDevShell(html);
  assert.ok(dev.includes('src/dev/main.js')); assert.ok(dev.includes('connect-src'));
  assert.ok(!/firebaseConfig|serviceWorker|<script[^>]*src="https?:/.test(dev));
  assert.ok(!html.includes('src/dev/'));
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.ok(pkg.build.files.includes('!src/dev/**/*'));
  assert.ok(pkg.build.files.includes('!electron/dev/**/*'));
  assert.equal(pkg.scripts.start, 'electron .');
});

test('DEV: Windows profile remains distinct from the normal package name ignoring case', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  const appData = 'C:\\test\\AppData\\Roaming';
  let options;
  vm.runInNewContext(fs.readFileSync(new URL('../electron/dev/main.cjs', import.meta.url), 'utf8'), {
    require(id) {
      if (id === 'electron') return { app: { isPackaged: false, getPath(name) { assert.equal(name, 'appData'); return appData; } } };
      if (id === 'node:path') return path.win32;
      if (id === '../../scripts/dev-shell.cjs') return { renderDevShell };
      if (id === '../app.cjs') return { launch(value) { options = value; } };
      assert.fail(`Unexpected module: ${id}`);
    }
  });
  assert.equal(path.win32.dirname(options.userData), appData);
  assert.notEqual(options.userData.toLowerCase(), path.win32.join(appData, pkg.productName || pkg.name).toLowerCase());
});
