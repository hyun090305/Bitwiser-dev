const DEFAULT_FETCH_LIMIT = 30;

let firestore = null;
let auth = null;
let unsubscribeAuth = null;

let uploadButton = null;
let viewButton = null;
let actionsContainer = null;
let authMessageEl = null;
let screenEl = null;
let listEl = null;
let loadingEl = null;
let emptyEl = null;
let errorEl = null;
let backButton = null;
let refreshButton = null;
let labCanvasContainer = null;
let rightPanelEl = null;

let getCircuitSnapshot = () => null;
let importCircuitIntoLab = () => false;
let onLabRevealed = null;

const previousDisplay = new WeakMap();

function initFirebaseReferences() {
  if (typeof firebase === 'undefined') return;
  if (!firestore && typeof firebase.firestore === 'function') {
    try {
      firestore = firebase.firestore();
    } catch (err) {
      console.warn('Failed to initialise Firestore', err);
      firestore = null;
    }
  }
  if (!auth && typeof firebase.auth === 'function') {
    try {
      auth = firebase.auth();
    } catch (err) {
      console.warn('Failed to initialise Firebase Auth', err);
      auth = null;
    }
  }
}

function getServerTimestamp() {
  const fieldValue = firebase?.firestore?.FieldValue;
  return typeof fieldValue?.serverTimestamp === 'function'
    ? fieldValue.serverTimestamp()
    : new Date();
}

function clampDimension(value, fallback = 24) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(50, Math.max(1, Math.round(num)));
}

function sanitizeBlocks(blocks = {}) {
  const result = {};
  if (!blocks || typeof blocks !== 'object') return result;
  Object.entries(blocks).forEach(([id, block]) => {
    if (!id || !block || typeof block !== 'object') return;
    const pos = block.pos || {};
    const r = Number(pos.r);
    const c = Number(pos.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    const entry = {
      id,
      type: typeof block.type === 'string' ? block.type : '',
      pos: { r, c },
      value: Boolean(block.value),
      fixed: Boolean(block.fixed)
    };
    if (typeof block.name === 'string' && block.name.trim()) {
      entry.name = block.name.trim();
    }
    result[id] = entry;
  });
  return result;
}

function sanitizeWires(wires = {}) {
  const result = {};
  if (!wires || typeof wires !== 'object') return result;
  Object.entries(wires).forEach(([id, wire]) => {
    if (!id || !wire || typeof wire !== 'object') return;
    const path = Array.isArray(wire.path)
      ? wire.path
          .map(point => {
            const r = Number(point?.r);
            const c = Number(point?.c);
            if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
            return { r, c };
          })
          .filter(Boolean)
      : [];
    const entry = {
      id,
      path,
      startBlockId: typeof wire.startBlockId === 'string' ? wire.startBlockId : null,
      endBlockId: typeof wire.endBlockId === 'string' ? wire.endBlockId : null,
      flow: Array.isArray(wire.flow) ? wire.flow.slice() : []
    };
    result[id] = entry;
  });
  return result;
}

function sanitizeCircuitData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sanitized = {
    rows: clampDimension(raw.rows),
    cols: clampDimension(raw.cols),
    blocks: sanitizeBlocks(raw.blocks),
    wires: sanitizeWires(raw.wires)
  };
  return sanitized;
}

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = disabled;
  if (disabled) {
    button.classList.add('lab-community-actions__button--disabled');
    button.setAttribute('aria-disabled', 'true');
  } else {
    button.classList.remove('lab-community-actions__button--disabled');
    button.removeAttribute('aria-disabled');
  }
}

function updateActionAvailability(user) {
  const isLoggedIn = Boolean(user);
  const firestoreReady = Boolean(firestore);
  const enabled = isLoggedIn && firestoreReady;
  setButtonDisabled(uploadButton, !enabled);
  setButtonDisabled(viewButton, !enabled);

  if (authMessageEl) {
    if (!firestoreReady) {
      authMessageEl.textContent = '⚠️ Firestore를 초기화할 수 없어 커뮤니티를 사용할 수 없습니다.';
    } else if (!isLoggedIn) {
      authMessageEl.textContent = '🔒 구글 로그인 후 이용 가능합니다.';
    } else {
      authMessageEl.textContent = '✨ 커뮤니티에 회로를 업로드하고 불러올 수 있어요!';
    }
  }
}

