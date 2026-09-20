import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DEMO_IDS } from '../src/demo/catalog.js';
import { MEMORY20_IDS, getMemory20Reference } from '../src/modules/memory20References.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const memoryFile = 'src/modules/memory20References.js';
const required = Object.entries(MEMORY20_IDS).filter(([, id]) => DEMO_IDS.includes(id));
const source = (await fs.readFile(path.join(root, memoryFile), 'utf8')).replace(/\r\n/g, '\n');

async function setup(t, newline, transform = text => text) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bitwiser-demo-build-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('bitwiser-demo-build-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  // Exercise the real build in isolation. Static media contents are irrelevant
  // to reference filtering; an empty assets directory keeps these tests small.
  await fs.mkdir(path.join(directory, 'assets'));
  for (const file of ['src', 'scripts/build-demo.mjs', 'index.html', 'demo.html',
    'style.css', 'demo.css', 'lang.js', 'gif.js', 'gif.worker.js', 'levels.json',
    'levels_en.json', 'stage_map.json', 'service-worker-demo.js']) {
    await fs.cp(path.join(root, file), path.join(directory, file), { recursive: true });
  }
  await fs.writeFile(path.join(directory, memoryFile), transform(source).replace(/\n/g, newline));
  return directory;
}

function build(directory) {
  const result = spawnSync(process.execPath, ['scripts/build-demo.mjs'], {
    cwd: directory, encoding: 'utf8', timeout: 15000
  });
  assert.ifError(result.error);
  return result;
}

for (const [label, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
  test(`${label} demo build preserves only demo memory references and their transitions`, async t => {
    const directory = await setup(t, newline);
    const result = build(directory);
    assert.equal(result.status, 0, result.stderr);
    const output = path.join(directory, 'dist-web-demo', memoryFile);
    const built = await import(pathToFileURL(output).href);
    assert.ok(built.getMemory20Reference('C4-05'), 'Stage 30 automatic door');
    for (const [slot, id] of Object.entries(MEMORY20_IDS)) {
      const actual = built.getMemory20Reference(slot);
      if (!DEMO_IDS.includes(id)) {
        assert.equal(actual, undefined, `Full-only Stage ${id} (${slot}) must be excluded`);
        continue;
      }
      const expected = getMemory20Reference(slot);
      assert.ok(actual, `Missing Stage ${id} (${slot})`);
      for (const key of ['inputs', 'outputs', 'initialState', 'stateCount', 'observeAt']) {
        assert.deepEqual(actual[key], expected[key], `${slot}: ${key}`);
      }
      for (let state = 0; state < expected.stateCount; state++) {
        for (let input = 0; input < 2 ** expected.inputs.length; input++) {
          assert.deepEqual(actual.evaluate(state, input), expected.evaluate(state, input), `${slot}: ${state}/${input}`);
        }
      }
    }
    const outputSource = await fs.readFile(output, 'utf8');
    const slots = [...outputSource.matchAll(/^  \/\/ stage:([^\r\n]+)/gm)].map(match => match[1]);
    assert.deepEqual(slots, [...required.map(([slot]) => slot), 'end']);
  });

  test(`${label} demo build fails with stage and slot when a required definition is missing`, async t => {
    // Keep the marker so merely counting comments cannot satisfy validation.
    const directory = await setup(t, newline, text => text.replace(/^  'C4-05':.*\n/m, ''));
    const result = build(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing demo memory references: Stage 30 \(C4-05\)/);
    assert.doesNotMatch(result.stdout, /Demo built:/);
    await assert.rejects(fs.access(path.join(directory, 'dist-web-demo')), { code: 'ENOENT' });
  });

  test(`${label} demo build rejects full-only definitions left by a broken marker boundary`, async t => {
    const directory = await setup(t, newline, text => text.replace('  // stage:end\n', ''));
    const result = build(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected demo memory references: Stage 40 \(C5-09\)/);
    assert.doesNotMatch(result.stdout, /Demo built:/);
    await assert.rejects(fs.access(path.join(directory, 'dist-web-demo')), { code: 'ENOENT' });
  });
}
