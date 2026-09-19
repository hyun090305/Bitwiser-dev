import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { demoMap, DEMO_IDS, DEMO_NODE_LEVELS } from '../src/demo/catalog.js';
import { STAGES } from '../src/modules/stageCatalog.js';
import { MEMORY20_IDS } from '../src/modules/memory20References.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-web-demo');
const read = p => fs.readFile(path.join(root, p), 'utf8');
const write = async (p, content) => { const dest = path.join(out, p); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, content); };

// Pull whole, balanced elements from the existing HTML to keep the actual
// editor and settings markup shared with the full web/Electron entry.
function extractElement(html, id) {
  const tags = /<!--[\s\S]*?-->|<\/?([a-z][\w-]*)\b[^>]*>/gi;
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let start = -1, depth = 0, match;
  while ((match = tags.exec(html))) {
    if (!match[1]) continue;
    const closing = match[0].startsWith('</');
    if (start < 0) {
      if (closing || !new RegExp(`\\bid=["']${id}["']`).test(match[0])) continue;
      start = match.index;
    }
    if (closing) depth--;
    else if (!voids.has(match[1].toLowerCase()) && !match[0].endsWith('/>')) depth++;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error(`Missing shared HTML: ${id}`);
}
const source = await read('index.html');
let html = (await read('demo.html')).replace(/<!-- shared:([\w-]+) -->/g, (_, id) => extractElement(source, id));
html = html.replace(extractElement(html, 'loadingStartBtn'), '<button id="loadingStartBtn" type="button" aria-label="START" disabled>START</button>');
for (const id of ['labCommunityControls', 'loginArea', 'rankingPanel', 'guestbookPanel', 'blueprintArchiveTools', 'viewSavedBtn', 'saveCircuitBtn', 'nativeSaveNotice']) html = html.replace(extractElement(html, id), '');
html = html.replace(/<button\b[^>]*\bdata-panel-target=[\s\S]*?<\/button>/g, tag => tag.includes('#rankingPanel') ? '<button class="hud-button" id="demoRankingHudBtn" type="button" data-full-feature="ranking" aria-label="Rankings">🏆</button>' : '');
html = html.replace('id="viewRankingBtn"', 'id="viewRankingBtn" data-full-feature="ranking"');
html = html.replace('id="exportGifBtn"', 'id="demoShareBtn" data-demo-text="share"');
html = html.replace('<div class="system-menu-footer">', `<section><div class="system-menu-grid">
  <button id="demoSettingsBtn" data-demo-text="settings"></button>
</div></section><div class="system-menu-footer">`);
const settings = extractElement(html, 'settingsModal');
const themeHeading = settings.indexOf('id="themeHeading"');
const themeStart = settings.lastIndexOf('<div class="settings-section">', themeHeading);
const themeEnd = settings.indexOf('<div class="modal-buttons">', themeHeading);
if (themeStart < 0 || themeEnd < themeStart) throw new Error('Shared theme section not found');
const localSettings = settings.slice(0, themeStart) + settings.slice(themeEnd);
html = html.replace(settings, localSettings.replace(/(<div class="modal-buttons">\s*<button id="settingsCloseBtn")/, `<div class="settings-section demo-local-settings">
  <p data-demo-text="saveHelp"></p>
  <div class="modal-buttons">
    <button id="demoLanguageBtn">한국어 / English</button>
    <button id="demoExportBackupBtn" data-demo-text="exportBackup"></button>
    <button id="demoImportBackupBtn" data-demo-text="importBackup"></button>
    <input id="demoBackupFile" type="file" accept=".json,application/json" hidden>
  </div>
  <button id="demoUpdateBtn" data-demo-text="update" hidden></button>
</div>$1`));
html = html.replace(/<label class="settings-checkbox">\s*<input[^>]+id="autoSaveCheckbox"[\s\S]*?<\/label>/, '');
for (const id of ['adHintBtn', 'nextHintTimer']) {
  if (html.includes(`id="${id}"`)) html = html.replace(extractElement(html, id), '');
}
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, tag => tag.includes('src=') ? tag : '');
if (/firebase|googleapis|accounts\.google|adsbygoogle|onclick=|src\/main\.js/.test(html)) throw new Error('Online entry leaked into demo HTML: ' + html.slice(Math.max(0, html.search(/firebase|googleapis|accounts\.google|adsbygoogle|onclick=|src\/main\.js/) - 80), html.search(/firebase|googleapis|accounts\.google|adsbygoogle|onclick=|src\/main\.js/) + 100));
await fs.mkdir(out, { recursive: true });
await write('index.html', html);
const included = new Set(['index.html']);
async function copy(file) {
  if (included.has(file)) return;
  included.add(file);
  await write(file, await fs.readFile(path.join(root, file)));
}
// Only static module imports are part of the demo. Full-only dynamic imports
// remain unreachable and their modules are not shipped in the demo package.
async function copyModule(file) {
  if (included.has(file)) return;
  await copy(file);
  const source = await read(file);
  for (const match of source.matchAll(/^import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"];?/gm)) {
    if (match[1].startsWith('.')) await copyModule(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
  }
}
await copyModule('src/demo/main.js');
await copyModule('src/canvas/controller.js'); // setupGrid loads this lazily
// Ship only the behavioral definitions needed by the demo. The full game's
// register banks, buffers and divider answers are not demo content.
const memoryFile='src/modules/memory20References.js';
let memorySource=await read(memoryFile);
memorySource=memorySource.replace(/  \/\/ stage:([^\n]+)\n([\s\S]*?)(?=  \/\/ stage:)/g,(match,slot)=>DEMO_IDS.includes(MEMORY20_IDS[slot])?match:'');
await write(memoryFile,memorySource);
// The shared renderer only receives playable demo IDs. Full-stage map
// placeholders cannot resolve to the full game's stage metadata.
const catalogFile = 'src/modules/stageCatalog.js';
const catalogSource = await read(catalogFile);
const start = catalogSource.indexOf('// Candidate IDs');
const end = catalogSource.indexOf('export const stageById');
if (start < 0 || end < start) throw new Error('Catalog boundaries missing');
await write(catalogFile, catalogSource.slice(0, start) + `export const STAGES = ${JSON.stringify(STAGES.filter(s => DEMO_IDS.includes(s.id)))};\n\n` + catalogSource.slice(end));
for (const file of ['src/package.json', 'style.css', 'demo.css', 'lang.js', 'gif.js', 'gif.worker.js']) await copy(file);
for (const file of await fs.readdir(path.join(root, 'assets'))) {
  if (/\.(png|svg|gif|mp3|wav|ogg|webp)$/i.test(file)) await copy(`assets/${file}`);
}
const levels = JSON.parse(await read('levels.json'));
for (const file of ['levels.json', 'levels_en.json']) {
  const data = JSON.parse(await read(file));
  for (const [key, values] of Object.entries(data)) {
    data[key] = Object.fromEntries(Object.entries(values).filter(([id]) => DEMO_IDS.includes(Number(id.replace('stage', '')))));
  }
  await write(file, JSON.stringify(data)); included.add(file);
}
// Star targets are authored explicitly in levels.json, never from fixtures.
const budgets = Object.fromEntries(DEMO_IDS.filter(id => id !== 0).map(id => [id, levels.levelStarThresholds[id]]));
await write('demo-budgets.json', JSON.stringify(budgets)); included.add('demo-budgets.json');
await write('stage_map.json', JSON.stringify(demoMap(JSON.parse(await read('stage_map.json'))))); included.add('stage_map.json');
const hash = createHash('sha256');
for (const file of [...included].sort()) hash.update(await fs.readFile(path.join(out, file)));
hash.update(await read('service-worker-demo.js'));
const revision = hash.digest('hex').slice(0, 12);
// A previous worker may serve cached scripts to newly fetched HTML. Version
// the shell assets so removal of old DOM controls cannot load an old entry.
const shellAssets = new Set(['style.css', 'demo.css', 'lang.js', 'gif.js', 'src/demo/main.js']);
html = html.replace(/((?:src|href)=")([^"]+)(")/g, (match, before, file, after) => shellAssets.has(file) ? `${before}${file}?v=${revision}${after}` : match);
await write('index.html', html);
let sw = await read('service-worker-demo.js');
sw = sw.replace('__REVISION__', revision).replace('/* PRECACHE */ []', JSON.stringify([...included].filter(f => !/\.(mp3|wav|gif)$/.test(f)).map(f => shellAssets.has(f) ? `${f}?v=${revision}` : f)));
await write('service-worker-demo.js', sw); included.add('service-worker-demo.js');
// Remove stale output files only in this fixed, verified build directory.
async function prune(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const absolute = path.resolve(dir, entry.name);
    if (!absolute.startsWith(out + path.sep)) throw new Error('Unsafe build output path');
    if (entry.isDirectory()) await prune(absolute);
    else if (!included.has(path.relative(out, absolute).split(path.sep).join('/'))) await fs.unlink(absolute);
  }
}
await prune(out);
console.log(`Demo built: ${out} (${included.size} files, revision ${revision})`);
console.log('Star targets use the explicit levelStarThresholds configuration.');
