
let lastDraggedType = null;
let lastDraggedIcon = null;
let lastDraggedFromCell = null;
let lastDraggedName = null;
let currentLevel = null;
let currentCustomProblem = null;
let currentCustomProblemKey = null;

let isWireDrawing = false;
let isMouseDown = false;
let wireTrace = [];     // 드래그 경로
let GRID_ROWS = 6;
let GRID_COLS = 6;
let wires = [];  // { path, start, end } 객체를 저장할 배열
let problemOutputsValid = false;
let problemScreenPrev = null;  // 문제 출제 화면 진입 이전 화면 기록
let loginFromMainScreen = false;  // 메인 화면에서 로그인 여부 추적

let lastSavedKey = null;
let pendingClearedLevel = null;

const circuitErrorMsg = document.getElementById('circuitError');
let circuitHasError = false;
function showCircuitError(show) {
  circuitHasError = show;
  if (circuitErrorMsg) {
    circuitErrorMsg.style.display = show ? 'block' : 'none';
  }
}

// GIF 생성 관련 요소들
const captureCanvas = document.getElementById('captureCanvas');
const gifModal = document.getElementById('gifModal');
const closeGifModalBtn = document.getElementById('closeGifModal');
const gifPreview = document.getElementById('gifPreview');
const saveGifBtn = document.getElementById('saveGifBtn');
const shareGifBtn = document.getElementById('shareGifBtn');
const gifLoadingModal = document.getElementById('gifLoadingModal');
const gifLoadingText = document.getElementById('gifLoadingText');
let currentGifBlob = null;
let currentGifUrl = null;
// GIF 해상도를 키우기 위한 배율
const GIF_SCALE = 2;
if (closeGifModalBtn) {
  closeGifModalBtn.addEventListener('click', () => {
    if (gifModal) gifModal.style.display = 'none';
    if (gifPreview && currentGifUrl) {
      URL.revokeObjectURL(currentGifUrl);
      gifPreview.src = '';
      currentGifUrl = null;
    }
    currentGifBlob = null;
  });
}
if (saveGifBtn) {
  saveGifBtn.addEventListener('click', () => {
    if (!currentGifUrl) return;
    window.open(currentGifUrl, '_blank');
  });
}
if (shareGifBtn) {
  shareGifBtn.addEventListener('click', async () => {
    if (!currentGifBlob) return;
    const file = new File([currentGifBlob], 'circuit.gif', { type: 'image/gif' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Bitwiser GIF' });
      } catch (err) {
        console.error(err);
      }
    } else {
      alert('이 브라우저에서는 공유하기를 지원하지 않습니다.');
    }
  });
}

function resetCaptureCanvas() {
  if (!captureCanvas) return;
  const ctx = captureCanvas.getContext('2d');
  ctx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  captureCanvas.width = 0;
  captureCanvas.height = 0;
}

// 초기 로딩 관련
const initialTasks = [];
let stageDataPromise = Promise.resolve();
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.style.display = 'none';
}


// --- 모바일 터치 기반 드래그 지원 폴리필 ---
function enableTouchDrag() {
  let dragEl = null;
  const data = {};
  const dt = {
    setData: (t, v) => data[t] = v,
    getData: t => data[t]
  };

  document.addEventListener('touchstart', e => {
    const target = e.target.closest('[draggable="true"]');
    if (!target) return;
    dragEl = target;
    data.text = '';
    const ev = new Event('dragstart', { bubbles: true });
    ev.dataTransfer = dt;
    target.dispatchEvent(ev);
  });

  document.addEventListener('touchmove', e => {
    if (!dragEl) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el) {
      const over = new Event('dragover', { bubbles: true });
      over.dataTransfer = dt;
      el.dispatchEvent(over);
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (!dragEl) return;
    const t = e.changedTouches[0];
    let dropTarget = document.elementFromPoint(t.clientX, t.clientY);

    // 드롭 가능 요소만 허용
    if (dropTarget) {
      const cell  = dropTarget.closest('.cell');
      const trash = dropTarget.closest('.trash-area');
      if (cell) {
        const ctrlActive = e.ctrlKey || statusToggle.classList.contains('active');
        if (!(ctrlActive && (!cell.dataset.type || cell.dataset.type === 'WIRE'))) {
          dropTarget = cell;
        } else {
          dropTarget = null;
        }
      } else if (trash) {
        dropTarget = trash;
      } else {
        dropTarget = null;
      }
    }

    if (dropTarget) {
      const dropEv = new Event('drop', { bubbles: true });
      dropEv.dataTransfer = dt;
      dropTarget.dispatchEvent(dropEv);
    }

    const endEv = new Event('dragend', { bubbles: true });
    endEv.dataTransfer = dt;
    dragEl.dispatchEvent(endEv);
    dragEl = null;
  });
}



let levelTitles = {};
let levelGridSizes = {};
let levelBlockSets = {};
let chapterData = [];
let selectedChapterIndex = 0;
let levelAnswers = {};
let levelDescriptions = {};
let levelHints = {};

function loadStageData() {
  const file = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'levels_en.json' : 'levels.json';
  return fetch(file)
    .then(res => res.json())
    .then(data => {
      levelTitles = data.levelTitles;
      levelGridSizes = data.levelGridSizes;
      levelBlockSets = data.levelBlockSets;
      chapterData = data.chapterData;
      levelAnswers = data.levelAnswers;
      levelDescriptions = data.levelDescriptions;
      levelHints = data.levelHints || {};
    });
}



const validWireShapes = [
  ["wire-up", "wire-down"],
  ["wire-left", "wire-right"],
  ["wire-up", "wire-right"],
  ["wire-right", "wire-down"],
  ["wire-down", "wire-left"],
  ["wire-left", "wire-up"]
];

function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/***** UI 요소 *****/

const statusToggle  = document.getElementById("wireStatusInfo");
const deleteToggle  = document.getElementById("wireDeleteInfo");
const resetToggle   = document.getElementById("DeleteAllInfo");
const problemStatusToggle = document.getElementById('problemWireStatusInfo');
const problemDeleteToggle = document.getElementById('problemWireDeleteInfo');
const problemResetToggle  = document.getElementById('problemDeleteAllInfo');
const moveUpBtn    = document.getElementById('moveUpBtn');
const moveDownBtn  = document.getElementById('moveDownBtn');
const moveLeftBtn  = document.getElementById('moveLeftBtn');
const moveRightBtn = document.getElementById('moveRightBtn');
const problemMoveUpBtn    = document.getElementById('problemMoveUpBtn');
const problemMoveDownBtn  = document.getElementById('problemMoveDownBtn');
const problemMoveLeftBtn  = document.getElementById('problemMoveLeftBtn');
const problemMoveRightBtn = document.getElementById('problemMoveRightBtn');
let grid;

function simulateKey(key, type = 'keydown') {
  const ev = new KeyboardEvent(type, { key, bubbles: true });
  document.dispatchEvent(ev);
}

function setupKeyToggles() {
  const bindings = [
    [statusToggle, 'Control'],
    [deleteToggle, 'Shift'],
    [resetToggle, 'r'],
    [problemStatusToggle, 'Control'],
    [problemDeleteToggle, 'Shift'],
    [problemResetToggle, 'r']
  ];

  bindings.forEach(([btn, key]) => {
    if (!btn) return;
    if (key.toLowerCase() === 'r') {
      btn.addEventListener('click', () => {
        btn.classList.add('active');
        simulateKey(key, 'keydown');
        simulateKey(key, 'keyup');
        setTimeout(() => btn.classList.remove('active'), 150);
      });
    } else {
      btn.addEventListener('click', () => {
        const active = !btn.classList.contains('active');
        btn.classList.toggle('active', active);
        simulateKey(key, active ? 'keydown' : 'keyup');
      });
    }
  });

  document.addEventListener('keydown', e => {
    if (isTextInputFocused() && e.key.toLowerCase() === 'r') {
      bindings.forEach(([btn, key]) => {
        if (key.toLowerCase() === 'r') btn.classList.remove('active');
      });
      return;
    }
    bindings.forEach(([btn, key]) => {
      if (e.key === key) {
        btn.classList.add('active');
        if (key.toLowerCase() === 'r') {
          setTimeout(() => btn.classList.remove('active'), 150);
        }
      }
    });
  });

  document.addEventListener('keyup', e => {
    bindings.forEach(([btn, key]) => {
      if (e.key === key && key.toLowerCase() !== 'r') {
        btn.classList.remove('active');
      }
    });
  });
}

// (2) 페이지 로드 시 INPUT 블록 클릭으로 0↔1 토글 준비
//setupInputToggles();

/*--------------------------------------------------
  3.  Grid 셀 생성 + 기본 Drag&Drop
--------------------------------------------------*/


/*--------------------------------------------------
  4.  Wire 드래그 트래킹
--------------------------------------------------*/

// ——— wire 미리보기 완전 삭제 함수 ———
function clearWirePreview() {
  // 기존에는 페이지 내의 모든 그리드 셀을 탐색하던 탓에
  // 문제 제작 화면에서 게임 화면으로 돌아왔을 때 숨겨진 셀까지
  // 영향받아 회로 계산이 잘못되는 문제가 있었다.
  // 현재 활성화된 grid 내부에서만 처리하도록 수정한다.
  grid.querySelectorAll('.cell.wire-preview').forEach(cell => {
    cell.classList.remove('wire-preview');
  });
}

// ——— wire 그리기 취소 헬퍼 함수 ———
function cancelWireDrawing() {
  if (!isWireDrawing) return;
  isWireDrawing = false;
  wireTrace = [];
  clearWirePreview();          // ① 미리보기 클래스 제거
}




function track(ev) {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!el || !el.classList.contains("cell")) return;

  const last = wireTrace.at(-1);
  if (el === last) return;

  const elIdx = +el.dataset.index;

  // ▶ 되돌아가는 경우 막기 (이전 셀로 역방향 이동 시 무시)
  if (wireTrace.length >= 2) {
    const prev = wireTrace[wireTrace.length - 2];
    if (+prev.dataset.index === elIdx) return;
  }

  fillLShapeGap(last, el).forEach(mid => {
    if (!mid || wireTrace.includes(mid) || mid.dataset.type === "WIRE") return;
    mid.classList.add("wire-preview");
    wireTrace.push(mid);
  });

  el.classList.add("wire-preview");
  if (!wireTrace.includes(el)) {
    el.classList.add("wire-preview");
    wireTrace.push(el);
  }
  el.classList.add("wire-preview");
}

function trackTouch(e) {
  const t = e.touches && e.touches[0];
  if (!t) return;
  track({ clientX: t.clientX, clientY: t.clientY });
  e.preventDefault();
}

function finishTouch(e) {
  document.removeEventListener("touchmove", trackTouch);
  document.removeEventListener("touchend", finishTouch);
  const t = e.changedTouches && e.changedTouches[0];
  if (!t) return;
  const target = document.elementFromPoint(t.clientX, t.clientY);
  finish({ clientX: t.clientX, clientY: t.clientY, target });
  e.preventDefault();
}

function gridTouchMove(e) {
  if (!isWireDrawing) return;
  if (wireTrace.length === 0) return;
  const t = e.touches && e.touches[0];
  if (!t) return;
  const el = document.elementFromPoint(t.clientX, t.clientY);
  const cell = el?.closest(".cell");
  if (!cell) return;

  const idx = parseInt(cell.dataset.index, 10);
  const lastIdx = Number(wireTrace.at(-1).dataset.index);
  if (idx === lastIdx) return;

  const path = getInterpolatedIndices(lastIdx, idx);
  path.forEach(i => {
    const cellEl = grid.children[i];
    if (!wireTrace.includes(cellEl)) {
      cellEl.classList.add("wire-preview");
      wireTrace.push(cellEl);
    }
  });
  e.preventDefault();
}

// 셀 인덱스(문자열) → [row, col] 좌표
function indexToCoord1(idx) {
  const i = +idx;
  return [Math.floor(i / GRID_COLS), i % GRID_COLS];
}

// 두 셀이 그리드 상에서 인접한지 확인 (맨해튼 거리 1)
function areAdjacent(cellA, cellB) {
  const [r1, c1] = indexToCoord1(cellA.dataset.index);
  const [r2, c2] = indexToCoord1(cellB.dataset.index);
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function finish(e) {
  // 1) 리스너 해제
  document.removeEventListener("mousemove", track);
  document.removeEventListener("mouseup", finish);
  document.removeEventListener("touchmove", trackTouch);
  document.removeEventListener("touchend", finishTouch);
  isMouseDown = false;
  const middle = wireTrace.slice(1, -1);
  if (middle.some(c => c.dataset.type)) {
    // 미리보기 지우고 원상복구
    wireTrace.forEach(c => c.classList.remove("wire-preview"));
    wireTrace = [];
    isWireDrawing = false;
    statusToggle.classList.remove("active");
    return;
  }
  // 2) 드롭한 셀 확인 & 마지막에 추가
  let dropCell = e.target.closest(".cell");
  if (!dropCell || !grid.contains(dropCell)) dropCell = null;
  if (dropCell && dropCell !== wireTrace.at(-1)) {
    dropCell.classList.add("wire-preview");
    wireTrace.push(dropCell);
  }

  // 3) 인접성 검사: wireTrace 상의 모든 인접 쌍이 실제 그리드에서 옆 칸인지 확인
  for (let i = 1; i < wireTrace.length; i++) {
    if (!areAdjacent(wireTrace[i - 1], wireTrace[i])) {
      // 비인접 이동이 있으면 전부 취소
      wireTrace.forEach(c => c.classList.remove("wire-preview"));
      wireTrace = [];
      isWireDrawing = false;
      statusToggle.classList.remove("active");
      return;
    }
  }

  // 4) 기존 조건 검사
  const start = wireTrace[0];
  const end = wireTrace.at(-1);
  const startIsBlock = start.dataset.type && start.dataset.type !== "WIRE";
  const endIsBlock = end.dataset.type && end.dataset.type !== "WIRE";
  const hasOldWire = wireTrace.some(c => c.dataset.type === "WIRE");

  // 5) 실제 그리기 or 취소
  if (startIsBlock && endIsBlock && wireTrace.length > 2 && !hasOldWire) {
    drawWirePath(wireTrace);
  } else {
    // 조건 하나라도 만족 못 하면 전부 취소
    wireTrace.forEach(c => c.classList.remove("wire-preview"));
  }

  // 6) 리셋
  wireTrace = [];
  isWireDrawing = false;
  statusToggle.classList.remove("active");
}

// 이전: DOM 기반 와이어 연쇄 해제
function disconnectWiresCascade(startBlock) {
  // startBlock에 직접 연결된 wire만 추출
  const related = wires.filter(w => w.start === startBlock || w.end === startBlock);

  related.forEach(w => {
    // 전선 셀 초기화
    w.path.forEach(c => {
      if (c.dataset.type === "WIRE") {
        c.classList.remove(
          "wire", "wire-preview",
          "wire-up", "wire-down", "wire-left", "wire-right",
          "flow-left", "flow-right", "flow-up", "flow-down",
          "h", "v", "corner"
        );
        delete c.dataset.type;
      }
    });

    // 연결된 반대편 블록은 남겨둠
    const neighbor = (w.start === startBlock) ? w.end : w.start;
    if (neighbor.dataset.type && neighbor.dataset.type !== "WIRE") {
      neighbor.draggable = true;
    }
  });

  // wires 배열에서 해당 연결 제거
  wires = wires.filter(w => w.start !== startBlock && w.end !== startBlock);
  markCircuitModified();
}

/*--------------------------------------------------
  5.  보조 함수
--------------------------------------------------*/
function fillLShapeGap(prev, curr) {
  const pi = +prev.dataset.index, ci = +curr.dataset.index;
  const pr = Math.floor(pi / GRID_COLS), pc = pi % GRID_COLS;
  const cr = Math.floor(ci / GRID_COLS), cc = ci % GRID_COLS;

  if (pr !== cr && pc !== cc) {                 // 대각선으로 건너뛴 경우
    const mids = [];

    // (1) prev 바로 위·아래 세로 칸
    const vIdx = cr > pr ? pi + GRID_COLS : pi - GRID_COLS;
    const vMid = grid.children[vIdx];
    if (vMid && !vMid.dataset.type && !wireTrace.includes(vMid)) mids.push(vMid);

    // (2) prev 바로 좌·우 가로 칸
    const hIdx = cc > pc ? pi + 1 : pi - 1;
    const hMid = grid.children[hIdx];
    if (hMid && !hMid.dataset.type && !wireTrace.includes(hMid)) mids.push(hMid);

    return mids;                                // 두 칸 모두 반환
  }
  return [];
}

// 인덱스 → {row, col}
function indexToCoord(idx) {
  return {
    row: Math.floor(idx / GRID_COLS),
    col: idx % GRID_COLS
  };
}

// {row, col} → 인덱스
function coordToIndex({ row, col }) {
  return row * GRID_COLS + col;
}

// 두 셀 인덱스 사이의 “격자 보간” 경로를 반환
// 이전: DOM 기반 경로 보간 함수
function getInterpolatedIndices(fromIdx, toIdx) {
  const p0 = indexToCoord(fromIdx);
  const p1 = indexToCoord(toIdx);
  const dx = p1.col - p0.col;
  const dy = p1.row - p0.row;
  const seq = [];

  // 1) 가로 이동분 먼저 채우기
  const stepX = dx === 0 ? 0 : dx / Math.abs(dx);
  for (let i = 1; i <= Math.abs(dx); i++) {
    seq.push(coordToIndex({ row: p0.row, col: p0.col + stepX * i }));
  }

  // 2) 세로 이동분 채우기
  const stepY = dy === 0 ? 0 : dy / Math.abs(dy);
  for (let i = 1; i <= Math.abs(dy); i++) {
    seq.push(coordToIndex({ row: p0.row + stepY * i, col: p1.col }));
  }

  return seq;
}


// wire 모드 해제 (다른 곳 클릭 시)
document.addEventListener("click", e => {
  if (!e.target.closest('.toggle-key')) {
    isWireDrawing = false;
    statusToggle.classList.remove("active");
  }
});

// 드래그 종료 시 INPUT/OUTPUT 복구
document.addEventListener("dragend", () => {
  if (["INPUT", "OUTPUT"].includes(lastDraggedType)) {
    // 현재 사용 중인 grid 내부에서만 존재 여부를 확인한다.
    const found = [...grid.querySelectorAll(".cell")].some(
      c => c.dataset.type === lastDraggedType
    );
    if (!found && lastDraggedIcon) {
      lastDraggedIcon.style.display = "inline-flex";
    }
  }
  lastDraggedName = null;
  lastDraggedType = null;
  lastDraggedIcon = null;
  lastDraggedFromCell = null;
});

// 선택지 드래그
attachDragHandlersToBlockIcons()

// 휴지통 처리
document.querySelectorAll('.trash-area').forEach(trashEl => {
  trashEl.addEventListener('dragover', e => e.preventDefault());
  trashEl.addEventListener('drop', () => {
    if (["INPUT", "OUTPUT"].includes(lastDraggedType)) {
      const panel = getBlockPanel();  // blockPanel 또는 problemBlockPanel 반환
      const icon = panel.querySelector(
        `.blockIcon[data-type="${lastDraggedType}"][data-name="${lastDraggedName}"]`
      );
      if (icon) icon.style.display = "inline-flex";
    }
    if (lastDraggedFromCell) {
      // ─── 수정: cascade delete 호출 ───
      disconnectWiresCascade(lastDraggedFromCell);
      resetCell(lastDraggedFromCell);
      // 기존 블록 삭제 로직
      lastDraggedFromCell.classList.remove("block", "wire");
      lastDraggedFromCell.innerText = "";
      delete lastDraggedFromCell.dataset.type;
      lastDraggedFromCell.removeAttribute("draggable");
    }
    markCircuitModified();
    lastDraggedType = null;
    lastDraggedIcon = null;
    lastDraggedFromCell = null;
  });
});




function updateOneWireDirection(cell) {
  const index = parseInt(cell.dataset.index);
  const gridSize = GRID_COLS;
  // 다른 화면의 그리드 셀까지 포함하지 않도록 현재 grid 기준으로 조회
  const cells = grid.querySelectorAll(".cell");

  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  const dirs = [];

  const dirOffsets = [
    { dir: "wire-up", r: -1, c: 0 },
    { dir: "wire-down", r: +1, c: 0 },
    { dir: "wire-left", r: 0, c: -1 },
    { dir: "wire-right", r: 0, c: +1 },
  ];

  for (const { dir, r, c } of dirOffsets) {
    const newRow = row + r;
    const newCol = col + c;
    if (newRow < 0 || newRow >= gridSize || newCol < 0 || newCol >= gridSize) continue;

    const neighborIndex = newRow * gridSize + newCol;
    const neighbor = cells[neighborIndex];
    if (neighbor.dataset.type === "WIRE") dirs.push(dir);
  }

  applyWireDirection(cell, dirs);
}

// 이전: DOM 기반 와이어 렌더링 함수 (Canvas 전환으로 미사용 예정)
function drawWirePath(path) {
  path.forEach(c => c.classList.remove("wire-preview"));
  path.forEach(c => {
    if (!c.dataset.type) {
      c.dataset.type = "WIRE";
      c.classList.add("wire");
    }
  });

  const total = path.length;
  for (let i = 0; i < total; i++) {
    const cell = path[i];
    const dirs = new Set();

    // 시작 셀: 다음 셀 기준으로 방향 지정
    if (i === 0 && total > 1) {
      getDirectionBetween(cell, path[1]).forEach(d => dirs.add(d));
    }
    // 끝 셀: 이전 셀 기준으로 방향 지정
    else if (i === total - 1 && total > 1) {
      getDirectionBetween(cell, path[total - 2]).forEach(d => dirs.add(d));
    }
    // 중간 셀: 앞뒤 기준으로 방향 지정
    else {
      if (i > 0) getDirectionBetween(cell, path[i - 1]).forEach(d => dirs.add(d));
      if (i < total - 1) getDirectionBetween(cell, path[i + 1]).forEach(d => dirs.add(d));
    }

    if (!cell.classList.contains('block')) {
      applyWireDirection(cell, Array.from(dirs));
    }
  }
  // ▶ 시작·끝 블록이 draggable이어야만 이동 가능
  const start = path[0], end = path[path.length - 1];
  if (start.dataset.type && start.dataset.type !== "WIRE") start.draggable = true;
  if (end.dataset.type && end.dataset.type !== "WIRE") end.draggable = true;

  wires.push({
    path: [...path],       // Array<cell> 복사
    start: path[0],        // 시작 블록 cell
    end: path[path.length - 1]  // 끝 블록 cell
  });
  markCircuitModified();

  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    cell.classList.remove("flow-left", "flow-right", "flow-up", "flow-down"); // 혹시 남아있을 때 대비

    // (1) 이전 셀 → 현재 셀 방향
    if (i > 0) {
      const prev = path[i - 1];
      cell.classList.add(getFlowClass(prev, cell));
    }
    // (2) 현재 셀 → 다음 셀 방향
    if (i < path.length - 1) {
      const next = path[i + 1];
      cell.classList.add(getFlowClass(cell, next));
    }
  }

  evaluateCircuit();
}
function getNeighbourWireDirs(cell) {
  const idx = +cell.dataset.index, g = GRID_COLS;
  // 현재 보이는 grid의 셀만 고려한다
  const cells = grid.querySelectorAll(".cell");
  const map = [
    { d: "wire-up", n: idx - g },
    { d: "wire-down", n: idx + g },
    { d: "wire-left", n: (idx % g !== 0) ? idx - 1 : -1 },
    { d: "wire-right", n: (idx % g !== g - 1) ? idx + 1 : -1 }
  ];
  return map.reduce((out, { d, n }) => {
    // ✅ 반드시 “현재 cell에 static 클래스 d가 붙어 있어야”  
    // ✅ 그리고 이웃 셀이 실제 wire이어야
    if (n >= 0 && n < cells.length
      && cell.classList.contains(d)
      && cells[n].dataset.type) {
      out.push(d);
    }
    return out;
  }, []);
}


