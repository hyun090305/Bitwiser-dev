import { setupGrid, setGridDimensions, destroyPlayContext } from './grid.js';
import { getUsername } from './storage.js';
import { fetchOverallStats } from './rank.js';
import { showStageMapScreen } from './navigation.js';

const translate =
  typeof window !== 'undefined' && typeof window.t === 'function'
    ? window.t
    : key => key;

const DEFAULT_GRID_SIZE = 6;

let levelTitles = {};
let levelGridSizes = {};
let levelBlockSets = {};
let chapterData = [];
let levelAnswers = {};
let levelDescriptions = {};
let levelHints = {};
let clearedLevelsFromDb = [];
let stageDataPromise = Promise.resolve();
let currentLevel = null;

const dependencies = {
  renderUserProblemList: null,
  showStageTutorial: null,
  showOverallRanking: null,
  setIsScoring: null,
  onLevelIntroComplete: null
};

export function configureLevelModule(options = {}) {
  Object.assign(dependencies, options);
}

export function getStageDataPromise() {
  return stageDataPromise;
}

export function getLevelTitles() {
  return levelTitles;
}

export function getLevelTitle(level) {
  return levelTitles[level];
}

export function getLevelGridSize(level) {
  return levelGridSizes[level];
}

export function getLevelBlockSet(level) {
  return levelBlockSets[level] || [];
}

export function getLevelBlockSets() {
  return levelBlockSets;
}

export function getLevelAnswer(level) {
  return levelAnswers[level];
}

export function getLevelAnswers() {
  return levelAnswers;
}

export function getLevelDescription(level) {
  return levelDescriptions[level];
}

export function getLevelDescriptions() {
  return levelDescriptions;
}

export function getLevelHints() {
  return levelHints;
}

export function getChapterData() {
  return chapterData;
}

export function getCurrentLevel() {
  return currentLevel;
}

export function clearCurrentLevel() {
  currentLevel = null;
}

export function getClearedLevels() {
  return clearedLevelsFromDb.slice();
}

export function loadStageData(currentLang) {
  const file = currentLang === 'en' ? 'levels_en.json' : 'levels.json';
  stageDataPromise = fetch(file)
    .then(res => res.json())
    .then(data => {
      levelTitles = data.levelTitles;
      levelGridSizes = data.levelGridSizes;
      levelBlockSets = data.levelBlockSets;
      chapterData = data.chapterData;
      levelAnswers = data.levelAnswers;
      levelDescriptions = data.levelDescriptions;
      levelHints = data.levelHints || {};
      return data;
    });
  return stageDataPromise;
}

export async function startLevel(level, { onIntroComplete } = {}) {
  await stageDataPromise;
  await loadClearedLevelsFromDb();
  const [rows, cols] = levelGridSizes[level] || [DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE];
  setGridDimensions(rows, cols);

  currentLevel = parseInt(level, 10);
  const title = document.getElementById('gameTitle');
  if (title) {
    title.textContent = levelTitles[level] ?? `Stage ${level}`;
  }

  const prevMenuBtn = document.getElementById('prevStageBtnMenu');
  if (prevMenuBtn) {
    prevMenuBtn.disabled = !(levelTitles[level - 1] && isLevelUnlocked(level - 1));
  }
  const nextMenuBtn = document.getElementById('nextStageBtnMenu');
  if (nextMenuBtn) {
    nextMenuBtn.disabled = !(levelTitles[level + 1] && isLevelUnlocked(level + 1));
  }

  await setupGrid(
    'canvasContainer',
    rows,
    cols,
    createPaletteForLevel(level),
    { enableCopyPaste: level >= 7 }
  );

  showLevelIntro(level, () => {
    if (typeof onIntroComplete === 'function') {
      onIntroComplete();
    } else if (typeof dependencies.onLevelIntroComplete === 'function') {
      dependencies.onLevelIntroComplete();
    }
  });
}

export function returnToEditScreen() {
  if (typeof dependencies.setIsScoring === 'function') {
    dependencies.setIsScoring(false);
  } else {
    window.isScoring = false;
  }
  const overlay = document.getElementById('gridOverlay');
  if (overlay) overlay.style.display = 'none';

  const rightPanel = document.getElementById('rightPanel');
  const gradingArea = document.getElementById('gradingArea');
  if (rightPanel) rightPanel.style.display = 'block';
  if (gradingArea) gradingArea.style.display = 'none';
}

export function markLevelCleared(level) {
  if (!clearedLevelsFromDb.includes(level)) {
    clearedLevelsFromDb.push(level);
    refreshClearedUI();
  }
}

