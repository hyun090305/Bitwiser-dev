import { ensureDriveAuth } from './auth.js';
import { getActiveCircuit, getActiveController, markCircuitModified } from './grid.js';
import { getCurrentLevel } from './levels.js';

const CURRENT_CIRCUIT_VERSION = 2;

let elements = {};
let translate = key => key;
let alertFn = typeof window !== 'undefined' && typeof window.alert === 'function'
  ? window.alert.bind(window)
  : message => console.log('Alert:', message);
let confirmFn = typeof window !== 'undefined' && typeof window.confirm === 'function'
  ? window.confirm.bind(window)
  : () => true;
let getCustomProblem = () => null;
let getCustomProblemKey = () => null;
let onLastSavedKeyChange = () => {};

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

export function initializeCircuitShare({
  elements: providedElements = {},
  translate: translateFn,
  alert: providedAlert,
  confirm: providedConfirm,
  getCurrentCustomProblem,
  getCurrentCustomProblemKey,
  onLastSavedKeyChange: handleLastSavedKey
} = {}) {
  elements = { ...providedElements };
  if (typeof translateFn === 'function') translate = translateFn;
  if (typeof providedAlert === 'function') alertFn = providedAlert;
  if (typeof providedConfirm === 'function') confirmFn = providedConfirm;
  if (typeof getCurrentCustomProblem === 'function') getCustomProblem = getCurrentCustomProblem;
  if (typeof getCurrentCustomProblemKey === 'function') getCustomProblemKey = getCurrentCustomProblemKey;
  if (typeof handleLastSavedKey === 'function') onLastSavedKeyChange = handleLastSavedKey;
}

export function updateSaveProgress(percent) {
  if (elements.saveProgressBar) {
    elements.saveProgressBar.style.width = `${percent}%`;
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
  if (elements.gifLoadingText) {
    elements.gifLoadingText.textContent = translate('gifLoadingText');
  }
  if (elements.gifLoadingModal) {
    elements.gifLoadingModal.style.display = 'flex';
  }
  captureGIF(blob => {
    if (elements.gifLoadingModal) {
      elements.gifLoadingModal.style.display = 'none';
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
  });
}

function getSavePrefix() {
  const level = getCurrentLevel();
  if (level != null) {
    return `bit_saved_stage_${String(level).padStart(2, '0')}_`;
  }
  const customKey = getCustomProblemKey();
  if (customKey) {
    return `bit_saved_prob_${customKey}_`;
  }
  return 'bit_saved_';
}

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

export async function loadGifFromDB(key) {
  return downloadFileFromAppData(`${key}.gif`);
}

async function deleteGifFromDB(key) {
  return deleteFileFromAppData(`${key}.gif`);
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

function applyCircuitData(data, key) {
  if (data.version !== CURRENT_CIRCUIT_VERSION || !data.circuit) {
    alertFn(translate('incompatibleCircuit'));
    return;
  }
  const circuit = getActiveCircuit();
  if (!circuit) return;
  circuit.rows = data.circuit.rows;
  circuit.cols = data.circuit.cols;
  circuit.blocks = data.circuit.blocks || {};
  circuit.wires = data.circuit.wires || {};
  markCircuitModified();
  const controller = getActiveController();
  controller?.syncPaletteWithCircuit?.();
  controller?.clearSelection?.();
  if (key) onLastSavedKeyChange(key);
}

export async function saveCircuit(progressCallback) {
  const circuit = getActiveCircuit();
  if (!circuit) throw new Error('No circuit to save');

  await ensureDriveAuth();

  const wireCells = new Set();
  Object.values(circuit.wires).forEach(w => {
    w.path.slice(1, -1).forEach(p => wireCells.add(`${p.r},${p.c}`));
  });

  const customProblem = getCustomProblem();
  const data = {
    version: CURRENT_CIRCUIT_VERSION,
    stageId: getCurrentLevel(),
    problemKey: getCustomProblemKey(),
    problemTitle: customProblem ? customProblem.title : undefined,
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

    const blob = await new Promise(resolve => captureGIF(resolve));
    progressCallback && progressCallback(66);
    await saveGifToDB(key, blob);
    progressCallback && progressCallback(100);

    console.log(`Circuit saved: ${key}`, data);
    onLastSavedKeyChange(key);
    return key;
  } catch (e) {
    console.error('Circuit save failed:', e);
    alertFn(translateText('saveCircuitError', '회로 저장 중 오류가 발생했습니다.'));
    throw e;
  }
}

export async function loadCircuit(key) {
  try {
    await ensureDriveAuth();
  } catch (e) {
    alertFn(translate('loginRequired'));
    return;
  }
  const blob = await downloadFileFromAppData(`${key}.json`);
  if (!blob) {
    alertFn(translate('loadFailedNoData'));
    return;
  }
  const text = await blob.text();
  const data = JSON.parse(text);
  applyCircuitData(data, key);
}

export async function renderSavedList() {
  if (!elements.savedList) return;
  elements.savedList.innerHTML = `<p>${translate('loadingText')}</p>`;
  try {
    await ensureDriveAuth();
  } catch (e) {
    elements.savedList.innerHTML = `<p>${translate('loginRequired')}</p>`;
    return;
  }
  const prefix = getSavePrefix();
  const files = (await listCircuitJsonFiles())
    .filter(f => f.name.startsWith(prefix))
    .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  if (!files.length) {
    elements.savedList.innerHTML = `<p>${translate('noCircuits')}</p>`;
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
      if (elements.savedModal) {
        elements.savedModal.style.display = 'none';
      }
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = translate('deleteBtn');
    delBtn.className = 'deleteBtn';
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirmFn(translate('confirmDelete'))) return;
      await deleteFileFromAppData(`${key}.json`);
      await deleteGifFromDB(key);
      renderSavedList();
    });
    item.appendChild(delBtn);

    return item;
  }));
  elements.savedList.innerHTML = '';
  items.forEach(item => elements.savedList.appendChild(item));
}