function getDirectionBetween(fromCell, toCell) {
  const from = parseInt(fromCell.dataset.index);
  const to = parseInt(toCell.dataset.index);
  const gridSize = GRID_COLS;
  const fromRow = Math.floor(from / gridSize);
  const fromCol = from % gridSize;
  const toRow = Math.floor(to / gridSize);
  const toCol = to % gridSize;

  if (fromRow === toRow) {
    if (fromCol - 1 === toCol) return ["wire-left"];
    if (fromCol + 1 === toCol) return ["wire-right"];
  }
  if (fromCol === toCol) {
    if (fromRow - 1 === toRow) return ["wire-up"];
    if (fromRow + 1 === toRow) return ["wire-down"];
  }
  return [];
}

// 수정 후:
// 이전: div 기반 와이어 방향 클래스 적용
function applyWireDirection(cell, dirs) {
  /* ▼▼▼ ① 교차 방지 필터  ▼▼▼ */
  if (dirs.length > 2) {
    const keep = [];
    if (dirs.includes("wire-left") || dirs.includes("wire-right")) {
      keep.push(dirs.includes("wire-left") ? "wire-left" : "wire-right");
    }
    if (dirs.includes("wire-up") || dirs.includes("wire-down")) {
      keep.push(dirs.includes("wire-up") ? "wire-up" : "wire-down");
    }
    dirs = keep;   // 세 방향 이상일 때만 L자(두 방향)로 축소
  }
  /* ▲▲▲ ① 끝  ▲▲▲ */

  /* ② 기존 코드: 클래스 리셋 및 재적용 */
  cell.classList.remove(
    'wire-up', 'wire-down', 'wire-left', 'wire-right',
    'h', 'v', 'corner'
  );
  cell.classList.add(...dirs);

  const plain = dirs.map(d => d.replace('wire-', ''));

  /* ③ 애니메이션용 클래스 유지 로직(변경 없음) */
  const horiz = plain.some(p => p === 'left' || p === 'right');
  const vert = plain.some(p => p === 'up' || p === 'down');

  if (horiz && vert) {
    cell.classList.add('corner');     // ㄱ 셀
  } else if (horiz) {
    cell.classList.add('h');          // 가로 직선
  } else if (vert) {
    cell.classList.add('v');          // 세로 직선
  }
}



// 새로 추가
function getFlowClass(curr, next) {
  const c = +curr.dataset.index, n = +next.dataset.index;
  const g = GRID_COLS;
  if (n === c + 1) return "flow-right";
  if (n === c - 1) return "flow-left";
  if (n === c + g) return "flow-down";
  return "flow-up";   // n === c - g
}

/* 2) INPUT 블록 토글 설정 (0 ↔ 1) */
function setupInputToggles() {
  grid.querySelectorAll('.cell.block').forEach(cell => {
    if (cell.dataset.type === 'INPUT') {
      cell.dataset.value = '0';
      cell.textContent = cell.dataset.name;
      //cell.textContent = `${cell.dataset.name}(${cell.dataset.value})`;
      cell.addEventListener('click', () => {
        cell.dataset.value = cell.dataset.value === '0' ? '1' : '0';
        cell.textContent = cell.dataset.name;
        //cell.textContent = `${cell.dataset.name}(${cell.dataset.value})`;
        cell.classList.toggle('active', cell.dataset.value === '1');

        evaluateCircuit();
      });
    }
  });

}

/* 3) 회로 평가 엔진 (BFS 기반) */
// 이전: DOM 기반 회로 평가 로직
function evaluateCircuit() {
  showCircuitError(false);
  // 1) 모든 블록과 INPUT 초기값 준비
  const blocks = Array.from(grid.querySelectorAll('.cell.block'));
  const values = new Map();
  blocks
    .filter(b => b.dataset.type === 'INPUT')
    .forEach(b => values.set(b, b.dataset.value === '1'));

  // 2) 값이 더 이상 바뀌지 않을 때까지 반복
  let changed = true;
  let iterations = 0;
  while (changed) {
    if (iterations++ > 1000) {
      showCircuitError(true);
      return;
    }
    changed = false;
    for (const node of blocks) {
      const oldVal = values.get(node);
      const newVal = computeBlock(node, values);
      // newVal이 정의되어 있고(oldVal과 달라졌다면) 업데이트
      if (newVal !== undefined && newVal !== oldVal) {
        values.set(node, newVal);
        changed = true;
      }
    }
  }

  // 3) OUTPUT 블록 화면 갱신
  blocks
    .filter(b => b.dataset.type === 'OUTPUT')
    .forEach(out => {
      const v = values.get(out) || false;
      out.textContent = out.dataset.name
      out.dataset.val = v
      out.classList.toggle('active', v);
    });

  // JUNCTION 블록의 현재 상태에 따라 테두리 점선 표시
  blocks
    .filter(b => b.dataset.type === 'JUNCTION')
    .forEach(junction => {
      const v = values.get(junction) || false;
      junction.classList.toggle('active', v);
    });

  const allBlocks = Array.from(grid.querySelectorAll('.cell.block'));
  allBlocks
    .filter(b => b.dataset.type === "JUNCTION")
    .forEach(junction => {
      const inputs = getIncomingBlocks(junction);
      if (inputs.length > 1) {
        junction.classList.add("error");
      } else {
        junction.classList.remove("error");
      }
    });
  highlightOutputErrors();
}


/* 4) 블록별 논리 연산 수행 */
// 이전: DOM 기반 블록 연산 함수
function computeBlock(node, values) {
  const row = node.row;
  const col = node.col;
  const type = node.dataset.type;
  const incoming = [];

  // INPUT 블록은 자신의 값을 바로 반환
  if (type === "INPUT") {
    return values.get(node);
  }

  // 위쪽에서 들어오는 신호: static wire-down + flow-down 둘 다 있어야
  const upCell = getCell(row - 1, col);
  // 이전: if (upCell?.classList.contains("flow-down")) {
  if (upCell?.classList.contains("wire-down") && upCell.classList.contains("flow-down")) {
    const src = getBlockNodeFlow(row - 1, col, node);
    if (src) incoming.push(src);
  }

  // 아래쪽에서 들어오는 신호: static wire-up + flow-up 둘 다 있어야
  const downCell = getCell(row + 1, col);
  // 이전: if (downCell?.classList.contains("flow-up")) {
  if (downCell?.classList.contains("wire-up") && downCell.classList.contains("flow-up")) {
    const src = getBlockNodeFlow(row + 1, col, node);
    if (src) incoming.push(src);
  }

  // 왼쪽에서 들어오는 신호: static wire-right + flow-right 둘 다 있어야
  const leftCell = getCell(row, col - 1);
  // 이전: if (leftCell?.classList.contains("flow-right")) {
  if (leftCell?.classList.contains("wire-right") && leftCell.classList.contains("flow-right")) {
    const src = getBlockNodeFlow(row, col - 1, node);
    if (src) incoming.push(src);
  }

  // 오른쪽에서 들어오는 신호: static wire-left + flow-left 둘 다 있어야
  const rightCell = getCell(row, col + 1);
  // 이전: if (rightCell?.classList.contains("flow-left")) {
  if (rightCell?.classList.contains("wire-left") && rightCell.classList.contains("flow-left")) {
    const src = getBlockNodeFlow(row, col + 1, node);
    if (src) incoming.push(src);
  }

  const readyVals = incoming
    .map(n => values.get(n))
    .filter(v => v !== undefined);

  switch (type) {
    case "AND":
      return readyVals.every(v => v);
    case "OR":
      return readyVals.some(v => v);
    case "NOT":
      return !readyVals[0];
    case "OUTPUT":
      return readyVals.some(v => v);
    case "JUNCTION":
      return readyVals[0];
    default:
      return undefined;
  }
}





const mainScreen = document.getElementById("firstScreen");
const chapterStageScreen = document.getElementById("chapterStageScreen");
const gameScreen = document.getElementById("gameScreen");
const chapterListEl = document.getElementById("chapterList");
const stageListEl = document.getElementById("stageList");

// 모바일 내비게이션을 통한 firstScreen 전환
const overallRankingAreaEl = document.getElementById("overallRankingArea");
const mainScreenSection = document.getElementById("mainArea");
const guestbookAreaEl = document.getElementById("guestbookArea");
const mobileNav = document.getElementById("mobileNav");

if (mobileNav) {
    function showFirstScreenSection(targetId) {
      overallRankingAreaEl.style.display = "none";
      mainScreenSection.style.display = "none";
      guestbookAreaEl.style.display = "none";
      mobileNav.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
      const target = document.getElementById(targetId);
      if (target) target.style.display = 'flex';
      const activeNav = mobileNav.querySelector(`.nav-item[data-target="${targetId}"]`);
      if (activeNav) activeNav.classList.add("active");
  }

    mobileNav.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        const target = item.getAttribute("data-target");
        showFirstScreenSection(target);
      });
    });

    function handleFirstScreenResize() {
      if (window.innerWidth >= 1024) {
        overallRankingAreaEl.style.display = "";
        mainScreenSection.style.display = "";
        guestbookAreaEl.style.display = "";
      } else {
        const activeNav = mobileNav.querySelector(".nav-item.active");
        const target = activeNav ? activeNav.getAttribute("data-target") : "mainArea";
        showFirstScreenSection(target);
      }
    }

  window.addEventListener("resize", handleFirstScreenResize);
  handleFirstScreenResize();
}

function lockOrientationLandscape() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(err => {
      console.warn('Orientation lock failed:', err);
    });
  }
}

document.getElementById("startBtn").onclick = () => {
  lockOrientationLandscape();
  renderChapterList();
  if (chapterData.length > 0) selectChapter(0);
  document.getElementById("firstScreen").style.display = "none";
  chapterStageScreen.style.display = "block";
};

document.getElementById("backToMainFromChapter").onclick = () => {
  chapterStageScreen.style.display = "none";
  document.getElementById("firstScreen").style.display = "";
};

document.getElementById("toggleChapterList").onclick = () => {
  chapterListEl.classList.toggle('hidden');
};

document.getElementById("backToLevelsBtn").onclick = () => {
  document.body.classList.remove('game-active');
  gameScreen.style.display = "none";
  if (currentCustomProblem) {
    currentCustomProblem = null;
    userProblemsScreen.style.display = 'block';
    renderUserProblemList();
  } else {
    chapterStageScreen.style.display = "block";
    renderChapterList();
    const chapter = chapterData[selectedChapterIndex];
    if (chapter && chapter.id !== 'user') {
      renderStageList(chapter.stages);
    }
  }
};



function startLevel(level) {
  resetCaptureCanvas();
  wireTrace = [];
  wires = [];
  const [rows, cols] = levelGridSizes[level] || [6, 6];
  GRID_ROWS = rows;
  GRID_COLS = cols;
  showLevelIntro(level, () => {
    setupGrid("grid", rows, cols);
    clearGrid();
    setupBlockPanel(level);
    setGridDimensions(rows, cols);
    currentLevel = parseInt(level);
    const title = document.getElementById("gameTitle");
    title.textContent = levelTitles[level] ?? `Stage ${level}`;
    const prevMenuBtn = document.getElementById('prevStageBtnMenu');
    const nextMenuBtn = document.getElementById('nextStageBtnMenu');

    prevMenuBtn.disabled = !(levelTitles[level - 1] && isLevelUnlocked(level - 1));
    nextMenuBtn.disabled = !(levelTitles[level + 1] && isLevelUnlocked(level + 1));

    collapseMenuBarForMobile();
  });
}


function buildBlockPanel(panel, blocks) {
  panel.innerHTML = '';

  const inoutRow = document.createElement('div');
  inoutRow.className = 'blockRow';
  const inoutTitle = document.createElement('div');
  inoutTitle.className = 'blockRowTitle';
  inoutTitle.textContent = 'IN/OUT';
  const inoutContainer = document.createElement('div');
  inoutContainer.className = 'blockRowContent';
  inoutRow.appendChild(inoutTitle);
  inoutRow.appendChild(inoutContainer);

  const gateRow = document.createElement('div');
  gateRow.className = 'blockRow';
  const gateTitle = document.createElement('div');
  gateTitle.className = 'blockRowTitle';
  gateTitle.textContent = 'GATE';
  const gateContainer = document.createElement('div');
  gateContainer.className = 'blockRowContent';
  gateRow.appendChild(gateTitle);
  gateRow.appendChild(gateContainer);

  panel.appendChild(inoutRow);
  panel.appendChild(gateRow);

  blocks.forEach(block => {
    const div = document.createElement('div');
    div.className = 'blockIcon';
    div.draggable = true;
    div.dataset.type = block.type;
    if (block.name) div.dataset.name = block.name;
    div.textContent = block.type === 'JUNCTION' ? 'JUNC' : (block.name || block.type);
    div.dataset.tooltip = (() => {
      switch (block.type) {
        case 'AND': return 'AND 게이트: 여러러 입력이 모두 1일 때만 출력이 1';
        case 'OR':  return 'OR 게이트: 여러러 입력 중 하나라도 1이면 출력이 1';
        case 'NOT': return 'NOT 게이트: 입력의 반대(0↔1)를 출력';
        case 'INPUT': return `입력(${block.name}): 클릭하여 0↔1 전환 가능`;
        case 'OUTPUT': return `출력(${block.name})`;
        case 'JUNCTION': return 'JUNCTION: 하나의 신호를 여러 방향으로 나눔(입력이 하나만 연결되어야 함, 값이 1이면 테두리 점선표시)';
        default: return '';
      }
    })();

    if (block.type === 'INPUT' || block.type === 'OUTPUT') {
      inoutContainer.appendChild(div);
    } else {
      gateContainer.appendChild(div);
    }
  });

  attachDragHandlersToBlockIcons();
}

  function setupBlockPanel(level) {
    const panel = getBlockPanel();
    const blocks = levelBlockSets[level];
    if (!blocks) {
      panel.innerHTML = '';
      return;
    }
    buildBlockPanel(panel, blocks);
  }


function attachDragHandlersToBlockIcons() {
  document.querySelectorAll(".blockIcon").forEach(icon => {
    icon.addEventListener("dragstart", e => {
      if (isWireDrawing) {
        e.preventDefault();
        return;
      }
      const type = e.target.dataset.type;
      if (!["AND", "OR", "NOT", "INPUT", "OUTPUT", "WIRE", "JUNCTION"].includes(type)) return;
      e.dataTransfer.setData("text/plain", type);
      lastDraggedType = type;
      lastDraggedIcon = e.target;
      lastDraggedFromCell = null;
      lastDraggedName = e.target.dataset.name || null;

      // 👇 이 줄을 추가!
      // 투명한 1×1px 이미지를 드래그 이미지로 지정해서
      // 원본 요소(툴팁 포함) 대신 아무것도 보이지 않게 함
      const img = new Image();
      img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      e.dataTransfer.setDragImage(img, 0, 0);
    });
  });
}



document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") {
    if (isTextInputFocused()) {
      [resetToggle, problemResetToggle].forEach(btn => btn && btn.classList.remove('active'));
      return;
    }
    const gameScreen = document.getElementById("gameScreen");
    const problemScreen = document.getElementById("problem-screen");
    if (problemScreen.style.display !== "none" && gameScreen.style.display === "none") return;
    if (gameScreen.style.display === "none" && problemScreen.style.display === "none") return;

    if (confirm(t('confirmDeleteAll'))) {
      clearGrid();
      if (problemScreen.style.display !== "none") {
        initProblemBlockPanel();
        initTestcaseTable();
      } else if (currentCustomProblem) {
        setupCustomBlockPanel(currentCustomProblem);
      } else {
        setupBlockPanel(currentLevel);
      }
      grid.querySelectorAll('.cell').forEach(cell => delete cell.onclick);
      if (currentCustomProblem && currentCustomProblem.fixIO) {
        grid.querySelectorAll('.cell.block[data-type="INPUT"]').forEach(cell => attachInputClickHandlers(cell));
      }
    }
  }
  if (e.key === "Control") {
    isWireDrawing = true;
    statusToggle.classList.add("active");
  }
  if (e.key === "Shift") {
    deleteToggle.classList.add("active");
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Control") {
    isWireDrawing = false;
    statusToggle.classList.remove("active");
    clearWirePreview();  // 드로잉 중 취소 시 미리보기 제거
    wireTrace = [];
  }
  if (e.key === "Shift") {
    deleteToggle.classList.remove("active");
  }
});

function getIncomingBlocks(node) {
  const row = node.row;
  const col = node.col;
  const incoming = [];

  // wireDir: static wire 클래스, flowDir: flow 클래스
  const check = (r, c, wireDir, flowDir) => {
    const cell = getCell(r, c);
    if (cell?.classList.contains(wireDir)
      && cell.classList.contains(flowDir)) {
      const src = getBlockNodeFlow(r, c, node);
      if (src) incoming.push(src);
    }
  };

  // 위↓, 아래↑, 왼→, 오←
  check(row - 1, col, 'wire-down', 'flow-down');
  check(row + 1, col, 'wire-up', 'flow-up');
  check(row, col - 1, 'wire-right', 'flow-right');
  check(row, col + 1, 'wire-left', 'flow-left');

  return incoming;
}

