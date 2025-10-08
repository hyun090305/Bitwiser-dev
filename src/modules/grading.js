const WAIT_BETWEEN_TESTS = 100;

function defaultTranslate(t) {
  return typeof t === 'function' ? t : key => key;
}

function createDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function collectBlocks(circuit) {
  return Object.values(circuit?.blocks || {});
}

function collectWires(circuit) {
  return Object.values(circuit?.wires || {});
}

let confettiLoaderPromise = null;

function loadConfettiLibrary() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  if (typeof window.confetti === 'function') {
    return Promise.resolve(window.confetti);
  }
  if (!confettiLoaderPromise) {
    confettiLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
      script.async = true;
      script.onload = () => resolve(typeof window.confetti === 'function' ? window.confetti : null);
      script.onerror = reject;
      document.head.appendChild(script);
    }).catch(() => null);
  }
  return confettiLoaderPromise;
}

async function launchConfettiCelebration() {
  const confetti = await loadConfettiLibrary();
  if (typeof confetti !== 'function') {
    return;
  }

  const duration = 2000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 25, spread: 360, ticks: 60, gravity: 0.6, scalar: 1.1 };

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const particleCount = Math.round(80 * (timeLeft / duration));

    confetti({
      ...defaults,
      particleCount,
      origin: { x: Math.random() * 0.3 + 0.1, y: Math.random() * 0.2 + 0.1 }
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: Math.random() * 0.3 + 0.6, y: Math.random() * 0.2 + 0.1 }
    });
  }, 250);
}

function validateConnections(circuit, alertFn) {
  const blocks = collectBlocks(circuit);
  for (const block of blocks) {
    if (block.type === 'JUNCTION' || block.type === 'OUTPUT') {
      const incoming = collectWires(circuit).filter(w => w.endBlockId === block.id);
      if (incoming.length > 1) {
        alertFn(`❌ ${block.type} 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.`);
        return false;
      }
    }
  }
  return true;
}

function ensureRequiredOutputs({
  requiredOutputs,
  actualOutputNames,
  alertFn,
  t
}) {
  const missing = requiredOutputs.filter(name => !actualOutputNames.includes(name));
  if (missing.length > 0) {
    alertFn(t('outputMissingAlert').replace('{list}', missing.join(', ')));
    return false;
  }
  return true;
}

function hideElement(el) {
  if (el) el.style.display = 'none';
}

function showElement(el, displayValue = 'block') {
  if (el) el.style.display = displayValue;
}

function prepareGradingArea({ blockPanel, rightPanel, gradingArea }) {
  hideElement(blockPanel);
  hideElement(rightPanel);
  if (gradingArea) {
    showElement(gradingArea, 'block');
    gradingArea.innerHTML = '<b>채점 결과:</b><br><br>';
  }
}

function getOrCreateTable(gradingArea, t) {
  if (!gradingArea) return null;
  let table = gradingArea.querySelector('#gradingTable');
  if (!table) {
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
    table = gradingArea.querySelector('#gradingTable');
  }
  return table;
}

function appendTestResultRow({
  tbody,
  inputText,
  expectedText,
  actualText,
  correct
}) {
  if (!tbody) return;
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
}

function appendSummary(gradingArea, allCorrect) {
  if (!gradingArea) return;
  const summary = document.createElement('div');
  summary.id = 'gradeResultSummary';
  summary.textContent = allCorrect
    ? '🎉 모든 테스트를 통과했습니다!'
    : '😢 일부 테스트에 실패했습니다.';
  gradingArea.appendChild(summary);
}

function appendReturnButton({ gradingArea, t, returnToEditScreen }) {
  if (!gradingArea) return;
  const returnBtn = document.createElement('button');
  returnBtn.id = 'returnToEditBtn';
  returnBtn.textContent = t('returnToEditBtn');
  const handler = typeof returnToEditScreen === 'function' ? returnToEditScreen : () => {};
  returnBtn.addEventListener('click', handler);
  gradingArea.appendChild(returnBtn);
}

