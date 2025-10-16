import { getGoogleNickname, getUsername } from './storage.js';

const globalTranslate =
  typeof window !== 'undefined' && typeof window.t === 'function'
    ? window.t
    : key => key;

let translate = globalTranslate;

function translateWithFallback(key, fallback) {
  const value = translate(key);
  return typeof value === 'string' && value !== key ? value : fallback;
}

function formatTranslation(key, fallback, params = {}) {
  let template = translateWithFallback(key, fallback);
  Object.entries(params).forEach(([paramKey, value]) => {
    const pattern = new RegExp(`\\{${paramKey}\\}`, 'g');
    template = template.replace(pattern, value);
  });
  return template;
}

function getAuth() {
  if (typeof firebase === 'undefined' || !firebase?.auth) return null;
  try {
    return firebase.auth();
  } catch (err) {
    console.error('Failed to access Firebase auth', err);
    return null;
  }
}

function getFirestore() {
  if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function') {
    return null;
  }
  try {
    return firebase.firestore();
  } catch (err) {
    console.error('Failed to access Firestore', err);
    return null;
  }
}

function sanitizeCircuit(rawCircuit) {
  if (!rawCircuit || typeof rawCircuit !== 'object') return null;
  const base = {
    rows: Number(rawCircuit.rows) || 0,
    cols: Number(rawCircuit.cols) || 0,
    blocks: rawCircuit.blocks && typeof rawCircuit.blocks === 'object' ? rawCircuit.blocks : {},
    wires: rawCircuit.wires && typeof rawCircuit.wires === 'object' ? rawCircuit.wires : {},
  };
  try {
    return JSON.parse(JSON.stringify(base));
  } catch (err) {
    console.warn('Failed to sanitize circuit payload', err);
    return null;
  }
}

function countWireCells(wires = {}) {
  const cells = new Set();
  Object.values(wires).forEach(wire => {
    if (!wire || !Array.isArray(wire.path)) return;
    wire.path.slice(1, -1).forEach(point => {
      if (!point) return;
      const { r, c } = point;
      if (Number.isFinite(r) && Number.isFinite(c)) {
        cells.add(`${r},${c}`);
      }
    });
  });
  return cells.size;
}

function resolveAuthorName(user) {
  if (!user) return translateWithFallback('communityUnknownUser', '알 수 없는 사용자');
  const { uid, displayName, email } = user;
  const nickname = uid ? getGoogleNickname(uid) : null;
  const guestName = getUsername();
  return displayName
    || nickname
    || email
    || guestName
    || translateWithFallback('anonymousUser', '익명');
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  try {
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  } catch (err) {
    console.warn('Failed to format timestamp', err);
    return '';
  }
}

const defaultConfig = {
  shareButtonId: 'labShareCommunityBtn',
  browseButtonId: 'labOpenCommunityBtn',
  shareOverlayId: 'communityShareOverlay',
  browserOverlayId: 'communityBrowserOverlay',
  shareFormId: 'communityShareForm',
  shareTitleInputId: 'communityShareTitle',
  shareDescInputId: 'communityShareDescription',
  shareCancelId: 'communityShareCancel',
  shareSubmitId: 'communityShareSubmit',
  shareCloseId: 'communityShareClose',
  browseCloseId: 'communityBrowserClose',
  listContainerId: 'communityList',
  emptyStateId: 'communityEmptyState',
  loadingId: 'communityLoading',
  browserStatusId: 'communityBrowserStatus',
  shareStatusId: 'communityShareStatus',
  shareStatsId: 'communityShareStats',
  loginHintId: 'labCommunityLoginHint',
  statusMessageId: 'labCommunityStatus',
};

let initialized = false;

