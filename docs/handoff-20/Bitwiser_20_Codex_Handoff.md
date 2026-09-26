# Bitwiser 메모리 20문제 개편 — Codex 구현 인계서

2026-09-26: 32/33/34는 [제어 스테이지 개편](../control-stages.md)에 따라 갱신했습니다. 아래 세 항목과 개별 spec/catalog/circuit/reference가 현재 규칙이며, 원본 HTML 뷰어는 2026-09-18 자료입니다.

2026-09-18 · 최종 기능 보존판 + COMPLETE 나눗셈기

## 전달할 작업

기존 메모리 20문제의 명세·힌트·기준 회로·채점 테스트를 이 패키지의 최종판으로 맞춘다. **전체 문제 수는 20개로 유지하며, ‘시간을 써서 곱하기 / 두 tick 곱셈기’ 자리에 ‘시간을 써서 나누기’를 넣는다.** 이미 있는 메모리 없는 2비트×2비트 조합 곱셈기 문제는 그대로 둔다.

이 인계서와 `Bitwiser_20_Codex_Handoff_Package.zip`을 함께 Codex에 첨부하면 된다. ZIP 안에도 이 인계서가 있으며, 아래 상대 경로는 ZIP을 푼 폴더를 기준으로 한다.

이 문서는 실제 게임 저장소에 이미 변경을 적용했다는 보고가 아니다. 적용할 결정을 정리하고 정답 회로를 첨부한 구현 인계 패키지다. 여기의 `C4-01`~`C5-10`을 실제 코드의 문제 ID·이름과 대조해 기존 20개 항목을 찾아 수정한다. 새로운 챕터 배치·해금 순서는 지시하지 않는다.

## 두 번의 변경을 구분하기

1. 최초 메모리 20문제 → 기능을 최대한 보존한 평면 기준판: 12개는 명세 그대로, 6개는 RESET만 제거, ABBA와 곱셈기는 동작 재설계. 평면 해답을 우선하므로 단순히 블록 수가 가장 작은 variant를 고르지 않았다.
2. 위 기준판 → 이번 최종판: **1~19번은 그대로 유지**한다. 20번의 `C5-10-auto` 29블록 두 tick 곱셈기만 `C5-10-divider-complete` 45블록 나눗셈기로 교체한다.

따라서 이번 최종판은 원본 유지 12개 + RESET만 제거 6개 + ABBA 재설계 1개 + 나눗셈기로 교체 1개다. 이전의 ‘20개 기능 보존판’에 아래 표를 덧붙이는 식으로 21번째 문제를 만들지 않는다.

## 최종 선택표

