# Bitwiser 최종 20문제 — 전체 평면 정답 연결식

아래 회로는 해당 명세의 한 가지 정답이다. 최저 블록 수 증명은 아니다. 모든 INPUT·OUTPUT도 비용 1이고 DE는 D+EN 한 블록이다. 게이트 이름은 임의 이름이며 DATA·EN은 배열의 첫째·둘째 핀이다.

메모리 표기 `q <- DE(data, enable)`의 우변은 전부 tick 직전 상태로 계산한다. 모든 메모리를 동시에 갱신한 뒤 출력 조합 논리를 다시 평가한다. 코드처럼 위에서 아래로 메모리를 즉시 대입하는 의미가 아니다. 이 연결식은 입력·출력까지 모든 노드를 포함한다.

## 1. 저장 스위치 — C4-01

4블록 · 내부 1 · D 0 · D+EN 1. D+EN 한 개에 DATA와 LOAD를 직접 연결합니다. LOAD=0의 유지용 MUX를 별도 게이트로 만들지 않습니다.

입력 `DATA`, `LOAD`. 출력 `VALUE`. 전체 노드 수: 4.

```text
DATA = INPUT
LOAD = INPUT
Q <- DE(DATA, LOAD)  # initial=0
OUT_VALUE = OUTPUT(Q)  # port: VALUE
```

## 2. 변화 감지기 — C4-02

6블록 · 내부 4 · D 2 · D+EN 0. 이전 SIGNAL을 저장하는 D와 상승 사건을 저장하는 D를 따로 둡니다. 갱신 전 PREV로 사건을 계산하고 갱신 후 PULSE를 출력하여 첫 상승 tick을 보존합니다.

입력 `SIGNAL`. 출력 `RISE`. 전체 노드 수: 6.

```text
SIGNAL = INPUT
PREV <- D(SIGNAL)  # initial=0
PULSE <- D(g2)  # initial=0
g1 = NOT(PREV)
g2 = AND(SIGNAL, g1)
OUT_RISE = OUTPUT(PULSE)  # port: RISE
```

## 3. 고장 기록등 — C4-03

5블록 · 내부 2 · D 0 · D+EN 1. EN=FAULT OR ACK, DATA=FAULT인 D+EN을 사용합니다. FAULT와 ACK가 동시에 1이면 고장을 기록합니다.

입력 `FAULT`, `ACK`. 출력 `ALARM`. 전체 노드 수: 5.

```text
FAULT = INPUT
ACK = INPUT
LATCH <- DE(FAULT, g1)  # initial=0
g1 = OR(ACK, FAULT)
OUT_ALARM = OUTPUT(LATCH)  # port: ALARM
```

## 4. 튀는 버튼 — C4-04

11블록 · 내부 9 · D 3 · D+EN 0. 최근 두 RAW와 CLEAN을 세 D에 보관하고 세 샘플의 일치 여부로 CLEAN을 갱신합니다.

입력 `RAW`. 출력 `CLEAN`. 전체 노드 수: 11.

```text
RAW = INPUT
HISTORY1 <- D(RAW)  # initial=0
HISTORY2 <- D(HISTORY1)  # initial=0
STABLE <- D(g6)  # initial=0
g1 = AND(HISTORY1, HISTORY2)
g2 = AND(RAW, g1)
g3 = OR(HISTORY1, HISTORY2)
g4 = OR(RAW, g3)
g5 = AND(STABLE, g4)
g6 = OR(g2, g5)
OUT_CLEAN = OUTPUT(STABLE)  # port: CLEAN
```

## 5. 자동으로 닫히는 문 — C4-05

7블록 · 내부 5 · D 3 · D+EN 0. 세 D에 최근 OPEN을 지연 저장하고 OR합니다. 요청 tick을 포함한 3 tick 열림을 구현합니다.

입력 `OPEN`. 출력 `DOOR`. 전체 노드 수: 7.

```text
OPEN = INPUT
RECENT0 <- D(OPEN)  # initial=0
RECENT1 <- D(RECENT0)  # initial=0
RECENT2 <- D(RECENT1)  # initial=0
g1 = OR(RECENT0, RECENT1)
g2 = OR(RECENT2, g1)
OUT_DOOR = OUTPUT(g2)  # port: DOOR
```

