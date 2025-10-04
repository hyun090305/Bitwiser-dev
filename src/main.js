// Entry point module coordinating Bitwiser features.
// Placeholder imports ensure upcoming modules can hook into the bootstrap flow.
import { initializeAuth } from './modules/auth.js';
import {
  getUsername,
  setUsername,
  getHintProgress,
  getAutoSaveSetting,
  setAutoSaveSetting,
  getGoogleDisplayName,
  setGoogleDisplayName,
  setGoogleEmail,
  getGoogleNickname,
  setGoogleNickname
} from './modules/storage.js';
import * as guestbookModule from './modules/guestbook.js';
import {
  adjustGridZoom,
  setupGrid,
  setGridDimensions,
  clearGrid,
  markCircuitModified,
  moveCircuit,
  setupMenuToggle,
  collapseMenuBarForMobile,
  onCircuitModified,
  getActiveCircuit,
  getActiveController,
  getPlayCircuit,
  getPlayController,
  getProblemCircuit,
  getProblemController,
  destroyProblemContext
} from './modules/grid.js';
import * as levelsModule from './modules/levels.js';
import * as uiModule from './modules/ui.js';
import { openHintModal, initializeHintUI } from './modules/hints.js';
import { initializeTutorials } from './modules/tutorials.js';
import {
  initializeCircuitShare,
  updateSaveProgress,
  handleGifModalClose,
  handleGifSaveClick,
  handleGifCopyClick,
  handleGifShareClick,
  handleGIFExport,
  handleSaveCircuitClick,
  saveCircuit,
  openSavedModal,
  closeSavedModal,
  loadGifFromDB
} from './modules/circuitShare.js';
import {
  setupNavigation,
  lockOrientationLandscape,
  isMobileDevice
} from './modules/navigation.js';
import {
  initializeProblemEditorUI,
  saveProblem,
  renderUserProblemList,
  showProblemIntro,
  setCustomProblemStartHandler,
  invalidateProblemOutputs,
  markProblemOutputsValid
} from './modules/problemEditor.js';
import {
  fetchProgressSummary,
  fetchOverallStats,
  showOverallRanking,
  saveRanking,
  saveProblemRanking,
  showProblemRanking
} from './modules/rank.js';

// Temporarily reference placeholder modules to avoid unused-import warnings during the migration.
void guestbookModule;
void uiModule;

const {
  configureLevelModule,
  loadStageData,
  getStageDataPromise,
  renderChapterList,
  selectChapter,
  startLevel,
  returnToEditScreen,
  returnToLevels,
  refreshUserData,
  loadClearedLevelsFromDb,
  markLevelCleared,
  fetchClearedLevels,
  isLevelUnlocked,
  showIntroModal,
  getLevelTitles,
  getLevelBlockSet,
  getLevelAnswer,
  getLevelHints,
  getChapterData,
  getCurrentLevel,
  clearCurrentLevel,
  getClearedLevels,
  buildPaletteGroups
} = levelsModule;

initializeAuth();

let currentCustomProblem = null;
let currentCustomProblemKey = null;
let problemScreenPrev = null;  // 문제 출제 화면 진입 이전 화면 기록
let loginFromMainScreen = false;  // 메인 화면에서 로그인 여부 추적

onCircuitModified(() => {
  invalidateProblemOutputs();
});

let lastSavedKey = null;
let pendingClearedLevel = null;

// Preload heavy canvas modules so they are ready when a stage begins.
// This reduces the delay caused by dynamic imports later in the game.
['./canvas/model.js',
 './canvas/controller.js',
 './canvas/engine.js',
 './canvas/renderer.js'].forEach(p => import(p));

const circuitErrorMsg = document.getElementById('circuitError');
let circuitHasError = false;
function showCircuitError(show) {
  circuitHasError = show;
  if (circuitErrorMsg) {
    circuitErrorMsg.style.display = show ? 'block' : 'none';
  }
}

// GIF 생성 관련 요소들
const gifModal = document.getElementById('gifModal');
const closeGifModalBtn = document.getElementById('closeGifModal');
const gifPreview = document.getElementById('gifPreview');
const saveGifBtn = document.getElementById('saveGifBtn');
const copyGifBtn = document.getElementById('copyGifBtn');
const shareGifBtn = document.getElementById('shareGifBtn');
const gifLoadingModal = document.getElementById('gifLoadingModal');
const gifLoadingText = document.getElementById('gifLoadingText');
const saveProgressContainer = document.getElementById('saveProgressContainer');
const saveProgressBar = document.getElementById('saveProgressBar');

