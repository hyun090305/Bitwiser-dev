
let currentLevel = null;
let currentCustomProblem = null;
let currentCustomProblemKey = null;
let GRID_ROWS = 6;
let GRID_COLS = 6;
let problemOutputsValid = false;
let problemScreenPrev = null;  // 문제 출제 화면 진입 이전 화면 기록
let loginFromMainScreen = false;  // 메인 화면에서 로그인 여부 추적

let lastSavedKey = null;
let pendingClearedLevel = null;

// Google Drive API initialization
const GOOGLE_CLIENT_ID = '796428704868-sse38guap4kghi6ehbpv3tmh999hc9jm.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let gapiInited = false;
let gapiInitPromise = null;
let tokenClient;
let silentCheckPromise = null;

function canRequestTokenSilently() {
  if (silentCheckPromise) {
    return silentCheckPromise;
  }
  if (!(window.google && window.google.accounts && window.google.accounts.id)) {
    silentCheckPromise = Promise.resolve(false);
    return silentCheckPromise;
  }
  silentCheckPromise = new Promise(resolve => {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: false,
        callback: () => {}
      });
      google.accounts.id.prompt(n => {
        const reason = n.getNotDisplayedReason && n.getNotDisplayedReason();
        if (reason === 'third_party_cookies_blocked' ||
            reason === 'browser_not_supported' ||
            reason === 'unknown_reason') {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (e) {
      resolve(false);
    }
  });
  return silentCheckPromise;
}

window.addEventListener('load', () => {
  if (window.gapi) {
    gapiInitPromise = new Promise(resolve => {
      gapi.load('client', async () => {
        await gapi.client.init({
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
        });
        // Restore previously saved Drive token if still valid
        gapiInited = true;
        resolve();
      });
    });
  }
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (tokenResponse) => {
        gapi.client.setToken(tokenResponse);
        if (tokenClient.onResolve) {
          const cb = tokenClient.onResolve;
          tokenClient.onResolve = null;
          cb(tokenResponse);
        }
      }
    });
  }
});

async function ensureDriveAuth() {
  const user = firebase.auth().currentUser;
  if (!user) {
    throw new Error(t('googleLoginPrompt'));
  }
  if (!gapiInited) {
    if (gapiInitPromise) {
      await gapiInitPromise;
    } else {
      throw new Error(t('loginRequired'));
    }
  }
  let token = gapi.client.getToken();
  if (!token || !token.scope || !token.scope.includes(DRIVE_SCOPE)) {
    if (!tokenClient) throw new Error(t('loginRequired'));
    const requestToken = (options) => new Promise((resolve, reject) => {
      tokenClient.onResolve = (resp) => {
        if (resp.error) {
          reject(new Error(resp.error));
        } else {
          resolve(resp);
        }
      };
      try {
        tokenClient.requestAccessToken(options);
      } catch (err) {
        reject(err);
      }
    });
    const hintOptions = user && user.email ? { hint: user.email } : {};
    const allowSilent = await canRequestTokenSilently();
    if (!allowSilent) {
      throw new Error(t('googleLoginPrompt'));
    }
    try {
      token = await requestToken({ prompt: 'none', ...hintOptions });
    } catch (e) {
      const err = (e.message || '').toLowerCase();
      if (err.includes('login') || err.includes('idpiframe')) {
        // User not logged in; do not open a popup.
        throw new Error(t('googleLoginPrompt'));
      } else if (err.includes('consent') || err.includes('interaction')) {
        try {
          // Only request an interactive popup when consent is required.
          token = await requestToken({ prompt: 'consent', ...hintOptions });
        } catch (e2) {
          throw new Error(t('loginRequired'));
        }
      } else {
        throw new Error(t('loginRequired'));
      }
    }
  }
  return token;
}

// Preload heavy canvas modules so they are ready when a stage begins.
// This reduces the delay caused by dynamic imports later in the game.
['./src/canvas/model.js',
 './src/canvas/controller.js',
 './src/canvas/engine.js',
 './src/canvas/renderer.js'].forEach(p => import(p));

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

function updateSaveProgress(percent) {
  if (saveProgressBar) {
    saveProgressBar.style.width = `${percent}%`;
  }
}
let currentGifBlob = null;
let currentGifUrl = null;
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
    const link = document.createElement('a');
    link.href = currentGifUrl;
    link.download = 'circuit.gif';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
if (copyGifBtn) {
  copyGifBtn.addEventListener('click', async () => {
    if (!currentGifBlob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [currentGifBlob.type]: currentGifBlob })
      ]);
      alert('이미지가 클립보드에 복사되었습니다.');
    } catch (err) {
      console.error(err);
      alert('이미지 복사에 실패했습니다.');
    }
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

