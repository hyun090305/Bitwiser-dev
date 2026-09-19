import { gradeCircuit } from './circuitGrading.js';
import { pauseCircuit } from '../canvas/tickRunner.js';
import { getCircuitStats, snapshotCircuit } from '../canvas/circuitData.js';
import { triggerConfetti } from './confetti.js';
import { formatBlockLabels } from '../blockLabel.js';
import { createGradingResultView } from './gradingResultView.js';
import { storageErrorMessage } from './circuitStorage.js';

function defaultTranslate(t) {
  return typeof t === 'function' ? t : key => key;
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
  if (ui.title && typeof title === 'string') ui.title.textContent = formatBlockLabels(title);
  if (ui.percent && Number.isFinite(percent)) ui.percent.textContent = `${percent}%`;
  if (ui.fill && Number.isFinite(percent)) {
    ui.fill.style.width = `${percent}%`;
  }
  if (ui.text && typeof text === 'string') ui.text.textContent = formatBlockLabels(text);
  if (ui.detail && typeof detail === 'string') ui.detail.textContent = formatBlockLabels(detail);
}

async function attemptAutoSave({
  getAutoSaveSetting,
  saveCircuit,
  updateSaveProgress,
  elements,
  t,
  alertFn
}) {
  const autoSaveEnabled = typeof getAutoSaveSetting === 'function' && getAutoSaveSetting();
  let saveSuccess = false;
  let statusMessage = '';
  const toast = elements?.toast ?? {};

  if (!autoSaveEnabled) {
    return { saveSuccess, statusMessage };
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
      alertFn(storageErrorMessage(error, t));
    }
  } finally {
    if (toast.hideCircuitSaving) {
      toast.hideCircuitSaving();
    }
    if (typeof updateSaveProgress === 'function') {
      updateSaveProgress(0);
    }
  }

  return { saveSuccess, statusMessage };
}

async function runVerification({ circuit, testCases, inlineStatus, t, signal, ports }) {
  const ui = getInlineStatusElements(inlineStatus);
  const tr = (key, fallback) => translateOrFallback(t, key, fallback);
  const title = tr('gradingVerifying', '회로 검증 중…');
  const stats = result => tr('gradingSearchStats', '상태 {states}개 · 전이 {transitions}개 검사')
    .replace('{states}', result.states || 0).replace('{transitions}', result.transitions || 0);
  if (ui?.percent) ui.percent.hidden = true;
  if (ui?.fill?.parentElement) ui.fill.parentElement.hidden = true;
  setInlineStatus(ui, { title, text: stats({}), detail: '', state: 'running' });
  const result = await gradeCircuit(circuit, testCases, {
    signal, ports,
    onProgress(progress) {
      if (!signal?.aborted) setInlineStatus(ui, { title, text: stats(progress), detail: '', state: 'running' });
    }
  });
  // Returning to the editor must not reopen the grading panel asynchronously.
  if (signal?.aborted || result.cancelled) return null;
  return result;
}

