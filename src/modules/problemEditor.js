import {
  setupGrid,
  clearGrid,
  clearWires,
  markCircuitModified,
  adjustGridZoom,
  setGridDimensions,
  getGridCols,
  getGridDimensions,
  getProblemCircuit,
  getProblemController,
  onCircuitModified
} from './grid.js';
import { evaluateCircuit } from '../canvas/engine.js';
import { getUsername } from './storage.js';

let creationFlowConfig = null;
let startCustomProblemHandler = null;
let paletteGroupsBuilder = blocks => blocks;
let previousScreen = null;
let saveProblemButton = null;
let confirmSaveProblemButton = null;
let activeCustomProblem = null;
let activeCustomProblemKey = null;
let difficultyContainerEl = null;
let difficultyValueInputEl = null;
let difficultyValueLabelEl = null;
let difficultySelectorInitialized = false;
let currentDifficulty = 3;
const POPULAR_LIKE_THRESHOLD = 3;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
const DEFAULT_DIFFICULTY = 3;

const TRUTH_TABLE_MAX_INPUTS = 6;
const MAX_GRID_ROWS = 15;
const MAX_GRID_COLS = 15;
const DEFAULT_GRID_ROWS = 6;
const DEFAULT_GRID_COLS = 6;

let gridResizeControlsInitialized = false;
let detachProblemCircuitListener = null;
let cachedIOState = { inputs: [], outputs: [] };

function createDefaultDifficultySelection() {
  const selection = {};
  for (let level = MIN_DIFFICULTY; level <= MAX_DIFFICULTY; level += 1) {
    selection[level] = true;
  }
  return selection;
}

function createDefaultUserProblemFilters() {
  return {
    sort: 'latest',
    searchRaw: '',
    searchText: '',
    searchCreator: '',
    onlyMine: false,
    onlyUnsolved: false,
    onlyPopular: false,
    difficultyLevels: createDefaultDifficultySelection()
  };
}

let userProblemFilterState = createDefaultUserProblemFilters();
let userProblemsDataCache = [];
let userProblemControlsInitialized = false;
let userProblemListRequestId = 0;
let userProblemListLoading = false;