// 초기 로딩 관련
const initialTasks = [];
let stageDataPromise = Promise.resolve();
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (el) el.style.display = 'none';
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
const firstScreenEl = document.getElementById("firstScreen");

if (mobileNav && firstScreenEl) {
  const tabs = [overallRankingAreaEl, mainScreenSection, guestbookAreaEl];
  const tabHashes = ["#ranking", "#home", "#guestbook"];
  const hashToIndex = { "#ranking": 0, "#home": 1, "#guestbook": 2 };
  let activeTabIndex = hashToIndex[location.hash] ?? 1;
  let isTransitioning = false;
  let startX = 0, startY = 0, isSwiping = false;
  let swipeThreshold = window.innerWidth * 0.25;
  let hashLock = false;

  function updateNavActive() {
    mobileNav.querySelectorAll(".nav-item").forEach((nav, i) => {
      nav.classList.toggle("active", i === activeTabIndex);
      nav.setAttribute("aria-selected", i === activeTabIndex ? "true" : "false");
    });
  }

  function focusFirstInActiveTab() {
    const focusable = tabs[activeTabIndex].querySelector(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) focusable.focus();
  }

  function syncHash(index) {
    hashLock = true;
    location.hash = tabHashes[index];
    setTimeout(() => (hashLock = false), 0);
  }

  function initMobile() {
    tabs.forEach((tab, i) => {
      tab.style.display = "flex";
      tab.style.transition = "";
      tab.style.transform = `translateX(${(i - activeTabIndex) * 100}%)`;
      tab.style.opacity = i === activeTabIndex ? "1" : "0";
      tab.style.pointerEvents = i === activeTabIndex ? "auto" : "none";
      tab.classList.toggle("active", i === activeTabIndex);
    });
    updateNavActive();
    swipeThreshold = window.innerWidth * 0.25;
    syncHash(activeTabIndex);
    focusFirstInActiveTab();
    refreshUserData();
  }

  function resetDesktop() {
    tabs.forEach(tab => {
      tab.style.transition = "";
      tab.style.transform = "";
      tab.style.opacity = "";
      tab.style.pointerEvents = "";
      tab.style.display = "";
      tab.classList.remove("active");
    });
  }

  function goToTab(index) {
    if (isTransitioning || index === activeTabIndex || index < 0 || index >= tabs.length)
      return;
    const direction = index > activeTabIndex ? 1 : -1;
    const current = tabs[activeTabIndex];
    const next = tabs[index];
    isTransitioning = true;

    next.style.transition = "none";
    next.style.transform = `translateX(${100 * direction}%)`;
    next.style.opacity = "0";
    next.style.pointerEvents = "none";
    next.classList.add("active");

    requestAnimationFrame(() => {
      current.style.transition =
        next.style.transition = "transform 0.3s ease, opacity 0.3s ease";
      current.style.transform = `translateX(${-100 * direction}%)`;
      current.style.opacity = "0";
      next.style.transform = "translateX(0)";
      next.style.opacity = "1";
      next.style.pointerEvents = "auto";
    });

    next.addEventListener(
      "transitionend",
      () => {
        current.style.transition = "";
        next.style.transition = "";
        current.style.pointerEvents = "none";
        current.classList.remove("active");
        current.style.transform = `translateX(${ -100 * direction }%)`;
        activeTabIndex = index;
        updateNavActive();
        focusFirstInActiveTab();
        syncHash(activeTabIndex);
        refreshUserData();
        isTransitioning = false;
      },
      { once: true }
    );
  }

  mobileNav.querySelectorAll(".nav-item").forEach((item, i) => {
    item.addEventListener("click", () => goToTab(i));
  });

  function onTouchStart(e) {
    if (isTransitioning || window.innerWidth >= 1024) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = true;
  }

  function onTouchMove(e) {
    if (!isSwiping) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) {
      isSwiping = false;
      tabs[activeTabIndex].style.transform = "translateX(0)";
      return;
    }
    tabs[activeTabIndex].style.transition = "none";
    tabs[activeTabIndex].style.transform = `translateX(${dx}px)`;
  }

  function onTouchEnd(e) {
    if (!isSwiping) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const absDx = Math.abs(dx);
    const current = tabs[activeTabIndex];
    current.style.transition = "transform 0.3s ease";
    current.style.transform = "translateX(0)";
    if (absDx > swipeThreshold && absDx > Math.abs(dy)) {
      if (dx < 0 && activeTabIndex < tabs.length - 1) {
        goToTab(activeTabIndex + 1);
      } else if (dx > 0 && activeTabIndex > 0) {
        goToTab(activeTabIndex - 1);
      }
    }
    isSwiping = false;
  }

  firstScreenEl.addEventListener("touchstart", onTouchStart, { passive: true });
  firstScreenEl.addEventListener("touchmove", onTouchMove, { passive: true });
  firstScreenEl.addEventListener("touchend", onTouchEnd);

  window.addEventListener("hashchange", () => {
    if (hashLock) return;
    const idx = hashToIndex[location.hash];
    if (idx !== undefined && idx !== activeTabIndex) {
      goToTab(idx);
    }
  });

  function handleResize() {
    swipeThreshold = window.innerWidth * 0.25;
    if (window.innerWidth >= 1024) {
      resetDesktop();
    } else {
      initMobile();
    }
  }

  window.addEventListener("resize", handleResize);
  document.addEventListener("DOMContentLoaded", handleResize);
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

  const leftPanel = document.getElementById('overallRankingArea');
  const rightPanel = document.getElementById('guestbookArea');
  const mainScreen = document.getElementById('mainScreen');
  const firstScreen = document.getElementById('firstScreen');

  leftPanel.classList.add('slide-out-left');
  rightPanel.classList.add('slide-out-right');
  mainScreen.classList.add('fade-scale-out');

  setTimeout(() => {
    firstScreen.style.display = 'none';
    leftPanel.classList.remove('slide-out-left');
    rightPanel.classList.remove('slide-out-right');
    mainScreen.classList.remove('fade-scale-out');

    chapterStageScreen.style.display = 'block';
    chapterStageScreen.classList.add('stage-screen-enter');
    refreshUserData();
    chapterStageScreen.addEventListener('animationend', () => {
      chapterStageScreen.classList.remove('stage-screen-enter');
    }, { once: true });
  }, 200);
};

