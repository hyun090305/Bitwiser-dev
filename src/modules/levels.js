import { validateStarThresholds } from './circuitCost.js';
import { setupGrid, setGridDimensions, destroyPlayContext, getPlayController } from './grid.js';
import { getUsername, setLastAccessedLevel, getStageAccessRecord, setStageAccessRecord } from './storage.js';

import { showStageMapScreen, hideGameScreen } from './navigation.js';
import { playStageIntroSound, setBgmMode } from './bgm.js';
import { canPlayStage, chapterForStage, preserveStageAccess } from './stageCatalog.js';

const translate =
  typeof window !== 'undefined' && typeof window.t === 'function'
    ? window.t
    : key => key;

const DEFAULT_GRID_SIZE = 6;

let loadedStageData = null;
export const getLoadedStageData = () => loadedStageData;
export const getLevelStarThresholds = id => loadedStageData?.levelStarThresholds?.[id];

let levelTitles = {};
let levelGridSizes = {};
let levelBlockSets = {};
let levelAnswers = {};
let levelDescriptions = {};
let levelHints = {};
let levelFixedIO = {};
let clearedLevelsFromDb = [];
let stageAccess = {};
let stageAccessOwner = null;
let stageDataPromise = Promise.resolve();
let currentLevel = null;

const dependencies = {
  showOverallRanking: null,
  setIsScoring: null,
  onLevelIntroComplete: null,
  progressProvider: null,
  canStartLevel: null,
  accessProvider: null,
  copyPasteEnabled: null,
  onGridReady: null,
  beforeLeave: null
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

export function getLevelFixedIO(level) {
  if (typeof level === 'undefined') {
    return levelFixedIO;
  }
  return levelFixedIO[level];
}

export function getCurrentLevel() {
  return currentLevel;
}

export function clearCurrentLevel() {
  if (dependencies.progressProvider) currentLevel = null;
}

export function getClearedLevels() {
  return clearedLevelsFromDb.slice();
}

export function loadStageData(currentLang) {
  const file = currentLang === 'en' ? 'levels_en.json' : 'levels.json';
  stageDataPromise = fetch(file)
    .then(res => res.json())
    .then(data => {
      loadedStageData = data;
      for (const id of Object.keys(data.levelTitles).filter(id => id !== '0')) {
        const validation = validateStarThresholds(data.levelStarThresholds?.[id]);
        if (validation.status === 'invalid') console.error(`Stage ${id}: ${validation.message}`);
      }
      levelTitles = data.levelTitles;
      levelGridSizes = data.levelGridSizes;
      levelBlockSets = data.levelBlockSets;
      levelAnswers = data.levelAnswers;
      levelDescriptions = data.levelDescriptions;
      levelHints = data.levelHints || {};
      levelFixedIO = data.levelFixedIO || {};
      return data;
    });
  return stageDataPromise;
}

export async function startLevel(level, { onIntroComplete } = {}) {
  await stageDataPromise;
  await loadClearedLevelsFromDb();
  if (!isLevelUnlocked(Number(level))) throw new Error('Stage unavailable');
  await dependencies.beforeLeave?.();
  const [rows, cols] = levelGridSizes[level] || [DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE];
  setGridDimensions(rows, cols);
  const fixedIOConfig = levelFixedIO[level];
  const hasFixedIO = Boolean(fixedIOConfig?.fixIO);

  currentLevel = parseInt(level, 10);
  if (!dependencies.progressProvider) setLastAccessedLevel(currentLevel);
  const title = document.getElementById('gameTitle');
  if (title) {
    const localizedUntitled = translate('stageUntitled');
    const fallbackTitle = localizedUntitled !== 'stageUntitled' ? localizedUntitled : 'Untitled stage';
    title.textContent = levelTitles[level] ?? fallbackTitle;
  }
  const gradingInlineStatus = document.getElementById('gradingInlineStatus');
  if (gradingInlineStatus) {
    gradingInlineStatus.hidden = true;
  }
  const gradeButton = document.getElementById('gradeButton');
  if (gradeButton) {
    gradeButton.style.display = '';
  }

  // 이전/다음 스테이지 버튼이 제거되어 관련 UI 조정 로직을 삭제함

  await setupGrid(
    'canvasContainer',
    rows,
    cols,
    createPaletteForLevel(level),
    {
      enableCopyPaste: dependencies.copyPasteEnabled ? dependencies.copyPasteEnabled(Number(level)) : level >= 7,
      forceHideInOut: hasFixedIO
    }
  );

  if (hasFixedIO) {
    getPlayController()?.placeFixedIO?.(fixedIOConfig);
  }

  await dependencies.onGridReady?.(Number(level), getPlayController());
  document.dispatchEvent(new Event('bitwiser:stageReady'));
  showLevelIntro(level, () => {
    if (typeof onIntroComplete === 'function') {
      onIntroComplete();
    }
    if (typeof dependencies.onLevelIntroComplete === 'function') {
      dependencies.onLevelIntroComplete();
    }
  });
}

export function returnToEditScreen() {
  document.dispatchEvent(new Event('bitwiser:editCircuit'));
  if (typeof dependencies.setIsScoring === 'function') {
    dependencies.setIsScoring(false);
  } else {
    window.isScoring = false;
  }
  const overlay = document.getElementById('gridOverlay');
  if (overlay) overlay.style.display = 'none';

  const rightPanel = document.getElementById('rightPanel');
  if (rightPanel) rightPanel.style.display = '';
  const gradingInlineStatus = document.getElementById('gradingInlineStatus');
  if (gradingInlineStatus) gradingInlineStatus.hidden = true;
  const gradeButton = document.getElementById('gradeButton');
  if (gradeButton) gradeButton.style.display = '';
}

export function markLevelCleared(level) {
  if (!clearedLevelsFromDb.includes(level)) {
    clearedLevelsFromDb.push(level);
    updateStageAccess();
    refreshClearedUI();
    return {
      wasNew: true,
      clearedCount: clearedLevelsFromDb.filter(id => id !== 0).length
    };
  }
  return {
    wasNew: false,
    clearedCount: clearedLevelsFromDb.filter(id => id !== 0).length
  };
}

export async function returnToLevels({
  isCustomProblemActive = false,
  onClearCustomProblem
} = {}) {
  await dependencies.beforeLeave?.();
  destroyPlayContext();
  currentLevel = null;
  hideGameScreen();

  if (isCustomProblemActive) {
    if (typeof onClearCustomProblem === 'function') {
      onClearCustomProblem();
    }
  }

  if (typeof showStageMapScreen === 'function') {
    showStageMapScreen();
    document.dispatchEvent(new Event('stageMap:shown'));
  } else {
    const stageMapScreen = document.getElementById('stageMapScreen');
    if (stageMapScreen) {
      stageMapScreen.style.display = 'flex';
      stageMapScreen.setAttribute('aria-hidden', 'false');
    }
  }
  // Ensure layout has updated and canvas sizes are recalculated by
  // dispatching a resize on the next animation frame. This prevents the
  // stage map canvas from being initialized with a tiny bounding rect
  // when returning from the game screen.
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resize'));
  }
  document.dispatchEvent(new Event('stageMap:closePanels'));
  document.dispatchEvent(new CustomEvent('stageMap:progressUpdated'));
}