function clamp(value, min, max, fallback) {
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function translate(key, fallback = '') {
  if (typeof t === 'function') {
    return t(key);
  }
  return fallback;
}

function parseIONumber(name, prefix) {
  if (typeof name !== 'string') return Number.NaN;
  const regex = new RegExp(`^${prefix}(\\d+)$`, 'i');
  const match = name.match(regex);
  if (!match) return Number.NaN;
  return Number.parseInt(match[1], 10);
}

function compareIONames(a, b, prefix) {
  const aNum = parseIONumber(a, prefix);
  const bNum = parseIONumber(b, prefix);
  const aValid = Number.isFinite(aNum);
  const bValid = Number.isFinite(bNum);
  if (aValid && bValid) return aNum - bNum;
  if (aValid) return -1;
  if (bValid) return 1;
  return a.localeCompare(b);
}

function normalizeIONames(names = [], prefix) {
  const validNames = (Array.isArray(names) ? names : []).filter(name =>
    typeof name === 'string' && name.startsWith(prefix)
  );
  const unique = Array.from(new Set(validNames));
  return unique.sort((a, b) => compareIONames(a, b, prefix));
}

function getCurrentIOState() {
  const circuit = getProblemCircuit();
  if (!circuit) {
    return { inputs: [], outputs: [] };
  }
  const blocks = Object.values(circuit.blocks || {});
  const inputs = normalizeIONames(
    blocks.filter(block => block.type === 'INPUT').map(block => block.name),
    'IN'
  );
  const outputs = normalizeIONames(
    blocks.filter(block => block.type === 'OUTPUT').map(block => block.name),
    'OUT'
  );
  return { inputs, outputs };
}

function getNextAvailableName(prefix, usedNames = []) {
  const numbers = new Set();
  let maxNumber = 0;

  (Array.isArray(usedNames) ? usedNames : []).forEach(name => {
    if (typeof name !== 'string' || !name.startsWith(prefix)) return;
    const parsed = Number.parseInt(name.slice(prefix.length), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    numbers.add(parsed);
    if (parsed > maxNumber) {
      maxNumber = parsed;
    }
  });

  for (let i = 1; i <= maxNumber; i += 1) {
    if (!numbers.has(i)) {
      return `${prefix}${i}`;
    }
  }

  return `${prefix}${maxNumber + 1}`;
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hasSequentialIONames(names = [], prefix) {
  if (!Array.isArray(names)) return false;
  for (let i = 0; i < names.length; i += 1) {
    if (names[i] !== `${prefix}${i + 1}`) {
      return false;
    }
  }
  return true;
}

function hasCircuitConnectionErrors(circuit) {
  if (!circuit) return true;
  const blocks = Object.values(circuit.blocks || {});
  const wires = Object.values(circuit.wires || {});
  return blocks.some(block => {
    if (block.type !== 'OUTPUT' && block.type !== 'JUNCTION') {
      return false;
    }
    const incoming = wires.filter(wire => wire.endBlockId === block.id);
    return incoming.length > 1;
  });
}

function getProblemSaveState() {
  const circuit = getProblemCircuit();
  const { inputs, outputs } = getCurrentIOState();

  if (!inputs.length || !outputs.length) {
    return {
      canSave: false,
      message: translate(
        'problemSaveNeedsIO',
        'IN과 OUT 블록을 각각 최소 1개 이상 배치하세요.'
      )
    };
  }

  if (!hasSequentialIONames(inputs, 'IN') || !hasSequentialIONames(outputs, 'OUT')) {
    return {
      canSave: false,
      message: translate(
        'problemSaveNeedsSequentialIO',
        'IN, OUT 블록 번호를 1부터 순서대로 설정하세요.'
      )
    };
  }

  if (hasCircuitConnectionErrors(circuit)) {
    return {
      canSave: false,
      message: translate('problemSaveFixErrors', '회로 오류를 먼저 해결해주세요.')
    };
  }

  return { canSave: true, message: '' };
}

function getDifficultyStars() {
  if (!difficultyContainerEl) return [];
  return Array.from(difficultyContainerEl.querySelectorAll('.difficulty-star'));
}

function formatDifficultyValue(value) {
  const template = translate('problemDifficultyValue', '{value}/5');
  return template.replace('{value}', value);
}

function formatDifficultyStars(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return '';

  const filled = Math.max(0, Math.min(MAX_DIFFICULTY, parsed));
  const empty = Math.max(0, MAX_DIFFICULTY - filled);

  return '★'.repeat(filled) + '☆'.repeat(empty);
}

function updateDifficultyAriaLabels() {
  const labelTemplate = translate('problemDifficultyStarAria', '난이도 {value}점');
  getDifficultyStars().forEach(star => {
    const starValue = Number.parseInt(star.dataset.value, 10) || 0;
    star.setAttribute('aria-label', labelTemplate.replace('{value}', starValue));
  });
}

function setProblemDifficulty(value, { focus = false } = {}) {
  const clamped = clamp(value, MIN_DIFFICULTY, MAX_DIFFICULTY, DEFAULT_DIFFICULTY);
  currentDifficulty = clamped;

  if (difficultyValueInputEl) {
    difficultyValueInputEl.value = String(clamped);
  }

  const stars = getDifficultyStars();
  stars.forEach(star => {
    const starValue = Number.parseInt(star.dataset.value, 10) || 0;
    const isActive = starValue <= clamped;
    const isCurrent = starValue === clamped;
    star.classList.toggle('active', isActive);
    star.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
    star.tabIndex = isCurrent ? 0 : -1;
    if (focus && isCurrent) {
      star.focus();
    }
  });

  if (difficultyValueLabelEl) {
    difficultyValueLabelEl.textContent = formatDifficultyValue(clamped);
  }

  updateDifficultyAriaLabels();
}

function getProblemDifficultyValue() {
  const sourceValue = difficultyValueInputEl?.value ?? currentDifficulty;
  return clamp(sourceValue, MIN_DIFFICULTY, MAX_DIFFICULTY, DEFAULT_DIFFICULTY);
}

function handleDifficultyKeydown(event) {
  const { key, currentTarget } = event;
  if (!currentTarget) return;

  const currentValue = Number.parseInt(currentTarget.dataset.value, 10) || currentDifficulty;
  let nextValue = null;

  if (key === 'ArrowRight' || key === 'ArrowUp') {
    nextValue = Math.min(currentDifficulty + 1, MAX_DIFFICULTY);
  } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
    nextValue = Math.max(currentDifficulty - 1, MIN_DIFFICULTY);
  } else if (key === 'Home') {
    nextValue = MIN_DIFFICULTY;
  } else if (key === 'End') {
    nextValue = MAX_DIFFICULTY;
  } else if (key === ' ' || key === 'Enter') {
    nextValue = currentValue;
  }

  if (nextValue !== null) {
    event.preventDefault();
    setProblemDifficulty(nextValue, { focus: true });
  }
}

function initializeDifficultySelector(container, input, valueLabel) {
  if (container) difficultyContainerEl = container;
  if (input) difficultyValueInputEl = input;
  if (valueLabel) difficultyValueLabelEl = valueLabel;

  if (!difficultyContainerEl || difficultySelectorInitialized) return;

  const stars = getDifficultyStars();
  if (!stars.length) return;

  stars.forEach(star => {
    star.addEventListener('click', () => {
      const value = Number.parseInt(star.dataset.value, 10) || DEFAULT_DIFFICULTY;
      setProblemDifficulty(value, { focus: true });
    });
    star.addEventListener('keydown', handleDifficultyKeydown);
  });

  difficultySelectorInitialized = true;

  if (difficultyValueInputEl && !difficultyValueInputEl.value) {
    difficultyValueInputEl.value = String(DEFAULT_DIFFICULTY);
  }

  setProblemDifficulty(getProblemDifficultyValue());
}

function getSaveProblemButton() {
  if (saveProblemButton) return saveProblemButton;
  const id = creationFlowConfig?.ids?.saveProblemBtnId;
  if (!id) return null;
  saveProblemButton = getElement(id);
  return saveProblemButton;
}

function getConfirmSaveProblemButton() {
  if (confirmSaveProblemButton) return confirmSaveProblemButton;
  const id = creationFlowConfig?.ids?.confirmSaveProblemBtnId;
  if (!id) return null;
  confirmSaveProblemButton = getElement(id);
  return confirmSaveProblemButton;
}

function updateProblemCreationAvailability() {
  const { canSave, message } = getProblemSaveState();
  const saveBtn = getSaveProblemButton();
  const confirmBtn = getConfirmSaveProblemButton();

  if (saveBtn) {
    saveBtn.disabled = !canSave;
    if (message) saveBtn.title = message;
    else saveBtn.removeAttribute('title');
  }

  if (confirmBtn) {
    confirmBtn.disabled = !canSave;
    if (message) confirmBtn.title = message;
    else confirmBtn.removeAttribute('title');
  }

  return canSave;
}

export function invalidateProblemOutputs() {
  updateProblemCreationAvailability();
}

function getElement(id) {
  if (!id) return null;
  return document.getElementById(id);
}

function showElement(id, display = '') {
  const el = getElement(id);
  if (el) el.style.display = display;
}

function hideElement(id) {
  const el = getElement(id);
  if (el) el.style.display = 'none';
}

function createPaletteForProblem() {
  const builder = typeof paletteGroupsBuilder === 'function'
    ? paletteGroupsBuilder
    : blocks => blocks;
  const blocks = [];
  blocks.push({ type: 'INPUT', name: 'IN1' });
  blocks.push({ type: 'OUTPUT', name: 'OUT1' });
  ['AND', 'OR', 'NOT', 'JUNCTION'].forEach(type => {
    blocks.push({ type });
  });
  return builder(blocks);
}

function createPaletteForCustom(problem) {
  const builder = typeof paletteGroupsBuilder === 'function'
    ? paletteGroupsBuilder
    : blocks => blocks;
  const blocks = [];
  if (!problem?.fixIO) {
    for (let i = 1; i <= (problem?.inputCount || 0); i += 1) {
      blocks.push({ type: 'INPUT', name: `IN${i}` });
    }
    for (let j = 1; j <= (problem?.outputCount || 0); j += 1) {
      blocks.push({ type: 'OUTPUT', name: `OUT${j}` });
    }
  }
  ['AND', 'OR', 'NOT', 'JUNCTION'].forEach(type => {
    blocks.push({ type });
  });
  return builder(blocks);
}

export function initializeProblemEditorUI() {
  cachedIOState = { inputs: [], outputs: [] };
  setupGridResizeControls();
  detachProblemCircuitListener?.();
  detachProblemCircuitListener = null;

  const rows = DEFAULT_GRID_ROWS;
  const cols = DEFAULT_GRID_COLS;
  const palette = createPaletteForProblem();

  setupGrid(
    'problemCanvasContainer',
    rows,
    cols,
    palette,
    { enableCopyPaste: true }
  ).then(() => {
    clearGrid();
    clearWires();
    setGridDimensions(rows, cols);
    updateProblemIOState();
    updateGridResizeButtonStates();
    markCircuitModified('problem');
    adjustGridZoom('problemCanvasContainer');
    detachProblemCircuitListener = onCircuitModified(context => {
      if (context !== 'problem') return;
      handleProblemCircuitModified();
    });
  });
}

function getProblemGridData() {
  const circuit = getProblemCircuit();
  if (!circuit) return [];
  const cols = getGridCols();
  return Object.values(circuit.blocks).map(block => ({
    index: block.pos.r * cols + block.pos.c,
    type: block.type || null,
    name: block.name || null,
    value: block.type === 'INPUT' ? (block.value ? '1' : '0') : null,
    classes: block.fixed ? ['fixed'] : []
  }));
}

function getProblemWireData() {
  const circuit = getProblemCircuit();
  if (!circuit) return [];
  const wires = [];
  Object.values(circuit.wires).forEach(wire => {
    for (let i = 0; i < wire.path.length - 1; i += 1) {
      const from = wire.path[i];
      const to = wire.path[i + 1];
      let dir = '';
      if (to.r > from.r) dir = 'down';
      else if (to.r < from.r) dir = 'up';
      else if (to.c > from.c) dir = 'right';
      else if (to.c < from.c) dir = 'left';
      wires.push({ x: from.c, y: from.r, dir });
    }
  });
  return wires;
}

function getProblemCircuitStats() {
  const circuit = getProblemCircuit();
  if (!circuit) {
    return { blockCounts: {}, usedWires: 0 };
  }

  const blockCounts = Object.values(circuit.blocks || {}).reduce((acc, block) => {
    const type = block.type || 'UNKNOWN';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const wireCells = new Set();
  Object.values(circuit.wires || {}).forEach(wire => {
    (wire.path || []).slice(1, -1).forEach(point => {
      wireCells.add(`${point.r},${point.c}`);
    });
  });

  return { blockCounts, usedWires: wireCells.size };
}

function getProblemTruthTable(
  inputNames = cachedIOState.inputs,
  outputNames = cachedIOState.outputs
) {
  const circuit = getProblemCircuit();
  if (!circuit || !inputNames.length || !outputNames.length) {
    return [];
  }

  const blocks = Object.values(circuit.blocks || {});
  const inputBlocks = inputNames.map(name =>
    blocks.find(block => block.type === 'INPUT' && block.name === name)
  );
  const outputBlocks = outputNames.map(name =>
    blocks.find(block => block.type === 'OUTPUT' && block.name === name)
  );

  const originalInputValues = inputBlocks.map(block => block?.value);
  const originalOutputValues = outputBlocks.map(block => block?.value);

  const cappedInputCount = Math.min(inputNames.length, TRUTH_TABLE_MAX_INPUTS);
  const rowCount = inputNames.length > 0 ? 1 << cappedInputCount : 1;
  const rows = [];

  for (let r = 0; r < rowCount; r += 1) {
    const row = {};
    inputNames.forEach((name, idx) => {
      const bit = (r >> (inputNames.length - 1 - idx)) & 1;
      row[name] = bit;
      const block = inputBlocks[idx];
      if (block) {
        block.value = bit === 1;
      }
    });

    evaluateCircuit(circuit);

    outputNames.forEach((name, idx) => {
      const block = outputBlocks[idx];
      if (block) {
        row[name] = block.value ? 1 : 0;
      } else {
        row[name] = '';
      }
    });

    rows.push(row);
  }

  inputBlocks.forEach((block, idx) => {
    if (block) {
      block.value = originalInputValues[idx];
    }
  });
  outputBlocks.forEach((block, idx) => {
    if (block) {
      block.value = originalOutputValues[idx];
    }
  });

  return rows;
}

function updateProblemPalette(inputNames, outputNames) {
  const controller = getProblemController();
  if (!controller?.setIOPaletteNames) return;
  const nextInput = getNextAvailableName('IN', inputNames);
  const nextOutput = getNextAvailableName('OUT', outputNames);
  controller.setIOPaletteNames(
    nextInput ? [nextInput] : [],
    nextOutput ? [nextOutput] : []
  );
}

function updateProblemIOState() {
  const { inputs, outputs } = getCurrentIOState();
  updateProblemPalette(inputs, outputs);
  const inputsChanged = !arraysEqual(cachedIOState.inputs, inputs);
  const outputsChanged = !arraysEqual(cachedIOState.outputs, outputs);
  if (inputsChanged || outputsChanged) {
    cachedIOState = { inputs: [...inputs], outputs: [...outputs] };
  }
  updateProblemCreationAvailability();
}

function handleProblemCircuitModified() {
  updateProblemIOState();
  updateGridResizeButtonStates();
}

function setupGridResizeControls() {
  if (gridResizeControlsInitialized) return;
  const container = document.getElementById('problemGridSizeController');
  if (!container) return;
  const buttons = container.querySelectorAll('[data-grid-action]');
  buttons.forEach(button => {
    const action = button.dataset.gridAction;
    if (!action) return;
    button.addEventListener('click', () => handleGridControl(action));
  });
  gridResizeControlsInitialized = true;
  updateGridSizePreview();
}

function handleGridControl(action) {
  const controller = getProblemController();
  if (!controller) return;
  const actionHandlers = {
    'add-row-top': () => controller.expandGrid?.('top'),
    'remove-row-top': () => controller.shrinkGrid?.('top'),
    'add-row-bottom': () => controller.expandGrid?.('bottom'),
    'remove-row-bottom': () => controller.shrinkGrid?.('bottom'),
    'add-col-left': () => controller.expandGrid?.('left'),
    'remove-col-left': () => controller.shrinkGrid?.('left'),
    'add-col-right': () => controller.expandGrid?.('right'),
    'remove-col-right': () => controller.shrinkGrid?.('right'),
  };
  const handler = actionHandlers[action];
  if (!handler) return;
  const changed = handler();
  if (changed) {
    const circuit = getProblemCircuit();
    if (circuit) {
      setGridDimensions(circuit.rows, circuit.cols);
    }
    adjustGridZoom('problemCanvasContainer');
    updateProblemIOState();
  }
  updateGridResizeButtonStates();
}

function updateGridResizeButtonStates() {
  const controller = getProblemController();
  const buttonStates = [
    { action: 'add-row-top', enabled: Boolean(controller?.canExpandGrid?.('top')) },
    { action: 'remove-row-top', enabled: Boolean(controller?.canShrinkGrid?.('top')) },
    { action: 'add-row-bottom', enabled: Boolean(controller?.canExpandGrid?.('bottom')) },
    { action: 'remove-row-bottom', enabled: Boolean(controller?.canShrinkGrid?.('bottom')) },
    { action: 'add-col-left', enabled: Boolean(controller?.canExpandGrid?.('left')) },
    { action: 'remove-col-left', enabled: Boolean(controller?.canShrinkGrid?.('left')) },
    { action: 'add-col-right', enabled: Boolean(controller?.canExpandGrid?.('right')) },
    { action: 'remove-col-right', enabled: Boolean(controller?.canShrinkGrid?.('right')) },
  ];
  buttonStates.forEach(({ action, enabled }) => {
    const button = document.querySelector(
      `#problemGridSizeController [data-grid-action="${action}"]`
    );
    if (button) {
      button.disabled = !enabled;
    }
  });
  updateGridSizePreview();
}

function updateGridSizePreview() {
  const previewValue = document.getElementById('gridSizePreviewValue');
  if (!previewValue) return;
  const [rows, cols] = getGridDimensions();
  previewValue.textContent = `${rows}×${cols}`;
}

export function collectProblemData() {
  const circuit = getProblemCircuit();
  const cols = getGridCols();
  const [gridRows, gridCols] = getGridDimensions();
  const { inputs, outputs } = getCurrentIOState();
  const wiresObj = circuit
    ? Object.values(circuit.wires).map(wire => ({
        startIdx:
          circuit.blocks[wire.startBlockId].pos.r * cols +
          circuit.blocks[wire.startBlockId].pos.c,
        endIdx:
          circuit.blocks[wire.endBlockId].pos.r * cols +
          circuit.blocks[wire.endBlockId].pos.c,
        pathIdxs: wire.path.map(p => p.r * cols + p.c)
      }))
    : [];

  const titleInput = document.getElementById('problemTitleInput');
  const descInput = document.getElementById('problemDescInput');
  const fixIOCheck = document.getElementById('fixIOCheck');

  return {
    title: titleInput ? titleInput.value.trim() : '',
    description: descInput ? descInput.value.trim() : '',
    difficulty: getProblemDifficultyValue(),
    inputCount: inputs.length,
    outputCount: outputs.length,
    gridRows,
    gridCols,
    fixIO: Boolean(fixIOCheck?.checked),
    table: getProblemTruthTable(inputs, outputs),
    grid: getProblemGridData(),
    wires: getProblemWireData(),
    wiresObj,
    creator: getUsername() || '익명',
    timestamp: new Date().toISOString()
  };
}

export function saveProblem() {
  const titleInput = document.getElementById('problemTitleInput');
  const descInput = document.getElementById('problemDescInput');
  if (!titleInput || !descInput) return false;

  const title = titleInput.value.trim();
  const desc = descInput.value.trim();
  if (!title) {
    alert(t('problemTitleRequired'));
    titleInput.focus();
    return false;
  }
  if (!desc) {
    alert(t('problemDescRequired'));
    descInput.focus();
    return false;
  }
  const { canSave, message } = getProblemSaveState();
  if (!canSave) {
    if (message) alert(message);
    return false;
  }

  const data = collectProblemData();
  const key = db.ref('problems').push().key;
  db.ref(`problems/${key}`).set(data)
    .then(() => {
      const { blockCounts, usedWires } = getProblemCircuitStats();
      const rankingEntry = {
        nickname: data.creator,
        blockCounts,
        usedWires,
        hintsUsed: 0,
        timestamp: data.timestamp
      };
      return db.ref(`problems/${key}/ranking`).push(rankingEntry);
    })
    .then(() => alert(t('problemSaved')))
    .catch(err => alert(t('saveFailed').replace('{error}', err)));
  return true;
}

function enterProblemScreen(from) {
  if (!creationFlowConfig) return;
  const { ids } = creationFlowConfig;
  previousScreen = from;
  if (from === 'main') {
    hideElement(ids.firstScreenId);
  } else if (from === 'userProblems') {
    hideElement(ids.userProblemsScreenId);
  } else {
    hideElement(ids.chapterStageScreenId);
  }
  const displayMode = from === 'main' ? 'block' : 'flex';
  showElement(ids.problemScreenId, displayMode);
  initializeProblemEditorUI();
}

function leaveProblemScreen() {
  if (!creationFlowConfig) return;
  const { ids, onDestroyProblemContext, onRefreshUserData } = creationFlowConfig;
  onDestroyProblemContext?.();
  hideElement(ids.problemScreenId);
  if (previousScreen === 'userProblems') {
    showElement(ids.userProblemsScreenId, 'block');
  } else if (previousScreen === 'main') {
    showElement(ids.firstScreenId);
  } else {
    showElement(ids.chapterStageScreenId, 'block');
  }
  onRefreshUserData?.();
  previousScreen = null;
}

function getModalBackdrop(selector) {
  if (!selector) return null;
  return document.querySelector(selector);
}

function showProblemSaveModal(modal, titleInput, descInput, fixIOCheck, difficultyInput) {
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  if (fixIOCheck) fixIOCheck.checked = false;
  if (difficultyInput) difficultyInput.value = String(DEFAULT_DIFFICULTY);
  setProblemDifficulty(DEFAULT_DIFFICULTY);
  if (modal) {
    modal.style.display = 'flex';
    titleInput?.focus();
  }
}

export function initializeProblemCreationFlow({
  ids = {},
  buildPaletteGroups,
  onDestroyProblemContext,
  onRefreshUserData,
  onStartCustomProblem
} = {}) {
  paletteGroupsBuilder = typeof buildPaletteGroups === 'function'
    ? buildPaletteGroups
    : paletteGroupsBuilder;
  creationFlowConfig = {
    ids,
    onDestroyProblemContext,
    onRefreshUserData
  };
  startCustomProblemHandler = typeof onStartCustomProblem === 'function'
    ? onStartCustomProblem
    : null;

  const backButton = getElement(ids.backButtonId);
  if (backButton) {
    backButton.addEventListener('click', leaveProblemScreen);
  }

  const openProblemCreatorBtn = getElement(ids.openProblemCreatorBtnId);
  if (openProblemCreatorBtn) {
    openProblemCreatorBtn.addEventListener('click', () => enterProblemScreen('userProblems'));
  }

  const problemSaveModal = getElement(ids.problemSaveModalId);
  const problemTitleInput = getElement(ids.problemTitleInputId);
  const problemDescInput = getElement(ids.problemDescInputId);
  const difficultyContainer = getElement(ids.problemDifficultyContainerId);
  const difficultyValueInput = getElement(ids.problemDifficultyValueInputId);
  const difficultyValueLabel = getElement(ids.problemDifficultyValueLabelId);
  const fixIOCheck = getElement(ids.fixIOCheckId);

  initializeDifficultySelector(difficultyContainer, difficultyValueInput, difficultyValueLabel);

  const saveProblemBtn = getElement(ids.saveProblemBtnId);
  if (saveProblemBtn) {
    saveProblemButton = saveProblemBtn;
    saveProblemBtn.addEventListener('click', () =>
      showProblemSaveModal(
        problemSaveModal,
        problemTitleInput,
        problemDescInput,
        fixIOCheck,
        difficultyValueInput
      )
    );
  }

  const confirmSaveProblemBtn = getElement(ids.confirmSaveProblemBtnId);
  if (confirmSaveProblemBtn) {
    confirmSaveProblemButton = confirmSaveProblemBtn;
    confirmSaveProblemBtn.addEventListener('click', () => {
      if (saveProblem()) {
        if (problemSaveModal) problemSaveModal.style.display = 'none';
      }
    });
  }

  updateProblemCreationAvailability();

  const cancelSaveProblemBtn = getElement(ids.cancelSaveProblemBtnId);
  if (cancelSaveProblemBtn) {
    cancelSaveProblemBtn.addEventListener('click', () => {
      if (problemSaveModal) problemSaveModal.style.display = 'none';
    });
  }

  const backdrop = getModalBackdrop(ids.problemModalBackdropSelector);
  if (backdrop && problemSaveModal) {
    backdrop.addEventListener('click', () => {
      problemSaveModal.style.display = 'none';
    });
  }

  const closeProblemListModalBtn = getElement(ids.closeProblemListModalBtnId);
  if (closeProblemListModalBtn) {
    closeProblemListModalBtn.addEventListener('click', () => {
      const modal = getElement(ids.problemListModalId);
      if (modal) modal.style.display = 'none';
    });
  }

}

function getViewerNickname() {
  return getUsername() || '익명';
}

function parseSearchValue(raw) {
  const value = (raw || '').toString();
  const fromRegex = /from:("[^"]+"|\S+)/gi;
  let creator = '';
  let cleaned = value;

  cleaned = cleaned.replace(fromRegex, match => {
    const [, captured] = /from:("[^"]+"|\S+)/i.exec(match) || [];
    if (captured) {
      creator = captured.trim().replace(/^"|"$/g, '');
    }
    return ' ';
  });

  return {
    text: cleaned.trim(),
    creator: creator.trim()
  };
}

function normalizeText(text) {
  return (text || '').toString().toLowerCase();
}

function matchesDifficultySelection(value, selection) {
  if (!selection) return true;
  const difficulty = Number.parseInt(value, 10) || 0;
  if (difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY) {
    return true;
  }
  return Boolean(selection[difficulty]);
}

function updateFilterToggleUI() {
  document
    .querySelectorAll('.user-problem-filter-toggle')
    .forEach(button => {
      const key = button.dataset.userProblemToggle;
      if (!key) return;
      const active = Boolean(userProblemFilterState[key]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

  document
    .querySelectorAll('.user-problem-difficulty-toggle')
    .forEach(button => {
      const level = Number.parseInt(button.dataset.userProblemDifficulty, 10);
      if (Number.isNaN(level)) return;
      const active = Boolean(userProblemFilterState.difficultyLevels?.[level]);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function updateFilterControlValues() {
  const searchInput = document.getElementById('userProblemSearch');
  if (searchInput && searchInput.value !== userProblemFilterState.searchRaw) {
    searchInput.value = userProblemFilterState.searchRaw;
  }

  const sortSelect = document.getElementById('userProblemSort');
  if (sortSelect && sortSelect.value !== userProblemFilterState.sort) {
    sortSelect.value = userProblemFilterState.sort;
  }
}

function ensureUserProblemControls() {
  if (userProblemControlsInitialized) return;

  const searchInput = document.getElementById('userProblemSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const raw = searchInput.value || '';
      const { text, creator } = parseSearchValue(raw);
      userProblemFilterState.searchRaw = raw;
      userProblemFilterState.searchText = text;
      userProblemFilterState.searchCreator = creator;
      if (!userProblemListLoading) {
        updateUserProblemListUI();
      }
    });
  }

  const sortSelect = document.getElementById('userProblemSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      userProblemFilterState.sort = sortSelect.value;
      if (!userProblemListLoading) {
        updateUserProblemListUI();
      }
    });
  }

  document
    .querySelectorAll('.user-problem-filter-toggle')
    .forEach(button => {
      const key = button.dataset.userProblemToggle;
      if (!key) return;
      button.addEventListener('click', () => {
        userProblemFilterState[key] = !userProblemFilterState[key];
        updateFilterToggleUI();
        if (!userProblemListLoading) {
          updateUserProblemListUI();
        }
      });
    });

  document
    .querySelectorAll('.user-problem-difficulty-toggle')
    .forEach(button => {
      const level = Number.parseInt(button.dataset.userProblemDifficulty, 10);
      if (Number.isNaN(level)) return;
      button.addEventListener('click', () => {
        if (!userProblemFilterState.difficultyLevels) {
          userProblemFilterState.difficultyLevels = createDefaultDifficultySelection();
        }
        userProblemFilterState.difficultyLevels[level] = !userProblemFilterState.difficultyLevels[level];
        updateFilterToggleUI();
        if (!userProblemListLoading) {
          updateUserProblemListUI();
        }
      });
    });

  updateFilterControlValues();
  updateFilterToggleUI();
  userProblemControlsInitialized = true;
}

function updateUserProblemResultSummary(visibleCount, totalCount) {
  const summary = document.getElementById('userProblemResultSummary');
  if (!summary) return;
  const template = translate(
    'userProblemResultSummaryTemplate',
    '총 {total}개 중 {visible}개 표시'
  );
  summary.textContent = template
    .replace('{visible}', String(visibleCount))
    .replace('{total}', String(totalCount));
}

function createUserProblemListItem(problem) {
  const item = document.createElement('li');
  item.className = 'problem-item';
  if (problem.solvedByMe) item.classList.add('solved');
  item.tabIndex = 0;

  const createBadge = (icon, label, value) => {
    const badge = document.createElement('span');
    badge.className = 'problem-item-badge';

    const badgeIcon = document.createElement('span');
    badgeIcon.className = 'problem-item-badge-icon';
    badgeIcon.setAttribute('aria-hidden', 'true');
    badgeIcon.textContent = icon;

    const badgeText = document.createElement('span');
    badgeText.className = 'problem-item-badge-text';

    const badgeLabel = document.createElement('span');
    badgeLabel.className = 'problem-item-badge-label';
    badgeLabel.textContent = label;

    const badgeValue = document.createElement('span');
    badgeValue.className = 'problem-item-badge-value';
    badgeValue.textContent = value;

    badgeText.append(badgeLabel, badgeValue);
    badge.append(badgeIcon, badgeText);

    return badge;
  };

  const header = document.createElement('div');
  header.className = 'problem-item-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'problem-item-title-group';

  const title = document.createElement('span');
  title.className = 'problem-item-title';
  title.textContent = problem.title;

  titleGroup.append(title);

  const headerBadges = document.createElement('div');
  headerBadges.className = 'problem-item-header-badges';

  const gridBadgeLabel = translate('problemGridSizeLabel', '격자 크기');
  const gridBadgeValue = `${problem.gridRows}×${problem.gridCols}`;
  const gridBadge = createBadge('🔢', gridBadgeLabel, gridBadgeValue);
  headerBadges.appendChild(gridBadge);

  header.append(titleGroup, headerBadges);

  const meta = document.createElement('div');
  meta.className = 'problem-item-meta';

  const creator = document.createElement('span');
  creator.className = 'problem-item-meta-entry';
  const creatorIcon = document.createElement('span');
  creatorIcon.className = 'problem-item-meta-icon';
  creatorIcon.setAttribute('aria-hidden', 'true');
  creatorIcon.textContent = '👤';
  const creatorText = document.createElement('span');
  creatorText.textContent = `${translate('thCreator', '제작자')}: ${problem.creator}${problem.isMine ? ' (나)' : ''}`;
  creator.append(creatorIcon, creatorText);

  const createdAt = document.createElement('span');
  createdAt.className = 'problem-item-meta-entry';
  const createdAtIcon = document.createElement('span');
  createdAtIcon.className = 'problem-item-meta-icon';
  createdAtIcon.setAttribute('aria-hidden', 'true');
  createdAtIcon.textContent = '📅';
  const createdAtLabel = translate('thCreatedAt', '제작일');
  const createdAtValue = problem.createdAt
    ? problem.createdAt.toLocaleDateString()
    : '-';
  const createdAtText = document.createElement('span');
  createdAtText.textContent = `${createdAtLabel}: ${createdAtValue}`;
  createdAt.append(createdAtIcon, createdAtText);

  meta.append(creator, createdAt);

  const footer = document.createElement('div');
  footer.className = 'problem-item-footer';

  const stats = document.createElement('div');
  stats.className = 'problem-item-stats';

  const solvedLabel = translate('thSolved', '해결 수');
  const solvedBadge = createBadge('✅', solvedLabel, String(problem.solved));
  stats.appendChild(solvedBadge);

  const difficultyLabel = translate('problemDifficultyLabel', '난이도');
  const difficultyStars = formatDifficultyStars(problem.difficulty);
  const difficultyValue = difficultyStars
    ? difficultyStars
    : translate('problemDifficultyUnknown', '미정');
  const difficultyBadge = createBadge('⭐', difficultyLabel, difficultyValue);
  stats.appendChild(difficultyBadge);

  const actions = document.createElement('div');
  actions.className = 'problem-item-actions';

  const likeButton = document.createElement('button');
  likeButton.type = 'button';
  likeButton.className = 'likeBtn';
  likeButton.dataset.key = problem.key;
  likeButton.setAttribute('aria-label', `${translate('thLikes', '좋아요')}: ${problem.likes}`);
  likeButton.title = translate('thLikes', '좋아요');
  likeButton.setAttribute('aria-pressed', problem.likedByViewer ? 'true' : 'false');
  if (problem.likedByViewer) {
    likeButton.classList.add('active');
  }

  const likeIcon = document.createElement('span');
  likeIcon.setAttribute('aria-hidden', 'true');
  likeIcon.textContent = '♥';

  const likeCount = document.createElement('span');
  likeCount.className = 'likeCount';
  likeCount.textContent = problem.likes;

  likeButton.append(likeIcon, likeCount);
  actions.appendChild(likeButton);

  if (problem.isMine) {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'deleteProbBtn';
    deleteButton.dataset.key = problem.key;
    deleteButton.textContent = translate('deleteBtn', '삭제');
    actions.appendChild(deleteButton);
    deleteButton.addEventListener('click', event => {
      event.stopPropagation();
      if (confirm(t('confirmDelete'))) {
        deleteUserProblem(deleteButton.dataset.key);
      }
    });
  }

  footer.append(stats, actions);
  item.append(header, meta, footer);

  item.addEventListener('click', () => {
    previewUserProblem(problem.key);
  });

  item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      previewUserProblem(problem.key);
    }
  });

  likeButton.addEventListener('click', event => {
    event.stopPropagation();
    toggleLikeProblem(likeButton.dataset.key);
  });

  return item;
}

function updateUserProblemListUI() {
  if (userProblemListLoading) return;
  const listContainer = document.getElementById('userProblemList');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  const totalCount = userProblemsDataCache.length;
  if (!totalCount) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'problem-item problem-item-empty';
    emptyItem.textContent = translate('noUserProblems', '등록된 문제가 없습니다.');
    listContainer.appendChild(emptyItem);
    updateUserProblemResultSummary(0, 0);
    return;
  }

  const state = userProblemFilterState;
  const searchText = normalizeText(state.searchText);
  const creatorFilter = normalizeText(state.searchCreator);
  const requiredLikes = state.onlyPopular
    ? POPULAR_LIKE_THRESHOLD
    : 0;

  const filtered = userProblemsDataCache.filter(problem => {
    if (state.onlyMine && !problem.isMine) return false;
    if (state.onlyUnsolved && problem.solvedByMe) return false;
    if (problem.likes < requiredLikes) return false;
    if (!matchesDifficultySelection(problem.difficulty, state.difficultyLevels)) return false;
    if (creatorFilter && !problem.creatorLower.includes(creatorFilter)) return false;
    if (searchText && !problem.searchHaystack.includes(searchText)) return false;
    return true;
  });

  if (!filtered.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'problem-item problem-item-empty';
    emptyItem.textContent = translate('userProblemNoMatch', '조건에 맞는 문제가 없습니다.');
    listContainer.appendChild(emptyItem);
    updateUserProblemResultSummary(0, totalCount);
    return;
  }

  const locale = typeof currentLang === 'string'
    ? currentLang
    : (navigator.language || 'en');

  const sorted = filtered.slice().sort((a, b) => {
    if (state.sort === 'popular') {
      const diff = b.likes - a.likes;
      if (diff !== 0) return diff;
    } else if (state.sort === 'solved') {
      const diff = b.solved - a.solved;
      if (diff !== 0) return diff;
    } else if (state.sort === 'difficulty') {
      const diff = b.difficulty - a.difficulty;
      if (diff !== 0) return diff;
    } else if (state.sort === 'name') {
      const nameDiff = a.title.localeCompare(b.title, locale, {
        sensitivity: 'base',
        numeric: true
      });
      if (nameDiff !== 0) return nameDiff;
    }

    return b.timestampValue - a.timestampValue;
  });

  const fragment = document.createDocumentFragment();
  sorted.forEach(problem => {
    fragment.appendChild(createUserProblemListItem(problem));
  });
  listContainer.appendChild(fragment);

  updateUserProblemResultSummary(sorted.length, totalCount);
}

function toggleLikeProblem(key) {
  const nickname = getViewerNickname();
  const likeRef = db.ref(`problems/${key}/likes/${nickname}`);
  likeRef.once('value').then(snapshot => {
    if (snapshot.exists()) likeRef.remove();
    else likeRef.set(true);
  }).then(() => renderUserProblemList());
}

function deleteUserProblem(key) {
  db.ref(`problems/${key}`).remove()
    .then(() => renderUserProblemList())
    .catch(err => alert(t('deleteFailed').replace('{error}', err)));
}

export function previewUserProblem(key) {
  db.ref(`problems/${key}`).once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) {
      alert(t('loadFailed'));
      return;
    }
    showProblemIntro(data, startCustomProblemHandler
      ? () => startCustomProblemHandler(key, data)
      : undefined);
  });
}

