# 채점 결과 event trace

`circuitGrading.js`가 실패 결과에 `trace`를 추가한다. 기존 `ok`, `status`,
`states`, `transitions`, `counterexample`, `inputs`, `expected`, `actual`은 유지한다.
현재 `GRADING_VERSION`은 버튼 해제 후 관측과 주소 메모리의 즉시 읽기를 반영한 4이다. legacy/Lab FSM의 관측 의미는 유지한다.

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

## 버튼 해제와 주소 읽기 관측

[Issue #477](https://github.com/hyun090305/Bitwiser-dev/issues/477)의 대상 15개는
기존 tick 직후 검사 뒤 **SET(buttons=0) → EXPECT**를 추가한다. 해제 대상은
25 LOAD, 28 ACK, 29 A/B, 30 OPEN, 32 INC/DEC/RESET, 33 RESET, 34 KICK,
37 SUBMIT, 38 WRITE, 39 SAVE/UNDO, 40 SEND/TAKE, 41·42 PUSH/POP,
43 RECEIVE, 45 ADD/RESET이다. 이 집합은 제출 회로의 `inputMode`가 아닌
신뢰하는 reference 정의에서 정한다.

해제 SET은 위 버튼을 동시에 0으로 만들고 모든 switch의 샘플링 값을 유지한다.
사용자와 reference의 갱신된 메모리는 그대로이며 별도 tick이나 상태 전이는 없다.
해제 후 모든 출력은 같은 tick 직후의 기대 출력과 같아야 한다. GO, VALID,
ACCEPTED, DONE의 한 tick 펄스도 버튼 해제만으로 사라지지 않는다.
다음 실제 tick에는 기존 규칙을 적용하며 매 tick 버튼을 다시 누를 수 있다.

38번은 초기 상태 및 각 도달 가능한 갱신 후 상태에서 WRITE=0으로 두고
D0/D1을 유지한 채 ADDR=0과 1을 각각 읽는다. **SET(ADDR) → EXPECT**만
추가하며 Q1Q0의 기대값은 reference의 저장 공간에서 직접 읽는다.
각 읽기는 탐색 상태에서 분기한 관측이고 이후 실제 tick의 상태를 바꾸지 않는다.

실패 결과와 EXPECT의 `observation`은 `after_tick`, `after_release`,
`address_read` 중 어느 검사에서 얻은 출력인지 명시한다. 실패한 검사까지
실제로 수행한 입력 벡터와 출력만 trace에 넣으며 해제/읽기에 TICK을 만들지 않는다.
26번 및 Lab/legacy의 `before_tick`, 버튼 없는 31·35·36·44번,
46번 나눗셈기에는 이 추가 정책을 적용하지 않는다.

## 표시와 재생

`counterexampleTrace.js`는 제공된 사건마다 하나의 카드를 시간순으로 만든다.
복수 입력/출력은 같은 사건 안에 표시하며, 긴 trace는 가로 스크롤한다.
`gradingResultView.js`는 공통 결과 패널, header, 수정/재생 동작을 담당한다.
성공 화면의 기존 비용/랭킹도 동일한 panel/header를 사용한다.

`tracePlayback.js`는 **표시한 바로 그 trace 배열**을 순서대로 실행한다.
tick은 `tickCircuit`에 명시적인 입력 snapshot을 전달한다. 버튼 해제와 주소
변경은 채점기가 기록한 SET에서만 적용하므로 trace 밖의 자동 해제 사건이나
추가 tick이 생기지 않는다. 단일 신호 형태의 SET/EXPECT도 지원한다.
화면 렌더러는 WeakMap에 저장된 현재 사건의 블록 강조만 읽는다.

재생 중에는 하단 패널 위의 회로 영역에 대상 블록을 보여준다. 수정, Escape,
화면 이동은 타이머를 취소하고 재생 전 입력/Q/tick/lastTick과 카메라를 복원한다.
회로 구조, undo history, 저장 기록은 재생이 변경하지 않는다.

## 검증

- `npm test`: 기존 FSM, tick 의미, 양쪽 관측 경계, 버튼 해제·주소 읽기,
  pulse, 상태 복원, 추가 관측 중 취소/한도.
- `npm run test:grading:browser`: 두 순서의 DOM 및 실제 재생 일치, 모바일,
  긴 반례 스크롤, 키보드 focus, 취소와 탐색 한도.
- `npm run test:results:browser`: 실제 Stage 35, canvas 실패 배지, toolbar,
  잘못된 연결 및 조합회로, 화면 이동 정리.
- `npm run test:cost:browser`: 기존 성공 기록/비용/랭킹/데모 통합.