export function refreshUserData() {
  if (dependencies.progressProvider) return loadClearedLevelsFromDb();
  const nickname = getUsername() || '';
  loadClearedLevelsFromDb();
  if (nickname) {
    import('./rank.js').then(m => m.fetchOverallStats(nickname)).then(res => {
      const overallRankEl = document.getElementById('overallRank');
      const clearedCountEl = document.getElementById('clearedCount');
      if (overallRankEl) overallRankEl.textContent = `#${res.rank}`;
      if (clearedCountEl) clearedCountEl.textContent = res.cleared;
    }).catch(error => {
      console.warn('Overall rank unavailable', error);
      const rank = document.getElementById('overallRank'), count = document.getElementById('clearedCount');
      if (rank) rank.textContent = '—';
      if (count) count.textContent = clearedLevelsFromDb.filter(id => id !== 0).length;
    });
  }
  if (document.getElementById('overallRankingList') && typeof dependencies.showOverallRanking === 'function') {
    dependencies.showOverallRanking();
  }
}

export function loadClearedLevelsFromDb() {
  if (dependencies.progressProvider) {
    clearedLevelsFromDb = dependencies.progressProvider();
    refreshClearedUI();
    return Promise.resolve(clearedLevelsFromDb.slice());
  }
  const nickname = getUsername() || '익명';
  return Promise.allSettled([fetchClearedLevels(nickname), dependencies.remoteProgressProvider?.()]).then(([legacy, costs]) => {
    if (legacy.status === 'rejected') console.warn('Online progress unavailable; retaining known progress', legacy.reason);
    if (costs.status === 'rejected') console.warn('Online cost records unavailable; retaining local results', costs.reason);
    const online = legacy.status === 'fulfilled' ? legacy.value : clearedLevelsFromDb;
    clearedLevelsFromDb = [...new Set([...online, ...(dependencies.localProgressProvider?.() || [])])];
    updateStageAccess();
    refreshClearedUI();
    return clearedLevelsFromDb.slice();
  }).catch(error => {
    console.warn('Online progress unavailable; retaining known progress', error);
    clearedLevelsFromDb = [...new Set([...clearedLevelsFromDb, ...(dependencies.localProgressProvider?.() || [])])];
    updateStageAccess(); refreshClearedUI(); return clearedLevelsFromDb.slice();
  });
}

