import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const copy = JSON.parse(fs.readFileSync(new URL('./data/stage-copy.json', import.meta.url), 'utf8'));
const caps = [[230,270],[245,285],[180,210],[390,450],[370,425],[315,365],[500,580],[230,270],[550,650]];
export function applyStageCopy(data, language) {
  const lang = language === 1 || language === 'en' ? 'en' : 'ko';
  for (const [id, entry] of Object.entries(copy)) {
    if (!data.levelTitles[id]) continue;
    data.levelTitles[id] = entry.title;
    data.levelDescriptions[id] = { ...data.levelDescriptions[id], title: entry.title,
      desc: entry[lang], rules: structuredClone(entry.rules[lang]) };
  }
  for (const [index, [threeStarMaxCost, twoStarMaxCost]] of caps.entries()) {
    if (data.levelTitles[index + 38]) data.levelStarThresholds[index + 38] = { twoStarMaxCost, threeStarMaxCost };
  }
  return data;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [language, file] of ['levels.json', 'levels_en.json'].entries()) {
    const data = applyStageCopy(JSON.parse(fs.readFileSync(file, 'utf8')), language);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
}