async function gradeLevelAnimated(level) {
  const testCases = levelAnswers[level];
  if (!testCases) return;

  const allBlocks = Array.from(grid.querySelectorAll('.cell.block'));
  let junctionError = false;

  allBlocks
    .filter(b => b.dataset.type === "JUNCTION")
    .forEach(junction => {
      const inputs = getIncomingBlocks(junction);
      if (inputs.length > 1) {
        junction.classList.add("error");
        junctionError = true;
      } else {
        junction.classList.remove("error");
      }
    });

  if (junctionError) {
    alert("❌ JUNCTION 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.");
    if (overlay) overlay.style.display = "none";
    isScoring = false;
    return;
  }
  let outputError = false;
  Array.from(grid.querySelectorAll('.cell.block[data-type="OUTPUT"]'))
    .forEach(output => {
      const inputs = getIncomingBlocks(output);
      if (inputs.length > 1) {
        output.classList.add("error");
        outputError = true;
      } else {
        output.classList.remove("error");
      }
    });
  if (outputError) {
    alert("❌ OUTPUT 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.");
    if (overlay) overlay.style.display = "none";
    isScoring = false;
    return;
  }
  // 🔒 [1] 현재 레벨에 필요한 OUTPUT 블록 이름 확인
  const requiredOutputs = levelBlockSets[level]
    .filter(block => block.type === "OUTPUT")
    .map(block => block.name);

  // 🔍 현재 화면에 있는 OUTPUT 셀 조사
  const actualOutputCells = Array.from(grid.querySelectorAll('.cell.block[data-type="OUTPUT"]'));
  const actualOutputNames = actualOutputCells.map(cell => cell.dataset.name);

  // 🔒 [2] 누락된 출력 블록이 있으면 채점 막기
  const missingOutputs = requiredOutputs.filter(name => !actualOutputNames.includes(name));
  if (missingOutputs.length > 0) {
    alert(t('outputMissingAlert').replace('{list}', missingOutputs.join(', ')));
    if (overlay) overlay.style.display = "none";
    isScoring = false;
    return;
  }

  let allCorrect = true;

  // UI 전환
  document.getElementById("blockPanel").style.display = "none";
  document.getElementById("rightPanel").style.display = "none";
  document.getElementById("gradingArea").style.display = "block";
  const gradingArea = document.getElementById("gradingArea");
  gradingArea.innerHTML = "<b>채점 결과:</b><br><br>";

  const inputs = grid.querySelectorAll('.cell.block[data-type="INPUT"]');
  const outputs = grid.querySelectorAll('.cell.block[data-type="OUTPUT"]');

  for (const test of testCases) {
    inputs.forEach(input => {
      const name = input.dataset.name;
      const value = test.inputs[name] ?? 0;
      input.dataset.value = String(value);
      //input.textContent = `${name}(${value})`;
      input.classList.toggle('active', value === 1);
    });
    evaluateCircuit();
    await new Promise(r => setTimeout(r, 100));



    let correct = true;

    const actualText = Array.from(outputs)
      .map(out => {
        const name = out.dataset.name;
        const actual = + JSON.parse(out.dataset.val);
        const expected = test.expected[name];
        if (actual !== expected) correct = false;
        return `${name}=${actual}`;
      }).join(", ");

    const expectedText = Object.entries(test.expected)
      .map(([k, v]) => `${k}=${v}`).join(", ");
    const inputText = Object.entries(test.inputs)
      .map(([k, v]) => `${k}=${v}`).join(", ");

    if (!correct) allCorrect = false;

    if (!document.getElementById("gradingTable")) {
      gradingArea.innerHTML += `
      <table id="gradingTable">
        <thead>
          <tr>
            <th>${t('thInput')}</th>
            <th>${t('thExpected')}</th>
            <th>${t('thActual')}</th>
            <th>${t('thResult')}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    }
    const tbody = document.querySelector("#gradingTable tbody");

    const tr = document.createElement("tr");
    tr.className = correct ? "correct" : "wrong";

    const tdInput = document.createElement("td");
    tdInput.textContent = inputText;

    const tdExpected = document.createElement("td");
    tdExpected.textContent = expectedText;

    const tdActual = document.createElement("td");
    tdActual.textContent = actualText;

    const tdResult = document.createElement("td");
    tdResult.style.fontWeight = "bold";
    tdResult.style.color = correct ? "green" : "red";
    tdResult.textContent = correct ? "✅ 정답" : "❌ 오답";

    tr.append(tdInput, tdExpected, tdActual, tdResult);
    tbody.appendChild(tr);
  }

  const summary = document.createElement("div");
  summary.id = "gradeResultSummary";
  summary.textContent = allCorrect ? "🎉 모든 테스트를 통과했습니다!" : "😢 일부 테스트에 실패했습니다.";
  gradingArea.appendChild(summary);

  const returnBtn = document.createElement("button");
  returnBtn.id = "returnToEditBtn";
  returnBtn.textContent = t('returnToEditBtn');
  gradingArea.appendChild(returnBtn);

  document.getElementById("returnToEditBtn")?.addEventListener("click", returnToEditScreen);

  if (allCorrect) {
    const clearedCard = document.querySelector(`.stageCard[data-stage="${level}"]`);
    if (clearedCard && !clearedCard.classList.contains("cleared")) {
      clearedCard.classList.add("cleared");
      markLevelCleared(level);
    }

    const autoSave = localStorage.getItem('autoSaveCircuit') !== 'false';
    let saveSuccess = false;
    if (autoSave) {
      try {
        if (gifLoadingModal) {
          if (gifLoadingText) gifLoadingText.textContent = t('savingCircuit');
          gifLoadingModal.style.display = 'flex';
        }
        await saveCircuit();
        saveSuccess = true;
      } catch (e) {
        alert(t('saveFailed').replace('{error}', e));
      } finally {
        if (gifLoadingModal) {
          gifLoadingModal.style.display = 'none';
          if (gifLoadingText) gifLoadingText.textContent = t('gifLoadingText');
        }
      }
    }
    const blocks = Array.from(grid.querySelectorAll(".cell.block"));

    // ② 타입별 개수 집계
    const blockCounts = blocks.reduce((acc, cell) => {
      const t = cell.dataset.type;
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    // ③ 도선 수 집계
    const usedWires = grid.querySelectorAll(".cell.wire").length;
    const hintsUsed = parseInt(localStorage.getItem(`hintsUsed_${level}`) || '0');
    const nickname = localStorage.getItem("username") || "익명";
    const rankingsRef = db.ref(`rankings/${level}`);

    pendingClearedLevel = null;

    // ① 내 기록 조회 (nickname 기준)
    rankingsRef.orderByChild("nickname").equalTo(nickname)
      .once("value", snapshot => {
        if (!snapshot.exists()) {
          // 내 기록이 없으면 새로 저장
          saveRanking(level, blockCounts, usedWires, hintsUsed);
          pendingClearedLevel = level;
        } else {
          let best = null;
          snapshot.forEach(child => {
            const e = child.val();
            // 기존/새 블록 개수 합계
            const oldBlocks = Object.values(e.blockCounts || {}).reduce((a, b) => a + b, 0);
            const newBlocks = Object.values(blockCounts).reduce((a, b) => a + b, 0);
            // 기존/새 도선 개수
            const oldWires = e.usedWires;
            const newWires = usedWires;

            // ✅ 수정: 오직 성능이 엄격히 개선된 경우에만 best 할당
            if (
              newBlocks < oldBlocks
              || (newBlocks === oldBlocks && newWires < oldWires)
            ) {
              best = { key: child.key };
              // nickname 당 보통 한 건만 있으므로, 더 돌 필요 없으면 false 리턴
              return false;
            }
          });

          // ③ 개선된 경우에만 업데이트 (동일 성능이라면 best가 null이므로 건너뜀)
          if (best) {
            rankingsRef.child(best.key).update({
              blockCounts,
              usedWires,
              hintsUsed,
              timestamp: new Date().toISOString()
            });
            pendingClearedLevel = level;
          }
        }

        if (saveSuccess) showCircuitSavedModal();
      });


  }
}

function returnToEditScreen() {
  // 채점 모드 해제
  isScoring = false;
  if (overlay) overlay.style.display = "none";

  // 원래 편집 UI 복원
  const blockPanel = document.getElementById("blockPanel");
  const rightPanel = document.getElementById("rightPanel");
  const gradingArea = document.getElementById("gradingArea");
  if (blockPanel) blockPanel.style.display = "flex";
  if (rightPanel) rightPanel.style.display = "block";
  if (gradingArea) gradingArea.style.display = "none";
}

let clearedLevelsFromDb = [];

function fetchClearedLevels(nickname) {
  return db.ref('rankings').once('value').then(snap => {
    const cleared = [];
    snap.forEach(levelSnap => {
      const levelId = parseInt(levelSnap.key, 10);
      let hasRecord = false;
      levelSnap.forEach(recSnap => {
        if (recSnap.val().nickname === nickname) {
          hasRecord = true;
          return true; // stop iterating this level
        }
      });
      if (hasRecord) cleared.push(levelId);
    });
    return cleared;
  });
}

function fetchProgressSummary(nickname) {
  return db.ref('rankings').once('value').then(snap => {
    let cleared = 0;
    let blocks = 0;
    let wires = 0;
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        if (v.nickname === nickname) {
          cleared++;
          blocks += Object.values(v.blockCounts || {}).reduce((s, x) => s + x, 0);
          wires += v.usedWires || 0;
          return true; // stop iterating this level
        }
      });
    });
    return { cleared, blocks, wires };
  });
}

function fetchOverallStats(nickname) {
  return db.ref('rankings').once('value').then(snap => {
    const data = {};
    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        const name = v.nickname || '익명';
        if (!data[name]) {
          data[name] = {
            stages: new Set(),
            blocks: 0,
            wires: 0,
            lastTimestamp: v.timestamp
          };
        }
        data[name].stages.add(levelSnap.key);
        data[name].blocks += Object.values(v.blockCounts || {}).reduce((s, x) => s + x, 0);
        data[name].wires += v.usedWires || 0;
        if (new Date(v.timestamp) > new Date(data[name].lastTimestamp)) {
          data[name].lastTimestamp = v.timestamp;
        }
      });
    });
    const entries = Object.entries(data).map(([nickname, v]) => ({
      nickname,
      cleared: v.stages.size,
      blocks: v.blocks,
      wires: v.wires,
      timestamp: v.lastTimestamp
    }));
    entries.sort((a, b) => {
      if (a.cleared !== b.cleared) return b.cleared - a.cleared;
      if (a.blocks !== b.blocks) return a.blocks - b.blocks;
      if (a.wires !== b.wires) return a.wires - b.wires;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
    const idx = entries.findIndex(e => e.nickname === nickname);
    if (idx === -1) return { rank: '-', cleared: 0 };
    return { rank: idx + 1, cleared: entries[idx].cleared };
  });
}

function refreshClearedUI() {
  document.querySelectorAll('.stageCard').forEach(card => {
    const level = parseInt(card.dataset.stage, 10);
    card.classList.remove('cleared');
    if (clearedLevelsFromDb.includes(level)) {
      card.classList.add('cleared');
    }
  });
}

function loadClearedLevelsFromDb() {
  const nickname = localStorage.getItem('username') || '익명';
  return fetchClearedLevels(nickname).then(levels => {
    clearedLevelsFromDb = levels;
    refreshClearedUI();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  stageDataPromise = loadStageData().then(() => {
    const prevMenuBtn = document.getElementById('prevStageBtnMenu');
    const nextMenuBtn = document.getElementById('nextStageBtnMenu');

    prevMenuBtn.addEventListener('click', () => {
      returnToEditScreen();           // 채점 모드 닫기
      startLevel(currentLevel - 1);   // 이전 스테이지 시작
    });

    nextMenuBtn.addEventListener('click', () => {
      returnToEditScreen();
      startLevel(currentLevel + 1);   // 다음 스테이지 시작
    });
    enableTouchDrag();
    return loadClearedLevelsFromDb();
  });
  initialTasks.push(stageDataPromise);
});

function markLevelCleared(level) {
  if (!clearedLevelsFromDb.includes(level)) {
    clearedLevelsFromDb.push(level);
    refreshClearedUI();
    renderChapterList();
  }
}

/**
* row, col이 범위를 벗어나면 null을, 아니면 그 위치의 .cell 요소를 돌려줍니다.
*/
function getCell(row, col) {
  if (!grid || row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null;
  return grid.children[row * GRID_COLS + col];
}

/**
 * getCell로 가져온 셀 중에서 block(=INPUT/OUTPUT/AND/OR/NOT)일 때만 돌려줍니다.
 */
// 이전에 사용하셨던 getBlockNode(…) 함수는 지우고, 아래로 대체하세요.
function getBlockNode(startRow, startCol, excludeCell) {
  const visited = new Set();
  // 탐색 대상 블록(self)의 좌표도 미리 방문 처리
  if (excludeCell) {
    visited.add(`${excludeCell.row},${excludeCell.col}`);
  }

  function dfs(r, c) {
    const key = `${r},${c}`;
    if (visited.has(key)) return null;
    visited.add(key);

    const cell = getCell(r, c);
    if (!cell) return null;

    // 블록이면 바로 반환
    if (cell.dataset.type && cell.dataset.type !== "WIRE") {
      return cell;
    }

    // wire 셀 → 연결된 방향만 따라 재귀 탐색
    const dirs = {
      "wire-up": { dr: -1, dc: 0, opp: "wire-down" },
      "wire-down": { dr: 1, dc: 0, opp: "wire-up" },
      "wire-left": { dr: 0, dc: -1, opp: "wire-right" },
      "wire-right": { dr: 0, dc: 1, opp: "wire-left" },
    };

    for (const [cls, { dr, dc, opp }] of Object.entries(dirs)) {
      if (!cell.classList.contains(cls)) continue;
      const nr = r + dr, nc = c + dc;
      const nbCell = getCell(nr, nc);
      if (!nbCell) continue;
      const isWireConn = nbCell.dataset.type === "WIRE"
        && nbCell.classList.contains(opp);
      const isBlockConn = nbCell.dataset.type && nbCell.dataset.type !== "WIRE";
      if (isWireConn || isBlockConn) {
        const found = dfs(nr, nc);
        if (found) return found;
      }
    }
    return null;
  }

  return dfs(startRow, startCol);
}

/**
 * flow- 클래스를 역방향으로만 따라가면서
 * 블록을 찾아오는 함수입니다.
 *
 * startRow, startCol: computeBlock이 시작한 첫 번째 wire 셀 좌표
 * excludeNode: computeBlock이 호출된 자기 자신 노드 (순환 방지용)
 */
/**
 * 시작 좌표에서 블록까지 연결된 wire 경로를 역추적합니다.
 * - flow-* 없이 wire-* static 클래스만 사용
 * - 꺾인 코너(wire-up + wire-right 등)도 getNeighbourWireDirs로 모두 반환
 */
function getBlockNodeFlow(startRow, startCol, excludeNode) {
  const visited = new Set();
  if (excludeNode) {
    visited.add(`${excludeNode.row},${excludeNode.col}`);
  }

  // wire 클래스 ↔ 좌표 오프셋 매핑
  const dirOffsets = {
    "wire-up": { dr: -1, dc: 0, opp: "wire-down" },
    "wire-down": { dr: 1, dc: 0, opp: "wire-up" },
    "wire-left": { dr: 0, dc: -1, opp: "wire-right" },
    "wire-right": { dr: 0, dc: 1, opp: "wire-left" }
  };

  function dfs(r, c) {
    const key = `${r},${c}`;
    if (visited.has(key)) return null;
    visited.add(key);

    const cell = getCell(r, c);
    if (!cell) return null;

    // 블록이면 바로 반환
    if (cell.dataset.type && cell.dataset.type !== "WIRE") {
      return cell;
    }

    // 현재 wire 셀의 모든 static 연결 방향을 가져옴
    // (코너인 경우 ['wire-up','wire-right'] 등 두 방향)
    const neighbourDirs = getNeighbourWireDirs(cell);  // :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}

    for (const dir of neighbourDirs) {
      const { dr, dc, opp } = dirOffsets[dir];
      const nr = r + dr, nc = c + dc;
      const nb = getCell(nr, nc);
      if (!nb) continue;

      // 이웃 셀이 wire라면 반대 static 클래스도 있어야, 혹은 블록이면 OK
      const isWireConn = nb.dataset.type === "WIRE"
        && nb.classList.contains(opp);
      const isBlockConn = nb.dataset.type && nb.dataset.type !== "WIRE";
      if (!isWireConn && !isBlockConn) {
        continue;
      }

      const found = dfs(nr, nc);
      if (found) return found;
    }

    return null;
  }

  return dfs(startRow, startCol);
}

// 피드백 전송
// 1) 방명록 등록 함수
function submitGuestEntry() {
  // 이전: 입력창 value 또는 익명 사용
  // const name = document.getElementById("guestName").value.trim() || "익명";

  // 수정: 로그인(모달)된 username을 사용
  const name = localStorage.getItem("username") || "익명";

  const msg = document.getElementById("guestMessage").value.trim();
  if (!msg) return alert("내용을 입력해주세요!");

  const entry = { name, message: msg, time: Date.now() };
  db.ref("guestbook").push(entry, err => {
    if (err) alert("전송에 실패했습니다.");
    else document.getElementById("guestMessage").value = "";
  });
}

// 2) 실시간 방명록 목록 업데이트
db.ref("guestbook").on("value", snapshot => {
  const list = document.getElementById("guestbookList");
  list.innerHTML = "";
  const entries = [];
  snapshot.forEach(child => {
    entries.push(child.val());
    return false;  // 반드시 false를 리턴해야 계속 순회합니다
  });
  entries.sort((a, b) => b.time - a.time);

  for (const e of entries) {
    const div = document.createElement("div");
    div.style.margin = "10px 0";
    const name = e.name;
    const displayName = name.length > 20 ? name.slice(0, 20) + '...' : name;
    div.innerHTML = `<b>${displayName}</b> (${new Date(e.time).toLocaleString()}):<br>${e.message}`;
    list.appendChild(div);
  }
});

/*
// 실시간 반영
firebase.database().ref("guestbook").on("value", (snapshot) => {
  const list = document.getElementById("guestbookList");
  list.innerHTML = "";
  const entries = [];
  snapshot.forEach(child => entries.push(child.val()));
  entries.sort((a, b) => b.time - a.time); // 최신순

  for (const e of entries) {
    const div = document.createElement("div");
    div.style.margin = "10px 0";
    div.innerHTML = `<b>${e.name}</b> (${new Date(e.time).toLocaleString()}):<br>${e.message}`;
    list.appendChild(div);
  }
});
*/
function showLevelIntro(level, callback) {
  const modal = document.getElementById("levelIntroModal");
  const title = document.getElementById("introTitle");
  const desc = document.getElementById("introDesc");
  const table = document.getElementById("truthTable");

  const data = levelDescriptions[level];
  if (!data) {
    callback();  // 데이터 없으면 바로 시작
    return;
  }

  title.textContent = data.title;
  desc.textContent = data.desc;

  // 진리표 렌더링
  const keys = Object.keys(data.table[0]);
  table.innerHTML = "";

  // 헤더 행 생성
  const headerRow = document.createElement("tr");
  keys.forEach(k => {
    const th = document.createElement("th");
    th.textContent = k; // 특수문자 안전 처리
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  // 데이터 행 생성
  data.table.forEach(row => {
    const tr = document.createElement("tr");
    keys.forEach(k => {
      const td = document.createElement("td");
      td.textContent = row[k];
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  modal.style.display = "flex";
  modal.style.backgroundColor = "white";
  document.getElementById("startLevelBtn").onclick = () => {
    modal.style.display = "none";
    showStageTutorial(level, callback);  // 레벨별 튜토리얼 표시 후 시작
  };
}


function renderChapterList() {
  chapterListEl.innerHTML = "";
  const cleared = clearedLevelsFromDb;

  chapterData.forEach((chapter, idx) => {
    const item = document.createElement("div");
    item.className = "chapterItem";
    let unlocked = true;
    if (chapter.id === 'user') {
      unlocked = [1,2,3,4,5,6].every(s => cleared.includes(s));
    } else if (idx > 0) {
      const prevStages = chapterData[idx - 1].stages;
      unlocked = prevStages.every(s => cleared.includes(s));
    }
    if (!unlocked) {
      item.classList.add('locked');
      item.textContent = `${chapter.name} 🔒`;
      item.onclick = () => {
        alert(`챕터 ${idx}의 스테이지를 모두 완료해야 다음 챕터가 열립니다.`);
      };
    } else {
      item.textContent = chapter.name;
      item.onclick = () => {
        if (chapter.id === 'user') {
          renderUserProblemList();
          chapterStageScreen.style.display = 'none';
          userProblemsScreen.style.display = 'block';
        } else {
          selectChapter(idx);
        }
      };
    }
    if (idx === selectedChapterIndex) item.classList.add('selected');
    chapterListEl.appendChild(item);
  });
}

function selectChapter(idx) {
  selectedChapterIndex = idx;
  renderChapterList();
  const chapter = chapterData[idx];
  if (chapter.id !== 'user') {
    renderStageList(chapter.stages);
  }
}

function renderStageList(stageList) {
  stageListEl.innerHTML = "";
  stageList.forEach(level => {
    const card = document.createElement('div');
    card.className = 'stageCard';
    card.dataset.stage = level;
    const title = levelTitles[level] ?? `Stage ${level}`;
    let name = title;
    let desc = "";
    const parts = title.split(':');
    if (parts.length > 1) {
      name = parts[0];
      desc = parts.slice(1).join(':').trim();
    }
    card.innerHTML = `<h3>${name}</h3><p>${desc}</p>`;
    const unlocked = isLevelUnlocked(level);
    if (!unlocked) {
      card.classList.add('locked');
    } else {
      if (clearedLevelsFromDb.includes(level)) {
        card.classList.add('cleared');
      }
      card.onclick = () => {
        returnToEditScreen();
        startLevel(level);
        chapterStageScreen.style.display = 'none';
        gameScreen.style.display = 'flex';
        document.body.classList.add('game-active');
      };
    }
    stageListEl.appendChild(card);
  });
}

function setGridDimensions(rows, cols) {
  GRID_ROWS = rows;
  GRID_COLS = cols;

  if (grid) {
    // ① CSS 변수만 업데이트
    grid.style.setProperty('--grid-rows', rows);
    grid.style.setProperty('--grid-cols', cols);

    // ② inline grid-template 은 제거하거나 주석 처리
    // grid.style.gridTemplateRows   = `repeat(${rows}, 1fr)`;
    // grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  }
}


function adjustGridZoom(containerId = 'gridContainer') {
  const gridContainer = document.getElementById(containerId);
  if (!gridContainer) return;

  const margin = 20;
  gridContainer.style.zoom = 1;

  let availableWidth = window.innerWidth - margin * 2;
  let availableHeight = window.innerHeight - margin * 2;

  if (containerId === 'gridContainer') {
    const menuBar = document.getElementById('menuBar');
    if (menuBar) {
      const menuRect = menuBar.getBoundingClientRect();
      const isVertical = menuRect.height > menuRect.width;
      if (isVertical) {
        availableWidth -= menuRect.width;
      } else {
        availableHeight -= menuRect.height;
      }
    }
  }

  const gcRect = gridContainer.getBoundingClientRect();
  const scale = Math.min(
    availableWidth / gcRect.width,
    availableHeight / gcRect.height,
    1
  );

  if (scale < 1) {
    gridContainer.style.zoom = scale;
  }
}

/**
 * @param {string} containerId 그리드 컨테이너의 id
 * @param {number} rows
 * @param {number} cols
 */
function setupGrid(containerId, rows, cols) {
  GRID_COLS = cols
  GRID_ROWS = rows
  grid = document.getElementById(containerId);
  if (!grid) {
    console.warn(`Grid container "${containerId}" not found. Skipping grid setup.`);
    return;
  }

  grid.style.setProperty('--grid-cols', cols);
  grid.style.setProperty('--grid-rows', rows);
  grid.innerHTML = "";

  for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = i;
    cell.row = Math.floor(i / GRID_COLS);
    cell.col = i % GRID_COLS;
    cell.addEventListener("dragover", e => e.preventDefault());

    /* drop */
    cell.addEventListener("drop", e => {
      e.preventDefault();
      if (cell.dataset.type) return;

      const type = e.dataTransfer.getData("text/plain");
      if (!["AND", "OR", "NOT", "INPUT", "OUTPUT", "WIRE", "JUNCTION"].includes(type)) return;
      if (type === "INPUT" || type === "OUTPUT") {
        // 이름(name)과 초기값(value) 세팅
        cell.classList.add("block");
        cell.dataset.type = type;
        cell.dataset.name = lastDraggedName || lastDraggedIcon?.dataset.name;
        if (type === 'INPUT') {
          cell.dataset.value = '0';
          cell.textContent = cell.dataset.name;
          //cell.textContent = `${cell.dataset.name}(${cell.dataset.value})`;
          // 드롭 시점에 바로 click 리스너 등록
          cell.onclick = () => {
            cell.dataset.value = cell.dataset.value === '0' ? '1' : '0';
            cell.textContent = cell.dataset.name; 
            //cell.textContent = `${cell.dataset.name}(${cell.dataset.value})`;
            cell.classList.toggle('active', cell.dataset.value === '1');
            evaluateCircuit();
          };
        } else {
          cell.textContent = cell.dataset.name;
        }
        cell.draggable = true;
        // 배치된 아이콘 하나만 사라지도록 유지 (다른 INPUT 아이콘엔 영향 없음)
        if (lastDraggedIcon) lastDraggedIcon.style.display = "none";
      }
      else if (type === "WIRE") {
        cell.classList.add("wire");
        cell.dataset.type = "WIRE";
      } 
      else if (type === "JUNCTION") {
        cell.classList.add("block");
        cell.textContent = "JUNC";
        cell.dataset.type = type;
        cell.draggable = true;
      } else {
        cell.classList.add("block");
        cell.textContent = type;
        cell.dataset.type = type;
        cell.draggable = true;
      }

      if (["INPUT", "OUTPUT"].includes(type) && lastDraggedIcon)
        lastDraggedIcon.style.display = "none";

      /* 원래 셀 비우기 */
      if (lastDraggedFromCell && lastDraggedFromCell !== cell) {
        // ─── 수정: cascade delete 호출 ───
        disconnectWiresCascade(lastDraggedFromCell);
        resetCell(lastDraggedFromCell);
        // 기존 셀 초기화 로직
        lastDraggedFromCell.classList.remove("block", "wire");
        lastDraggedFromCell.textContent = "";
        delete lastDraggedFromCell.dataset.type;
        lastDraggedFromCell.removeAttribute("draggable");
      }
      markCircuitModified();
      lastDraggedType = lastDraggedIcon = lastDraggedFromCell = null;
    });



    /* 셀 dragstart (wire 모드면 차단) */
    cell.addEventListener("dragstart", e => {
      if (isWireDrawing) { e.preventDefault(); return; }
      const t = cell.dataset.type;
      if (!t || t === "WIRE") return;
      e.dataTransfer.setData("text/plain", t);
      lastDraggedType = t;
      lastDraggedFromCell = cell;
      lastDraggedName = cell.dataset.name || null;
    });

    cell.addEventListener("click", (e) => {
      if ((e.shiftKey || isWireDeleting) && cell.dataset.type === "WIRE") {
        // (1) 클릭한 셀이 포함된 wire path 찾기
        const targetWires = wires.filter(w => w.path.includes(cell));

        // (2) 해당 wire들을 지움
        targetWires.forEach(w => {
          w.path.forEach(c => {
            if (c.dataset.type === "WIRE") {
              c.className = "cell";
              c.removeAttribute("data-type");
            }
          });
        });

        // (3) wires 배열에서 제거
        wires = wires.filter(w => !targetWires.includes(w));
        markCircuitModified();
      }
    });


    cell.style.setProperty('--col', i % GRID_COLS);
    cell.style.setProperty('--row', Math.floor(i / GRID_COLS));
    cell.row = Math.floor(i / GRID_COLS);
    cell.col = i % GRID_COLS;
    grid.appendChild(cell);
  }
  grid.addEventListener("mousedown", e => {
    const cell = e.target;
    if (!isWireDrawing || !cell.classList.contains("cell")) return;

    /* 시작은 블록만 허용 */
    const t = cell.dataset.type;
    if (!t || t === "WIRE") return;

    isMouseDown = true;
    wireTrace = [cell];

    document.addEventListener("mousemove", track);
    document.addEventListener("mouseup", finish);
  });

  grid.addEventListener("touchstart", e => {
    const cell = e.target.closest('.cell');
    if (!isWireDrawing || !cell) return;

    const t = cell.dataset.type;
    if (!t || t === "WIRE") return;

    isMouseDown = true;
    wireTrace = [cell];

    document.addEventListener("touchmove", trackTouch, { passive: false });
    document.addEventListener("touchend", finishTouch);
  }, { passive: false });

  grid.addEventListener("mousemove", e => {
    if (!isWireDrawing) return;
    // 커서 바로 밑의 요소 찾기
    if (wireTrace.length === 0) return;   // 시작 셀 없으면 종료
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest(".cell");
    if (!cell) return;

    const idx = parseInt(cell.dataset.index, 10);

    // 이전: const lastIdx = wireTrace[wireTrace.length - 1];
    // 이전: if (idx === lastIdx) return;
    const lastIdx = Number(wireTrace.at(-1).dataset.index);
    if (idx === lastIdx) return;

    // 두 점 사이 모든 셀을 채워 줌
    const path = getInterpolatedIndices(lastIdx, idx);

    // 이전:
    // path.forEach(i => {
    //   if (!wireTrace.map(c => c.dataset.index).includes(i)) {
    //     wireTrace.push(i);
    //   }
    // });
    path.forEach(i => {
      const cellEl = grid.children[i];
      if (!wireTrace.includes(cellEl)) {      /* ← 이미 들어갔는지 바로 확인 */
        cellEl.classList.add("wire-preview");
        wireTrace.push(cellEl);
      }
    });

    // wire 미리보기 업데이트
    //drawWirePreview(wireTrace);
  });

  grid.addEventListener("touchmove", gridTouchMove, { passive: false });
  grid.addEventListener('click', e => {
    if (!isWireDeleting) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;

    if (cell.classList.contains('block')) {
      if (cell.dataset.fixed === '1') return;
      // ① 연결된 전선 전체 삭제
      disconnectWiresCascade(cell);

      const type = cell.dataset.type;
      const name = cell.dataset.name;
      // ② INPUT/OUTPUT이면 아이콘 복원
      if (["INPUT", "OUTPUT"].includes(type)) {
        const panel = getBlockPanel();  // blockPanel 또는 problemBlockPanel 반환
        const icon = panel.querySelector(
          `.blockIcon[data-type="${type}"][data-name="${name}"]`
        );
        if (icon) {
          icon.style.display = "inline-flex";
        }
      }

      // ③ 셀 초기화
      resetCell(cell);                          // ← 모든 data-* 제거까지 한 번에
    }
    else if (cell.classList.contains('wire')) {
      // wire 셀만 지울 땐 기존 로직 유지
      cell.className = 'cell';
      delete cell.dataset.type;
      delete cell.dataset.directions;
    }
    markCircuitModified();
  });
  // ——— 그리드 밖 마우스 탈출 시 취소 ———
  grid.addEventListener('mouseleave', cancelWireDrawing);
  grid.addEventListener('touchcancel', cancelWireDrawing);
  adjustGridZoom();
  updateUsageCounts();
}

function resetCell(cell) {
  if (currentCustomProblem && currentCustomProblem.fixIO && cell.dataset.fixed === '1') return;
  cell.className = "cell";
  cell.textContent = "";
  delete cell.dataset.type;
  delete cell.dataset.name;
  delete cell.dataset.value;
  cell.removeAttribute("draggable");
  // 클릭 이벤트 프로퍼티 초기화
  cell.onclick = null;
  markCircuitModified();
}

document.getElementById("showIntroBtn").addEventListener("click", () => {
  if (currentLevel != null) {
    showIntroModal(currentLevel);
  } else if (currentCustomProblem) {
    showProblemIntro(currentCustomProblem);
  }
});

document.getElementById("gameTitle").addEventListener("click", () => {
  if (currentLevel != null) {
    showIntroModal(currentLevel);
  } else if (currentCustomProblem) {
    showProblemIntro(currentCustomProblem);
  }
});

document.getElementById('hintBtn').addEventListener('click', () => {
  if (currentLevel == null) {
    if (currentCustomProblem) {
      alert(t('noHints'));
    } else {
      alert(t('startStageFirst'));
    }
    return;
  }
  openHintModal(currentLevel);
});



function showIntroModal(level) {
  const modal = document.getElementById("levelIntroModal");
  const title = document.getElementById("introTitle");
  const desc = document.getElementById("introDesc");
  const table = document.getElementById("truthTable");

  const data = levelDescriptions[level];
  if (!data) return;

  title.textContent = data.title;
  desc.textContent = data.desc;

  // 진리표 다시 렌더링
  const keys = Object.keys(data.table[0]);
  table.innerHTML = "";

  const headerRow = document.createElement("tr");
  keys.forEach(k => {
    const th = document.createElement("th");
    th.textContent = k;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  data.table.forEach(row => {
    const tr = document.createElement("tr");
    keys.forEach(k => {
      const td = document.createElement("td");
      td.textContent = row[k];
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  modal.style.display = "flex";
  modal.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
  document.getElementById("startLevelBtn").innerText = "닫기";
  document.getElementById("startLevelBtn").onclick = () => {
    modal.style.display = "none";
  };
}

// script.v1.0.js 맨 아래, 기존 코드 뒤에 붙여 주세요.

// 1) 튜토리얼 데이터 정의
const tutorialStepsData = {
  ko: [
    {
      title: "블록 배치하기",
      desc: "왼쪽 패널에서 블록을 드래그하여 그리드 위에 배치해보세요.\n- AND, OR, NOT, IN/OUT 블록이 있어요.",
      img: "assets/tutorial-place-blocks.gif"
    },
    {
      title: "전선 그리기",
      desc: "[Ctrl] 키를 누른 상태로 블록 간을 드래그하면 전선 모드가 활성화됩니다.\n드래그를 놓으면 두 블록이 연결돼요.",
      img: "assets/tutorial-draw-wire.gif"
    },
    {
      title: "전선 삭제하기",
      desc: "[Shift] 키를 누른 상태에서 전선을 드래그하거나 블록을 드래그하여 전선을 삭제할 수 있어요.",
      img: "assets/tutorial-delete-wire.gif"
    },
    {
      title: "회로 채점하기",
      desc: "오른쪽 ‘채점하기’ 버튼을 누르면 테스트 케이스별 결과가 표시됩니다.\n정확한 회로를 설계해 보세요!",
      img: "assets/tutorial-evaluate.gif"
    },
    {
      title: "스테이지 안내 보기",
      desc: "하단 메뉴의 ℹ️ 버튼을 눌러 스테이지별 진리표와 설명을 확인할 수 있습니다.",
      img: "assets/tutorial-see-info.gif"
    }
  ],
  en: [
    {
      title: "Placing Blocks",
      desc: "Drag blocks from the left panel onto the grid.\n- Includes AND, OR, NOT, and IN/OUT blocks.",
      img: "assets/tutorial-place-blocks.gif"
    },
    {
      title: "Drawing Wires",
      desc: "Hold [Ctrl] and drag between blocks to enter wire mode.\nRelease to connect the blocks.",
      img: "assets/tutorial-draw-wire.gif"
    },
    {
      title: "Deleting Wires",
      desc: "Hold [Shift] and drag a wire or block to remove wires.",
      img: "assets/tutorial-delete-wire.gif"
    },
    {
      title: "Grading Circuits",
      desc: "Press the 'Grade' button on the right to see results for each test case.\nDesign the correct circuit!",
      img: "assets/tutorial-evaluate.gif"
    },
    {
      title: "Viewing Stage Info",
      desc: "Use the ℹ️ button in the menu to see each stage's truth table and description.",
      img: "assets/tutorial-see-info.gif"
    }
  ]
};
const tutorialSteps = tutorialStepsData[currentLang];

// 레벨별 튜토리얼 이미지와 문구
const stageTutorialsData = {
  ko: {
    1: [{ img: 'assets/not-gate-tutorial.gif', desc: 'NOT 게이트는 입력 신호와 반대되는 신호를 전달합니다.' }],
    2: [{ img: 'assets/or-gate-tutorial.gif', desc: 'OR 게이트는 여러 개의 입력 신호 중 하나라도 1이 있으면 1을 전달하고, 모두 0이면 0을 전달합니다.' }],
    3: [{ img: 'assets/and-gate-tutorial.gif', desc: 'AND 게이트는 여러 개의 입력 신호가 모두 1이면 1을 전달하고, 모두 0이면 0을 전달합니다.' }],
    6: [{ img: 'assets/hint-tutorial.gif', desc: '이제부터 힌트 기능을 사용할 수 있습니다.' }],
    7: [
      { img: 'assets/junction-tutorial.gif', desc: 'JUNC 블록은 하나의 입력 신호를 그대로 전달합니다.' },
      { img: 'assets/multi-input-tutorial.gif', desc: 'OR, AND 게이트는 최대 3개의 입력 신호를 받을 수 있습니다.' }
    ]
  },
  en: {
    1: [{ img: 'assets/not-gate-tutorial.gif', desc: 'The NOT gate outputs the opposite of its input.' }],
    2: [{ img: 'assets/or-gate-tutorial.gif', desc: 'The OR gate outputs 1 if any input is 1, otherwise 0.' }],
    3: [{ img: 'assets/and-gate-tutorial.gif', desc: 'The AND gate outputs 1 only when all inputs are 1.' }],
    6: [{ img: 'assets/hint-tutorial.gif', desc: 'You can now use the hint feature.' }],
    7: [
      { img: 'assets/junction-tutorial.gif', desc: 'The JUNC block passes a single input signal unchanged.' },
      { img: 'assets/multi-input-tutorial.gif', desc: 'OR and AND gates can accept up to three input signals.' }
    ]
  }
};
const stageTutorials = stageTutorialsData[currentLang];

// 2) 모달 관련 변수
let tutIndex = 0;
const tutModal = document.getElementById("tutorialModal");
const tutTitle = document.getElementById("tutTitle");
const tutDesc = document.getElementById("tutDesc");
const tutPrev = document.getElementById("tutPrevBtn");
const tutNext = document.getElementById("tutNextBtn");
const tutClose = document.getElementById("tutCloseBtn");
const tutBtn = document.getElementById("tutorialBtn");
const tutImg = document.getElementById("tutImg");
const tutFinish = document.getElementById("tutFinishBtn");

// 3) 모달 표시 함수
function showTutorial(idx) {
  tutIndex = idx;
  const step = tutorialSteps[idx];
  tutTitle.textContent = step.title;
  tutDesc.textContent = step.desc;

  // 이미지가 있으면 보이게, 없으면 숨기기
  if (step.img) {
    tutImg.src = step.img;
    tutImg.style.display = "block";
  } else {
    tutImg.style.display = "none";
  }

  tutPrev.disabled = (idx === 0);
  tutNext.style.display = (idx === tutorialSteps.length - 1) ? 'none' : 'inline-block';
  tutFinish.style.display = (idx === tutorialSteps.length - 1) ? 'inline-block' : 'none';
  tutModal.style.display = "flex";
}

// 4) 이벤트 연결
tutBtn.addEventListener("click", () => showTutorial(0));
tutPrev.addEventListener("click", () => showTutorial(tutIndex - 1));
tutNext.addEventListener("click", () => showTutorial(tutIndex + 1));
tutFinish.addEventListener("click", finishTutorial);
tutClose.addEventListener("click", () => {
  tutModal.style.display = "none";
});

function getLowestUnclearedStage() {
  const stages = Object.keys(levelTitles)
    .map(n => parseInt(n, 10))
    .sort((a, b) => a - b);
  for (const s of stages) {
    if (!clearedLevelsFromDb.includes(s)) return s;
  }
  return stages[0] || 1;
}

function finishTutorial() {
  localStorage.setItem('tutorialCompleted', 'true');
  tutModal.style.display = 'none';
  lockOrientationLandscape();
  stageDataPromise.then(() => {
    startLevel(getLowestUnclearedStage());
  });
  document.body.classList.add('game-active');
  document.getElementById('firstScreen').style.display = 'none';
  document.getElementById('chapterStageScreen').style.display = 'none';
  gameScreen.style.display = 'flex';
}

function maybeStartTutorial() {
  if (!localStorage.getItem('tutorialCompleted')) {
    showTutorial(0);
  }
}

// 레벨별 튜토리얼 표시 함수
function showStageTutorial(level, done) {
  const steps = stageTutorials[level];
  if (!steps) {
    done();
    return;
  }
  const modal = document.getElementById('stageTutorialModal');
  const img = document.getElementById('stageTutImg');
  const desc = document.getElementById('stageTutDesc');
  const btn = document.getElementById('stageTutBtn');
  let idx = 0;
  const render = () => {
    const step = steps[idx];
    img.src = step.img;
    desc.textContent = step.desc;
    btn.textContent = (idx === steps.length - 1) ? t('stageTutBtn') : t('tutNextBtn');
  };
  btn.onclick = () => {
    if (idx < steps.length - 1) {
      idx++;
      render();
    } else {
      modal.style.display = 'none';
      done();
    }
  };
  render();
  modal.style.display = 'flex';
}

// 5) ESC 키로 닫기
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && tutModal.style.display === "flex") {
    tutModal.style.display = "none";
  }
});

// ─────────── 삭제 모드 기능 추가 ───────────

// 삭제 모드 상태값
let isWireDeleting = false;

// 키 입력에 따라 모드 전환
document.addEventListener('keydown', e => {
  if (e.key === 'Control') {
    isWireDrawing = true;
    statusToggle.classList.add('active');
  }
  if (e.key === 'Shift') {
    isWireDeleting = true;
    deleteToggle.classList.add('active');
  }
});

document.addEventListener('keyup', e => {
  if (e.key === 'Control') {
    isWireDrawing = false;
    statusToggle.classList.remove('active');
    clearWirePreview();            // 반쯤 그려진 미리보기 제거
  }
  if (e.key === 'Shift') {
    isWireDeleting = false;
    deleteToggle.classList.remove('active');
  }
});

document.addEventListener('keydown', e => {
  if (isTextInputFocused()) return;
  let dx = 0, dy = 0;
  switch (e.key) {
    case 'ArrowUp': dy = -1; break;
    case 'ArrowDown': dy = 1; break;
    case 'ArrowLeft': dx = -1; break;
    case 'ArrowRight': dx = 1; break;
    default: return;
  }
  e.preventDefault();
  moveCircuit(dx, dy);
});

if (moveUpBtn)    moveUpBtn.addEventListener('click', () => moveCircuit(0, -1));
if (moveDownBtn)  moveDownBtn.addEventListener('click', () => moveCircuit(0, 1));
if (moveLeftBtn)  moveLeftBtn.addEventListener('click', () => moveCircuit(-1, 0));
if (moveRightBtn) moveRightBtn.addEventListener('click', () => moveCircuit(1, 0));
if (problemMoveUpBtn)    problemMoveUpBtn.addEventListener('click', () => moveCircuit(0, -1));
if (problemMoveDownBtn)  problemMoveDownBtn.addEventListener('click', () => moveCircuit(0, 1));
if (problemMoveLeftBtn)  problemMoveLeftBtn.addEventListener('click', () => moveCircuit(-1, 0));
if (problemMoveRightBtn) problemMoveRightBtn.addEventListener('click', () => moveCircuit(1, 0));





// 1) 필요한 엘리먼트 가져오기
const shareModal = document.getElementById('shareModal');
const shareTextEl = document.getElementById('shareText');
const copyShareBtn = document.getElementById('copyShareBtn');
const closeShareBtn = document.getElementById('closeShareBtn');
const copyStatusBtn = document.getElementById('copyStatusBtn');

// 2) 공유할 “텍스트” 생성 함수 (예: 현재 그리드 상태 직렬화)
function buildShareString() {
  // 예시: JSON.stringify(gridData) 같은 실제 공유 데이터로 바꿔주세요
  const lines = [];
  lines.push("I played " + location.origin + location.pathname);
  lines.push("");
  const cleared = clearedLevelsFromDb;
  const totalStages = Object.keys(levelTitles).length;  // 총 스테이지 수 (필요 시 갱신)



  for (let i = 1; i <= totalStages; i++) {
    const title = levelTitles[i] || '';
    const mark = cleared.includes(i) ? "✅" : "❌";
    lines.push(`Stage ${i} (${title}): ${mark}`);
  }


  const text = lines.join("\n");
  return text;
}

// 3) 공유하기 버튼 클릭 → 모달 열기
copyStatusBtn.addEventListener('click', () => {
  shareTextEl.value = buildShareString();
  shareModal.style.display = 'flex';
  shareTextEl.select();
});

// 4) 복사 버튼
copyShareBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareTextEl.value)
    .then(() => alert('클립보드에 복사되었습니다!'))
    .catch(err => alert('복사에 실패했습니다: ' + err));
});

// 5) 닫기 버튼
closeShareBtn.addEventListener('click', () => {
  shareModal.style.display = 'none';
});

// 회로 저장 완료 모달
const circuitSavedModal = document.getElementById('circuitSavedModal');
const savedShareBtn = document.getElementById('savedShareBtn');
const savedNextBtn = document.getElementById('savedNextBtn');

function showCircuitSavedModal() {
  if (circuitSavedModal) {
    circuitSavedModal.style.display = 'flex';
  } else {
    alert(t('circuitSaved'));
  }
}

if (savedShareBtn) {
  savedShareBtn.addEventListener('click', async () => {
    if (!lastSavedKey) return;
    try {
      const blob = await loadGifFromDB(lastSavedKey);
      const file = new File([blob], 'circuit.gif', { type: 'image/gif' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        alert('공유를 지원하지 않는 브라우저입니다.');
      }
    } catch (e) {
      alert('공유에 실패했습니다: ' + e);
    }
    if (circuitSavedModal) circuitSavedModal.style.display = 'none';
  });
}

if (savedNextBtn) {
  savedNextBtn.addEventListener('click', () => {
    if (circuitSavedModal) circuitSavedModal.style.display = 'none';
    if (pendingClearedLevel !== null) {
      showClearedModal(pendingClearedLevel);
      pendingClearedLevel = null;
    }
  });
}

// 채점 중 grid 조작 금지 기능
const overlay = document.getElementById("gridOverlay");
let isScoring = false;

document.getElementById("gradeButton").addEventListener("click", () => {
  if (circuitHasError) {
    alert("회로에 오류가 존재합니다");
    return;
  }
  if (isScoring) return;
  if (currentCustomProblem == null && currentLevel == null) return;
  isScoring = true;
  if (overlay) overlay.style.display = "block";
  if (currentCustomProblem) {
    gradeProblemAnimated(currentCustomProblemKey, currentCustomProblem);
  } else {
    gradeLevelAnimated(currentLevel);
  }
});

const modalGoogleLoginBtn = document.getElementById('modalGoogleLoginBtn');
const usernameSubmitBtn = document.getElementById('usernameSubmit');
const usernameModalHeading = document.querySelector('#usernameModal h2');
const loginInfo = document.getElementById('loginInfo');
const defaultModalGoogleLoginDisplay = modalGoogleLoginBtn ? modalGoogleLoginBtn.style.display : '';
const defaultUsernameSubmitText = usernameSubmitBtn ? usernameSubmitBtn.textContent : '';
const defaultUsernameModalHeading = usernameModalHeading ? usernameModalHeading.textContent : '';
const defaultLoginInfoHtml = loginInfo ? loginInfo.innerHTML : '';

function restoreUsernameModalDefaults() {
  if (modalGoogleLoginBtn) modalGoogleLoginBtn.style.display = defaultModalGoogleLoginDisplay;
  if (usernameSubmitBtn) {
    usernameSubmitBtn.textContent = defaultUsernameSubmitText;
    usernameSubmitBtn.onclick = onInitialUsernameSubmit;
  }
  if (usernameModalHeading) usernameModalHeading.textContent = defaultUsernameModalHeading;
  if (loginInfo) loginInfo.innerHTML = defaultLoginInfoHtml;
}

function promptForUsername() {
  const input = document.getElementById("usernameInput");
  const errorDiv = document.getElementById("usernameError");
  input.value = "";
  errorDiv.textContent = "";
  document.getElementById("usernameSubmit").onclick = onInitialUsernameSubmit;
  document.getElementById("usernameModal").style.display = "flex";
}

function onInitialUsernameSubmit() {
  const name = document.getElementById("usernameInput").value.trim();
  const errorDiv = document.getElementById("usernameError");
  if (!name) {
    errorDiv.textContent = "닉네임을 입력해주세요.";
    return;
  }
  db.ref("usernames").orderByValue().equalTo(name).once("value", snapshot => {
    if (snapshot.exists()) {
      errorDiv.textContent = "이미 사용 중인 닉네임입니다.";
    } else {
      const userId = db.ref("usernames").push().key;
      db.ref(`usernames/${userId}`).set(name);
      localStorage.setItem("username", name);
      document.getElementById("usernameModal").style.display = "none";
      document.getElementById("guestUsername").textContent = name;
      loadClearedLevelsFromDb().then(maybeStartTutorial);
    }
  });
}

function assignGuestNickname() {
  const attempt = () => {
    const name = `Player${Math.floor(1000 + Math.random() * 9000)}`;
    db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
      if (snap.exists()) {
        attempt();
      } else {
        const id = db.ref('usernames').push().key;
        db.ref(`usernames/${id}`).set(name);
        localStorage.setItem('username', name);
        document.getElementById('guestUsername').textContent = name;
        const loginUsernameEl = document.getElementById('loginUsername');
        if (loginUsernameEl) loginUsernameEl.textContent = name;
        loadClearedLevelsFromDb().then(maybeStartTutorial);
      }
    });
  };
  attempt();
}

function promptForGoogleNickname(oldName, uid) {
  const input = document.getElementById("usernameInput");
  const errorDiv = document.getElementById("usernameError");
  const suggested = oldName || localStorage.getItem(`googleDisplayName_${uid}`) || "";
  input.value = suggested;
  errorDiv.textContent = "";
  if (modalGoogleLoginBtn) modalGoogleLoginBtn.style.display = 'none';
  if (usernameSubmitBtn) usernameSubmitBtn.textContent = '닉네임 등록';
  if (usernameModalHeading) usernameModalHeading.textContent = 'Google 닉네임 등록';
  if (loginInfo) {
    loginInfo.innerHTML = t('loginInfoGoogle');
  }
  usernameSubmitBtn.onclick = () => onGoogleUsernameSubmit(oldName, uid);
  document.getElementById("usernameModal").style.display = "flex";
}

function onGoogleUsernameSubmit(oldName, uid) {
  const name = document.getElementById("usernameInput").value.trim();
  const errorDiv = document.getElementById("usernameError");
  if (!name) {
    errorDiv.textContent = "닉네임을 입력해주세요.";
    return;
  }
  db.ref('google').orderByChild('nickname').equalTo(name).once('value', gSnap => {
    if (gSnap.exists()) {
      errorDiv.textContent = "이미 있는 닉네임입니다.";
      return;
    }
    db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
      if (snap.exists() && name !== oldName) {
        document.getElementById('usernameModal').style.display = 'none';
        restoreUsernameModalDefaults();
        showAccountClaimModal(name, oldName, uid);
      } else {
        if (!snap.exists()) {
          const id = db.ref('usernames').push().key;
          db.ref(`usernames/${id}`).set(name);
        }
        localStorage.setItem('username', name);
        localStorage.setItem(`googleNickname_${uid}`, name);
        db.ref(`google/${uid}`).set({ uid, nickname: name });
        document.getElementById('usernameModal').style.display = 'none';
        restoreUsernameModalDefaults();
        document.getElementById('guestUsername').textContent = name;
        loadClearedLevelsFromDb().then(() => {
          if (oldName && oldName !== name) {
            showMergeModal(oldName, name);
          } else {
            registerUsernameIfNeeded(name);
            showOverallRanking();
          }
          maybeStartTutorial();
        });
      }
    });
  });
}


function saveRanking(levelId, blockCounts, usedWires, hintsUsed /*, timeMs */) {
  const nickname = localStorage.getItem("username") || "익명";
  const entry = {
    nickname,
    blockCounts,                        // { INPUT:2, AND:1, OR:1, … }
    usedWires,
    hintsUsed,
    timestamp: new Date().toISOString()
  };
  db.ref(`rankings/${levelId}`).push(entry);
}

function saveProblemRanking(problemKey, blockCounts, usedWires, hintsUsed) {
  const nickname = localStorage.getItem("username") || "익명";
  const entry = {
    nickname,
    blockCounts,
    usedWires,
    hintsUsed,
    timestamp: new Date().toISOString()
  };
  const rankingRef = db.ref(`problems/${problemKey}/ranking`);

  const sumBlocks = e =>
    Object.values(e.blockCounts || {}).reduce((s, x) => s + x, 0);

  const isBetter = (a, b) => {
    const aB = sumBlocks(a), bB = sumBlocks(b);
    if (aB !== bB) return aB < bB;
    if (a.usedWires !== b.usedWires) return a.usedWires < b.usedWires;
    const aH = a.hintsUsed ?? 0, bH = b.hintsUsed ?? 0;
    if (aH !== bH) return aH < bH;
    return new Date(a.timestamp) < new Date(b.timestamp);
  };

  rankingRef.orderByChild("nickname").equalTo(nickname)
    .once("value", snapshot => {
      if (!snapshot.exists()) {
        rankingRef.push(entry);
        return;
      }

      let bestKey = null;
      let bestVal = null;
      const dupKeys = [];

      snapshot.forEach(child => {
        const val = child.val();
        const key = child.key;
        if (!bestVal || isBetter(val, bestVal)) {
          if (bestKey) dupKeys.push(bestKey);
          bestKey = key;
          bestVal = val;
        } else {
          dupKeys.push(key);
        }
      });

      if (isBetter(entry, bestVal)) {
        rankingRef.child(bestKey).set(entry);
      }
      dupKeys.forEach(k => rankingRef.child(k).remove());
    });
}

function showProblemRanking(problemKey) {
  const listEl = document.getElementById('rankingList');
  listEl.innerHTML = '로딩 중…';

  const allowedTypes = ['INPUT','OUTPUT','AND','OR','NOT','JUNCTION'];

  db.ref(`problems/${problemKey}/ranking`)
    .orderByChild('timestamp')
    .once('value', snap => {
      const entries = [];
      // snapshot.forEach의 콜백이 truthy 값을 반환하면 순회가 중단되므로
      // return 값을 명시하지 않은 블록 형태로 작성하여 모든 랭킹을 수집합니다.
      snap.forEach(ch => {
        entries.push(ch.val());
      });

      if (entries.length === 0) {
        listEl.innerHTML = `
        <p>랭킹이 없습니다.</p>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">🔄 새로고침</button>
          <button id="closeRankingBtn">닫기</button>
        </div>`;
        document.getElementById('refreshRankingBtn')
          .addEventListener('click', () => showProblemRanking(problemKey));
        document.getElementById('closeRankingBtn')
          .addEventListener('click', () =>
            document.getElementById('rankingModal').classList.remove('active')
          );
        return;
      }

      const sumBlocks = e => Object.values(e.blockCounts || {}).reduce((s,x)=>s+x,0);
      const isBetter = (a,b)=>{
        const aB=sumBlocks(a), bB=sumBlocks(b);
        if(aB!==bB) return aB<bB;
        if(a.usedWires!==b.usedWires) return a.usedWires<b.usedWires;
        const aH=(a.hintsUsed??0), bH=(b.hintsUsed??0);
        if(aH!==bH) return aH<bH;
        return new Date(a.timestamp)<new Date(b.timestamp);
      };

      const bestByNickname = {};
      entries.forEach(e => {
        const cur = bestByNickname[e.nickname];
        if (!cur || isBetter(e, cur)) bestByNickname[e.nickname] = e;
      });
      const uniqueEntries = Object.values(bestByNickname);

      uniqueEntries.sort((a,b)=>{
        const aB=sumBlocks(a), bB=sumBlocks(b);
        if(aB!==bB) return aB-bB;
        if(a.usedWires!==b.usedWires) return a.usedWires-b.usedWires;
        const aH=(a.hintsUsed??0), bH=(b.hintsUsed??0);
        if(aH!==bH) return aH-bH;
        return new Date(a.timestamp)-new Date(b.timestamp);
      });

      const headerCols = [
        `<th>${t('thRank')}</th>`,
        `<th>${t('thNickname')}</th>`,
        ...allowedTypes.map(t=>`<th>${t}</th>`),
        `<th>${t('thWires')}</th>`,
        `<th>${t('thHintUsed')}</th>`,
        `<th>${t('thTime')}</th>`
      ].join('');

      const bodyRows = uniqueEntries.map((e,i)=>{
        const counts = allowedTypes.map(t=>e.blockCounts?.[t]??0).map(c=>`<td>${c}</td>`).join('');
        const timeStr = new Date(e.timestamp).toLocaleString();
        const nickname = e.nickname;
        const displayNickname = nickname.length>20 ? nickname.slice(0,20)+'...' : nickname;
        return `
  <tr>
    <td>${i+1}</td>
    <td>${displayNickname}</td>
    ${counts}
    <td>${e.usedWires}</td>
    <td>${e.hintsUsed ?? 0}</td>
    <td>${timeStr}</td>
  </tr>`;
      }).join('');

      listEl.innerHTML = `
        <div class="rankingTableWrapper">
          <table>
            <thead><tr>${headerCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">🔄 새로고침</button>
          <button id="closeRankingBtn">닫기</button>
        </div>`;
      document.getElementById('refreshRankingBtn')
        .addEventListener('click', () => showProblemRanking(problemKey));
      document.getElementById('closeRankingBtn')
        .addEventListener('click', () =>
          document.getElementById('rankingModal').classList.remove('active')
        );
    });

  document.getElementById('rankingModal').classList.add('active');
}

function showRanking(levelId) {
  const listEl = document.getElementById("rankingList");
  listEl.innerHTML = "로딩 중…";

  // ① 이 스테이지에서 허용된 블록 타입 목록
  const allowedTypes = Array.from(
    new Set(levelBlockSets[levelId].map(b => b.type))
  );

  db.ref(`rankings/${levelId}`)
    .orderByChild("timestamp")
    .once("value", snap => {
      const entries = [];
      snap.forEach(ch => {
        entries.push(ch.val());
        // 반환(return) 문이 없으므로 undefined가 반환되고, forEach는 계속 진행됩니다.
      });

      if (entries.length === 0) {
        listEl.innerHTML = `
        <p>랭킹이 없습니다.</p>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">🔄 새로고침</button>
          <button id="closeRankingBtn">닫기</button>
        </div>
      `;

        document.getElementById("refreshRankingBtn")
          .addEventListener("click", () => showRanking(levelId));
        document.getElementById("closeRankingBtn")
          .addEventListener("click", () =>
            document.getElementById("rankingModal").classList.remove("active")
          );
        return;
      }

      // ③ 클라이언트에서 다중 기준 정렬
      const sumBlocks = e => Object.values(e.blockCounts || {}).reduce((s, x) => s + x, 0);
      entries.sort((a, b) => {
        const aBlocks = sumBlocks(a), bBlocks = sumBlocks(b);
        if (aBlocks !== bBlocks) return aBlocks - bBlocks;            // 블록 합계 오름차순
        if (a.usedWires !== b.usedWires) return a.usedWires - b.usedWires; // 도선 오름차순
        const aH = (a.hintsUsed ?? 0), bH = (b.hintsUsed ?? 0);
        if (aH !== bH) return aH - bH;                                 // 힌트 사용 오름차순
        return new Date(a.timestamp) - new Date(b.timestamp);         // 제출 시간 오름차순
      });

      // ② 테이블 헤더 구성
      const headerCols = [
        `<th>${t('thRank')}</th>`,
        `<th>${t('thNickname')}</th>`,
        ...allowedTypes.map(t => `<th>${t}</th>`),
        `<th>${t('thWires')}</th>`,
        `<th>${t('thHintUsed')}</th>`,
        `<th>${t('thTime')}</th>`
      ].join("");

      // ③ 각 row 구성
      const bodyRows = entries.map((e, i) => {
        // blockCounts에서 타입별 개수 가져오기 (없으면 0)
        const counts = allowedTypes
          .map(t => e.blockCounts?.[t] ?? 0)
          .map(c => `<td>${c}</td>`)
          .join("");

        const timeStr = new Date(e.timestamp).toLocaleString();
        const nickname = e.nickname;
        const displayNickname = nickname.length > 20 ? nickname.slice(0, 20) + '...' : nickname;
        return `
  <tr>
    <td>${i + 1}</td>
    <td>${displayNickname}</td>
    ${counts}
    <td>${e.usedWires}</td>
    <td>${e.hintsUsed ?? 0}</td>
    <td>${timeStr}</td>
  </tr>`;
      }).join("");

      listEl.innerHTML = `
        <div class="rankingTableWrapper">
          <table>
            <thead><tr>${headerCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="modal-buttons">
          <button id="refreshRankingBtn">🔄 새로고침</button>
          <button id="closeRankingBtn">닫기</button>
        </div>
      `;
      document.getElementById("refreshRankingBtn")
        .addEventListener("click", () => showRanking(levelId));
      document.getElementById("closeRankingBtn")
        .addEventListener("click", () =>
          document.getElementById("rankingModal").classList.remove("active")
        );
    });

  document.getElementById("rankingModal").classList.add("active");
}



document.getElementById("viewRankingBtn")
  .addEventListener("click", () => {
    if (currentLevel != null) {
      showRanking(currentLevel);
    } else if (currentCustomProblemKey) {
      showProblemRanking(currentCustomProblemKey);
    } else {
      alert("먼저 레벨을 선택해주세요.");
    }
  });

function setupGoogleAuth() {
  const buttons = ['googleLoginBtn', 'modalGoogleLoginBtn']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const usernameEl = document.getElementById('loginUsername');
  const rankSection = document.getElementById('rankSection');
  const overallRankEl = document.getElementById('overallRank');
  const clearedCountEl = document.getElementById('clearedCount');
  const guestPromptEl = document.getElementById('loginGuestPrompt');

  if (!buttons.length) return Promise.resolve();

  return new Promise(resolve => {
    let done = false;
    firebase.auth().onAuthStateChanged(user => {
      buttons.forEach(btn => btn.textContent = user ? t('logoutBtn') : t('googleLoginBtn'));
      const nickname = localStorage.getItem('username') || '';
      if (usernameEl) usernameEl.textContent = nickname;
      if (user) {
        handleGoogleLogin(user);
        document.getElementById('usernameModal').style.display = 'none';
        if (rankSection) rankSection.style.display = 'block';
        if (guestPromptEl) guestPromptEl.style.display = 'none';
        fetchOverallStats(nickname).then(res => {
          if (overallRankEl) overallRankEl.textContent = `#${res.rank}`;
          if (clearedCountEl) clearedCountEl.textContent = res.cleared;
        });
      } else {
        restoreUsernameModalDefaults();
        if (rankSection) rankSection.style.display = 'none';
        if (guestPromptEl) guestPromptEl.style.display = 'block';
        if (!localStorage.getItem('username')) {
          assignGuestNickname();
        }
      }
      if (!done) { done = true; resolve(); }
    });

    buttons.forEach(btn => btn.addEventListener('click', () => {
      loginFromMainScreen = (btn.id === 'googleLoginBtn');
      const user = firebase.auth().currentUser;
      if (user) {
        firebase.auth().signOut();
      } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).catch(err => {
          alert(t('loginFailed').replace('{code}', err.code).replace('{message}', err.message));
          console.error(err);
        });
      }
    }));
  });
}

