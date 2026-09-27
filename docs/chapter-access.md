# 누적 별 챕터 접근 (catalog v5)

[Issue #495](https://github.com/hyun090305/Bitwiser-dev/issues/495)의 진행 규칙입니다. 이전 문서의 개별 문제 선행 조건과 특정 ID 클리어 gate보다 이 문서와 현재 카탈로그를 우선합니다.

| 챕터 | 정규 문제 | 최대 별 | 누적 별 해금 |
| --- | ---: | ---: | ---: |
| Logic Core | 7 | 21 | 0 |
| Memory Link | 9 | 27 | 18 |
| Arithmetic Unit | 11 | 33 | 36 |
| Control Flow | 11 | 33 | 50 |
| System Integration | 9 | 27 | 84 |

`src/modules/stageCatalog.js`의 `totalStageStars`는 정규 47개 문제의 최고 획득 별만 합산합니다. 전체 최대는 141★이며 Tutorial(0), Lab, 사용자 문제는 제외합니다. 재제출·낮은 별은 합계를 늘리거나 줄이지 않습니다. `chapterAccess`와 `canPlayStage`를 맵, 실제 진입, 체험판, 개발 provider가 공유합니다. 열린 챕터의 모든 문제를 자유롭게 선택하며 접근권은 유지합니다. 화살표는 기능 관계만 표현합니다.

## 배치와 표시

ID 0~47, nodeId, 저장 키는 유지합니다. Majority(7)만 C2에서 C1로 옮깁니다. 48개 슬롯과 43개 직선 화살표의 원본은 `stageCatalog.js`, `stageMapTopology.js`이며 `node scripts/restructure-stage-map.mjs`로 `stage_map.json`을 재생성합니다. [배치 참조](stage-map-reference.json)와 `tests/fixtures/progression-layout.json`은 이슈의 정확한 슬롯/연결을 기록합니다.

한영 기능명과 안내 원본은 `scripts/data/stage-copy.json`입니다. 각 문제는 짧은 목표와 필요한 고유 규칙 표(`levelDescriptions.rules`), 기존 진리표/시퀀스를 표시합니다. 초기값·우선순위·유지 조건을 표에 남기고 공통 신호·이진수·배선·tick·입력 조작은 기존 조작법 도움말에서 제공합니다. `LOGIC NODE:` 접두사와 반복 스토리/소제목은 표시하지 않습니다. 고정 I/O는 배지로 표시합니다.

`node scripts/apply-stage-copy.mjs`는 제목·목표·규칙 표와 C5 상한만 갱신합니다. 메모리 생성 스크립트도 이 함수를 사용합니다. 정답표, FSM, 보드, 고정 IO, D/EN, 입력 종류, 비용/채점 버전, C1~4 상한은 바꾸지 않습니다. ID 33은 LEVEL 즉시 반영, 38은 ADDR 즉시 읽기, 46은 첫 COMPLETE tick 계약을 유지합니다.

누적 별은 맵 우측 상단에 `★ 61`처럼 독립적으로 표시합니다. 하단 전환 바의 이전/다음 버튼은 같은 너비이며 챕터명을 중앙에 둡니다. 챕터 설명은 기존 상단 배너의 짧은 부제만 사용합니다. 긴 하단 도입문·해금 완료 상시 문구·별도 스토리 팝업은 없습니다.

## 잠김과 최초 해금

잠긴 챕터 탭에서도 맵을 볼 수 있습니다. `chapterUnlockUI.js`는 맵 패널만 약 60% 어둡게 덮고 자물쇠 → 잠김 제목 → `★ 현재/필요`를 표시합니다. 체험판 C3~5는 자물쇠와 `정식판 전용 / Full version only`만 표시합니다. 제목·탭·누적 별은 선명하며 클릭/터치/키보드와 `startLevel`의 접근 검사가 실행을 막습니다.

접근권은 별 획득 즉시 저장하고, `pendingChapters`/`seenChapters`는 연출 상태만 기록합니다. 결과의 기존 별→축소→설계도 연출이 끝나면 해금 소식을 표시합니다. 맵으로 돌아가면 새 챕터에서 약 900ms 동안 고리가 열리고 덮개가 사라집니다. 특정 문제를 추천하거나 자동 실행하지 않습니다.

스킵·탭 이동은 해당 연출만 확인 처리합니다. 앱 종료는 대기 상태를 남겨 다음 맵 방문에서 이어갑니다. 시작 화면 뒤에서 연출을 소모하지 않으며 여러 대기 챕터는 각각 방문할 때 처리합니다. reduced motion에서는 이동 없이 100ms 전환을 사용합니다.

## 저장 호환과 동기화

- 카탈로그는 v5입니다. 정식판 `stageMapAccess_v3_<nickname>`, 비용 `bitwiser:cost-progress:v1:<nickname>`, 체험판 `bitwiser:web-demo:v1` 키를 유지합니다.
- v1~v4는 **옛 소속과 옛 gate를 먼저** 복원합니다. ID 7 단독 기록과 ID 6 클리어는 옛 C2 접근을 유지합니다. v1/v2의 공통 gate 30은 C3~5를 보존하고, v3/v4의 30은 C3·4, 30+14+32는 C5를 보존합니다. 이후 v5 신규 진행에 옛 gate를 다시 적용하지 않습니다.
- `unlockedChapters`, 구 `unlockedStages`와 클리어가 보장한 접근을 유지합니다. 구 접근 복원은 새로운 해금 연출을 만들지 않습니다. 새 별 상한 재평가로 추가 해금된 챕터는 대기시킵니다.
- 별 없는 기존 클리어는 정규 문제당 최소 1★를 얻습니다. 검증된 비용은 새 상한으로 재평가하고 이미 얻은 최고 별은 보존합니다. 반복 이전은 같은 결과를 내며 회로·초안·힌트·최고 비용과 랭킹 rule key를 변경하지 않습니다.
- 별/접근 갱신은 데이터와 로컬·원격 기록을 읽은 뒤 수행합니다. 저장된 별 기록은 오프라인 재실행에서도 유지합니다. 손상된 개별 비용은 다른 기록을 지우지 않으며, 체험판의 손상된 기록은 `recoveryStages`에 보관합니다. 백업의 단순 표시용 별 합계는 진행 근거로 읽지 않습니다.

## 체험판과 개발 프로필

체험판은 기존 17개 카드(Tutorial 포함), 정규 16개 최대 48★입니다. C2는 18★에서 열고 ID 30의 마무리 안내를 유지합니다. C3~5는 별 수와 별개로 정식판 전용이며 `DEMO_IDS` 밖 기록은 합계에 포함하지 않습니다.

개발 프로필은 문제별 모의 별로 같은 규칙을 시험합니다. `before-ch2`는 17★, `before-ch34`(기존 preset ID 유지)는 C3 직전 35★입니다. 강제 잠금/해금은 항상 우선하며 일반 계정/저장/네트워크에 기록하지 않습니다.

## 재현 검사

- `npm test`: 한영 계약 snapshot, 48개 슬롯/43개 연결, 상한 경계, C5 실제 회로 9개, 누적 별/이전/손상 복구/체험판 범위를 검사합니다.
- `node scripts/verify-star-progression.mjs`: 정식 웹 한영에서 실제 17→19★ 클리어, 네 잠김 맵/API, 결과 순서, 스킵/탭 이동/재시작/다중 대기/reduced motion을 검사합니다.
- `node scripts/verify-concise-ui.mjs` 및 `--electron`: 실제 진입점에서 한영 전체 안내·규칙·도움말, 360~1440px 맵과 1/61/141★, 체험판 제한 문구, 사용자 문제로 전환 시 안내 초기화를 검사합니다.
- `npm run test:map:browser`: 실제 48개 카드 진입과 맵 배치·키보드·터치·이전을 검사합니다.
- `npm run build:demo`, `npm run preview:demo` 후 `npm run test:demo:browser`: 로컬 저장/복원, 한영 17개 카드, 별 해금, ID 30 종료, 정식판 제한을 검사합니다.
- `npm run test:cost:browser`, `npm run test:results:browser`, `npm run test:full:web`, `npm run test:full:electron`, `npm run test:dev:browser`는 해당 실제 실행 경로를 검사합니다. 현재 실행 결과는 PR에 기록합니다.
