import { CIRCUIT_VERSION, snapshotCircuit, getCircuitStats } from '../canvas/circuitData.js';
import { resetExecution } from '../canvas/evaluation.js';
import { getActiveCircuit, getActiveController, markCircuitModified } from './grid.js';
import { getCurrentLevel, getLevelTitle, getLoadedStageData } from './levels.js';
import { validateStageCircuit } from './stageCircuit.js';
import { validateSavedCircuitRecord, matchesSaveContext } from './savedCircuitRecord.js';
import { circuitStorage, isCircuitStorageAvailable, storageErrorMessage } from './circuitStorage.js';

const CURRENT_CIRCUIT_VERSION = CIRCUIT_VERSION;

let elements = {};
let toastUI = {
  showGifLoading: null,
  hideGifLoading: null,
  showCircuitSaving: null,
  updateCircuitSaving: null,
  hideCircuitSaving: null,
  showCircuitSaved: null
};
let translate = key => key;
let alertFn = typeof window !== 'undefined' && typeof window.alert === 'function'
  ? window.alert.bind(window)
  : message => console.log('Alert:', message);
let confirmFn = typeof window !== 'undefined' && typeof window.confirm === 'function'
  ? window.confirm.bind(window)
  : () => true;
let getCustomProblem = () => null;
let getCustomProblemKey = () => null;
let externalLastSavedKeyChange = () => {};
let lastSavedKey = null;

const statusShareHandlers = {
  copyStatus: null,
  copyShare: null,
  closeShare: null,
  savedShare: null
};

let statusShareElements = {
  shareModal: null,
  shareText: null,
  copyShareBtn: null,
  closeShareBtn: null,
  copyStatusBtn: null,
  savedShareBtn: null,
  savedModal: null
};

let statusShareConfig = {
  getClearedLevels: () => [],
  getLevelTitles: () => ({}),
  translate: key => key,
  alert: message => console.log('Alert:', message)
};

let currentGifBlob = null;
let currentGifUrl = null;

function getTranslation(key) {
  if (typeof translate !== 'function') return null;
  const result = translate(key);
  if (typeof result === 'string' && result !== key) {
    return result;
  }
  return null;
}

function translateText(key, fallback) {
  const value = getTranslation(key);
  return value ?? fallback;
}

function notifyLastSavedKeyChange(key) {
  lastSavedKey = key;
  try {
    externalLastSavedKeyChange(key);
  } catch (err) {
    console.error('onLastSavedKeyChange callback failed:', err);
  }
}

export function initializeCircuitShare({
  elements: providedElements = {},
  translate: translateFn,
  alert: providedAlert,
  confirm: providedConfirm,
  getCurrentCustomProblem,
  getCurrentCustomProblemKey,
  onLastSavedKeyChange: handleLastSavedKey,
  ui: toastHooks = {}
} = {}) {
  elements = { ...providedElements };
  if (typeof translateFn === 'function') translate = translateFn;
  if (typeof providedAlert === 'function') alertFn = providedAlert;
  if (typeof providedConfirm === 'function') confirmFn = providedConfirm;
  if (typeof getCurrentCustomProblem === 'function') getCustomProblem = getCurrentCustomProblem;
  if (typeof getCurrentCustomProblemKey === 'function') getCustomProblemKey = getCurrentCustomProblemKey;
  externalLastSavedKeyChange = typeof handleLastSavedKey === 'function' ? handleLastSavedKey : () => {};
  toastUI = {
    showGifLoading: typeof toastHooks.showGifLoading === 'function' ? toastHooks.showGifLoading : null,
    hideGifLoading: typeof toastHooks.hideGifLoading === 'function' ? toastHooks.hideGifLoading : null,
    showCircuitSaving: typeof toastHooks.showCircuitSaving === 'function' ? toastHooks.showCircuitSaving : null,
    updateCircuitSaving: typeof toastHooks.updateCircuitSaving === 'function' ? toastHooks.updateCircuitSaving : null,
    hideCircuitSaving: typeof toastHooks.hideCircuitSaving === 'function' ? toastHooks.hideCircuitSaving : null,
    showCircuitSaved: typeof toastHooks.showCircuitSaved === 'function' ? toastHooks.showCircuitSaved : null
  };
}