function setupMenuToggle() {
  const menuBar = document.getElementById('menuBar');
  const gameArea = document.getElementById('gameArea');
  const toggleBtn = document.getElementById('menuToggleBtn');
  if (!menuBar || !gameArea || !toggleBtn) return;

  menuBar.addEventListener('transitionend', e => {
    if (e.propertyName === 'width') {
      adjustGridZoom();
    }
  });

  toggleBtn.addEventListener('click', () => {
    menuBar.classList.toggle('collapsed');
    gameArea.classList.toggle('menu-collapsed');
    adjustGridZoom();
  });
}

function collapseMenuBarForMobile() {
  const menuBar = document.getElementById('menuBar');
  const gameArea = document.getElementById('gameArea');
  if (!menuBar || !gameArea) return;

  if (window.matchMedia('(max-width: 1024px)').matches) {
    menuBar.classList.add('collapsed');
    gameArea.classList.add('menu-collapsed');
  } else {
    menuBar.classList.remove('collapsed');
    gameArea.classList.remove('menu-collapsed');
  }

  adjustGridZoom();
  updatePadding();
}

function setupSettings() {
  const btn = document.getElementById('settingsBtn');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const checkbox = document.getElementById('autoSaveCheckbox');
  if (!btn || !modal || !closeBtn || !checkbox) return;

  const enabled = localStorage.getItem('autoSaveCircuit') !== 'false';
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    localStorage.setItem('autoSaveCircuit', checkbox.checked);
  });

  btn.addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