document.getElementById("backToMainFromChapter").onclick = () => {
  const firstScreen = document.getElementById('firstScreen');
  const leftPanel = document.getElementById('overallRankingArea');
  const rightPanel = document.getElementById('guestbookArea');
  const mainScreen = document.getElementById('mainScreen');

  chapterStageScreen.classList.add('stage-screen-exit');
  chapterStageScreen.addEventListener('animationend', () => {
    chapterStageScreen.classList.remove('stage-screen-exit');
    chapterStageScreen.style.display = 'none';

    firstScreen.style.display = '';
    if (!isMobileDevice()) {
      leftPanel.classList.add('slide-in-left');
      rightPanel.classList.add('slide-in-right');
      mainScreen.classList.add('fade-scale-in');
      leftPanel.addEventListener('animationend', () => {
        leftPanel.classList.remove('slide-in-left');
        window.dispatchEvent(new Event('resize'));
      }, { once: true });
      rightPanel.addEventListener('animationend', () => {
        rightPanel.classList.remove('slide-in-right');
        window.dispatchEvent(new Event('resize'));
      }, { once: true });
      mainScreen.addEventListener('animationend', () => {
        mainScreen.classList.remove('fade-scale-in');
        window.dispatchEvent(new Event('resize'));
      }, { once: true });
    } else {
      window.dispatchEvent(new Event('resize'));
    }
    refreshUserData();
  }, { once: true });
};

document.getElementById("toggleChapterList").onclick = () => {
  chapterListEl.classList.toggle('hidden');
};

document.getElementById("backToLevelsBtn").onclick = () => {
  window.playController?.destroy?.();
  window.playController = null;
  window.playCircuit = null;
  document.body.classList.remove('game-active');
  gameScreen.style.display = "none";
  if (currentCustomProblem) {
    currentCustomProblem = null;
    userProblemsScreen.style.display = 'block';
    renderUserProblemList();
  } else {
    chapterStageScreen.style.display = "block";
    loadClearedLevelsFromDb();
    renderChapterList();
    const chapter = chapterData[selectedChapterIndex];
    if (chapter && chapter.id !== 'user') {
      renderStageList(chapter.stages);
    }
  }
};