export function configureCircuitStorageUI() {
  const available = isCircuitStorageAvailable();
  for (const id of ['saveCircuitBtn', 'viewSavedBtn', 'autoSaveCheckbox']) {
    const el = document.getElementById(id);
    if (el) { el.disabled = !available; if (!available) el.title = translate('nativeSaveUnavailable'); }
  }
  const note = document.getElementById('nativeSaveNotice');
  if (note) note.hidden = available;
}

function translateShare(key, fallback) {
  const translator = statusShareConfig.translate;
  if (typeof translator === 'function') {
    const result = translator(key);
    if (typeof result === 'string' && result !== key) {
      return result;
    }
  }
  return fallback;
}

function showStatusShareAlert(messageKey, fallback) {
  const message = translateShare(messageKey, fallback);
  const alertImpl = statusShareConfig.alert;
  if (typeof alertImpl === 'function') {
    alertImpl(message);
  } else {
    console.log('Alert:', message);
  }
}

function buildStatusShareString() {
  const lines = [];
  const locationInfo = typeof window !== 'undefined' && window.location
    ? `${window.location.origin}${window.location.pathname}`
    : 'Bitwiser';
  lines.push(translateShare('statusShareIntro', `I played ${locationInfo}`));
  lines.push('');

  const clearedList = statusShareConfig.getClearedLevels?.() ?? [];
  const clearedLevels = new Set(Array.isArray(clearedList) ? clearedList : []);
  const titlesRaw = statusShareConfig.getLevelTitles?.() ?? {};
  const stageNumbers = Object.keys(titlesRaw)
    .map(n => Number(n))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);
  const maxStageNumber = stageNumbers.length
    ? stageNumbers[stageNumbers.length - 1]
    : 0;
  const untitledStage = translateShare('stageUntitled', 'Untitled stage');

  for (let stage = 1; stage <= maxStageNumber; stage += 1) {
    const title = titlesRaw[stage] || '';
    const mark = clearedLevels.has(stage) ? '✅' : '❌';
    const displayTitle = title || untitledStage;
    lines.push(`${displayTitle}: ${mark}`);
  }

  return lines.join('\n');
}

function handleCopyStatusClick() {
  const { shareModal, shareText } = statusShareElements;
  if (!shareText) return;
  shareText.value = buildStatusShareString();
  if (shareModal) {
    shareModal.style.display = 'flex';
  }
  shareText.select?.();
}

async function handleCopyShareClick() {
  const { shareText } = statusShareElements;
  if (!shareText) return;
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(shareText.value);
      showStatusShareAlert('statusShareCopySuccess', '클립보드에 복사되었습니다!');
    } else {
      throw new Error('Clipboard API not supported');
    }
  } catch (err) {
    console.error(err);
    showStatusShareAlert('statusShareCopyFailed', `복사에 실패했습니다: ${err}`);
  }
}

function handleCloseShareClick() {
  const { shareModal } = statusShareElements;
  if (shareModal) {
    shareModal.style.display = 'none';
  }
}

async function handleSavedShareClick() {
  const key = lastSavedKey;
  if (!key) {
    showStatusShareAlert('statusShareNoSavedCircuit', '최근 저장된 회로가 없습니다.');
    return;
  }
  try {
    const blob = await loadGifFromDB(key);
    if (!blob) {
      showStatusShareAlert('statusShareNoGif', '공유할 GIF가 없습니다.');
      return;
    }
    const file = new File([blob], 'circuit.gif', { type: 'image/gif' });
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file] });
    } else {
      showStatusShareAlert('statusShareNotSupported', '공유를 지원하지 않는 브라우저입니다.');
    }
  } catch (err) {
    console.error(err);
    showStatusShareAlert('statusShareFailed', `공유에 실패했습니다: ${err}`);
  }
  if (statusShareElements.savedModal) {
    statusShareElements.savedModal.style.display = 'none';
  }
}

