# 스테이지 맵 v6 적용 결과

> 2026-09-18: 배치와 선행 관계는 유지하고, 메모리 후보 13개를 검증 후 공개했습니다. 현재 플레이 가능 47개·후보 1개이며 아래 공개 상태와 차단 목록은 당시 기록입니다. [메모리 최종 개편](MEMORY20_INTEGRATION.md) 참조.

2026-09-13 · 제공된 ZIP의 Chapter 1–5 참조 배치 적용

## 반영 사항

- 본편 Chapter 1–5를 동일한 25×17 패널·5×3 슬롯으로 표시합니다. 후속 가독성 요청에 따라 카드만 4×4로 확대하고 슬롯 중심은 유지했습니다. Chapter 1은 B·C행만 사용합니다.
- 48개 노드와 44개 직선 화살표를 적용했습니다. 화살표는 인접 슬롯의 카드 테두리를 연결하며 모두 52 world px(패널 좌표 1단위, 슬롯 중심 간격은 5단위)입니다. 챕터 사이에는 선을 그리지 않습니다.
- Chapter 2의 두 부모 AND 합류, 자동문 뒤 변화 감지기, Chapter 3의 Half Adder→Parity→Full Adder, Chapter 4·5의 확정 부모 관계를 반영했습니다.
- 챕터 입장 조건 데이터와 판정은 유지합니다: 1=없음, 2=XOR, 3·4=자동문, 5=자동문+Adder+Up/Down Counter. 후속 요청에 따라 배너와 하단의 입장 조건 표시는 제거했습니다. 하단은 ← · 챕터 이름 · →로 표시합니다.
- 잠긴 선과 화살촉을 계속 표시하고, 카드에 제목·선택·잠김·완료·예정을 표시합니다. 스테이지 번호는 맵에서 표시하지 않고 내부 ID로 유지합니다. 길이가 긴 제목은 축소하거나 두 줄로 표시합니다. 예정 노드의 예약 ID도 유지하며 Overflow에는 새 퍼즐 ID를 만들지 않았습니다.
- 스테이지 맵의 화면 이동은 좌우 버튼과 화살표 키를 통한 챕터 이동으로 제한했습니다. 휠·Ctrl+휠·터치 핀치·마우스 드래그·한 손가락/두 손가락 스와이프로 맵 위치나 배율을 바꿀 수 없습니다. 카드 클릭·탭은 유지하며, 드래그와 다중 터치 뒤에는 카드가 선택되지 않습니다. 챕터 변경 시 공통 기본 배율을 유지하고 화면 크기가 바뀌면 패널에 다시 맞춥니다. 제스처 제한은 맵 요소에만 적용하므로 Lab와 다른 화면의 이동·확대/축소는 유지됩니다.
- 1440×1000 브라우저 화면에서 카드는 177.7px, 제목은 21.4px, 선택·상태는 13.7px로 표시됩니다. 배너는 약 174px에서 120.5px로 약 31% 축소했습니다. 제목은 중앙 부근 최대 두 줄이고, 한국어 자동문 카드에는 짧은 표시명 ‘자동문’을 사용합니다. 문제의 실제 제목과 저장 ID는 유지합니다.
- 좌우 화살표 키로 챕터를 이동할 수 있습니다. 이동 시 배율은 같고 중심만 옮깁니다. 입력란 편집이나 다른 화면의 키 조작은 가로채지 않습니다.
- 전체 게임의 회로 이동 처리기가 맵에서도 방향키의 기본 동작을 먼저 취소하던 문제를 수정했습니다. 맵이 보일 때는 회로 이동 처리기가 입력을 소비하지 않습니다. 실제 src/main.js의 전역 처리기를 맵보다 먼저 등록하는 브라우저 검사에서 수정 전 실패를 재현했고, 수정 후 챕터 이동·입력란 편집·게임 화면 왕복이 통과했습니다.
- 화면 순서는 Extras → Chapter 1 → Chapter 2 → Chapter 3 → Chapter 4 → Chapter 5이며 최초 진입은 Chapter 1입니다. Extras는 번호 없이 EXTRAS / AUXILIARY SYSTEMS 배너를 사용합니다. 플로팅 바의 버튼은 모든 화면에서 ←/→만 표시하며, 이동 대상 설명은 스크린리더용 접근성 이름으로 유지합니다.
- Extras의 두 카드는 5×3 슬롯과 별개로 중앙에 나란히 배치했습니다. 1440×1000 화면에서 각각 319.8×279.9px이고 간격은 60.0px입니다. TEST BENCH / 실험실과 EXTERNAL BLUEPRINTS / 유저 제작 문제를 표시하며, 회로 격자와 겹친 도면 세 장을 코드로 그립니다. 불투명한 남색 면과 얇은 청록 테두리, 본편과 동일한 모서리 반경·글꼴을 사용합니다.
- 카드 전체 클릭·탭 및 Tab → Enter/Space 진입을 지원합니다. 마우스 진입이나 키보드 초점에서 테두리를 강조하고 신호가 850ms 동안 한 번 흐릅니다. 평상시와 효과 종료 뒤에는 그림이 반복 애니메이션 없이 유지됩니다.
- Extras 진입 카드끼리나 본편과의 진행 연결선은 없으며 Chapter 1의 선행 조건을 추가하지 않았습니다. Lab·유저 문제 진입 처리와 해금 판정, 체험판의 기능 제한 및 공개 범위(Chapter 1·2의 17개 문제)를 유지했습니다.

