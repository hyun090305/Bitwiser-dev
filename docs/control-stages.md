# 제어 스테이지 32·33·34 개편

2026-09-26 · [Issue #488](https://github.com/hyun090305/Bitwiser-dev/issues/488)
기준: `41eb412b76a2afbcac6aa3b8a18bfc07e34a5e68`.

| ID / 슬롯 | 현재 문제 | 포트 | reference | 보드 |
| --- | --- | --- | --- | --- |
| 32 / C4-06 | 양방향 카운터 / Up/Down Counter | INC·DEC → BIT0·BIT1 | `memory20:up-down-counter-no-reset` | 19×25 유지 |
| 33 / C4-07 | 점등 시간 조절 / Light Timing | LEVEL0·LEVEL1 → LIGHT | `memory20:light-timing` | 12×13 유지 |
| 34 / C4-10 | 예약 타이머 / Delay Timer | TIME0·TIME1·START → DONE | `memory20:delay-timer` | 7×8 → 15×24 |

현재 revision은 `control-stages-2026-09-26`이다. 숫자 ID, node ID
`up_down_counter`/`pwm`/`watchdog`, 맵 좌표·화살표·챕터 접근은 유지한다.
자유 IO, D/NOT/AND/OR/JUNCTION 및 null 별 기준도 유지하며 체험판 범위를 늘리지 않는다.

## 시간과 관측

32는 INC만 1이면 증가, DEC만 1이면 감소하고 둘 다 같으면 유지한다.
mod-4 순환이며 초기값은 0이다. RESET 입력은 없다.

33은 tick 0의 첫째 칸부터 네 칸을 반복한다. 첫 실제 tick 뒤 둘째 칸이다.
선택값 0/1/2/3의 패턴은 `0000`/`1000`/`1100`/`1110`이다. 현재 LEVEL은
즉시 현재 칸에 반영되며, 0을 골라도 시간은 진행한다. 기존 예시 카드 네 개로
각 패턴을 표시한다. Button 없이도 sequential 실행 모드와 재생 바를 유지한다.

34는 START를 샘플링한 tick s에 N을 기억하고 s+N에 완료한다. N=0도 실제
tick 이후에만 DONE=1이다. TIME 변경은 예약을 바꾸지 않는다. START는 이전
만료와 겹쳐도 새 예약을 우선하며, 연속 START와 연속 N=0 완료를 허용한다.
완료 뒤 자동 반복하지 않는다.

세 reference는 초기 → SET → 완료 tick의 visible 관측을 사용한다.
32/34는 SET만으로 출력이 바뀌지 않는다. 버튼 해제 목록은 INC/DEC, 없음,
START 순서다. DONE은 상태 키에 포함되어 대기와 완료 상태를 구별하며,
버튼 해제와 SET 이후에도 다음 실제 tick까지 유지된다. 공통 엔진과 채점 버전은 바꾸지 않는다.

자세한 규칙과 내부 기준 회로는 [카운터](handoff-20/specs/C4-06.md),
[점등 시간](handoff-20/specs/C4-07.md), [타이머](handoff-20/specs/C4-10.md)에 있다.

## 실제 해답과 저장 보존

32/33은 기존 배선에서 RESET 경로를 제거·연결하고 보드를 유지했다.
34는 2비트 mod-4 감소 회로와 ACTIVE 메모리를 사용하는 별도 평면 해답이다.
기준 회로는 각각 논리 26/12/28블록, JUNCTION 포함 31/13/35블록이다.
실제 직각 도선, 비중첩, 포트, D/EN 역할을 검사했다. 비용이나 보드의 최솟값을 주장하지 않는다.

이전 `memory20:C4-06`/`C4-07`/`C4-10` 및 `watchdog`의 의미는 그대로다.
기존 compact 정의를 `levelPreviousLayouts`에 중복 없이 추가하며, 기존 큰
고정 IO 정의와 `levelLegacyDefinitions[34]`를 덮어쓰지 않는다. 옛 compact
해답과 원래 watchdog 해답은 `tests/fixtures/legacy-memory/`에 보관한다.
기존 회로의 포트를 자동 삭제·변환하지 않는다.

기존 비용 기록은 문제별 규칙 서명이 달라 현재 best로 인정되지 않으며,
새 클리어 뒤에도 원본 회로와 역사적 별·클리어·챕터 접근은 보존된다.
체험판 백업에 포함된 세 문제는 기존 excluded-stage 보관 경로로 그대로 왕복한다.

## 재생성과 검증

`scripts/integrate-memory20.mjs`는 체크인된 fixture, 한영 copy, handoff
catalog·예시에서 생성한다. `npm run stages:memory20`을 두 번 반복하여
levels/map/report와 모든 추적 fixture의 바이트가 동일함을 확인했다.
기준 커밋의 나머지 스테이지와 맵 구조는 회귀 테스트의 해시로 대조한다.
독립 Python 보고서의 회로 해시는 LF로 정규화하여 Windows 줄바꿈에 따른 무관한 변경을 막는다.

2026-09-26, Node v22.18.0 / npm 10.9.3 / Python 3.12.7 / Windows:

| 실행 | 결과 |
| --- | --- |
| `npm test` | 180 tests 통과, 새 AC 전용 검사 8개 포함 |
| `npm run test:memory20` | 8 tests 통과, 20개 실제 회로 및 독립 전이 대조 |
| `python -X utf8 docs/handoff-20/verify.py` | 20/20 평면·전수 검사, 일반 5,202 전이 + 나눗셈 108 tick |
| `node docs/handoff-20/verify_js.cjs` | Python/JS 5,310 전이 일치 |
| `npm run build:demo` | 통과, 기존 17개 문제 범위 유지 |
| `npm run test:memory20:browser` | 정식 웹에서 20개 회로 UI 채점 통과 |
| `npm run test:memory:browser`, `npm run test:stages:browser` | 입력·D/EN·재생·복원·백업 검사 통과 |
| `npm run test:grading:browser`, `npm run test:results:browser` | 관측 시점·실패 카드·재생·복원 통과 |
| `npm run test:full:web`, `npm run test:full:electron` | 48개 제목, 기존 계정/Lab 진입, 오류 없음 |
| `npm run test:demo:browser` | 체험판 채점·복구·한영·챕터 접근 통과 |
| `node scripts/verify-control-stages.mjs` | 한영 실제 버튼/스위치 조작, 자동 재생·일시정지, 3개 채점·타이머 반례 프레임 일치, 모바일 네 패턴 확인 |
| `node scripts/verify-control-stages.mjs --electron` | 격리 프로필의 실제 Electron 한영 입력·시간·채점·반례 프레임 일치 |
| `git diff --check` | 통과 |

Electron은 샌드박스 내 GPU 프로세스 시작 실패 후, 샌드박스 밖의 격리 테스트
프로필로 통과했다. 전용 Electron 기능 검사는 외부 네트워크를 차단했다.
온라인 계정 업로드·랭킹 서비스, 설치 패키지, 다른 OS/브라우저는 검증하지 않았다.
원본 오프라인 HTML·MANIFEST·viewer 보고서는 2026-09-18 자료로 보존하며
현재 세 문제의 해답 자료는 개별 spec/circuit/fixture를 따른다.
