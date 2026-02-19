import { triggerConfetti } from './confetti.js';

const WAIT_BETWEEN_TESTS = 320;

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

function validateConnections(circuit, alertFn, t = key => key) {
  const blocks = collectBlocks(circuit);
  for (const block of blocks) {
    if (block.type === 'JUNCTION' || block.type === 'OUTPUT') {
      const incoming = collectWires(circuit).filter(w => w.endBlockId === block.id);
      if (incoming.length > 1) {
        const template = t('gradingMultipleInputs');
        const message = typeof template === 'string' && template !== 'gradingMultipleInputs'
          ? template
          : `❌ ${block.type} 블록에 여러 입력이 연결되어 있습니다. 회로를 수정해주세요.`;
        alertFn(message.replace('{blockType}', block.type));
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

function translateOrFallback(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : null;
  return typeof value === 'string' && value !== key ? value : fallback;
}

function getInlineStatusElements(inlineStatus) {
  if (!inlineStatus) return null;
  return {
    container: inlineStatus,
    title: inlineStatus.querySelector('#gradingStatusTitle'),
    percent: inlineStatus.querySelector('#gradingStatusPercent'),
    fill: inlineStatus.querySelector('#gradingStatusFill'),
    text: inlineStatus.querySelector('#gradingStatusText'),
    detail: inlineStatus.querySelector('#gradingStatusCase')
  };
}

function setInlineStatus(ui, { title, percent, text, detail, state }) {
  if (!ui || !ui.container) return;
  ui.container.hidden = false;
  ui.container.dataset.state = state || 'running';
  if (ui.title && typeof title === 'string') ui.title.textContent = title;
  if (ui.percent && Number.isFinite(percent)) ui.percent.textContent = `${percent}%`;
  if (ui.fill && Number.isFinite(percent)) {
    ui.fill.style.width = `${percent}%`;
  }
  if (ui.text && typeof text === 'string') ui.text.textContent = text;
  if (ui.detail && typeof detail === 'string') ui.detail.textContent = detail;
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
  inlineStatus,
  t
}) {
  const blocks = collectBlocks(circuit);
  const inputs = blocks.filter(block => block.type === 'INPUT');
  const outputs = blocks.filter(block => block.type === 'OUTPUT');
  const totalTests = testCases.length;
  let passedCount = 0;
  const ui = getInlineStatusElements(inlineStatus);
  const inputLabel = translateOrFallback(t, 'thInput', 'Input');
  const expectedLabel = translateOrFallback(t, 'thExpected', 'Expected');
  const actualLabel = translateOrFallback(t, 'thActual', 'Actual');
  const passedLabel = translateOrFallback(t, 'gradingCorrect', '✅ Correct');
  const failedLabel = translateOrFallback(t, 'gradingIncorrect', '❌ Incorrect');
  const passSummary = translateOrFallback(t, 'gradingAllPassed', '🎉 All simulation cases passed!');
  const progressTitle = translateOrFallback(t, 'gradingResultsHeading', '시뮬레이션 진행');
  const safeTotal = Math.max(1, totalTests);

  setInlineStatus(ui, {
    title: progressTitle.replace(/<[^>]+>/g, '').replace(':', '').trim() || '시뮬레이션 진행',
    percent: 0,
    text: `${totalTests} cases`,
    detail: '',
    state: 'running'
  });

  if (totalTests === 0) {
    setInlineStatus(ui, {
      title: progressTitle.replace(/<[^>]+>/g, '').replace(':', '').trim() || '시뮬레이션 진행',
      percent: 100,
      text: passSummary,
      detail: '',
      state: 'passed'
    });
    return true;
  }

  for (let index = 0; index < totalTests; index += 1) {
    const test = testCases[index];
    const caseNumber = index + 1;
    const inputText = Object.entries(test.inputs)
      .map(([name, value]) => `${name}=${value}`)
      .join(', ');
    setInlineStatus(ui, {
      title: progressTitle.replace(/<[^>]+>/g, '').replace(':', '').trim() || '시뮬레이션 진행',
      percent: Math.floor((passedCount / safeTotal) * 100),
      text: `Case ${caseNumber}/${totalTests}`,
      detail: `${inputLabel}: ${inputText}`,
      state: 'running'
    });

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

    if (!correct) {
      setInlineStatus(ui, {
        title: progressTitle.replace(/<[^>]+>/g, '').replace(':', '').trim() || '시뮬레이션 진행',
        percent: Math.floor((passedCount / safeTotal) * 100),
        text: `${failedLabel} (${caseNumber}/${totalTests})`,
        detail: `${inputLabel}: ${inputText}\n${expectedLabel}: ${expectedText}\n${actualLabel}: ${actualText}`,
        state: 'failed'
      });
      return false;
    }
    passedCount += 1;
    setInlineStatus(ui, {
      title: progressTitle.replace(/<[^>]+>/g, '').replace(':', '').trim() || '시뮬레이션 진행',
      percent: Math.floor((passedCount / safeTotal) * 100),
      text: `${passedLabel} (${caseNumber}/${totalTests})`,
      detail: `${inputLabel}: ${inputText}\n${expectedLabel}: ${expectedText}\n${actualLabel}: ${actualText}`,
      state: 'running'
    });
  }

  setInlineStatus(ui, {
    title: progressTitle.replace(/<[^>]+>/g, '').replace(':', '').trim() || '시뮬레이션 진행',
    percent: 100,
    text: passSummary,
    detail: '',
    state: 'passed'
  });
  return true;
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
    showClearedModal,
    showClearedModalOptions,
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
  const gradeButton = elements.gradeButton || null;
  const inlineStatus = elements.gradingInlineStatus || null;
  const inlineBackButton = inlineStatus?.querySelector('#gradingInlineBackBtn') || null;
  let isScoring = false;
  let inlineStatusOpen = false;
  let pendingClearedLevel = null;
  const shownClearedLevels = new Set();

  function syncOverlay() {
    const statusVisible = inlineStatus ? !inlineStatus.hidden : inlineStatusOpen;
    if (overlay) {
      overlay.style.display = isScoring || statusVisible ? 'block' : 'none';
    }
  }

  function setInlineStatusOpen(open) {
    inlineStatusOpen = Boolean(open);
    if (inlineStatus) {
      inlineStatus.hidden = !inlineStatusOpen;
    }
    if (gradeButton) {
      gradeButton.style.display = inlineStatusOpen ? 'none' : '';
    }
    syncOverlay();
  }

  function setIsScoring(value) {
    isScoring = Boolean(value);
    if (typeof window !== 'undefined') {
      window.isScoring = Boolean(value);
    }
    syncOverlay();
  }

  if (inlineBackButton) {
    inlineBackButton.textContent = translateOrFallback(translate, 'returnToEditBtn', '🛠 Back to Edit');
    inlineBackButton.addEventListener('click', () => {
      setInlineStatusOpen(false);
      const handler = typeof returnToEditScreen === 'function' ? returnToEditScreen : null;
      if (handler) handler();
    });
  }

  async function gradeLevel(level) {
    const testCases = typeof getLevelAnswer === 'function' ? getLevelAnswer(level) : null;
    const circuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    if (!testCases || !circuit) return;

    if (!validateConnections(circuit, alertSafe, translate)) {
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
    setInlineStatusOpen(true);

    const { evaluateCircuit } = await import('../canvas/engine.js');
    const allCorrect = await runTestCases({
      circuit,
      testCases,
      evaluateCircuit,
      inlineStatus,
      t: translate
    });

    if (!allCorrect) {
      return;
    }

    triggerConfetti();

    // Start auto-save in background so UI (cleared modal) is not blocked by save
    const savePromise = attemptAutoSave({
      getAutoSaveSetting,
      getCurrentUser,
      saveCircuit,
      updateSaveProgress,
      elements,
      t: translate,
      alertFn: alertSafe
    });

    // Immediately mark level cleared and show cleared modal (don't wait for save)
    const { blockCounts, usedWires } = getCircuitStats(circuit);
    const hintsUsed = typeof getHintProgress === 'function' ? getHintProgress(level) : 0;
    const anonymousLabel = (() => {
      const value = translate('anonymousUser');
      return typeof value === 'string' && value !== 'anonymousUser' ? value : '익명';
    })();
    const nickname = typeof getUsername === 'function'
      ? getUsername() || anonymousLabel
      : anonymousLabel;

    // Mark cleared now and show modal immediately
    pendingClearedLevel = level;
    if (typeof markLevelCleared === 'function') {
      markLevelCleared(level);
    }
    if (typeof showClearedModal === 'function') {
      try {
        showClearedModal(level, showClearedModalOptions || {});
        shownClearedLevels.add(level);
      } catch (e) {
        // ignore UI errors
      }
    }
    // Clear pending flag so saved-modal continuation won't duplicate the cleared modal
    pendingClearedLevel = null;

    const rankingsRef = db && typeof db.ref === 'function' ? db.ref(`rankings/${level}`) : null;

    if (!rankingsRef || typeof rankingsRef.orderByChild !== 'function') {
      // When there is no rankings DB, simply show saved modal once save completes (if needed)
      savePromise.then(({ saveSuccess, loginNeeded, statusMessage } = {}) => {
        if ((saveSuccess || loginNeeded) && typeof showCircuitSavedModal === 'function') {
          showCircuitSavedModal({
            message: statusMessage,
            canShare: saveSuccess,
            loginRequired: loginNeeded
          });
        }
      }).catch(() => {});
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
          if (!shownClearedLevels.has(level)) {
            pendingClearedLevel = level;
            if (typeof markLevelCleared === 'function') {
              markLevelCleared(level);
            }
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
            if (!shownClearedLevels.has(level)) {
              pendingClearedLevel = level;
              if (typeof markLevelCleared === 'function') {
                markLevelCleared(level);
              }
            }
          }
        }

        // When ranking logic completes, show saved modal if save result requires it
        savePromise.then(({ saveSuccess, loginNeeded, statusMessage } = {}) => {
          if ((saveSuccess || loginNeeded) && typeof showCircuitSavedModal === 'function') {
            showCircuitSavedModal({
              message: statusMessage,
              canShare: saveSuccess,
              loginRequired: loginNeeded
            });
          }
        }).catch(() => {});
      });
  }

  async function gradeCustomProblem() {
    const problem = typeof getActiveCustomProblem === 'function' ? getActiveCustomProblem() : null;
    const key = typeof getActiveCustomProblemKey === 'function' ? getActiveCustomProblemKey() : null;
    if (!problem) return;

    const circuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    if (!circuit) return;

    if (!validateConnections(circuit, alertSafe, translate)) {
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
    setInlineStatusOpen(true);

    const testCases = problem.table.map(row => ({
      inputs: Object.fromEntries(inNames.map(name => [name, row[name]])),
      expected: Object.fromEntries(outNames.map(name => [name, row[name]]))
    }));

    const { evaluateCircuit } = await import('../canvas/engine.js');
    const allCorrect = await runTestCases({
      circuit,
      testCases,
      evaluateCircuit,
      inlineStatus,
      t: translate
    });

    if (!allCorrect || !key) {
      return;
    }

    triggerConfetti();

    const { blockCounts, usedWires } = getCircuitStats(circuit);
    const hintsUsed = typeof getHintProgress === 'function' ? getHintProgress(key) : 0;
    if (typeof saveProblemRanking === 'function') {
      saveProblemRanking(key, blockCounts, usedWires, hintsUsed);
    }

    if (typeof showClearedModal === 'function') {
      showClearedModal(key, {
        ...showClearedModalOptions,
        isCustomProblem: true,
        customTitle: problem.title || 'Custom Problem',
        onClearCustomProblem: typeof clearActiveCustomProblem === 'function' ? clearActiveCustomProblem : null
      });
    }
  }

  async function gradeCurrentSelection() {
    if (isScoring) return;

    const customProblem = typeof getActiveCustomProblem === 'function' ? getActiveCustomProblem() : null;
    const level = typeof getCurrentLevel === 'function' ? getCurrentLevel() : null;
    if (!customProblem && level == null) return;

    setIsScoring(true);
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