## 코드와 저장 호환

단일 카탈로그 `src/modules/stageCatalog.js`가 슬롯·직접 부모·챕터 입장 조건을 제공합니다. `scripts/restructure-stage-map.mjs`가 같은 카탈로그에서 `stage_map.json`을 생성합니다. `src/modules/stageMapLayout.js`는 참조 좌표를 기존 캔버스 좌표로 바꾸고 카드 테두리의 선 양 끝을 계산합니다. `src/modules/stageMap.js`가 이를 기존 렌더러에 적용합니다.

맵 클릭과 직접 `startLevel` 진입은 같은 공개 상태·입장 조건·부모 조건 검사를 사용합니다. 퍼즐 ID, 문제 정의, 회로 엔진, D 블록, 별 기준, 테스트 시퀀스는 이번 작업에서 변경하지 않았습니다. 작업 시작 전의 로컬 수정사항도 보존했습니다.

카탈로그 버전은 3입니다. 전체 게임은 기존 순위/클리어 데이터를 그대로 읽고 닉네임별 `stageMapAccess_v3_<nickname>`에 접근권만 추가합니다. 버전 2에서 이미 열렸던 개별 문제·챕터 접근은 최초 이전 시 보존됩니다. 체험판은 기존 `bitwiser:web-demo:v1` 저장 형식을 유지하면서 접근권 필드를 추가하고, 기존 백업을 검증한 다음 반복 실행에 안전하게 이전합니다. 클리어·별·회로 초안·힌트의 퍼즐 키를 바꾸거나 선행 문제를 자동으로 클리어하지 않습니다. 저장 실패 중에도 같은 세션에서 마이그레이션을 반복하지 않습니다.

## 현재 출시 상태의 불일치

현재 공개 퍼즐은 **34개**, 예정 노드는 **14개**입니다. 아래 공개 퍼즐은 확정된 부모 관계에 미출시 퍼즐이 있어 **새 진행에서 도달할 수 없습니다**. 기존에 클리어했거나 접근권을 갖고 있던 사용자는 다시 플레이할 수 있습니다.

| 공개 퍼즐 | 미출시 선행 퍼즐 |
|---|---|
| 4-to-1 MUX (ID 12) | Round Robin |
| 3-bit shifter (ID 21) | Round Robin |
| 응답 감시기 (ID 34) | PWM, Up/Down Counter |
| Fixed XOR (ID 20) | Round Robin |
| Fixed 2-to-4 Decoder (ID 22) | Round Robin |
| Crossroad (ID 19) | Round Robin |

Round Robin 이후 MUX→Fixed XOR→Crossroad 및 짧은 가지, Counter→PWM→응답 감시기 경로가 해당됩니다. Chapter 5 입장에는 미출시 Counter가 필요하고, Chapter 5의 9개 퍼즐도 모두 예정입니다. 구조나 선행 조건을 생략하지 않았으며, 문제 내용을 임의로 만들거나 미완성 콘텐츠를 활성화하지 않았습니다.

## 검증 결과

