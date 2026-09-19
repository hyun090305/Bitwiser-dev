# 챕터·스테이지 개편 현황

> 이 문서는 2026-09-13 개편의 기록입니다. 2026-09-18 메모리 20문제 최종판이 적용되어 현재 플레이 가능 47개·후보 1개입니다. 아래 축소판 명세·후보 상태·관측 시점은 [최종 적용 문서](MEMORY20_INTEGRATION.md)로 대체되었으며, 현재 배치와 선행 조건은 `stageCatalog.js`를 따릅니다.

2026-09-13. `Bitwiser_D_Stage_Restructure.md`의 새 결정을 우선하고 `Bitwiser_Memory_Stages.md`의 동작 명세를 참고했습니다.

## 반영 범위

| 챕터 | 한국어 보조 문구 | 플레이 가능 | 후보 |
|---|---|---:|---:|
| LOGIC CORE | 신호에 의미를 부여하다 | 7 | 0 |
| MEMORY LINK | 지나간 순간을 기억하다 | 10 | 0 |
| ARITHMETIC UNIT | 비트로 계산하다 | 10 | 1 |
| CONTROL FLOW | 다음 행동을 결정하다 | 7 | 4 |
| SYSTEM INTEGRATION | 흩어진 기능을 하나로 연결하다 | 0 | 9 |

총 **34개 플레이 가능**, **14개 후보**입니다. 기존 0~24의 문제 정의는 한국어·영어 모두 원래 데이터와 동일합니다. 기존 node ID도 유지하며 위치와 선행 조건만 개편했습니다. Lab과 사용자 문제는 번호 없는 `extras`로 옮겼습니다.

새 플레이 가능 문제는 **25~31, 34, 35**의 9개입니다. 새 기본 블록은 D뿐이며 Selector는 AND/OR/NOT으로 푸는 조합 문제입니다. 정식판 카운터·PWM·Round Robin·ABBA와 Chapter 5의 9문제는 기준 배치가 확보되지 않아 후보로 남겼습니다. Overflow Detector는 실제 문제 정의가 없으므로 숫자 ID·정답·예산을 만들지 않았습니다. 후보는 클리어 분모, 플레이 목록, 실제 해금 대상에서 제외됩니다.

## 진입과 저장

`src/modules/stageCatalog.js`가 배치·선행 조건·체험판 범위의 공통 원본입니다. `stage_map.json`은 여기서 생성합니다. 맵 연결은 직각으로 라우팅하고 카드 내부를 통과하지 않게 했습니다. 시각적 연결과 논리적 선행 조건을 분리해 변경하지 않습니다.

- Chapter 2: XOR → 저장 스위치. Majority → Selector 분기와 Toggle → Sticky Fault 분기를 **AND**로 합쳐 Staging → 자동문으로 진행합니다. Priority·Decoder·Rising Edge는 선택 문제입니다.
- 자동문(ID 30)을 완료하면 Chapter 3·4·5의 공통 진입 조건이 충족됩니다. 다른 후반 챕터의 전체 완료는 요구하지 않습니다. 각 문제에는 표의 추가 선행 조건도 모두 필요합니다.
- 이미 클리어한 기존 문제는 새 선행 조건이 충족되지 않아도 재도전할 수 있습니다. 미완료 문제를 `startLevel`로 직접 호출해 우회할 수 없습니다.
- 기존 숫자 ID와 저장 키를 유지합니다. 체험판 범위 밖 기록은 보관 필드로 이관하고 내보내기에서도 보존하지만 해금에는 사용하지 않습니다.
- 회로 v3에 D/EN 역할·INPUT 방식을 보관하며 v2도 읽습니다. Q·tick·일시적인 button 입력값은 재진입 시 0으로 시작합니다.

## 새 문제의 동작

| ID | 문제 | 확인한 동작 |
|---|---|---|
| 25 | 저장 스위치 | DATA switch / LOAD button. EN=0 유지, EN=1 저장. 한 입력 D 실습 → tick 전 유지 → EN 추가 실습 |
| 26 | 토글 조명 | PRESS가 있는 tick마다 반전. 연속 두 번도 두 번 반전 |
| 27 | 2-to-1 Selector | SEL=0이면 A, SEL=1이면 B |
| 28 | 고장 기록등 | FAULT가 ACK보다 우선. ACK가 없으면 기록 유지 |
| 29 | 준비 후 반영 | 1비트, WRITE/APPLY 버튼, RESET 없음. 동시 명령은 새 DATA 준비 + 이전 준비 값 공개 |
| 30 | 자동문 | OPEN tick 포함 3 tick. 1000→1110, 101000→111110. 재입력 시 연장 |
| 31 | 변화 감지기 | 현재 SIGNAL AND NOT(이전 tick의 SIGNAL). 입력 변경 직후 검출하고 tick 후 해제 |
| 34 | 응답 감시기 | 세 번째 연속 무응답부터 TIMEOUT. 3에서 포화하고 KICK tick에 해제 |
| 35 | 흔들림 제거기 | 상승·하강 모두 같은 RAW 세 번 후 반영. 짧은 흔들림 무시 |

