const STORY_SOURCE = 'storyFragments.json';

const PLAYBACK_TIMING = {
  visualDelayMs: 260,
  lineIntervalMs: 960,
  holdAfterLastLineMs: 3600,
  fadeOutMs: 360
};

let fragments = [];
let storyDataPromise = null;
let containerEl = null;
let progressLabelEl = null;
let progressBarEl = null;
let titleEl = null;
let subtitleEl = null;
let overlayEl = null;
let modalEl = null;
let continueBtn = null;
let backBtn = null;
let closeBtn = null;
let hudBtn = null;
let playbackOverlayEl = null;
let playbackTitleEl = null;
let playbackCountEl = null;
let playbackVisualEl = null;
let playbackTextEl = null;
let playbackMetricsEl = null;
let playbackSceneTitleEl = null;
let playbackResolve = null;
let playbackTimers = [];
let playbackActive = false;
let archiveActive = false;
let archiveIndex = 0;
let archivePrevBtn = null;
let archiveNextBtn = null;
let archiveCloseBtn = null;
let getClearedLevelsRef = () => [];
let isLoading = false;
let currentFragmentIndex = 0;
let unlockedFragmentCount = 0;
let nextButtonMode = 'locked';

export function initializeStory({ getClearedLevels } = {}) {
  containerEl = document.getElementById('storyFragmentsList');
  progressLabelEl = document.getElementById('storyModalProgress');
  progressBarEl = document.getElementById('storyProgressBar');
  titleEl = document.getElementById('storyModalTitle');
  subtitleEl = document.getElementById('storyModalSubtitle');
  overlayEl = document.getElementById('storyModalOverlay');
  modalEl = overlayEl?.querySelector('.story-modal');
  continueBtn = document.getElementById('storyModalContinueBtn');
  backBtn = document.getElementById('storyModalBackBtn');
  closeBtn = document.getElementById('storyModalCloseBtn');
  hudBtn = document.getElementById('storyHudBtn');
  playbackOverlayEl = document.getElementById('storyPlaybackOverlay');
  playbackTitleEl = document.getElementById('storyPlaybackTitle');
  playbackCountEl = document.getElementById('storyPlaybackCount');
  playbackVisualEl = document.getElementById('storyPlaybackVisual');
  playbackTextEl = document.getElementById('storyPlaybackText');
  playbackMetricsEl = document.getElementById('storyPlaybackMetrics');
  playbackSceneTitleEl = document.getElementById('storyPlaybackSceneTitle');

  if (!containerEl || !overlayEl || !modalEl) {
    return null;
  }

  getClearedLevelsRef = typeof getClearedLevels === 'function'
    ? getClearedLevels
    : (() => []);

  hudBtn?.addEventListener('click', () => openStoryArchive({ reset: true }));
  continueBtn?.addEventListener('click', handleContinueClick);
  backBtn?.addEventListener('click', handleBackClick);
  closeBtn?.addEventListener('click', closeStoryModal);
  overlayEl.addEventListener('click', event => {
    if (event.target === overlayEl) {
      closeStoryModal();
    }
  });
  playbackOverlayEl?.addEventListener('pointerdown', handlePlaybackPointerDown);
  document.addEventListener('keydown', handleKeydown, true);

  isLoading = true;
  setBusyState(true);
  renderStatus('스토리를 불러오는 중입니다...');

  storyDataPromise = fetch(STORY_SOURCE)
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to load story fragments: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      fragments = Array.isArray(data.fragments) ? data.fragments : [];
      isLoading = false;
      setBusyState(false);
      renderFragments();
      return fragments;
    })
    .catch(err => {
      isLoading = false;
      console.error('Failed to load story fragments', err);
      setBusyState(false);
      renderStatus('스토리를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return [];
    });

  document.addEventListener('stageMap:progressUpdated', renderFragments);

  return {
    refresh: renderFragments
  };
}

export async function openStoryArchive({ reset = false } = {}) {
  await ensureStoryDataLoaded();
  if (!playbackOverlayEl || !playbackTitleEl || !playbackVisualEl || !playbackTextEl) return;
  if (reset) {
    archiveIndex = Math.max(0, getArchiveMaxIndex());
  } else if (archiveIndex > getArchiveMaxIndex()) {
    archiveIndex = getArchiveMaxIndex();
  }
  archiveActive = true;
  clearPlaybackTimers();
  ensureArchiveControls();
  renderArchiveFragment();
  playbackOverlayEl.classList.remove('is-closing');
  playbackOverlayEl.classList.add('story-playback-overlay--archive');
  playbackOverlayEl.dataset.open = 'true';
  playbackOverlayEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('story-playback-open');
  window.requestAnimationFrame(() => {
    playbackVisualEl?.classList.add('is-visible');
    archiveNextBtn?.focus();
  });
}

export function openStoryModal(options = {}) {
  return openStoryArchive(options);
}

