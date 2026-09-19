# 채점 결과 event trace

`circuitGrading.js`가 실패 결과에 `trace`를 추가한다. 기존 `ok`, `status`,
`states`, `transitions`, `counterexample`, `inputs`, `expected`, `actual`은 유지한다.
현재 `GRADING_VERSION`은 메모리 최종판을 반영한 3이다. legacy/Lab FSM의 관측 의미는 유지한다.

## 사건과 시간 경계

- `init`: `memory: [{blockId, signal, value}]`. 사용자 D의 초기 Q는 0이다.
- `set`: `inputs: [{blockId, signal, value}]`. 입력 벡터를 동시에 적용한 후
  조합논리를 settle한다. Q는 바뀌지 않는다.
- `expect`: `outputs: [{blockId, signal, actual, expected, passed}]`.
  해당 시점에 검사한 모든 출력을 담는다.
- `tick`: 기존 엔진의 next-state snapshot → simultaneous commit → settle.

기본 관측을 사용하는 legacy/Lab FSM은 **SET → EXPECT → TICK**이다.
실패 시에는 검사에서 멈추므로 실행하지 않은 tick은 trace에 넣지 않는다.
최단 반례의 부모 경로에는 성공했던 관측도 포함한다. 부모 경로의 출력은
탐색 중 실제 관측한 값을 저장하며, UI가 입력 목록에서 관측 시점을 만들지 않는다.

새 reference가 `observeAt: 'after_tick'`을 명시하면 **SET → TICK → EXPECT**를
사용한다. 이 경우 `reference.evaluate(state, input).outputs`는 commit 후의
기대 출력이며, `nextState`는 한 번의 tick 후 reference 상태다. 생략 시 기존의
`before_tick`이다. 최종 메모리 1~19번은 `after_tick`을 사용한다. 나눗셈기는 입력을 고정한 채 TICK → EXPECT를 반복하고, 완료 전에는 COMPLETE만 검사하며 첫 완료에서 Q/R을 함께 검사한다.

## 표시와 재생

`counterexampleTrace.js`는 제공된 사건마다 하나의 카드를 시간순으로 만든다.
복수 입력/출력은 같은 사건 안에 표시하며, 긴 trace는 가로 스크롤한다.
`gradingResultView.js`는 공통 결과 패널, header, 수정/재생 동작을 담당한다.
성공 화면의 기존 비용/랭킹도 동일한 panel/header를 사용한다.

`tracePlayback.js`는 **표시한 바로 그 trace 배열**을 순서대로 실행한다.
tick은 `tickCircuit`에 명시적인 입력 snapshot을 전달한다. 따라서 FSM에 없는
버튼 자동 해제 사건이 생기지 않는다. 단일 신호 형태의 SET/EXPECT도 지원한다.
화면 렌더러는 WeakMap에 저장된 현재 사건의 블록 강조만 읽는다.

재생 중에는 하단 패널 위의 회로 영역에 대상 블록을 보여준다. 수정, Escape,
화면 이동은 타이머를 취소하고 재생 전 입력/Q/tick/lastTick과 카메라를 복원한다.
회로 구조, undo history, 저장 기록은 재생이 변경하지 않는다.

## 검증

- `npm test`: 기존 FSM, tick 의미, 양쪽 관측 경계, pulse, 상태 복원.
- `npm run test:grading:browser`: 두 순서의 DOM 및 실제 재생 일치, 모바일,
  긴 반례 스크롤, 키보드 focus, 취소와 탐색 한도.
- `npm run test:results:browser`: 실제 Stage 35, canvas 실패 배지, toolbar,
  잘못된 연결 및 조합회로, 화면 이동 정리.
- `npm run test:cost:browser`: 기존 성공 기록/비용/랭킹/데모 통합.