async function startLevel(level) {
  await stageDataPromise;
  await loadClearedLevelsFromDb();
  const [rows, cols] = levelGridSizes[level] || [6, 6];
  GRID_ROWS = rows;
  GRID_COLS = cols;
  showLevelIntro(level, () => {
    // 캔버스 기반 그리드 세팅
    setupGrid("canvasContainer", rows, cols, createPaletteForLevel(level));
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

function createCheckmarkSvg(animate = false) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('checkmark');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M4 12l5 5 11-11');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'green');
  path.setAttribute('stroke-width', '3');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  if (animate) svg.classList.add('animate');
  return svg;
}

function refreshClearedUI() {
  document.querySelectorAll('.stageCard').forEach(card => {
    const level = parseInt(card.dataset.stage, 10);
    card.classList.remove('cleared');
    const check = card.querySelector('.checkmark');
    if (clearedLevelsFromDb.includes(level)) {
      card.classList.add('cleared');
      if (!check) {
        const svg = createCheckmarkSvg(true);
        card.appendChild(svg);
      }
    } else if (check) {
      check.remove();
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

function refreshUserData() {
  const nickname = localStorage.getItem('username') || '';
  loadClearedLevelsFromDb();
  if (nickname) {
    fetchOverallStats(nickname).then(res => {
      const overallRankEl = document.getElementById('overallRank');
      const clearedCountEl = document.getElementById('clearedCount');
      if (overallRankEl) overallRankEl.textContent = `#${res.rank}`;
      if (clearedCountEl) clearedCountEl.textContent = res.cleared;
    });
  }
  if (document.getElementById('overallRankingList')) {
    showOverallRanking();
  }
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
    return loadClearedLevelsFromDb();
  });
  initialTasks.push(stageDataPromise);
});

window.addEventListener('focus', refreshUserData);

function markLevelCleared(level) {
  if (!clearedLevelsFromDb.includes(level)) {
    clearedLevelsFromDb.push(level);
    refreshClearedUI();
    renderChapterList();
  }
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


async function renderChapterList() {
  await loadClearedLevelsFromDb();
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

async function renderStageList(stageList) {
  await loadClearedLevelsFromDb();
  stageListEl.innerHTML = "";
  stageList.forEach((level, idx) => {
    const card = document.createElement('div');
    card.className = 'stageCard card-enter';
    card.style.animationDelay = `${idx * 40}ms`;
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
        const check = createCheckmarkSvg();
        card.appendChild(check);
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
}


function adjustGridZoom(containerId = 'canvasContainer') {
  const gridContainer = document.getElementById(containerId);
  if (!gridContainer) return;

  const margin = 20;
  let availableWidth = window.innerWidth - margin * 2;
  let availableHeight = window.innerHeight - margin * 2;

  if (containerId === 'canvasContainer') {
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

  const firstCanvas = gridContainer.querySelector('canvas');
  if (!firstCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const baseWidth = firstCanvas.width / dpr;
  const baseHeight = firstCanvas.height / dpr;

  const scale = Math.min(
    availableWidth / baseWidth,
    availableHeight / baseHeight,
    1
  );

  gridContainer.querySelectorAll('canvas').forEach(c => {
    c.style.width = baseWidth * scale + 'px';
    c.style.height = baseHeight * scale + 'px';
    c.dataset.scale = scale;
  });
}


// Canvas 기반 그리드 설정
function setupGrid(containerId, rows, cols, paletteGroups) {
  GRID_COLS = cols;
  GRID_ROWS = rows;
  const container = document.getElementById(containerId);
  if (!container) return Promise.resolve();
  const prefix = containerId === 'problemCanvasContainer' ? 'problem' : '';
  const bgCanvas = document.getElementById(prefix ? `${prefix}BgCanvas` : 'bgCanvas');
  const contentCanvas = document.getElementById(prefix ? `${prefix}ContentCanvas` : 'contentCanvas');
  const overlayCanvas = document.getElementById(prefix ? `${prefix}OverlayCanvas` : 'overlayCanvas');

  return import('./src/canvas/model.js').then(m => {
    const { makeCircuit } = m;
    return import('./src/canvas/controller.js').then(c => {
      const { createController } = c;
      const circuit = makeCircuit(rows, cols);
      const controller = createController(
        { bgCanvas, contentCanvas, overlayCanvas },
        circuit,
        {
          wireStatusInfo: document.getElementById(
            prefix ? `${prefix}WireStatusInfo` : 'wireStatusInfo'
          ),
          wireDeleteInfo: document.getElementById(
            prefix ? `${prefix}WireDeleteInfo` : 'wireDeleteInfo'
          ),
          usedBlocksEl: document.getElementById(
            prefix ? `${prefix}UsedBlocks` : 'usedBlocks'
          ),
          usedWiresEl: document.getElementById(
            prefix ? `${prefix}UsedWires` : 'usedWires'
          )
        },
        {
          paletteGroups,
          panelWidth: 180
        }
      );
      if (prefix) {
        window.problemCircuit = circuit;
        window.problemController = controller;
      } else {
        window.playCircuit = circuit;
        window.playController = controller;
      }
      // 새 그리드 크기에 맞춰 화면을 조정
      adjustGridZoom(containerId);
      return controller;
    });
  });
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
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
        done();
      }, 180);
    }
  };
  render();
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('show'));
}

// 5) ESC 키로 닫기
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && tutModal.style.display === "flex") {
    tutModal.style.display = "none";
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
      gradeProblemCanvas(currentCustomProblemKey, currentCustomProblem);
    } else {
      gradeLevelCanvas(currentLevel);
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

// Version tag for canvas-based circuit saves
const CURRENT_CIRCUIT_VERSION = 2;

// Google Drive file helpers
async function uploadFileToAppData(name, blob, mimeType) {
  await ensureDriveAuth();
  const token = gapi.client.getToken().access_token;
  const metadata = {
    name,
    parents: ['appDataFolder'],
    mimeType
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);
  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: new Headers({ 'Authorization': 'Bearer ' + token }),
    body: form
  });
}

async function downloadFileFromAppData(name) {
  await ensureDriveAuth();
  const list = await gapi.client.drive.files.list({
    spaces: 'appDataFolder',
    fields: 'files(id, name)',
    q: `name='${name}'`
  });
  const file = list.result.files[0];
  if (!file) return null;
  const token = gapi.client.getToken().access_token;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: new Headers({ 'Authorization': 'Bearer ' + token })
  });
  return await res.blob();
}