export function closeStoryModal() {
  if (archiveActive) {
    closeStoryArchive();
    return;
  }
  if (overlayEl) {
    overlayEl.dataset.open = 'false';
    overlayEl.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('story-modal-open');
  hudBtn?.focus();
}

export async function playStoryFragmentById(fragmentId, options = {}) {
  await ensureStoryDataLoaded();
  const fragment = fragments.find(item => Number(item?.id) === Number(fragmentId));
  if (!fragment) return false;
  return playStoryFragment(fragment, options);
}

export async function playStoryFragmentForClearCount(clearCount, options = {}) {
  await ensureStoryDataLoaded();
  const fragment = getStoryFragmentForClearCount(clearCount);
  if (!fragment) return false;
  return playStoryFragment(fragment, {
    ...options,
    rewardSequence: clearCount
  });
}

export function getStoryFragmentForClearCount(clearCount) {
  const sequence = Number(clearCount);
  if (!Number.isFinite(sequence) || sequence < 1) return null;
  return fragments.find(fragment => Number(fragment?.rewardSequence) === sequence)
    || fragments.find(fragment => Number(fragment?.id) === sequence)
    || null;
}

function ensureStoryDataLoaded() {
  if (storyDataPromise) return storyDataPromise;
  return Promise.resolve(fragments);
}

function playStoryFragment(fragment, options = {}) {
  if (!playbackOverlayEl || !playbackTitleEl || !playbackVisualEl || !playbackTextEl) {
    return Promise.resolve(false);
  }
  if (playbackActive) {
    return Promise.resolve(false);
  }

  const lines = getPlaybackLines(fragment);
  if (!lines.length) return Promise.resolve(false);

  playbackActive = true;
  clearPlaybackTimers();
  playbackTitleEl.textContent = fragment.title || '';
  if (playbackCountEl) {
    playbackCountEl.textContent = Number.isFinite(Number(fragment.id))
      ? `${String(fragment.id).padStart(2, '0')} / ${fragments.length || '--'}`
      : '';
  }
  playbackTextEl.innerHTML = '';
  renderPlaybackVisual(fragment);
  playbackVisualEl.classList.remove('is-visible');
  playbackOverlayEl.classList.remove('is-closing');
  playbackOverlayEl.dataset.open = 'true';
  playbackOverlayEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('story-playback-open');

  return new Promise(resolve => {
    playbackResolve = resolve;
    queuePlaybackTimer(() => {
      playbackVisualEl?.classList.add('is-visible');
    }, PLAYBACK_TIMING.visualDelayMs);

    lines.forEach((line, index) => {
      queuePlaybackTimer(() => {
        renderPlaybackLine(line);
      }, PLAYBACK_TIMING.visualDelayMs + (index + 1) * PLAYBACK_TIMING.lineIntervalMs);
    });

    const totalDuration =
      PLAYBACK_TIMING.visualDelayMs
      + (lines.length + 1) * PLAYBACK_TIMING.lineIntervalMs
      + PLAYBACK_TIMING.holdAfterLastLineMs;
    queuePlaybackTimer(() => {
      finishStoryPlayback(true);
    }, totalDuration);
  });
}

function getPlaybackLines(fragment) {
  const source = Array.isArray(fragment?.body) && fragment.body.length
    ? fragment.body
    : (Array.isArray(fragment?.lines) ? fragment.lines : []);
  return source
    .map(line => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function renderPlaybackLine(text) {
  if (!playbackTextEl) return;
  const line = document.createElement('p');
  const index = playbackTextEl.querySelectorAll('.story-playback__line').length;
  line.className = [
    'story-playback__line',
    index === 0 ? 'story-playback__line--primary' : 'story-playback__line--detail'
  ].join(' ');

  line.textContent = text;
  playbackTextEl.appendChild(line);
  window.requestAnimationFrame(() => {
    line.classList.add('is-visible');
  });
}

function handlePlaybackPointerDown(event) {
  if (!playbackActive) return;
  event.preventDefault();
  finishStoryPlayback(true);
}

function finishStoryPlayback(shown) {
  if (!playbackActive) return;
  clearPlaybackTimers();
  playbackActive = false;
  playbackOverlayEl?.classList.add('is-closing');
  queuePlaybackTimer(() => {
    if (playbackOverlayEl) {
      playbackOverlayEl.dataset.open = 'false';
      playbackOverlayEl.setAttribute('aria-hidden', 'true');
      playbackOverlayEl.classList.remove('is-closing');
    }
    playbackVisualEl?.classList.remove('is-visible');
    if (playbackVisualEl) {
      playbackVisualEl.innerHTML = '';
      playbackVisualEl.removeAttribute('data-visual-type');
    }
    playbackOverlayEl?.removeAttribute('data-story-weight');
    resetPlaybackDiagnostics();
    if (playbackTextEl) {
      playbackTextEl.innerHTML = '';
    }
    document.body.classList.remove('story-playback-open');
    const resolve = playbackResolve;
    playbackResolve = null;
    resolve?.(Boolean(shown));
  }, PLAYBACK_TIMING.fadeOutMs);
}

function closeStoryArchive() {
  if (!archiveActive) return;
  archiveActive = false;
  clearPlaybackTimers();
  playbackOverlayEl?.classList.add('is-closing');
  queuePlaybackTimer(() => {
    if (playbackOverlayEl) {
      playbackOverlayEl.dataset.open = 'false';
      playbackOverlayEl.setAttribute('aria-hidden', 'true');
      playbackOverlayEl.classList.remove('is-closing');
      playbackOverlayEl.classList.remove('story-playback-overlay--archive');
    }
    playbackVisualEl?.classList.remove('is-visible');
    if (playbackVisualEl) {
      playbackVisualEl.innerHTML = '';
      playbackVisualEl.removeAttribute('data-visual-type');
    }
    playbackOverlayEl?.removeAttribute('data-story-weight');
    resetPlaybackDiagnostics();
    if (playbackTextEl) {
      playbackTextEl.innerHTML = '';
    }
    document.body.classList.remove('story-playback-open');
    hudBtn?.focus();
  }, PLAYBACK_TIMING.fadeOutMs);
}

function queuePlaybackTimer(callback, delay) {
  const timer = window.setTimeout(callback, delay);
  playbackTimers.push(timer);
  return timer;
}

function clearPlaybackTimers() {
  playbackTimers.forEach(timer => window.clearTimeout(timer));
  playbackTimers = [];
}

function ensureArchiveControls() {
  if (!playbackOverlayEl) return;
  if (!archiveCloseBtn) {
    archiveCloseBtn = document.createElement('button');
    archiveCloseBtn.type = 'button';
    archiveCloseBtn.className = 'story-archive__close';
    archiveCloseBtn.setAttribute('aria-label', '스토리 닫기');
    archiveCloseBtn.textContent = 'x';
    archiveCloseBtn.addEventListener('click', closeStoryArchive);
    playbackOverlayEl.appendChild(archiveCloseBtn);
  }
  if (!archivePrevBtn) {
    archivePrevBtn = document.createElement('button');
    archivePrevBtn.type = 'button';
    archivePrevBtn.className = 'story-archive__nav story-archive__nav--prev';
    archivePrevBtn.setAttribute('aria-label', '이전 Fragment');
    archivePrevBtn.textContent = '<';
    archivePrevBtn.addEventListener('click', () => moveArchive(-1));
    playbackOverlayEl.appendChild(archivePrevBtn);
  }
  if (!archiveNextBtn) {
    archiveNextBtn = document.createElement('button');
    archiveNextBtn.type = 'button';
    archiveNextBtn.className = 'story-archive__nav story-archive__nav--next';
    archiveNextBtn.setAttribute('aria-label', '다음 Fragment');
    archiveNextBtn.textContent = '>';
    archiveNextBtn.addEventListener('click', () => moveArchive(1));
    playbackOverlayEl.appendChild(archiveNextBtn);
  }
}

function getArchiveMaxIndex() {
  if (!fragments.length) return 0;
  const unlocked = Math.min(getClearedCount(), fragments.length);
  return Math.max(0, unlocked - 1);
}

function getArchiveFragment() {
  if (!fragments.length) return null;
  const maxIndex = getArchiveMaxIndex();
  archiveIndex = Math.max(0, Math.min(archiveIndex, maxIndex));
  if (getClearedCount() <= 0) return null;
  return fragments[archiveIndex] || null;
}

function renderArchiveFragment() {
  if (!playbackTitleEl || !playbackCountEl || !playbackVisualEl || !playbackTextEl) return;
  const fragment = getArchiveFragment();
  const unlocked = Math.min(getClearedCount(), fragments.length);
  playbackTextEl.innerHTML = '';
  playbackVisualEl.classList.remove('is-visible');

  if (!fragment) {
    playbackTitleEl.textContent = '기억을 복구하세요';
    playbackCountEl.textContent = `00 / ${fragments.length || '--'}`;
    renderPlaybackVisual(null, { locked: true });
    renderArchiveLine('아직 복구된 Fragment가 없습니다.');
  } else {
    playbackTitleEl.textContent = fragment.title || '';
    playbackCountEl.textContent = `${String(fragment.id).padStart(2, '0')} / ${fragments.length || '--'}`;
    renderPlaybackVisual(fragment);
    getPlaybackLines(fragment).forEach(renderArchiveLine);
  }

  updateArchiveControls(unlocked);
  window.requestAnimationFrame(() => {
    playbackVisualEl?.classList.add('is-visible');
    playbackTextEl?.querySelectorAll('.story-playback__line').forEach(line => {
      line.classList.add('is-visible');
    });
  });
}

function renderArchiveLine(text) {
  if (!playbackTextEl) return;
  const line = document.createElement('p');
  const index = playbackTextEl.querySelectorAll('.story-playback__line').length;
  line.className = [
    'story-playback__line',
    index === 0 ? 'story-playback__line--primary' : 'story-playback__line--detail',
    'is-visible'
  ].join(' ');

  line.textContent = text;
  playbackTextEl.appendChild(line);
}

function updateArchiveControls(unlockedCount = Math.min(getClearedCount(), fragments.length)) {
  const hasFragments = unlockedCount > 0;
  const maxIndex = getArchiveMaxIndex();
  if (archivePrevBtn) {
    archivePrevBtn.disabled = !hasFragments || archiveIndex <= 0;
  }
  if (archiveNextBtn) {
    archiveNextBtn.disabled = !hasFragments || archiveIndex >= maxIndex;
  }
}

function moveArchive(delta) {
  if (!archiveActive) return;
  const nextIndex = archiveIndex + delta;
  const maxIndex = getArchiveMaxIndex();
  archiveIndex = Math.max(0, Math.min(nextIndex, maxIndex));
  renderArchiveFragment();
}

function renderPlaybackVisual(fragment, options = {}) {
  if (!playbackVisualEl) return;
  const type = options.locked ? 'locked' : normalizeVisualType(fragment?.visual?.type);
  const scene = createStorySceneState(fragment, { ...options, type });
  playbackVisualEl.innerHTML = '';
  playbackVisualEl.dataset.visualType = type;
  playbackOverlayEl?.setAttribute('data-story-weight', scene.visualWeight || 'full');
  playbackVisualEl.appendChild(renderStorySystemVisualization(scene));
  renderPlaybackMetrics(scene);
  if (playbackSceneTitleEl) {
    playbackSceneTitleEl.textContent = scene.title;
  }
}

function normalizeVisualType(type) {
  const value = String(type || '').trim().toLowerCase();
  return value || 'flat-plane';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const PROGRESSIVE_SYSTEM_NODES = [
  {
    id: 'signal',
    x: 155,
    y: 250,
    revealAt: 1,
    activeAt: 5,
    labels: [
      { until: 3, label: '', detail: '' },
      { until: 8, label: 'SIGNAL TRACE', detail: '연결 흔적' },
      { until: 27, label: 'NEURAL INPUT', detail: '외부 신호' }
    ]
  },
  {
    id: 'core',
    x: 390,
    y: 250,
    revealAt: 4,
    activeAt: 12,
    labels: [
      { until: 7, label: 'UNKNOWN NODE', detail: '중심 후보' },
      { until: 11, label: 'CORE ?', detail: '자아 흔적' },
      { until: 27, label: 'CORE N-0', detail: '자아의 중심' }
    ]
  },
  {
    id: 'memory',
    x: 625,
    y: 170,
    revealAt: 6,
    activeAt: 15,
    corruptFrom: 6,
    corruptUntil: 13,
    labels: [
      { until: 9, label: 'FRAGMENT STORE', detail: '기억 파편' },
      { until: 12, label: 'MEMORY ?', detail: '기억 후보' },
      { until: 27, label: 'MEMORY M-01', detail: '기억 영역' }
    ]
  },
  {
    id: 'perception',
    x: 625,
    y: 330,
    revealAt: 10,
    activeAt: 19,
    labels: [
      { until: 18, label: 'SENSORY TRACE', detail: '감각 흔적' },
      { until: 27, label: 'PERCEPTION', detail: '감각 영역' }
    ]
  },
  {
    id: 'reality',
    x: 155,
    y: 390,
    revealAt: 14,
    activeAt: 23,
    labels: [
      { until: 16, label: 'EXTERNAL TRACE', detail: '현실 신호' },
      { until: 22, label: 'REALITY ?', detail: '외부 세계' },
      { until: 27, label: 'REALITY LINK', detail: '현실 연결' }
    ]
  },
  {
    id: 'protocol',
    x: 390,
    y: 420,
    revealAt: 20,
    activeAt: 24,
    labels: [
      { until: 21, label: 'PROTOCOL ?', detail: '복구 절차' },
      { until: 27, label: 'CONTEXT C-04', detail: '맥락 영역' }
    ]
  },
  {
    id: 'logic',
    x: 560,
    y: 90,
    revealAt: 22,
    activeAt: 24,
    labels: [
      { until: 23, label: 'SCHEMA TRACE', detail: '설계 흔적' },
      { until: 27, label: 'LOGIC L-02', detail: '판단 영역' }
    ]
  },
  {
    id: 'temporal',
    x: 220,
    y: 90,
    revealAt: 18,
    activeAt: 26,
    corruptFrom: 18,
    corruptUntil: 20,
    labels: [
      { until: 22, label: 'DECAY TIMER', detail: '남은 시간' },
      { until: 27, label: 'TEMPORAL T-03', detail: '시간 영역' }
    ]
  }
];

const PROGRESSIVE_SYSTEM_PATHS = [
  {
    id: 'signal-early-trace',
    points: [
      { x: 155, y: 250 },
      { x: 255, y: 250 },
      { x: 300, y: 220 }
    ],
    revealAt: 2,
    revealUntil: 3,
    activeAt: 4,
    brokenFrom: 3,
    brokenUntil: 3,
    pulse: false,
    showConnectors: false,
    labels: {}
  },
  {
    id: 'signal-core',
    from: 'signal',
    to: 'core',
    revealAt: 4,
    activeAt: 5,
    labels: {
      restoring: '신호가 중심을 향해 뻗는다',
      active: '첫 연결이 숨을 쉰다'
    }
  },
  {
    id: 'core-memory',
    from: 'core',
    to: 'memory',
    revealAt: 6,
    activeAt: 15,
    brokenUntil: 6,
    labels: {
      broken: '기억 앞에서 선이 끊어진다',
      restoring: '기억으로 가는 길이 다시 이어진다',
      active: '기억이 길을 타고 돌아온다'
    }
  },
  {
    id: 'core-perception',
    from: 'core',
    to: 'perception',
    revealAt: 10,
    activeAt: 19,
    labels: {
      restoring: '감각이 희미하게 스며든다',
      active: '감각이 또렷해진다'
    }
  },
  {
    id: 'signal-reality',
    from: 'signal',
    to: 'reality',
    revealAt: 14,
    activeAt: 23,
    labels: {
      restoring: '현실의 목소리가 다가온다',
      active: '현실 쪽 문이 열린다'
    }
  },
  {
    id: 'core-temporal',
    from: 'core',
    to: 'temporal',
    revealAt: 18,
    activeAt: 26,
    brokenFrom: 18,
    brokenUntil: 20,
    labels: {
      broken: '남은 시간이 짧아진다',
      restoring: '무너지는 틈을 붙든다',
      active: '돌아갈 순간이 열린다'
    }
  },
  {
    id: 'memory-perception',
    from: 'memory',
    to: 'perception',
    revealAt: 19,
    activeAt: 25,
    labels: {
      restoring: '감각이 기억에 닿는다',
      active: '몸의 기억이 돌아온다'
    }
  },
  {
    id: 'core-protocol',
    from: 'core',
    to: 'protocol',
    revealAt: 20,
    activeAt: 24,
    labels: {
      restoring: '남겨 둔 절차가 깨어난다',
      active: '내가 만든 길이 나를 붙든다'
    }
  },
  {
    id: 'protocol-logic',
    from: 'protocol',
    to: 'logic',
    revealAt: 22,
    activeAt: 24,
    labels: {
      restoring: '선택의 이유가 선명해진다',
      active: '판단이 제자리로 돌아온다'
    }
  },
  {
    id: 'protocol-memory',
    from: 'protocol',
    to: 'memory',
    revealAt: 25,
    activeAt: 27,
    labels: {
      restoring: '마지막 빈틈이 좁아진다',
      active: '돌아갈 길이 맞물린다'
    }
  }
];

const STORY_CHANGE_LABELS = {
  1: '희미한 신호가 깜박인다',
  2: '평면의 감각이 남는다',
  3: '넘을 수 없는 선이 생긴다',
  4: '회로의 그림자가 떠오른다',
  5: '첫 기억이 짧게 스친다',
  6: '끊어진 길이 눈에 밟힌다',
  7: '익숙한 설계가 손끝에 남는다',
  8: '감각이 아주 얇게 돌아온다',
  9: '목소리의 조각이 닿는다',
  10: '장치의 윤곽이 떠오른다',
  11: '내 선택의 기록이 열린다',
  12: '안전한 틈의 정체를 알아본다',
  13: '끊어진 다리가 드러난다',
  14: '회로가 다리였음을 깨닫는다',
  15: '내가 남긴 설계가 떠오른다',
  16: '외면한 경고가 돌아온다',
  17: '추락의 순간이 되감긴다',
  18: '남은 시간이 얇아진다',
  19: '감각의 선이 두꺼워진다',
  20: '이 세계가 흔들리기 시작한다',
  21: '두 층이 한 몸처럼 겹친다',
  22: '책임의 무게가 선명해진다',
  23: '현실의 박동이 안정된다',
  24: '돌아가야 할 이유가 생긴다',
  25: '마지막 다리들이 놓인다',
  26: '경계가 눈앞까지 다가온다',
  27: '모든 연결이 맞물린다'
};

const STORY_FOCUS_NODE_BY_SEQUENCE = {
  1: 'signal',
  2: 'signal',
  3: 'signal',
  4: 'core',
  5: 'core',
  6: 'memory',
  7: 'memory',
  8: 'memory',
  9: 'memory',
  10: 'perception',
  11: 'perception',
  12: 'core',
  13: 'memory',
  14: 'reality',
  15: 'core',
  16: 'core',
  17: 'core',
  18: 'temporal',
  19: 'perception',
  20: 'protocol',
  21: 'protocol',
  22: 'logic',
  23: 'reality',
  24: 'protocol',
  25: 'perception',
  26: 'temporal',
  27: 'core'
};

const STORY_FOCUS_PATH_BY_SEQUENCE = {
  2: 'signal-early-trace',
  3: 'signal-early-trace',
  4: 'signal-core',
  5: 'signal-core',
  6: 'core-memory',
  7: 'core-memory',
  8: 'core-memory',
  9: 'core-memory',
  10: 'core-perception',
  11: 'core-perception',
  12: 'core-perception',
  13: 'core-memory',
  14: 'signal-reality',
  15: 'core-memory',
  16: 'signal-reality',
  17: 'signal-reality',
  18: 'core-temporal',
  19: 'memory-perception',
  20: 'core-protocol',
  21: 'core-protocol',
  22: 'core-protocol',
  23: 'signal-reality',
  24: 'protocol-logic',
  25: 'memory-perception',
  26: 'core-temporal',
  27: 'protocol-memory'
};

function createStorySceneState(fragment, options = {}) {
  if (options.locked) {
    return createLockedSceneState();
  }

  const type = normalizeVisualType(options.type || fragment?.visual?.type);
  const sequence = getFragmentSequence(fragment);
  const progress = getFragmentProgress(sequence);
  const phase = getProgressivePhase(sequence);
  return {
    family: phase.key,
    type,
    title: phase.title,
    mode: phase.mode,
    routeLabel: getProgressiveRouteLabel(sequence),
    operation: getProgressiveOperation(sequence),
    diagramNote: getProgressiveDiagramNote(sequence),
    visualWeight: getProgressiveVisualWeight(sequence),
    phases: getProgressiveScenePhases(phase),
    changeLabel: STORY_CHANGE_LABELS[sequence] || 'MEMORY TRACE UPDATED',
    focusMetric: getProgressiveFocusMetric(sequence),
    metrics: buildProgressiveMetrics(sequence, progress),
    nodes: buildProgressiveNodes(sequence),
    paths: buildProgressivePaths(sequence)
  };
}

function createLockedSceneState() {
  return {
    family: 'unknown',
    type: 'locked',
    title: 'Recovery Locked',
    mode: 'SAFE MODE / AWAITING CLEAR',
    routeLabel: 'NO RESTORED FRAGMENT',
    operation: '복구된 기억 조각이 없습니다.',
    diagramNote: '스테이지를 클리어하면 첫 번째 기록과 복구 경로가 표시됩니다.',
    visualWeight: 'locked',
    phases: ['LOCKED', 'WAITING FOR CLEAR', 'NO ACTIVE ROUTE'],
    focusMetric: 'recovery',
    changeLabel: 'NO ACTIVE TRACE',
    metrics: [
      createMetric('signal', '남은 신호', 0, 'critical', 'S')
    ],
    nodes: [
      { id: 'signal', label: 'NO SIGNAL', detail: '잠김', state: 'inactive', x: 390, y: 250 }
    ],
    paths: []
  };
}

function getFragmentSequence(fragment) {
  const id = Number(fragment?.id);
  if (Number.isFinite(id) && id > 0) return id;
  const rewardSequence = Number(fragment?.rewardSequence);
  if (Number.isFinite(rewardSequence) && rewardSequence > 0) return rewardSequence;
  return 1;
}

function getFragmentProgress(sequence) {
  const total = Math.max(1, fragments.length || 27);
  if (total === 1) return 1;
  return clampStoryNumber((sequence - 1) / (total - 1), 0, 1);
}

function getProgressivePhase(sequence) {
  if (sequence <= 3) {
    return {
      key: 'unknown',
      title: 'Unknown / Void',
      mode: 'SAFE MODE / SIGNAL ONLY',
      phases: ['VOID', 'SIGNAL', 'STRUCTURE UNKNOWN']
    };
  }
  if (sequence <= 8) {
    return {
      key: 'fragment',
      title: 'Fragment / Clue',
      mode: 'SAFE MODE / PARTIAL TRACE',
      phases: ['SIGNAL', 'CLUE', 'ROUTE UNRESOLVED']
    };
  }
  if (sequence <= 14) {
    return {
      key: 'mapping',
      title: 'Mapping / Recognition',
      mode: 'SAFE MODE / MAP RECOGNITION',
      phases: ['CLUE', 'MAPPING', 'SYSTEM EMERGING']
    };
  }
  if (sequence <= 22) {
    return {
      key: 'reconstruction',
      title: 'Reconstruction / Integration',
      mode: 'SAFE MODE / NEURAL RECONSTRUCTION',
      phases: ['MAPPING', 'RECONSTRUCTING', 'FUNCTIONS RETURNING']
    };
  }
  return {
    key: 'integration',
    title: 'Integration / Return',
    mode: 'RECOVERY MODE / EXIT PREP',
    phases: ['RECONSTRUCTING', 'STABILIZING', 'RETURN READY']
  };
}

function getProgressiveOperation(sequence) {
  if (sequence <= 3) return '아무것도 없는 곳에, 신호 하나가 혼자 깜박인다.';
  if (sequence <= 8) return '신호 주변에, 아직 닿지 못한 연결들이 흔적으로 남아 있다.';
  if (sequence <= 14) return '흩어져 있던 것들이, 하나의 중심으로 모이기 시작한다.';
  if (sequence <= 18) return '내가 남겨 둔 길이, 어둠 속에서 다시 손에 잡힌다.';
  if (sequence <= 22) return '기억과 감각이 굵어질수록, 무너지는 틈도 선명해진다.';
  if (sequence <= 26) return '마지막 다리들이 이어지고, 돌아갈 곳의 온도가 가까워진다.';
  return '모든 선이 맞물리는 순간, 나는 다시 나에게 닿는다.';
}

function getProgressiveDiagramNote(sequence) {
  if (sequence <= 8) return '';
  if (sequence <= 14) return '끊어진 곳마다, 돌아가지 못한 시간이 남아 있다.';
  if (sequence <= 18) return '내가 만든 절차가, 나를 다시 부른다.';
  if (sequence <= 22) return '현실의 감각이 가까워질수록 이곳은 더 얇아진다.';
  if (sequence <= 26) return '남은 공백은 이제 손이 닿을 만큼 좁다.';
  return '처음의 작은 신호가, 돌아갈 문이 된다.';
}

function getProgressiveRouteLabel(sequence) {
  if (sequence <= 3) return '공백 속에 남은 첫 반응';
  if (sequence <= 8) return '연결되지 못한 기억의 가장자리';
  if (sequence <= 14) return '흩어진 감각이 한곳으로 모인다';
  if (sequence <= 18) return '내가 남긴 길이 깨어난다';
  if (sequence <= 22) return '두 세계 사이가 다시 가까워진다';
  if (sequence <= 26) return '돌아갈 다리가 거의 맞물린다';
  return '귀환의 문이 열린다';
}

function getProgressiveVisualWeight(sequence) {
  if (sequence <= 3) return 'early';
  if (sequence <= 8) return 'quiet';
  return 'full';
}

function getProgressiveScenePhases(phase) {
  return phase.phases || ['BEFORE', 'NOW', 'AFTER'];
}

function getProgressiveFocusMetric(sequence) {
  if (sequence <= 3) return 'signal';
  if (sequence <= 8) return 'trace';
  return 'recovery';
}

function buildProgressiveMetrics(sequence, progress) {
  if (sequence <= 3) {
    return [
      createMetric('signal', '남은 신호', Math.round(8 + sequence * 7), 'updated', 'S')
    ];
  }

  const integrity = Math.round(clampStoryNumber(18 + progress * 78, 0, 100));
  const stability = Math.round(clampStoryNumber(26 + progress * 66 - (sequence === 18 ? 16 : 0), 0, 100));
  const corruption = Math.round(clampStoryNumber(82 - progress * 76 + (sequence === 18 ? 10 : 0), 0, 100));
  const recovery = Math.round(clampStoryNumber(progress * 100, 0, 100));

  if (sequence <= 8) {
    return [
      createMetric('trace', '흔적 선명도', Math.round(16 + progress * 58), 'updated', 'T'),
      createMetric('recovery', '돌아오는 정도', recovery, 'warning', 'R')
    ];
  }

  if (sequence <= 14) {
    return [
      createMetric('stability', '신호의 결', stability, getPositiveMetricState(stability), 'S'),
      createMetric('corruption', '끊어진 틈', corruption, getCorruptionMetricState(corruption), 'X'),
      createMetric('recovery', '돌아오는 정도', recovery, 'updated', 'R')
    ];
  }

  return [
    createMetric('integrity', '이어진 정도', integrity, getPositiveMetricState(integrity), 'I'),
    createMetric('stability', '신호의 결', stability, getPositiveMetricState(stability), 'S'),
    createMetric('corruption', '끊어진 틈', corruption, getCorruptionMetricState(corruption), 'X'),
    createMetric('recovery', '돌아오는 정도', recovery, recovery >= 90 ? 'normal' : 'updated', 'R')
  ];
}

function buildProgressiveNodes(sequence) {
  const focusNodeId = STORY_FOCUS_NODE_BY_SEQUENCE[sequence] || null;
  return PROGRESSIVE_SYSTEM_NODES
    .filter(node => sequence >= node.revealAt && (!node.revealUntil || sequence <= node.revealUntil))
    .map(node => {
      const label = getProgressiveNodeLabel(node, sequence);
      const baseState = getProgressiveNodeState(node, sequence);
      const highlighted = node.id === focusNodeId || sequence === node.revealAt;
      return {
        id: node.id,
        x: node.x,
        y: node.y,
        label: label.label,
        detail: label.detail,
        state: baseState,
        highlighted,
        selected: highlighted
      };
    });
}

function buildProgressivePaths(sequence) {
  const focusPathId = STORY_FOCUS_PATH_BY_SEQUENCE[sequence] || null;
  return PROGRESSIVE_SYSTEM_PATHS
    .filter(path => sequence >= path.revealAt && (!path.revealUntil || sequence <= path.revealUntil))
    .map(path => {
      const state = getProgressivePathState(path, sequence);
      const highlighted = path.id === focusPathId || sequence === path.revealAt || sequence === path.activeAt;
      return {
        from: path.from,
        to: path.to,
        points: path.points,
        state,
        warning: state === 'broken',
        pulse: path.pulse !== false && state !== 'broken',
        pulseDuration: highlighted ? '1.35s' : '1.9s',
        label: getProgressivePathLabel(path, state, highlighted),
        highlighted,
        showConnectors: path.showConnectors
      };
    });
}

function getProgressiveNodeLabel(node, sequence) {
  return node.labels.find(item => sequence <= item.until)
    || node.labels[node.labels.length - 1]
    || { label: node.id.toUpperCase(), detail: '' };
}

function getProgressiveNodeState(node, sequence) {
  if (node.corruptFrom && sequence >= node.corruptFrom && sequence <= (node.corruptUntil || node.corruptFrom)) {
    return 'corrupted';
  }
  if (sequence >= node.activeAt) return 'active';
  return 'restoring';
}

function getProgressivePathState(path, sequence) {
  if (path.brokenUntil && !path.brokenFrom && sequence <= path.brokenUntil) return 'broken';
  if (path.brokenFrom && sequence >= path.brokenFrom && sequence <= (path.brokenUntil || path.brokenFrom)) return 'broken';
  if (sequence >= path.activeAt) return 'active';
  return 'restoring';
}

function getProgressivePathLabel(path, state, highlighted) {
  if (!highlighted && state !== 'broken') return '';
  return path.labels?.[state] || '';
}

function createMetric(key, label, value, state, marker) {
  return { key, label, value, state, marker };
}

function getPositiveMetricState(value) {
  if (value < 42) return 'critical';
  if (value < 70) return 'warning';
  return 'normal';
}

function getCorruptionMetricState(value) {
  if (value >= 56) return 'critical';
  if (value >= 22) return 'warning';
  return 'normal';
}

function renderStorySystemVisualization(scene) {
  const root = document.createElement('div');
  root.className = `story-system story-system--${scene.family}`;
  root.dataset.scene = scene.family;

  const briefing = document.createElement('div');
  briefing.className = 'story-system__briefing';

  const mode = document.createElement('span');
  mode.className = 'story-system__mode';
  mode.textContent = '지금 남은 흔적';

  const operation = document.createElement('strong');
  operation.className = 'story-system__operation';
  operation.textContent = scene.operation;

  const route = document.createElement('span');
  route.className = 'story-system__route';
  route.textContent = scene.routeLabel;

  const change = document.createElement('span');
  change.className = 'story-system__change';
  change.textContent = scene.changeLabel;

  const note = document.createElement('p');
  note.className = 'story-system__note';
  note.textContent = scene.diagramNote;

  const phases = document.createElement('div');
  phases.className = 'story-system__phases';
  (scene.phases || []).forEach((phase, index) => {
    const item = document.createElement('span');
    item.className = index === 1 ? 'story-system__phase story-system__phase--current' : 'story-system__phase';
    item.textContent = phase;
    phases.appendChild(item);
  });

  briefing.append(mode, operation, route, change, note, phases);
  root.appendChild(briefing);

  const svg = createSvgElement('svg', {
    class: 'story-system__map',
    viewBox: '0 0 800 500',
    role: 'presentation',
    focusable: 'false'
  });

  const nodesById = new Map(scene.nodes.map(node => [node.id, node]));
  scene.paths.forEach((path, index) => renderStoryPath(svg, path, index, nodesById));
  scene.nodes.forEach(node => renderStoryNode(svg, node));
  root.appendChild(svg);

  return root;
}

function renderPlaybackMetrics(scene) {
  if (!playbackMetricsEl) return;
  playbackMetricsEl.innerHTML = '';
  playbackMetricsEl.dataset.metricCount = String(scene.metrics.length);
  scene.metrics.forEach(metric => {
    const card = document.createElement('article');
    card.className = [
      'status-card',
      `status-card--${metric.state}`,
      metric.key === scene.focusMetric ? 'status-card--primary' : ''
    ].filter(Boolean).join(' ');

    const top = document.createElement('div');
    top.className = 'status-card__top';

    const icon = document.createElement('span');
    icon.className = 'status-card__icon';
    icon.textContent = metric.marker;

    const label = document.createElement('span');
    label.className = 'status-card__label';
    label.textContent = metric.label;

    top.append(icon, label);

    const value = document.createElement('strong');
    value.className = 'status-card__value';
    value.textContent = `${metric.value}%`;

    const bar = document.createElement('div');
    bar.className = 'status-card__bar';
    const fill = document.createElement('span');
    fill.style.width = `${metric.value}%`;
    bar.appendChild(fill);

    card.append(top, value, bar);
    playbackMetricsEl.appendChild(card);
  });
}

function resetPlaybackDiagnostics() {
  if (playbackMetricsEl) {
    playbackMetricsEl.innerHTML = '';
    playbackMetricsEl.removeAttribute('data-metric-count');
  }
  if (playbackSceneTitleEl) playbackSceneTitleEl.textContent = 'Diagnostics';
}

function renderStoryPath(svg, path, index, nodesById) {
  const points = getStoryPathPoints(path, nodesById);
  if (points.length < 2) return;

  const id = `story-system-path-${index}`;
  const d = buildSvgPathData(points);
  const state = path.state || 'inactive';
  const pathEl = createSvgElement('path', {
    id,
    class: [
      'story-path',
      `story-path--${state}`,
      path.highlighted ? 'story-path--highlighted' : ''
    ].filter(Boolean).join(' '),
    d,
    pathLength: '100'
  });
  svg.appendChild(pathEl);

  if (path.showConnectors !== false) {
    const start = points[0];
    const end = points[points.length - 1];
    svg.appendChild(createSvgElement('circle', {
      class: `story-connector-dot story-connector-dot--${state}`,
      cx: start.x,
      cy: start.y,
      r: 4
    }));
    svg.appendChild(createSvgElement('circle', {
      class: `story-connector-dot story-connector-dot--${state}`,
      cx: end.x,
      cy: end.y,
      r: 4
    }));
  }

  if (path.warning || state === 'broken') {
    renderBrokenPathMark(svg, points);
  }

  if (path.label) {
    renderStoryPathLabel(svg, points, path.label, state);
  }

  if (path.pulse && state !== 'inactive' && state !== 'broken') {
    const pulse = createSvgElement('circle', {
      class: `story-pulse story-pulse--${state}`,
      r: 5
    });
    const motion = createSvgElement('animateMotion', {
      dur: path.pulseDuration || '1.8s',
      repeatCount: 'indefinite',
      rotate: 'auto'
    });
    const mpath = createSvgElement('mpath', { href: `#${id}` });
    motion.appendChild(mpath);
    pulse.appendChild(motion);
    svg.appendChild(pulse);
  }
}

function renderStoryNode(svg, node) {
  const group = createSvgElement('g', {
    class: [
      'story-node',
      `story-node--${node.state || 'inactive'}`,
      node.selected ? 'story-node--selected' : '',
      node.highlighted ? 'story-node--highlighted' : ''
    ].filter(Boolean).join(' '),
    transform: `translate(${node.x} ${node.y})`
  });

  if (node.state === 'restoring') {
    group.appendChild(createSvgElement('circle', {
      class: 'story-node__restore-ring',
      r: 31
    }));
  }

  group.appendChild(createSvgElement('circle', {
    class: 'story-node__outer',
    r: 25
  }));
  group.appendChild(createSvgElement('circle', {
    class: 'story-node__inner',
    r: 15
  }));
  group.appendChild(createSvgElement('circle', {
    class: 'story-node__core',
    r: 5
  }));

  if (node.state === 'corrupted') {
    group.appendChild(createSvgElement('line', {
      class: 'story-node__fault',
      x1: -10,
      y1: -10,
      x2: 10,
      y2: 10
    }));
    group.appendChild(createSvgElement('line', {
      class: 'story-node__fault',
      x1: 10,
      y1: -10,
      x2: -10,
      y2: 10
    }));
  }

  if (node.selected || node.state === 'selected') {
    renderSelectedNodeBrackets(group);
  }

  const label = createSvgElement('text', {
    class: 'story-node__label',
    x: 0,
    y: 43,
    'text-anchor': 'middle'
  });
  label.textContent = node.label;
  group.appendChild(label);

  if (node.detail) {
    const detail = createSvgElement('text', {
      class: 'story-node__detail',
      x: 0,
      y: 59,
      'text-anchor': 'middle'
    });
    detail.textContent = node.detail;
    group.appendChild(detail);
  }

  svg.appendChild(group);
}

function renderStoryPathLabel(svg, points, label, state) {
  const point = getPolylinePointAtRatio(points, 0.5);
  const width = Math.min(260, Math.max(92, label.length * 8.6 + 24));
  const group = createSvgElement('g', {
    class: `story-path-label story-path-label--${state}`,
    transform: `translate(${point.x} ${point.y - 18})`
  });
  group.appendChild(createSvgElement('rect', {
    x: -width / 2,
    y: -13,
    width,
    height: 22,
    rx: 3
  }));
  const text = createSvgElement('text', {
    x: 0,
    y: 2,
    'text-anchor': 'middle'
  });
  text.textContent = label;
  group.appendChild(text);
  svg.appendChild(group);
}

function renderSelectedNodeBrackets(group) {
  [
    'M -37 -22 L -37 -37 L -22 -37',
    'M 22 -37 L 37 -37 L 37 -22',
    'M 37 22 L 37 37 L 22 37',
    'M -22 37 L -37 37 L -37 22'
  ].forEach(d => {
    group.appendChild(createSvgElement('path', {
      class: 'story-node__bracket',
      d
    }));
  });
}

function renderBrokenPathMark(svg, points) {
  const point = getPolylinePointAtRatio(points, 0.55);
  const group = createSvgElement('g', {
    class: 'story-broken-mark',
    transform: `translate(${point.x} ${point.y})`
  });
  group.appendChild(createSvgElement('rect', {
    x: -13,
    y: -13,
    width: 26,
    height: 26,
    rx: 2
  }));
  group.appendChild(createSvgElement('line', {
    x1: -7,
    y1: -7,
    x2: 7,
    y2: 7
  }));
  group.appendChild(createSvgElement('line', {
    x1: 7,
    y1: -7,
    x2: -7,
    y2: 7
  }));
  svg.appendChild(group);
}

function getStoryPathPoints(path, nodesById) {
  if (Array.isArray(path.points) && path.points.length >= 2) return path.points;
  const from = nodesById.get(path.from);
  const to = nodesById.get(path.to);
  if (!from || !to) return [];

  const start = { x: from.x, y: from.y };
  const end = { x: to.x, y: to.y };
  const midX = Math.round((start.x + end.x) / 2);
  const midY = Math.round((start.y + end.y) / 2);

  if (Math.abs(start.x - end.x) > Math.abs(start.y - end.y)) {
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function buildSvgPathData(points) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function getPolylinePointAtRatio(points, ratio) {
  const segments = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segments.push({ start, end, length });
    total += length;
  }
  let distance = total * clampStoryNumber(ratio, 0, 1);
  for (const segment of segments) {
    if (distance <= segment.length || segment === segments[segments.length - 1]) {
      const t = segment.length > 0 ? distance / segment.length : 0;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t
      };
    }
    distance -= segment.length;
  }
  return points[0] || { x: 0, y: 0 };
}

function createSvgElement(tagName, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      element.setAttribute(key, String(value));
    }
  });
  return element;
}

function clampStoryNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function handleKeydown(event) {
  if (playbackActive && isPlaybackSkipKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    finishStoryPlayback(true);
    return;
  }
  if (archiveActive) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeStoryArchive();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      moveArchive(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      moveArchive(1);
      return;
    }
  }
  if (event.key === 'Escape' && overlayEl?.dataset.open === 'true') {
    closeStoryModal();
  }
}

