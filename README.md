# Bitwiser

Play bitwise. Become bit wiser.

웹 기반 조합·순차 논리 회로 시뮬레이터 게임입니다. 문제별 그리드 위에 입력(Input), 출력(Output), 논리 게이트(AND, OR, NOT), D 메모리와 와이어를 놓아 회로를 설계하고 시뮬레이션할 수 있습니다.

## 목차
- [기능](#기능)
- [데모](#데모)
- [시작하기](#시작하기)
  - [사전 준비](#사전-준비)
  - [설치](#설치)
  - [로컬 실행](#로컬-실행)
  - [배포](#배포)
- [사용법](#사용법)
- [프로젝트 구조](#프로젝트-구조)
- [개발 세부사항](#개발-세부사항)
- [개발 워크플로](#개발-워크플로)

## 기능
- **블록 끌어다 놓기**: 입력, 출력, AND/OR/NOT 게이트, 와이어 툴을 그리드에 배치
- **다중 명명된 입력/출력**: IN1, IN2… OUT1, OUT2… 형태로 여러 블록 지원
- **입력 토글**: 입력 블록 클릭 시 0↔1 전환, 활성 상태 시 하이라이트
- **와이어 모드**: 와이어 버튼 클릭 후 블록 간 클릭·드래그로 직선 및 L자 형태 연결
- **조합·순차 시뮬레이션**: 조합 논리는 위상 순서로 평가하고 D 메모리는 명시적인 tick에서 함께 갱신
- **자동 연결 해제**: 블록 이동 또는 삭제 시 연결된 와이어 자동 제거
- **와이어 방향 및 흐름 애니메이션**: 업/다운/좌/우 방향 설정 및 간단한 흐름 표시


## 데모

로그인 없이 Logic Core와 Memory Link의 17개 문제를 플레이하는 독립 웹 체험판입니다. 자동문이 체험판 마무리이며 선택 문제와 최적화 재도전은 계속 가능합니다. 자동 저장·백업 복원, 별·개인 기록, GIF 결과 공유를 제공합니다. 후반 세 챕터의 제목과 소개도 확인할 수 있습니다.

[메모리 20문제 최종 개편](docs/MEMORY20_INTEGRATION.md): 5개 챕터와 기존 ID·해금 경로를 유지하며 메모리 문제 20개를 최종 명세로 적용했습니다. 정식판 플레이 가능 47개, 후보 1개이며 체험판은 17개입니다. 순차 곱셈기 슬롯은 COMPLETE 기반 나눗셈기로 바뀌었습니다.

```powershell
npm install
npm run build:demo
npm run preview:demo
```

브라우저에서 `http://127.0.0.1:8080`을 엽니다. [체험판 개발·검증 문서](docs/WEB_DEMO.md)에 별 기준 회로, 저장 형식, 테스트 방법과 미확인 항목을 정리했습니다. 기존 웹·Electron 진입점은 유지됩니다.

## 시작하기

### 사전 준비
- 최신 웹 브라우저 (Chrome, Firefox, Edge 등)
- (선택) Python 3 설치

### 설치
```bash
git clone https://github.com/hyun090305/Bitwiser-dev.git
cd Bitwiser-dev
```

### 로컬 실행
- **Python 내장 서버**:
```bash
python3 -m http.server 8000
```
브라우저에서 `http://localhost:8000` 열기

- **Node.js serve 패키지**:
```bash
npm install -g serve
serve . -l 5000
```
브라우저에서 `http://localhost:5000` 열기

### 배포
- **GitHub Pages**: 리포지토리 설정 → Pages → Branch: `main`, Folder: `/root`
- **Netlify/Vercel**: GitHub 연동 후 자동 배포

## 사용법
1. 팔레트에서 블록(입력, 출력, 게이트)을 드래그하여 빈 셀에 배치
2. **와이어 모드** 버튼 클릭 → 블록에서 블록으로 드래그하여 연결
3. 입력 블록 클릭 → 값 0↔1 토글
4. **Simulate** 버튼 클릭 → 회로 평가, 출력 값(0/1) 표시
5. 블록 이동 또는 휴지통에 드래그하여 삭제 (와이어 자동 해제)

## 프로젝트 구조

정식 웹은 `index.html`과 `src/main.js`, Electron은 `electron/main.js`, 체험판은 `src/demo/`에서 시작합니다. UI·게임 흐름은 `src/modules/`, 회로 모델·평가·렌더링·조작은 `src/canvas/`에 있습니다. 현재 파일별 역할과 데이터 흐름은 [코드 지도](docs/architecture.md)를 참고하세요.

## 개발 세부사항

D 메모리의 동시 tick, 회로 저장 호환, 완전검증 채점과 반례 재생, 비용·별 규칙은 [코드 지도에 연결된 기존 명세](docs/architecture.md)에 정리되어 있습니다. 작업할 때 현재 코드와 테스트를 함께 확인하세요.

## 개발 워크플로

[ChatGPT ↔ GitHub ↔ Codex 작업 절차](docs/development-workflow.md)에 따라 현재 코드를 읽고 Issue에 명세를 정리한 뒤, Codex가 구현·검증하여 PR을 만듭니다. 검토 시 Issue의 완료 조건(AC)과 실제 diff·검증 근거를 대조합니다.

- [Codex 작업 지침](AGENTS.md)
- [Implementation spec 템플릿](.github/ISSUE_TEMPLATE/implementation_spec.md)
- [PR 템플릿](.github/pull_request_template.md)

## 향후 개발 예정 사항

아래는 초기 로드맵입니다. 이미 구현된 기능이 포함되어 있으므로 새 작업의 범위는 현재 코드와 Issue에서 확인하세요.

- **순차 논리 지원**: 플립플롭(Flip-Flop), 래치(Latch) 등의 순차 회로 요소 추가  
- **중간 게이트 출력 표시**: 각 AND/OR/NOT 블록의 출력값을 시뮬레이션 중 실시간으로 하이라이트  
- **에러 검출 기능**: 단선, 루프, 중복 연결 등 회로 이상 상태 경고  
- **회로 저장/불러오기**: JSON 또는 Netlist 포맷으로 설계 파일을 내보내기/가져오기  
- **UI 개선**:  
  - 그리드 크기 및 입력/출력 블록 갯수 동적 설정  
  - Undo/Redo 기능  
  - 모바일 터치 제어 지원  
- **애니메이션 향상**: 와이어 흐름 속도 제어, 다양한 애니메이션 효과  
- **테마 및 접근성**: 다크 모드, 컬러블라인드 호환 테마  
- **모듈화**: 서브회로(Subcircuit) 개념 도입, 계층적 설계 지원  
- **협업 기능**: 온라인 실시간 공동 편집 및 주석(Annotation) 기능
