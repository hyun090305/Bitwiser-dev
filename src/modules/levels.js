import { setupGrid, setGridDimensions, destroyPlayContext } from './grid.js';
import { getUsername } from './storage.js';

const DEFAULT_GRID_SIZE = 6;

let levelTitles = {};
let levelGridSizes = {};
let levelBlockSets = {};
let chapterData = [];
let selectedChapterIndex = 0;
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

export function getSelectedChapterIndex() {
  return selectedChapterIndex;
}

export function setSelectedChapterIndex(index) {
  selectedChapterIndex = index;
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

  await setupGrid('canvasContainer', rows, cols, createPaletteForLevel(level));

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

  const blockPanel = document.getElementById('blockPanel');
  const rightPanel = document.getElementById('rightPanel');
  const gradingArea = document.getElementById('gradingArea');
  if (blockPanel) blockPanel.style.display = 'flex';
  if (rightPanel) rightPanel.style.display = 'block';
  if (gradingArea) gradingArea.style.display = 'none';
}

export function markLevelCleared(level) {
  if (!clearedLevelsFromDb.includes(level)) {
    clearedLevelsFromDb.push(level);
    refreshClearedUI();
    renderChapterList();
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

  await renderChapterList();
  const chapter = chapterData[selectedChapterIndex];
  if (chapter && chapter.id !== 'user') {
    await renderStageList(chapter.stages);
  }
  const chapterStageScreen = document.getElementById('chapterStageScreen');
  if (chapterStageScreen) {
    chapterStageScreen.style.display = 'block';
  }
}

export async function renderChapterList() {
  await loadClearedLevelsFromDb();
  const chapterListEl = document.getElementById('chapterList');
  if (!chapterListEl) return;
  chapterListEl.innerHTML = '';
  const cleared = clearedLevelsFromDb;

  chapterData.forEach((chapter, idx) => {
    const item = document.createElement('div');
    item.className = 'chapterItem';
    let unlocked = true;
    if (chapter.id === 'user') {
      unlocked = [1, 2, 3, 4, 5, 6].every(s => cleared.includes(s));
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
          const chapterStageScreen = document.getElementById('chapterStageScreen');
          const userProblemsScreen = document.getElementById('user-problems-screen');
          if (chapterStageScreen) chapterStageScreen.style.display = 'none';
          if (userProblemsScreen) userProblemsScreen.style.display = 'block';
          if (typeof dependencies.renderUserProblemList === 'function') {
            dependencies.renderUserProblemList();
          }
        } else {
          selectChapter(idx);
        }
      };
    }
    if (idx === selectedChapterIndex) item.classList.add('selected');
    chapterListEl.appendChild(item);
  });
}

export function selectChapter(idx) {
  selectedChapterIndex = idx;
  renderChapterList();
  const chapter = chapterData[idx];
  if (chapter && chapter.id !== 'user') {
    renderStageList(chapter.stages);
  }
}

export async function renderStageList(stageList) {
  await loadClearedLevelsFromDb();
  const stageListEl = document.getElementById('stageList');
  if (!stageListEl) return;
  stageListEl.innerHTML = '';
  stageList.forEach((level, idx) => {
    const card = document.createElement('div');
    card.className = 'stageCard card-enter';
    card.style.animationDelay = `${idx * 40}ms`;
    card.dataset.stage = level;
    const title = levelTitles[level] ?? `Stage ${level}`;
    let name = title;
    let desc = '';
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
      card.onclick = async () => {
        returnToEditScreen();
        await startLevel(level);
        const chapterStageScreen = document.getElementById('chapterStageScreen');
        const gameScreen = document.getElementById('gameScreen');
        if (chapterStageScreen) chapterStageScreen.style.display = 'none';
        if (gameScreen) gameScreen.style.display = 'flex';
        document.body.classList.add('game-active');
      };
    }
    stageListEl.appendChild(card);
  });
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

export function fetchProgressSummary(nickname) {
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
          return true;
        }
      });
    });
    return { cleared, blocks, wires };
  });
}

export function fetchOverallStats(nickname) {
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
    const entries = Object.entries(data).map(([nicknameKey, v]) => ({
      nickname: nicknameKey,
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

function createPaletteForLevel(level) {
  const blocks = levelBlockSets[level] || [];
  return buildPaletteGroups(blocks);
}