function getCircuitStats(circuit) {
  const blockCounts = collectBlocks(circuit).reduce((acc, block) => {
    acc[block.type] = (acc[block.type] || 0) + 1;
    return acc;
  }, {});

  const wireCells = new Set();
  collectWires(circuit).forEach(wire => {
    (wire.path || []).slice(1, -1).forEach(point => {
      wireCells.add(`${point.r},${point.c}`);
    });
  });

  return { blockCounts, usedWires: wireCells.size };
}

async function attemptAutoSave({
  getAutoSaveSetting,
  getCurrentUser,
  saveCircuit,
  updateSaveProgress,
  elements,
  t,
  alertFn
}) {
  const autoSaveEnabled = typeof getAutoSaveSetting === 'function' && getAutoSaveSetting();
  let saveSuccess = false;
  let loginNeeded = false;
  let statusMessage = '';
  const toast = elements?.toast ?? {};

  if (!autoSaveEnabled) {
    return { saveSuccess, loginNeeded, statusMessage };
  }

  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!currentUser) {
    loginNeeded = true;
    statusMessage = t('loginToSaveCircuit');
    return { saveSuccess, loginNeeded, statusMessage };
  }

  try {
    if (toast.showCircuitSaving) {
      toast.showCircuitSaving(t('savingCircuit'));
    }
    if (typeof updateSaveProgress === 'function') {
      updateSaveProgress(0);
    }
    if (typeof saveCircuit === 'function') {
      await saveCircuit(updateSaveProgress);
      saveSuccess = true;
    }
    statusMessage = t('circuitSaved');
  } catch (error) {
    if (typeof alertFn === 'function') {
      alertFn(t('saveFailed').replace('{error}', error));
    }
  } finally {
    if (toast.hideCircuitSaving) {
      toast.hideCircuitSaving();
    }
    if (typeof updateSaveProgress === 'function') {
      updateSaveProgress(0);
    }
  }

  return { saveSuccess, loginNeeded, statusMessage };
}

async function runTestCases({
  circuit,
  testCases,
  evaluateCircuit,
  gradingArea,
  t
}) {
  const blocks = collectBlocks(circuit);
  const inputs = blocks.filter(block => block.type === 'INPUT');
  const outputs = blocks.filter(block => block.type === 'OUTPUT');
  let allCorrect = true;

  for (const test of testCases) {
    inputs.forEach(input => {
      input.value = test.inputs[input.name] ?? 0;
    });

    const maybePromise = evaluateCircuit(circuit);
    if (maybePromise && typeof maybePromise.then === 'function') {
      await maybePromise;
    }
    await createDelay(WAIT_BETWEEN_TESTS);

    let correct = true;
    const actualText = outputs
      .map(output => {
        const actual = output.value ? 1 : 0;
        const expected = test.expected[output.name];
        if (actual !== expected) {
          correct = false;
        }
        return `${output.name}=${actual}`;
      })
      .join(', ');

    const expectedText = Object.entries(test.expected)
      .map(([name, value]) => `${name}=${value}`)
      .join(', ');
    const inputText = Object.entries(test.inputs)
      .map(([name, value]) => `${name}=${value}`)
      .join(', ');

    const table = getOrCreateTable(gradingArea, t);
    const tbody = table ? table.querySelector('tbody') : null;
    appendTestResultRow({
      tbody,
      inputText,
      expectedText,
      actualText,
      correct
    });

    if (!correct) {
      allCorrect = false;
    }
  }

  appendSummary(gradingArea, allCorrect);
  return allCorrect;
}

