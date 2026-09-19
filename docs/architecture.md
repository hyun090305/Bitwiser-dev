# Bitwiser 코드 지도

이 문서는 구현 명세를 작성할 때 읽을 파일을 찾기 위한 출발점입니다. 아래 내용은 [기준 커밋 a569618](https://github.com/hyun090305/Bitwiser-dev/tree/a5696189385a3f9c73cfc1419cd99730c9507ba2)을 조사해 정리했습니다. 변경 작업에서는 현재 커밋의 코드와 테스트를 다시 확인하세요. 과거 문서의 테스트 수·완료 기록은 당시 결과입니다.

## 실행 진입점

| 실행 경로 | 시작 파일 | 역할 |
| --- | --- | --- |
| 정식 웹 | [index.html](../index.html) → [src/main.js](../src/main.js) | 기능 초기화, 계정·랭킹·공유·Lab·문제 편집 연결 |
| Electron | [electron/main.js](../electron/main.js) | `app://bitwiser/index.html`로 정식 웹 화면 실행 |
| 체험판 | [demo.html](../demo.html), [src/demo/main.js](../src/demo/main.js) | 공통 편집기·채점기를 사용하고 진행은 브라우저에 저장 |
| 체험판 빌드 | [scripts/build-demo.mjs](../scripts/build-demo.mjs) | 정식 HTML의 공유 요소와 필요한 모듈을 `dist-web-demo/`로 구성 |

브라우저 코드는 ES modules이며 [src/package.json](../src/package.json)이 Node에서 해당 모듈 형식을 지정합니다. Electron 시작 파일은 CommonJS입니다. 실행·검증 명령은 루트 [package.json](../package.json)에 있습니다.

## 기능별 코드와 기존 명세

| 작업 영역 | 먼저 읽을 코드 | 관련 문서·테스트 |
| --- | --- | --- |
| 회로 편집·화면 | [grid.js](../src/modules/grid.js), [model.js](../src/canvas/model.js), [controller.js](../src/canvas/controller.js), [renderer.js](../src/canvas/renderer.js), [camera.js](../src/canvas/camera.js) | [memory.test.mjs](../tests/memory.test.mjs), [startEngine.test.mjs](../tests/startEngine.test.mjs) |
| D 메모리·시간·연결 | [evaluation.js](../src/canvas/evaluation.js), [engine.js](../src/canvas/engine.js), [connections.js](../src/canvas/connections.js), [tickRunner.js](../src/canvas/tickRunner.js), [memoryControls.js](../src/modules/memoryControls.js) | [D_MEMORY_TICK.md](D_MEMORY_TICK.md) |
| 채점·결과·반례 재생 | [circuitGrading.js](../src/modules/circuitGrading.js), [compiledCircuit.js](../src/canvas/compiledCircuit.js), [referenceFSM.js](../src/modules/referenceFSM.js), [dividerGrading.js](../src/modules/dividerGrading.js), [grading.js](../src/modules/grading.js), [gradingResultView.js](../src/modules/gradingResultView.js), [counterexampleTrace.js](../src/modules/counterexampleTrace.js), [tracePlayback.js](../src/canvas/tracePlayback.js) | [EXHAUSTIVE_GRADING.md](EXHAUSTIVE_GRADING.md), [grading-event-trace.md](grading-event-trace.md), [grading-trace.test.mjs](../tests/grading-trace.test.mjs) |
| 스테이지·해금·지도 | [levels.js](../src/modules/levels.js), [stageCatalog.js](../src/modules/stageCatalog.js), [stageMap.js](../src/modules/stageMap.js), [stageMapLayout.js](../src/modules/stageMapLayout.js), [levels.json](../levels.json), [levels_en.json](../levels_en.json), [stage_map.json](../stage_map.json) | [MEMORY20_INTEGRATION.md](MEMORY20_INTEGRATION.md), [stage-map-v6-implementation.md](stage-map-v6-implementation.md), [memory20.test.mjs](../tests/memory20.test.mjs) |
| 비용·별·기록·랭킹 | [circuitCost.js](../src/modules/circuitCost.js), [costRecords.js](../src/modules/costRecords.js), [costUI.js](../src/modules/costUI.js), [costLeaderboard.js](../src/modules/costLeaderboard.js), [fullCostExperience.js](../src/modules/fullCostExperience.js), [rank.js](../src/modules/rank.js) | [cost-stars-leaderboard.md](cost-stars-leaderboard.md), [cost.test.mjs](../tests/cost.test.mjs) |
| 저장·공유·계정 | [circuitData.js](../src/canvas/circuitData.js), [circuitShare.js](../src/modules/circuitShare.js), [circuitCommunity.js](../src/modules/circuitCommunity.js), [auth.js](../src/modules/auth.js), [storage.js](../src/modules/storage.js) | [D_MEMORY_TICK.md](D_MEMORY_TICK.md), [demo.test.mjs](../tests/demo.test.mjs) |
| 체험판 범위·복구 | [catalog.js](../src/demo/catalog.js), [store.js](../src/demo/store.js), [records.js](../src/demo/records.js) | [WEB_DEMO.md](WEB_DEMO.md), [demo.test.mjs](../tests/demo.test.mjs) |
| UI·번역·확장 기능 | [gameUI.js](../src/modules/gameUI.js), [navigation.js](../src/modules/navigation.js), [themes.js](../src/themes.js), [lang.js](../lang.js), [style.css](../style.css), [problemEditor.js](../src/modules/problemEditor.js), [labMode.js](../src/modules/labMode.js) | 변경한 실행 경로의 브라우저 검사 |

힌트·튜토리얼·알림·음악 등 보조 UI는 `src/modules/`에 있습니다. 정확한 호출 관계는 각 진입점의 import와 실제 사용처에서 확인합니다. 과거 `AGENTS.md`의 “agent”는 이 모듈들을 가리키던 표현이며, 별도 AI 에이전트 서비스가 아닙니다.

## 유지해야 할 실행·데이터 경계

1. `grid.js`가 play/problem 회로와 컨트롤러를 관리하고, 컨트롤러가 모델·연결·편집 이력을 갱신합니다. 격자 크기는 문제/모드에 따라 달라지며 고정 6×6이 아닙니다.
2. `evaluation.js`는 연결 검증·위상 계획과 조합 평가를 담당합니다. INPUT과 현재 D의 Q가 source이며, 조합 순환은 오류입니다. `engine.js`의 표시 갱신과 실제 시간 진행을 구분합니다.
3. `tickCircuit`은 같은 이전 상태에서 모든 D의 다음 상태를 계산하고 함께 적용합니다. 실패한 tick은 상태를 일부만 적용하지 않습니다. D/EN 역할은 도선의 `inputRole`에 있습니다.
4. 채점은 편집 상태와 분리된 회로 평가를 사용합니다. 조합은 전체 입력, 일반 순차는 도달 가능한 상태 쌍을 검사합니다. 나눗셈기는 별도 COMPLETE 계약을 사용합니다. 관측 시점은 reference 정의가 정하며 UI가 임의로 바꾸지 않습니다.
5. 회로 설계 snapshot과 실행 상태를 구분합니다. `circuitData.js`는 현재 v3 및 v2 읽기 호환을 정의하며 snapshot에는 일시적인 Q/tick/button 상태를 저장하지 않습니다. 체험판 백업과 비용 기록은 각각 별도 버전 필드를 갖습니다.
6. 현재 비용·별 규칙은 `circuitCost.js`, `costRecords.js`, 양 언어 `levelStarThresholds`를 확인합니다. 초기 체험판 문서의 블록/도선 기준보다 [비용 개편 문서](cost-stars-leaderboard.md)와 현재 코드가 우선입니다.
7. 정식판의 인증·클라우드 저장·랭킹 경로와 체험판의 로컬 저장 경계를 유지합니다. 체험판 빌드는 온라인 전용 UI/모듈을 제외하므로 공통 파일을 고치면 양쪽을 확인해야 합니다.

구현·검토 절차와 명령 선택은 [development-workflow.md](development-workflow.md)를 따릅니다.