initializeCircuitShare({
  elements: {
    gifModal,
    gifPreview,
    gifLoadingModal,
    gifLoadingText,
    saveProgressContainer,
    saveProgressBar,
    savedModal: document.getElementById('savedModal'),
    savedList: document.getElementById('savedList')
  },
  translate: typeof t === 'function' ? t : key => key,
  alert,
  confirm,
  getCurrentCustomProblem: () => currentCustomProblem,
  getCurrentCustomProblemKey: () => currentCustomProblemKey,
  onLastSavedKeyChange: key => { lastSavedKey = key; }
});

if (closeGifModalBtn) {
  closeGifModalBtn.addEventListener('click', handleGifModalClose);
}
if (saveGifBtn) {
  saveGifBtn.addEventListener('click', handleGifSaveClick);
}
if (copyGifBtn) {
  copyGifBtn.addEventListener('click', handleGifCopyClick);
}
if (shareGifBtn) {
  shareGifBtn.addEventListener('click', handleGifShareClick);
}

// 초기 로딩 관련
const initialTasks = [];
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.style.display = 'none';
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

const APPLE_PLATFORM_REGEX = /Mac|iP(hone|ad|od)/i;
const platformSource =
  typeof navigator !== 'undefined'
    ? navigator.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      ''
    : '';
const isApplePlatform = APPLE_PLATFORM_REGEX.test(platformSource);

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
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const active = !btn.classList.contains('active');
        bindings
          .filter(([, k]) => k === key)
          .forEach(([b]) => b.classList.toggle('active', active));
        simulateKey(key, active ? 'keydown' : 'keyup');
      });
    }
  });

  function isControlKeyEvent(e) {
    if (e.key === 'Control') return true;
    return isApplePlatform && e.key === 'Meta';
  }

  function matchesBinding(e, key) {
    if (key === 'Control') return isControlKeyEvent(e);
    if (key.toLowerCase() === 'r') return e.key.toLowerCase() === 'r';
    return e.key === key;
  }

  document.addEventListener('keydown', e => {
    if (isTextInputFocused() && e.key.toLowerCase() === 'r') {
      bindings.forEach(([btn, key]) => {
        if (key.toLowerCase() === 'r') btn.classList.remove('active');
      });
      return;
    }
    bindings.forEach(([btn, key]) => {
      if (matchesBinding(e, key)) {
        btn.classList.add('active');
        if (key.toLowerCase() === 'r') {
          setTimeout(() => btn.classList.remove('active'), 150);
        }
      }
    });
  });

  document.addEventListener('keyup', e => {
    bindings.forEach(([btn, key]) => {
      if (matchesBinding(e, key) && key.toLowerCase() !== 'r') {
        btn.classList.remove('active');
      }
    });
  });
}

// (2) 페이지 로드 시 INPUT 블록 클릭으로 0↔1 토글 준비






const chapterStageScreen = document.getElementById("chapterStageScreen");
const gameScreen = document.getElementById("gameScreen");
const firstScreen = document.getElementById('firstScreen');
const chapterListEl = document.getElementById("chapterList");

document.getElementById("toggleChapterList").onclick = () => {
  chapterListEl.classList.toggle('hidden');
};

document.getElementById("backToLevelsBtn").onclick = async () => {
  await returnToLevels({
    isCustomProblemActive: Boolean(currentCustomProblem),
    onClearCustomProblem: () => {
      currentCustomProblem = null;
    }
  });
};





window.addEventListener("DOMContentLoaded", () => {
  const stagePromise = loadStageData(typeof currentLang !== 'undefined' ? currentLang : undefined).then(() => {
    const prevMenuBtn = document.getElementById('prevStageBtnMenu');
    const nextMenuBtn = document.getElementById('nextStageBtnMenu');

    prevMenuBtn.addEventListener('click', () => {
      returnToEditScreen();           // 채점 모드 닫기
      startLevel(getCurrentLevel() - 1);
    });

    nextMenuBtn.addEventListener('click', () => {
      returnToEditScreen();
      startLevel(getCurrentLevel() + 1);
    });
    return loadClearedLevelsFromDb();
  });
  initialTasks.push(stagePromise);
});

window.addEventListener('focus', refreshUserData);


