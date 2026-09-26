# 채점 결과 event trace

`circuitGrading.js`가 실패 결과에 명시적인 `trace`를 추가한다. `ok`, `status`,
`states`, `transitions`, `counterexample`, `inputs`, `expected`, `actual`은 유지한다.
현재 `GRADING_VERSION`은 5이다. 일반 memory20 19개의 사용자에게 보이는 초기/입력 변경/완료 tick 출력을 검사한다. legacy/Lab과 보존된 reference의 관측 의미는 유지한다.

## 사건과 시간 경계

- `init`: `memory: [{blockId, signal, value}]`와 선택적 `inputs` 벡터. 새 trace는 사용자 D와 입력을 모두 0으로 초기화하고 settle한다.
- `set`: `inputs: [{blockId, signal, value}]`. 벡터를 동시에 적용한 뒤 settle한다. 메모리/Q, reference 상태, tick, lastTick은 바뀌지 않는다.
- `expect`: `outputs: [{blockId, signal, actual, expected, passed}]`. 그 시점에 검사한 모든 출력과 `observation`을 담는다.
- 기존 `tick`: 현재 입력 snapshot으로 D/EN 계산 → 동시 commit → settle. 버튼을 임의로 해제하지 않는다.
- 새 `tick`: `tickMode: 'visible'`, `releaseInputs: [{blockId, signal, value:0}]`. 현재 입력 snapshot → D/EN 계산 → 동시 commit → 선언된 버튼 해제 → settle까지 한 사건이다. commit 직후·해제 전 중간 출력은 화면에 표시하거나 별도로 검사하지 않는다.

## 일반 memory20의 관측

[Issue #477](https://github.com/hyun090305/Bitwiser-dev/issues/477)에 따른 19개 reference는 `observationMode: 'visible'`을 선언한다. `step(state,input)`은 다음 상태를 반환하고 `observe(state,input)`은 현재 출력만 읽는다. 펄스/승인/저장 출력은 상태 키에 포함한다. GO=1인 응답 확인 상태와 pending이 같아도 초기 GO=0 상태를 합치지 않는다. 41·42의 초기 EMPTY는 1이다.

초기 입력·메모리 0에서 **INIT → EXPECT(initial)**, 각 도달 상태와 모든 입력에 대해 **SET → EXPECT(after_set) → TICK(visible) → EXPECT(after_tick)** 순서다. 실패 시 실패한 EXPECT까지만 기록한다. SET만으로 실패하면 그 단계에는 tick이 없다. 부모 경로의 성공한 관측도 포함하며 UI가 시점을 다시 추정하지 않는다.

해제 버튼은 25 LOAD, 28 ACK, 29 A/B, 30 OPEN, 32 INC/DEC, 34 START, 37 SUBMIT, 38 WRITE, 39 SAVE/UNDO, 40 SEND/TAKE, 41·42 PUSH/POP, 43 RECEIVE, 45 ADD/RESET이다. 제출 회로의 `inputMode` 대신 신뢰하는 reference가 정한다. 31·33·35·36·44도 관측하되 해제 목록은 비어 있다. 스위치는 샘플링한 값을 유지하며 해제는 다음 tick이 아니다.

입력만 바꾸면 저장 출력과 RISE·GO·DONE·VALID·ACCEPTED·승인 결과는 다음 실제 tick까지 유지된다. 33은 현재 칸과 현재 LEVEL을 비교하므로 LEVEL 변경을 즉시 반영한다. 38은 WRITE=0/1 모두에서 현재 ADDR의 기존 저장값을 읽는다. DATA/WRITE 변경은 쓰기가 아니며 실제 쓰기 tick 뒤에 새 값이 나타난다. 관측에서 계산한 임시 nextState는 버리고 실제 tick의 nextState만 탐색에 사용한다.

실패 `inputs`는 실제 관측 입력이다. 완료 tick 실패에는 `sampledInputs`도 있어 해제 전 샘플과 구분한다. `counterexample.ticks`는 실제 수행한 tick 입력들이며 SET 관측은 `observe`에 나타난다. `checks`에는 초기와 모든 SET/완료 tick이 포함되므로 정상 완료 시 `1 + 2 * transitions`다. 취소·시간·검사량 한도는 각 경계에서 적용한다.

## 기존 의미와의 구분

26 및 Lab/legacy의 기본 `before_tick`은 **SET → EXPECT → TICK**이다. 보존된 `memory20:C5-04` 등 기존 `after_tick`은 **SET → TICK → EXPECT**다. 기존 `evaluate(state,input)`의 출력 의미를 바꾸지 않는다. 46 나눗셈기는 고정 입력으로 TICK → EXPECT를 반복하며 첫 COMPLETE 전에 Q/R은 자유다. 조합 trace에는 INIT/TICK이 없다.

표식 없는 예전 TICK은 기존 엔진 의미를 유지한다. 예전 trace의 명시적 SET 버튼 해제와 `after_release`/`address_read` 레이블도 계속 재생할 수 있다. 새 trace만 `tickMode: 'visible'`로 자동 해제를 TICK 안에 포함한다.

## 표시와 재생

`counterexampleTrace.js`는 제공된 사건마다 카드를 만들고 `initial`, `after_set`, `after_tick`을 한영으로 구분한다. 복수 포트는 한 사건에 표시하며 긴 trace는 가로 스크롤한다. `gradingResultView.js`가 공통 결과 패널, header, 수정/재생 동작과 성공 화면의 비용/랭킹을 담당한다.

`tracePlayback.js`는 표시한 trace 배열을 순서대로 실행한다. visible TICK은 release 포트를 commit 전에 검증하며 엔진의 중간 표시를 끄고 버튼 해제 뒤 한 번 preview한다. SET과 EXPECT는 시간을 진행하지 않는다. 단일 신호 형태의 SET/EXPECT도 지원한다. 렌더러는 WeakMap의 현재 사건 강조를 읽는다.

수정, Escape, 화면 이동은 타이머를 취소하고 재생 전 입력/Q/tick/lastTick과 카메라를 복원한다. 회로 구조, undo history, 저장 기록은 재생이 변경하지 않는다.

## 검증

- `npm test`: 초기/SET/완료 tick, 네 추가 반례와 세 기존 반례, 19개 정상 회로, 펄스/EMPTY/33 LEVEL/38 WRITE=0·1, 숨은 프레임 미표시, 구형 trace, 매 경계 중단 복원, 관측 중 취소/한도, 버전 3/4 역사 보존.
- `npm run test:grading:browser`: 기존 두 관측 순서의 DOM/재생 일치, 모바일, 긴 반례 스크롤, focus, 취소와 한도.
- `npm run test:results:browser`: 실제 초기/SET/완료 tick 실패 카드·canvas·입력/출력의 일치, KO/EN 및 데스크톱/모바일, 완료 TICK 버튼 해제, runtime 복원, Stage 35, toolbar, 잘못된 연결과 조합 trace.
- `npm run test:cost:browser`: 성공 기록/비용/랭킹/데모 통합.