export function initializeCircuitCommunity(options = {}) {
  if (initialized) return;
  initialized = true;
  translate = typeof options.translate === 'function' ? options.translate : globalTranslate;
  const config = { ...defaultConfig, ...options };
  delete config.translate;

  const shareBtn = document.getElementById(config.shareButtonId);
  const browseBtn = document.getElementById(config.browseButtonId);
  const shareOverlay = document.getElementById(config.shareOverlayId);
  const browserOverlay = document.getElementById(config.browserOverlayId);
  const shareForm = document.getElementById(config.shareFormId);
  const titleInput = document.getElementById(config.shareTitleInputId);
  const descInput = document.getElementById(config.shareDescInputId);
  const shareCancel = document.getElementById(config.shareCancelId);
  const shareClose = document.getElementById(config.shareCloseId);
  const browseClose = document.getElementById(config.browseCloseId);
  const listContainer = document.getElementById(config.listContainerId);
  const emptyState = document.getElementById(config.emptyStateId);
  const loadingEl = document.getElementById(config.loadingId);
  const browserStatus = document.getElementById(config.browserStatusId);
  const shareStatus = document.getElementById(config.shareStatusId);
  const shareStats = document.getElementById(config.shareStatsId);
  const loginHint = document.getElementById(config.loginHintId);
  const statusMessage = document.getElementById(config.statusMessageId);
  const shareSubmit = document.getElementById(config.shareSubmitId);

  const getCircuit = typeof config.getCircuit === 'function' ? config.getCircuit : () => null;
  const applyCircuit = typeof config.applyCircuit === 'function' ? config.applyCircuit : () => {};
  const ensureLabVisible = typeof config.ensureLabVisible === 'function' ? config.ensureLabVisible : () => {};
  const onCircuitLoaded = typeof config.onCircuitLoaded === 'function' ? config.onCircuitLoaded : () => {};

  const firestore = getFirestore();
  if (!firestore) {
    console.warn('Firestore is not available; circuit community features disabled.');
  }

  const auth = getAuth();

  let currentUser = auth?.currentUser ?? null;
  let loadingList = false;

  function setStatusMessage(message, tone = 'info') {
    if (!statusMessage) return;
    statusMessage.textContent = message || '';
    statusMessage.classList.remove('lab-community-status--error', 'lab-community-status--success');
    if (!message) return;
    if (tone === 'error') {
      statusMessage.classList.add('lab-community-status--error');
    } else if (tone === 'success') {
      statusMessage.classList.add('lab-community-status--success');
    }
  }

  function updateLoginState(user) {
    currentUser = user;
    const loggedIn = Boolean(user);
    [shareBtn, browseBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = !loggedIn || !firestore;
      if (!loggedIn || !firestore) {
        btn.setAttribute('aria-disabled', 'true');
        btn.title = firestore
          ? translateWithFallback('communityLoginRequired', 'Google 로그인 후 이용해주세요.')
          : translateWithFallback('communityFirestoreUnavailable', 'Firestore 연결을 확인해주세요.');
      } else {
        btn.removeAttribute('aria-disabled');
        btn.removeAttribute('title');
      }
    });
    if (loginHint) {
      loginHint.hidden = loggedIn && Boolean(firestore);
    }
  }

  function closeOverlay(overlay) {
    if (!overlay) return;
    overlay.dataset.open = 'false';
  }

  function openOverlay(overlay) {
    if (!overlay) return;
    overlay.dataset.open = 'true';
  }

  function updateShareStats() {
    if (!shareStats) return;
    const circuit = getCircuit();
    const sanitized = sanitizeCircuit(circuit);
    if (!sanitized) {
      shareStats.textContent = translateWithFallback('communityStatsUnavailable', '회로 정보를 불러올 수 없습니다.');
      return;
    }
    const blockCount = Object.keys(sanitized.blocks || {}).length;
    const wireCount = countWireCells(sanitized.wires);
    shareStats.textContent = formatTranslation(
      'communityStatsTemplate',
      '블록 {blocks}개 · 도선 {wires}개',
      { blocks: blockCount, wires: wireCount }
    );
  }

  function resetShareForm() {
    shareForm?.reset();
    if (shareStatus) {
      shareStatus.textContent = '';
      shareStatus.classList.remove('community-status--error', 'community-status--success');
    }
    if (shareSubmit) {
      shareSubmit.disabled = false;
    }
    updateShareStats();
  }

  function setShareStatus(message, tone = 'info') {
    if (!shareStatus) return;
    shareStatus.textContent = message || '';
    shareStatus.classList.remove('community-status--error', 'community-status--success');
    if (!message) return;
    if (tone === 'error') {
      shareStatus.classList.add('community-status--error');
    } else if (tone === 'success') {
      shareStatus.classList.add('community-status--success');
    }
  }

  async function handleShareSubmit(event) {
    event?.preventDefault?.();
    if (!firestore) {
      setShareStatus(translateWithFallback('communityFirestoreInitFailed', 'Firestore 초기화에 실패했습니다.'), 'error');
      return;
    }
    if (!currentUser) {
      setShareStatus(translateWithFallback('communityLoginRequired', 'Google 로그인 후 이용해주세요.'), 'error');
      return;
    }
    const circuit = sanitizeCircuit(getCircuit());
    if (!circuit || circuit.rows <= 0 || circuit.cols <= 0) {
      setShareStatus(translateWithFallback('communityCircuitNotFound', '회로를 찾을 수 없어요.'), 'error');
      return;
    }
    const title = (titleInput?.value || '').trim();
    const description = (descInput?.value || '').trim();
    const blockCount = Object.keys(circuit.blocks || {}).length;
    const wireCount = countWireCells(circuit.wires);

    if (shareSubmit) {
      shareSubmit.disabled = true;
    }
    setShareStatus(translateWithFallback('communityUploadInProgress', '회로를 업로드하는 중입니다...'));

    const payload = {
      title: title || translateWithFallback('communityUntitledCircuit', '제목 없는 회로'),
      description,
      stats: {
        blocks: blockCount,
        wires: wireCount,
      },
      circuit,
      author: {
        uid: currentUser.uid,
        name: resolveAuthorName(currentUser),
        photoURL: currentUser.photoURL || null,
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await firestore.collection('circuitCommunity').add(payload);
      setShareStatus(translateWithFallback('communityShareSuccess', '커뮤니티에 회로를 공유했습니다!'), 'success');
      setStatusMessage(translateWithFallback('communityShareSuccessStatus', '회로가 커뮤니티에 업로드되었습니다.'), 'success');
      if (shareOverlay) {
        setTimeout(() => closeOverlay(shareOverlay), 800);
      }
      titleInput && (titleInput.value = '');
      descInput && (descInput.value = '');
    } catch (err) {
      console.error('Failed to upload circuit to community', err);
      setShareStatus(
        translateWithFallback('communityUploadFailed', '업로드에 실패했습니다. 잠시 후 다시 시도해주세요.'),
        'error'
      );
    } finally {
      if (shareSubmit) {
        shareSubmit.disabled = false;
      }
      updateShareStats();
    }
  }

  function clearCommunityList() {
    if (listContainer) {
      listContainer.innerHTML = '';
    }
  }

  function renderEmptyState(visible) {
    if (emptyState) {
      emptyState.hidden = !visible;
    }
  }

  function setLoading(loading) {
    if (loadingEl) {
      loadingEl.hidden = !loading;
    }
  }

  function setBrowserStatus(message, tone = 'info') {
    if (!browserStatus) return;
    browserStatus.textContent = message || '';
    browserStatus.classList.remove('community-status--error', 'community-status--success');
    if (!message) return;
    if (tone === 'error') {
      browserStatus.classList.add('community-status--error');
    } else if (tone === 'success') {
      browserStatus.classList.add('community-status--success');
    }
  }

  function createCircuitCard(doc) {
    const data = doc.data();
    const card = document.createElement('article');
    card.className = 'community-card';

    const titleEl = document.createElement('h3');
    titleEl.textContent = data.title || translateWithFallback('communityUntitledCircuit', '제목 없는 회로');
    card.appendChild(titleEl);

    const meta = document.createElement('p');
    const authorName = data.author?.name || translateWithFallback('anonymousUser', '익명');
    const createdText = formatDate(data.createdAt);
    meta.className = 'community-card__meta';
    meta.textContent = createdText
      ? formatTranslation('communityCardMetaTemplate', '{author} • {date}', { author: authorName, date: createdText })
      : authorName;
    card.appendChild(meta);

    if (data.description) {
      const desc = document.createElement('p');
      desc.className = 'community-card__desc';
      desc.textContent = data.description;
      card.appendChild(desc);
    }

    const stats = document.createElement('p');
    stats.className = 'community-card__stats';
    const blocks = data.stats?.blocks ?? 0;
    const wires = data.stats?.wires ?? 0;
    stats.textContent = formatTranslation(
      'communityCardStatsTemplate',
      '블록 {blocks}개 · 도선 {wires}개',
      { blocks, wires }
    );
    card.appendChild(stats);

    const actions = document.createElement('div');
    actions.className = 'community-card__actions';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.textContent = translateWithFallback('communityLoadButton', '이 회로 불러오기');
    loadBtn.className = 'community-card__load';
    loadBtn.addEventListener('click', () => {
      const circuit = sanitizeCircuit(data.circuit);
      if (!circuit) {
        setBrowserStatus(
          translateWithFallback('communityLoadCircuitFailed', '회로 데이터를 불러오지 못했습니다.'),
          'error'
        );
        return;
      }
      const applied = applyCircuit(circuit);
      if (!applied) {
        setBrowserStatus(
          translateWithFallback('communityApplyCircuitFailed', '회로를 불러오는 데 실패했습니다.'),
          'error'
        );
        return;
      }
      ensureLabVisible();
      closeOverlay(browserOverlay);
      setStatusMessage(
        translateWithFallback('communityLoadCircuitSuccess', '커뮤니티 회로를 불러왔습니다.'),
        'success'
      );
      onCircuitLoaded({ id: doc.id, data });
    });
    actions.appendChild(loadBtn);

    const isOwner = currentUser && data.author?.uid && data.author.uid === currentUser.uid;
    if (isOwner) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = translateWithFallback('communityDeleteButton', '내 회로 삭제');
      deleteBtn.className = 'community-card__delete';
      deleteBtn.addEventListener('click', async () => {
        if (!firestore) {
          setBrowserStatus(
            translateWithFallback('communityFirestoreInitFailed', 'Firestore 초기화에 실패했습니다.'),
            'error'
          );
          return;
        }
        if (!currentUser) {
          setBrowserStatus(
            translateWithFallback('communityLoginRequired', 'Google 로그인 후 이용해주세요.'),
            'error'
          );
          return;
        }
        if (typeof window !== 'undefined' && window.confirm) {
          const confirmed = window.confirm(
            translateWithFallback('communityDeleteConfirm', '정말로 이 회로를 삭제할까요? 되돌릴 수 없습니다.')
          );
          if (!confirmed) return;
        }

        const originalText = deleteBtn.textContent;
        deleteBtn.disabled = true;
        deleteBtn.textContent = translateWithFallback('communityDeleting', '삭제 중...');

        try {
          await firestore.collection('circuitCommunity').doc(doc.id).delete();
          card.remove();
          setBrowserStatus(translateWithFallback('communityDeleteSuccess', '회로를 삭제했습니다.'), 'success');
          setStatusMessage(
            translateWithFallback('communityDeleteSuccessStatus', '커뮤니티 회로를 삭제했습니다.'),
            'success'
          );
          if (listContainer && !listContainer.querySelector('.community-card')) {
            renderEmptyState(true);
            setBrowserStatus(
              translateWithFallback(
                'communityDeleteSuccessEmpty',
                '회로를 삭제했습니다. 현재 등록된 회로가 없습니다.'
              ),
              'success'
            );
          }
        } catch (err) {
          console.error('Failed to delete community circuit', err);
          setBrowserStatus(
            translateWithFallback(
              'communityDeleteFailed',
              '회로 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.'
            ),
            'error'
          );
          deleteBtn.disabled = false;
          deleteBtn.textContent = originalText;
        }
      });
      actions.appendChild(deleteBtn);
    }
    card.appendChild(actions);

    return card;
  }

  async function loadCommunityCircuits() {
    if (!firestore) {
      setBrowserStatus(
        translateWithFallback('communityFirestoreInitFailed', 'Firestore 초기화에 실패했습니다.'),
        'error'
      );
      return;
    }
    if (loadingList) return;
    loadingList = true;
    setBrowserStatus(translateWithFallback('communityListLoading', '회로 목록을 불러오는 중입니다...'));
    setLoading(true);
    renderEmptyState(false);
    clearCommunityList();
    try {
      const snapshot = await firestore
        .collection('circuitCommunity')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      setLoading(false);
      loadingList = false;
      const docs = snapshot.docs || [];
      if (!docs.length) {
        renderEmptyState(true);
        setBrowserStatus(
          translateWithFallback('communityListEmpty', '아직 등록된 회로가 없어요. 첫 번째로 공유해보세요!')
        );
        return;
      }
      setBrowserStatus(
        formatTranslation('communityListLoaded', '총 {count}개의 회로를 불러왔습니다.', { count: docs.length })
      );
      docs.forEach(doc => {
        const card = createCircuitCard(doc);
        listContainer?.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load community circuits', err);
      setLoading(false);
      loadingList = false;
      setBrowserStatus(
        translateWithFallback('communityListLoadFailed', '회로 목록을 가져오지 못했습니다.'),
        'error'
      );
    }
  }

  function handleOverlayBackgroundClick(event, overlay) {
    if (!overlay || event.target !== overlay) return;
    closeOverlay(overlay);
  }

  shareBtn?.addEventListener('click', () => {
    if (!currentUser) {
      setStatusMessage(
        translateWithFallback('communityStatusLoginRequired', 'Google 로그인 후 이용해주세요.'),
        'error'
      );
      return;
    }
    resetShareForm();
    openOverlay(shareOverlay);
  });

  browseBtn?.addEventListener('click', () => {
    if (!currentUser) {
      setStatusMessage(
        translateWithFallback('communityStatusLoginRequired', 'Google 로그인 후 이용해주세요.'),
        'error'
      );
      return;
    }
    openOverlay(browserOverlay);
    loadCommunityCircuits();
  });

  shareCancel?.addEventListener('click', () => {
    closeOverlay(shareOverlay);
  });
  shareClose?.addEventListener('click', () => {
    closeOverlay(shareOverlay);
  });
  browseClose?.addEventListener('click', () => {
    closeOverlay(browserOverlay);
  });

  shareOverlay?.addEventListener('click', event => handleOverlayBackgroundClick(event, shareOverlay));
  browserOverlay?.addEventListener('click', event => handleOverlayBackgroundClick(event, browserOverlay));

  shareForm?.addEventListener('submit', handleShareSubmit);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (shareOverlay?.dataset.open === 'true') {
      closeOverlay(shareOverlay);
    }
    if (browserOverlay?.dataset.open === 'true') {
      closeOverlay(browserOverlay);
    }
  });

  if (auth) {
    auth.onAuthStateChanged(user => {
      updateLoginState(user);
    });
    updateLoginState(auth.currentUser);
  } else {
    updateLoginState(null);
  }

  updateShareStats();
}
