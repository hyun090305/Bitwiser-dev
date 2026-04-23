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
      { until: 3, label: 'UNIDENTIFIED SIGNAL', detail: '정체 불명' },
      { until: 8, label: 'SIGNAL TRACE', detail: '연결 흔적' },
      { until: 27, label: 'NEURAL INPUT', detail: '외부 신호' }
    ]
  },
  {
    id: 'core',
    x: 390,
    y: 250,
    revealAt: 2,
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
    revealAt: 4,
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
    revealAt: 8,
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
    revealAt: 9,
    activeAt: 23,
    labels: [
      { until: 13, label: 'EXTERNAL TRACE', detail: '현실 신호' },
      { until: 22, label: 'REALITY ?', detail: '외부 세계' },
      { until: 27, label: 'REALITY LINK', detail: '현실 연결' }
    ]
  },
  {
    id: 'protocol',
    x: 390,
    y: 420,
    revealAt: 15,
    activeAt: 22,
    labels: [
      { until: 21, label: 'PROTOCOL ?', detail: '복구 절차' },
      { until: 27, label: 'CONTEXT C-04', detail: '맥락 영역' }
    ]
  },
  {
    id: 'logic',
    x: 560,
    y: 90,
    revealAt: 15,
    activeAt: 18,
    labels: [
      { until: 17, label: 'SCHEMA TRACE', detail: '설계 흔적' },
      { until: 27, label: 'LOGIC L-02', detail: '판단 영역' }
    ]
  },
  {
    id: 'temporal',
    x: 220,
    y: 90,
    revealAt: 17,
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
    id: 'signal-core',
    from: 'signal',
    to: 'core',
    revealAt: 2,
    activeAt: 5,
    labels: {
      restoring: 'SIGNAL DETECTED',
      active: 'FIRST ROUTE STABLE'
    }
  },
  {
    id: 'core-memory',
    from: 'core',
    to: 'memory',
    revealAt: 4,
    activeAt: 15,
    brokenUntil: 6,
    labels: {
      broken: 'BROKEN MEMORY LINK',
      restoring: 'MEMORY ROUTE RESTORING',
      active: 'MEMORY ACCESS RESTORED'
    }
  },
  {
    id: 'core-perception',
    from: 'core',
    to: 'perception',
    revealAt: 8,
    activeAt: 19,
    labels: {
      restoring: 'SENSORY ROUTE',
      active: 'SENSORY FEEDBACK STABLE'
    }
  },
  {
    id: 'signal-reality',
    from: 'signal',
    to: 'reality',
    revealAt: 9,
    activeAt: 23,
    labels: {
      restoring: 'EXTERNAL TRACE',
      active: 'REALITY LINK STABLE'
    }
  },
  {
    id: 'core-protocol',
    from: 'core',
    to: 'protocol',
    revealAt: 15,
    activeAt: 22,
    labels: {
      restoring: 'RECOVERY PROTOCOL',
      active: 'CONTEXT ROUTE STABLE'
    }
  },
  {
    id: 'protocol-logic',
    from: 'protocol',
    to: 'logic',
    revealAt: 15,
    activeAt: 18,
    labels: {
      restoring: 'SCHEMA TRACE',
      active: 'LOGIC STABLE'
    }
  },
  {
    id: 'core-temporal',
    from: 'core',
    to: 'temporal',
    revealAt: 17,
    activeAt: 26,
    brokenFrom: 18,
    brokenUntil: 20,
    labels: {
      broken: 'SIGNAL DECAY',
      restoring: 'TEMPORAL ROUTE',
      active: 'EXIT WINDOW READY'
    }
  },
  {
    id: 'memory-perception',
    from: 'memory',
    to: 'perception',
    revealAt: 19,
    activeAt: 25,
    labels: {
      restoring: 'SENSORY DATA TO MEMORY',
      active: 'SENSORY MEMORY BRIDGE'
    }
  },
  {
    id: 'protocol-memory',
    from: 'protocol',
    to: 'memory',
    revealAt: 24,
    activeAt: 27,
    labels: {
      restoring: 'FINAL BRIDGE',
      active: 'RETURN ROUTE COMPLETE'
    }
  }
];