function requireAuth() {
  if (!firestore) {
    alert('Firestore 연결을 초기화하지 못했습니다. 잠시 후 다시 시도해주세요.');
    return null;
  }
  const user = auth?.currentUser ?? null;
  if (!user) {
    alert('구글 로그인 후 이용해주세요.');
    return null;
  }
  return user;
}

function setLoadingVisible(visible) {
  if (loadingEl) {
    loadingEl.style.display = visible ? '' : 'none';
  }
}

function hideElement(el) {
  if (!el) return;
  if (!previousDisplay.has(el)) {
    previousDisplay.set(el, el.style.display);
  }
  el.style.display = 'none';
}

function restoreElement(el) {
  if (!el) return;
  const prev = previousDisplay.get(el);
  if (prev !== undefined) {
    el.style.display = prev;
    previousDisplay.delete(el);
  } else {
    el.style.display = '';
  }
}

function resetListState() {
  if (listEl) {
    listEl.innerHTML = '';
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
}

function formatDate(value) {
  if (!value) return '';
  let date;
  if (typeof value?.toDate === 'function') {
    date = value.toDate();
  } else {
    date = new Date(value);
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  } catch (err) {
    return date.toLocaleString?.('ko-KR') ?? date.toString();
  }
}

function renderCircuitCards(entries) {
  resetListState();
  if (!entries.length) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (!listEl) return;
  entries.forEach(entry => {
    const { id, data } = entry;
    const card = document.createElement('article');
    card.className = 'lab-community-card';
    card.setAttribute('role', 'listitem');
    card.dataset.circuitId = id;

    const titleEl = document.createElement('h2');
    titleEl.className = 'lab-community-card__title';
    titleEl.textContent = data.title || '제목 없음';
    card.appendChild(titleEl);

    const metaEl = document.createElement('p');
    metaEl.className = 'lab-community-card__meta';
    const ownerName = String(data.ownerName || '익명 연구자').slice(0, 60);
    const created = formatDate(data.createdAt);
    const blockCount = Number.isFinite(data.blockCount) ? data.blockCount : Object.keys(data.circuit?.blocks || {}).length;
    const wireCount = Number.isFinite(data.wireCount) ? data.wireCount : Object.keys(data.circuit?.wires || {}).length;
    const parts = [];
    if (ownerName) parts.push(ownerName);
    if (created) parts.push(created);
    parts.push(`블록 ${blockCount}개 · 도선 ${wireCount}개`);
    metaEl.textContent = parts.join(' • ');
    card.appendChild(metaEl);

    if (data.description) {
      const descEl = document.createElement('p');
      descEl.className = 'lab-community-card__description';
      descEl.textContent = String(data.description).slice(0, 500);
      card.appendChild(descEl);
    }

    const actions = document.createElement('div');
    actions.className = 'lab-community-card__actions';
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'main-button lab-community-card__load-btn';
    loadBtn.textContent = '🧪 이 회로 불러오기';
    loadBtn.addEventListener('click', () => {
      handleCircuitLoad(data.circuit, data.title || '회로');
    });
    actions.appendChild(loadBtn);
    card.appendChild(actions);

    listEl.appendChild(card);
  });
}

async function loadCircuits() {
  const user = requireAuth();
  if (!user) return;
  if (!firestore) return;
  setLoadingVisible(true);
  resetListState();
  try {
    const snapshot = await firestore
      .collection('labCircuits')
      .orderBy('createdAt', 'desc')
      .limit(DEFAULT_FETCH_LIMIT)
      .get();
    const entries = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
    renderCircuitCards(entries);
  } catch (err) {
    console.error('Failed to load community circuits', err);
    if (errorEl) {
      const message = err?.code === 'permission-denied'
        ? '접근 권한이 없습니다. 구글 로그인이 제대로 되었는지 확인해주세요.'
        : '회로 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  } finally {
    setLoadingVisible(false);
  }
}

function handleCircuitLoad(rawCircuit, title) {
  const sanitized = sanitizeCircuitData(rawCircuit);
  if (!sanitized) {
    alert('회로 데이터를 불러오지 못했습니다.');
    return;
  }
  const imported = importCircuitIntoLab(sanitized);
  if (imported) {
    hideCommunityScreen();
    onLabRevealed?.();
    alert(`'${title}' 회로를 불러왔습니다!`);
  } else {
    alert('회로를 불러오지 못했습니다. 다시 시도해주세요.');
  }
}

async function handleUploadClick() {
  const user = requireAuth();
  if (!user) return;
  const snapshot = getCircuitSnapshot?.();
  const circuit = sanitizeCircuitData(snapshot);
  if (!circuit) {
    alert('업로드할 회로가 없습니다.');
    return;
  }
  let title = prompt('회로 제목을 입력하세요 (필수)', '새 회로');
  if (title === null) return;
  title = title.trim();
  if (!title) {
    alert('제목을 입력해주세요.');
    return;
  }
  if (title.length > 80) {
    alert('제목은 80자 이하로 입력해주세요.');
    return;
  }
  let description = prompt('회로 설명을 입력하세요 (선택 사항)', '');
  if (description === null) {
    description = '';
  }
  description = description.trim();
  if (description.length > 400) {
    alert('설명은 400자 이하로 입력해주세요.');
    return;
  }

  const payload = {
    title,
    description,
    ownerUid: user.uid,
    ownerName: user.displayName || user.email || user.uid,
    createdAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
    circuit,
    blockCount: Object.keys(circuit.blocks || {}).length,
    wireCount: Object.keys(circuit.wires || {}).length
  };

  try {
    await firestore.collection('labCircuits').add(payload);
    alert('회로가 커뮤니티에 업로드되었습니다!');
    if (screenEl && screenEl.style.display !== 'none') {
      loadCircuits();
    }
  } catch (err) {
    console.error('Failed to upload circuit', err);
    const message = err?.code === 'permission-denied'
      ? '회로를 업로드할 권한이 없습니다. 로그인 상태를 확인해주세요.'
      : '회로 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.';
    alert(message);
  }
}

function showCommunityScreen() {
  if (!requireAuth()) return;
  if (!screenEl) return;
  labCanvasContainer ??= document.getElementById('labCanvasContainer');
  rightPanelEl ??= document.getElementById('rightPanel');
  hideElement(labCanvasContainer);
  hideElement(rightPanelEl);
  screenEl.style.display = 'flex';
  setLoadingVisible(true);
  resetListState();
  loadCircuits();
}

function hideCommunityScreen() {
  if (!screenEl) return;
  screenEl.style.display = 'none';
  restoreElement(labCanvasContainer);
  restoreElement(rightPanelEl);
  setLoadingVisible(false);
}

function handleViewClick() {
  showCommunityScreen();
}

function initialiseAuthListener() {
  if (!auth) return;
  unsubscribeAuth?.();
  unsubscribeAuth = auth.onAuthStateChanged(user => {
    updateActionAvailability(user);
  });
}

export function initializeCircuitCommunity(options = {}) {
  uploadButton = document.getElementById('labCommunityUploadBtn');
  viewButton = document.getElementById('labCommunityViewBtn');
  actionsContainer = document.getElementById('labCommunityActions');
  authMessageEl = document.getElementById('labCommunityAuthMessage');
  screenEl = document.getElementById('circuitCommunityScreen');
  listEl = document.getElementById('communityCircuitList');
  loadingEl = document.getElementById('communityLoadingState');
  emptyEl = document.getElementById('communityEmptyState');
  errorEl = document.getElementById('communityErrorState');
  backButton = document.getElementById('communityBackBtn');
  refreshButton = document.getElementById('communityRefreshBtn');

  getCircuitSnapshot = typeof options.getCircuitSnapshot === 'function'
    ? options.getCircuitSnapshot
    : () => null;
  importCircuitIntoLab = typeof options.importCircuit === 'function'
    ? options.importCircuit
    : () => false;
  onLabRevealed = typeof options.onLabRevealed === 'function'
    ? options.onLabRevealed
    : null;

  if (!uploadButton || !viewButton || !actionsContainer) {
    console.warn('Circuit community UI elements are missing.');
    return {
      showCommunityScreen: () => {},
      hideCommunityScreen: () => {},
      reloadCommunityList: () => {}
    };
  }

  initFirebaseReferences();
  updateActionAvailability(auth?.currentUser ?? null);
  initialiseAuthListener();

  uploadButton.addEventListener('click', handleUploadClick);
  viewButton.addEventListener('click', handleViewClick);
  backButton?.addEventListener('click', () => {
    hideCommunityScreen();
    onLabRevealed?.();
  });
  refreshButton?.addEventListener('click', loadCircuits);

  return {
    showCommunityScreen,
    hideCommunityScreen,
    reloadCommunityList: loadCircuits,
    updateActionAvailability
  };
}
