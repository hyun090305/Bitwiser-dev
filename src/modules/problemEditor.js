import {
  setupGrid,
  clearGrid,
  clearWires,
  markCircuitModified,
  adjustGridZoom,
  setGridDimensions,
  getGridCols,
  getProblemCircuit
} from './grid.js';
import { getUsername } from './storage.js';

let creationFlowConfig = null;
let startCustomProblemHandler = null;
let paletteGroupsBuilder = blocks => blocks;
let previousScreen = null;
let problemOutputsValid = false;
let saveProblemButton = null;
let confirmSaveProblemButton = null;
let activeCustomProblem = null;
let activeCustomProblemKey = null;

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
  const disabled = !problemOutputsValid;
  const saveBtn = getSaveProblemButton();
  const confirmBtn = getConfirmSaveProblemButton();
  const message = disabled
    ? translate('computeOutputsFirst', '출력 계산을 먼저 실행하세요.')
    : '';

  if (saveBtn) {
    saveBtn.disabled = disabled;
    if (message) saveBtn.title = message;
    else saveBtn.removeAttribute('title');
  }

  if (confirmBtn) {
    confirmBtn.disabled = disabled;
    if (message) confirmBtn.title = message;
    else confirmBtn.removeAttribute('title');
  }
}

export function invalidateProblemOutputs() {
  problemOutputsValid = false;
  updateProblemCreationAvailability();
}

function markProblemOutputsValid() {
  problemOutputsValid = true;
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
  const inputEl = document.getElementById('inputCount');
  const outputEl = document.getElementById('outputCount');
  const inputCnt = Number.parseInt(inputEl?.value, 10) || 1;
  const outputCnt = Number.parseInt(outputEl?.value, 10) || 1;
  const blocks = [];
  for (let i = 1; i <= inputCnt; i += 1) {
    blocks.push({ type: 'INPUT', name: `IN${i}` });
  }
  for (let j = 1; j <= outputCnt; j += 1) {
    blocks.push({ type: 'OUTPUT', name: `OUT${j}` });
  }
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
  const inputEl = document.getElementById('inputCount');
  const outputEl = document.getElementById('outputCount');
  if (!inputEl || !outputEl) return;

  inputEl.value = clamp(inputEl.value, 1, 6, 1);
  outputEl.value = clamp(outputEl.value, 1, 6, 1);

  const rowsEl = document.getElementById('gridRows');
  const colsEl = document.getElementById('gridCols');
  const rows = clamp(rowsEl?.value, 1, 15, 6);
  const cols = clamp(colsEl?.value, 1, 15, 6);
  if (rowsEl) rowsEl.value = rows;
  if (colsEl) colsEl.value = cols;

  const palette = createPaletteForProblem();
  setupGrid('problemCanvasContainer', rows, cols, palette);
  clearGrid();
  clearWires();
  setGridDimensions(rows, cols);
  initTestcaseTable();
  markCircuitModified();
  adjustGridZoom('problemCanvasContainer');
  invalidateProblemOutputs();
}