function updatePadding() {
  const menuBar = document.getElementById('menuBar');
  const gameArea = document.getElementById('gameArea');
  if (!menuBar || !gameArea) return;

  if (window.matchMedia('(max-width: 1024px)').matches) {
    gameArea.style.paddingBottom = '';
  } else {
    gameArea.style.paddingBottom = menuBar.offsetHeight + 'px';
  }
}

function setupGameAreaPadding() {
  window.addEventListener('load', updatePadding);
  updatePadding();
  window.addEventListener('resize', updatePadding);
}

document.addEventListener("DOMContentLoaded", () => {
  const uname = localStorage.getItem("username");
  if (uname) document.getElementById("guestUsername").textContent = uname;

  initialTasks.push(showOverallRanking());  // 전체 랭킹 표시
  initialTasks.push(setupGoogleAuth());

  setupKeyToggles();
  setupMenuToggle();
  setupSettings();
  setupGameAreaPadding();
  Promise.all(initialTasks).then(() => {
    hideLoadingScreen();
  });
});

function handleGoogleLogin(user) {
  const uid = user.uid;
  // 구글 계정의 기본 정보를 로컬에 저장해 둔다
  if (user.displayName) {
    localStorage.setItem(`googleDisplayName_${uid}`, user.displayName);
  }
  if (user.email) {
    localStorage.setItem(`googleEmail_${uid}`, user.email);
  }
  const oldName = localStorage.getItem('username');
  db.ref(`google/${uid}`).once('value').then(snap => {
    const dbName = snap.exists() ? snap.val().nickname : null;
    const localGoogleName = localStorage.getItem(`googleNickname_${uid}`);
    if (dbName) {
      // 항상 DB의 최신 닉네임을 사용한다
      localStorage.setItem(`googleNickname_${uid}`, dbName);
      applyGoogleNickname(dbName, oldName);
    } else if (localGoogleName) {
      // DB에 없으면 로컬에 저장된 이름을 등록한다
      db.ref(`google/${uid}`).set({ uid, nickname: localGoogleName });
      applyGoogleNickname(localGoogleName, oldName);
    } else if (oldName && !loginFromMainScreen) {
      // 기존 게스트 닉네임을 구글 계정에 연결하고 병합 여부를 묻는다
      localStorage.setItem(`googleNickname_${uid}`, oldName);
      db.ref(`google/${uid}`).set({ uid, nickname: oldName });
      document.getElementById('guestUsername').textContent = oldName;
      loadClearedLevelsFromDb().then(() => {
        showMergeModal(oldName, oldName);
        maybeStartTutorial();
      });
    } else {
      promptForGoogleNickname(oldName, uid);
    }
  });
}

function applyGoogleNickname(name, oldName) {
  if (oldName !== name) {
    localStorage.setItem('username', name);
    document.getElementById('guestUsername').textContent = name;
    loadClearedLevelsFromDb().then(() => {
      if (oldName) {
        showMergeModal(oldName, name);
      } else {
        registerUsernameIfNeeded(name);
      }
      maybeStartTutorial();
    });
  } else {
    registerUsernameIfNeeded(name);
    loadClearedLevelsFromDb().then(maybeStartTutorial);
  }
}