const STORY_CHANGE_LABELS = {
  1: 'UNIDENTIFIED SIGNAL',
  2: '2D PLANE RESPONSE',
  3: 'NO-CROSSING CONSTRAINT',
  4: 'CIRCUIT TRACE',
  5: 'FIRST MEMORY PULSE',
  6: 'BROKEN ROUTE CONFIRMED',
  7: 'PATTERN RECOGNITION',
  8: 'SENSORY TRACE',
  9: 'EXTERNAL VOICE TRACE',
  10: 'INTERFACE EQUIPMENT',
  11: 'VOLUNTARY ENTRY LOG',
  12: 'SAFE MODE STRUCTURE',
  13: 'REALITY BRIDGE DAMAGE',
  14: 'NEURAL BRIDGE ROLE',
  15: 'RECOVERY PROTOCOL',
  16: 'RISK WARNING',
  17: 'FLATTENED FALL RECORD',
  18: 'SIGNAL DECAY',
  19: 'SENSORY ROUTE STRENGTHENED',
  20: '2D WORLD INSTABILITY',
  21: 'DUAL-LAYER LINK',
  22: 'RESPONSIBILITY TRACE',
  23: 'BIO-SIGNAL STABLE',
  24: 'FUTURE PROCEDURE',
  25: 'FINAL BRIDGES',
  26: 'EXIT BOUNDARY',
  27: 'RETURN SEQUENCE'
};

const STORY_FOCUS_NODE_BY_SEQUENCE = {
  1: 'signal',
  2: 'signal',
  3: 'signal',
  4: 'core',
  5: 'memory',
  6: 'memory',
  7: 'core',
  8: 'perception',
  9: 'reality',
  10: 'reality',
  11: 'reality',
  12: 'core',
  13: 'memory',
  14: 'memory',
  15: 'protocol',
  16: 'logic',
  17: 'temporal',
  18: 'temporal',
  19: 'perception',
  20: 'temporal',
  21: 'reality',
  22: 'protocol',
  23: 'reality',
  24: 'protocol',
  25: 'perception',
  26: 'temporal',
  27: 'core'
};