## 6. 양방향 카운터 — C4-06

32블록 · 내부 27 · D 0 · D+EN 2. 두 D+EN으로 비트별 반전 조건을 구현합니다. 같은 명세의 22블록 비평면 후보 대신 게이트 공유를 줄인 32블록 평면 회로를 채택합니다. RESET도 유지합니다.

입력 `INC`, `DEC`, `RESET`. 출력 `BIT0`, `BIT1`. 전체 노드 수: 32.

```text
INC = INPUT
DEC = INPUT
RESET = INPUT
COUNT0 <- DE(g3, g12)  # initial=0
COUNT1 <- DE(g14, g25)  # initial=0
g1 = NOT(COUNT0)
g2 = NOT(RESET)
g3 = AND(g1, g2)
g4 = AND(DEC, INC)
g5 = NOT(g4)
g6 = AND(DEC, g5)
g7 = NOT(g6)
g8 = AND(INC, g5)
g9 = NOT(g8)
g10 = AND(g7, g9)
g11 = NOT(g10)
g12 = OR(RESET, g11)
g13 = NOT(COUNT1)
g14 = AND(g13, g2)
g15 = AND(COUNT0, INC)
g16 = NOT(g15)
g17 = AND(COUNT0, g16)
g18 = NOT(g17)
g19 = AND(INC, g16)
g20 = NOT(g19)
g21 = AND(g18, g20)
g22 = NOT(g21)
g23 = NOT(g22)
g24 = AND(g11, g23)
g25 = OR(RESET, g24)
OUT_BIT0 = OUTPUT(COUNT0)  # port: BIT0
OUT_BIT1 = OUTPUT(COUNT1)  # port: BIT1
```

## 7. 네 단계 밝기 — C4-07

16블록 · 내부 12 · D 2 · D+EN 0. 두 D의 Gray 위상 순환과 출력 비교식을 사용합니다. 외부에서 정의한 위상 0→1→2→3과 RESET 동작은 같습니다.

입력 `DUTY0`, `DUTY1`, `RESET`. 출력 `PWM`. 전체 노드 수: 16.

```text
DUTY0 = INPUT
DUTY1 = INPUT
RESET = INPUT
GRAY0 <- D(g3)  # initial=0
GRAY1 <- D(g4)  # initial=0
g1 = NOT(GRAY1)
g2 = NOT(RESET)
g3 = AND(g1, g2)
g4 = AND(GRAY0, g2)
g5 = NOT(GRAY0)
g6 = AND(DUTY0, g5)
g7 = OR(DUTY1, g6)
g8 = AND(DUTY0, GRAY0)
g9 = OR(g1, g8)
g10 = AND(g7, g9)
OUT_PWM = OUTPUT(g10)  # port: PWM
```

## 8. 공평한 사용권 — C4-08

13블록 · 내부 9 · D 1 · D+EN 1. D+EN에 마지막 승인자를, D에 이번 tick의 요청 유무를 기억해 승인 출력을 복원합니다. 요청이 없으면 마지막 승인자는 유지합니다.

입력 `REQ_A`, `REQ_B`. 출력 `A_OK`, `B_OK`. 전체 노드 수: 13.

```text
REQ_A = INPUT
REQ_B = INPUT
LAST_A <- DE(g3, g4)  # initial=0
ANY_REQUEST <- D(g4)  # initial=0
g1 = AND(LAST_A, REQ_B)
g2 = NOT(g1)
g3 = AND(REQ_A, g2)
g4 = OR(REQ_A, REQ_B)
g5 = AND(ANY_REQUEST, LAST_A)
OUT_A_OK = OUTPUT(g5)  # port: A_OK
g6 = NOT(LAST_A)
g7 = AND(ANY_REQUEST, g6)
OUT_B_OK = OUTPUT(g7)  # port: B_OK
```

## 9. ABBA 잠금장치 — 한 글자씩 제출 — C4-09

