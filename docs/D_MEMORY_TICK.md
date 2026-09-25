# D 메모리와 동기 tick 구현 기록

> 2026-09-18: 엔진의 동시 갱신 계약을 유지하며 메모리 20문제를 최종판으로 갱신했습니다. 현재 정식판 47개·체험판 17개입니다. [최종 적용 문서](MEMORY20_INTEGRATION.md) 참조.

## 사용 방법

전체 웹 또는 `npm start`에서 Memory Link의 **저장 스위치(ID 25)**로 D를 배울 수 있습니다. 2026-09-13 후속 개편으로 전체 34개, 체험판 17개 문제가 열렸습니다. 기존 25개 문제의 정의는 유지했고, D는 검증된 새 순차 문제와 Lab의 명시적인 허용 목록에만 추가했습니다. 최신 배치와 검증 현황은 [스테이지 개편 문서](STAGE_RESTRUCTURE.md)를 참고하세요.

1. tick 기반 문제에서는 부품 배치 전부터 캔버스 바깥에 재생 바가 나타납니다. 조합논리 문제에는 재생 바가 없으며, Lab은 tick 모드를 사용합니다.
2. 속도 슬라이더는 초당 1~10 tick을 선택합니다. 가장 느린 설정은 1초에 한 tick입니다.
3. 실행 가능한 완성 회로는 소개 화면·초기화·복원 후 기본 자동 재생합니다. 편집·swap 중에는 잠시 정지하고 완료 후 재개하며 미완성·채점·결과·비활성 화면·백그라운드에서는 실행하지 않습니다. 직접 **일시정지**를 눌렀으면 같은 문제의 편집·복원 후에도 유지하고 **계속**으로 재개합니다. 재개 자체는 즉시 tick하지 않습니다.
4. 두 입력이 연결된 D를 짧게 클릭하거나 탭하면 D/EN 역할을 교환합니다. 도선 옆 글자 표식으로 확인합니다. 이동·길게 누르기는 swap하지 않습니다.
5. button INPUT은 클릭 즉시 켜지거나 꺼지며, 성공한 다음 tick이 끝나면 자동으로 꺼집니다.

별도의 다음 tick·실행·초기화·입력 설정·설명·예제·로컬 파일 조작 패널은 표시하지 않습니다.

## 평가와 시간 계약

기존 `engine.js`는 INPUT 값을 초기화하고 시작/끝 블록 ID로 adjacency를 만든 뒤 work queue를 반복했습니다. `computeBlock`은 아직 계산되지 않은 입력을 제외했고, 블록 수² 제한 이후 남은 값을 false로 표시했습니다. 화면 dirty 처리와 채점이 이 엔진 및 같은 회로의 `value`를 직접 사용했습니다.

새 `evaluation.js`는 다음을 분리합니다.

- `prepareCircuit`: 연결 검증과 위상 정렬. INPUT과 현재 D의 Q는 source입니다. D의 입력 간선은 다음 상태 계산에 보존하고 현재 조합 의존성에서는 제외합니다. 위상 계획은 캐시하며, 값·좌표가 아닌 구조 서명으로 직접 수정도 감지합니다. INPUT 변경과 tick은 adjacency/위상 순서를 다시 만들지 않습니다.
- `evaluateCombinational`: 입력 Map과 메모리 Map을 읽는 순수 계산. 시간과 입력 상태를 변경하지 않습니다.
- `evaluateCircuit`: 기존 호출부를 위한 표시 어댑터. dirty, 애니메이션, 반복 렌더링은 Q를 변경하지 않습니다.
- `tickCircuit`: `before = Eval(Q_t, X_t)` → 같은 before로 모든 Q_next 계산 → `after = Eval(Q_next, X_t)` → 성공 시 Q·tick·입력 snapshot·결과를 함께 적용합니다. 도선 길이/게이트 깊이는 tick 지연에 영향을 주지 않습니다.

실행 상태는 회로 객체와 별도의 WeakMap에 보관합니다. `memory`, `tick`, `currentInputs`, `lastTick`을 분리했습니다. 단일 D는 첫 입력 행에서 바로 저장하고, 직렬 D 두 개의 두 번째 D는 이전 첫 번째 D를 저장합니다. 초기 Q=1이 필요한 테스트는 `createExecutionState(circuit, { memory: { id: true } })`로 주입합니다.

