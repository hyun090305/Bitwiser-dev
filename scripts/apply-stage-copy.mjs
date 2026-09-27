import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const copy = JSON.parse(fs.readFileSync(new URL('./data/stage-copy.json', import.meta.url), 'utf8'));
const caps = [[230,270],[245,285],[180,210],[390,450],[370,425],[315,365],[500,580],[230,270],[550,650]];
const common = {
  ko: '신호: 0은 꺼짐, 1은 켜짐입니다.\n숫자 읽기: A1 A0처럼 여러 비트가 한 값을 나타낼 때는 오른쪽의 0번 비트가 가장 낮은 자리입니다. 두 비트는 00=0, 01=1, 10=2, 11=3입니다. IN1·IN2처럼 단자 이름을 나열한 선택표는 각 문제에 적힌 순서를 따르세요.\n연결 제약: 도선은 서로 교차할 수 없습니다. 고정된 입력·출력 단자는 이동할 수 없습니다.',
  en: 'Signals: 0 is off and 1 is on.\nReading numbers: In values such as A1 A0, bit 0 on the right is the lowest bit. Two bits mean 00=0, 01=1, 10=2, 11=3. For selection tables listing terminals such as IN1 IN2, follow the order stated in the puzzle.\nConnections: Wires cannot cross. Fixed input and output terminals cannot be moved.'
};
const ticks = {
  ko: 'tick과 D: tick은 회로가 저장값을 한 번 갱신하는 순간입니다. 모든 D 블록은 tick 직전의 값을 읽고 동시에 갱신됩니다. 모든 D의 저장값은 0에서 시작합니다.\n버튼과 스위치: 버튼형 입력은 누르면 1이 되고 다음 tick에 반영된 뒤 0으로 돌아옵니다. 스위치형 입력은 바꾼 값을 유지합니다.\n한 tick의 출력: “그 tick에 1”인 출력은 다음 tick 전까지 유지됩니다. 조건이 연속으로 성립하면 여러 tick 동안 계속 1일 수 있습니다.',
  en: 'Ticks and D: A tick updates stored values once. All D blocks read the values immediately before the tick and update together. All D storage starts at 0.\nButtons and switches: A button becomes 1 when pressed, is sampled at the next tick, then returns to 0. A switch keeps its selected value.\nOne-tick outputs: An output that is 1 on a tick stays 1 until the next tick. Consecutive qualifying ticks may keep it at 1 for several ticks.'
};
export function applyStageCopy(data, language) {
  const lang = language === 1 || language === 'en' ? 'en' : 'ko';
  for (const [id, entry] of Object.entries(copy)) {
    if (!data.levelTitles[id]) continue;
    data.levelTitles[id] = entry.title;
    const sequential = data.levelAnswers[id]?.mode === 'sequential';
    const held = sequential && ![33,38,46].includes(Number(id)) ? (lang === 'ko'
      ? '이 문제의 출력은 tick 때만 바뀌며, 입력만 바꾸거나 버튼이 자동 해제되어도 유지됩니다.'
      : 'Outputs in this puzzle change only on ticks. Changing inputs or automatically releasing buttons does not change them.') : '';
    data.levelDescriptions[id] = { ...data.levelDescriptions[id], title: entry.title,
      desc: [entry[lang], held, common[lang], sequential ? ticks[lang] : ''].filter(Boolean).join('\n\n') };
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