function isPlaybackSkipKey(event) {
  return event.key === 'Escape'
    || event.key === 'Enter'
    || event.key === ' '
    || event.key === 'Spacebar';
}

function getClearedCount() {
  try {
    const result = getClearedLevelsRef?.();
    if (Array.isArray(result)) {
      return new Set(result).size;
    }
    if (result && typeof result.size === 'number') {
      return result.size;
    }
    const asNumber = Number(result);
    return Number.isFinite(asNumber) ? asNumber : 0;
  } catch (err) {
    console.warn('Failed to read cleared count', err);
    return 0;
  }
}

function renderFragments() {
  if (!containerEl) return;
  if (!fragments.length) {
    if (isLoading) {
      return;
    }
    renderStatus('표시할 스토리가 없습니다.');
    setNextButtonState({ mode: 'locked' });
    if (continueBtn) {
      continueBtn.disabled = true;
    }
    return;
  }

  unlockedFragmentCount = Math.min(getClearedCount(), fragments.length);
  if (unlockedFragmentCount === 0) {
    currentFragmentIndex = 0;
  } else if (currentFragmentIndex >= unlockedFragmentCount) {
    currentFragmentIndex = unlockedFragmentCount - 1;
  }

  renderActiveFragment();
}

function renderActiveFragment() {
  if (!fragments.length || !containerEl) return;
  const fragment = fragments[currentFragmentIndex] || fragments[0];
  const unlocked = currentFragmentIndex < unlockedFragmentCount;

  containerEl.innerHTML = '';
  containerEl.appendChild(createFragmentElement(fragment, unlocked));
  updateProgress(unlockedFragmentCount, fragment);
  updateNavigationState();
}