export function initTestcaseTable() {
  const table = document.getElementById('testcaseTable');
  if (!table) return;

  const inputCnt = clamp(
    document.getElementById('inputCount')?.value,
    1,
    6,
    1
  );
  const outputCnt = clamp(
    document.getElementById('outputCount')?.value,
    1,
    6,
    1
  );

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  if (!thead || !tbody) return;

  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  for (let i = 1; i <= inputCnt; i += 1) {
    const th = document.createElement('th');
    th.textContent = `IN${i}`;
    headerRow.appendChild(th);
  }
  for (let j = 1; j <= outputCnt; j += 1) {
    const th = document.createElement('th');
    th.textContent = `OUT${j}`;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  tbody.innerHTML = '';
  const totalRows = 1 << inputCnt;
  for (let r = 0; r < totalRows; r += 1) {
    const row = document.createElement('tr');
    for (let i = 0; i < inputCnt; i += 1) {
      const td = document.createElement('td');
      td.style.width = '30px';
      td.textContent = (r >> (inputCnt - 1 - i)) & 1;
      row.appendChild(td);
    }
    for (let j = 0; j < outputCnt; j += 1) {
      const td = document.createElement('td');
      td.style.width = '30px';
      td.textContent = '';
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
}

export function addTestcaseRow() {
  const table = document.getElementById('testcaseTable');
  if (!table) return;

  const inputCnt = clamp(
    document.getElementById('inputCount')?.value,
    1,
    6,
    1
  );
  const outputCnt = clamp(
    document.getElementById('outputCount')?.value,
    1,
    6,
    1
  );

  const tr = document.createElement('tr');
  for (let i = 0; i < inputCnt; i += 1) {
    const td = document.createElement('td');
    td.style.width = '30px';
    td.textContent = '0';
    tr.appendChild(td);
  }
  for (let j = 0; j < outputCnt; j += 1) {
    const td = document.createElement('td');
    td.style.width = '30px';
    td.textContent = '';
    tr.appendChild(td);
  }
  table.querySelector('tbody')?.appendChild(tr);
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

function getProblemTruthTable() {
  const inputCnt = clamp(
    document.getElementById('inputCount')?.value,
    1,
    6,
    1
  );
  const outputCnt = clamp(
    document.getElementById('outputCount')?.value,
    1,
    6,
    1
  );
  const rows = Array.from(
    document.querySelectorAll('#testcaseTable tbody tr')
  );
  return rows.map(tr => {
    const row = {};
    const cells = Array.from(tr.querySelectorAll('td'));
    for (let i = 0; i < inputCnt; i += 1) {
      row[`IN${i + 1}`] = cells[i].textContent.trim() === '1' ? 1 : 0;
    }
    for (let j = 0; j < outputCnt; j += 1) {
      row[`OUT${j + 1}`] = cells[inputCnt + j].textContent.trim() === '1' ? 1 : 0;
    }
    return row;
  });
}

export function collectProblemData() {
  const circuit = getProblemCircuit();
  const cols = getGridCols();
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
  const rowsInput = document.getElementById('gridRows');
  const colsInput = document.getElementById('gridCols');
  const fixIOCheck = document.getElementById('fixIOCheck');

  return {
    title: titleInput ? titleInput.value.trim() : '',
    description: descInput ? descInput.value.trim() : '',
    inputCount: clamp(
      document.getElementById('inputCount')?.value,
      1,
      6,
      1
    ),
    outputCount: clamp(
      document.getElementById('outputCount')?.value,
      1,
      6,
      1
    ),
    gridRows: clamp(rowsInput?.value, 1, 15, 6),
    gridCols: clamp(colsInput?.value, 1, 15, 6),
    fixIO: Boolean(fixIOCheck?.checked),
    table: getProblemTruthTable(),
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
  if (!problemOutputsValid) {
    alert(t('computeOutputsFirst'));
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

function computeProblemOutputs() {
  const circuit = getProblemCircuit();
  if (!circuit) return;
  const inputCnt = parseInt(document.getElementById('inputCount')?.value, 10) || 1;
  const outputCnt = parseInt(document.getElementById('outputCount')?.value, 10) || 1;
  const inNames = Array.from({ length: inputCnt }, (_, i) => `IN${i + 1}`);
  const outNames = Array.from({ length: outputCnt }, (_, i) => `OUT${i + 1}`);

  const blocks = Object.values(circuit.blocks);
  const actualOutputs = blocks.filter(b => b.type === 'OUTPUT').map(b => b.name);
  const missing = outNames.filter(n => !actualOutputs.includes(n));
  if (missing.length > 0) {
    alert(t('outputMissingAlert').replace('{list}', missing.join(', ')));
    return;
  }

  const inputs = inNames.map(name =>
    blocks.find(b => b.type === 'INPUT' && b.name === name)
  );
  const outputs = outNames.map(name =>
    blocks.find(b => b.type === 'OUTPUT' && b.name === name)
  );

  const rows = document.querySelectorAll('#testcaseTable tbody tr');
  import('../canvas/engine.js').then(({ evaluateCircuit }) => {
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
  });
}

function getModalBackdrop(selector) {
  if (!selector) return null;
  return document.querySelector(selector);
}

function showProblemSaveModal(modal, titleInput, descInput, fixIOCheck) {
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  if (fixIOCheck) fixIOCheck.checked = false;
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

  const createProblemBtn = getElement(ids.createProblemBtnId);
  if (createProblemBtn) {
    createProblemBtn.addEventListener('click', () => enterProblemScreen('main'));
  }

  const backButton = getElement(ids.backButtonId);
  if (backButton) {
    backButton.addEventListener('click', leaveProblemScreen);
  }

  const openProblemCreatorBtn = getElement(ids.openProblemCreatorBtnId);
  if (openProblemCreatorBtn) {
    openProblemCreatorBtn.addEventListener('click', () => enterProblemScreen('userProblems'));
  }

  const updateIOBtn = getElement(ids.updateIOBtnId);
  if (updateIOBtn) {
    updateIOBtn.addEventListener('click', () => {
      alert('입출력/그리드 설정을 변경하면 회로가 초기화됩니다.');
      initializeProblemEditorUI();
    });
  }

  const addRowBtn = getElement(ids.addRowBtnId);
  if (addRowBtn) addRowBtn.style.display = 'none';

  const computeOutputsBtn = getElement(ids.computeOutputsBtnId);
  if (computeOutputsBtn) {
    computeOutputsBtn.addEventListener('click', computeProblemOutputs);
  }

  const problemSaveModal = getElement(ids.problemSaveModalId);
  const problemTitleInput = getElement(ids.problemTitleInputId);
  const problemDescInput = getElement(ids.problemDescInputId);
  const fixIOCheck = getElement(ids.fixIOCheckId);

  const saveProblemBtn = getElement(ids.saveProblemBtnId);
  if (saveProblemBtn) {
    saveProblemButton = saveProblemBtn;
    saveProblemBtn.addEventListener('click', () =>
      showProblemSaveModal(problemSaveModal, problemTitleInput, problemDescInput, fixIOCheck)
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

  const backToChapterBtn = getElement(ids.backToChapterFromUserProblemsBtnId);
  if (backToChapterBtn) {
    backToChapterBtn.addEventListener('click', () => {
      hideElement(ids.userProblemsScreenId);
      showElement(ids.chapterStageScreenId, 'block');
      creationFlowConfig.onRefreshUserData?.();
    });
  }
}

function toggleLikeProblem(key) {
  const nickname = getUsername() || '익명';
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

  listContainer.innerHTML = '';
  const nickname = getUsername() || '익명';
  db.ref('problems').once('value').then(snapshot => {
    listContainer.innerHTML = '';
    const table = document.createElement('table');
    table.id = 'userProblemTable';
    table.innerHTML = `
      <thead>
        <tr>
          <th>${t('thTitle')}</th>
          <th>${t('thGrid')}</th>
          <th>${t('thCreator')}</th>
          <th>${t('thCreatedAt')}</th>
          <th>${t('thSolved')}</th>
          <th>${t('thLikes')}</th>
          <th>${t('thNotes')}</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    if (!snapshot.exists()) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="7">${t('noUserProblems')}</td>`;
      tbody.appendChild(row);
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
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="probTitle">${data.title || child.key}</td>
          <td>${(data.gridRows || 6)}×${(data.gridCols || 6)}</td>
          <td>${data.creator || '익명'}${isMine ? ' (나)' : ''}</td>
          <td>${new Date(data.timestamp).toLocaleDateString()}</td>
          <td>${solved}</td>
          <td><span class="likeCount">${likes}</span> <button class="likeBtn" data-key="${child.key}" aria-label="${t('thLikes')}">♥</button></td>
          <td>${isMine ? `<button class="deleteProbBtn" data-key="${child.key}">${t('deleteBtn')}</button>` : ''}</td>
        `;
        if (solvedByMe) row.classList.add('solved');
        row.addEventListener('click', event => {
          if (event.target.classList.contains('likeBtn') || event.target.classList.contains('deleteProbBtn')) {
            return;
          }
          previewUserProblem(child.key);
        });
        tbody.appendChild(row);
        return false;
      });
    }

    listContainer.appendChild(table);
    listContainer.querySelectorAll('.likeBtn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        toggleLikeProblem(button.dataset.key);
      });
    });
    listContainer.querySelectorAll('.deleteProbBtn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (confirm(t('confirmDelete'))) {
          deleteUserProblem(button.dataset.key);
        }
      });
    });
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

