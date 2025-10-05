// Entry point module coordinating Bitwiser features.
// Placeholder imports ensure upcoming modules can hook into the bootstrap flow.
import { initializeAuth } from './modules/auth.js';
import { initializeAuthUI } from './modules/authUI.js';
import {
  getUsername,
  getHintProgress,
  getAutoSaveSetting,
  setAutoSaveSetting
} from './modules/storage.js';
import { initializeGuestbook } from './modules/guestbook.js';
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
import { createGradingController } from './modules/grading.js';
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
  initializeProblemCreationFlow,
  saveProblem,
  renderUserProblemList,
  showProblemIntro,
  invalidateProblemOutputs,
  createCustomProblemPalette,
  setActiveCustomProblem,
  clearActiveCustomProblem,
  getActiveCustomProblem,
  getActiveCustomProblemKey
} from './modules/problemEditor.js';
import {
  fetchProgressSummary,
  fetchOverallStats,
  showOverallRanking,
  saveRanking,
  saveProblemRanking,
  showClearedModal,
  initializeRankingUI
} from './modules/rank.js';

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

onCircuitModified(() => {
  invalidateProblemOutputs();
});

let lastSavedKey = null;
const translate = typeof t === 'function' ? t : key => key;
const clearedModalOptions = {
  modalSelector: '#clearedModal',
  stageNumberSelector: '#clearedStageNumber',
  rankingSelector: '#clearedRanking',
  prevButtonSelector: '#prevStageBtn',
  nextButtonSelector: '#nextStageBtn',
  closeButtonSelector: '.closeBtn',
  translate,
  loadClearedLevelsFromDb,
  getLevelTitles,
  isLevelUnlocked,
  startLevel,
  returnToEditScreen
};

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
  getCurrentCustomProblem: getActiveCustomProblem,
  getCurrentCustomProblemKey: getActiveCustomProblemKey,
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
    isCustomProblemActive: Boolean(getActiveCustomProblem()),
    onClearCustomProblem: clearActiveCustomProblem
  });
};