function bindStatusShareElement(name, element, handler, event = 'click') {
  const previousElement = statusShareElements[name];
  if (previousElement && handler) {
    previousElement.removeEventListener(event, handler);
  }
  statusShareElements[name] = element ?? null;
  if (statusShareElements[name] && handler) {
    statusShareElements[name].addEventListener(event, handler);
  }
}

export function initializeStatusShare({
  getClearedLevels,
  getLevelTitles,
  translate: translateFn,
  alert: alertFn,
  elements: {
    shareModal,
    shareText,
    copyShareBtn,
    closeShareBtn,
    copyStatusBtn,
    savedShareBtn,
    savedModal
  } = {}
} = {}) {
  statusShareConfig = {
    getClearedLevels: typeof getClearedLevels === 'function' ? getClearedLevels : () => [],
    getLevelTitles: typeof getLevelTitles === 'function' ? getLevelTitles : () => ({}),
    translate: typeof translateFn === 'function' ? translateFn : key => key,
    alert: typeof alertFn === 'function' ? alertFn : message => console.log('Alert:', message)
  };

  statusShareHandlers.copyStatus = handleCopyStatusClick;
  statusShareHandlers.copyShare = handleCopyShareClick;
  statusShareHandlers.closeShare = handleCloseShareClick;
  statusShareHandlers.savedShare = handleSavedShareClick;

  bindStatusShareElement('shareModal', shareModal);
  bindStatusShareElement('shareText', shareText);
  bindStatusShareElement('copyShareBtn', copyShareBtn, statusShareHandlers.copyShare);
  bindStatusShareElement('closeShareBtn', closeShareBtn, statusShareHandlers.closeShare);
  bindStatusShareElement('copyStatusBtn', copyStatusBtn, statusShareHandlers.copyStatus);
  bindStatusShareElement('savedShareBtn', savedShareBtn, statusShareHandlers.savedShare);
  bindStatusShareElement('savedModal', savedModal);
}

export function updateSaveProgress(percent) {
  if (toastUI.updateCircuitSaving) {
    toastUI.updateCircuitSaving(percent);
  }
}

function revokeGifUrl() {
  if (currentGifUrl) {
    URL.revokeObjectURL(currentGifUrl);
    currentGifUrl = null;
  }
}

export function handleGifModalClose() {
  if (elements.gifModal) {
    elements.gifModal.style.display = 'none';
  }
  if (elements.gifPreview) {
    elements.gifPreview.src = '';
  }
  revokeGifUrl();
  currentGifBlob = null;
}

export function handleGifSaveClick() {
  if (!currentGifUrl) return;
  const link = document.createElement('a');
  link.href = currentGifUrl;
  link.download = 'circuit.gif';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function handleGifCopyClick() {
  if (!currentGifBlob) return;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [currentGifBlob.type]: currentGifBlob })
    ]);
    alertFn(translateText('gifCopySuccess', '이미지가 클립보드에 복사되었습니다.'));
  } catch (err) {
    console.error(err);
    alertFn(translateText('gifCopyFailed', '이미지 복사에 실패했습니다.'));
  }
}

export async function handleGifShareClick() {
  if (!currentGifBlob) return;
  const file = new File([currentGifBlob], 'circuit.gif', { type: 'image/gif' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Bitwiser GIF' });
    } catch (err) {
      console.error(err);
    }
  } else {
    alertFn(translateText('gifShareNotSupported', '이 브라우저에서는 공유하기를 지원하지 않습니다.'));
  }
}