async function deleteFileFromAppData(name) {
  await ensureDriveAuth();
  const list = await gapi.client.drive.files.list({
    spaces: 'appDataFolder',
    fields: 'files(id, name)',
    q: `name='${name}'`
  });
  const file = list.result.files[0];
  if (file) await gapi.client.drive.files.delete({ fileId: file.id });
}

async function saveGifToDB(key, blob) {
  return uploadFileToAppData(`${key}.gif`, blob, 'image/gif');
}

async function loadGifFromDB(key) {
  return downloadFileFromAppData(`${key}.gif`);
}

async function deleteGifFromDB(key) {
  return deleteFileFromAppData(`${key}.gif`);
}

saveCircuitBtn.addEventListener('click', async () => {
  try {
    await ensureDriveAuth();
  } catch (e) {
    alert(e.message);
    return;
  }
  let saveSuccess = false;
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
  if (saveSuccess) alert(t('circuitSaved'));
});

// 2) 저장된 회로 키 prefix 계산
function getSavePrefix() {
  if (currentLevel != null) {
    return `bit_saved_stage_${String(currentLevel).padStart(2, '0')}_`;
  } else if (currentCustomProblemKey) {
    return `bit_saved_prob_${currentCustomProblemKey}_`;
  }
  return 'bit_saved_';
}

async function listCircuitJsonFiles() {
  await ensureDriveAuth();
  const res = await gapi.client.drive.files.list({
    spaces: 'appDataFolder',
    fields: 'files(id, name, createdTime)',
    q: "name contains '.json'"
  });
  return res.result.files || [];
}

// 3) 리스트 그리기
async function renderSavedList() {
  const savedList = document.getElementById('savedList');
  savedList.innerHTML = `<p>${t('loadingText')}</p>`;
  try {
    await ensureDriveAuth();
  } catch (e) {
    savedList.innerHTML = `<p>${t('loginRequired')}</p>`;
    return;
  }
  const prefix = getSavePrefix();
  const files = (await listCircuitJsonFiles())
    .filter(f => f.name.startsWith(prefix))
    .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  if (!files.length) {
    savedList.innerHTML = `<p>${t('noCircuits')}</p>`;
    return;
  }
  const items = await Promise.all(files.map(async file => {
    const key = file.name.replace('.json', '');
    const [blob, gifBlob] = await Promise.all([
      downloadFileFromAppData(file.name),
      loadGifFromDB(key)
    ]);
    const text = await blob.text();
    const data = JSON.parse(text);
    const item = document.createElement('div');
    item.className = 'saved-item';
    const label = data.stageId != null
      ? `Stage ${String(data.stageId).padStart(2, '0')}`
      : `Problem ${data.problemTitle || data.problemKey}`;

    const img = document.createElement('img');
    if (gifBlob) img.src = URL.createObjectURL(gifBlob);
    img.alt = label;
    item.appendChild(img);

    const cap = document.createElement('div');
    cap.className = 'saved-caption';
    cap.textContent = `${label} — ${new Date(data.timestamp).toLocaleString()}`;
    item.appendChild(cap);

    item.addEventListener('click', () => {
      applyCircuitData(data, key);
      document.getElementById('savedModal').style.display = 'none';
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = t('deleteBtn');
    delBtn.className = 'deleteBtn';
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(t('confirmDelete'))) return;
      await deleteFileFromAppData(`${key}.json`);
      await deleteGifFromDB(key);
      renderSavedList();
    });
    item.appendChild(delBtn);

    return item;
  }));
  savedList.innerHTML = '';
  items.forEach(item => savedList.appendChild(item));
}