button 입력은 클릭 즉시 토글되며 두 평가가 모두 성공한 tick 뒤에 꺼집니다. 화면의 OUTPUT은 button 해제까지 즉시 반영하며, 해당 tick에서 관측한 값은 lastTick에 보관합니다. 중간 조합 미리보기는 `lastTick.inputs/values`를 덮어쓰지 않습니다. 실패한 tick은 메모리·tick·입력·기존 블록값을 변경하지 않고 진단을 제공합니다. 편집 중 미완성/순환 회로는 `?`와 오류 문구로 표시합니다.

## 설계·편집·저장

D로 들어가는 각 도선에 `inputRole: "D" | "EN"`을 저장합니다. 역할이 도선 자체에 붙으므로 복사 시 새 wire/block ID를 발급해도 별도의 ID 참조를 복원할 필요가 없습니다. 첫 입력은 D, 두 번째 입력은 EN입니다. 삭제 후 남은 한 입력은 D로 정규화합니다. **로드/평가 시에는 역할을 추측하거나 손상된 배정을 자동 보정하지 않습니다.**

swap은 설계 Undo/Redo에 기록하지만 tick은 기록하지 않습니다. 기존 D의 실행 상태는 일반 편집으로 되감지 않으며, 새로 생성·복사된 D는 0입니다. 연결된 D나 그 입력 블록의 이동은 역할과 ID를 유지하여 빈 셀로 배선을 다시 찾습니다. 공간 제약을 만족할 수 없으면 원위치로 복구합니다. 기존 연결된 선택 영역 이동도 역할을 유지합니다. 코드에 회로 회전 기능은 존재하지 않아 새 회전 기능을 추가하지 않았습니다.

저장 버전은 **3**입니다. 기존 **v2** 설계/체험판 백업도 읽고, 다시 저장할 때 v3로 기록합니다. `snapshotCircuit`은 D와 일시적인 button 입력값을 false로 저장하며 Q와 tick을 저장하지 않습니다. switch 값 저장 정책은 유지했습니다. Drive 저장/공유, 커뮤니티 설계, Undo/Redo, 복사/붙여넣기와 로컬 Lab JSON이 같은 설계 속성을 보존합니다. 새 실행 세션 저장 시스템은 추가하지 않았습니다.

## 순차 채점 형식

현재 채점은 [회로 동등성 채점](EXHAUSTIVE_GRADING.md)을 사용합니다. 조합 정답은 전체 `{ inputs, expected }` 진리표, 순차 정답은 `{ mode: 'sequential', referenceId: '...' }`로 지정합니다. 회로를 숫자 배열로 컴파일하여 모든 입력 또는 도달 가능한 product state를 탐색하며, 실패 시 최소 tick 반례를 반환합니다. 예시 시퀀스는 설명용으로만 남습니다.

## 확인한 기존 규칙과 충돌

| 항목 | 적용한 계약 |
| --- | --- |
| AND / OR | 실행·채점은 정확히 2개 입력. 편집·저장 중 입력 부족 허용. 이전 위반 파일은 수정 가능 |
| NOT | 실행·채점은 정확히 1개 입력. 무입력 상수/다중 입력의 첫 입력 선택 의미는 사용하지 않음 |
| INPUT / OUTPUT / JUNCTION | IN 유입/OUT 유출 금지. OUTPUT/JUNCTION은 실행에 입력 1개 필요 |
| 분기·공간 | 기존 출력 fan-out과 직교·빈 중간 셀·교차 금지 조건 유지 |
| D | 유효 입력 1~2개만 실행 가능. 0개는 미완성, 3개 이상/손상된 역할은 오류 |
| 피드백 | D 자기 D/EN 연결을 포함해 모든 피드백이 D를 통과하면 허용. 안정점 유무와 관계없이 순수 조합 cycle은 오류 |

채점 버전 6의 편집 원자성, 저장 보존, 공간/진단 계약은 [회로 연결 규칙](connection-rules.md)을 참고한다. 삭제 후 역할 정규화는 그 삭제의 영향을 받은 D에만 적용하며 무관한 편집으로 잘못된 저장 역할을 수리하지 않는다.