모든 저장소 초기값은 0입니다. 순차 예시 표는 tick 이후 출력이며, 31번 변화 감지기는 명시적으로 tick 직전 출력을 표시합니다. 채점은 예시와 별개로 모든 도달 가능한 사용자·정답 상태 쌍과 모든 입력을 검사합니다. 자세한 내용은 [회로 동등성 채점](EXHAUSTIVE_GRADING.md)을 참고하세요. UI 채점·저장 기록 재검증이 같은 평가 코드를 사용합니다. 별도 수식 해석기를 제품에 추가하지 않았습니다.

## 실제 기준 회로와 제한

체험판 기준 회로는 `tests/fixtures/demo/{ID}-{2|3}.json`, Watchdog·Debouncer는 `tests/fixtures/stages/{34|35}-{2|3}.json`입니다. 각 회로는 블록 위치, 고정 단자, 실제 직각 단위 경로, 비중첩 배선, outdegree ≤ 4, 전체 정답 시퀀스를 확인했습니다. 이는 논리 그래프의 평면성 판정과 별개입니다.

2·3별 목표는 실제 가능한 두 배치에서 계산합니다. 2별 회로는 같은 논리를 유지하며 도선을 합법적으로 우회한 배치입니다. **최소 블록 수나 최단 배선의 증명은 아닙니다.** 기존 Majority(6×6)와 Decoder(10×10)도 기준 배치를 확보했습니다.

**Priority(ID 23)**는 기존 고정 IO와 9×7 격자를 유지합니다. 두 논리 구성과 분기점 변경을 포함한 배치 탐색에서 완전한 기준 회로를 확보하지 못했습니다. `scripts/find-priority-reference.mjs`의 30개 seed × 200,000회 탐색도 성공하지 않았습니다. 불가능하다는 증명은 아니며, 임의의 2·3별 기준을 넣지 않았습니다. 정답 통과 1별과 기존 문제 플레이는 가능합니다. 브라우저에서는 진입을 확인했고 실제 완성 회로 채점은 미확인입니다.

나머지 후보 13문제는 문서의 새 D 전용 명세와 실제 배선 기준 회로를 함께 구현·검증한 뒤 활성화해야 합니다. 이전 문서의 그래프 최소값, T/RESET 또는 더 넓은 이전 문제 사양을 그대로 가져오지 않았습니다. 예를 들어 향후 Stack/Queue 기본판은 1비트 2칸·RESET 없음·DATA_OUT 하나가 기준입니다.

## 체험판

Chapter 1·2의 기본·선택 문제 **17개**가 체험판입니다. 후반 챕터는 제목·소개만 포함하며 실제 문제 데이터와 온라인 모듈은 빌드에서 제거합니다. 로그인 없이 자동 저장·백업 파일 내보내기/검증/복원·별·텍스트/GIF 공유가 동작합니다.

마무리는 자동문입니다. 완료 안내는 2D 안전 모드에서의 부분 복구를 설명하고 후반 세 경로를 병렬로 소개합니다. Story Fragment 해금과 감상 기록은 제거했으며, 기존 백업의 회로와 진행은 계속 복원합니다. 설정된 정식판 상품 URL이 없어 외부 상품 링크는 추가하지 않았습니다.

## 실행·검증

```powershell
npm test
npm run stages:generate
npm run build:demo
npm run preview:demo
# 별도 터미널 (기본 주소 http://127.0.0.1:8080)
npm run test:demo:browser
npm run test:stages:browser
npm run test:full:web
npm run test:full:electron
npm run test:memory:browser
```

`DEMO_PORT`와 `DEMO_URL`로 별도 포트를 지정할 수 있습니다. `test:stages:browser`는 첫 체험판 브라우저 검증이 만든 `test-results/demo-progress.json`을 사용합니다.

- 단위 테스트 **38/38 통과**: ID/분기/후보/직각 맵, 실제 회로·예산, 새 문제 경계 조건, 진행 이관, D 실습, 기존 엔진 회귀.
- 체험판: **16문제 실제 채점 + Priority 진입**, 자동문 마무리, 공유. 외부 요청·누락 자산·페이지 오류 0.
- 한국어·영어 5챕터와 extras, 후반 데이터 분리, 모바일 모달·터치·Undo/Redo·스토리지 거부·이전 SW 업그레이드 확인.
- 저장 스위치 실습을 실제 클릭으로 완료, 영어 힌트, D/EN 자동 저장, 재진입 초기화, 자동 실행 중 이탈, 파일 백업 검증·복원 확인.
- 전체 웹: 34문제, 계정·Lab 진입점, 직접 진입 제한과 기존 클리어 재도전 확인.
- 공유 D/Lab 브라우저 9개 회귀 시나리오 통과. Electron 시작 검증은 기존 Google proxy 오류 두 개를 별도로 기록하며 새 오류와 구분합니다.

이미지와 실행 기록은 `test-results`에 생성됩니다. 실제 모바일 기기·Safari·Firefox, 모든 온라인 저장 기능, 설치 패키지, 사람의 풀이 시간과 난이도는 검증하지 않았습니다.

## 전체 ID·선행 조건