13블록 · 내부 10 · D 0 · D+EN 4. SUBMIT을 EN으로 쓰는 세 비트 이력과 열린 상태를 저장하는 D+EN을 사용합니다. 대기는 보존하지만 오입력 시 진행을 모두 버리는 규칙은 최근 네 글자 검사로 바뀝니다.

입력 `SIGNAL`, `SUBMIT`. 출력 `UNLOCKED`. 전체 노드 수: 13.

```text
SIGNAL = INPUT
SUBMIT = INPUT
PREVIOUS1 <- DE(SIGNAL, SUBMIT)  # initial=0
PREVIOUS2 <- DE(PREVIOUS1, SUBMIT)  # initial=0
PREVIOUS3 <- DE(PREVIOUS2, SUBMIT)  # initial=0
OPENED <- DE(PREVIOUS3, g6)  # initial=0
g1 = NOT(PREVIOUS1)
g2 = AND(SIGNAL, g1)
g3 = NOT(PREVIOUS2)
g4 = AND(g2, g3)
g5 = AND(PREVIOUS3, g4)
g6 = AND(SUBMIT, g5)
OUT_UNLOCKED = OUTPUT(OPENED)  # port: UNLOCKED
```

## 10. 응답 감시기 — C4-10

8블록 · 내부 6 · D 3 · D+EN 0. 세 D에 무응답 1·2·3 tick 이상을 나타내는 상태를 저장합니다. KICK는 유지합니다.

입력 `KICK`. 출력 `TIMEOUT`. 전체 노드 수: 8.

```text
KICK = INPUT
SILENT0 <- D(g1)  # initial=0
SILENT1 <- D(g2)  # initial=0
SILENT2 <- D(g3)  # initial=0
g1 = NOT(KICK)
g2 = AND(SILENT0, g1)
g3 = AND(SILENT1, g1)
OUT_TIMEOUT = OUTPUT(SILENT2)  # port: TIMEOUT
```

## 11. 누적 계산기 — C5-01

22블록 · 내부 16 · D 0 · D+EN 2. 두 D+EN에 NOT(Q)와 비트별 반전 조건을 연결하여 mod 4 덧셈을 구현합니다. RESET 입력을 보존합니다.

입력 `D0`, `D1`, `ADD`, `RESET`. 출력 `Q0`, `Q1`. 전체 노드 수: 22.

```text
D0 = INPUT
D1 = INPUT
ADD = INPUT
RESET = INPUT
ACC0 <- DE(g3, g5)  # initial=0
ACC1 <- DE(g7, g14)  # initial=0
g1 = NOT(ACC0)
g2 = NOT(RESET)
g3 = AND(g1, g2)
g4 = AND(ADD, D0)
g5 = OR(RESET, g4)
g6 = NOT(ACC1)
g7 = AND(g2, g6)
g8 = AND(ACC0, D0)
g9 = AND(D1, g8)
g10 = NOT(g9)
g11 = OR(D1, g8)
g12 = AND(g10, g11)
g13 = AND(ADD, g12)
g14 = OR(RESET, g13)
OUT_Q0 = OUTPUT(ACC0)  # port: Q0
OUT_Q1 = OUTPUT(ACC1)  # port: Q1
```

## 12. 주소로 저장하고 읽기 — 핵심판 — C5-02

19블록 · 내부 13 · D 0 · D+EN 4. 주소별로 EN을 만든 네 D+EN과 주소 읽기 선택 논리를 사용합니다. 두 2비트 저장 공간과 현재 주소의 조합 읽기를 보존합니다.

입력 `D0`, `D1`, `ADDR`, `WRITE`. 출력 `Q0`, `Q1`. 전체 노드 수: 19.

```text
D0 = INPUT
D1 = INPUT
ADDR = INPUT
WRITE = INPUT
WORD0_0 <- DE(D0, g2)  # initial=0
WORD0_1 <- DE(D1, g2)  # initial=0
WORD1_0 <- DE(D0, g3)  # initial=0
WORD1_1 <- DE(D1, g3)  # initial=0
g1 = NOT(ADDR)
g2 = AND(WRITE, g1)
g3 = AND(ADDR, WRITE)
g4 = AND(ADDR, WORD1_0)
g5 = AND(WORD0_0, g1)
g6 = OR(g4, g5)
OUT_Q0 = OUTPUT(g6)  # port: Q0
g7 = AND(ADDR, WORD1_1)
g8 = AND(WORD0_1, g1)
g9 = OR(g7, g8)
OUT_Q1 = OUTPUT(g9)  # port: Q1
```