export function createGradingController(config = {}) {
  const {
    getPlayCircuit,
    onPassed,
    onScoringChange,
    getLevelAnswer,
    getLevelBlockSet,
    getCurrentLevel,
    getActiveCustomProblem,
    getActiveCustomProblemKey,
    getHintProgress,
    getAutoSaveSetting,
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
  let activeAbort = null;
  let inlineStatusOpen = false;
  let pendingClearedLevel = null;
  const shownClearedLevels = new Set();
  let resultOpen = false;
  const resultView = createGradingResultView({
    getCircuit: getPlayCircuit, getTraceView: config.getTraceView,
    onClose: () => setResultOpen(false),
    onEdit: () => { setInlineStatusOpen(false); returnToEditScreen?.(); gradeButton?.focus(); }
  });

  function setResultOpen(open) {
    resultOpen = Boolean(open);
    if (typeof window !== 'undefined') {
      window.isGradingResultOpen = resultOpen;
      document.body.classList.toggle('grading-result-mode', resultOpen);
      document.dispatchEvent(new Event('bitwiser:scoring'));
    }
    if (gradeButton) gradeButton.style.display = resultOpen || inlineStatusOpen ? 'none' : '';
  }

  async function verifySelection(args, stage) {
    const result = await runVerification(args);
    if (!result) return false;
    setInlineStatusOpen(false);
    setResultOpen(true);
    // Dedicated success views keep their cost records/rankings and use the
    // shared result shell; all other outcomes use this trace-capable view.
    if (!result.ok || (!onPassed && !showClearedModal)) resultView?.show(result, { stage });
    return result.ok;
  }

  function cancel({ restoreFocus = false } = {}) {
    activeAbort?.abort();
    resultView?.close({ restoreFocus });
    setResultOpen(false);
    setInlineStatusOpen(false);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('bitwiser:leavePlay', cancel);
    document.addEventListener('bitwiser:editCircuit', cancel);
  }

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
      gradeButton.style.display = inlineStatusOpen || resultOpen ? 'none' : '';
    }
    syncOverlay();
  }

  function setIsScoring(value) {
    isScoring = Boolean(value);
    if (isScoring) pauseCircuit(getPlayCircuit?.());
    onScoringChange?.(isScoring);
    if (typeof window !== 'undefined') {
      window.isScoring = Boolean(value);
      document.dispatchEvent(new Event('bitwiser:scoring'));
    }
    syncOverlay();
  }

  if (inlineBackButton) {
    inlineBackButton.textContent = translateOrFallback(translate, 'returnToEditBtn', '🛠 Back to Edit');
    inlineBackButton.addEventListener('click', () => {
      activeAbort?.abort();
      setInlineStatusOpen(false);
      const handler = typeof returnToEditScreen === 'function' ? returnToEditScreen : null;
      if (handler) handler();
    });
  }

  async function gradeLevel(level) {
    const testCases = typeof getLevelAnswer === 'function' ? getLevelAnswer(level) : null;
    const liveCircuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    const circuit = liveCircuit ? snapshotCircuit(liveCircuit) : null;
    if (!testCases || !circuit) return;

    const blockSet = typeof getLevelBlockSet === 'function' ? getLevelBlockSet(level) : null;
    const ports = blockSet ? {
      inputs: blockSet.filter(b => b.type === 'INPUT').map(b => b.name),
      outputs: blockSet.filter(b => b.type === 'OUTPUT').map(b => b.name)
    } : undefined;
    setInlineStatusOpen(true);

    const allCorrect = await verifySelection({ circuit, testCases, inlineStatus, t: translate, signal: activeAbort?.signal, ports }, level);
    if (allCorrect && onPassed) {
      triggerConfetti();
      await onPassed(Number(level), snapshotCircuit(circuit));
      attemptAutoSave({ getAutoSaveSetting, saveCircuit, updateSaveProgress, elements, t: translate, alertFn: alertSafe })
        .then(({ saveSuccess, statusMessage }) => {
          if (saveSuccess && typeof showCircuitSavedModal === 'function') {
            showCircuitSavedModal({ message: statusMessage, canShare: saveSuccess });
          }
        }).catch(error => console.warn('Circuit autosave failed', error));
      return;
    }

    if (!allCorrect) {
      return;
    }

    triggerConfetti();

    // Start auto-save in background so UI (cleared modal) is not blocked by save
    const savePromise = attemptAutoSave({
      getAutoSaveSetting,
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

    // Record progress before showing the cleared modal.
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
      savePromise.then(({ saveSuccess, statusMessage } = {}) => {
        if (saveSuccess && typeof showCircuitSavedModal === 'function') {
          showCircuitSavedModal({
            message: statusMessage,
            canShare: saveSuccess,
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
        savePromise.then(({ saveSuccess, statusMessage } = {}) => {
          if (saveSuccess && typeof showCircuitSavedModal === 'function') {
            showCircuitSavedModal({
              message: statusMessage,
              canShare: saveSuccess
            });
          }
        }).catch(() => {});
      });
  }

  async function gradeCustomProblem() {
    const problem = typeof getActiveCustomProblem === 'function' ? getActiveCustomProblem() : null;
    const key = typeof getActiveCustomProblemKey === 'function' ? getActiveCustomProblemKey() : null;
    if (!problem) return;

    const liveCircuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    const circuit = liveCircuit ? snapshotCircuit(liveCircuit) : null;
    if (!circuit) return;

    const inNames = Array.from({ length: problem.inputCount }, (_, index) => `IN${index + 1}`);
    const outNames = Array.from({ length: problem.outputCount }, (_, index) => `OUT${index + 1}`);
    setInlineStatusOpen(true);

    const testCases = problem.table.map(row => ({
      inputs: Object.fromEntries(inNames.map(name => [name, row[name]])),
      expected: Object.fromEntries(outNames.map(name => [name, row[name]]))
    }));

    const allCorrect = await verifySelection({
      circuit,
      testCases,
      ports: { inputs: inNames, outputs: outNames },
      signal: activeAbort?.signal,
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

    return withScoring(() => customProblem ? gradeCustomProblem() : gradeLevel(level));
  }

  async function withScoring(work) {
    if (isScoring) return;
    activeAbort = new AbortController();
    try { setIsScoring(true); return await work(); }
    catch (error) {
      if (!activeAbort?.signal.aborted) {
        setInlineStatusOpen(false); setResultOpen(true);
        resultView?.show({ status: 'invalid', diagnostics: [{ message: error.message }] });
      }
    } finally {
      activeAbort = null;
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
    gradeLevel: level => withScoring(() => gradeLevel(level)),
    gradeCustomProblem: () => withScoring(gradeCustomProblem),
    cancel,
    destroy() {
      cancel(); resultView?.destroy();
      if (typeof document !== 'undefined') {
        document.removeEventListener('bitwiser:leavePlay', cancel);
        document.removeEventListener('bitwiser:editCircuit', cancel);
      }
    },
    setIsScoring,
    isScoring: () => isScoring,
    consumePendingClearedLevel
  };
}