// 4) 모달 열기/닫기
document.getElementById('viewSavedBtn')
  .addEventListener('click', () => {
    document.getElementById('savedModal').style.display = 'flex';
    renderSavedList();
  });
document.getElementById('closeSavedModal')
  .addEventListener('click', () => {
    document.getElementById('savedModal').style.display = 'none';
  });

// 5) 회로 불러오는 함수
async function loadCircuit(key) {
  try {
    await ensureDriveAuth();
  } catch (e) {
    alert(t('loginRequired'));
    return;
  }
  const blob = await downloadFileFromAppData(`${key}.json`);
  if (!blob) return alert(t('loadFailedNoData'));
  const text = await blob.text();
  const data = JSON.parse(text);
  applyCircuitData(data, key);
}

function applyCircuitData(data, key) {
  if (data.version !== CURRENT_CIRCUIT_VERSION || !data.circuit) {
    alert(t('incompatibleCircuit'));
    return;
  }
  const circuit = window.playCircuit || window.problemCircuit;
  if (!circuit) return;
  circuit.rows = data.circuit.rows;
  circuit.cols = data.circuit.cols;
  circuit.blocks = data.circuit.blocks || {};
  circuit.wires = data.circuit.wires || {};
  markCircuitModified();
  const controller = window.playController || window.problemController;
  controller?.syncPaletteWithCircuit?.();
  controller?.clearSelection?.();
  if (key) lastSavedKey = key;
}


async function saveCircuit(progressCallback) {
  const circuit = window.playCircuit || window.problemCircuit;
  if (!circuit) throw new Error('No circuit to save');

  await ensureDriveAuth();

  const wireCells = new Set();
  Object.values(circuit.wires).forEach(w => {
    w.path.slice(1, -1).forEach(p => wireCells.add(`${p.r},${p.c}`));
  });

  const data = {
    version: CURRENT_CIRCUIT_VERSION,
    stageId: currentLevel,
    problemKey: currentCustomProblemKey,
    problemTitle: currentCustomProblem ? currentCustomProblem.title : undefined,
    timestamp: new Date().toISOString(),
    circuit,
    usedBlocks: Object.keys(circuit.blocks).length,
    usedWires: wireCells.size
  };

  const timestampMs = Date.now();
  const key = `${getSavePrefix()}${timestampMs}`;
  try {
    progressCallback && progressCallback(0);
    const jsonBlob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    await uploadFileToAppData(`${key}.json`, jsonBlob, 'application/json');
    progressCallback && progressCallback(33);

    // capture GIF and store in Drive
    const blob = await new Promise(resolve => captureGIF(resolve));
    progressCallback && progressCallback(66);
    await saveGifToDB(key, blob);
    progressCallback && progressCallback(100);

    console.log(`Circuit saved: ${key}`, data);
    lastSavedKey = key;
    return key;
  } catch (e) {
    console.error('Circuit save failed:', e);
    alert('회로 저장 중 오류가 발생했습니다.');
    throw e;
  }
}
// 이전: clearGrid 미정의
function clearGrid() {
  // Canvas 기반 회로 초기화
  if (window.playCircuit) {
    window.playCircuit.blocks = {};
    window.playCircuit.wires = {};
  }
  if (window.problemCircuit) {
    window.problemCircuit.blocks = {};
    window.problemCircuit.wires = {};
  }
  wires = [];
  markCircuitModified();
  window.playController?.clearSelection?.();
  window.problemController?.clearSelection?.();
}

function clearWires() {
  if (window.playCircuit) {
    window.playCircuit.wires = {};
  }
  if (window.problemCircuit) {
    window.problemCircuit.wires = {};
  }
  markCircuitModified();
  window.playController?.clearSelection?.();
  window.problemController?.clearSelection?.();
}

  function markCircuitModified() {
    problemOutputsValid = false;
    window.playController?.syncPaletteWithCircuit?.();
    window.problemController?.syncPaletteWithCircuit?.();
  }