## 13. 한 번 되돌리기 — RESET만 제외 — C5-03

20블록 · 내부 13 · D 0 · D+EN 5. 현재 값·백업 값의 네 D+EN과 UNDO_AVAILABLE용 D+EN을 모두 유지합니다. 플래그를 없앤 18블록 핵심판 대신 20블록 상태 출력 보존판을 채택합니다.

입력 `D0`, `D1`, `SAVE`, `UNDO`. 출력 `Q0`, `Q1`, `UNDO_AVAILABLE`. 전체 노드 수: 20.

```text
D0 = INPUT
D1 = INPUT
SAVE = INPUT
UNDO = INPUT
VALUE0 <- DE(g4, g5)  # initial=0
VALUE1 <- DE(g8, g5)  # initial=0
BACKUP0 <- DE(VALUE0, SAVE)  # initial=0
BACKUP1 <- DE(VALUE1, SAVE)  # initial=0
CAN_UNDO <- DE(SAVE, g5)  # initial=0
g1 = OR(BACKUP0, SAVE)
g2 = NOT(SAVE)
g3 = OR(D0, g2)
g4 = AND(g1, g3)
g5 = OR(SAVE, UNDO)
g6 = OR(BACKUP1, SAVE)
g7 = OR(D1, g2)
g8 = AND(g6, g7)
OUT_Q0 = OUTPUT(VALUE0)  # port: Q0
OUT_Q1 = OUTPUT(VALUE1)  # port: Q1
OUT_UNDO_AVAILABLE = OUTPUT(CAN_UNDO)  # port: UNDO_AVAILABLE
```

## 14. 준비 후 한 번에 반영 — C5-04

23블록 · 내부 16 · D 0 · D+EN 4. 준비 레지스터와 공개 레지스터에 각각 D+EN 두 개를 사용합니다. 같은 명세의 18블록 비평면 후보 대신 RESET 배선을 분리한 23블록 평면 회로를 채택합니다.

입력 `D0`, `D1`, `WRITE`, `COMMIT`, `RESET`. 출력 `Q0`, `Q1`. 전체 노드 수: 23.

```text
D0 = INPUT
D1 = INPUT
WRITE = INPUT
COMMIT = INPUT
RESET = INPUT
STAGING0 <- DE(g2, g3)  # initial=0
STAGING1 <- DE(g5, g6)  # initial=0
LIVE0 <- DE(g8, g9)  # initial=0
LIVE1 <- DE(g11, g12)  # initial=0
g1 = NOT(RESET)
g2 = AND(D0, g1)
g3 = OR(RESET, WRITE)
g4 = NOT(RESET)
g5 = AND(D1, g4)
g6 = OR(RESET, WRITE)
g7 = NOT(RESET)
g8 = AND(STAGING0, g7)
g9 = OR(COMMIT, RESET)
g10 = NOT(RESET)
g11 = AND(STAGING1, g10)
g12 = OR(COMMIT, RESET)
OUT_Q0 = OUTPUT(LIVE0)  # port: Q0
OUT_Q1 = OUTPUT(LIVE1)  # port: Q1
```

## 15. 한 줄로 수신하기 · RESET 제거 — C5-05

21블록 · 내부 14 · D 1 · D+EN 9. 수신 이력·Johnson 진행 상태·완성 단어를 D+EN에 저장하며 DONE용 D를 유지합니다. DONE 없는 19블록판 대신 21블록판을 채택합니다.

입력 `DATA`, `RECEIVE`. 출력 `Q0`, `Q1`, `Q2`, `Q3`, `DONE`. 전체 노드 수: 21.

