import fs from 'node:fs';

export const chapterStarIds = [9,8,10,14,17,13,16,24,15,18,47,32,33,34,35,36,37,12,21,20,22,19];
export const starBaseline = JSON.parse(fs.readFileSync(new URL('../fixtures/chapter-3-4-contracts.json', import.meta.url), 'utf8'));

// Keep earlier regression snapshots meaningful: undo only issue #491's explicit
// changes, which chapter-stars.test.mjs and cost.test.mjs check independently.
export function beforeChapterStars(levels, file = 'levels.json') {
  const previous = structuredClone(levels);
  for (const id of chapterStarIds) previous.levelStarThresholds[id] = {twoStarMaxCost:null,threeStarMaxCost:null};
  for (const [id, definition] of Object.entries(starBaseline.languages[file].definitions)) {
    for (const [key, value] of Object.entries(definition)) previous[key][id] = structuredClone(value);
  }
  delete previous.levelPreviousLayouts[19];
  if(file === 'levels_en.json') previous.levelTitles[19] = '7 x 7 crossroad';
  return previous;
}