export function handleGIFExport() {
  const loadingMessage = translate('gifLoadingText');
  if (toastUI.showGifLoading) {
    toastUI.showGifLoading(loadingMessage);
  }
  captureGIF(blob => {
    if (toastUI.hideGifLoading) {
      toastUI.hideGifLoading();
    }
    currentGifBlob = blob;
    revokeGifUrl();
    currentGifUrl = URL.createObjectURL(blob);
    if (elements.gifPreview) {
      elements.gifPreview.src = currentGifUrl;
    }
    if (elements.gifModal) {
      elements.gifModal.style.display = 'flex';
    }
  }).catch(error => {
    toastUI.hideGifLoading?.();
    alertFn(translateText('gifExportFailed', 'GIF export failed. Please try again.'));
    console.warn('GIF export failed', error);
  });
}

function getSaveContext() {
  const stageId = getCurrentLevel();
  return { stageId, problemKey: stageId == null ? getCustomProblemKey() : null };
}

export async function loadGifFromDB(key) {
  const bytes = await circuitStorage.readPreview(key);
  return bytes ? new Blob([bytes], { type: 'image/gif' }) : null;
}

function applyCircuitData(raw, key) {
  let data;
  try {
    data = validateSavedCircuitRecord(raw);
    if (!matchesSaveContext(data, getSaveContext())) throw new Error('Different problem');
  } catch {
    alertFn(translate('incompatibleCircuit'));
    return false;
  }
  const circuit = getActiveCircuit();
  if (!circuit) return false;
  const level = getCurrentLevel(), levels = getLoadedStageData();
  if (levels?.levelRevisions?.[level]) {
    try {
      if (data.stageRevision != null && data.stageRevision !== levels.levelRevisions[level]) throw new Error('Old revision');
      validateStageCircuit(data.circuit, Number(level), levels);
    } catch {
      alertFn(translate('localSaveStageMismatch'));
      return false;
    }
  }
  const controller = getActiveController();
  if (controller?.restoreCircuit) controller.restoreCircuit(data.circuit);
  else {
    Object.assign(circuit, data.circuit);
    resetExecution(circuit);
    markCircuitModified(circuit);
  }
  controller?.syncPaletteWithCircuit?.();
  controller?.clearSelection?.();
  if (key) notifyLastSavedKeyChange(key);
  return true;
}

export async function saveCircuit(progressCallback) {
  const circuit = getActiveCircuit();
  if (!circuit) throw new Error('No circuit to save');
  const { usedBlocks, usedWires } = getCircuitStats(circuit);
  const customProblem = getCustomProblem();
  const data = {
    version: CURRENT_CIRCUIT_VERSION,
    stageId: getCurrentLevel(),
    stageRevision: getLoadedStageData()?.levelRevisions?.[getCurrentLevel()] || null,
    problemKey: getCustomProblemKey(),
    problemTitle: customProblem ? customProblem.title : undefined,
    timestamp: new Date().toISOString(),
    circuit: snapshotCircuit(circuit),
    usedBlocks,
    usedWires
  };
  progressCallback?.(0);
  const { id } = await circuitStorage.save(data);
  notifyLastSavedKeyChange(id);
  progressCallback?.(33);
  try {
    const blob = await captureGIF();
    progressCallback?.(66);
    await circuitStorage.writePreview(id, new Uint8Array(await blob.arrayBuffer()));
  } catch (error) {
    console.warn('Circuit saved without preview', error);
    alertFn(translate('localSavePreviewFailed'));
  }
  progressCallback?.(100);
  return id;
}

export async function loadCircuit(key) {
  try {
    // Read again at click time: the list is not a restoration cache.
    return applyCircuitData(await circuitStorage.load(key), key);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && lastSavedKey === key) notifyLastSavedKeyChange(null);
    alertFn(storageErrorMessage(error, translate));
    return false;
  }
}

let listRevision = 0;
let listGifUrls = [];
function clearListPreviews() {
  listGifUrls.forEach(url => URL.revokeObjectURL(url));
  listGifUrls = [];
}
function listMessage(message) {
  const p = document.createElement('p');
  p.textContent = message;
  elements.savedList.appendChild(p);
}