// 피드백 전송
// 1) 방명록 등록 함수
function submitGuestEntry() {
  // 이전: 입력창 value 또는 익명 사용
  // const name = document.getElementById("guestName").value.trim() || "익명";

  // 수정: 로그인(모달)된 username을 사용
  const name = getUsername() || "익명";

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
document.getElementById("showIntroBtn").addEventListener("click", () => {
  const level = getCurrentLevel();
  if (level != null) {
    showIntroModal(level);
  } else if (currentCustomProblem) {
    showProblemIntro(currentCustomProblem);
  }
});

document.getElementById("gameTitle").addEventListener("click", () => {
  const level = getCurrentLevel();
  if (level != null) {
    showIntroModal(level);
  } else if (currentCustomProblem) {
    showProblemIntro(currentCustomProblem);
  }
});

document.getElementById('hintBtn').addEventListener('click', () => {
  const level = getCurrentLevel();
  if (level == null) {
    if (currentCustomProblem) {
      alert(t('noHints'));
    } else {
      alert(t('startStageFirst'));
    }
    return;
  }
  openHintModal(level);
});



const { maybeStartTutorial = () => {} } = (initializeTutorials({
  lang: typeof currentLang !== 'undefined' ? currentLang : 'en',
  translate: typeof t === 'function' ? t : undefined,
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  configureLevelModule,
  lockOrientationLandscape,
  getStageDataPromise,
  startLevel,
  getLevelTitles,
  getClearedLevels,
  elements: {
    tutorialModal: document.getElementById('tutorialModal'),
    tutorialTitle: document.getElementById('tutTitle'),
    tutorialDescription: document.getElementById('tutDesc'),
    tutorialPrevButton: document.getElementById('tutPrevBtn'),
    tutorialNextButton: document.getElementById('tutNextBtn'),
    tutorialCloseButton: document.getElementById('tutCloseBtn'),
    tutorialFinishButton: document.getElementById('tutFinishBtn'),
    tutorialButton: document.getElementById('tutorialBtn'),
    tutorialImage: document.getElementById('tutImg'),
    stageModal: document.getElementById('stageTutorialModal'),
    stageImage: document.getElementById('stageTutImg'),
    stageDescription: document.getElementById('stageTutDesc'),
    stageButton: document.getElementById('stageTutBtn'),
    screens: {
      gameScreen,
      firstScreen,
      chapterStageScreen
    }
  }
}) ?? {});


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
  moveCircuit(dx, dy, { isProblemFixed: currentCustomProblem?.fixIO });
});

const moveWithConstraints = (dx, dy) =>
  moveCircuit(dx, dy, { isProblemFixed: currentCustomProblem?.fixIO });

if (moveUpBtn)    moveUpBtn.addEventListener('click', () => moveWithConstraints(0, -1));
if (moveDownBtn)  moveDownBtn.addEventListener('click', () => moveWithConstraints(0, 1));
if (moveLeftBtn)  moveLeftBtn.addEventListener('click', () => moveWithConstraints(-1, 0));
if (moveRightBtn) moveRightBtn.addEventListener('click', () => moveWithConstraints(1, 0));
if (problemMoveUpBtn)
  problemMoveUpBtn.addEventListener('click', () => moveWithConstraints(0, -1));
if (problemMoveDownBtn)
  problemMoveDownBtn.addEventListener('click', () => moveWithConstraints(0, 1));
if (problemMoveLeftBtn)
  problemMoveLeftBtn.addEventListener('click', () => moveWithConstraints(-1, 0));