function moveCircuit(dx, dy) {
  const controller = window.problemController || window.playController;
  if (!controller) return;
  const hasSelection = controller.state?.selection;
  let moved = false;
  if (hasSelection) {
    moved = controller.moveSelection?.(dy, dx);
  } else {
    if (controller === window.problemController && currentCustomProblem?.fixIO) return;
    moved = controller.moveCircuit(dx, dy);
  }
  if (moved) {
    markCircuitModified();
  }
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

async function showClearedModal(level) {
  await loadClearedLevelsFromDb();
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

function getCurrentController() {
  const problemScreen = document.getElementById("problem-screen");
  if (problemScreen && problemScreen.style.display !== "none") {
    return window.problemController;
  }
  return window.playController;
}
const createProblemBtn         = document.getElementById('createProblemBtn');
const problemScreen            = document.getElementById('problem-screen');
const backToMainFromProblem    = document.getElementById('backToMainFromProblem');
const saveProblemBtn           = document.getElementById('saveProblemBtn');
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
  window.problemController?.destroy?.();
  window.problemController = null;
  window.problemCircuit = null;
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
  setupGrid('problemCanvasContainer', rows, cols, createPaletteForProblem());
  setGridDimensions(rows, cols);
  clearGrid();
  clearWires();
  initTestcaseTable();
  markCircuitModified();
  adjustGridZoom('problemCanvasContainer');
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
if (problemModalBackdrop) problemModalBackdrop.addEventListener('click', () => {
  problemSaveModal.style.display = 'none';
});
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
  setupGrid('problemCanvasContainer', rows, cols, createPaletteForProblem());
  clearGrid();
  setGridDimensions(rows, cols);
  initTestcaseTable();
  markCircuitModified();
  adjustGridZoom('problemCanvasContainer');
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


// ----- 사용자 정의 문제 저장/불러오기 -----
function getProblemGridData() {
  const circuit = window.problemCircuit;
  if (!circuit) return [];
  return Object.values(circuit.blocks).map(b => ({
    index: b.pos.r * GRID_COLS + b.pos.c,
    type: b.type || null,
    name: b.name || null,
    value: b.type === 'INPUT' ? (b.value ? '1' : '0') : null,
    classes: b.fixed ? ['fixed'] : []
  }));
}

function getProblemWireData() {
  const circuit = window.problemCircuit;
  if (!circuit) return [];
  const wires = [];
  Object.values(circuit.wires).forEach(w => {
    for (let i = 0; i < w.path.length - 1; i++) {
      const a = w.path[i];
      const b = w.path[i + 1];
      let dir = '';
      if (b.r > a.r) dir = 'down';
      else if (b.r < a.r) dir = 'up';
      else if (b.c > a.c) dir = 'right';
      else if (b.c < a.c) dir = 'left';
      wires.push({ x: a.c, y: a.r, dir });
    }
  });
  return wires;
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
  const circuit = window.problemCircuit;
  const wiresObj = circuit
    ? Object.values(circuit.wires).map(w => ({
        startIdx:
          circuit.blocks[w.startBlockId].pos.r * GRID_COLS +
          circuit.blocks[w.startBlockId].pos.c,
        endIdx:
          circuit.blocks[w.endBlockId].pos.r * GRID_COLS +
          circuit.blocks[w.endBlockId].pos.c,
        pathIdxs: w.path.map(p => p.r * GRID_COLS + p.c)
      }))
    : [];
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
    wiresObj,
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

function placeFixedIO(problem) {
  window.playController?.placeFixedIO?.(problem);
}

async function startCustomProblem(key, problem) {
  wires = [];
  currentCustomProblem = problem;
  currentCustomProblemKey = key;
  currentLevel = null;
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
  collapseMenuBarForMobile();
}


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
  const testCases = levelAnswers[level];
  const circuit = window.playCircuit;
  if (!testCases || !circuit) return;
  const { evaluateCircuit } = await import('./src/canvas/engine.js');

  const blocks = Object.values(circuit.blocks);
  for (const b of blocks) {
    if (b.type === 'JUNCTION' || b.type === 'OUTPUT') {
      const incoming = Object.values(circuit.wires).filter(w => w.endBlockId === b.id);
      if (incoming.length > 1) {
        alert(`❌ ${b.type} 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.`);
        if (overlay) overlay.style.display = 'none';
        isScoring = false;
        return;
      }
    }
  }

  const requiredOutputs = (levelBlockSets[level] || [])
    .filter(b => b.type === 'OUTPUT')
    .map(b => b.name);
  const actualOutputNames = blocks.filter(b => b.type === 'OUTPUT').map(b => b.name);
  const missingOutputs = requiredOutputs.filter(n => !actualOutputNames.includes(n));
  if (missingOutputs.length > 0) {
    alert(t('outputMissingAlert').replace('{list}', missingOutputs.join(', ')));
    if (overlay) overlay.style.display = 'none';
    isScoring = false;
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
    const autoSave = localStorage.getItem('autoSaveCircuit') !== 'false';
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
    const hintsUsed = parseInt(localStorage.getItem(`hintsUsed_${level}`) || '0');
    const nickname = localStorage.getItem('username') || '익명';
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
  const circuit = window.playCircuit;
  if (!circuit) return;
  const inNames = Array.from({ length: problem.inputCount }, (_, i) => 'IN' + (i + 1));
  const outNames = Array.from({ length: problem.outputCount }, (_, i) => 'OUT' + (i + 1));
  const testCases = problem.table.map(row => ({
    inputs: Object.fromEntries(inNames.map(n => [n, row[n]])),
    expected: Object.fromEntries(outNames.map(n => [n, row[n]]))
  }));
  const { evaluateCircuit } = await import('./src/canvas/engine.js');

  const blocks = Object.values(circuit.blocks);
  for (const b of blocks) {
    if (b.type === 'JUNCTION' || b.type === 'OUTPUT') {
      const incoming = Object.values(circuit.wires).filter(w => w.endBlockId === b.id);
      if (incoming.length > 1) {
        alert(`❌ ${b.type} 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.`);
        if (overlay) overlay.style.display = 'none';
        isScoring = false;
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
    const hintsUsed = parseInt(localStorage.getItem(`hintsUsed_${key}`) || '0');
    saveProblemRanking(key, blockCounts, usedWires, hintsUsed);
  }

  const returnBtn = document.createElement('button');
  returnBtn.id = 'returnToEditBtn';
  returnBtn.textContent = t('returnToEditBtn');
  gradingArea.appendChild(returnBtn);
  document.getElementById('returnToEditBtn').addEventListener('click', returnToEditScreen);
}

// ----- GIF 캡처 기능 -----

async function captureGIF(onFinish) {
  const bgCanvas = document.getElementById('bgCanvas');
  const contentCanvas = document.getElementById('contentCanvas');
  if (!bgCanvas || !contentCanvas) return;

  const dpr = window.devicePixelRatio || 1;
  const totalWidth = bgCanvas.width / dpr;
  const totalHeight = bgCanvas.height / dpr;

  let gridWidth = totalWidth;
  let gridHeight = totalHeight;
  let panelWidth = 0;

  try {
    const { CELL, GAP } = await import('./src/canvas/model.js');
    const circuit = window.playController?.circuit || window.problemController?.circuit;
    if (circuit) {
      gridWidth = circuit.cols * (CELL + GAP) + GAP;
      gridHeight = circuit.rows * (CELL + GAP) + GAP;
      panelWidth = totalWidth - gridWidth;
    }
  } catch (_) {}

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = gridWidth;
  tempCanvas.height = gridHeight;
  const tempCtx = tempCanvas.getContext('2d');

  const gif = new GIF({ workers: 2, quality: 10, width: gridWidth, height: gridHeight });
  const totalFrames = 10;

  for (let f = 0; f < totalFrames; f++) {
    tempCtx.clearRect(0, 0, gridWidth, gridHeight);
    [bgCanvas, contentCanvas].forEach(c => {
      tempCtx.drawImage(
        c,
        panelWidth * dpr,
        0,
        gridWidth * dpr,
        gridHeight * dpr,
        0,
        0,
        gridWidth,
        gridHeight
      );
    });
    gif.addFrame(tempCanvas, { delay: 50, copy: true });
    await new Promise(r => setTimeout(r, 50));
  }

  gif.on('finished', blob => {
    if (typeof onFinish === 'function') onFinish(blob);
  });

  gif.render();
}

function handleGIFExport() {
  if (gifLoadingText) gifLoadingText.textContent = t('gifLoadingText');
  if (gifLoadingModal) gifLoadingModal.style.display = 'flex';
  captureGIF(blob => {
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

function buildPaletteGroups(blocks) {
  const inout = [];
  const gate = [];
  blocks.forEach(b => {
    const item = { type: b.type, label: b.name || (b.type === 'JUNCTION' ? 'JUNC' : b.type) };
    if (b.type === 'INPUT' || b.type === 'OUTPUT') inout.push(item);
    else gate.push(item);
  });
  const groups = [];
  if (inout.length) groups.push({ label: 'IN/OUT', items: inout });
  if (gate.length) groups.push({ label: 'GATE', items: gate });
  return groups;
}

function createPaletteForLevel(level) {
  const blocks = levelBlockSets[level] || [];
  return buildPaletteGroups(blocks);
}

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
  const circuit = window.problemCircuit;
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
  const { evaluateCircuit } = await import('./src/canvas/engine.js');
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
  problemOutputsValid = true;
}