export function renderUserProblemList() {
  const listContainer = document.getElementById('userProblemList');
  if (!listContainer) return;

  ensureUserProblemControls();
  updateFilterToggleUI();
  updateFilterControlValues();

  userProblemListRequestId += 1;
  const requestId = userProblemListRequestId;

  userProblemListLoading = true;
  listContainer.innerHTML = '';

  const loadingItem = document.createElement('li');
  loadingItem.className = 'problem-item problem-item-empty';
  loadingItem.textContent = translate('loadingText', '데이터 불러오는 중...');
  listContainer.appendChild(loadingItem);
  updateUserProblemResultSummary(0, 0);

  const nickname = getViewerNickname();

  db.ref('problems').once('value')
    .then(snapshot => {
      if (requestId !== userProblemListRequestId) return;

      userProblemListLoading = false;
      userProblemsDataCache = [];

      if (!snapshot.exists()) {
        updateFilterControlValues();
        updateUserProblemListUI();
        return;
      }

      snapshot.forEach(child => {
        const data = child.val();
        if (!data) return false;

        const rankingEntries = data.ranking ? Object.values(data.ranking) : [];
        const solved = rankingEntries.length
          ? new Set(rankingEntries.map(entry => entry.nickname)).size
          : 0;
        const likesObject = data.likes || {};
        const likes = Object.keys(likesObject).length;
        const likedByViewer = Boolean(likesObject[nickname]);
        const isMine = data.creator === nickname;
        const solvedByMe = rankingEntries.some(entry => entry.nickname === nickname);
        const gridRows = Number.parseInt(data.gridRows, 10) || 6;
        const gridCols = Number.parseInt(data.gridCols, 10) || 6;
        const difficulty = Number.parseInt(data.difficulty, 10) || 0;
        const title = data.title || child.key;
        const description = data.description || '';
        const creator = data.creator || '익명';
        const parsedTimestamp = data.timestamp ? Date.parse(data.timestamp) : Number.NaN;
        const timestampValue = Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
        const createdAt = Number.isNaN(parsedTimestamp) ? null : new Date(parsedTimestamp);

        userProblemsDataCache.push({
          key: child.key,
          title,
          titleLower: title.toLowerCase(),
          description,
          creator,
          creatorLower: creator.toLowerCase(),
          createdAt,
          timestampValue,
          likes,
          likedByViewer,
          solved,
          solvedByMe,
          isMine,
          difficulty,
          gridRows,
          gridCols,
          searchHaystack: `${title} ${description} ${creator}`.toLowerCase().trim()
        });

        return false;
      });

      updateFilterControlValues();
      updateUserProblemListUI();
    })
    .catch(err => {
      if (requestId !== userProblemListRequestId) return;
      userProblemListLoading = false;
      console.error('Failed to load user problems', err);
      listContainer.innerHTML = '';
      const errorItem = document.createElement('li');
      errorItem.className = 'problem-item problem-item-empty';
      errorItem.textContent = translate('userProblemLoadFailed', '문제 목록을 불러오지 못했습니다.');
      listContainer.appendChild(errorItem);
      updateUserProblemResultSummary(0, 0);
    });
}