function registerUsernameIfNeeded(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    if (!snap.exists()) {
      const id = db.ref('usernames').push().key;
      db.ref(`usernames/${id}`).set(name);
    }
  });
}

function removeUsername(name) {
  db.ref('usernames').orderByValue().equalTo(name).once('value', snap => {
    snap.forEach(ch => ch.ref.remove());
  });
}

function showMergeModal(oldName, newName) {
  const modal = document.getElementById('mergeModal');
  const details = document.getElementById('mergeDetails');
  const confirm = document.getElementById('mergeConfirmBtn');
  const cancel = document.getElementById('mergeCancelBtn');
  details.innerHTML = '<p>현재 로컬 진행 상황을 Google 계정과 병합하시겠습니까?</p>';
  confirm.textContent = '네';
  cancel.textContent = '제 계정이 아닙니다';
  cancel.style.display = loginFromMainScreen ? 'none' : '';
  modal.style.display = 'flex';
  confirm.onclick = () => {
    modal.style.display = 'none';
    mergeProgress(oldName, newName).then(() => {
      loadClearedLevelsFromDb();
      showOverallRanking();
    });
  };
  cancel.onclick = () => {
    modal.style.display = 'none';
    if (!loginFromMainScreen && firebase.auth().currentUser) {
      promptForGoogleNickname(oldName, firebase.auth().currentUser.uid);
    } else {
      registerUsernameIfNeeded(newName);
      loadClearedLevelsFromDb();
      showOverallRanking();
    }
  };
}

function showAccountClaimModal(targetName, oldName, uid) {
  fetchProgressSummary(targetName).then(prog => {
    const modal = document.getElementById('mergeModal');
    const details = document.getElementById('mergeDetails');
    const confirm = document.getElementById('mergeConfirmBtn');
    const cancel = document.getElementById('mergeCancelBtn');
    details.innerHTML = `
      <p><b>${targetName}</b> 닉네임의 진행 상황</p>
      <ul>
        <li>클리어 레벨 수: ${prog.cleared}</li>
        <li>사용 블록 수: ${prog.blocks}</li>
        <li>사용 도선 수: ${prog.wires}</li>
      </ul>
      <p>이 계정과 진행 상황을 합치겠습니까?</p>
    `;
    confirm.textContent = '네';
    cancel.textContent = '제 계정이 아닙니다';
    cancel.style.display = loginFromMainScreen ? 'none' : '';
    modal.style.display = 'flex';
    confirm.onclick = () => {
      modal.style.display = 'none';
      localStorage.setItem('username', targetName);
      localStorage.setItem(`googleNickname_${uid}`, targetName);
      db.ref(`google/${uid}`).set({ uid, nickname: targetName });
      document.getElementById('guestUsername').textContent = targetName;
      const after = () => {
        loadClearedLevelsFromDb().then(() => {
          showOverallRanking();
          maybeStartTutorial();
        });
      };
      if (oldName && oldName !== targetName) {
        mergeProgress(oldName, targetName).then(after);
      } else {
        registerUsernameIfNeeded(targetName);
        after();
      }
    };
    cancel.onclick = () => {
      modal.style.display = 'none';
      if (!loginFromMainScreen) {
        promptForGoogleNickname(oldName, uid);
      }
    };
  });
}

function isRecordBetter(a, b) {
  if (!b) return true;
  const sumBlocks = e => Object.values(e.blockCounts || {}).reduce((s, x) => s + x, 0);
  const aBlocks = sumBlocks(a), bBlocks = sumBlocks(b);
  if (aBlocks !== bBlocks) return aBlocks < bBlocks;
  if (a.usedWires !== b.usedWires) return a.usedWires < b.usedWires;
  return new Date(a.timestamp) < new Date(b.timestamp);
}

function mergeProgress(oldName, newName) {
  return db.ref('rankings').once('value').then(snap => {
    const promises = [];
    snap.forEach(levelSnap => {
      let best = null;
      const removeKeys = [];
      levelSnap.forEach(recSnap => {
        const v = recSnap.val();
        if (v.nickname === oldName || v.nickname === newName) {
          if (isRecordBetter(v, best)) best = { ...v };
          removeKeys.push(recSnap.key);
        }
      });
      removeKeys.forEach(k => promises.push(levelSnap.ref.child(k).remove()));
      if (best) {
        best.nickname = newName;
        promises.push(levelSnap.ref.push(best));
      }
    });
    removeUsername(oldName);
    registerUsernameIfNeeded(newName);
    return Promise.all(promises);
  });
}

// 1) 모달과 버튼 요소 참조
const viewSavedBtn = document.getElementById('viewSavedBtn');
const saveCircuitBtn = document.getElementById('saveCircuitBtn');
const savedModal = document.getElementById('savedModal');
const closeSavedModal = document.getElementById('closeSavedModal');
const savedList = document.getElementById('savedList');

// IndexedDB helpers for storing GIFs
const GIF_DB_NAME = 'bitwiser-gifs';
const GIF_STORE = 'gifs';
let gifDbPromise = null;