function createFragmentElement(fragment, unlocked) {
  const wrapper = document.createElement('article');
  wrapper.className = 'story-fragment';
  if (!unlocked) {
    wrapper.classList.add('story-fragment--locked');
  }

  const title = document.createElement('h3');
  title.className = 'story-fragment__title';
  title.textContent = `Fragment ${fragment.id} - ${fragment.title}`;
  wrapper.appendChild(title);

  if (unlocked) {
    const body = document.createElement('div');
    body.className = 'story-fragment__body';
    (fragment.body || []).forEach((text, idx) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      paragraph.style.setProperty('--story-line-delay', `${80 + idx * 80}ms`);
      body.appendChild(paragraph);
    });
    wrapper.appendChild(body);
  } else {
    const lockedHint = document.createElement('p');
    lockedHint.className = 'story-fragment__locked-hint';
    lockedHint.textContent = `${fragment.id}개 스테이지를 클리어하면 해금됩니다.`;
    wrapper.appendChild(lockedHint);
  }

  return wrapper;
}

function updateProgress(unlockedCount, activeFragment) {
  const total = fragments.length || 1;
  if (progressLabelEl) {
    progressLabelEl.textContent = `Neural Fragment ${unlockedCount} / ${fragments.length}`;
  }
  if (progressBarEl) {
    progressBarEl.max = total;
    progressBarEl.value = unlockedCount;
    progressBarEl.setAttribute('aria-valuemin', '0');
    progressBarEl.setAttribute('aria-valuemax', String(total));
    progressBarEl.setAttribute('aria-valuenow', String(unlockedCount));
    progressBarEl.setAttribute('aria-valuetext', `해금된 스토리 ${unlockedCount}개`);
  }
  if (titleEl) {
    titleEl.textContent = activeFragment?.title || '기억을 복구하세요';
  }
  if (subtitleEl) {
    if (activeFragment && Array.isArray(activeFragment.body) && activeFragment.body.length) {
      subtitleEl.textContent = activeFragment.body[0];
    } else {
      subtitleEl.textContent = '스테이지를 클리어해 기억의 조각을 되찾으세요.';
    }
  }
}