## 핵심 파일

| 파일 | 역할 |
| --- | --- |
| `src/canvas/evaluation.js`, `engine.js` | 순수 위상 평가, 실행 상태, 원자적 tick, 기존 화면 API |
| `src/canvas/connections.js` | 공통 연결 검증, 입력 역할 추가/삭제/swap |
| `src/canvas/tickRunner.js` | 가변 속도 자동 실행 타이머, 정지/해제 |
| `src/canvas/controller.js`, `renderer.js`, `model.js` | D 생성, 클릭/터치, 배선 이동, 잠금, 편집 이력/복사, 역할/진단 표시 |
| `src/canvas/circuitData.js`, `src/demo/records.js` | v3 설계 snapshot, v2 호환, 체험판 범위 검증 |
| `src/modules/memoryControls.js`, `memoryExamples.js`, `labMode.js` | 캔버스 외부 재생 바, 속도/일시정지 UI, Lab 허용 목록 |
| `src/modules/circuitGrading.js`, `grading.js`, `problemEditor.js` | 독립 조합/순차 채점, 취소, 상태를 변경하지 않는 진리표 |
| `src/modules/circuitShare.js`, `circuitCommunity.js` | 설계 저장/복원/공유 경로 |
| `src/modules/grid.js`, `navigation.js`, `levels.js` | 이탈 정리, INPUT 메타데이터 전달 |

## 검증 결과 (2026-09-12)

- `npm test`: **32/32 통과**. 기존 10개 + 새 22개 테스트. 가변/무입력 게이트, 깊이가 다른 경로, 순서 변경, 위상 계획 재사용, D/D+EN, 직렬/상호/반전 피드백, swap/입력 증감, 저장 초기화, 명시적 오류와 원자성, button 펄스, snapshot 격리, 순차 채점/취소/예외, 수동/자동 동일성, v2/스테이지 범위 포함.
- `node scripts/verify-memory-browser.mjs` / `npm run test:memory:browser`: 실제 컨트롤러에서 마우스/터치, 드래그, Undo/Redo, 삭제 후 역할, 세 번째 입력 차단, 선택·복사·ID 재배정·붙여넣기, button 즉시 토글과 tick 후 해제, 재생 바의 캔버스 외부 배치, 1~10 tick/s 속도 변경, 일시정지·잠금·백그라운드 정리를 확인합니다.
- `npm run build:demo`: 체험판 빌드 통과. 기존 스테이지별 예산 유지.
- `npm run test:demo:browser`: 7개 스테이지 플레이·채점, 저장/복원, 한국어 터치·Undo/Redo·자동 복구·스토리지 거부·서비스워커 업그레이드, 한국어/영어 게이트·모바일 모달 확인. 외부 요청/누락 파일/page error 0.
- `npm run test:full:web`: 전체 웹 시작, 기존 25개 스테이지·계정·Lab 진입점 확인, page error 0.
- `npm run test:full:electron`: 숨겨진 창과 별도 테스트 프로필에서 기존 `app://bitwiser/index.html` 시작 확인. 기존 검증 스크립트가 허용하는 Google proxy 오류 2건은 그대로 기록되며, 그 외 오류 없음.
- `git diff --check` 및 변경 모듈 구문 검사 통과.

제한된 실행 환경에서는 Firebase CDN 로딩과 Electron GPU 시작이 실패했고, 동일 검증을 제한 밖에서 재실행하여 위 결과를 얻었습니다. 원격 push·배포·운영 DB 변경은 수행하지 않았습니다. 실제 Drive/커뮤니티 서비스에 저장하는 종단 검증, Electron 내부의 D 마우스/터치 조작, 실제 모바일 기기에서의 터치는 미확인입니다. 브라우저 터치는 Edge의 터치 에뮬레이션으로 검증했습니다. 스테이지 맵 Lab 노드의 포인터 클릭은 자동화하지 않았습니다.

브라우저 결과: `test-results/memory-browser.json`. 확인 화면: `test-results/memory-lab.png`. 원래 작업 중이던 체험판/웹/Electron 관련 수정·추가 파일은 유지했습니다.