if (problemMoveRightBtn)
  problemMoveRightBtn.addEventListener('click', () => moveWithConstraints(1, 0));





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
  const cleared = new Set(getClearedLevels());
  const titles = getLevelTitles();
  const totalStages = Object.keys(titles).length;  // 총 스테이지 수 (필요 시 갱신)



  for (let i = 1; i <= totalStages; i++) {
    const title = titles[i] || '';
    const mark = cleared.has(i) ? "✅" : "❌";
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
const circuitSavedText = document.getElementById('circuitSaved');
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
window.isScoring = false;

configureLevelModule({
  setIsScoring: value => {
    isScoring = value;
    window.isScoring = value;
  }
});

document.getElementById("gradeButton").addEventListener("click", () => {
  if (circuitHasError) {
    alert("회로에 오류가 존재합니다");
    return;
  }
  if (isScoring) return;
  if (currentCustomProblem == null && getCurrentLevel() == null) return;
  isScoring = true;
  window.isScoring = true;
  if (overlay) overlay.style.display = "block";
  if (currentCustomProblem) {
    gradeProblemCanvas(currentCustomProblemKey, currentCustomProblem);
  } else {
    gradeLevelCanvas(getCurrentLevel());
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
      setUsername(name);
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
        setUsername(name);
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
  const suggested = oldName || getGoogleDisplayName(uid) || "";
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
        setUsername(name);
        setGoogleNickname(uid, name);
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


function showRanking(levelId) {
  const listEl = document.getElementById("rankingList");
  listEl.innerHTML = "로딩 중…";

  // ① 이 스테이지에서 허용된 블록 타입 목록
  const blockSet = getLevelBlockSet(levelId);
  const allowedTypes = Array.from(new Set(blockSet.map(b => b.type)));

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
    const level = getCurrentLevel();
    if (level != null) {
      showRanking(level);
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
      const nickname = getUsername() || '';
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
        if (!getUsername()) {
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

configureLevelModule({
  onLevelIntroComplete: () =>
    collapseMenuBarForMobile({ onAfterCollapse: updatePadding })
});
function setupSettings() {
  const btn = document.getElementById('settingsBtn');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const checkbox = document.getElementById('autoSaveCheckbox');
  if (!btn || !modal || !closeBtn || !checkbox) return;

  const enabled = getAutoSaveSetting();
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    setAutoSaveSetting(checkbox.checked);
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
  const uname = getUsername();
  if (uname) document.getElementById("guestUsername").textContent = uname;

  initialTasks.push(showOverallRanking());  // 전체 랭킹 표시
  initialTasks.push(setupGoogleAuth());

  setupKeyToggles();
  setupMenuToggle();
  setupSettings();
  setupGameAreaPadding();
  Promise.all(initialTasks).then(() => {
    setupNavigation({
      refreshUserData,
      renderChapterList,
      selectChapter: index => {
        const chapters = getChapterData();
        if (chapters.length > index) {
          selectChapter(index);
        }
      }
    });
    hideLoadingScreen();
  });
});

function handleGoogleLogin(user) {
  const uid = user.uid;
  // 구글 계정의 기본 정보를 로컬에 저장해 둔다
  if (user.displayName) {
    setGoogleDisplayName(uid, user.displayName);
  }
  if (user.email) {
    setGoogleEmail(uid, user.email);
  }
  const oldName = getUsername();
  db.ref(`google/${uid}`).once('value').then(snap => {
    const dbName = snap.exists() ? snap.val().nickname : null;
    const localGoogleName = getGoogleNickname(uid);
    if (dbName) {
      // 항상 DB의 최신 닉네임을 사용한다
      setGoogleNickname(uid, dbName);
      applyGoogleNickname(dbName, oldName);
    } else if (localGoogleName) {
      // DB에 없으면 로컬에 저장된 이름을 등록한다
      db.ref(`google/${uid}`).set({ uid, nickname: localGoogleName });
      applyGoogleNickname(localGoogleName, oldName);
    } else if (oldName && !loginFromMainScreen) {
      // 기존 게스트 닉네임을 구글 계정에 연결하고 병합 여부를 묻는다
      setGoogleNickname(uid, oldName);
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
    setUsername(name);
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
      setUsername(targetName);
      setGoogleNickname(uid, targetName);
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
const closeSavedModalBtn = document.getElementById('closeSavedModal');

if (saveCircuitBtn) {
  saveCircuitBtn.addEventListener('click', handleSaveCircuitClick);
}

if (viewSavedBtn) {
  viewSavedBtn.addEventListener('click', openSavedModal);
}
if (closeSavedModalBtn) {
  closeSavedModalBtn.addEventListener('click', closeSavedModal);
}

configureLevelModule({ showOverallRanking });

async function showClearedModal(level) {
  await loadClearedLevelsFromDb();
  const modal = document.getElementById('clearedModal');
  document.getElementById('clearedStageNumber').textContent = level;
  const container = document.getElementById('clearedRanking');

  // 1) 현재 플레이어 닉네임 가져오기 (닉네임 설정 모달에서 localStorage에 저장했다고 가정)
  const currentNickname = getUsername() || localStorage.getItem('nickname') || '';

  const prevBtn = document.getElementById('prevStageBtn');
  const nextBtn = document.getElementById('nextStageBtn');

  const titles = getLevelTitles();
  prevBtn.disabled = !(titles[level - 1] && isLevelUnlocked(level - 1));
  nextBtn.disabled = !(titles[level + 1] && isLevelUnlocked(level + 1));

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


function getCurrentController() {
  const problemScreen = document.getElementById("problem-screen");
  if (problemScreen && problemScreen.style.display !== "none") {
    return getProblemController();
  }
  return getPlayController();
}
const createProblemBtn         = document.getElementById('createProblemBtn');
const problemScreen            = document.getElementById('problem-screen');
const backToMainFromProblem    = document.getElementById('backToMainFromProblem');
const saveProblemBtn           = document.getElementById('saveProblemBtn');
const closeProblemListModal    = document.getElementById('closeProblemListModal');
const userProblemsScreen       = document.getElementById('user-problems-screen');
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
    initializeProblemEditorUI(createPaletteForProblem);
  });
}

//— ⑤ 문제 출제 화면 → 메인
backToMainFromProblem.addEventListener('click', () => {
  destroyProblemContext();
  problemScreen.style.display = 'none';
  if (problemScreenPrev === 'userProblems') {
    userProblemsScreen.style.display = 'block';
  } else if (problemScreenPrev === 'main') {
    firstScreen.style.display = '';
  } else {
    chapterStageScreen.style.display = 'block';
  }
  refreshUserData();
  problemScreenPrev = null;
});

if (backToChapterFromUserProblems) {
  backToChapterFromUserProblems.addEventListener('click', () => {
    userProblemsScreen.style.display = 'none';
    chapterStageScreen.style.display = 'block';
    refreshUserData();
  });
}

if (openProblemCreatorBtn) {
  openProblemCreatorBtn.addEventListener('click', () => {
    userProblemsScreen.style.display = 'none';
    problemScreen.style.display = 'flex';
    problemScreenPrev = 'userProblems';
    initializeProblemEditorUI(createPaletteForProblem);
  });
}

document.getElementById('updateIOBtn').addEventListener('click', () => {
  alert('입출력/그리드 설정을 변경하면 회로가 초기화됩니다.');
  initializeProblemEditorUI(createPaletteForProblem);
});
// 자동 생성 방식으로 테스트케이스를 채우므로 행 추가 버튼 비활성화
const addRowBtn = document.getElementById('addTestcaseRowBtn');
if (addRowBtn) addRowBtn.style.display = 'none';
const computeOutputsBtn = document.getElementById('computeOutputsBtn');
if (computeOutputsBtn)
  computeOutputsBtn.addEventListener('click', computeProblemOutputs);
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
if (problemModalBackdrop) {
  problemModalBackdrop.addEventListener('click', () => {
    problemSaveModal.style.display = 'none';
  });
}
if (closeProblemListModal) {
  closeProblemListModal.addEventListener('click', () => {
    document.getElementById('problemListModal').style.display = 'none';
  });
}

configureLevelModule({ renderUserProblemList });

initializeHintUI();

function placeFixedIO(problem) {
  getPlayController()?.placeFixedIO?.(problem);
}

async function startCustomProblem(key, problem) {
  currentCustomProblem = problem;
  currentCustomProblemKey = key;
  clearCurrentLevel();
  const rows = problem.gridRows || 6;
  const cols = problem.gridCols || 6;
  await setupGrid('canvasContainer', rows, cols, createPaletteForCustom(problem));
  clearGrid();
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
  collapseMenuBarForMobile({ onAfterCollapse: updatePadding });
}

setCustomProblemStartHandler(startCustomProblem);


function getCircuitStats(circuit) {
  const blockCounts = Object.values(circuit.blocks).reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {});
  const wireCells = new Set();
  Object.values(circuit.wires).forEach(w => {
    w.path.slice(1, -1).forEach(p => wireCells.add(`${p.r},${p.c}`));
  });
  return { blockCounts, usedWires: wireCells.size };
}

async function gradeLevelCanvas(level) {
  const testCases = getLevelAnswer(level);
  const circuit = getPlayCircuit();
  if (!testCases || !circuit) return;
  const { evaluateCircuit } = await import('./canvas/engine.js');

  const blocks = Object.values(circuit.blocks);
  for (const b of blocks) {
    if (b.type === 'JUNCTION' || b.type === 'OUTPUT') {
      const incoming = Object.values(circuit.wires).filter(w => w.endBlockId === b.id);
      if (incoming.length > 1) {
        alert(`❌ ${b.type} 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.`);
        if (overlay) overlay.style.display = 'none';
        isScoring = false;
        window.isScoring = false;
        return;
      }
    }
  }

  const requiredOutputs = (getLevelBlockSet(level) || [])
    .filter(b => b.type === 'OUTPUT')
    .map(b => b.name);
  const actualOutputNames = blocks.filter(b => b.type === 'OUTPUT').map(b => b.name);
  const missingOutputs = requiredOutputs.filter(n => !actualOutputNames.includes(n));
  if (missingOutputs.length > 0) {
    alert(t('outputMissingAlert').replace('{list}', missingOutputs.join(', ')));
    if (overlay) overlay.style.display = 'none';
    isScoring = false;
    window.isScoring = false;
    return;
  }

  let allCorrect = true;
  const bp = document.getElementById('blockPanel');
  if (bp) bp.style.display = 'none';
  const rp = document.getElementById('rightPanel');
  if (rp) rp.style.display = 'none';
  const gradingArea = document.getElementById('gradingArea');
  if (gradingArea) {
    gradingArea.style.display = 'block';
    gradingArea.innerHTML = '<b>채점 결과:</b><br><br>';
  }

  const inputs = blocks.filter(b => b.type === 'INPUT');
  const outputs = blocks.filter(b => b.type === 'OUTPUT');

  for (const test of testCases) {
    inputs.forEach(inp => { inp.value = test.inputs[inp.name] ?? 0; });
    evaluateCircuit(circuit);
    await new Promise(r => setTimeout(r, 100));

    let correct = true;
    const actualText = outputs.map(out => {
      const actual = out.value ? 1 : 0;
      const expected = test.expected[out.name];
      if (actual !== expected) correct = false;
      return `${out.name}=${actual}`;
    }).join(', ');

    const expectedText = Object.entries(test.expected).map(([k, v]) => `${k}=${v}`).join(', ');
    const inputText = Object.entries(test.inputs).map(([k, v]) => `${k}=${v}`).join(', ');

    if (!document.getElementById('gradingTable')) {
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
      </table>`;
    }
    const tbody = document.querySelector('#gradingTable tbody');
    const tr = document.createElement('tr');
    tr.className = correct ? 'correct' : 'wrong';

    const tdInput = document.createElement('td');
    tdInput.textContent = inputText;
    const tdExpected = document.createElement('td');
    tdExpected.textContent = expectedText;
    const tdActual = document.createElement('td');
    tdActual.textContent = actualText;
    const tdResult = document.createElement('td');
    tdResult.style.fontWeight = 'bold';
    tdResult.style.color = correct ? 'green' : 'red';
    tdResult.textContent = correct ? '✅ 정답' : '❌ 오답';

    tr.append(tdInput, tdExpected, tdActual, tdResult);
    tbody.appendChild(tr);
    if (!correct) allCorrect = false;
  }

  const summary = document.createElement('div');
  summary.id = 'gradeResultSummary';
  summary.textContent = allCorrect ? '🎉 모든 테스트를 통과했습니다!' : '😢 일부 테스트에 실패했습니다.';
  gradingArea.appendChild(summary);

  if (allCorrect) {
    const autoSave = getAutoSaveSetting();
    let saveSuccess = false;
    let loginNeeded = false;
    if (autoSave) {
      if (!firebase.auth().currentUser) {
        loginNeeded = true;
        if (circuitSavedText) circuitSavedText.textContent = t('loginToSaveCircuit');
      } else {
        try {
          if (gifLoadingModal) {
            if (gifLoadingText) gifLoadingText.textContent = t('savingCircuit');
            gifLoadingModal.style.display = 'flex';
          }
          if (saveProgressContainer) {
            saveProgressContainer.style.display = 'block';
            updateSaveProgress(0);
          }
          await saveCircuit(updateSaveProgress);
          saveSuccess = true;
          if (circuitSavedText) circuitSavedText.textContent = t('circuitSaved');
        } catch (e) {
          alert(t('saveFailed').replace('{error}', e));
        } finally {
          if (gifLoadingModal) {
            gifLoadingModal.style.display = 'none';
            if (gifLoadingText) gifLoadingText.textContent = t('gifLoadingText');
          }
          if (saveProgressContainer) {
            saveProgressContainer.style.display = 'none';
            updateSaveProgress(0);
          }
        }
      }
    }
    const { blockCounts, usedWires } = getCircuitStats(circuit);
    const hintsUsed = getHintProgress(level);
    const nickname = getUsername() || '익명';
    const rankingsRef = db.ref(`rankings/${level}`);
    pendingClearedLevel = null;
    rankingsRef.orderByChild('nickname').equalTo(nickname).once('value', snapshot => {
      if (!snapshot.exists()) {
        saveRanking(level, blockCounts, usedWires, hintsUsed);
        pendingClearedLevel = level;
        markLevelCleared(level);
      } else {
        let best = null;
        snapshot.forEach(child => {
          const e = child.val();
          const oldBlocks = Object.values(e.blockCounts || {}).reduce((a, b) => a + b, 0);
          const newBlocks = Object.values(blockCounts).reduce((a, b) => a + b, 0);
          const oldWires = e.usedWires;
          const newWires = usedWires;
          if (newBlocks < oldBlocks || (newBlocks === oldBlocks && newWires < oldWires)) {
            best = { key: child.key };
            return false;
          }
        });
        if (best) {
          rankingsRef.child(best.key).update({
            blockCounts,
            usedWires,
            hintsUsed,
            timestamp: new Date().toISOString()
          });
          pendingClearedLevel = level;
          markLevelCleared(level);
        }
      }
      if (saveSuccess || loginNeeded) showCircuitSavedModal();
    });
  }

  const returnBtn = document.createElement('button');
  returnBtn.id = 'returnToEditBtn';
  returnBtn.textContent = t('returnToEditBtn');
  gradingArea.appendChild(returnBtn);
  document.getElementById('returnToEditBtn').addEventListener('click', returnToEditScreen);
}

async function gradeProblemCanvas(key, problem) {
  const circuit = getPlayCircuit();
  if (!circuit) return;
  const inNames = Array.from({ length: problem.inputCount }, (_, i) => 'IN' + (i + 1));
  const outNames = Array.from({ length: problem.outputCount }, (_, i) => 'OUT' + (i + 1));
  const testCases = problem.table.map(row => ({
    inputs: Object.fromEntries(inNames.map(n => [n, row[n]])),
    expected: Object.fromEntries(outNames.map(n => [n, row[n]]))
  }));
  const { evaluateCircuit } = await import('./canvas/engine.js');

  const blocks = Object.values(circuit.blocks);
  for (const b of blocks) {
    if (b.type === 'JUNCTION' || b.type === 'OUTPUT') {
      const incoming = Object.values(circuit.wires).filter(w => w.endBlockId === b.id);
      if (incoming.length > 1) {
        alert(`❌ ${b.type} 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.`);
        if (overlay) overlay.style.display = 'none';
        isScoring = false;
        window.isScoring = false;
        return;
      }
    }
  }

  const requiredOutputs = outNames;
  const actualOutputNames = blocks.filter(b => b.type === 'OUTPUT').map(b => b.name);
  const missingOutputs = requiredOutputs.filter(n => !actualOutputNames.includes(n));
  if (missingOutputs.length > 0) {
    alert(t('outputMissingAlert').replace('{list}', missingOutputs.join(', ')));
    if (overlay) overlay.style.display = 'none';
    isScoring = false;
    window.isScoring = false;
    return;
  }

  let allCorrect = true;
  const bp = document.getElementById('blockPanel');
  if (bp) bp.style.display = 'none';
  const rp = document.getElementById('rightPanel');
  if (rp) rp.style.display = 'none';
  const gradingArea = document.getElementById('gradingArea');
  if (gradingArea) {
    gradingArea.style.display = 'block';
    gradingArea.innerHTML = '<b>채점 결과:</b><br><br>';
  }

  const inputs = blocks.filter(b => b.type === 'INPUT');
  const outputs = blocks.filter(b => b.type === 'OUTPUT');

  for (const test of testCases) {
    inputs.forEach(inp => { inp.value = test.inputs[inp.name] ?? 0; });
    evaluateCircuit(circuit);
    await new Promise(r => setTimeout(r, 100));

    let correct = true;
    const actualText = outputs.map(out => {
      const actual = out.value ? 1 : 0;
      const expected = test.expected[out.name];
      if (actual !== expected) correct = false;
      return `${out.name}=${actual}`;
    }).join(', ');

    const expectedText = Object.entries(test.expected).map(([k, v]) => `${k}=${v}`).join(', ');
    const inputText = Object.entries(test.inputs).map(([k, v]) => `${k}=${v}`).join(', ');

    if (!document.getElementById('gradingTable')) {
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
      </table>`;
    }
    const tbody = document.querySelector('#gradingTable tbody');
    const tr = document.createElement('tr');
    tr.className = correct ? 'correct' : 'wrong';

    const tdInput = document.createElement('td');
    tdInput.textContent = inputText;
    const tdExpected = document.createElement('td');
    tdExpected.textContent = expectedText;
    const tdActual = document.createElement('td');
    tdActual.textContent = actualText;
    const tdResult = document.createElement('td');
    tdResult.style.fontWeight = 'bold';
    tdResult.style.color = correct ? 'green' : 'red';
    tdResult.textContent = correct ? '✅ 정답' : '❌ 오답';

    tr.append(tdInput, tdExpected, tdActual, tdResult);
    tbody.appendChild(tr);
    if (!correct) allCorrect = false;
  }

  const summary = document.createElement('div');
  summary.id = 'gradeResultSummary';
  summary.textContent = allCorrect ? '🎉 모든 테스트를 통과했습니다!' : '😢 일부 테스트에 실패했습니다.';
  gradingArea.appendChild(summary);

  if (allCorrect && key) {
    const { blockCounts, usedWires } = getCircuitStats(circuit);
    const hintsUsed = getHintProgress(key);
    saveProblemRanking(key, blockCounts, usedWires, hintsUsed);
  }

  const returnBtn = document.createElement('button');
  returnBtn.id = 'returnToEditBtn';
  returnBtn.textContent = t('returnToEditBtn');
  gradingArea.appendChild(returnBtn);
  document.getElementById('returnToEditBtn').addEventListener('click', returnToEditScreen);
}

const exportBtn = document.getElementById('exportGifBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', handleGIFExport);
}

// --- 모바일 세로 모드 안내 모달 ---
const orientationModal = document.getElementById('orientationModal');
const rotateLandscapeBtn = document.getElementById('rotateLandscapeBtn');
const closeOrientationBtn = document.getElementById('closeOrientationBtn');

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
  adjustGridZoom('problemCanvasContainer');
});
const mqOrientation = window.matchMedia('(orientation: portrait)');
if (mqOrientation.addEventListener) {
  mqOrientation.addEventListener('change', checkOrientation);
} else if (mqOrientation.addListener) {
  mqOrientation.addListener(checkOrientation);
}
checkOrientation();
adjustGridZoom();
adjustGridZoom('problemCanvasContainer');

function createPaletteForProblem() {
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const blocks = [];
  for (let i = 1; i <= inputCnt; i++) blocks.push({ type: 'INPUT', name: 'IN' + i });
  for (let j = 1; j <= outputCnt; j++) blocks.push({ type: 'OUTPUT', name: 'OUT' + j });
  ['AND','OR','NOT','JUNCTION'].forEach(t => blocks.push({ type: t }));
  return buildPaletteGroups(blocks);
}

function createPaletteForCustom(problem) {
  const blocks = [];
  if (!problem.fixIO) {
    for (let i = 1; i <= problem.inputCount; i++) blocks.push({ type: 'INPUT', name: 'IN' + i });
    for (let j = 1; j <= problem.outputCount; j++) blocks.push({ type: 'OUTPUT', name: 'OUT' + j });
  }
  ['AND','OR','NOT','JUNCTION'].forEach(t => blocks.push({ type: t }));
  return buildPaletteGroups(blocks);
}

async function computeProblemOutputs() {
  const circuit = getProblemCircuit();
  if (!circuit) return;
  const inputCnt = parseInt(document.getElementById('inputCount').value) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount').value) || 1;
  const inNames = Array.from({ length: inputCnt }, (_, i) => 'IN' + (i + 1));
  const outNames = Array.from({ length: outputCnt }, (_, i) => 'OUT' + (i + 1));

  const blocks = Object.values(circuit.blocks);
  const actualOutputs = blocks.filter(b => b.type === 'OUTPUT').map(b => b.name);
  const missing = outNames.filter(n => !actualOutputs.includes(n));
  if (missing.length > 0) {
    alert(t('outputMissingAlert').replace('{list}', missing.join(', ')));
    return;
  }

  const inputs = inNames.map(name => blocks.find(b => b.type === 'INPUT' && b.name === name));
  const outputs = outNames.map(name => blocks.find(b => b.type === 'OUTPUT' && b.name === name));

  const rows = document.querySelectorAll('#testcaseTable tbody tr');
  const { evaluateCircuit } = await import('./canvas/engine.js');
  rows.forEach(tr => {
    const cells = tr.querySelectorAll('td');
    inputs.forEach((inp, i) => {
      if (inp) inp.value = cells[i].textContent.trim() === '1';
    });
    evaluateCircuit(circuit);
    outputs.forEach((out, j) => {
      if (out) cells[inputCnt + j].textContent = out.value ? 1 : 0;
    });
  });
  markProblemOutputsValid();
}

window.submitGuestEntry = submitGuestEntry;