function renderStatus(message) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  const status = document.createElement('p');
  status.className = 'story-fragments__status';
  status.textContent = message;
  containerEl.appendChild(status);
  if (progressBarEl) {
    progressBarEl.value = 0;
    progressBarEl.setAttribute('aria-valuenow', '0');
    progressBarEl.setAttribute('aria-valuetext', '해금된 스토리 0개');
  }
  if (progressLabelEl) {
    progressLabelEl.textContent = 'Neural Fragment 0 / 27';
  }
  if (continueBtn) {
    continueBtn.disabled = true;
  }
}

function setBusyState(isBusy) {
  if (!containerEl) return;
  containerEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
}

function handleContinueClick() {
  if (nextButtonMode === 'locked') {
    return;
  }
  if (nextButtonMode === 'close') {
    closeStoryModal();
    return;
  }
  if (currentFragmentIndex < unlockedFragmentCount - 1) {
    currentFragmentIndex += 1;
    renderActiveFragment();
  } else {
    closeStoryModal();
  }
}

function handleBackClick() {
  if (!backBtn || backBtn.disabled) return;
  if (currentFragmentIndex > 0) {
    currentFragmentIndex -= 1;
    renderActiveFragment();
  }
}

function updateNavigationState() {
  if (!continueBtn) return;
  if (backBtn) {
    backBtn.disabled = currentFragmentIndex <= 0 || unlockedFragmentCount <= 0;
  }
  if (unlockedFragmentCount <= 0) {
    setNextButtonState({ mode: 'locked', label: 'Next' });
    continueBtn.disabled = true;
    return;
  }
  if (currentFragmentIndex < unlockedFragmentCount - 1) {
    setNextButtonState({ mode: 'next', label: 'Next' });
    continueBtn.disabled = false;
  } else {
    setNextButtonState({ mode: 'close', label: 'Close' });
    continueBtn.disabled = false;
  }
}

function setNextButtonState({ mode, label }) {
  if (!continueBtn) return;
  nextButtonMode = mode;
  if (label) {
    continueBtn.textContent = label;
  }
}