아래 표의 선행 조건은 모두 AND이며, 후보의 조건은 향후 활성화할 계획입니다.

<!-- stage-catalog-table -->

| ID | node ID | 문제 | 챕터 | 선행 ID | 상태 |
|---|---|---|---|---|---|
| 0 | tutorial | Tutorial | Logic Core | 없음 | 플레이 가능 |
| 1 | not | NOT | Logic Core | 0 | 플레이 가능 |
| 2 | or | OR | Logic Core | 1 | 플레이 가능 |
| 3 | and | AND | Logic Core | 2 | 플레이 가능 |
| 6 | xor | XOR | Logic Core | 3 | 플레이 가능 |
| 4 | nor | NOR | Logic Core | 2 | 플레이 가능 · 선택 |
| 5 | nand | NAND | Logic Core | 3 | 플레이 가능 · 선택 |
| 25 | enabled_register | 저장 스위치 | Memory Link | 6 | 플레이 가능 |
| 7 | majority_gate | Majority | Memory Link | 25 | 플레이 가능 |
| 26 | toggle_light | 토글 조명 | Memory Link | 25 | 플레이 가능 |
| 27 | selector_2to1 | 2-to-1 Selector | Memory Link | 7 | 플레이 가능 |
| 28 | sticky_fault | 고장 기록등 | Memory Link | 26 | 플레이 가능 |
| 29 | staging_register | 준비 후 반영 | Memory Link | 27, 28 | 플레이 가능 |
| 30 | automatic_door | 자동으로 닫히는 문 | Memory Link | 29 | 플레이 가능 |
| 23 | priority_gate | Priority | Memory Link | 7 | 플레이 가능 · 선택 |
| 11 | decoder_2to4 | 2-to-4 Decoder | Memory Link | 27 | 플레이 가능 · 선택 |
| 31 | rising_edge | 변화 감지기 | Memory Link | 29 | 플레이 가능 · 선택 |
| 9 | half_adder | Half Adder | Arithmetic Unit | 30 | 플레이 가능 |
| 8 | parity_checker | Parity | Arithmetic Unit | 30 | 플레이 가능 |
| 10 | full_adder | Full Adder | Arithmetic Unit | 30, 9, 8 | 플레이 가능 |
| 14 | two_bit_adder | Adder | Arithmetic Unit | 30, 10 | 플레이 가능 |
| 17 | two_bit_multiplier | Multiplier | Arithmetic Unit | 30, 14 | 플레이 가능 |
| 13 | two_bit_comparator | Comparator | Arithmetic Unit | 30 | 플레이 가능 |
| 16 | two_bit_max_selector | Max Selector | Arithmetic Unit | 30, 13 | 플레이 가능 |
| 24 | twos_complement | 2's complement | Arithmetic Unit | 30, 14 | 플레이 가능 |
| 15 | two_bit_subtractor | Mod 4 Subtractor | Arithmetic Unit | 30, 24 | 플레이 가능 |
| 18 | mod3_remainder | Remainder | Arithmetic Unit | 30, 17 | 플레이 가능 · 선택 |
| 미지정 | overflow_detector | Overflow Detector | Arithmetic Unit | 30, 10 | 후보 · 선택 |
| 12 | mux_4to1 | 4-to-1 MUX | Control Flow | 30, 11 | 플레이 가능 |
| 21 | three_bit_shifter | 3-bit shifter | Control Flow | 30 | 플레이 가능 |
| 32 | up_down_counter | Up/Down Counter | Control Flow | 30 | 후보 |
| 33 | pwm | PWM | Control Flow | 30, 32 | 후보 · 선택 |
| 34 | watchdog | 응답 감시기 | Control Flow | 30 | 플레이 가능 |
| 35 | debouncer | 흔들림 제거기 | Control Flow | 30, 31 | 플레이 가능 |
| 36 | round_robin | Round Robin | Control Flow | 30, 23 | 후보 |
| 37 | abba_lock | ABBA Lock | Control Flow | 30, 36 | 후보 |
| 20 | fixed_xor | Fixed XOR | Control Flow | 30 | 플레이 가능 |
| 22 | fixed_decoder_2to4 | Fixed 2-to-4 Decoder | Control Flow | 30, 11 | 플레이 가능 |
| 19 | crossroad | Crossroad | Control Flow | 30, 20 | 플레이 가능 |
| 38 | register_bank | Register Bank | System Integration | 30 | 후보 |
| 39 | undo_register | Undo Register | System Integration | 30, 38 | 후보 · 선택 |
| 40 | mailbox | Mailbox | System Integration | 30 | 후보 |
| 41 | stack | Stack | System Integration | 30, 40 | 후보 |
| 42 | queue | Queue | System Integration | 30, 40 | 후보 |
| 43 | serial_receiver | Serial Receiver | System Integration | 30, 38, 32 | 후보 |
| 44 | serial_transmitter | Serial Transmitter | System Integration | 30, 38, 32 | 후보 |
| 45 | accumulator | Accumulator | System Integration | 30, 14 | 후보 |
| 46 | iterative_multiplier | Iterative Multiplier | System Integration | 30, 45, 32 | 후보 · 선택 |