function openGifDB() {
  if (!gifDbPromise) {
    gifDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(GIF_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(GIF_STORE)) {
          db.createObjectStore(GIF_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return gifDbPromise;
}

async function saveGifToDB(key, blob) {
  const db = await openGifDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GIF_STORE, 'readwrite');
    tx.objectStore(GIF_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadGifFromDB(key) {
  const db = await openGifDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GIF_STORE, 'readonly');
    const req = tx.objectStore(GIF_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteGifFromDB(key) {
  const db = await openGifDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GIF_STORE, 'readwrite');
    tx.objectStore(GIF_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

saveCircuitBtn.addEventListener('click', async () => {
  let saveSuccess = false;
  try {
    if (gifLoadingModal) {
      if (gifLoadingText) gifLoadingText.textContent = t('savingCircuit');
      gifLoadingModal.style.display = 'flex';
    }
    await saveCircuit();
    saveSuccess = true;
  } catch (e) {
    alert(t('saveFailed').replace('{error}', e));
  } finally {
    if (gifLoadingModal) {
      gifLoadingModal.style.display = 'none';
      if (gifLoadingText) gifLoadingText.textContent = t('gifLoadingText');
    }
  }
  if (saveSuccess) alert(t('circuitSaved'));
});

// 2) 저장된 회로 키들 읽어오기
function getSavePrefix() {
  if (currentLevel != null) {
    return `bit_saved_stage_${String(currentLevel).padStart(2, '0')}_`;
  } else if (currentCustomProblemKey) {
    return `bit_saved_prob_${currentCustomProblemKey}_`;
  }
  return 'bit_saved_';
}

function getSavedKeys() {
  const prefix = getSavePrefix();
  return Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .sort((a, b) => {
      const tA = parseInt(a.slice(prefix.length), 10);
      const tB = parseInt(b.slice(prefix.length), 10);
      return tB - tA;
    });
}

// 3) 리스트 그리기
async function renderSavedList() {
  const savedList = document.getElementById('savedList');
  savedList.innerHTML = '';
  const keys = getSavedKeys().filter(key => {
    const data = JSON.parse(localStorage.getItem(key));
    if (currentLevel != null) return data.stageId === currentLevel;
    if (currentCustomProblemKey) return data.problemKey === currentCustomProblemKey;
    return false;
  });
  if (!keys.length) {
    savedList.innerHTML = `<p>${t('noCircuits')}</p>`;
    return;
  }
  for (const key of keys) {
    const data = JSON.parse(localStorage.getItem(key));
    const item = document.createElement('div');
    item.className = 'saved-item';
    const label = data.stageId != null
      ? `Stage ${String(data.stageId).padStart(2, '0')}`
      : `Problem ${data.problemTitle || data.problemKey}`;

    const blob = await loadGifFromDB(key);
    const img = document.createElement('img');
    if (blob) img.src = URL.createObjectURL(blob);
    img.alt = label;
    item.appendChild(img);

    const cap = document.createElement('div');
    cap.className = 'saved-caption';
    cap.textContent = `${label} — ${new Date(data.timestamp).toLocaleString()}`;
    item.appendChild(cap);

    item.addEventListener('click', () => {
      loadCircuit(key);
      document.getElementById('savedModal').style.display = 'none';
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = t('deleteBtn');
    delBtn.className = 'deleteBtn';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(t('confirmDelete'))) return;
      localStorage.removeItem(key);
      deleteGifFromDB(key);
      renderSavedList();
    });
    item.appendChild(delBtn);

    savedList.appendChild(item);
  }
}

// 4) 모달 열기/닫기
document.getElementById('viewSavedBtn')
  .addEventListener('click', () => {
    renderSavedList();
    document.getElementById('savedModal').style.display = 'flex';
  });
document.getElementById('closeSavedModal')
  .addEventListener('click', () => {
    document.getElementById('savedModal').style.display = 'none';
  });

// 5) 회로 불러오는 함수
function loadCircuit(key) {
  const data = JSON.parse(localStorage.getItem(key));
  if (!data) return alert(t('loadFailedNoData'));

  clearGrid();
  clearWires();

  // ① 셀 상태 복원
  const cells = document.querySelectorAll('#grid .cell');
  data.grid.forEach(state => {
    const cell = cells[state.index];
    // 클래스 초기화 후
    cell.className = 'cell';
    // dataset 복원
    if (state.type) cell.dataset.type = state.type;
    if (state.name) cell.dataset.name = state.name;
    if (state.value) cell.dataset.value = state.value;
    // CSS 클래스 복원
    state.classes.forEach(c => cell.classList.add(c));
    // 블록/입력값 텍스트, 핸들러 바인딩
    if (state.type === 'INPUT' || state.type === 'OUTPUT') {
      attachInputClickHandlers(cell);
    }
    if (state.type && state.type !== 'WIRE') {
      cell.classList.add('block');
      if (state.type === 'INPUT')
        cell.textContent = state.name;
        //cell.textContent = `${state.name}(${state.value})`;
      else if (state.type === 'OUTPUT')
        cell.textContent = state.name;
      else if (state.type === 'JUNCTION')
        cell.textContent = 'JUNC';
      else
        cell.textContent = state.type;
      cell.draggable = true;
    }
  });

  // ② DOM wire 복원
  data.wires.forEach(w => {
    placeWireAt(w.x, w.y, w.dir);
    const idx = w.y * GRID_COLS + w.x;
    const cell = cells[idx];
  });

  // ── 여기서 wires 배열 복원 ──
  if (data.wiresObj) {
    wires = data.wiresObj.map(obj => ({
      start: cells[obj.startIdx],
      end: cells[obj.endIdx],
      path: obj.pathIdxs.map(i => cells[i])
    }));
    if (wires.some(w => w.path.length <= 2)) {
      clearGrid();
      clearWires();
      alert('invalid circuit!');
      return;
    }
  }
  // ▼ circuit 불러올 때 사용된 INPUT/OUTPUT 블록 아이콘 숨기기
  const panel = document.getElementById('blockPanel');
  // data.grid 에 복원된 셀 상태 중 INPUT/OUTPUT 타입만 골라 이름(name) 리스트 생성
  const usedNames = data.grid
    .filter(state => state.type === 'INPUT' || state.type === 'OUTPUT')
    .map(state => state.name);
  panel.querySelectorAll('.blockIcon').forEach(icon => {
    const type = icon.dataset.type;
    const name = icon.dataset.name;
    // 같은 이름의 INPUT/OUTPUT 아이콘이 있으면 숨김 처리
    if ((type === 'INPUT' || type === 'OUTPUT') && usedNames.includes(name)) {
      icon.style.display = 'none';
    }
  });
  markCircuitModified();
}

function highlightOutputErrors() {
  // 1) 기존 에러 표시 제거
  grid.querySelectorAll('.cell[data-type="OUTPUT"].error')
    .forEach(el => el.classList.remove('error'));

  // 2) 각 OUTPUT 블록에 들어오는 전선 수 세기
  grid.querySelectorAll('.cell[data-type="OUTPUT"]')
    .forEach(block => {
      const incomingCount = wires.filter(w => w.end === block).length;
      if (incomingCount >= 2) {
        block.classList.add('error');
      }
    });
}

async function saveCircuit() {
  const data = {
    stageId: currentLevel,
    problemKey: currentCustomProblemKey,
    problemTitle: currentCustomProblem ? currentCustomProblem.title : undefined,
    timestamp: new Date().toISOString(),
    grid: getGridData(),
    wires: getWireData(),

    // 이전: wiresObj 프로퍼티가 없었습니다
    // 추가: 실제 런타임 wires 배열을 저장해서 나중에 그대로 복원
    wiresObj: wires.map(w => ({
      startIdx: Number(w.start.dataset.index),
      endIdx: Number(w.end.dataset.index),
      pathIdxs: w.path.map(c => Number(c.dataset.index))
    })),

    usedBlocks: countUsedBlocks(),
    usedWires: countUsedWires()
  };

  const timestampMs = Date.now();
  const key = `${getSavePrefix()}${timestampMs}`;
  try {
    localStorage.setItem(key, JSON.stringify(data));

    // capture GIF and store in IndexedDB
    resetCaptureCanvas();
    const state = getCircuitSnapshot();
    const blob = await new Promise(resolve => captureGIF(state, resolve));
    await saveGifToDB(key, blob);

    console.log(`Circuit saved: ${key}`, data);
    lastSavedKey = key;
    return key;
  } catch (e) {
    console.error('Circuit save failed:', e);
    alert('회로 저장 중 오류가 발생했습니다.');
    throw e;
  }
}

function getGridData() {
  return Array.from(document.querySelectorAll('#grid .cell')).map(cell => ({
    index: +cell.dataset.index,
    type: cell.dataset.type || null,
    name: cell.dataset.name || null,
    value: cell.dataset.value || null,
    classes: Array.from(cell.classList).filter(c => c !== 'cell'),
  }));
}

function getWireData() {
  return Array.from(grid.querySelectorAll('.cell.wire')).map(cell => {
    const dir = Array.from(cell.classList)
      .find(c => c.startsWith('wire-'))
      .split('-')[1];
    return { x: cell.col, y: cell.row, dir };
  });
}
// 이전: countUsedBlocks 미정의
function countUsedBlocks() {
  return grid ? grid.querySelectorAll('.cell.block').length : 0;
}

// 이전: countUsedWires 미정의
function countUsedWires() {
  return grid ? grid.querySelectorAll('.cell.wire').length : 0;
}
// 이전: clearGrid 미정의
function clearGrid() {
  if (!grid) return;
  // 전체 셀에 대해 클래스 및 데이터 속성 초기화
  grid.querySelectorAll('.cell').forEach(cell => {
    if (currentCustomProblem && currentCustomProblem.fixIO && cell.dataset.fixed === '1') {
      if (cell.dataset.type === 'INPUT') {
        cell.dataset.value = '0';
        cell.classList.remove('active');
        attachInputClickHandlers(cell);
      }
      return;
    }
    cell.className = 'cell';
    cell.textContent = '';
    delete cell.dataset.type;
    delete cell.dataset.name;
    delete cell.dataset.value;
    delete cell.dataset.val;
    delete cell.dataset.fixed;
    cell.removeAttribute('draggable');
    delete cell.onclick;
  });

  // 전선 관련 상태 초기화
  wires = [];
  wireTrace = [];
  markCircuitModified();
}

function clearWires() {

  // 수정: 전역 grid 대상
  grid.querySelectorAll('.cell.wire').forEach(cell => {
    cell.classList.remove('wire');
    Array.from(cell.classList)
      .filter(c => c.startsWith('wire-'))
      .forEach(c => cell.classList.remove(c));
    delete cell.dataset.type;
  });
  markCircuitModified();
}

function updateUsageCounts() {
  if (!grid) return;
  const blockCount = grid.querySelectorAll('.cell.block').length;
  const wireCount = grid.querySelectorAll('.cell.wire').length;
  [document.getElementById('usedBlocks'),
   document.getElementById('problemUsedBlocks')]
    .filter(Boolean)
    .forEach(el => el.textContent = blockCount);
  [document.getElementById('usedWires'),
   document.getElementById('problemUsedWires')]
    .filter(Boolean)
    .forEach(el => el.textContent = wireCount);
}

function markCircuitModified() {
  problemOutputsValid = false;
  updateUsageCounts();
  if (typeof evaluateCircuit === 'function' && grid) {
    evaluateCircuit();
  }
}

function moveCircuit(dx, dy) {
  if (!grid) return;
  if (currentCustomProblem && currentCustomProblem.fixIO) return;
  const cells = Array.from(grid.querySelectorAll('.cell.block, .cell.wire'));
  if (cells.length === 0) return;

  for (const cell of cells) {
    const nr = cell.row + dy;
    const nc = cell.col + dx;
    if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) {
      return;
    }
  }

  const states = cells.map(cell => {
    const data = {};
    for (const k in cell.dataset) {
      if (k !== 'index') data[k] = cell.dataset[k];
    }
    return {
      cell,
      row: cell.row,
      col: cell.col,
      classes: Array.from(cell.classList).filter(c => c !== 'cell'),
      data,
      draggable: cell.draggable,
      text: cell.textContent,
    };
  });

  const map = new Map();
  states.forEach(s => {
    const target = grid.children[(s.row + dy) * GRID_COLS + (s.col + dx)];
    map.set(s.cell, target);
  });

  states.forEach(s => {
    s.cell.className = 'cell';
    s.cell.draggable = false;
    for (const k in s.cell.dataset) {
      if (k !== 'index') delete s.cell.dataset[k];
    }
    s.cell.textContent = '';
    s.cell.onclick = null;
  });

  states.forEach(s => {
    const target = map.get(s.cell);
    s.classes.forEach(cls => target.classList.add(cls));
    for (const [k, v] of Object.entries(s.data)) {
      target.dataset[k] = v;
    }
    target.draggable = s.draggable;
    target.textContent = s.text;
    if (target.dataset.type === 'INPUT' || target.dataset.type === 'OUTPUT') {
      attachInputClickHandlers(target);
    }
  });

  wires.forEach(w => {
    w.path = w.path.map(c => map.get(c));
    w.start = map.get(w.start);
    w.end = map.get(w.end);
  });

  markCircuitModified();
}
// 이전: placeBlockAt 미정의
function placeBlockAt(x, y, type) {
  const idx = y * GRID_COLS + x;
  // 수정:
  const cell = grid.querySelectorAll('.cell')[idx];
  cell.classList.add('block');
  cell.dataset.type = type;
  if (type === 'INPUT' || type === 'OUTPUT') {
    attachInputClickHandlers(cell);
    //cell.textContent = `${cell.dataset.name || type}(0)`;
    cell.textContent = (cell.dataset.name || type);
  } else {
    cell.textContent = type;
  }
}

// 이전: placeWireAt 미정의
function placeWireAt(x, y, dir) {
  const idx = y * GRID_COLS + x;
  // 수정:
  const cell = grid.querySelectorAll('.cell')[idx];
  cell.classList.add('wire', `wire-${dir}`);
  cell.dataset.type = 'WIRE';
}

function attachInputClickHandlers(cell) {
  cell.onclick = () => {
    const val = cell.dataset.value === '1' ? '0' : '1';
    cell.dataset.value = val;
    cell.textContent = cell.dataset.name;
    cell.classList.toggle('active', val === '1');
    evaluateCircuit();
  };
}

function showOverallRanking() {
  const listEl = document.getElementById("overallRankingList");
  listEl.innerHTML = "로딩 중…";

  // rankings 아래 모든 레벨의 데이터를 한 번에 읽어옵니다.
  return db.ref("rankings").once("value").then(snap => {
    const data = {};  // { nickname: { stages:Set, blocks:sum, wires:sum, lastTimestamp } }

    snap.forEach(levelSnap => {
      levelSnap.forEach(recSnap => {
        const e = recSnap.val();
        const name = e.nickname || "익명";

        if (!data[name]) {
          data[name] = {
            stages: new Set(),
            blocks: 0,
            wires: 0,
            lastTimestamp: e.timestamp
          };
        }

        data[name].stages.add(levelSnap.key);

        const sumBlocks = Object.values(e.blockCounts || {})
          .reduce((s, x) => s + x, 0);
        data[name].blocks += sumBlocks;
        data[name].wires += e.usedWires || 0;

        // 가장 늦은(=가장 큰) timestamp를 저장
        if (new Date(e.timestamp) > new Date(data[name].lastTimestamp)) {
          data[name].lastTimestamp = e.timestamp;
        }
      });
    });

    // 배열로 변환 후 다중 기준 정렬
    const entries = Object.entries(data).map(([nickname, v]) => ({
      nickname,
      cleared: v.stages.size,
      blocks: v.blocks,
      wires: v.wires,
      timestamp: v.lastTimestamp
    }));
    entries.sort((a, b) => {
      if (a.cleared !== b.cleared) return b.cleared - a.cleared;
      if (a.blocks !== b.blocks) return a.blocks - b.blocks;
      if (a.wires !== b.wires) return a.wires - b.wires;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    // HTML 테이블 생성
    let html = `<table>
  <thead><tr>
    <th>${t('thRank')}</th><th>${t('thNickname')}</th><th>${t('thStage')}</th><th>${t('thBlocks')}</th><th>${t('thWires')}</th>
  </tr></thead><tbody>`;

    entries.forEach((e, i) => {
      // 닉네임 잘라내기 로직은 그대로…
      let displayName = e.nickname;
      if (displayName.length > 20) displayName = displayName.slice(0, 20) + '...';

      html += `<tr>
    <td>${i + 1}</td>
    <td>${displayName}</td>
    <td>${e.cleared}</td>
    <td>${e.blocks}</td>
    <td>${e.wires}</td>
  </tr>`;
    });

    html += `</tbody></table>`;
    listEl.innerHTML = html;
  });
}

function showClearedModal(level) {
  const modal = document.getElementById('clearedModal');
  document.getElementById('clearedStageNumber').textContent = level;
  const container = document.getElementById('clearedRanking');

  // 1) 현재 플레이어 닉네임 가져오기 (닉네임 설정 모달에서 localStorage에 저장했다고 가정)
  const currentNickname = localStorage.getItem('username') || localStorage.getItem('nickname') || '';

  const prevBtn = document.getElementById('prevStageBtn');
  const nextBtn = document.getElementById('nextStageBtn');

  prevBtn.disabled = !(levelTitles[level - 1] && isLevelUnlocked(level - 1));
  nextBtn.disabled = !(levelTitles[level + 1] && isLevelUnlocked(level + 1));

  // 2) Firebase Realtime Database에서 랭킹 불러오기
  firebase.database().ref(`rankings/${level}`)
    .orderByChild('timestamp')
    .once('value')
    .then(snapshot => {
      // 데이터가 없으면 안내 메시지
      if (!snapshot.exists()) {
        // … 생략 …
      } else {
        // 1) 결과 배열로 추출
        const entries = [];
        snapshot.forEach(child => {
          entries.push(child.val());
        });

        // ──────────────────────────────────────────────────────────────
        // 2) viewRanking과 동일한 다중 기준 정렬 추가
        const sumBlocks = e => Object.values(e.blockCounts || {}).reduce((s, x) => s + x, 0);
        entries.sort((a, b) => {
          const aBlocks = sumBlocks(a), bBlocks = sumBlocks(b);
          if (aBlocks !== bBlocks) return aBlocks - bBlocks;              // 블록 합계 오름차순
          if (a.usedWires !== b.usedWires) return a.usedWires - b.usedWires; // 도선 수 오름차순
          const aH = (a.hintsUsed ?? 0), bH = (b.hintsUsed ?? 0);
          if (aH !== bH) return aH - bH;
          return new Date(a.timestamp) - new Date(b.timestamp);           // 클리어 시각 오름차순
        });
        // ──────────────────────────────────────────────────────────────

        // 3) 정렬된 entries로 테이블 생성
        let html = `
          <table class="rankingTable">
            <tr><th>${t('thRank')}</th><th>${t('thNickname')}</th><th>${t('thHintUsed')}</th><th>${t('thTime')}</th></tr>
        `;
        entries.forEach((e, i) => {
          const timeStr = new Date(e.timestamp).toLocaleString();
          const cls = (e.nickname === currentNickname) ? 'highlight' : '';
          html += `
            <tr class="${cls}">
              <td>${i + 1}</td>
              <td>${e.nickname}</td>
              <td>${e.hintsUsed ?? 0}</td>
              <td>${timeStr}</td>
            </tr>
          `;
        });
        html += `</table>`;
        container.innerHTML = html;
      }

      // 버튼 이벤트 바인딩
      document.getElementById('prevStageBtn').onclick = () => {
        modal.style.display = 'none';         // 모달 감추기
        returnToEditScreen();
        startLevel(level - 1);                   // 1보다 작아지지 않도록 클램핑
      };
      document.getElementById('nextStageBtn').onclick = () => {
        modal.style.display = 'none';
        returnToEditScreen();
        startLevel(level + 1);
      };
      modal.querySelector('.closeBtn').onclick = () => {
        modal.style.display = 'none';
      };

      // 모달 띄우기
      modal.style.display = 'flex';
    })
    .catch(err => console.error('랭킹 로드 실패:', err));
}


function isLevelUnlocked(level) {
  const cleared = clearedLevelsFromDb;
  for (let idx = 0; idx < chapterData.length; idx++) {
    const chap = chapterData[idx];
    if (chap.stages.includes(level)) {
      // 0번째 챕터는 항상 해금, 이후는 이전 챕터 모든 스테이지 클리어 시 해금
      if (idx === 0) return true;
      return chapterData[idx - 1].stages.every(s => cleared.includes(s));
    }
  }
  // chapterData에 정의되지 않은 스테이지(사용자 정의 등)는 기본 허용
  return true;
}


function handleProblemKeyDown(e) {
  const problemScreen = document.getElementById('problem-screen');
  if (!problemScreen || problemScreen.style.display === 'none') return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    return;
  }

  if (e.key === 'Control') {
    isWireDrawing = true;
    problemStatusToggle.classList.add('active');
  } else if (e.key === 'Shift') {
    isWireDeleting = true;
    problemDeleteToggle.classList.add('active');
  } else if (e.key.toLowerCase() === 'r') {
      if (isTextInputFocused()) {
        [resetToggle, problemResetToggle].forEach(btn => btn && btn.classList.remove('active'));
        return;
      }
    if (confirm(t('confirmDeleteAll'))) {
      clearGrid();
      initProblemBlockPanel();
      initTestcaseTable();
      markCircuitModified();
    }
  }
}

function handleProblemKeyUp(e) {
  const problemScreen = document.getElementById('problem-screen');
  if (!problemScreen || problemScreen.style.display === 'none') return;
  if (e.key === 'Control') {
    isWireDrawing = false;
    problemStatusToggle.classList.remove('active');
    clearWirePreview();
    wireTrace = [];
  }
  if (e.key === 'Shift') {
    isWireDeleting = false;
    problemDeleteToggle.classList.remove('active');
  }
}

function getBlockPanel() {
  const problemScreen = document.getElementById("problem-screen");
  if (problemScreen && problemScreen.style.display !== "none") {
    return document.getElementById("problemBlockPanel");
  }
  return document.getElementById("blockPanel");
}
const createProblemBtn         = document.getElementById('createProblemBtn');
const problemScreen            = document.getElementById('problem-screen');
const backToMainFromProblem    = document.getElementById('backToMainFromProblem');
const saveProblemBtn           = document.getElementById('saveProblemBtn');
const viewProblemListBtn       = document.getElementById('viewProblemListBtn');
const closeProblemListModal    = document.getElementById('closeProblemListModal');
const userProblemsScreen       = document.getElementById('user-problems-screen');
const userProblemList          = document.getElementById('userProblemList');
const backToChapterFromUserProblems = document.getElementById('backToChapterFromUserProblems');
const openProblemCreatorBtn    = document.getElementById('openProblemCreatorBtn');
const problemSaveModal         = document.getElementById('problemSaveModal');
const problemModalBackdrop     = document.querySelector('#problemSaveModal .modal-backdrop');
const confirmSaveProblemBtn    = document.getElementById('confirmSaveProblemBtn');
const cancelSaveProblemBtn     = document.getElementById('cancelSaveProblemBtn');
const problemTitleInput        = document.getElementById('problemTitleInput');
const problemDescInput         = document.getElementById('problemDescInput');
const fixIOCheck               = document.getElementById('fixIOCheck');

//— ④ 메인 → 문제 출제 화면
if (createProblemBtn) {
  createProblemBtn.addEventListener('click', () => {
    firstScreen.style.display   = 'none';
    problemScreen.style.display = 'block';
    problemScreenPrev = 'main';
    initProblemEditor();
  });
}

//— ⑤ 문제 출제 화면 → 메인
backToMainFromProblem.addEventListener('click', () => {
  problemScreen.style.display = 'none';
  if (problemScreenPrev === 'userProblems') {
    userProblemsScreen.style.display = 'block';
  } else if (problemScreenPrev === 'main') {
    firstScreen.style.display = '';
  } else {
    chapterStageScreen.style.display = 'block';
  }
  problemScreenPrev = null;
});

if (backToChapterFromUserProblems) {
  backToChapterFromUserProblems.addEventListener('click', () => {
    userProblemsScreen.style.display = 'none';
    chapterStageScreen.style.display = 'block';
  });
}

if (openProblemCreatorBtn) {
  openProblemCreatorBtn.addEventListener('click', () => {
    userProblemsScreen.style.display = 'none';
    problemScreen.style.display = 'flex';
    problemScreenPrev = 'userProblems';
    initProblemEditor();
  });
}

document.getElementById('updateIOBtn').addEventListener('click', () => {
  alert('입출력/그리드 설정을 변경하면 회로가 초기화됩니다.');
  const inputEl = document.getElementById('inputCount');
  const outputEl = document.getElementById('outputCount');
  const inputs = Math.min(6, Math.max(1, parseInt(inputEl.value) || 1));
  const outputs = Math.min(6, Math.max(1, parseInt(outputEl.value) || 1));
  inputEl.value = inputs;
  outputEl.value = outputs;
  const rows = Math.min(15, Math.max(1, parseInt(document.getElementById('gridRows').value) || 6));
  const cols = Math.min(15, Math.max(1, parseInt(document.getElementById('gridCols').value) || 6));
  document.getElementById('gridRows').value = rows;
  document.getElementById('gridCols').value = cols;
  setupGrid('problemGrid', rows, cols);
  setGridDimensions(rows, cols);
  clearGrid();
  clearWires();
  initProblemBlockPanel();
  initTestcaseTable();
  markCircuitModified();
  adjustGridZoom('problemGridContainer');
});
// 자동 생성 방식으로 테스트케이스를 채우므로 행 추가 버튼 비활성화
const addRowBtn = document.getElementById('addTestcaseRowBtn');
if (addRowBtn) addRowBtn.style.display = 'none';
document.getElementById('computeOutputsBtn').addEventListener('click', computeOutputs);
if (saveProblemBtn) saveProblemBtn.addEventListener('click', () => {
  problemTitleInput.value = '';
  problemDescInput.value = '';
  if (fixIOCheck) fixIOCheck.checked = false;
  problemSaveModal.style.display = 'flex';
  problemTitleInput.focus();
});
if (confirmSaveProblemBtn) confirmSaveProblemBtn.addEventListener('click', () => {
  // saveProblem이 true를 반환할 때만 모달을 닫습니다.
  if (saveProblem()) {
    problemSaveModal.style.display = 'none';
  }
});
if (cancelSaveProblemBtn) cancelSaveProblemBtn.addEventListener('click', () => {
  problemSaveModal.style.display = 'none';
});
if (problemModalBackdrop) problemModalBackdrop.addEventListener('click', () => {
  problemSaveModal.style.display = 'none';
});
if (viewProblemListBtn) viewProblemListBtn.addEventListener('click', showProblemList);
  if (closeProblemListModal) closeProblemListModal.addEventListener('click', () => {
    document.getElementById('problemListModal').style.display = 'none';
  });

  const closeHintBtn = document.getElementById('closeHintBtn');
  const closeHintMsgBtn = document.getElementById('closeHintMessageBtn');
  if (closeHintBtn) closeHintBtn.addEventListener('click', () => {
    document.getElementById('hintModal').style.display = 'none';
    clearInterval(hintTimerInterval);
  });
  if (closeHintMsgBtn) closeHintMsgBtn.addEventListener('click', () => {
    document.getElementById('hintMessageModal').style.display = 'none';
  });

// -------------------- 사용자 정의 문제 편집 --------------------
function initProblemEditor() {
  const inputEl = document.getElementById('inputCount');
  const outputEl = document.getElementById('outputCount');
  inputEl.value = Math.min(6, Math.max(1, parseInt(inputEl.value) || 1));
  outputEl.value = Math.min(6, Math.max(1, parseInt(outputEl.value) || 1));

  const rows = Math.min(15, Math.max(1, parseInt(document.getElementById('gridRows').value) || 6));
  const cols = Math.min(15, Math.max(1, parseInt(document.getElementById('gridCols').value) || 6));
  document.getElementById('gridRows').value = rows;
  document.getElementById('gridCols').value = cols;
  setupGrid('problemGrid', rows, cols);
  clearGrid();
  setGridDimensions(rows, cols);
  initProblemBlockPanel();
  initTestcaseTable();
  document.removeEventListener('keydown', handleProblemKeyDown);
  document.removeEventListener('keyup', handleProblemKeyUp);
  document.addEventListener('keydown', handleProblemKeyDown);
  document.addEventListener('keyup', handleProblemKeyUp);
  markCircuitModified();
  adjustGridZoom('problemGridContainer');
}

function initProblemBlockPanel() {
  const panel = document.getElementById('problemBlockPanel');
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const blocks = [];
  for (let i = 1; i <= inputCnt; i++) blocks.push({ type: 'INPUT', name: 'IN' + i });
  for (let j = 1; j <= outputCnt; j++) blocks.push({ type: 'OUTPUT', name: 'OUT' + j });
  ['AND', 'OR', 'NOT', 'JUNCTION'].forEach(t => blocks.push({ type: t }));
  buildBlockPanel(panel, blocks);
}

function initTestcaseTable() {
  const table = document.getElementById('testcaseTable');
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  for (let i = 1; i <= inputCnt; i++) {
    const th = document.createElement('th');
    th.textContent = 'IN' + i;
    tr.appendChild(th);
  }
  for (let j = 1; j <= outputCnt; j++) {
    const th = document.createElement('th');
    th.textContent = 'OUT' + j;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  tbody.innerHTML = '';
  const totalRows = 1 << inputCnt;
  for (let r = 0; r < totalRows; r++) {
    const row = document.createElement('tr');
    for (let i = 0; i < inputCnt; i++) {
      const td = document.createElement('td');
      td.style.width = '30px';
      td.textContent = (r >> (inputCnt - 1 - i)) & 1;
      row.appendChild(td);
    }
    for (let j = 0; j < outputCnt; j++) {
      const td = document.createElement('td');
      td.style.width = '30px';
      td.textContent = '';
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
}

function addTestcaseRow() {
  const table = document.getElementById('testcaseTable');
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const tr = document.createElement('tr');
  for (let i = 0; i < inputCnt; i++) {
    const td = document.createElement('td');
    td.style.width = '30px';
    td.textContent = '0';
    tr.appendChild(td);
  }
  for (let j = 0; j < outputCnt; j++) {
    const td = document.createElement('td');
    td.style.width = '30px';
    td.textContent = '';
    tr.appendChild(td);
  }
  table.querySelector('tbody').appendChild(tr);
}

function computeOutputs() {
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const rows = Array.from(document.querySelectorAll('#testcaseTable tbody tr'));
  const inNames = Array.from({ length: inputCnt }, (_, i) => 'IN' + (i + 1));
  const outNames = Array.from({ length: outputCnt }, (_, i) => 'OUT' + (i + 1));
  rows.forEach(tr => {
    const inputs = Array.from(tr.querySelectorAll('td')).slice(0, inputCnt);
    inNames.forEach((name, idx) => {
      const cell = grid.querySelector('.cell.block[data-type="INPUT"][data-name="' + name + '"]');
      if (cell) {
        cell.dataset.value = inputs[idx].textContent.trim() === '1' ? '1' : '0';
        cell.classList.toggle('active', cell.dataset.value === '1');
      }
    });
    evaluateCircuit();
    outNames.forEach((name, idx) => {
      const cell = grid.querySelector('.cell.block[data-type="OUTPUT"][data-name="' + name + '"]');
      const val = cell ? (cell.dataset.val === 'true' || cell.dataset.val === '1' ? '1' : '0') : '0';
      const td = tr.querySelectorAll('td')[inputCnt + idx];
      if (td) td.textContent = val;
    });
  });
  problemOutputsValid = true;
}

// ----- 사용자 정의 문제 저장/불러오기 -----
function getProblemGridData() {
  return Array.from(document.querySelectorAll('#problemGrid .cell')).map(cell => ({
    index: +cell.dataset.index,
    type: cell.dataset.type || null,
    name: cell.dataset.name || null,
    value: cell.dataset.value || null,
    classes: Array.from(cell.classList).filter(c => c !== 'cell')
  }));
}

function getProblemWireData() {
  return Array.from(document.querySelectorAll('#problemGrid .cell.wire')).map(cell => {
    const dir = Array.from(cell.classList).find(c => c.startsWith('wire-')).split('-')[1];
    return { x: cell.col, y: cell.row, dir };
  });
}

function getProblemTruthTable() {
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const rows = Array.from(document.querySelectorAll('#testcaseTable tbody tr'));
  return rows.map(tr => {
    const row = {};
    const cells = Array.from(tr.querySelectorAll('td'));
    for (let i = 0; i < inputCnt; i++) {
      row['IN' + (i + 1)] = cells[i].textContent.trim() === '1' ? 1 : 0;
    }
    for (let j = 0; j < outputCnt; j++) {
      row['OUT' + (j + 1)] = cells[inputCnt + j].textContent.trim() === '1' ? 1 : 0;
    }
    return row;
  });
}

function collectProblemData() {
  return {
    title: document.getElementById('problemTitleInput').value.trim(),
    description: document.getElementById('problemDescInput').value.trim(),
    inputCount: parseInt(document.getElementById('inputCount').value) || 1,
    outputCount: parseInt(document.getElementById('outputCount').value) || 1,
    gridRows: parseInt(document.getElementById('gridRows').value) || 6,
    gridCols: parseInt(document.getElementById('gridCols').value) || 6,
    fixIO: document.getElementById('fixIOCheck').checked,
    table: getProblemTruthTable(),
    grid: getProblemGridData(),
    wires: getProblemWireData(),
    wiresObj: wires.map(w => ({
      startIdx: +w.start.dataset.index,
      endIdx: +w.end.dataset.index,
      pathIdxs: w.path.map(c => +c.dataset.index)
    })),
    creator: localStorage.getItem('username') || '익명',
    timestamp: new Date().toISOString()
  };
}

function saveProblem() {
  const title = problemTitleInput.value.trim();
  const desc  = problemDescInput.value.trim();
  if (!title) {
    alert(t('problemTitleRequired'));
    problemTitleInput.focus();
    return false;
  }
  if (!desc) {
    alert(t('problemDescRequired'));
    problemDescInput.focus();
    return false;
  }
  if (!problemOutputsValid) {
    alert(t('computeOutputsFirst'));
    return false;
  }
  const data = collectProblemData();
  const key = db.ref('problems').push().key;
  db.ref('problems/' + key).set(data)
    .then(() => alert(t('problemSaved')))
    .catch(err => alert(t('saveFailed').replace('{error}', err)));
  return true;
}

function showProblemList() {
  const modal = document.getElementById('problemListModal');
  const list = document.getElementById('problemList');
  db.ref('problems').once('value').then(snapshot => {
    list.innerHTML = '';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>${t('thTitle')}</th><th>${t('thGrid')}</th><th>${t('thNotes')}</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    if (!snapshot.exists()) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3">${t('noProblems')}</td>`;
      tbody.appendChild(tr);
    } else {
      snapshot.forEach(child => {
        const d = child.val();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${d.title || child.key}</td>
          <td>${(d.gridRows || 6)}×${(d.gridCols || 6)}</td>
          <td><button class="loadProbBtn" data-key="${child.key}">${t('loadBtn')}</button></td>`;
        tbody.appendChild(tr);
      });
      table.querySelectorAll('.loadProbBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          loadProblem(btn.dataset.key);
          modal.style.display = 'none';
        });
      });
    }
    list.appendChild(table);
    modal.style.display = 'flex';
  });
}

function loadProblem(key) {
  db.ref('problems/' + key).once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) return alert(t('loadFailed'));

    document.getElementById('inputCount').value = data.inputCount || 1;
    document.getElementById('outputCount').value = data.outputCount || 1;
    document.getElementById('gridRows').value = data.gridRows || 6;
    document.getElementById('gridCols').value = data.gridCols || 6;
    setupGrid('problemGrid', data.gridRows || 6, data.gridCols || 6);
    setGridDimensions(data.gridRows || 6, data.gridCols || 6);
    initProblemBlockPanel();
    initTestcaseTable();

    document.getElementById('problemTitleInput').value = data.title || '';
    document.getElementById('problemDescInput').value = data.description || '';
    if (fixIOCheck) fixIOCheck.checked = !!data.fixIO;

    // truth table
    const tbodyRows = document.querySelectorAll('#testcaseTable tbody tr');
    data.table.forEach((row, rIdx) => {
      const cells = Array.from(tbodyRows[rIdx].querySelectorAll('td'));
      for (let i = 0; i < data.inputCount; i++) {
        if (cells[i]) cells[i].textContent = row['IN' + (i + 1)];
      }
      for (let j = 0; j < data.outputCount; j++) {
        if (cells[data.inputCount + j]) cells[data.inputCount + j].textContent = row['OUT' + (j + 1)];
      }
    });

    clearGrid();
    clearWires();

    const cells = document.querySelectorAll('#problemGrid .cell');
    data.grid.forEach(state => {
      const cell = cells[state.index];
      cell.className = 'cell';
      if (state.type) cell.dataset.type = state.type;
      if (state.name) cell.dataset.name = state.name;
      if (state.value) cell.dataset.value = state.value;
      state.classes.forEach(c => cell.classList.add(c));
      if (state.type === 'INPUT' || state.type === 'OUTPUT') {
        attachInputClickHandlers(cell);
      }
      if (state.type && state.type !== 'WIRE') {
        cell.classList.add('block');
        if (state.type === 'INPUT') cell.textContent = state.name;
        else if (state.type === 'OUTPUT') cell.textContent = state.name;
        else if (state.type === 'JUNCTION') cell.textContent = 'JUNC';
        else cell.textContent = state.type;
        cell.draggable = true;
      }
    });

    data.wires && data.wires.forEach(w => placeWireAt(w.x, w.y, w.dir));

    if (data.wiresObj) {
      wires = data.wiresObj.map(obj => ({
        start: cells[obj.startIdx],
        end: cells[obj.endIdx],
        path: obj.pathIdxs.map(i => cells[i])
      }));
    }
    problemOutputsValid = true;
  });
}

function renderUserProblemList() {
  userProblemList.innerHTML = '';
  const nickname = localStorage.getItem('username') || '익명';
  db.ref('problems').once('value').then(snapshot => {
    userProblemList.innerHTML = '';
    const table = document.createElement('table');
    table.id = 'userProblemTable';
    table.innerHTML = `<thead><tr><th>${t('thTitle')}</th><th>${t('thGrid')}</th><th>${t('thCreator')}</th><th>${t('thCreatedAt')}</th><th>${t('thSolved')}</th><th>${t('thLikes')}</th><th>${t('thNotes')}</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    if (!snapshot.exists()) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7">${t('noUserProblems')}</td>`;
      tbody.appendChild(tr);
    } else {
      snapshot.forEach(child => {
        const data = child.val();
        const solved = data.ranking
          ? new Set(Object.values(data.ranking).map(r => r.nickname)).size
          : 0;
        const likes = data.likes ? Object.keys(data.likes).length : 0;
        const isMine = data.creator === nickname;
        const solvedByMe = data.ranking && Object.values(data.ranking)
          .some(r => r.nickname === nickname);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="probTitle">${data.title || child.key}</td>
          <td>${(data.gridRows || 6)}×${(data.gridCols || 6)}</td>
          <td>${data.creator || '익명'}${isMine ? ' (나)' : ''}</td>
          <td>${new Date(data.timestamp).toLocaleDateString()}</td>
          <td>${solved}</td>
          <td><span class="likeCount">${likes}</span> <button class="likeBtn" data-key="${child.key}" aria-label="${t('thLikes')}">♥</button></td>
          <td>${isMine ? `<button class="deleteProbBtn" data-key="${child.key}">${t('deleteBtn')}</button>` : ''}</td>`;
        if (solvedByMe) tr.classList.add('solved');
        tr.addEventListener('click', e => {
          if(e.target.classList.contains('likeBtn') || e.target.classList.contains('deleteProbBtn')) return;
          previewUserProblem(child.key);
        });
        tbody.appendChild(tr);
      });
    }
    userProblemList.appendChild(table);
    userProblemList.querySelectorAll('.likeBtn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleLikeProblem(btn.dataset.key);
      });
    });
    userProblemList.querySelectorAll('.deleteProbBtn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const confirmed = confirm(t('confirmDelete'));
        if (confirmed) deleteUserProblem(btn.dataset.key);
      });
    });
  });
}

function toggleLikeProblem(key){
  const nickname = localStorage.getItem('username') || '익명';
  const likeRef = db.ref(`problems/${key}/likes/${nickname}`);
  likeRef.once('value').then(snap => {
    if(snap.exists()) likeRef.remove();
    else likeRef.set(true);
  }).then(renderUserProblemList);
}

function deleteUserProblem(key){
  db.ref('problems/' + key).remove()
    .then(renderUserProblemList)
    .catch(err => alert(t('deleteFailed').replace('{error}', err)));
}

function previewUserProblem(key) {
  db.ref('problems/' + key).once('value').then(snap => {
    const data = snap.val();
    if (!data) return alert(t('loadFailed'));
    showProblemIntro(data, () => startCustomProblem(key, data));
  });
}

function showProblemIntro(problem, callback) {
  const modal = document.getElementById('levelIntroModal');
  const title = document.getElementById('introTitle');
  const desc  = document.getElementById('introDesc');
  const table = document.getElementById('truthTable');

  title.textContent = problem.title || '';
  desc.textContent  = problem.description || '';
  const keys = Object.keys(problem.table[0] || {});
  table.innerHTML = `
    <tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr>
    ${problem.table.map(row => `<tr>${keys.map(k=>`<td>${row[k]}</td>`).join('')}</tr>`).join('')}
  `;
  modal.style.display = 'flex';
  modal.style.backgroundColor = 'white';
  const btn = document.getElementById('startLevelBtn');
  btn.textContent = callback ? '시작하기' : '닫기';
  btn.onclick = () => {
    modal.style.display = 'none';
    if (callback) callback();
  };
}

let currentHintStage = null;
let currentHintProgress = 0; // number of opened hints for current stage
let hintTimerInterval = null; // interval id for hint cooldown timer

function checkHintCooldown(cb) {
  const localUntil = parseInt(localStorage.getItem('hintCooldownUntil') || '0');
  const user = firebase.auth().currentUser;
  if (user) {
    db.ref(`hintLocks/${user.uid}`).once('value').then(snap => {
      cb(Math.max(localUntil, snap.val() || 0));
    });
  } else {
    cb(localUntil);
  }
}

function loadHintProgress(stage, cb) {
  const key = `hintsUsed_${stage}`;
  const local = parseInt(localStorage.getItem(key) || '0');
  const user = firebase.auth().currentUser;
  if (user) {
    db.ref(`hintProgress/${user.uid}/stage${stage}`).once('value').then(snap => {
      const remote = snap.val() || 0;
      const val = Math.max(local, remote);
      if (val !== local) localStorage.setItem(key, val);
      cb(val);
    });
  } else {
    cb(local);
  }
}

function saveHintProgress(stage, count) {
  const key = `hintsUsed_${stage}`;
  localStorage.setItem(key, count);
  const user = firebase.auth().currentUser;
  if (user) {
    db.ref(`hintProgress/${user.uid}/stage${stage}`).set(count);
  }
}

function startHintTimer(until) {
  clearInterval(hintTimerInterval);
  const timerEl = document.getElementById('nextHintTimer');
  function update() {
    const diff = until - Date.now();
    if (diff <= 0) {
      timerEl.textContent = t('hintReady');
    } else {
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      timerEl.textContent = t('hintCountdown').replace('{time}', timeStr);
    }
  }
  update();
  hintTimerInterval = setInterval(update, 1000);
}

function renderHintButtons(hints, progress, cooldownUntil) {
  const container = document.getElementById('hintButtons');
  container.innerHTML = '';
  const now = Date.now();
  const hasAvailable = progress < hints.length && now >= cooldownUntil;
  hints.forEach((hint, i) => {
    const btn = document.createElement('button');
    btn.appendChild(document.createTextNode(`${t('hintLabel')} ${i + 1} (${hint.type})`));
    btn.appendChild(document.createElement('br'));
    const lockIcon = document.createElement('span');
    lockIcon.className = 'lock-icon';
    lockIcon.textContent = i < progress ? '🔓' : '🔒';
    btn.appendChild(lockIcon);
    btn.onclick = () => showHint(i);
    if (i < progress) {
      btn.classList.add('open');
    } else if (i === progress) {
      if (now < cooldownUntil) {
        btn.disabled = true;
      } else {
        btn.classList.add('available');
      }
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
  const adBtn = document.getElementById('adHintBtn');
  if (adBtn) adBtn.style.display = hasAvailable ? 'none' : 'inline-block';
}

function openHintModal(stage) {
  const hints = levelHints[`stage${stage}`]?.hints;
  if (!hints) {
    alert(t('noHints'));
    return;
  }
  currentHintStage = stage;
  document.getElementById('hintModal').style.display = 'flex';
  const adBtn = document.getElementById('adHintBtn');
  if (adBtn) adBtn.onclick = () => alert('준비중인 기능입니다.');
  loadHintProgress(stage, progress => {
    currentHintProgress = progress;
    checkHintCooldown(until => {
      renderHintButtons(hints, progress, until);
      startHintTimer(until);
    });
  });
}

function showHint(index) {
  const hints = levelHints[`stage${currentHintStage}`]?.hints || [];
  if (!hints[index]) return;
  const hint = hints[index];
  document.getElementById('hintMessage').textContent = `[${hint.type}] ${hint.content}`;
  document.getElementById('hintMessageModal').style.display = 'flex';

  if (index >= currentHintProgress) {
    currentHintProgress = index + 1;
    saveHintProgress(currentHintStage, currentHintProgress);
    const until = Date.now() + 60*60*1000;
    localStorage.setItem('hintCooldownUntil', until);
    const user = firebase.auth().currentUser;
    if (user) db.ref(`hintLocks/${user.uid}`).set(until);
  }

  checkHintCooldown(until => {
    renderHintButtons(hints, currentHintProgress, until);
    startHintTimer(until);
  });
}

function setupCustomBlockPanel(problem) {
  const panel = document.getElementById('blockPanel');
  const blocks = [];
  if (!problem.fixIO) {
    for (let i = 1; i <= problem.inputCount; i++) blocks.push({ type: 'INPUT', name: 'IN' + i });
    for (let j = 1; j <= problem.outputCount; j++) blocks.push({ type: 'OUTPUT', name: 'OUT' + j });
  }
  ['AND', 'OR', 'NOT', 'JUNCTION'].forEach(t => blocks.push({ type: t }));
  buildBlockPanel(panel, blocks);
}

function placeFixedIO(problem) {
  if (!problem.fixIO || !problem.grid) return;
  const cells = document.querySelectorAll('#grid .cell');
  problem.grid.forEach(state => {
    if (state.type === 'INPUT' || state.type === 'OUTPUT') {
      const cell = cells[state.index];
      cell.className = 'cell block';
      cell.dataset.type = state.type;
      cell.dataset.name = state.name;
      if (state.type === 'INPUT') {
        cell.dataset.value = state.value || '0';
        cell.textContent = state.name;
        attachInputClickHandlers(cell);
        cell.classList.toggle('active', cell.dataset.value === '1');
      } else {
        cell.textContent = state.name;
      }
      cell.draggable = false;
      cell.dataset.fixed = '1';
    }
  });
}

function startCustomProblem(key, problem) {
  wireTrace = [];
  wires = [];
  currentCustomProblem = problem;
  currentCustomProblemKey = key;
  currentLevel = null;
  const rows = problem.gridRows || 6;
  const cols = problem.gridCols || 6;
  setupGrid('grid', rows, cols);
  clearGrid();
  setupCustomBlockPanel(problem);
  placeFixedIO(problem);
  setGridDimensions(rows, cols);
  const prevMenuBtn = document.getElementById('prevStageBtnMenu');
  const nextMenuBtn = document.getElementById('nextStageBtnMenu');
  prevMenuBtn.disabled = true;
  nextMenuBtn.disabled = true;
  document.getElementById('gameTitle').textContent = problem.title || '사용자 문제';
  userProblemsScreen.style.display = 'none';
  document.getElementById('gameScreen').style.display = 'flex';
  const rp = document.getElementById('rightPanel');
  if (rp) rp.style.display = 'block';
  document.body.classList.add('game-active');
  collapseMenuBarForMobile();
}

async function gradeProblemAnimated(key, problem) {
  const inNames = Array.from({length:problem.inputCount},(_,i)=>'IN'+(i+1));
  const outNames = Array.from({length:problem.outputCount},(_,i)=>'OUT'+(i+1));
  const testCases = problem.table.map(row=>({
    inputs: Object.fromEntries(inNames.map(n=>[n,row[n]])),
    expected: Object.fromEntries(outNames.map(n=>[n,row[n]]))
  }));

  const allBlocks = Array.from(grid.querySelectorAll('.cell.block'));
  let junctionError = false;
  allBlocks.filter(b=>b.dataset.type==='JUNCTION').forEach(junction=>{
    const inputs = getIncomingBlocks(junction);
    if (inputs.length>1){ junction.classList.add('error'); junctionError=true; }
    else junction.classList.remove('error');
  });
  if (junctionError){
    alert('❌ JUNCTION 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.');
    if(overlay) overlay.style.display='none';
    isScoring=false; return; }
  let outputError=false;
  Array.from(grid.querySelectorAll('.cell.block[data-type="OUTPUT"]'))
    .forEach(output=>{
      const inputs=getIncomingBlocks(output);
      if(inputs.length>1){output.classList.add('error');outputError=true;}else{output.classList.remove('error');}
    });
  if(outputError){
    alert('❌ OUTPUT 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.');
    if(overlay) overlay.style.display='none';
    isScoring=false;return;
  }

  const requiredOutputs = outNames;
  const actualOutputCells = Array.from(grid.querySelectorAll('.cell.block[data-type="OUTPUT"]'));
  const actualOutputNames = actualOutputCells.map(c=>c.dataset.name);
  const missingOutputs = requiredOutputs.filter(n=>!actualOutputNames.includes(n));
  if(missingOutputs.length>0){
    alert(t('outputMissingAlert').replace('{list}', missingOutputs.join(', ')));
    if(overlay) overlay.style.display='none';
    isScoring=false;return;
  }

  let allCorrect=true;
  document.getElementById('blockPanel').style.display='none';
  document.getElementById('rightPanel').style.display='none';
  document.getElementById('gradingArea').style.display='block';
  const gradingArea=document.getElementById('gradingArea');
  gradingArea.innerHTML='<b>채점 결과:</b><br><br>';

  const inputs=grid.querySelectorAll('.cell.block[data-type="INPUT"]');
  const outputs=grid.querySelectorAll('.cell.block[data-type="OUTPUT"]');

  for(const test of testCases){
    inputs.forEach(input=>{
      const name=input.dataset.name;
      const value=test.inputs[name]??0;
      input.dataset.value=String(value);
      input.classList.toggle('active',value===1);
    });
    evaluateCircuit();
    await new Promise(r=>setTimeout(r,100));

    let correct=true;
    const actualText=Array.from(outputs).map(out=>{
      const name=out.dataset.name;
      const actual=+JSON.parse(out.dataset.val);
      const expected=test.expected[name];
      if(actual!==expected) correct=false;
      return `${name}=${actual}`;
    }).join(', ');
    const expectedText=Object.entries(test.expected).map(([k,v])=>`${k}=${v}`).join(', ');
    const inputText=Object.entries(test.inputs).map(([k,v])=>`${k}=${v}`).join(', ');
    if(!correct) allCorrect=false;
    if(!document.getElementById('gradingTable')){
      gradingArea.innerHTML+=`
      <table id="gradingTable">
        <thead>
          <tr><th>${t('thInput')}</th><th>${t('thExpected')}</th><th>${t('thActual')}</th><th>${t('thResult')}</th></tr>
        </thead>
        <tbody></tbody>
      </table>`;
    }
      const tbody=document.querySelector('#gradingTable tbody');
      const tr=document.createElement('tr');
      tr.className=correct?'correct':'wrong';

      const tdInput=document.createElement('td');
      tdInput.textContent=inputText;

      const tdExpected=document.createElement('td');
      tdExpected.textContent=expectedText;

      const tdActual=document.createElement('td');
      tdActual.textContent=actualText;

      const tdResult=document.createElement('td');
      tdResult.style.fontWeight='bold';
      tdResult.style.color=correct?'green':'red';
      tdResult.textContent=correct?'✅ 정답':'❌ 오답';

      tr.append(tdInput,tdExpected,tdActual,tdResult);
      tbody.appendChild(tr);
  }

  const summary=document.createElement('div');
  summary.id='gradeResultSummary';
  summary.textContent=allCorrect?'🎉 모든 테스트를 통과했습니다!':'😢 일부 테스트에 실패했습니다.';
  gradingArea.appendChild(summary);

  const returnBtn=document.createElement('button');
  returnBtn.id='returnToEditBtn';
  returnBtn.textContent=t('returnToEditBtn');
  gradingArea.appendChild(returnBtn);
  document.getElementById('returnToEditBtn').addEventListener('click',returnToEditScreen);

  if(allCorrect && key){
    const autoSave = localStorage.getItem('autoSaveCircuit') !== 'false';
    let saveSuccess=false;
    if (autoSave) {
      try {
        if (gifLoadingModal) {
          if (gifLoadingText) gifLoadingText.textContent = t('savingCircuit');
          gifLoadingModal.style.display = 'flex';
        }
        await saveCircuit();
        saveSuccess=true;
      } catch (e) {
        alert(t('saveFailed').replace('{error}', e));
      } finally {
        if (gifLoadingModal) {
          gifLoadingModal.style.display = 'none';
          if (gifLoadingText) gifLoadingText.textContent = t('gifLoadingText');
        }
      }
    }
    if(saveSuccess) showCircuitSavedModal();

    const blocks=Array.from(grid.querySelectorAll('.cell.block'));
    const blockCounts=blocks.reduce((acc,c)=>{
      const t=c.dataset.type; acc[t]=(acc[t]||0)+1; return acc;
    },{});
    const usedWires=grid.querySelectorAll('.cell.wire').length;
    const hintsUsed=parseInt(localStorage.getItem(`hintsUsed_${key}`)||'0');
    saveProblemRanking(key, blockCounts, usedWires, hintsUsed);
  }
}

// ----- GIF 캡처 기능 -----

function getCircuitSnapshot() {
  const blocks = Array.from(grid.querySelectorAll('.cell.block'));
  const values = new Map();
  blocks
    .filter(b => b.dataset.type === 'INPUT')
    .forEach(b => values.set(b, b.dataset.value === '1'));

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of blocks) {
      const oldVal = values.get(node);
      const newVal = computeBlock(node, values);
      if (newVal !== undefined && newVal !== oldVal) {
        values.set(node, newVal);
        changed = true;
      }
    }
  }

  const blockSnap = blocks.map(b => ({
    row: b.row,
    col: b.col,
    type: b.dataset.type,
    name: b.dataset.name || b.dataset.type,
    active: values.get(b) || false
  }));

  const wireSnap = wires.map(w => ({
    path: w.path.map(c => ({ row: c.row, col: c.col })),
    active: values.get(w.start) || false
  }));

  const rows = Math.max(1, Math.floor(Number(GRID_ROWS)));
  const cols = Math.max(1, Math.floor(Number(GRID_COLS)));

  return { blocks: blockSnap, wires: wireSnap, rows, cols, totalFrames: 16 };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCaptureFrame(ctx, state, frame) {
  const cellSize = 50 * GIF_SCALE;
  const gap = 2 * GIF_SCALE;
  const border = 2 * GIF_SCALE;
  const rows = state.rows;
  const cols = state.cols;
  const radius = 4 * GIF_SCALE;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const wireCells = new Set();
  state.wires.forEach(w => w.path.forEach(p => wireCells.add(`${p.row},${p.col}`)));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = border + c * (cellSize + gap);
      const y = border + r * (cellSize + gap);
      ctx.fillStyle = wireCells.has(`${r},${c}`) ? '#ffe' : '#fff';
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1 * GIF_SCALE;
      drawRoundedRect(ctx, x, y, cellSize, cellSize, radius);
      ctx.fill();
      ctx.stroke();
    }
  }

  state.wires.forEach(w => {
    const pts = w.path.map(p => ({
      x: border + p.col * (cellSize + gap) + cellSize / 2,
      y: border + p.row * (cellSize + gap) + cellSize / 2
    }));

    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2 * GIF_SCALE;
    ctx.setLineDash([16 * GIF_SCALE, 16 * GIF_SCALE]);
    ctx.lineDashOffset = -(frame * 2 * GIF_SCALE);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  });

  state.blocks.forEach(b => {
    const x = border + b.col * (cellSize + gap);
    const y = border + b.row * (cellSize + gap);
    ctx.fillStyle = '#e0e0ff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 * GIF_SCALE;
    drawRoundedRect(ctx, x, y, cellSize, cellSize, radius);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold ' + (cellSize / 3) + 'px "Noto Sans KR"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = b.type === 'JUNCTION' ? 'JUNC' : (b.name || b.type || '');
    ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
  });

  ctx.lineWidth = border;
  ctx.strokeStyle = '#666';
  ctx.strokeRect(border / 2, border / 2, ctx.canvas.width - border, ctx.canvas.height - border);
}

function captureGIF(state, onFinish) {
  const cellSize = 50 * GIF_SCALE;
  const gap = 2 * GIF_SCALE;
  const border = 2 * GIF_SCALE;
  const cols = Math.max(1, Math.floor(Number(state.cols)));
  const rows = Math.max(1, Math.floor(Number(state.rows)));
  captureCanvas.width = border * 2 + cols * cellSize + (cols - 1) * gap;
  captureCanvas.height = border * 2 + rows * cellSize + (rows - 1) * gap;
  const ctx = captureCanvas.getContext('2d');
  const width = captureCanvas.width;
  const height = captureCanvas.height;
  const gif = new GIF({ workers: 2, quality: 10 });

  for (let f = 0; f < state.totalFrames; f++) {
    drawCaptureFrame(ctx, state, f);
    const frame = ctx.getImageData(0, 0, width, height);
    gif.addFrame(frame, { delay: 50 });
  }

  gif.on('finished', blob => {
    resetCaptureCanvas();
    if (typeof onFinish === 'function') onFinish(blob);
  });

  gif.render();
}

function handleGIFExport() {
  resetCaptureCanvas();
  const state = getCircuitSnapshot();
  if (gifLoadingText) gifLoadingText.textContent = t('gifLoadingText');
  if (gifLoadingModal) gifLoadingModal.style.display = 'flex';
  captureGIF(state, blob => {
    if (gifLoadingModal) gifLoadingModal.style.display = 'none';
    currentGifBlob = blob;
    if (currentGifUrl) URL.revokeObjectURL(currentGifUrl);
    currentGifUrl = URL.createObjectURL(blob);
    if (gifPreview) gifPreview.src = currentGifUrl;
    if (gifModal) gifModal.style.display = 'flex';
  });
}

const exportBtn = document.getElementById('exportGifBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', handleGIFExport);
}

// --- 모바일 세로 모드 안내 모달 ---
const orientationModal = document.getElementById('orientationModal');
const rotateLandscapeBtn = document.getElementById('rotateLandscapeBtn');
const closeOrientationBtn = document.getElementById('closeOrientationBtn');

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function checkOrientation() {
  if (!orientationModal) return;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  if (isMobileDevice() && isPortrait) {
    orientationModal.style.display = 'flex';
  } else {
    orientationModal.style.display = 'none';
  }
}

if (rotateLandscapeBtn) {
  rotateLandscapeBtn.addEventListener('click', () => {
    lockOrientationLandscape();
    if (orientationModal) orientationModal.style.display = 'none';
  });
}

if (closeOrientationBtn) {
  closeOrientationBtn.addEventListener('click', () => {
    if (orientationModal) orientationModal.style.display = 'none';
  });
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('resize', () => {
  adjustGridZoom();
  adjustGridZoom('problemGridContainer');
});
const mqOrientation = window.matchMedia('(orientation: portrait)');
if (mqOrientation.addEventListener) {
  mqOrientation.addEventListener('change', checkOrientation);
} else if (mqOrientation.addListener) {
  mqOrientation.addListener(checkOrientation);
}
checkOrientation();
adjustGridZoom();
adjustGridZoom('problemGridContainer');