```text
DATA = INPUT
RECEIVE = INPUT
SHIFT0 <- DE(DATA, RECEIVE)  # initial=0
SHIFT1 <- DE(SHIFT0, RECEIVE)  # initial=0
SHIFT2 <- DE(SHIFT1, RECEIVE)  # initial=0
PHASE0 <- DE(g1, RECEIVE)  # initial=0
PHASE1 <- DE(PHASE0, RECEIVE)  # initial=0
WORD0 <- DE(DATA, g4)  # initial=0
WORD1 <- DE(SHIFT0, g4)  # initial=0
WORD2 <- DE(SHIFT1, g4)  # initial=0
WORD3 <- DE(SHIFT2, g4)  # initial=0
DONE_STATE <- D(g4)  # initial=0
g1 = NOT(PHASE1)
g2 = NOT(PHASE0)
g3 = AND(RECEIVE, g2)
g4 = AND(PHASE1, g3)
OUT_Q0 = OUTPUT(WORD0)  # port: Q0
OUT_Q1 = OUTPUT(WORD1)  # port: Q1
OUT_Q2 = OUTPUT(WORD2)  # port: Q2
OUT_Q3 = OUTPUT(WORD3)  # port: Q3
OUT_DONE = OUTPUT(DONE_STATE)  # port: DONE
```

## 16. 한 줄로 전송하기 — C5-06

39블록 · 내부 30 · D 6 · D+EN 2. 세 단계 진행 상태를 한 단계씩 이동시키는 39블록 평면 회로입니다. 28블록 핵심판이나 RESET 없는 31블록판 대신 RESET·VALID·BUSY를 모두 보존합니다.

입력 `D0`, `D1`, `D2`, `D3`, `START`, `RESET`. 출력 `SERIAL`, `VALID`, `BUSY`. 전체 노드 수: 39.

```text
D0 = INPUT
D1 = INPUT
D2 = INPUT
D3 = INPUT
START = INPUT
RESET = INPUT
P0 <- D(g6)  # initial=0
P1 <- D(g7)  # initial=0
P2 <- D(g8)  # initial=0
R0 <- DE(D0, g4)  # initial=0
R1 <- D(g12)  # initial=0
R2 <- D(g15)  # initial=0
SERIAL_STATE <- DE(g19, g21)  # initial=0
VALID_STATE <- D(g22)  # initial=0
g1 = OR(P0, P1)
g2 = OR(P2, g1)
g3 = NOT(g2)
g4 = AND(START, g3)
g5 = NOT(RESET)
g6 = AND(g4, g5)
g7 = AND(P0, g5)
g8 = AND(P1, g5)
g9 = AND(D1, g4)
g10 = NOT(g4)
g11 = AND(R0, g10)
g12 = OR(g11, g9)
g13 = AND(D2, g4)
g14 = AND(R1, g10)
g15 = OR(g13, g14)
g16 = AND(D3, g4)
g17 = AND(R2, g10)
g18 = OR(g16, g17)
g19 = AND(g18, g5)
g20 = OR(START, g2)
g21 = OR(RESET, g20)
g22 = AND(g20, g5)
OUT_SERIAL = OUTPUT(SERIAL_STATE)  # port: SERIAL
OUT_VALID = OUTPUT(VALID_STATE)  # port: VALID
OUT_BUSY = OUTPUT(g2)  # port: BUSY
```

## 17. 마지막에 넣은 것부터 · RESET만 제거 — C5-07

29블록 · 내부 22 · D 2 · D+EN 4. 두 데이터 슬롯·NONEMPTY·FULL·마지막 POP 값·POP 성공 상태를 사용합니다. DATA_OUT만 남긴 24블록 평면 핵심판 대신 모든 상태 출력을 유지한 29블록판을 채택합니다.

입력 `DATA`, `PUSH`, `POP`. 출력 `DATA_OUT`, `VALID`, `EMPTY`, `FULL`. 전체 노드 수: 29.