export function openSavedModal() {
  if (elements.savedModal) {
    elements.savedModal.style.display = 'flex';
  }
  renderSavedList();
}

export function closeSavedModal() {
  if (elements.savedModal) {
    elements.savedModal.style.display = 'none';
  }
}

export async function handleSaveCircuitClick() {
  try {
    await ensureDriveAuth();
  } catch (e) {
    alertFn(e.message);
    return;
  }
  let saveSuccess = false;
  try {
    if (elements.gifLoadingModal) {
      if (elements.gifLoadingText) {
        elements.gifLoadingText.textContent = translate('savingCircuit');
      }
      elements.gifLoadingModal.style.display = 'flex';
    }
    if (elements.saveProgressContainer) {
      elements.saveProgressContainer.style.display = 'block';
      updateSaveProgress(0);
    }
    await saveCircuit(updateSaveProgress);
    saveSuccess = true;
  } catch (e) {
    const message = getTranslation('saveFailed');
    alertFn(message ? message.replace('{error}', e) : `저장에 실패했습니다: ${e}`);
  } finally {
    if (elements.gifLoadingModal) {
      elements.gifLoadingModal.style.display = 'none';
      if (elements.gifLoadingText) {
        elements.gifLoadingText.textContent = translate('gifLoadingText');
      }
    }
    if (elements.saveProgressContainer) {
      elements.saveProgressContainer.style.display = 'none';
      updateSaveProgress(0);
    }
  }
  if (saveSuccess) {
    const successMessage = translate('circuitSaved');
    alertFn(successMessage && successMessage !== 'circuitSaved' ? successMessage : '회로가 저장되었습니다.');
  }
}

export async function captureGIF(onFinish) {
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
    const { CELL, GAP } = await import('../canvas/model.js');
    const controller = getActiveController();
    const circuit = controller?.circuit || getActiveCircuit();
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