export async function renderSavedList() {
  if (!elements.savedList) return;
  const revision = ++listRevision;
  const context = getSaveContext();
  clearListPreviews();
  elements.savedList.replaceChildren();
  listMessage(translate('loadingText'));
  try {
    const { items, issues } = await circuitStorage.list(context);
    if (revision !== listRevision) return;
    elements.savedList.replaceChildren();
    if (issues.length) {
      listMessage(translate('localSaveSkipped').replace('{count}', issues.length));
      for (const code of new Set(issues.map(issue => issue.code))) listMessage(storageErrorMessage({ code }, translate));
    }
    if (!items.length) listMessage(translate('noCircuits'));
    for (const data of items) {
      const key = data.id;
      const item = document.createElement('div');
      item.className = 'saved-item';
      const label = data.stageId != null
        ? getLevelTitle?.(data.stageId) ?? translate('stageUntitled')
        : data.problemTitle || data.problemKey || translate('problemUntitled');
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'saved-load';
      const preview = document.createElement('div');
      preview.className = 'saved-preview';
      preview.textContent = translate('localSaveNoPreview');
      const img = document.createElement('img');
      img.alt = label;
      loadBtn.appendChild(preview);
      const cap = document.createElement('div');
      cap.className = 'saved-caption';
      cap.textContent = `${label} — ${new Date(data.timestamp).toLocaleString()}`;
      loadBtn.appendChild(cap);
      loadBtn.addEventListener('click', async () => {
        loadBtn.disabled = true;
        if (await loadCircuit(key)) closeSavedModal();
        else await renderSavedList();
        loadBtn.disabled = false;
      });
      item.appendChild(loadBtn);
      const delBtn = document.createElement('button');
      delBtn.textContent = translate('deleteBtn');
      delBtn.className = 'deleteBtn';
      delBtn.addEventListener('click', async () => {
        if (!confirmFn(translate('confirmDelete'))) return;
        delBtn.disabled = true;
        try {
          const result = await circuitStorage.delete(key);
          if (lastSavedKey === key) notifyLastSavedKeyChange(null);
          if (!result.removed) alertFn(translate('localSaveMissing'));
          if (result.previewWarning) alertFn(translate('localSavePreviewCleanupFailed'));
          await renderSavedList();
        } catch (error) { alertFn(storageErrorMessage(error, translate)); }
        finally { delBtn.disabled = false; }
      });
      item.appendChild(delBtn);
      elements.savedList.appendChild(item);
      // Missing/failed previews must never prevent list rendering or loading.
      loadGifFromDB(key).then(blob => {
        if (!blob || revision !== listRevision) return;
        const url = URL.createObjectURL(blob);
        listGifUrls.push(url);
        img.onload = () => { if (revision === listRevision) preview.replaceChildren(img); };
        img.src = url;
      }).catch(() => {});
    }
  } catch (error) {
    if (revision !== listRevision) return;
    elements.savedList.replaceChildren();
    listMessage(storageErrorMessage(error, translate));
  }
}

export function openSavedModal() {
  if (elements.savedModal) {
    elements.savedModal.style.display = 'flex';
  }
  renderSavedList();
}

export function closeSavedModal() {
  listRevision++;
  clearListPreviews();
  if (elements.savedModal) {
    elements.savedModal.style.display = 'none';
  }
}

export async function handleSaveCircuitClick() {
  let saveSuccess = false;
  try {
    if (toastUI.showCircuitSaving) {
      toastUI.showCircuitSaving(translate('savingCircuit'));
    }
    updateSaveProgress(0);
    await saveCircuit(updateSaveProgress);
    saveSuccess = true;
  } catch (e) {
    alertFn(storageErrorMessage(e, translate));
  } finally {
    if (toastUI.hideCircuitSaving) {
      toastUI.hideCircuitSaving();
    }
    updateSaveProgress(0);
  }
  if (saveSuccess) {
    const successMessage = translate('circuitSaved');
    showCircuitSavedToast({
      message: successMessage && successMessage !== 'circuitSaved' ? successMessage : '회로가 저장되었습니다.',
      canShare: true
    });
  }
}