| 번호 | 교체 대상 | 문제 | 채택한 해답 variant | I/O 포함 블록 | 최초 원본 대비 변경 |
|---:|---|---|---|---:|---|
| 1 | `C4-01` | 저장 스위치 | `C4-01` | 4 | 문제 명세 유지 |
| 2 | `C4-02` | 변화 감지기 | `C4-02` | 6 | 문제 명세 유지 |
| 3 | `C4-03` | 고장 기록등 | `C4-03` | 5 | 문제 명세 유지 |
| 4 | `C4-04` | 튀는 버튼 | `C4-04` | 11 | 문제 명세 유지 |
| 5 | `C4-05` | 자동으로 닫히는 문 | `C4-05` | 7 | 문제 명세 유지 |
| 6 | `C4-06` | 양방향 카운터 | `up-down-counter-no-reset` | 26 | RESET 제거 |
| 7 | `C4-07` | 점등 시간 조절 | `light-timing` | 12 | RESET 제거, LEVEL/LIGHT 포트와 네 칸 패턴 |
| 8 | `C4-08` | 공평한 사용권 | `C4-08` | 13 | 문제 명세 유지 |
| 9 | `C4-09` | ABBA 잠금장치 — 한 글자씩 제출 | `C4-09-planar-core` | 13 | 입력 방식·패턴 판정 재설계, RESET 제거 |
| 10 | `C4-10` | 예약 타이머 | `delay-timer` | 28 | 0~3 tick 예약·설정 기억·START 우선 재예약 |
| 11 | `C5-01` | 누적 계산기 | `C5-01` | 22 | 문제 명세 유지 |
| 12 | `C5-02` | 주소로 저장하고 읽기 — 핵심판 | `C5-02-core` | 19 | RESET만 제거, 원래 모든 출력 유지 |
| 13 | `C5-03` | 한 번 되돌리기 — RESET만 제외 | `C5-03-noreset` | 20 | RESET만 제거, 원래 모든 출력 유지 |
| 14 | `C5-04` | 응답 확인 | `response-check` | 12 | 응답 기억·확인·소모로 교체 (#475) |
| 15 | `C5-05` | 한 줄로 수신하기 · RESET 제거 | `C5-05-status` | 21 | RESET만 제거, 원래 모든 출력 유지 |
| 16 | `C5-06` | 한 줄로 전송하기 | `C5-06` | 39 | 문제 명세 유지 |
| 17 | `C5-07` | 마지막에 넣은 것부터 · RESET만 제거 | `C5-07-status-full` | 29 | RESET만 제거, 원래 모든 출력 유지 |
| 18 | `C5-08` | 먼저 넣은 것부터 · RESET만 제거 | `C5-08-status-full` | 28 | RESET만 제거, 원래 모든 출력 유지 |
| 19 | `C5-09` | 수신 대기 우편함 — RESET만 제외 | `C5-09-noreset` | 16 | RESET만 제거, 원래 모든 출력 유지 |
| 20 | `C5-10` | 시간을 써서 나누기 | `C5-10-divider-complete` | 45 | 곱셈 → 나눗셈; A=0~7, B=1~3, Q·R·COMPLETE, 10 tick 특별 채점 |

INPUT·OUTPUT·AND·OR·NOT·D·D+EN 모두 블록당 비용 1. 도선·분기는 이 비용에 포함하지 않는다. 이 숫자는 발견한 해답의 크기이며 전역 최소값 또는 문제의 강제 블록 제한이 아니다.

## Codex가 읽을 파일

- `Bitwiser_20_Final_Stage_Specs.md`: 초기 상태·입출력·동시 요청·실패 요청·출력 시점까지 포함한 20개 최종 명세.
- `catalog.json`: 논리적 문제 ID, 이전/채택 variant, 입출력 변경, 해답 경로, 블록 수, 채점 방식의 기계 판독용 목록.
- `specs/C4-01.md`~`specs/C5-10.md`: 문제별 명세.
- `circuits/C4-01.json`~`circuits/C5-10.json`: **선택한 평면 정답 20개 전체**. 포인터나 이름만 있는 파일이 아니라 모든 게이트와 모든 핀 연결을 포함한다.
- `Bitwiser_20_Reference_Solutions.md`: 모든 해답의 읽기용 전체 연결식 및 구조 설명.
- `certificates/*.json`: 각 회로의 회전 순서와 교차 없는 정수 좌표. DATA·EN·피드백을 포함한 전체 연결 그래프의 인증.
- `reference.py`: 회로와 별도로 작성한 정수·리스트 기반 동작 모델, 나눗셈 special judge.
- `verification_runtime.py`, `verify.py`: 모든 도달 가능한 상태·입력을 검사하고 평면 좌표를 다시 검사하는 Python 표준 라이브러리 코드.
- `tests/acceptance_examples.json`: 실제 통합 테스트로 옮길 수 있는 입력·예상 출력 예제.
- `tests/exhaustive_transitions.json`: Python 검증에서 확인한 회로 상태·입력·다음 상태·출력 전이. `verify.py` 실행으로 다시 생성한다.
- `verification_summary.json`, `viewer_verification.json`: 검증 결과와 범위.
- `Bitwiser_20_Final_Answers.html`: 20개만 담은 오프라인 해답 뷰어. 교차 없는 그래프·핀 연결도·연결식·JSON 저장·tick 실행 제공.
- `verify_js.cjs`, `simulator.js`: 독립 JavaScript 실행기와 전체 전이 교차 검사. Node 표준 라이브러리만 사용한다.

JSON은 이 패키지의 중립적인 회로 포맷이다. 게임 고유의 저장 포맷으로 바로 불러올 수 있다고 가정하지 말고, 아래 핀 규칙을 보존하는 어댑터를 작성한다.

## 공통 엔진·채점 계약

- 허용하는 최종 부품은 INPUT·OUTPUT·AND·OR·NOT·D·DE다. DE는 **D+EN 한 블록**의 데이터 표현이며 `inputs[0]=DATA`, `inputs[1]=EN`이다. 핀 순서를 바꾸면 다른 회로가 된다.
- 모든 메모리 저장 비트는 새 실행과 각 독립 테스트에서 0이다. 초기 조합 출력까지 모두 0일 필요는 없다. 예를 들어 EMPTY는 처음부터 1이며 LIGHT는 현재 LEVEL을 반영한다.
- AND·OR는 2입력, NOT은 1입력, D는 DATA 하나, DE는 DATA·EN 두 입력이다. 공짜 상수·T·C·XOR·MUX·교차 블록을 추가하지 않는다. 이름이 `Q0`인 메모리와 `OUT_Q0`인 OUTPUT 노드는 별개다.
- **tick 처리 순서:** 그 tick의 입력 적용 → 이전 메모리 상태로 모든 DATA·EN 계산 → 모든 메모리 동시 갱신 → 같은 입력과 새 상태로 조합 출력을 다시 계산 → 채점. 배열 순서대로 메모리를 하나씩 갱신해서 뒤 메모리가 새 값을 읽게 하지 않는다.
- 1~19번 입력은 매 tick 바뀔 수 있고 모든 동시 요청 조합을 허용한다. 버튼 1이 연속이면 매 tick 요청이다. 20번만 한 테스트 동안 A·B를 고정한다.
- RESET을 제거한 문제도 실행 시작 시 0 초기화는 유지한다. RESET·ACK·KICK·LOAD 등 서로 다른 포트를 일괄 삭제하지 않는다.
- 1~19번은 매 tick 출력을 모두 비교한다. valid=0인 tick에도 명세에 적힌 DATA_OUT·SERIAL 등의 이전 값 유지 조건을 검사한다. 20번은 아래 완료 기반 채점으로 분리한다.
- 기존 엔진의 tick UI·테스트 runner가 이 순서와 같은지 먼저 확인한다. 시뮬레이터 전체의 관측 순서를 무작정 바꾸지 말고, 이 계약을 만족하는 단계와 API를 정한 뒤 기존 스테이지 회귀 테스트를 실행한다.

**시점에 민감한 예:** 변화 감지기는 첫 tick SIGNAL=1에서 RISE=1이다. 첨부 회로는 PREV와 PULSE 두 D를 써서 갱신 후 샘플에서도 이를 만족한다. WRITE+COMMIT은 이전 준비값을 공개하며, 송신 마지막 tick은 VALID=1·BUSY=0이어도 START를 받지 않는다.

## 나눗셈기 확정안

문제 이름은 **시간을 써서 나누기**. 입력 `A0,A1,A2,B0,B1`, 출력 `Q0,Q1,Q2,R0,R1,COMPLETE`. A는 0~7, B는 1~3. Q=⌊A/B⌋, R=A mod B. 한 테스트에 한 건을 처리하며 24가지 A·B를 모두 검사한다.

플레이어 안내 문구:

> 피제수 A를 제수 B로 나눈 몫과 나머지를 구하세요. A는 0~7, B는 1~3이며 계산 중에는 입력이 바뀌지 않습니다. 결과가 준비되면 COMPLETE를 1로 켜세요. 실행 후 10 tick 안에 처음 COMPLETE가 켜지는 순간, Q가 몫이고 R이 나머지여야 합니다. 각 테스트는 메모리가 0인 상태에서 새로 시작합니다.

채점 의사 코드는 다음과 같다. 실제 동작 코드는 `reference.py`의 `judge_divider`에 있다.

```python
for A in range(8):
    for B in range(1, 4):
        initialize_all_memories_to_zero()
        set_and_hold_inputs(A, B)
        for t in range(1, 11):
            update_all_memories_simultaneously()
            outputs = settle_and_read_outputs()
            if outputs.COMPLETE == 1:
                require(outputs.Q == A // B and outputs.R == A % B)
                break  # 첫 COMPLETE가 틀렸다면 즉시 실패
        else:
            fail("10 tick 이내 완료하지 않음")
```

tick 0에서는 채점하지 않는다. tick 10의 올바른 완료는 통과하고 11은 실패한다. Q·R이 먼저 맞아도 COMPLETE가 없으면 통과시키지 않는다. 완료 이후 유지·펄스 폭·다음 작업 접수·B=0 동작을 요구하지 않는다. **완료 전 Q·R은 미정이며 초기 Q·R을 모두 0으로 제한하지 않는다.**

첨부 해답은 45블록(입력 5 + 출력 6 + 메모리 8 + 논리 26), D 3개·D+EN 5개다. 첫 COMPLETE는 A+1 tick이며 최대 8 tick. **A+1 또는 8 tick을 채점 조건으로 사용하면 안 된다.** 기한은 10이고 그 이내의 다른 올바른 구현도 허용한다. 내부 알고리즘·메모리 사용·완료 펄스의 유지 형태를 구별하는 별도 조건은 추가하지 않는다.

기존 원본 곱셈기의 START·RESET·BUSY·DONE·Q3은 없어지고 A2·R0·R1·COMPLETE가 생긴다. B 범위는 0~3에서 1~3으로 줄며 Q 포트 의미는 4비트 곱에서 3비트 몫으로 바뀐다. 직전 기준판 `C5-10-auto`와 비교하면 A2·R0·R1·COMPLETE 추가, Q3 삭제이고 홀짝 tick의 반복 작업 접수 규칙도 종료된다.

## 문제별 변경과 선택 이유

### 1. 저장 스위치 — `C4-01`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `DATA`, `LOAD` → `DATA`, `LOAD`.

**출력:** `VALUE` → `VALUE`.

**채택 회로:** `C4-01`, 4블록. D+EN 한 개에 DATA와 LOAD를 직접 연결합니다. LOAD=0의 유지용 MUX를 별도 게이트로 만들지 않습니다.

**첨부:** [circuits/C4-01.json](circuits/C4-01.json) · [specs/C4-01.md](specs/C4-01.md) · [certificates/C4-01.json](certificates/C4-01.json)

### 2. 변화 감지기 — `C4-02`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `SIGNAL` → `SIGNAL`.

**출력:** `RISE` → `RISE`.

**채택 회로:** `C4-02`, 6블록. 이전 SIGNAL을 저장하는 D와 상승 사건을 저장하는 D를 따로 둡니다. 갱신 전 PREV로 사건을 계산하고 갱신 후 PULSE를 출력하여 첫 상승 tick을 보존합니다.

**첨부:** [circuits/C4-02.json](circuits/C4-02.json) · [specs/C4-02.md](specs/C4-02.md) · [certificates/C4-02.json](certificates/C4-02.json)

### 3. 고장 기록등 — `C4-03`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `FAULT`, `ACK` → `FAULT`, `ACK`.

**출력:** `ALARM` → `ALARM`.

**채택 회로:** `C4-03`, 5블록. EN=FAULT OR ACK, DATA=FAULT인 D+EN을 사용합니다. FAULT와 ACK가 동시에 1이면 고장을 기록합니다.

**첨부:** [circuits/C4-03.json](circuits/C4-03.json) · [specs/C4-03.md](specs/C4-03.md) · [certificates/C4-03.json](certificates/C4-03.json)

### 4. 튀는 버튼 — `C4-04`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `RAW` → `RAW`.

**출력:** `CLEAN` → `CLEAN`.

**채택 회로:** `C4-04`, 11블록. 최근 두 RAW와 CLEAN을 세 D에 보관하고 세 샘플의 일치 여부로 CLEAN을 갱신합니다.

**첨부:** [circuits/C4-04.json](circuits/C4-04.json) · [specs/C4-04.md](specs/C4-04.md) · [certificates/C4-04.json](certificates/C4-04.json)

### 5. 자동으로 닫히는 문 — `C4-05`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `OPEN` → `OPEN`.

**출력:** `DOOR` → `DOOR`.

**채택 회로:** `C4-05`, 7블록. 세 D에 최근 OPEN을 지연 저장하고 OR합니다. 요청 tick을 포함한 3 tick 열림을 구현합니다.

**첨부:** [circuits/C4-05.json](circuits/C4-05.json) · [specs/C4-05.md](specs/C4-05.md) · [certificates/C4-05.json](certificates/C4-05.json)

### 6. 양방향 카운터 — `C4-06`

**변경:** RESET 제거.

**입력:** INC, DEC. **출력:** BIT0, BIT1.

**채택 회로:** `up-down-counter-no-reset`, 26블록. 두 D+EN의 반전 조건은 유지하고 RESET 데이터·허용 경로를 제거합니다.

**첨부:** [회로](circuits/C4-06.json) · [현재 명세](specs/C4-06.md) · [평면 인증](certificates/C4-06.json)

### 7. 점등 시간 조절 — `C4-07`

**변경:** RESET 제거, LEVEL/LIGHT 포트와 네 칸 패턴.

**입력:** LEVEL0, LEVEL1. **출력:** LIGHT.

**채택 회로:** `light-timing`, 12블록. Gray 상태 00→10→11→01은 tick마다 진행합니다. 현재 LEVEL에 따른 출력은 조합 비교이며 입력 변경은 상태를 진행시키지 않습니다.

**첨부:** [회로](circuits/C4-07.json) · [현재 명세](specs/C4-07.md) · [평면 인증](certificates/C4-07.json)

### 8. 공평한 사용권 — `C4-08`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `REQ_A`, `REQ_B` → `REQ_A`, `REQ_B`.

**출력:** `A_OK`, `B_OK` → `A_OK`, `B_OK`.

**채택 회로:** `C4-08`, 13블록. D+EN에 마지막 승인자를, D에 이번 tick의 요청 유무를 기억해 승인 출력을 복원합니다. 요청이 없으면 마지막 승인자는 유지합니다.

**첨부:** [circuits/C4-08.json](circuits/C4-08.json) · [specs/C4-08.md](specs/C4-08.md) · [certificates/C4-08.json](certificates/C4-08.json)

### 9. ABBA 잠금장치 — 한 글자씩 제출 — `C4-09`

**최초 원본 대비:** 입력 방식·패턴 판정 재설계, RESET 제거.

**입력:** `A`, `B`, `RESET` → `SIGNAL`, `SUBMIT`.

**출력:** `UNLOCKED` → `UNLOCKED`.

**채택 회로:** `C4-09-planar-core`, 13블록. SUBMIT을 EN으로 쓰는 세 비트 이력과 열린 상태를 저장하는 D+EN을 사용합니다. 대기는 보존하지만 오입력 시 진행을 모두 버리는 규칙은 최근 네 글자 검사로 바뀝니다.

A=1·B=0인 SIGNAL과 SUBMIT으로 변경한다. SUBMIT=0의 대기와 열린 상태 유지는 보존한다. AABBA도 마지막 네 글자가 ABBA이므로 열린다. 매 tick 무조건 읽는 strict-stream판을 선택한 것이 아니다.

**첨부:** [circuits/C4-09.json](circuits/C4-09.json) · [specs/C4-09.md](specs/C4-09.md) · [certificates/C4-09.json](certificates/C4-09.json)

### 10. 예약 타이머 — `C4-10`

**변경:** 0~3 tick 예약·설정 기억·START 우선 재예약.

**입력:** TIME0, TIME1, START. **출력:** DONE.

**채택 회로:** `delay-timer`, 28블록. START는 두 D에 TIME을 저장하고 ACTIVE를 켭니다. 카운터는 매 tick mod-4 감소합니다. ACTIVE는 남은 값이 0인 완료 tick까지 유지하고 다음 tick에 끕니다. DONE=ACTIVE AND NOT(R0 OR R1). 비활성 중 카운터 위상은 관측되지 않습니다.

**첨부:** [회로](circuits/C4-10.json) · [현재 명세](specs/C4-10.md) · [평면 인증](certificates/C4-10.json)

### 11. 누적 계산기 — `C5-01`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `D0`, `D1`, `ADD`, `RESET` → `D0`, `D1`, `ADD`, `RESET`.

**출력:** `Q0`, `Q1` → `Q0`, `Q1`.

**채택 회로:** `C5-01`, 22블록. 두 D+EN에 NOT(Q)와 비트별 반전 조건을 연결하여 mod 4 덧셈을 구현합니다. RESET 입력을 보존합니다.

**첨부:** [circuits/C5-01.json](circuits/C5-01.json) · [specs/C5-01.md](specs/C5-01.md) · [certificates/C5-01.json](certificates/C5-01.json)

### 12. 주소로 저장하고 읽기 — 핵심판 — `C5-02`

**최초 원본 대비:** RESET만 제거, 원래 모든 출력 유지.

**입력:** `D0`, `D1`, `ADDR`, `WRITE`, `RESET` → `D0`, `D1`, `ADDR`, `WRITE`.

**출력:** `Q0`, `Q1` → `Q0`, `Q1`.

**채택 회로:** `C5-02-core`, 19블록. 주소별로 EN을 만든 네 D+EN과 주소 읽기 선택 논리를 사용합니다. 두 2비트 저장 공간과 현재 주소의 조합 읽기를 보존합니다.

**첨부:** [circuits/C5-02.json](circuits/C5-02.json) · [specs/C5-02.md](specs/C5-02.md) · [certificates/C5-02.json](certificates/C5-02.json)

### 13. 한 번 되돌리기 — RESET만 제외 — `C5-03`

**최초 원본 대비:** RESET만 제거, 원래 모든 출력 유지.

**입력:** `D0`, `D1`, `SAVE`, `UNDO`, `RESET` → `D0`, `D1`, `SAVE`, `UNDO`.

**출력:** `Q0`, `Q1`, `UNDO_AVAILABLE` → `Q0`, `Q1`, `UNDO_AVAILABLE`.

**채택 회로:** `C5-03-noreset`, 20블록. 현재 값·백업 값의 네 D+EN과 UNDO_AVAILABLE용 D+EN을 모두 유지합니다. 플래그를 없앤 18블록 핵심판 대신 20블록 상태 출력 보존판을 채택합니다.

**첨부:** [circuits/C5-03.json](circuits/C5-03.json) · [specs/C5-03.md](specs/C5-03.md) · [certificates/C5-03.json](certificates/C5-03.json)

### 14. 응답 확인 — `C5-04`

**최초 원본 대비:** 응답을 무기한 기억하고 확인에 사용한 기록을 소모하는 문제로 교체.

**입력:** Button `A`, `B`. 2026-09-24 이슈 #475에 따라 두 응답의 기억·확인·소모 문제로 교체했습니다.

**출력:** `GO` (after_tick).

**기준 회로:** `response-check`, 12블록. 두 응답 기록과 GO 출력을 저장하는 D 3개를 사용합니다. 출력은 `GO` (after_tick)이며 최소 비용이나 필수 D 개수는 아닙니다. 이전 준비/공개 회로는 저장 호환용으로 보존합니다.

**첨부:** [circuits/C5-04.json](circuits/C5-04.json) · [specs/C5-04.md](specs/C5-04.md) · [certificates/C5-04.json](certificates/C5-04.json)

### 15. 한 줄로 수신하기 · RESET 제거 — `C5-05`

**최초 원본 대비:** RESET만 제거, 원래 모든 출력 유지.

**입력:** `DATA`, `RECEIVE`, `RESET` → `DATA`, `RECEIVE`.

**출력:** `Q0`, `Q1`, `Q2`, `Q3`, `DONE` → `Q0`, `Q1`, `Q2`, `Q3`, `DONE`.

**채택 회로:** `C5-05-status`, 21블록. 수신 이력·Johnson 진행 상태·완성 단어를 D+EN에 저장하며 DONE용 D를 유지합니다. DONE 없는 19블록판 대신 21블록판을 채택합니다.

**첨부:** [circuits/C5-05.json](circuits/C5-05.json) · [specs/C5-05.md](specs/C5-05.md) · [certificates/C5-05.json](certificates/C5-05.json)

### 16. 한 줄로 전송하기 — `C5-06`

**최초 원본 대비:** 문제 명세 유지.

**입력:** `D0`, `D1`, `D2`, `D3`, `START`, `RESET` → `D0`, `D1`, `D2`, `D3`, `START`, `RESET`.

**출력:** `SERIAL`, `VALID`, `BUSY` → `SERIAL`, `VALID`, `BUSY`.

**채택 회로:** `C5-06`, 39블록. 세 단계 진행 상태를 한 단계씩 이동시키는 39블록 평면 회로입니다. 28블록 핵심판이나 RESET 없는 31블록판 대신 RESET·VALID·BUSY를 모두 보존합니다.

**첨부:** [circuits/C5-06.json](circuits/C5-06.json) · [specs/C5-06.md](specs/C5-06.md) · [certificates/C5-06.json](certificates/C5-06.json)

### 17. 마지막에 넣은 것부터 · RESET만 제거 — `C5-07`

**최초 원본 대비:** RESET만 제거, 원래 모든 출력 유지.

**입력:** `DATA`, `PUSH`, `POP`, `RESET` → `DATA`, `PUSH`, `POP`.

**출력:** `DATA_OUT`, `VALID`, `EMPTY`, `FULL` → `DATA_OUT`, `VALID`, `EMPTY`, `FULL`.

**채택 회로:** `C5-07-status-full`, 29블록. 두 데이터 슬롯·NONEMPTY·FULL·마지막 POP 값·POP 성공 상태를 사용합니다. DATA_OUT만 남긴 24블록 평면 핵심판 대신 모든 상태 출력을 유지한 29블록판을 채택합니다.

용량 2, POP 먼저 처리 후 PUSH, 빈 상태 동시 요청은 PUSH만 성공, 가득 찬 상태 동시 요청은 둘 다 성공, 실패 POP 시 DATA_OUT 유지, EMPTY·FULL은 처리 후 상태라는 규칙을 모두 보존한다.

**첨부:** [circuits/C5-07.json](circuits/C5-07.json) · [specs/C5-07.md](specs/C5-07.md) · [certificates/C5-07.json](certificates/C5-07.json)

### 18. 먼저 넣은 것부터 · RESET만 제거 — `C5-08`

**최초 원본 대비:** RESET만 제거, 원래 모든 출력 유지.

**입력:** `DATA`, `PUSH`, `POP`, `RESET` → `DATA`, `PUSH`, `POP`.

**출력:** `DATA_OUT`, `VALID`, `EMPTY`, `FULL` → `DATA_OUT`, `VALID`, `EMPTY`, `FULL`.

**채택 회로:** `C5-08-status-full`, 28블록. 두 데이터 슬롯과 점유 상태를 갱신하며 먼저 들어온 데이터를 POP합니다. DATA_OUT만 남긴 23블록 평면 핵심판 대신 모든 상태 출력을 유지한 28블록판을 채택합니다.

용량 2, POP 먼저 처리 후 PUSH, 빈 상태 동시 요청은 PUSH만 성공, 가득 찬 상태 동시 요청은 둘 다 성공, 실패 POP 시 DATA_OUT 유지, EMPTY·FULL은 처리 후 상태라는 규칙을 모두 보존한다.

**첨부:** [circuits/C5-08.json](circuits/C5-08.json) · [specs/C5-08.md](specs/C5-08.md) · [certificates/C5-08.json](certificates/C5-08.json)

### 19. 수신 대기 우편함 — RESET만 제외 — `C5-09`

**최초 원본 대비:** RESET만 제거, 원래 모든 출력 유지.

**입력:** `DATA`, `SEND`, `TAKE`, `RESET` → `DATA`, `SEND`, `TAKE`.

**출력:** `FULL`, `DATA_OUT`, `VALID`, `ACCEPTED` → `FULL`, `DATA_OUT`, `VALID`, `ACCEPTED`.

**채택 회로:** `C5-09-noreset`, 16블록. 페이로드·점유·전달값·수신 성공·송신 성공을 저장합니다. DATA_OUT만 남긴 11블록판 대신 모든 상태 출력을 유지한 16블록판을 채택합니다.

**첨부:** [circuits/C5-09.json](circuits/C5-09.json) · [specs/C5-09.md](specs/C5-09.md) · [certificates/C5-09.json](certificates/C5-09.json)

### 20. 시간을 써서 나누기 — `C5-10`

**최초 원본 대비:** 곱셈 → 나눗셈; A=0~7, B=1~3, Q·R·COMPLETE, 10 tick 특별 채점.

**입력:** `A0`, `A1`, `B0`, `B1`, `START`, `RESET` → `A0`, `A1`, `A2`, `B0`, `B1`.

**출력:** `Q0`, `Q1`, `Q2`, `Q3`, `BUSY`, `DONE` → `Q0`, `Q1`, `Q2`, `R0`, `R1`, `COMPLETE`.

**채택 회로:** `C5-10-divider-complete`, 45블록. 최초 tick 준비 뒤 단위 수를 세며 몫과 나머지를 누적합니다. 45블록, D 3개와 D+EN 5개입니다. 이 해답은 A+1 tick에 처음 완료하지만 문제는 10 tick 이내의 모든 올바른 완료 시점을 허용합니다.

**첨부:** [circuits/C5-10.json](circuits/C5-10.json) · [specs/C5-10.md](specs/C5-10.md) · [certificates/C5-10.json](certificates/C5-10.json)

## 적용 순서와 통합 확인

1. 저장소에서 기존 20개의 실제 ID, 명세, 입출력 배치, 정답/예제 회로, 채점 함수를 찾는다. `catalog.json`의 논리 ID·문제 이름과 대응표를 만든다.
2. 공통 D/DE 핀 순서·초기화·동시 갱신·출력 샘플 시점을 대조한다. 기준 회로 중 변화 감지기와 이중 버퍼의 예제로 한 tick 어긋남을 먼저 확인한다.
3. 표의 정확한 포트 변경을 적용한다. 특히 Stack·Queue·Mailbox·Undo·수신기·송신기의 상태 출력을 핵심판으로 잘못 축소하지 않는다. ABBA는 구 문제의 테스트를 그대로 재사용할 수 없다.
4. 곱셈기 한 슬롯을 나눗셈기로 교체하고 10 tick special judge 및 24개 테스트를 연결한다. 이전 곱셈기 명세·힌트·예제·정답·완료 시점 검사를 함께 교체한다. 별도 조합 곱셈기 문제는 수정하지 않는다.
5. 첨부한 20개 회로를 게임 포맷으로 변환한다. 고정 단자·블록 포트·격자 크기·회전 제한이 있다면 실제 보드에서 배선하고 실행한다. 이 패키지의 정수 좌표는 위상적 평면성 증거이며 게임 격자에 바로 맞춘 저장 파일은 아니다.
6. 독립 검증과 게임 내 테스트를 모두 실행한다. 아래 명령은 첨부된 수학 모델/회로를 재검증하며 실제 게임 통합 검증을 대체하지 않는다. 비용 제한이 있다면 기준 회로의 실제 개수가 수용되는지 확인한다.
7. 기존 플레이어 저장 데이터가 있다면 제거된 포트와 교체된 문제의 호환성을 확인하고 프로젝트의 기존 마이그레이션 방식에 맞춘다. 진행 기록의 의미를 임의로 재해석하거나 기존 설계를 조용히 덮어쓰지 않는다.

```sh
python3 verify.py
node verify_js.cjs
```

두 명령은 패키지 루트에서 실행한다. Python 3.10+와 Node가 있으면 외부 패키지 설치 없이 실행된다. 동작 확인용 `verify_ui.cjs`만 추가로 `linkedom`이 필요하며, 일반 회로 검증의 필수 의존성은 아니다.

## 확인된 검증과 남은 범위

20/20 회로가 명세를 통과하고 교차 없는 정수 좌표를 가진다. 1~19번은 독립적인 정수·리스트 기준 모델과 회로 상태의 모든 도달 가능한 조합에 대해 모든 입력을 검사했다: **5,674개 전이**. 나눗셈기는 **24가지 입력, 첫 완료까지 108 tick**, 최대 8 tick을 검사했다. 특별 채점은 1~10 tick 성공·11 tick 실패·잘못된 첫 완료·미완료·제수 범위의 **14개 경계 검사**를 통과했다.

JavaScript 실행기도 Python이 검증한 5,782개 전이와 비교했다. HTML의 문제 선택·예제·평면/핀 연결도·나눗셈 완료 처리는 DOM 실행 검사로 확인했다. 실제 브라우저 픽셀 렌더링이나 게임 보드 배선까지 검증했다는 뜻은 아니다.

평면성은 모든 INPUT·OUTPUT·게이트·메모리를 정점으로, DATA·EN·피드백을 포함한 도선을 간선으로 하는 전체 그래프 기준이다. 방향은 버리고 자기 루프와 같은 두 정점 사이 중복 간선은 위상 판정에서 묶는다. 단자 위치와 각 블록의 포트 순서는 자유롭다고 가정한다. 게이트 수의 전역 최소성, 고정 보드 배치, 물리 지연, 실제 게임 엔진 동작은 별도 확인 대상이다.

근거 자료: `Bitwiser_20_Planar_Stage_Specs.md`의 기능 보존 선택, `Bitwiser_DE_All_Stages`의 실제 평면 회로, `Bitwiser_Divider_6_Versions`의 45블록 `small_complete`. 이번 패키지에는 이 중 최종 선택한 20개만 포함한다.