```text
DATA = INPUT
PUSH = INPUT
POP = INPUT
HEAD <- DE(DATA, g6)  # initial=0
BACK <- DE(DATA, g8)  # initial=0
NONEMPTY <- DE(g9, g7)  # initial=0
FULL_STATE <- D(g12)  # initial=0
LAST_POP <- DE(g16, g1)  # initial=0
g1 = AND(NONEMPTY, POP)
g2 = NOT(g1)
g3 = AND(NONEMPTY, g2)
g4 = OR(FULL_STATE, g3)
g6 = NOT(g4)
g7 = NOT(FULL_STATE)
g8 = OR(g1, g7)
g9 = OR(PUSH, g3)
g10 = AND(PUSH, g3)
g11 = AND(FULL_STATE, g9)
g12 = OR(g10, g11)
g13 = AND(HEAD, g6)
g14 = OR(g13, g4)
g15 = OR(BACK, g13)
g16 = AND(g14, g15)
OUT_DATA_OUT = OUTPUT(LAST_POP)  # port: DATA_OUT
POP_VALID <- D(g1)  # initial=0
OUT_VALID = OUTPUT(POP_VALID)  # port: VALID
g17 = NOT(NONEMPTY)
OUT_EMPTY = OUTPUT(g17)  # port: EMPTY
OUT_FULL = OUTPUT(FULL_STATE)  # port: FULL
```

## 18. 먼저 넣은 것부터 · RESET만 제거 — C5-08

28블록 · 내부 21 · D 2 · D+EN 4. 두 데이터 슬롯과 점유 상태를 갱신하며 먼저 들어온 데이터를 POP합니다. DATA_OUT만 남긴 23블록 평면 핵심판 대신 모든 상태 출력을 유지한 28블록판을 채택합니다.

입력 `DATA`, `PUSH`, `POP`. 출력 `DATA_OUT`, `VALID`, `EMPTY`, `FULL`. 전체 노드 수: 28.

```text
DATA = INPUT
PUSH = INPUT
POP = INPUT
HEAD <- DE(g16, g17)  # initial=0
BACK <- DE(DATA, g8)  # initial=0
NONEMPTY <- DE(g9, g7)  # initial=0
FULL_STATE <- D(g12)  # initial=0
LAST_POP <- DE(HEAD, g1)  # initial=0
g1 = AND(NONEMPTY, POP)
g2 = NOT(g1)
g3 = AND(NONEMPTY, g2)
g7 = NOT(FULL_STATE)
g8 = OR(g1, g7)
g9 = OR(PUSH, g3)
g10 = AND(PUSH, g3)
g11 = AND(FULL_STATE, g9)
g12 = OR(g10, g11)
g13 = AND(DATA, g7)
g14 = OR(FULL_STATE, g13)
g15 = OR(BACK, g13)
g16 = AND(g14, g15)
g17 = NOT(g3)
OUT_DATA_OUT = OUTPUT(LAST_POP)  # port: DATA_OUT
POP_VALID <- D(g1)  # initial=0
OUT_VALID = OUTPUT(POP_VALID)  # port: VALID
g18 = NOT(NONEMPTY)
OUT_EMPTY = OUTPUT(g18)  # port: EMPTY
OUT_FULL = OUTPUT(FULL_STATE)  # port: FULL
```

## 19. 수신 대기 우편함 — RESET만 제외 — C5-09

16블록 · 내부 9 · D 2 · D+EN 3. 페이로드·점유·전달값·수신 성공·송신 성공을 저장합니다. DATA_OUT만 남긴 11블록판 대신 모든 상태 출력을 유지한 16블록판을 채택합니다.

입력 `DATA`, `SEND`, `TAKE`. 출력 `FULL`, `DATA_OUT`, `VALID`, `ACCEPTED`. 전체 노드 수: 16.

```text
DATA = INPUT
SEND = INPUT
TAKE = INPUT
PAYLOAD <- DE(DATA, g3)  # initial=0
OCCUPIED <- DE(SEND, g2)  # initial=0
DELIVERED <- DE(PAYLOAD, g4)  # initial=0
DELIVERY_VALID <- D(g4)  # initial=0
SEND_ACCEPTED <- D(g3)  # initial=0
g1 = NOT(OCCUPIED)
g2 = OR(TAKE, g1)
g3 = AND(SEND, g2)
g4 = AND(OCCUPIED, TAKE)
OUT_FULL = OUTPUT(OCCUPIED)  # port: FULL
OUT_DATA_OUT = OUTPUT(DELIVERED)  # port: DATA_OUT
OUT_VALID = OUTPUT(DELIVERY_VALID)  # port: VALID
OUT_ACCEPTED = OUTPUT(SEND_ACCEPTED)  # port: ACCEPTED
```