- `npm test`: 45개 통과. 원본 참조의 48개 슬롯·부모·선택 표시, 44개 선의 동일 길이·직교·교차/겹침/카드 관통 없음, 단일 연결 성분, 유향 순환 없음, Extras 순서·연결선 없음·체험판 제한 유지 검증.
- 챕터별 노드/선/무향 고리: 1=7/6/0, 2=10/10/1, 3=11/10/0, 4=11/10/0, 5=9/8/0.
- `npm run test:map:browser`: 실제 HTML·맵 렌더러·레벨 진입 모듈을 사용하는 로컬 브라우저 검사 통과. 5개 챕터 잠김/부분 완료/공개 문제 완료 화면, 두 부모 합류, 조건 표시 제거, 실제 표시 크기, 좌우 버튼·키 이동 시 배율 유지, 리사이즈 후 동일 좌표, 기존 접근권 및 직접 진입 검증. 맵의 휠·Ctrl+휠·핀치·마우스 드래그·한 손가락/두 손가락 스와이프에서 카메라가 유지되고, 카드 클릭·탭은 작동하며 느린 드래그는 카드 선택을 취소하는지 확인했습니다. 같은 페이지에서 실제 Lab를 열어 휠·핀치 확대/축소와 두 손가락 이동이 계속 동작하는지도 검증했습니다.
- 전체 게임 저장 어댑터를 로컬 DB 응답으로 검증: 기존 접근권 보존, 이전 반복 안전성, 닉네임별 분리, 초안 보존, 저장 공간 오류에서 새 진행에 옛 규칙을 재적용하지 않음.
- `node scripts/verify-demo-browser.mjs`: 체험판 16개 채점 대상 진행 및 Priority 진입 통과. 외부 요청·페이지 오류·누락 자산 0.
- `node scripts/verify-demo-recovery.mjs`: 한국어 터치 편집, 실행 취소/다시 실행, 초안 복구, 저장 차단 상태의 진행, 서비스 워커 갱신 후 기록 유지 통과.
- `node scripts/verify-extras-demo.mjs`: 갱신된 실제 체험판에서 한국어/영어 Extras 위치, 최초 Chapter 1, 키보드·포인터로 두 카드의 정식판 안내 진입, 900×650 화면 맞춤을 검증했습니다. 외부 요청과 페이지 오류가 없었습니다. 맵 브라우저 검사에서는 실제 표시 크기와 카드 전체 클릭, Tab/Enter/Space, 유저 문제 보관함 진입·복귀, 효과가 한 번 끝난 뒤 카드 이미지가 변하지 않는 것까지 확인했습니다.
- `npm run build:demo`: 성공. `dist-web-demo`에 갱신된 실행 결과 생성.
- `git diff --check`: 통과.
- 전체 웹 시작 검사 `npm run test:full:web`는 외부 Firebase SDK 로딩 실패(`firebase is not defined`, `db is not defined`)로 준비 화면에서 중단되었습니다. 실 Firebase 접속 및 Electron 전체 시작은 이번 검증의 성공 항목에 포함하지 않습니다. 위 맵 검사는 외부 서비스에 의존하지 않는 로컬 진행 데이터로 수행했습니다.

## 실제 화면

[전체 스크린샷 모음](../test-results/stage-map/index.html) · [브라우저 검사 수치](../test-results/stage-map/browser-check.json)

- [Extras 한국어](../test-results/stage-map/extras-ko.png) · [영어](../test-results/stage-map/extras-en.png) · [키보드 선택](../test-results/stage-map/extras-keyboard.png) · [체험판 작은 화면](../test-results/stage-map/extras-small-ko.png)
- [Chapter 1 잠김 구조](../test-results/stage-map/chapter-1-locked.png) · [공개 문제 완료 상태](../test-results/stage-map/chapter-1-released-complete.png)
- [Chapter 2 잠김 구조](../test-results/stage-map/chapter-2-locked.png) · [공개 문제 완료 상태](../test-results/stage-map/chapter-2-released-complete.png)
- [Chapter 3 잠김 구조](../test-results/stage-map/chapter-3-locked.png) · [공개 문제 완료 상태](../test-results/stage-map/chapter-3-released-complete.png)
- [Chapter 4 잠김 구조](../test-results/stage-map/chapter-4-locked.png) · [공개 문제 완료 상태](../test-results/stage-map/chapter-4-released-complete.png)
- [Chapter 5 잠김 구조](../test-results/stage-map/chapter-5-locked.png) · [공개 문제 완료 상태](../test-results/stage-map/chapter-5-released-complete.png)
- [Chapter 2 부분 완료](../test-results/stage-map/chapter-2-partial.png) · [두 부모 완료 후 합류 해금](../test-results/stage-map/chapter-2-join-ready.png)
- [작은 화면](../test-results/stage-map/chapter-2-small.png) · [챕터 이동만 허용하는 맵](../test-results/stage-map/chapter-3-navigation-only.png)
- [Chapter 5 잠김 상태](../test-results/stage-map/chapter-5-missing-counter.png) · [Chapter 4 기존 접근 유지](../test-results/stage-map/chapter-4-legacy-access.png)

