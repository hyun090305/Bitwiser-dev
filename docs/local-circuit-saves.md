# Electron 회로 파일 저장

Electron 정식판과 `npm start` 개발 실행은 Google 로그인 없이 컴퓨터에 회로를 저장합니다. 수동 저장과 설정에서 켠 채점 후 자동 저장은 매번 별도 저장본을 추가합니다. 저장 목록은 현재 스테이지 또는 사용자 문제와 정확히 일치하는 회로를 최신순으로 표시합니다. 저장 실패는 채점 결과나 진행/비용 기록의 성공 여부를 바꾸지 않습니다.

## 저장 위치와 백업

`electron/circuit-store.cjs`의 `getSavePaths(app.getPath('userData'))`가 고정 프로필 `local`의 경로를 결정합니다. 설치 폴더와 현재 작업 디렉터리는 저장 위치로 사용하지 않습니다.

| 내용 | 경로 |
| --- | --- |
| 복원 기준 회로 JSON | `<userData>/saves/profiles/local/circuits/<UUID>.json` |
| 재생성 가능한 GIF 캐시 | `<userData>/cache/circuit-previews/local/<UUID>.gif` |

Windows에서 현재 앱 이름 기준 기본 `userData`는 `%APPDATA%/bitwiser-dev`입니다. 패키지의 이름이나 플랫폼 설정이 바뀌면 실제 `app.getPath('userData')`를 기준으로 확인하세요. 이 PR의 테스트 실행은 `test-results/` 아래 별도 프로필을 사용합니다.

백업하려면 앱을 종료한 뒤 `saves/profiles/local/` 폴더 전체를 다른 위치에 복사합니다. 복구할 때도 앱을 종료하고 현재 폴더를 먼저 백업한 뒤 백업의 동일한 경로를 복원합니다. 파일명은 원래 UUID를 유지합니다. 같은 이름의 파일이 이미 있으면 덮어쓰기 전에 양쪽을 따로 보존하세요. GIF 캐시는 함께 복사해도 되지만 회로 복원에 필수는 아닙니다. 회로를 다시 저장하면 새 저장본의 미리보기를 생성합니다. 새 범용 import/export UI는 제공하지 않습니다.

손상 파일은 자동 삭제하지 않습니다. 목록은 읽지 못한 파일 수와 오류 유형을 안내하고 정상 항목은 계속 표시합니다. 문제가 생기면 앱을 종료하고 원본 폴더를 복사한 후 해당 JSON을 백업에서 복원하세요. 용량 부족, 권한 오류, 사라진 파일, 손상/지원하지 않는 파일은 서로 다른 안내를 표시합니다.

## 파일 처리와 격리

