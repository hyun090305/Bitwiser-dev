import fs from 'node:fs';
export const progressionBaseline = JSON.parse(fs.readFileSync(new URL('../fixtures/progression-baseline.json', import.meta.url), 'utf8'));
// Undo only #495's localized prose and C5 targets for older snapshot tests.
// Tables, puzzle rules, palettes, boards, hints and all other data stay under test.
export function beforeStarProgression(levels, file = 'levels.json') {
  const previous = structuredClone(levels);
  for (const [id, copy] of Object.entries(progressionBaseline.languages[file].copy)) {
    previous.levelTitles[id] = copy.title;
    previous.levelDescriptions[id].title = copy.descriptionTitle;
    previous.levelDescriptions[id].desc = copy.desc;
    delete previous.levelDescriptions[id].rules;
  }
  for (let id=38;id<=46;id++) previous.levelStarThresholds[id] = {twoStarMaxCost:null,threeStarMaxCost:null};
  return previous;
}
