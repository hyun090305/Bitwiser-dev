# Chapter-only access (catalog v4)

[Issue #459](https://github.com/hyun090305/Bitwiser-dev/issues/459)의 진행 규칙입니다. 과거 맵·체험판 문서의 개별 스테이지 선행 조건보다 이 문서와 현재 카탈로그를 우선합니다.

## 접근과 맵

`src/modules/stageCatalog.js`의 `canPlayStage`는 공개 상태와 챕터 접근권만 검사합니다. 열린 챕터의 모든 playable 문제는 자유롭게 선택할 수 있습니다. 기존 47개 playable / 1개 candidate, stage ID, node ID, 챕터 소속은 유지합니다.

| 챕터 | 신규 진행의 해금 조건 |
| --- | --- |
| Chapter 1 | 처음부터 |
| Chapter 2 | 6 클리어 |
| Chapter 3 | 30 클리어 |
| Chapter 4 | 30 클리어 |
| Chapter 5 | 30, 14, 32 클리어 |

`src/modules/stageMapTopology.js`의 `STAGE_MAP_EDGES`는 시각 관계만 정의합니다. 접근권이나 추천 순서를 결정하지 않습니다. 생성 스크립트는 이 데이터로 기존 44개 화살표를 만들며 `stage_map.json`의 위치·크기·경로·스타일을 그대로 재현합니다. 기존 선택·완료 효과는 유지하고 추천 노드 효과는 추가하지 않습니다.

정식판 결과의 주 진행 버튼은 `clearedMapBtn`(맵으로 돌아가기 / Back to map)이고 다시 설계하기는 보조 동작입니다. 체험판도 맵 복귀가 주 동작입니다. Automatic Door(30)의 체험판 마무리 안내는 유지하며, Chapter 2의 다른 문제를 완료하지 않고 먼저 볼 수 있습니다.

## 저장 호환

- 카탈로그 버전은 4입니다. 정식판 저장 키 `stageMapAccess_v3_<nickname>`과 체험판 키 `bitwiser:web-demo:v1`은 기존 기록을 읽기 위해 유지합니다.
- `unlockedChapters`와 기존 클리어가 보장하던 접근권을 유지합니다. 과거 `unlockedStages`는 해당 문제의 챕터 전체 접근권으로 승격됩니다. 개별 스테이지 잠금으로 사용하지 않습니다.
- `preserveStageAccess`는 기존 reader 호환용 `unlockedStages` 스냅샷도 기록합니다. v1/v2의 옛 해금 규칙은 최초 이전에만 적용하고, v3/v4에 다시 적용하지 않습니다.
- 이전은 반복 실행에 안전합니다. 선행 문제의 클리어를 생성하지 않으며 회로·초안·최고 기록·최고 별·힌트를 변경하지 않습니다. 체험판 범위 밖의 보관 기록도 기존 검증 경로를 유지합니다.

## 회귀 검증

- `npm test`: 챕터별 최소 gate, candidate 차단, v1~v3 정식판 저장 및 체험판 백업, 반복 이전, 기준 맵 좌표·화살표와 재생성 결과를 검사합니다.
- `npm run test:map:browser`: 챕터 gate만 충족한 상태에서 47개 문제를 실제 카드 클릭으로 열고 candidate 차단과 정식판 로컬 마이그레이션을 검사합니다.
- `npm run build:demo`, `npm run preview:demo` 실행 후 `npm run test:demo:browser`: 기존 체험판 회귀 검사와 한국어/영어의 17개 카드 자유 선택, XOR만 클리어한 Chapter 2 접근, Automatic Door를 먼저 완료하는 ending 흐름을 검사합니다.
- `npm run test:cost:browser`: 정식판·체험판 결과 버튼과 비용·랭킹 화면을 검사합니다. `npm run test:full:web`, `npm run test:full:electron`은 실제 진입점 검사입니다.
- `npm run test:grading:browser`, `npm run test:results:browser`, `npm run test:memory20:browser`: 채점·결과 재생·기존 메모리 20문제의 동작을 검사합니다.

결과 재생 검사의 실패 회로는 연결을 유지한 채 게이트 연산을 변경합니다. 옛 출력 ID를 가정하거나 출력 연결을 제거하면 각각 통과 회로 또는 잘못된 연결이 되어 반례 재생을 검증할 수 없습니다.