window.addEventListener("DOMContentLoaded", () => {
  initializeGuestbook({
    getUsername,
    messageInputId: 'guestMessage',
    listElementId: 'guestbookList',
    submitButtonId: 'guestSubmitBtn'
  });

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

document.getElementById("showIntroBtn").addEventListener("click", () => {
  const level = getCurrentLevel();
  const customProblem = getActiveCustomProblem();
  if (level != null) {
    showIntroModal(level);
  } else if (customProblem) {
    showProblemIntro(customProblem);
  }
});

document.getElementById("gameTitle").addEventListener("click", () => {
  const level = getCurrentLevel();
  const customProblem = getActiveCustomProblem();
  if (level != null) {
    showIntroModal(level);
  } else if (customProblem) {
    showProblemIntro(customProblem);
  }
});

document.getElementById('hintBtn').addEventListener('click', () => {
  const level = getCurrentLevel();
  const customProblem = getActiveCustomProblem();
  if (level == null) {
    if (customProblem) {
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
  moveCircuit(dx, dy, { isProblemFixed: getActiveCustomProblem()?.fixIO });
});

const moveWithConstraints = (dx, dy) =>
  moveCircuit(dx, dy, { isProblemFixed: getActiveCustomProblem()?.fixIO });

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

const overlay = document.getElementById('gridOverlay');
const blockPanel = document.getElementById('blockPanel');
const rightPanel = document.getElementById('rightPanel');
const gradingArea = document.getElementById('gradingArea');

const gradingController = createGradingController({
  getPlayCircuit,
  getLevelAnswer,
  getLevelBlockSet,
  getCurrentLevel,
  getActiveCustomProblem,
  getActiveCustomProblemKey,
  getHintProgress,
  getAutoSaveSetting,
  getCurrentUser: () =>
    typeof firebase !== 'undefined' && typeof firebase.auth === 'function'
      ? firebase.auth().currentUser
      : null,
  saveCircuit,
  updateSaveProgress,
  showCircuitSavedModal,
  markLevelCleared,
  saveRanking,
  saveProblemRanking,
  getUsername,
  db: typeof db !== 'undefined' ? db : null,
  t: translate,
  alert,
  returnToEditScreen,
  elements: {
    overlay,
    blockPanel,
    rightPanel,
    gradingArea,
    circuitSavedText,
    gifLoadingModal,
    gifLoadingText,
    saveProgressContainer
  }
});

configureLevelModule({
  setIsScoring: gradingController.setIsScoring
});

const gradeButton = document.getElementById('gradeButton');
if (gradeButton) {
  gradeButton.addEventListener('click', () => {
    if (circuitHasError) {
      alert('회로에 오류가 존재합니다');
      return;
    }
    gradingController.gradeCurrentSelection();
  });
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
    const clearedLevel = gradingController.consumePendingClearedLevel();
    if (clearedLevel !== null && clearedLevel !== undefined) {
      showClearedModal(clearedLevel, clearedModalOptions);
    }
  });
}

initializeRankingUI({
  viewRankingButtonSelector: '#viewRankingBtn',
  rankingListSelector: '#rankingList',
  rankingModalSelector: '#rankingModal',
  translate,
  getCurrentLevel,
  getActiveCustomProblemKey,
  getLevelBlockSet,
  alert
});

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
  const authInitPromise = initializeAuthUI({
    translate,
    loadClearedLevelsFromDb,
    maybeStartTutorial,
    showOverallRanking,
    fetchOverallStats,
    fetchProgressSummary,
    ids: {
      googleLoginBtnId: 'googleLoginBtn',
      modalGoogleLoginBtnId: 'modalGoogleLoginBtn',
      usernameModalId: 'usernameModal',
      usernameInputId: 'usernameInput',
      usernameErrorId: 'usernameError',
      usernameSubmitId: 'usernameSubmit',
      usernameModalHeadingSelector: '#usernameModal h2',
      loginInfoId: 'loginInfo',
      guestUsernameId: 'guestUsername',
      loginUsernameId: 'loginUsername',
      rankSectionId: 'rankSection',
      overallRankId: 'overallRank',
      clearedCountId: 'clearedCount',
      loginGuestPromptId: 'loginGuestPrompt',
      mergeModalId: 'mergeModal',
      mergeDetailsId: 'mergeDetails',
      mergeConfirmBtnId: 'mergeConfirmBtn',
      mergeCancelBtnId: 'mergeCancelBtn'
    }
  });
  if (authInitPromise) {
    initialTasks.push(authInitPromise);
  }

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



function getCurrentController() {
  const problemScreen = document.getElementById("problem-screen");
  if (problemScreen && problemScreen.style.display !== "none") {
    return getProblemController();
  }
  return getPlayController();
}
const userProblemsScreen = document.getElementById('user-problems-screen');

configureLevelModule({ renderUserProblemList });

initializeHintUI();

function placeFixedIO(problem) {
  getPlayController()?.placeFixedIO?.(problem);
}

async function startCustomProblem(key, problem) {
  setActiveCustomProblem(problem, key);
  clearCurrentLevel();
  const rows = problem.gridRows || 6;
  const cols = problem.gridCols || 6;
  await setupGrid('canvasContainer', rows, cols, createCustomProblemPalette(problem));
  clearGrid();
  placeFixedIO(problem);
  setGridDimensions(rows, cols);
  const prevMenuBtn = document.getElementById('prevStageBtnMenu');
  const nextMenuBtn = document.getElementById('nextStageBtnMenu');
  prevMenuBtn.disabled = true;
  nextMenuBtn.disabled = true;
  document.getElementById('gameTitle').textContent = problem.title || '사용자 문제';
  if (userProblemsScreen) userProblemsScreen.style.display = 'none';
  document.getElementById('gameScreen').style.display = 'flex';
  const rp = document.getElementById('rightPanel');
  if (rp) rp.style.display = 'block';
  document.body.classList.add('game-active');
  collapseMenuBarForMobile({ onAfterCollapse: updatePadding });
}

initializeProblemCreationFlow({
  ids: {
    createProblemBtnId: 'createProblemBtn',
    backButtonId: 'backToMainFromProblem',
    problemScreenId: 'problem-screen',
    firstScreenId: 'firstScreen',
    chapterStageScreenId: 'chapterStageScreen',
    userProblemsScreenId: 'user-problems-screen',
    openProblemCreatorBtnId: 'openProblemCreatorBtn',
    updateIOBtnId: 'updateIOBtn',
    addRowBtnId: 'addTestcaseRowBtn',
    computeOutputsBtnId: 'computeOutputsBtn',
    saveProblemBtnId: 'saveProblemBtn',
    confirmSaveProblemBtnId: 'confirmSaveProblemBtn',
    cancelSaveProblemBtnId: 'cancelSaveProblemBtn',
    closeProblemListModalBtnId: 'closeProblemListModal',
    problemSaveModalId: 'problemSaveModal',
    problemModalBackdropSelector: '#problemSaveModal .modal-backdrop',
    problemListModalId: 'problemListModal',
    problemTitleInputId: 'problemTitleInput',
    problemDescInputId: 'problemDescInput',
    fixIOCheckId: 'fixIOCheck',
    backToChapterFromUserProblemsBtnId: 'backToChapterFromUserProblems'
  },
  buildPaletteGroups,
  onDestroyProblemContext: destroyProblemContext,
  onRefreshUserData: refreshUserData,
  onStartCustomProblem: startCustomProblem
});



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