export async function returnToLevels({
  isCustomProblemActive = false,
  onClearCustomProblem
} = {}) {
  destroyPlayContext();
  document.body.classList.remove('game-active');

  const gameScreen = document.getElementById('gameScreen');
  if (gameScreen) {
    gameScreen.style.display = 'none';
  }

  if (isCustomProblemActive) {
    if (typeof onClearCustomProblem === 'function') {
      onClearCustomProblem();
    }
    const userProblemsScreen = document.getElementById('user-problems-screen');
    if (userProblemsScreen) {
      userProblemsScreen.style.display = 'block';
    }
    if (typeof dependencies.renderUserProblemList === 'function') {
      dependencies.renderUserProblemList();
    }
    return;
  }

  if (typeof showStageMapScreen === 'function') {
    showStageMapScreen();
  } else {
    const stageMapScreen = document.getElementById('stageMapScreen');
    if (stageMapScreen) {
      stageMapScreen.style.display = 'flex';
      stageMapScreen.setAttribute('aria-hidden', 'false');
    }
  }
  document.dispatchEvent(new Event('stageMap:closePanels'));
  document.dispatchEvent(new CustomEvent('stageMap:progressUpdated'));
}


export function refreshUserData() {
  const nickname = getUsername() || '';
  loadClearedLevelsFromDb();
  if (nickname) {
    fetchOverallStats(nickname).then(res => {
      const overallRankEl = document.getElementById('overallRank');
      const clearedCountEl = document.getElementById('clearedCount');
      if (overallRankEl) overallRankEl.textContent = `#${res.rank}`;
      if (clearedCountEl) clearedCountEl.textContent = res.cleared;
    });
  }
  if (document.getElementById('overallRankingList') && typeof dependencies.showOverallRanking === 'function') {
    dependencies.showOverallRanking();
  }
}

export function loadClearedLevelsFromDb() {
  const nickname = getUsername() || '익명';
  return fetchClearedLevels(nickname).then(levels => {
    clearedLevelsFromDb = levels;
    refreshClearedUI();
    return levels;
  });
}

export function fetchClearedLevels(nickname) {
  return db.ref('rankings').once('value').then(snap => {
    const cleared = [];
    snap.forEach(levelSnap => {
      const levelId = parseInt(levelSnap.key, 10);
      let hasRecord = false;
      levelSnap.forEach(recSnap => {
        if (recSnap.val().nickname === nickname) {
          hasRecord = true;
          return true;
        }
      });
      if (hasRecord) cleared.push(levelId);
    });
    return cleared;
  });
}

export function isLevelUnlocked(level) {
  const cleared = clearedLevelsFromDb;
  for (let idx = 0; idx < chapterData.length; idx++) {
    const chap = chapterData[idx];
    if (chap.stages.includes(level)) {
      if (idx === 0) return true;
      return chapterData[idx - 1].stages.every(s => cleared.includes(s));
    }
  }
  return true;
}

export function showIntroModal(level) {
  const modal = document.getElementById('levelIntroModal');
  const title = document.getElementById('introTitle');
  const desc = document.getElementById('introDesc');
  const table = document.getElementById('truthTable');

  const data = levelDescriptions[level];
  if (!data) return;

  title.textContent = data.title;
  desc.textContent = data.desc;

  const keys = Object.keys(data.table[0]);
  table.innerHTML = '';

  const headerRow = document.createElement('tr');
  keys.forEach(k => {
    const th = document.createElement('th');
    th.textContent = k;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  data.table.forEach(row => {
    const tr = document.createElement('tr');
    keys.forEach(k => {
      const td = document.createElement('td');
      td.textContent = row[k];
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  modal.style.display = 'flex';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
}

function showLevelIntro(level, callback) {
  const modal = document.getElementById('levelIntroModal');
  const title = document.getElementById('introTitle');
  const desc = document.getElementById('introDesc');
  const table = document.getElementById('truthTable');

  const data = levelDescriptions[level];
  if (!data) {
    callback();
    return;
  }

  title.textContent = data.title;
  desc.textContent = data.desc;

  const keys = Object.keys(data.table[0]);
  table.innerHTML = '';

  const headerRow = document.createElement('tr');
  keys.forEach(k => {
    const th = document.createElement('th');
    th.textContent = k;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  data.table.forEach(row => {
    const tr = document.createElement('tr');
    keys.forEach(k => {
      const td = document.createElement('td');
      td.textContent = row[k];
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  modal.style.display = 'flex';
  modal.style.backgroundColor = 'white';
  const startBtn = document.getElementById('startLevelBtn');
  if (startBtn) {
    startBtn.onclick = () => {
      modal.style.display = 'none';
      if (typeof dependencies.showStageTutorial === 'function') {
        dependencies.showStageTutorial(level, callback);
      } else {
        callback();
      }
    };
  }
}

export function buildPaletteGroups(blocks) {
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

function refreshClearedUI() {
  document.dispatchEvent(new CustomEvent('stageMap:progressUpdated'));
}

function createPaletteForLevel(level) {
  const blocks = levelBlockSets[level] || [];
  return buildPaletteGroups(blocks);
}