export function createGradingController(config = {}) {
  const {
    getPlayCircuit,
    getLevelAnswer,
    getLevelBlockSet,
    getCurrentLevel,
    getActiveCustomProblem,
    getActiveCustomProblemKey,
    getHintProgress,
    getAutoSaveSetting,
    getCurrentUser,
    saveCircuit,
    updateSaveProgress,
    showCircuitSavedModal,
    markLevelCleared,
    saveRanking,
    saveProblemRanking,
    getUsername,
    db,
    t,
    alert: alertFn,
    returnToEditScreen,
    elements = {}
  } = config;

  const translate = defaultTranslate(t);
  const alertSafe = typeof alertFn === 'function'
    ? alertFn
    : message => {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(message);
        }
      };
  const overlay = elements.overlay || null;
  let isScoring = false;
  let pendingClearedLevel = null;

  function showOverlay(show) {
    if (overlay) {
      overlay.style.display = show ? 'block' : 'none';
    }
  }

  function setIsScoring(value) {
    isScoring = Boolean(value);
    if (typeof window !== 'undefined') {
      window.isScoring = Boolean(value);
    }
    if (!isScoring) {
      showOverlay(false);
    }
  }

  async function gradeLevel(level) {
    const testCases = typeof getLevelAnswer === 'function' ? getLevelAnswer(level) : null;
    const circuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    if (!testCases || !circuit) return;

    if (!validateConnections(circuit, alertSafe)) {
      return;
    }

    const requiredOutputs = (typeof getLevelBlockSet === 'function' ? getLevelBlockSet(level) : []);
    const requiredOutputNames = requiredOutputs
      .filter(block => block.type === 'OUTPUT')
      .map(block => block.name);
    const actualOutputNames = collectBlocks(circuit)
      .filter(block => block.type === 'OUTPUT')
      .map(block => block.name);

    if (!ensureRequiredOutputs({
      requiredOutputs: requiredOutputNames,
      actualOutputNames,
      alertFn: alertSafe,
      t: translate
    })) {
      return;
    }

    prepareGradingArea({
      blockPanel: elements.blockPanel,
      rightPanel: elements.rightPanel,
      gradingArea: elements.gradingArea
    });

    const { evaluateCircuit } = await import('../canvas/engine.js');
    const allCorrect = await runTestCases({
      circuit,
      testCases,
      evaluateCircuit,
      gradingArea: elements.gradingArea,
      t: translate
    });

    if (allCorrect) {
      launchConfettiCelebration();
    }

    appendReturnButton({ gradingArea: elements.gradingArea, t: translate, returnToEditScreen });

    if (!allCorrect) {
      return;
    }

    const { saveSuccess, loginNeeded, statusMessage } = await attemptAutoSave({
      getAutoSaveSetting,
      getCurrentUser,
      saveCircuit,
      updateSaveProgress,
      elements,
      t: translate,
      alertFn: alertSafe
    });

    const { blockCounts, usedWires } = getCircuitStats(circuit);
    const hintsUsed = typeof getHintProgress === 'function' ? getHintProgress(level) : 0;
    const nickname = typeof getUsername === 'function' ? getUsername() || '익명' : '익명';

    const rankingsRef = db && typeof db.ref === 'function' ? db.ref(`rankings/${level}`) : null;
    pendingClearedLevel = null;

    if (!rankingsRef || typeof rankingsRef.orderByChild !== 'function') {
      if (typeof markLevelCleared === 'function') {
        markLevelCleared(level);
      }
      if ((saveSuccess || loginNeeded) && typeof showCircuitSavedModal === 'function') {
        showCircuitSavedModal({
          message: statusMessage,
          canShare: saveSuccess,
          loginRequired: loginNeeded
        });
      }
      return;
    }

    rankingsRef
      .orderByChild('nickname')
      .equalTo(nickname)
      .once('value', snapshot => {
        if (!snapshot.exists()) {
          if (typeof saveRanking === 'function') {
            saveRanking(level, blockCounts, usedWires, hintsUsed);
          }
          pendingClearedLevel = level;
          if (typeof markLevelCleared === 'function') {
            markLevelCleared(level);
          }
        } else {
          let best = null;
          snapshot.forEach(child => {
            const entry = child.val();
            const oldBlocks = Object.values(entry.blockCounts || {}).reduce((sum, count) => sum + count, 0);
            const newBlocks = Object.values(blockCounts).reduce((sum, count) => sum + count, 0);
            const oldWires = entry.usedWires;
            const newWires = usedWires;
            if (newBlocks < oldBlocks || (newBlocks === oldBlocks && newWires < oldWires)) {
              best = { key: child.key };
              return false;
            }
            return undefined;
          });
          if (best) {
            rankingsRef.child(best.key).update({
              blockCounts,
              usedWires,
              hintsUsed,
              timestamp: new Date().toISOString()
            });
            pendingClearedLevel = level;
            if (typeof markLevelCleared === 'function') {
              markLevelCleared(level);
            }
          }
        }
        if ((saveSuccess || loginNeeded) && typeof showCircuitSavedModal === 'function') {
          showCircuitSavedModal({
            message: statusMessage,
            canShare: saveSuccess,
            loginRequired: loginNeeded
          });
        }
      });
  }

  async function gradeCustomProblem() {
    const problem = typeof getActiveCustomProblem === 'function' ? getActiveCustomProblem() : null;
    const key = typeof getActiveCustomProblemKey === 'function' ? getActiveCustomProblemKey() : null;
    if (!problem) return;

    const circuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    if (!circuit) return;

    if (!validateConnections(circuit, alertSafe)) {
      return;
    }

    const inNames = Array.from({ length: problem.inputCount }, (_, index) => `IN${index + 1}`);
    const outNames = Array.from({ length: problem.outputCount }, (_, index) => `OUT${index + 1}`);

    const requiredOutputs = outNames;
    const actualOutputNames = collectBlocks(circuit)
      .filter(block => block.type === 'OUTPUT')
      .map(block => block.name);

    if (!ensureRequiredOutputs({
      requiredOutputs,
      actualOutputNames,
      alertFn: alertSafe,
      t: translate
    })) {
      return;
    }

    prepareGradingArea({
      blockPanel: elements.blockPanel,
      rightPanel: elements.rightPanel,
      gradingArea: elements.gradingArea
    });

    const testCases = problem.table.map(row => ({
      inputs: Object.fromEntries(inNames.map(name => [name, row[name]])),
      expected: Object.fromEntries(outNames.map(name => [name, row[name]]))
    }));

    const { evaluateCircuit } = await import('../canvas/engine.js');
    const allCorrect = await runTestCases({
      circuit,
      testCases,
      evaluateCircuit,
      gradingArea: elements.gradingArea,
      t: translate
    });

    appendReturnButton({ gradingArea: elements.gradingArea, t: translate, returnToEditScreen });

    if (!allCorrect || !key) {
      return;
    }

    const { blockCounts, usedWires } = getCircuitStats(circuit);
    const hintsUsed = typeof getHintProgress === 'function' ? getHintProgress(key) : 0;
    if (typeof saveProblemRanking === 'function') {
      saveProblemRanking(key, blockCounts, usedWires, hintsUsed);
    }
  }

  async function gradeCurrentSelection() {
    if (isScoring) return;

    const customProblem = typeof getActiveCustomProblem === 'function' ? getActiveCustomProblem() : null;
    const level = typeof getCurrentLevel === 'function' ? getCurrentLevel() : null;
    if (!customProblem && level == null) return;

    setIsScoring(true);
    showOverlay(true);
    try {
      if (customProblem) {
        await gradeCustomProblem();
      } else {
        await gradeLevel(level);
      }
    } finally {
      setIsScoring(false);
    }
  }

  function consumePendingClearedLevel() {
    const level = pendingClearedLevel;
    pendingClearedLevel = null;
    return level;
  }

  if (typeof window !== 'undefined') {
    window.isScoring = false;
  }

  return {
    gradeCurrentSelection,
    gradeLevel,
    gradeCustomProblem,
    setIsScoring,
    isScoring: () => isScoring,
    consumePendingClearedLevel
  };
}