완료 화면은 현재 공개 문제만 완료한 테스트 데이터이며, 예정 문제는 계속 예정으로 표시됩니다. 사용자 실제 저장을 덮어쓰지 않았습니다.

## 참조 키 → 기존 ID 대응

맵에서는 스테이지 번호를 표시하지 않습니다. 내부 퍼즐 ID와 저장 키는 그대로 사용하며 슬롯 순서로 재번호화하지 않았습니다.

| 참조 키 | 맵 노드 ID | 퍼즐/저장 ID | 슬롯 | 상태 |
|---|---|---:|---|---|
| c1_tutorial | tutorial | 0 | B1 | 공개 |
| c1_not | not | 1 | B2 | 공개 |
| c1_or | or | 2 | B3 | 공개 |
| c1_and | and | 3 | B4 | 공개 |
| c1_xor | xor | 6 | B5 | 공개 |
| c1_nor | nor | 4 | C3 | 공개 |
| c1_nand | nand | 5 | C4 | 공개 |
| c2_save | enabled_register | 25 | B1 | 공개 |
| c2_majority | majority_gate | 7 | B2 | 공개 |
| c2_toggle | toggle_light | 26 | C1 | 공개 |
| c2_selector | selector_2to1 | 27 | B3 | 공개 |
| c2_fault | sticky_fault | 28 | C2 | 공개 |
| c2_buffer | staging_register | 29 | C3 | 공개 |
| c2_door | automatic_door | 30 | C4 | 공개 |
| c2_priority | priority_gate | 23 | A2 | 공개 |
| c2_decoder | decoder_2to4 | 11 | A3 | 공개 |
| c2_rise | rising_edge | 31 | C5 | 공개 |
| c3_half | half_adder | 9 | B1 | 공개 |
| c3_parity | parity_checker | 8 | B2 | 공개 |
| c3_full | full_adder | 10 | B3 | 공개 |
| c3_adder | two_bit_adder | 14 | B4 | 공개 |
| c3_multiplier | two_bit_multiplier | 17 | B5 | 공개 |
| c3_comparator | two_bit_comparator | 13 | C2 | 공개 |
| c3_max | two_bit_max_selector | 16 | C3 | 공개 |
| c3_twos | twos_complement | 24 | A4 | 공개 |
| c3_subtractor | two_bit_subtractor | 15 | A5 | 공개 |
| c3_remainder | mod3_remainder | 18 | C5 | 공개 |
| c3_overflow | overflow_detector | 없음(기존 예정 노드) | A3 | 예정 |
| c4_mux | mux_4to1 | 12 | B3 | 공개 |
| c4_shifter | three_bit_shifter | 21 | C3 | 공개 |
| c4_counter | up_down_counter | 32 | A1 | 예정 |
| c4_pwm | pwm | 33 | A2 | 예정 |
| c4_watchdog | watchdog | 34 | A3 | 공개 |
| c4_debounce | debouncer | 35 | B1 | 공개 |
| c4_round | round_robin | 36 | B2 | 예정 |
| c4_abba | abba_lock | 37 | C2 | 예정 |
| c4_fixedxor | fixed_xor | 20 | B4 | 공개 |
| c4_fixeddecoder | fixed_decoder_2to4 | 22 | C4 | 공개 |
| c4_cross | crossroad | 19 | B5 | 공개 |
| c5_register | register_bank | 38 | B1 | 예정 |
| c5_undo | undo_register | 39 | B3 | 예정 |
| c5_mail | mailbox | 40 | B2 | 예정 |
| c5_stack | stack | 41 | A2 | 예정 |
| c5_queue | queue | 42 | C2 | 예정 |
| c5_rx | serial_receiver | 43 | A1 | 예정 |
| c5_tx | serial_transmitter | 44 | C3 | 예정 |
| c5_accum | accumulator | 45 | B4 | 예정 |
| c5_iter | iterative_multiplier | 46 | B5 | 예정 |
