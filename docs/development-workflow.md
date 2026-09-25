# ChatGPT ↔ GitHub ↔ Codex 개발 흐름

저장소: [hyun090305/Bitwiser-dev](https://github.com/hyun090305/Bitwiser-dev), 기본 통합 브랜치: `main`.

**현재 코드 확인 → GitHub Issue에 명세 정리 → Codex 구현·검증 → PR에서 완료 조건 대조 → 검토 후 병합** 순서로 진행합니다. GitHub에 기록한 Issue가 기능 요구사항의 기준이고, 실제 코드·테스트가 현재 동작의 근거입니다.

## 1. 연결과 적용 확인

- ChatGPT에서 GitHub 연결이 제공되는 환경을 사용하고 이 저장소에 대한 접근을 허용합니다. 먼저 현재 브랜치의 커밋 SHA와 `AGENTS.md`, `package.json`을 읽도록 요청해 접근을 확인합니다.
- **코드 읽기 권한과 Issue 생성 권한은 별개입니다.** 해당 대화에서 Issue 생성 도구를 사용할 수 있는지 확인합니다. 다음 실제 개발 명세를 생성한 뒤 GitHub Issue URL과 본문을 다시 읽어 저장 여부를 확인합니다. 도구가 없으면 작성한 본문을 GitHub의 Implementation spec 템플릿에 붙여 넣거나, GitHub 쓰기가 가능한 Codex 작업에 생성을 요청합니다. “생성했다”는 답변만으로 연결을 확인하지 않습니다.
- Codex는 이 저장소의 로컬 checkout 또는 연결된 cloud 환경에서 실행합니다. 로컬 폴더를 ChatGPT 프로젝트 자료로 첨부하는 것만으로 최신 코드가 자동 동기화되지는 않습니다. 공유할 코드 변경은 작업 브랜치에 커밋·push하고 브랜치와 SHA를 알려줍니다.
- Issue·PR 템플릿은 이 변경을 기본 브랜치에 병합한 후 GitHub 작성 화면에서 사용할 수 있습니다. API로 생성할 때는 템플릿이 자동 주입된다고 가정하지 말고 파일을 읽어 본문을 채웁니다. Markdown Issue 템플릿의 YAML front matter는 본문에서 제외합니다.
- 이 문서는 연결 권한, CI, 자동 실행, 자동 병합을 설정하지 않습니다. Issue URL을 Codex에 전달해 작업을 시작하는 방식이 기본입니다.

## 2. ChatGPT: 실제 코드로 implementation spec 작성

1. 원하는 결과와 사용자 행동을 정리한 뒤 저장소·대상 브랜치·전체 커밋 SHA를 기록합니다.
2. [AGENTS.md](../AGENTS.md), [architecture.md](architecture.md), 관련 소스·호출부·테스트를 읽습니다. 파일명이나 API를 과거 대화에서 추측하지 않습니다.
3. [Implementation spec 템플릿](../.github/ISSUE_TEMPLATE/implementation_spec.md)을 채웁니다. 현재 동작에는 코드 경로·심볼·커밋 고정 링크를, 목표에는 사용자의 행동과 기대 결과를 적습니다.
4. 범위, 제외 범위, 유지할 동작, 실패/경계 상황, 검증 방법을 명시합니다. 완료 조건은 `AC-1`, `AC-2`처럼 고유 ID를 붙이고 객관적으로 확인할 수 있게 씁니다.
5. 읽은 사실, 제안하는 설계, 아직 확인하지 못한 내용을 구분합니다. 동작을 바꿀 미결정 사항은 해결한 후 해당 부분을 구현 대상으로 넘깁니다. 수정 예상 파일은 안내이며 최종 변경 목록을 강제하지 않습니다.
6. 중복 Issue/PR을 확인하고 Issue를 생성합니다. 대화 중 확정된 변경은 Issue 본문에도 반영하고 결정 기록에 날짜·이유·관련 논의 링크를 남깁니다. 전체 본문을 교체하기 전 최신 내용을 읽어 다른 사람의 편집을 보존합니다.

ChatGPT에 전달할 요청 예시:

> hyun090305/Bitwiser-dev의 현재 main 코드와 AGENTS.md, docs/architecture.md, 관련 테스트를 읽어 주세요. 논의한 기능을 .github/ISSUE_TEMPLATE/implementation_spec.md 형식으로 정리하고 GitHub Issue를 생성해 주세요. 기준 커밋과 코드 근거를 기록하고, AC별 검증 방법과 유지할 기존 동작을 명시해 주세요. 읽지 못한 부분은 미확인으로 남기고 생성된 Issue URL을 알려 주세요.

## 3. Codex: Issue를 읽고 구현·PR 작성

Codex에 전달할 요청 예시 (`<Issue URL>`을 실제 주소로 교체):

> <Issue URL>을 구현해 주세요. 저장소의 AGENTS.md를 먼저 읽고 Issue 본문과 논의, 기준 커밋 대비 현재 코드를 확인하세요. Issue의 완료 조건과 제약을 구현 기준으로 삼고, 관련 검증을 실행한 다음 AC별 근거가 있는 PR을 만들어 주세요. 요구사항에 영향을 주는 미결정 사항만 질문하고 기존 동작과 사용자 변경을 보존해 주세요.

작업 절차:

1. 최신 Issue 본문과 논의, Git remote·branch·HEAD·작업 상태를 확인합니다. 예시 브랜치 이름은 `codex/issue-<번호>-<짧은설명>`입니다. 이미 해당 Issue 작업 브랜치가 있으면 이어서 사용합니다.
2. spec의 기준 SHA와 현재 소스를 비교합니다. 차이가 요구사항에 영향을 주면 근거와 조정 내용을 Issue에 반영합니다. 접근하지 못한 Issue는 읽었다고 간주하지 않습니다.
3. AC별 구현·검증 계획을 짧게 정리하고 필요한 변경만 수행합니다. 별도 채팅에서 확정된 범위 변경도 Issue에 반영해 다음 작업자가 같은 요구사항을 읽게 합니다.
4. 아래 표에서 관련 검증을 선택하고 실제 결과를 기록합니다. 실패가 기존 문제인지 판단하려면 필요할 때 깨끗한 기준 커밋에서도 재현합니다. 미실행 검증은 이유와 함께 미확인으로 남깁니다.
5. 변경 전체를 검토하고 작업 브랜치를 push한 뒤 [PR 템플릿](../.github/pull_request_template.md)을 채워 PR을 만듭니다. 전체 구현은 `Closes #번호`, 일부 구현은 `Refs #번호`를 씁니다. API 사용 시에도 템플릿 내용을 직접 반영합니다.
6. 모든 AC에 파일/심볼 또는 문서 위치, 검증 근거, 상태를 적습니다. 검증이 막혔거나 필수 AC가 미완료라면 draft로 남기고 원인을 씁니다. 최종 답변에는 Issue·PR 링크와 남은 사항을 제공합니다.

로컬에서 필요한 명령 예시:

```powershell
git remote -v
git status --short
git branch --show-current
git rev-parse HEAD
npm ci
npm test
npm run build:demo
git diff --check
```

`npm ci`는 새 checkout의 의존성을 lockfile대로 설치할 때 사용합니다. 문서만 고치며 설치가 필요 없다면 생략합니다. Node.js/npm이 필요하며 버전은 실행 기록에 남깁니다. 범용 `npm run build`, `npm run lint`는 현재 없습니다.

## 4. 변경에 맞는 검증

| 변경 영역 | 검증 |
| --- | --- |
| 문서·Issue/PR 템플릿만 변경 | 링크·소스 경로·명령 존재, front matter 및 필수 항목, `git diff --check` |
| JS·회로·데이터 동작 | `npm test` |
| 공통 UI/모듈·카탈로그·체험판 | `npm run build:demo`; 별도 터미널에서 `npm run preview:demo`를 켜고 `npm run test:demo:browser` |
| D·메모리·스테이지 데이터 | `npm run test:memory:browser`, `npm run test:stages:browser`; 메모리 20문제 변경은 `npm run test:memory20`, `npm run test:memory20:browser`도 선택 |
| 안내 배치·재생 제어 | `npm run build:demo` 후 `node scripts/verify-playback-status.mjs` 및 `node scripts/verify-playback-status.mjs --electron` — 한영/화면 폭별 실제 진입점의 표시 시간·좌표·자동/수동 재생 검사 |
| 채점·반례·결과 UI | `npm run test:grading:browser`, `npm run test:results:browser` |
| 비용·별·랭킹 | `npm run test:cost:browser` |
| 스테이지 맵·해금 | `npm run test:map:browser` |
| 정식 웹 진입·공통 초기화 | `npm run test:full:web` |
| Electron 또는 공통 코드의 데스크톱 영향 | `npm run test:full:electron` |
| Electron 회로 파일 저장 | `npm run test:saves:electron` — 별도 프로필에서 외부 네트워크 차단, 저장·종료·재실행·복원/삭제 |

브라우저 검사는 Playwright 의존성과 실제 브라우저가 필요합니다. 현재 스크립트는 기본 `msedge` 채널을 사용하며 지원되는 다른 채널은 `BROWSER_CHANNEL`로 지정합니다. 체험판 검사는 기본 `http://127.0.0.1:8080`을 사용합니다. 포트를 바꾸면 서버의 `DEMO_PORT`와 검사의 `DEMO_URL`을 함께 맞춥니다. 다른 검사의 서버/네트워크 전제는 해당 스크립트를 확인합니다. Electron/GPU·외부 서비스 접근이 막히면 환경 제약으로 기록하고 통과로 표시하지 않습니다.

`stages:generate`, `stages:memory20`, `stages:compact`는 데이터를 다시 쓰므로 일반 검증용으로 실행하지 않습니다. 생성 결과, `dist-web-demo/`, `test-results/`, 로컬 캐시는 필요한 근거만 공유하고 커밋 대상과 구분합니다.

## 5. PR 검토: 완료 조건과 diff 대조

1. **검토 기준 고정:** 최신 Issue 본문·결정 기록, PR의 base/head SHA를 읽고 검토 시점과 head SHA를 기록합니다. Issue나 PR head가 바뀌면 영향받는 AC를 다시 검토합니다.
2. **변경 전체 확인:** PR의 전체 파일 목록·diff와 주변 호출부를 읽습니다. diff가 잘리거나 생략되었으면 해당 base/head의 파일을 추가로 읽습니다. PR 작성자의 설명만으로 판정하지 않습니다.
3. **AC별 대조:** 아래 표를 작성합니다. `충족`, `미충족`, `미확인`을 구분하며, 테스트 통과만으로 UI·저장 호환·예외 처리를 모두 충족했다고 판단하지 않습니다.
4. **회귀·범위 확인:** 관련 웹/체험판/Electron 경로, 저장·해금·번역·tick·관측 시점 등 Issue가 유지하기로 한 동작과 불필요한 변경을 점검합니다.
5. **수정 전달:** 결함은 AC ID, 재현 조건, 기대/실제 동작, 파일·라인을 제시합니다. 근거 부족은 결함과 별도로 표시합니다. Codex가 같은 PR에서 수정하고 관련 검증·표를 갱신하면 다시 대조합니다.
6. **병합 판단:** 필수 AC와 필요한 검증이 충족되고 요청 범위를 벗어난 변경이 없는지 확인합니다. 병합·배포는 사용자에게 승인받은 작업 범위에 따라 처리합니다.

| AC | 요구 동작 | diff/코드 근거 | 검증 근거 | 판정·남은 조치 |
| --- | --- | --- | --- | --- |
| AC-1 | Issue 원문 요약 | 파일·심볼·줄 링크 | 실행 명령/수동 시나리오·결과 | 충족 / 미충족 / 미확인 |

ChatGPT에 전달할 검토 요청:

> <PR URL>과 연결된 Issue를 읽고 전체 diff를 검토해 주세요. 검토한 head SHA를 기록하고 각 AC에 대해 코드 근거·테스트 근거·충족 여부를 표로 정리해 주세요. Issue의 유지 조건과 범위도 확인하고, 문제는 파일·라인과 재현 조건을 들어 설명해 주세요. 실행하지 못한 검증은 미확인으로 구분해 주세요.

## 선택 사항: GitHub에서 Codex 리뷰 요청

연결된 Codex cloud 환경과 저장소의 Code review 설정이 준비되어 있으면 PR 댓글의 `@codex review`로 리뷰를 요청할 수 있습니다. 자동 리뷰는 별도 설정입니다. 설정을 켰는지는 계정에서 확인해야 하며, 문서 추가만으로 활성화되지는 않습니다. 봇 리뷰 유무와 관계없이 위 AC 대조 절차를 적용합니다.

공식 안내: [AGENTS.md 지침](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Codex GitHub 리뷰 설정](https://learn.chatgpt.com/docs/third-party/github), [GitHub Issue·PR 템플릿](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates).