export function showCircuitSavedToast({ message, canShare = true, onContinue } = {}) {
  const resolvedMessage = typeof message === 'string' && message.trim().length
    ? message
    : translate('circuitSaved');

  if (toastUI.showCircuitSaved) {
    toastUI.showCircuitSaved({
      message: resolvedMessage,
      canShare,
      onShare: canShare ? statusShareHandlers.savedShare : null,
      onContinue
    });
    return;
  }

  alertFn(resolvedMessage);
}

export async function captureGIF(onFinish, { caption = '' } = {}) {
  const bgCanvas = document.getElementById('bgCanvas');
  const contentCanvas = document.getElementById('contentCanvas');
  if (!bgCanvas || !contentCanvas) throw new Error('No canvas to export');

  const dpr = window.devicePixelRatio || 1;
  const totalWidth = bgCanvas.width / dpr;
  const totalHeight = bgCanvas.height / dpr;

  let gridWidth = totalWidth;
  let gridHeight = totalHeight;
  let panelWidth = 0;
  let sourceWidth = totalWidth;
  let sourceHeight = totalHeight;

  try {
    const { CELL, GAP } = await import('../canvas/model.js');
    const controller = getActiveController();
    const circuit = controller?.circuit || getActiveCircuit();
    if (circuit) {
      gridWidth = circuit.cols * (CELL + GAP) + GAP;
      gridHeight = circuit.rows * (CELL + GAP) + GAP;
      // The controller scales the grid inside the canvas. Crop its actual
      // viewport, then resample to the circuit's base size for export.
      panelWidth = Number(bgCanvas.dataset.panelWidth) || Math.max(0, totalWidth - gridWidth);
      sourceWidth = Number(bgCanvas.dataset.gridViewportWidth) || totalWidth - panelWidth;
      sourceHeight = Number(bgCanvas.dataset.gridViewportHeight) || totalHeight;
    }
  } catch (_) {}

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = gridWidth;
  const captionHeight = caption ? 48 : 0;
  tempCanvas.height = gridHeight + captionHeight;
  const tempCtx = tempCanvas.getContext('2d');

  const gif = new GIF({ workers: 2, workerScript: 'gif.worker.js', quality: 10, width: gridWidth, height: gridHeight + captionHeight });
  const totalFrames = 10;

  for (let f = 0; f < totalFrames; f++) {
    tempCtx.clearRect(0, 0, gridWidth, gridHeight);
    [bgCanvas, contentCanvas].forEach(c => {
      tempCtx.drawImage(
        c,
        panelWidth * dpr,
        0,
        sourceWidth * dpr,
        sourceHeight * dpr,
        0,
        0,
        gridWidth,
        gridHeight
      );
    });
    if (caption) {
      tempCtx.fillStyle = '#f8fafc';
      tempCtx.fillRect(0, gridHeight, gridWidth, captionHeight);
      tempCtx.fillStyle = '#312e81';
      tempCtx.font = '12px sans-serif';
      tempCtx.fillText(caption, 8, gridHeight + 28, gridWidth - 16);
    }
    gif.addFrame(tempCanvas, { delay: 50, copy: true });
    await new Promise(r => setTimeout(r, 50));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { gif.abort(); reject(new Error('GIF export timed out')); }, 30000);
    gif.on('finished', blob => {
      clearTimeout(timeout);
      if (typeof onFinish === 'function') onFinish(blob);
      resolve(blob);
    });
    gif.on('abort', () => { clearTimeout(timeout); reject(new Error('GIF export aborted')); });
    try { gif.render(); } catch (error) { clearTimeout(timeout); reject(error); }
  });
}