## 20. 시간을 써서 나누기 — C5-10

45블록 · 내부 34 · D 3 · D+EN 5. 최초 tick 준비 뒤 단위 수를 세며 몫과 나머지를 누적합니다. 45블록, D 3개와 D+EN 5개입니다. 이 해답은 A+1 tick에 처음 완료하지만 문제는 10 tick 이내의 모든 올바른 완료 시점을 허용합니다.

입력 `A0`, `A1`, `A2`, `B0`, `B1`. 출력 `Q0`, `Q1`, `Q2`, `R0`, `R1`, `COMPLETE`. 전체 노드 수: 45.

```text
A0 = INPUT
A1 = INPUT
A2 = INPUT
B0 = INPUT
B1 = INPUT
GO <- DE(g1, g1)  # initial=0
g1 = NOT(GO)
P0 <- D(g4)  # initial=0
P1 <- DE(g7, g8)  # initial=0
P2 <- DE(g12, g13)  # initial=0
g2 = AND(A0, g1)
g3 = OR(P0, g2)
g4 = NOT(g3)
g5 = AND(A1, g1)
g6 = OR(P1, g5)
g7 = NOT(g6)
g8 = OR(P0, g1)
g9 = AND(P0, P1)
g10 = AND(A2, g1)
g12 = NOT(g10)
g13 = OR(g1, g9)
g14 = AND(P2, g9)
R0 <- D(g18)  # initial=0
R1 <- D(g19)  # initial=0
g15 = OR(R0, R1)
g16 = NOT(g15)
g17 = AND(GO, g16)
g18 = AND(B1, g17)
g19 = AND(B0, R0)
g20 = OR(g18, g19)
g21 = NOT(g20)
g22 = AND(GO, g21)
Q0 <- DE(g23, g22)  # initial=0
Q1 <- DE(g25, g24)  # initial=0
g23 = NOT(Q0)
g24 = AND(Q0, g22)
g25 = NOT(Q1)
OUT_Q0 = OUTPUT(Q0)  # port: Q0
OUT_Q1 = OUTPUT(Q1)  # port: Q1
OUT_Q2 = OUTPUT(DIRECT_Q2)  # port: Q2
OUT_R0 = OUTPUT(R0)  # port: R0
OUT_R1 = OUTPUT(R1)  # port: R1
OUT_COMPLETE = OUTPUT(g14)  # port: COMPLETE
DIRECT_NOT_B1 = NOT(B1)
DIRECT_Q2 = AND(A2, DIRECT_NOT_B1)
```

## 나눗셈기 45블록 해답의 작동 원리

첫 tick에는 GO를 켜고 진행값 P에 A의 3비트 보수를 저장한다. 이후 tick마다 단위 수를 하나씩 진행시키고 P가 111이 되는 첫 tick을 COMPLETE로 사용한다. 그러므로 입력 A에 대해 준비 1 tick + 단위 진행 A tick = A+1 tick이다.

R0·R1은 제수만큼의 주기를 세는 나머지 상태다. B=1이면 0만 유지하고, B=2이면 0→1→0, B=3이면 0→1→2→0을 반복한다. 나머지가 한 바퀴 돌아 0이 되는 tick에 Q0·Q1을 증가시킨다. GO는 준비 tick에서 잘못 증가하는 것을 막는다.

몫의 최상위 Q2는 `A2 AND NOT(B1)`로 직접 만든다. 허용 입력에서 B1=0은 B=1이므로 Q2=A2이며, B=2 또는 3이면 몫은 최대 3이라 Q2=0이다. 이 최적화 때문에 완료 전 Q2가 먼저 1일 수 있지만 문제 명세상 허용된다.

P2는 첫 완료 전의 유효 구간에서 1로 포화시켜 게이트 하나를 줄였다. 첫 COMPLETE가 켜질 때 테스트를 끝내므로 완료 이후 자동 정지나 결과 유지 회로가 필요하지 않다. 이 동작을 유지 조건으로 잘못 확장하면 첨부 45블록 해답과 다른 문제가 된다.

