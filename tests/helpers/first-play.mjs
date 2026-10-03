import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync(new URL('../fixtures/first-play-baseline.json', import.meta.url), 'utf8'));
// Older issue snapshots still protect every field outside #502's authored copy.
export function beforeFirstPlay(levels, file = 'levels.json') {
  const previous = structuredClone(levels), old = baseline[file];
  previous.levelDescriptions[0].desc = old.description;
  for (const [id, hints] of Object.entries(old.hints)) previous.levelHints[id] = structuredClone(hints);
  return previous;
}