- main process만 파일에 접근합니다. sandbox/contextIsolation을 유지하고 nodeIntegration은 비활성화합니다. preload는 저장, 목록, 불러오기, 삭제, GIF 쓰기/읽기 6개 작업만 노출합니다. 임의 경로, 프로필, 채널을 받지 않습니다. IPC는 앱이 만든 창의 `app://bitwiser/index.html` 최상위 프레임만 허용합니다. [Electron IPC 안내](https://www.electronjs.org/docs/latest/tutorial/ipc)를 따릅니다.
- ID는 main에서 UUID v4로 생성합니다. 문제 제목/키는 메타데이터로만 보존합니다. 요청/JSON 구조, 크기(8 MiB), GIF 크기(16 MiB), 저장 경로와 디렉터리/파일 링크를 검증합니다. 기존 디스크 파일의 hard link도 거부합니다. 검증은 올바른 저장 구조를 확인하며 미완성 회로나 기존 다중 입력 회로의 논리적 오류를 임의 수정하지 않습니다.
- 하나의 프로필은 앱의 single-instance lock과 main 저장소 작업 큐로 직렬화합니다. 같은 이름의 저장본을 덮어쓰지 않습니다. 임시 파일을 배타적으로 열어 쓰고 flush/close한 다음 최종 이름으로 rename한 뒤에만 성공을 반환합니다. 실패 시 기존 정상 파일을 보존하며 임시 파일 정리를 시도합니다. 강제 종료로 남은 `.tmp`는 목록/불러오기 대상에서 제외하고 다음 실행에도 자동 삭제하지 않습니다. 갑작스러운 전원 손실이나 디스크 고장 전체에 대한 보장은 아니므로 별도 백업이 필요합니다.
- JSON이 commit된 뒤 GIF를 캡처하고 다른 폴더에 기록합니다. 인코딩/캐시 쓰기 실패는 “회로는 저장되었지만 미리보기는 실패”로 안내합니다. GIF 누락/손상은 목록이나 회로 불러오기를 막지 않습니다.
- 삭제 확인을 취소하면 요청을 보내지 않습니다. 확인하면 JSON을 먼저 삭제한 후 같은 ID의 GIF만 정리합니다. JSON 삭제 실패 시 목록과 최근 저장 참조를 유지합니다. JSON 삭제 후 GIF 정리에 실패하면 회로 삭제 성공과 캐시 정리 실패를 구분해 안내합니다. 동시 GIF 쓰기는 삭제된 회로의 캐시를 새로 만들지 않습니다.
- JSON v2/v3를 읽고 앱은 v3를 씁니다. timestamp가 없는 이전 파일도 읽으며 목록의 시간/정렬에만 파일 수정 시각을 사용합니다. 메타데이터와 D/EN·INPUT 방식을 유지하고 Q/tick/button 실행 상태는 저장하지 않습니다. 불러오기는 전체 구조와 현재 문제 문맥, 스테이지 revision/격자/고정 IO를 검증한 뒤 기존 복원·팔레트 동기화·실행 초기화 코드를 호출합니다. 검증 실패 시 편집 내용과 원본 파일을 보존합니다.

## 실행 환경과 기존 데이터

일반 브라우저의 `index.html`은 계속 부팅됩니다. native bridge가 없으면 회로 파일 저장/목록/자동 저장 설정을 비활성화하고 데스크톱 앱 전용 안내를 표시합니다. 새 웹 저장 시스템이나 Drive fallback은 없습니다. GIF 내보내기는 번들 `gif.js`와 `gif.worker.js`를 사용합니다.

웹 프리뷰/체험판은 기존 `bitwiser:web-demo:v1` localStorage 흐름을 그대로 사용합니다. 스테이지별 draft/best, 마지막 단계 재개, 백업/복구 형식은 바뀌지 않습니다. 회로 파일 목록이나 GIF를 localStorage에 넣지 않습니다. 공유 grading 모듈의 저장 기능은 체험판에서 호출하지 않습니다.

정식 웹 service worker는 새 캐시 버전을 사용하며 새 main/lang/grading 주소를 버전 구분합니다. 이전 cache-first 진입점이 새 파일을 요청하는 갱신 중에도 import가 실패하지 않도록 `src/modules/auth.js`에는 빈 `initializeAuth` 호환 export만 남깁니다. Drive 초기화나 토큰 처리는 없습니다. 이전 웹 캐시로 열려 있는 탭은 닫고 다시 열어 새 worker와 진입점을 함께 적용합니다. 체험판 캐시/백업 키는 별도입니다.

**기존 Google Drive 회로는 새 로컬 목록에 자동으로 나타나지 않습니다.** Drive 파일 삭제·권한 취소·계정 데이터 정리는 하지 않습니다. 파일 포맷 호환은 Drive 데이터 이전 완료를 의미하지 않습니다. 실제 데이터 이전이 필요하면 숨겨진 appDataFolder에서 원본을 보존하는 일회성 가져오기를 후속으로 다룹니다.

Firebase 계정·랭킹·커뮤니티 경로는 유지합니다. Google 로그인에 Drive scope, 오프라인 권한, refresh token 처리만 제거했습니다. 기존 설정·진행도·비용/계정 기록의 localStorage/Firebase 저장 경로를 삭제하거나 디스크로 이관하지 않습니다.

## Steam 후속 범위

이번 구현은 Steam SDK/계정/Cloud 없이 실행됩니다. 프로필 선택은 main의 경로 함수에 모여 있고 UI와 JSON 포맷은 Steam ID를 알지 않습니다. 회로 원본과 캐시를 나눠 후속 Auto-Cloud 대상에서 캐시를 제외할 수 있습니다.

Steam 계정별 프로필, Cloud 설정/충돌/다른 PC 동기화, local 프로필 가져오기는 후속 작업입니다. 현재 localStorage/Firebase의 설정·진행도·비용 기록까지 Steam Cloud에 동기화하려면 이 회로 저장 폴더와 별도로 설계해야 합니다.

## 검증

`npm test`는 임시 폴더에서 파일 round-trip, 동일 시점 저장, 문맥 구분, 장애 주입, 동시 작업, 손상/누락 파일, 경로/IPC 검증과 자동 저장 on/off를 검사합니다. `npm run test:saves:electron`은 모든 외부 HTTP(S) 요청을 차단하고 합성 회로를 저장한 뒤 Electron을 종료하고 새 프로세스로 재실행해 불러오기/삭제를 검사합니다. 실제 사용자 프로필이나 Drive 파일은 테스트하지 않습니다. 실행 결과와 화면은 커밋하지 않는 `test-results/`에 기록합니다.

추가 회귀 명령은 [개발 흐름](development-workflow.md)의 검증 표를 참고하세요. 패키지는 `npm run dist`로 생성하며 `electron/**/*`, `src/**/*`, 로컬 GIF 자산이 포함되어야 합니다. 패키지를 만든 뒤 `npm run test:saves:electron -- --packaged`로 실제 `Bitwiser.exe`/`app.asar`를 검사합니다. 검사기는 main 실행 전에 debugger에서 테스트 전용 userData와 외부 요청 차단을 적용하고 확인한 후 앱을 시작합니다. 제품에는 이 테스트 hook을 포함하지 않습니다. 개발 실행 결과와 패키지 실행 결과는 PR에서 별도로 기록합니다.
