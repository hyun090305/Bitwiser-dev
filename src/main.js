import { initializeFullCostExperience } from './modules/fullCostExperience.js';
import { initializeLoadingDots, setLoadingMilestone, registerLoadingTask, hideLoadingScreen } from './modules/loadingScreen.js';
import { setupKeyToggles, setupSettings, setupSystemMenuDrawer, syncGameAreaBackground, isTextInputFocused } from './modules/gameUI.js';
// Entry point module coordinating Bitwiser features.
// Placeholder imports ensure upcoming modules can hook into the bootstrap flow.
import { isCircuitStorageAvailable } from './modules/circuitStorage.js';
import { initializeAuthUI } from './modules/authUI.js';
import {
  getUsername,
  getHintProgress,
  getAutoSaveSetting,
  setAutoSaveSetting,
  getBgmEnabledSetting,
  setBgmEnabledSetting,
  getSfxEnabledSetting,
  setSfxEnabledSetting
} from './modules/storage.js';
import { initializeGuestbook } from './modules/guestbook.js';
import { createToastManager } from './modules/toast.js';
import {
  adjustGridZoom,
  setupGrid,
  setGridDimensions,
  clearGrid,
  moveCircuit,
  onCircuitModified,
  getActiveCircuit,
  getActiveController,
  getPlayCircuit,
  getPlayController,
  getProblemCircuit,
  getProblemController,
  getGridDimensions,
  destroyProblemContext
} from './modules/grid.js';
import * as levelsModule from './modules/levels.js';
import * as uiModule from './modules/ui.js';
import { openHintModal, initializeHintUI } from './modules/hints.js';
import { createGuidedTutorial } from './modules/guidedTutorial.js';
import { createGradingController } from './modules/grading.js?v=local-saves-1';
import {
  initializeCircuitShare,
  configureCircuitStorageUI,
  initializeStatusShare,
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
  showCircuitSavedToast
} from './modules/circuitShare.js';
import {
  setupNavigation,
  lockOrientationLandscape,
  isMobileDevice,
  hideStageMapScreen,
  showGameScreen
} from './modules/navigation.js';
import { initializeBgm, setBgmEnabled, setSfxEnabled } from './modules/bgm.js';
import {
  initializeProblemCreationFlow,
  saveProblem,
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
import { initializeLabMode } from './modules/labMode.js';
import { initializeStageMap } from './modules/stageMap.js';
import {
  getAvailableThemes,
  getActiveThemeId,
  setActiveTheme,
  getThemeById,
  onThemeChange,
  getThemeText,
  getThemeGridBackground
} from './themes.js';
import { drawGrid, renderContent, setupCanvas } from './canvas/renderer.js';
import { CELL, GAP } from './canvas/model.js';

void uiModule;

const {
  configureLevelModule,
  loadStageData,
  getStageDataPromise,
  startLevel,
  returnToEditScreen,
  returnToLevels,
  refreshUserData,
  loadClearedLevelsFromDb,
  markLevelCleared,
  fetchClearedLevels,
  isLevelUnlocked,
  showIntroModal,
  getLevelTitle,
  getLevelTitles,
  getLevelBlockSet,
  getLevelAnswer,
  getLevelHints,
  getCurrentLevel,
  clearCurrentLevel,
  getClearedLevels,
  buildPaletteGroups
} = levelsModule;


onCircuitModified(context => {
  if (context === 'problem' || context === 'unknown') {
    invalidateProblemOutputs();
  }
});

const translate = typeof t === 'function' ? t : key => key;

const toastContainer = document.getElementById('toastContainer') ?? (() => {
  const el = document.createElement('div');
  el.id = 'toastContainer';
  el.className = 'toast-container';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  document.body.appendChild(el);
  return el;
})();

const toastManager = createToastManager(toastContainer);
const TOAST_IDS = {
  gif: 'toast-gif-loading',
  saving: 'toast-circuit-saving'
};
let activeSavedToastId = null;

function showGifLoadingToast(message) {
  if (!message) return;
  toastManager.show({
    id: TOAST_IDS.gif,
    message,
    spinner: true,
    autoHide: false,
    dismissible: false
  });
}

function hideGifLoadingToast() {
  toastManager.remove(TOAST_IDS.gif, { silent: true });
}

function showCircuitSavingToast(message) {
  toastManager.show({
    id: TOAST_IDS.saving,
    message,
    spinner: true,
    progress: 0,
    autoHide: false,
    dismissible: false
  });
}

function updateCircuitSavingToast(progress) {
  toastManager.update(TOAST_IDS.saving, {
    progress: typeof progress === 'number' ? progress : 0,
    spinner: true
  });
}

function hideCircuitSavingToast() {
  toastManager.remove(TOAST_IDS.saving, { silent: true });
}

function renderCircuitSavedToast({ message, canShare, onShare, onContinue }) {
  const resolvedMessage = typeof message === 'string' && message.trim().length
    ? message
    : translate('circuitSaved');

  if (activeSavedToastId) {
    toastManager.remove(activeSavedToastId, { silent: true });
    activeSavedToastId = null;
  }

  let toastId = null;
  const actions = [];
  const shareHandler = canShare && typeof onShare === 'function' ? onShare : null;
  if (shareHandler) {
    actions.push({
      label: translate('savedShareBtn'),
      onClick: () => shareHandler(),
      closeOnClick: false
    });
  }

  const closeLabelKey = typeof onContinue === 'function' ? 'savedNextBtn' : 'closeShareBtn';
  actions.push({
    label: translate(closeLabelKey),
    onClick: () => {
      if (toastId) {
        toastManager.remove(toastId);
      }
    },
    closeOnClick: false
  });

  toastId = toastManager.show({
    id: `toast-saved-${Date.now()}`,
    message: resolvedMessage,
    actions,
    autoHide: false,
    dismissible: true,
    onClose: () => {
      if (activeSavedToastId === toastId) {
        activeSavedToastId = null;
      }
      if (typeof onContinue === 'function') {
        onContinue();
      }
    }
  });

  activeSavedToastId = toastId;
  return toastId;
}

const toastApi = {
  showGifLoading: showGifLoadingToast,
  hideGifLoading: hideGifLoadingToast,
  showCircuitSaving: showCircuitSavingToast,
  updateCircuitSaving: updateCircuitSavingToast,
  hideCircuitSaving: hideCircuitSavingToast,
  showCircuitSaved: renderCircuitSavedToast
};
let stageMapController = null;
const clearedModalOptions = {
  modalSelector: '#clearedModal',
  stageTitleSelector: '#clearedStageName',
  rankingSelector: '#clearedRanking',
  continueButtonSelector: '#clearedMapBtn',
  closeButtonSelector: '.closeBtn',
  translate,
  loadClearedLevelsFromDb,
  getLevelTitles,
  returnToEditScreen,
  returnToLevels,
  stageMapCelebrate: level => stageMapController?.celebrateLevel?.(level)
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

initializeCircuitShare({
  elements: {
    gifModal,
    gifPreview,
    savedModal: document.getElementById('savedModal'),
    savedList: document.getElementById('savedList')
  },
  translate: typeof t === 'function' ? t : key => key,
  alert,
  confirm,
  getCurrentCustomProblem: getActiveCustomProblem,
  getCurrentCustomProblemKey: getActiveCustomProblemKey,
  ui: toastApi
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
const criticalTasks = []; // Only wait for essentials before showing the map

initializeLoadingDots();
setLoadingMilestone(4);

const validWireShapes = [
  ["wire-up", "wire-down"],
  ["wire-left", "wire-right"],
  ["wire-up", "wire-right"],
  ["wire-right", "wire-down"],
  ["wire-down", "wire-left"],
  ["wire-left", "wire-up"]
];

// (2) 페이지 로드 시 INPUT 블록 클릭으로 0↔1 토글 준비






const gameScreen = document.getElementById("gameScreen");
const stageMapScreen = document.getElementById('stageMapScreen');
let guidedTutorial;

document.getElementById("backToLevelsBtn").onclick = async () => {
  guidedTutorial?.stop?.();
  await returnToLevels({
    isCustomProblemActive: Boolean(getActiveCustomProblem()),
    onClearCustomProblem: clearActiveCustomProblem
  });
};





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
  if (document.body.classList.contains('lab-mode-active')) {
    return;
  }
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



const maybeStartTutorial = () => {};


document.addEventListener('keydown', e => {
  if (window.isGradingResultOpen) return;
  if (e.defaultPrevented || isTextInputFocused()) return;
  // The stage map owns its arrow keys. Do not consume them before its listener runs.
  if (stageMapScreen?.getAttribute('aria-hidden') !== 'true' && stageMapScreen?.getClientRects().length) return;
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

// 회로 저장 완료 모달
function showCircuitSavedModal({ message, canShare } = {}) {
  let hasContinued = false;
  const continueFlow = () => {
    if (hasContinued) return;
    hasContinued = true;
    const clearedLevel = gradingController.consumePendingClearedLevel();
    if (clearedLevel !== null && clearedLevel !== undefined) {
      showClearedModal(clearedLevel, clearedModalOptions);
    }
  };

  continueFlow();

  showCircuitSavedToast({
    message,
    canShare,
    onContinue: continueFlow
  });
}

const overlay = document.getElementById('gridOverlay');
const rightPanel = document.getElementById('rightPanel');
const gradingInlineStatus = document.getElementById('gradingInlineStatus');
const gradeButton = document.getElementById('gradeButton');

const costExperience = initializeFullCostExperience({ db: typeof db !== 'undefined' ? db : null,
  getStage: () => getActiveCustomProblem() ? null : getCurrentLevel() });

const gradingController = createGradingController({
  getTraceView: () => getPlayController()?.createTraceView(),
  onPassed: costExperience.onPassed,
  getPlayCircuit,
  getLevelAnswer,
  getLevelBlockSet,
  getCurrentLevel,
  getActiveCustomProblem,
  getActiveCustomProblemKey,
  getHintProgress,
  getAutoSaveSetting: () => isCircuitStorageAvailable() && getAutoSaveSetting(),
  saveCircuit,
  updateSaveProgress,
  showCircuitSavedModal,
  showClearedModal,
  showClearedModalOptions: clearedModalOptions,
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
    rightPanel,
    gradeButton,
    gradingInlineStatus,
    toast: toastApi
  }
});

initializeStatusShare({
  getClearedLevels,
  getLevelTitles,
  translate,
  alert,
  elements: {
    shareModal: document.getElementById('shareModal'),
    shareText: document.getElementById('shareText'),
    copyShareBtn: document.getElementById('copyShareBtn'),
    closeShareBtn: document.getElementById('closeShareBtn'),
    copyStatusBtn: document.getElementById('copyStatusBtn')
  }
});

configureLevelModule({
  setIsScoring: gradingController.setIsScoring
});

if (gradeButton) {
  gradeButton.addEventListener('click', () => {
    gradingController.gradeCurrentSelection();
  });
}

guidedTutorial = createGuidedTutorial({
  lang: typeof currentLang !== 'undefined' ? currentLang : 'en',
  missionPanel: document.getElementById('tutorialMissionPanel'),
  missionList: document.getElementById('tutorialMissionList'),
  gradeButton,
  getPlayCircuit
});

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
  onLevelIntroComplete: () => {
    guidedTutorial?.handleLevelStart?.(getCurrentLevel());
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initializeBgm();
  initializeLoadingDots();
  setLoadingMilestone(10);
  initializeGuestbook({
    getUsername,
    messageInputId: 'guestMessage',
    listElementId: 'guestbookList',
    submitButtonId: 'guestSubmitBtn'
  });
  setLoadingMilestone(18);

  const stagePromise = registerLoadingTask(loadStageData(typeof currentLang !== 'undefined' ? currentLang : undefined).then(() => {
    // 이전/다음 스테이지 메뉴 버튼 제거됨
    return loadClearedLevelsFromDb();
  }), 4);
  criticalTasks.push(stagePromise);
  setLoadingMilestone(32);

  const uname = getUsername();
  if (uname) {
    const guestUsernameEl = document.getElementById('guestUsername');
    if (guestUsernameEl) {
      guestUsernameEl.textContent = uname;
    }
  }

  const overallRankingPromise = showOverallRanking(); // Load rankings without blocking the UI
  if (overallRankingPromise && typeof overallRankingPromise.then === 'function') {
    registerLoadingTask(overallRankingPromise, 1).catch(err => {
      console.error('Failed to load overall ranking', err);
    });
  }
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
  if (authInitPromise && typeof authInitPromise.then === 'function') {
    registerLoadingTask(authInitPromise, 2).catch(err => {
      console.error('Failed to initialise auth UI', err);
    });
  }

  setupKeyToggles();
  setupSystemMenuDrawer();
  setupSettings();
  configureCircuitStorageUI();
  syncGameAreaBackground(getThemeById(getActiveThemeId()));
  onThemeChange(syncGameAreaBackground);
  setLoadingMilestone(72);
  Promise.all(criticalTasks).then(() => {
    setLoadingMilestone(90);
    stageMapController = initializeStageMap({
      getStageAccess: levelsModule.getStageAccess,
      getStageStars: costExperience.stars,
      getLevelTitle,
      isLevelUnlocked,
      getClearedLevels,
      startLevel,
      returnToEditScreen
    });
    setupNavigation({
      refreshUserData
    });
    setLoadingMilestone(100);
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

initializeHintUI();
initializeLabMode();

function placeFixedIO(problem) {
  getPlayController()?.placeFixedIO?.(problem);
}

async function startCustomProblem(key, problem) {
  setActiveCustomProblem(problem, key);
  clearCurrentLevel();
  const rows = problem.gridRows || 6;
  const cols = problem.gridCols || 6;
  await setupGrid(
    'canvasContainer',
    rows,
    cols,
    createCustomProblemPalette(problem),
    {
      forceHideInOut: Boolean(problem?.fixIO),
      enableCopyPaste: true,
    }
  );
  clearGrid();
  placeFixedIO(problem);
  setGridDimensions(rows, cols);
  // 이전/다음 스테이지 메뉴 버튼 관련 로직 제거됨
  document.getElementById('gameTitle').textContent = problem.title
    || translate('userProblemFallbackTitle');
  hideStageMapScreen();
  showGameScreen();
  const rp = document.getElementById('rightPanel');
  if (rp) rp.style.display = '';
  
  showProblemIntro(problem, () => {
    document.body.classList.add('game-active');
  });
}

initializeProblemCreationFlow({
  ids: {
    backButtonId: 'backToMainFromProblem',
    problemScreenId: 'problem-screen',
    firstScreenId: 'stageMapScreen',
    saveProblemBtnId: 'saveProblemBtn',
    confirmSaveProblemBtnId: 'confirmSaveProblemBtn',
    cancelSaveProblemBtnId: 'cancelSaveProblemBtn',
    closeProblemListModalBtnId: 'closeProblemListModal',
    problemSaveModalId: 'problemSaveModal',
    problemModalBackdropSelector: '#problemSaveModal .modal-backdrop',
    problemListModalId: 'problemListModal',
    problemTitleInputId: 'problemTitleInput',
    problemDescInputId: 'problemDescInput',
    problemDifficultyContainerId: 'problemDifficultyStars',
    problemDifficultyValueInputId: 'problemDifficultyValue',
    problemDifficultyValueLabelId: 'problemDifficultyValueLabel',
    fixIOCheckId: 'fixIOCheck'
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
