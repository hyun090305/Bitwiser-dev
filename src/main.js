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
import { createToastManager } from './modules/toast.js';
import {
  adjustGridZoom,
  setupGrid,
  setGridDimensions,
  clearGrid,
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
import { initializeLabMode } from './modules/labMode.js';
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

function renderCircuitSavedToast({ message, canShare, onShare, onContinue, loginRequired }) {
  const resolvedMessage = typeof message === 'string' && message.trim().length
    ? message
    : translate(loginRequired ? 'loginToSaveCircuit' : 'circuitSaved');

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
let grid;

function simulateKey(key, type = 'keydown') {
  const actualKey =
    key === 'Control' && isApplePlatform
      ? 'Meta'
      : key;
  const eventInit = {
    key: actualKey,
    bubbles: true,
    cancelable: true
  };

  if (actualKey === 'Meta') {
    eventInit.metaKey = true;
  } else if (actualKey === 'Control') {
    eventInit.ctrlKey = true;
  } else if (actualKey === 'Shift') {
    eventInit.shiftKey = true;
  }

  const ev = new KeyboardEvent(type, eventInit);
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

// 회로 저장 완료 모달
function showCircuitSavedModal({ message, canShare, loginRequired } = {}) {
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
    loginRequired,
    onContinue: continueFlow
  });
}

const overlay = document.getElementById('gridOverlay');
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
    rightPanel,
    gradingArea,
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

function syncGameAreaBackground(theme) {
  const gameArea = document.getElementById('gameArea');
  if (!gameArea) return;
  const color = getThemeGridBackground(theme);
  if (color) {
    gameArea.style.backgroundColor = color;
  } else {
    gameArea.style.backgroundColor = '';
  }
}

function setupSettings() {
  const btn = document.getElementById('settingsBtn');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const checkbox = document.getElementById('autoSaveCheckbox');
  const themeOptionsEl = document.getElementById('themeOptions');
  const previewCanvas = document.getElementById('themePreviewCanvas');
  const previewLabel = document.getElementById('themePreviewLabel');
  const themeDescriptionEl = document.getElementById('themeDescription');
  if (!btn || !modal || !closeBtn || !checkbox) return;

  const hasThemeUI = Boolean(themeOptionsEl && previewCanvas && themeDescriptionEl);
  const themeInputs = new Map();
  const previewConfig = { rows: 3, cols: 3 };
  const previewWidth = previewConfig.cols * (CELL + GAP) + GAP;
  const previewHeight = previewConfig.rows * (CELL + GAP) + GAP;
  const previewCircuit = {
    rows: previewConfig.rows,
    cols: previewConfig.cols,
    blocks: {
      input: {
        id: 'preview_in',
        type: 'INPUT',
        name: 'IN',
        pos: { r: 1, c: 0 },
        value: false
      },
      output: {
        id: 'preview_out',
        type: 'OUTPUT',
        name: 'OUT',
        pos: { r: 1, c: 2 },
        value: false
      }
    },
    wires: {
      w1: {
        id: 'preview_wire1',
        path: [
          { r: 1, c: 0 },
          { r: 1, c: 1 },
          { r: 1, c: 2 }
        ],
        startBlockId: 'preview_in',
        endBlockId: 'preview_out'
      }
    }
  };

  const themes = hasThemeUI ? getAvailableThemes() : [];
  let previewCtx = null;

  if (hasThemeUI) {
    previewCtx = setupCanvas(previewCanvas, previewWidth, previewHeight);
  }

  const enabled = getAutoSaveSetting();
  checkbox.checked = enabled;
  checkbox.addEventListener('change', () => {
    setAutoSaveSetting(checkbox.checked);
  });

  const getCurrentLang = () =>
    typeof window !== 'undefined' && window.currentLang === 'en' ? 'en' : 'ko';

  const drawThemePreview = theme => {
    if (!previewCtx || !theme) return;
    drawGrid(previewCtx, previewCircuit.rows, previewCircuit.cols, 0, null, {
      theme
    });
    renderContent(previewCtx, previewCircuit, 0, 0, null, null, { theme });
  };

  const buildThemeOptions = () => {
    if (!hasThemeUI) return;
    themeInputs.clear();
    themeOptionsEl.innerHTML = '';
    const lang = getCurrentLang();
    const activeId = getActiveThemeId();
    themes.forEach(theme => {
      const label = document.createElement('label');
      label.className = 'theme-option';
      const accent = theme.accentColor || '#6366f1';
      const accentSoft = theme.accentSoft || 'rgba(99, 102, 241, 0.24)';
      label.style.setProperty('--theme-accent', accent);
      label.style.setProperty('--theme-accent-soft', accentSoft);
      const optionBg = theme.panel?.background || theme.grid?.background || 'rgba(248, 250, 252, 0.88)';
      const activeBg = theme.grid?.gridFillA || theme.grid?.gridFillB || optionBg;
      label.style.setProperty('--theme-option-bg', optionBg);
      label.style.setProperty('--theme-option-bg-active', activeBg);

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'themeSelection';
      input.value = theme.id;
      input.checked = theme.id === activeId;
      input.setAttribute('aria-label', getThemeText(theme, 'name', lang) || theme.id);

      const content = document.createElement('span');
      content.className = 'theme-option__content';

      const swatches = document.createElement('span');
      swatches.className = 'theme-option__swatches';
      const swatchColors = (theme.swatches && theme.swatches.length
        ? theme.swatches
        : [accent, optionBg, activeBg]
      ).filter(Boolean);
      swatchColors.slice(0, 4).forEach(color => {
        const sw = document.createElement('span');
        sw.className = 'theme-option__swatch';
        sw.style.background = color;
        swatches.appendChild(sw);
      });

      const nameEl = document.createElement('span');
      nameEl.className = 'theme-option__name';
      nameEl.textContent = getThemeText(theme, 'name', lang) || theme.id;

      const summaryText = getThemeText(theme, 'summary', lang);
      const summaryEl = document.createElement('span');
      summaryEl.className = 'theme-option__summary';
      summaryEl.textContent = summaryText || '';

      content.appendChild(swatches);
      content.appendChild(nameEl);
      if (summaryText) {
        content.appendChild(summaryEl);
      }

      input.addEventListener('change', () => {
        if (!input.checked) return;
        const previous = getActiveThemeId();
        const nextTheme = setActiveTheme(theme.id);
        if (previous === theme.id && nextTheme) {
          handleThemeChange(nextTheme);
        }
      });

      label.appendChild(input);
      label.appendChild(content);
      themeOptionsEl.appendChild(label);
      themeInputs.set(theme.id, { input, label });
    });
  };

  const handleThemeChange = theme => {
    syncGameAreaBackground(theme);
    if (!hasThemeUI || !theme) return;
    const lang = getCurrentLang();
    const name = getThemeText(theme, 'name', lang) || theme.id;
    const description = getThemeText(theme, 'description', lang);
    const previewText =
      typeof window !== 'undefined' && typeof window.t === 'function'
        ? window.t('themePreviewLabel')
        : 'Preview';
    themeInputs.forEach(({ input, label }, id) => {
      const isActive = id === theme.id;
      if (input) input.checked = isActive;
      if (label) label.classList.toggle('is-active', isActive);
    });
    if (previewLabel) {
      previewLabel.textContent = `${previewText} · ${name}`;
    }
    if (themeDescriptionEl) {
      themeDescriptionEl.textContent = description || '';
    }
    drawThemePreview(theme);
  };

  if (hasThemeUI) {
    buildThemeOptions();
    onThemeChange(handleThemeChange);
    const initialTheme = getThemeById(getActiveThemeId());
    if (initialTheme) {
      handleThemeChange(initialTheme);
    }
  }

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
  syncGameAreaBackground(getThemeById(getActiveThemeId()));
  onThemeChange(syncGameAreaBackground);
  setupGameAreaPadding();
  Promise.all(initialTasks).then(() => {
    setupNavigation({
      refreshUserData,
      renderChapterList,
      getClearedLevels,
      renderUserProblemList,
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
    { forceHideInOut: Boolean(problem?.fixIO) }
  );
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
    backButtonId: 'backToMainFromProblem',
    problemScreenId: 'problem-screen',
    firstScreenId: 'firstScreen',
    chapterStageScreenId: 'chapterStageScreen',
    userProblemsScreenId: 'user-problems-screen',
    openProblemCreatorBtnId: 'openProblemCreatorBtn',
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