export function fetchClearedLevels(nickname) {
  let timer;
  const online = typeof db !== 'undefined' && db?.ref ? db.ref('rankings').once('value') : Promise.reject(new Error('No database'));
  return Promise.race([online, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Progress connection timed out')), 4000); })]).finally(() => clearTimeout(timer)).then(snap => {
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
  if (!levelTitles[level] || !levelAnswers[level]) return false;
  return dependencies.canStartLevel ? Boolean(dependencies.canStartLevel(Number(level)))
    : canPlayStage(Number(level), clearedLevelsFromDb, getStageAccess());
}

export function getStageAccess() {
  return dependencies.accessProvider?.() || (dependencies.progressProvider ? {} : stageAccess);
}

function updateStageAccess() {
  if (dependencies.progressProvider) return;
  const owner = getUsername() || '익명';
  const previous = stageAccessOwner === owner ? stageAccess : getStageAccessRecord();
  stageAccess = preserveStageAccess(clearedLevelsFromDb, previous || {}, { legacy: !previous || (previous.catalogVersion || 1) < 3 });
  stageAccessOwner = owner;
  setStageAccessRecord(stageAccess);
}

function getStageCode(level) {
  if (Number.isInteger(level)) {
    return `STAGE ${String(level).padStart(2, '0')}`;
  }
  return 'STAGE --';
}

function buildMissionBrief(title, desc) {
  const safeTitle = (title || 'UNKNOWN').toString().trim() || 'UNKNOWN';
  const source = (desc || '').toString().trim();
  if (source) {
    return source;
  }
  return `LOGIC NODE: ${safeTitle}의 출력 패턴을 복구하십시오.`;
}

function formatSignalLabel(signalName) {
  return (signalName || '').toString();
}

function getSignalGroupKey(signalLabel) {
  const raw = (signalLabel || '').toString();
  const match = raw.match(/[A-Za-z]/);
  if (match) return match[0].toUpperCase();
  return raw.charAt(0).toUpperCase();
}

function parseLogicRows(level, dataTable = []) {
  if (!Array.isArray(dataTable) || !dataTable.length) return [];
  const firstRow = dataTable[0];
  const rowKeys = Object.keys(firstRow);
  if (!rowKeys.length) return [];

  const blockSet = levelBlockSets[level] || [];
  const inputKeys = blockSet
    .filter(block => block.type === 'INPUT' && rowKeys.includes(block.name))
    .map(block => block.name);
  const outputKeys = blockSet
    .filter(block => block.type === 'OUTPUT' && rowKeys.includes(block.name))
    .map(block => block.name);

  const fallbackOutputKey = rowKeys[rowKeys.length - 1];
  const resolvedInputKeys = inputKeys.length ? inputKeys : rowKeys.slice(0, -1);
  const resolvedOutputKeys = outputKeys.length ? outputKeys : [fallbackOutputKey];

  return dataTable.map((row, index) => {
    const inputSignals = resolvedInputKeys.map(key => ({
      label: formatSignalLabel(key),
      value: `${row[key] ?? ''}`.trim()
    }));
    const outputSignals = resolvedOutputKeys.map(key => ({
      label: formatSignalLabel(key),
      value: `${row[key] ?? ''}`.trim()
    }));

    return {
      id: `case-${index}`,
      tick: row.tick,
      observation: row.observation,
      inputSignals,
      outputSignals
    };
  });
}

export function renderLogicCards(tableEl, rows) {
  tableEl.innerHTML = '';

  const createSignalGroup = (signals, sideClassName) => {
    const side = document.createElement('div');
    side.className = `level-intro-case__side ${sideClassName}`;

    if (!signals.length) {
      const empty = document.createElement('span');
      empty.className = 'level-intro-case__empty';
      empty.textContent = '-';
      side.appendChild(empty);
      return side;
    }

    signals.forEach(signal => {
      const bit = document.createElement('div');
      bit.className = 'level-intro-case__bit';
      if (signal.value === '1') {
        bit.classList.add('level-intro-case__bit--active');
      }
      const currentGroup = getSignalGroupKey(signal.label);
      const previousBit = side.lastElementChild;
      if (previousBit) {
        const previousGroup = previousBit.getAttribute('data-group-key') || '';
        if (previousGroup && previousGroup !== currentGroup) {
          bit.classList.add('level-intro-case__bit--group-start');
        }
      }
      bit.setAttribute('data-group-key', currentGroup);

      const label = document.createElement('span');
      label.className = 'level-intro-case__bit-label';
      label.textContent = signal.label;

      const value = document.createElement('span');
      value.className = 'level-intro-case__bit-value';
      value.textContent = signal.value || '-';

      bit.append(label, value);
      side.appendChild(bit);
    });

    return side;
  };

  rows.forEach((row, index) => {
    const card = document.createElement('article');
    card.className = 'level-intro-case';
    card.style.setProperty('--case-delay', `${index * 90}ms`);

    const lhs = createSignalGroup(row.inputSignals || [], 'level-intro-case__side--input');

    const arrow = document.createElement('span');
    arrow.className = 'level-intro-case__arrow';
    arrow.textContent = '→';

    const rhs = createSignalGroup(row.outputSignals || [], 'level-intro-case__side--output');

    if (row.tick != null) {
      const tick = document.createElement('span'); tick.className = 'level-intro-tick';
      const before = row.observation === 'before';
      tick.textContent = `tick ${row.tick}${before ? (window.currentLang === 'en' ? ' · before' : ' · 직전') : ''}`; card.append(tick);
    }
    card.append(lhs, arrow, rhs);
    tableEl.appendChild(card);
  });
}

function prepareIntroScreen(level, data) {
  const modal = document.getElementById('levelIntroModal');
  const title = document.getElementById('introTitle');
  const desc = document.getElementById('introDesc');
  const stageCode = document.getElementById('introStageCode');
  const logicDataLabel = document.getElementById('introLogicDataLabel');
  const table = document.getElementById('truthTable');
  const startBtn = document.getElementById('startLevelBtn');
  if (!modal || !title || !desc || !stageCode || !table || !startBtn) return null;

  const nodeTitle = `LOGIC NODE: ${(data.title || '').toString().trim()}`;
  title.textContent = nodeTitle;
  desc.textContent = buildMissionBrief(data.title, data.desc);
  const chapter = chapterForStage(Number(level));
  stageCode.textContent = `${chapter ? chapter.title.toUpperCase() + ' · ' : ''}${getStageCode(level)}`;
  if (logicDataLabel) {
    logicDataLabel.textContent = (translate('introLogicData') || 'LOGIC DATA').toString();
  }

  const rows = parseLogicRows(level, data.table);
  renderLogicCards(table, rows);
  startBtn.disabled = true;
  startBtn.textContent = translate('startLevelBtn');

  modal.style.display = 'flex';
  modal.classList.remove('level-intro-screen--active');
  void modal.offsetWidth;
  modal.classList.add('level-intro-screen--active');

  window.setTimeout(() => {
    startBtn.disabled = false;
  }, 520);

  return { modal, startBtn };
}

export function showIntroModal(level) {
  const data = levelDescriptions[level];
  if (!data) return;
  prepareIntroScreen(level, data);
}

function showLevelIntro(level, callback) {
  const data = levelDescriptions[level];
  if (!data) {
    callback();
    return;
  }
  const intro = prepareIntroScreen(level, data);
  if (!intro) {
    callback();
    return;
  }

  setBgmMode('ambient');
  playStageIntroSound();
  intro.startBtn.onclick = () => {
    intro.modal.style.display = 'none';
    intro.modal.classList.remove('level-intro-screen--active');
    setBgmMode('gameplay');
    callback();
  };
}

export function buildPaletteGroups(blocks) {
  const inout = [];
  const gate = [];
  blocks.forEach(b => {
    const item = { type: b.type, label: b.name || (b.type === 'JUNCTION' ? 'JUNC' : b.type), inputMode: b.inputMode };
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