const STORY_FOCUS_PATH_BY_SEQUENCE = {
  2: 'signal-core',
  3: 'signal-core',
  4: 'core-memory',
  5: 'core-memory',
  6: 'core-memory',
  7: 'core-memory',
  8: 'core-perception',
  9: 'signal-reality',
  10: 'signal-reality',
  11: 'signal-reality',
  12: 'core-memory',
  13: 'core-memory',
  14: 'core-memory',
  15: 'core-protocol',
  16: 'protocol-logic',
  17: 'core-temporal',
  18: 'core-temporal',
  19: 'memory-perception',
  20: 'core-temporal',
  21: 'signal-reality',
  22: 'core-protocol',
  23: 'signal-reality',
  24: 'protocol-memory',
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
    routeLabel: `SYSTEM REVEAL ${String(sequence).padStart(2, '0')} / ${fragments.length || 27}`,
    operation: getProgressiveOperation(sequence),
    diagramNote: getProgressiveDiagramNote(sequence),
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
    phases: ['LOCKED', 'WAITING FOR CLEAR', 'NO ACTIVE ROUTE'],
    focusMetric: 'recovery',
    changeLabel: 'NO ACTIVE TRACE',
    metrics: [
      createMetric('signal', 'SIGNAL DETECTED', 0, 'critical', 'S')
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
  if (sequence <= 3) return '식별되지 않은 신호 하나만 감지됩니다. 아직 시스템 구조는 드러나지 않았습니다.';
  if (sequence <= 8) return '신호 주변에 연결 흔적이 생기며, 하나의 구조가 숨어 있음을 암시합니다.';
  if (sequence <= 14) return '흩어진 흔적들이 CORE와 MEMORY를 중심으로 한 동일 시스템 일부였음이 드러납니다.';
  if (sequence <= 18) return '복구 프로토콜이 열리며 CORE에서 주변 기능으로 연결을 재구성합니다.';
  if (sequence <= 22) return '현실 감각과 기억 경로가 굵어지고, 안전 모드의 붕괴 지점도 함께 보입니다.';
  if (sequence <= 26) return '주요 연결이 안정화되며, 귀환을 위한 마지막 다리들이 같은 맵 위에 추가됩니다.';
  return '모든 주요 경로가 하나의 복구 네트워크로 이어지고, 안전 모드 종료 조건이 충족됩니다.';
}

function getProgressiveDiagramNote(sequence) {
  if (sequence <= 3) return '처음에는 노드 이름도, 지도도 없습니다. 작은 반응 하나가 이후 시스템의 출발점입니다.';
  if (sequence <= 8) return '새로 드러난 점과 선만 강조됩니다. 이전에 보인 신호는 사라지지 않고 같은 위치에 남습니다.';
  if (sequence <= 14) return '이제 CORE와 MEMORY 후보가 같은 좌표계 안에서 식별됩니다. 붉은 X는 아직 끊긴 연결입니다.';
  if (sequence <= 18) return '프로토콜, 판단, 시간 신호가 추가되지만 아직 전체 맵은 완전히 안정되지 않았습니다.';
  if (sequence <= 22) return '노란 경로는 복구 중인 구간, 청록 경로는 이전 fragment에서 안정화된 연결입니다.';
  if (sequence <= 26) return '후반부에는 숨겨져 있던 기능 블록 대부분이 드러나며, 마지막 연결만 남습니다.';
  return '이 화면은 새 다이어그램이 아니라 처음의 신호가 끝까지 확장된 동일 시스템입니다.';
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
      createMetric('signal', 'SIGNAL DETECTED', Math.round(8 + sequence * 7), 'updated', 'S')
    ];
  }

  const integrity = Math.round(clampStoryNumber(18 + progress * 78, 0, 100));
  const stability = Math.round(clampStoryNumber(26 + progress * 66 - (sequence === 18 ? 16 : 0), 0, 100));
  const corruption = Math.round(clampStoryNumber(82 - progress * 76 + (sequence === 18 ? 10 : 0), 0, 100));
  const recovery = Math.round(clampStoryNumber(progress * 100, 0, 100));

  if (sequence <= 8) {
    return [
      createMetric('trace', 'TRACE CLARITY', Math.round(16 + progress * 58), 'updated', 'T'),
      createMetric('recovery', 'RECOVERY PROGRESS', recovery, 'warning', 'R')
    ];
  }

  if (sequence <= 14) {
    return [
      createMetric('stability', 'SIGNAL STABILITY', stability, getPositiveMetricState(stability), 'S'),
      createMetric('corruption', 'CORRUPTION LEVEL', corruption, getCorruptionMetricState(corruption), 'X'),
      createMetric('recovery', 'RECOVERY PROGRESS', recovery, 'updated', 'R')
    ];
  }

  return [
    createMetric('integrity', 'SYSTEM INTEGRITY', integrity, getPositiveMetricState(integrity), 'I'),
    createMetric('stability', 'SIGNAL STABILITY', stability, getPositiveMetricState(stability), 'S'),
    createMetric('corruption', 'CORRUPTION LEVEL', corruption, getCorruptionMetricState(corruption), 'X'),
    createMetric('recovery', 'RECOVERY PROGRESS', recovery, recovery >= 90 ? 'normal' : 'updated', 'R')
  ];
}

function buildProgressiveNodes(sequence) {
  const focusNodeId = STORY_FOCUS_NODE_BY_SEQUENCE[sequence] || null;
  return PROGRESSIVE_SYSTEM_NODES
    .filter(node => sequence >= node.revealAt)
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
    .filter(path => sequence >= path.revealAt)
    .map(path => {
      const state = getProgressivePathState(path, sequence);
      const highlighted = path.id === focusPathId || sequence === path.revealAt || sequence === path.activeAt;
      return {
        from: path.from,
        to: path.to,
        state,
        warning: state === 'broken',
        pulse: state !== 'broken',
        pulseDuration: highlighted ? '1.35s' : '1.9s',
        label: getProgressivePathLabel(path, state, highlighted),
        highlighted
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
  if (path.brokenUntil && sequence <= path.brokenUntil) return 'broken';
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
  mode.textContent = 'CURRENT OPERATION';

  const operation = document.createElement('strong');
  operation.className = 'story-system__operation';
  operation.textContent = scene.operation;

  const route = document.createElement('span');
  route.className = 'story-system__route';
  route.textContent = scene.routeLabel;

  const change = document.createElement('span');
  change.className = 'story-system__change';
  change.textContent = `NEWLY REVEALED: ${scene.changeLabel}`;

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
  const width = Math.min(220, Math.max(88, label.length * 7.2 + 22));
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