export function showProblemIntro(problem, callback) {
  const modal = document.getElementById('levelIntroModal');
  const title = document.getElementById('introTitle');
  const desc = document.getElementById('introDesc');
  const table = document.getElementById('truthTable');
  if (!modal || !title || !desc || !table) return;

  title.textContent = problem.title || '';
  desc.textContent = problem.description || '';
  const keys = Object.keys(problem.table?.[0] || {});
  table.innerHTML = `
    <tr>${keys.map(key => `<th>${key}</th>`).join('')}</tr>
    ${(problem.table || []).map(row => `<tr>${keys.map(key => `<td>${row[key]}</td>`).join('')}</tr>`).join('')}
  `;
  modal.style.display = 'flex';
  modal.style.backgroundColor = 'white';
  const btn = document.getElementById('startLevelBtn');
  if (!btn) return;
  btn.textContent = callback ? '시작하기' : '닫기';
  btn.onclick = () => {
    modal.style.display = 'none';
    if (callback) callback();
  };
}

export function createCustomProblemPalette(problem) {
  return createPaletteForCustom(problem);
}

export function setActiveCustomProblem(problem, key) {
  activeCustomProblem = problem || null;
  activeCustomProblemKey = key || null;
}

export function clearActiveCustomProblem() {
  activeCustomProblem = null;
  activeCustomProblemKey = null;
}

export function getActiveCustomProblem() {
  return activeCustomProblem;
}

export function getActiveCustomProblemKey() {
  return activeCustomProblemKey;
}

