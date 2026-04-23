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

const STORY_SCENE_TYPE_GROUPS = {
  boot: new Set([
    'void-consciousness',
    'flat-plane',
    'collision-lines',
    'circuit-shadow'
  ]),
  diagnostics: new Set([
    'voice-wave',
    'equipment-hud',
    'choice-log',
    'safe-mode',
    'warning-signal',
    'flatten-fall',
    'grid-collapse',
    'stable-wave'
  ]),
  pathway: new Set([
    'first-link',
    'constrained-path',
    'sensory-ripple',
    'broken-wire',
    'world-bridge',
    'signal-decay',
    'thickening-link',
    'dual-layer',
    'chosen-path',
    'final-connection'
  ]),
  reconstruction: new Set([
    'blueprint',
    'protocol-blueprint',
    'network-growth',
    'near-complete-circuit',
    'return-sequence'
  ])
};

function createStorySceneState(fragment, options = {}) {
  if (options.locked) {
    return createLockedSceneState();
  }

  const type = normalizeVisualType(options.type || fragment?.visual?.type);
  const sequence = getFragmentSequence(fragment);
  const progress = getFragmentProgress(sequence);
  const family = getStorySceneFamily(type, sequence);
  const base = {
    family,
    type,
    title: getStorySceneTitle(family, type, fragment),
    mode: getStorySceneMode(family, type),
    routeLabel: getStoryRouteLabel(family, type, sequence),
    operation: getStoryOperation(family, type, sequence),
    diagramNote: getStoryDiagramNote(family, type),
    phases: getStoryScenePhases(family, type),
    focusMetric: 'recovery',
    metrics: buildStoryMetrics(progress, family, type),
    nodes: [],
    paths: []
  };

  if (family === 'boot') return buildBootScene(base, sequence, type);
  if (family === 'diagnostics') return buildDiagnosticsScene(base, sequence, type, progress);
  if (family === 'reconstruction') return buildReconstructionScene(base, sequence, type, progress);
  return buildPathwayScene(base, sequence, type, progress);
}

function createLockedSceneState() {
  return {
    family: 'boot',
    type: 'locked',
    title: 'Recovery Locked',
    mode: 'SAFE MODE / AWAITING CLEAR',
    routeLabel: 'NO RESTORED FRAGMENT',
    operation: '복구된 기억 조각이 없습니다.',
    diagramNote: '스테이지를 클리어하면 첫 번째 기록과 복구 경로가 표시됩니다.',
    phases: ['LOCKED', 'WAITING FOR CLEAR', 'NO ACTIVE ROUTE'],
    focusMetric: 'recovery',
    metrics: [
      createMetric('integrity', 'SYSTEM INTEGRITY', 0, 'critical', 'I'),
      createMetric('stability', 'SIGNAL STABILITY', 0, 'critical', 'S'),
      createMetric('corruption', 'CORRUPTION LEVEL', 100, 'critical', 'X'),
      createMetric('recovery', 'RECOVERY PROGRESS', 0, 'warning', 'R')
    ],
    nodes: [
      { id: 'core', label: 'CORE N-0', detail: '자아의 중심', state: 'inactive', x: 320, y: 250 },
      { id: 'memory', label: 'MEMORY M-01', detail: '기억 영역', state: 'corrupted', x: 560, y: 250 }
    ],
    paths: [
      { from: 'core', to: 'memory', state: 'broken', warning: true, label: 'LOCKED LINK' }
    ]
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

function getStorySceneFamily(type, sequence) {
  if (STORY_SCENE_TYPE_GROUPS.boot.has(type) || sequence <= 3) return 'boot';
  if (STORY_SCENE_TYPE_GROUPS.diagnostics.has(type)) return 'diagnostics';
  if (STORY_SCENE_TYPE_GROUPS.reconstruction.has(type)) return 'reconstruction';
  return 'pathway';
}

function getStorySceneTitle(family, type, fragment) {
  if (type === 'return-sequence') return 'Recovery Complete';
  if (family === 'boot') return 'Boot / Error Entry';
  if (family === 'diagnostics') return 'Diagnostics Overview';
  if (family === 'reconstruction') return 'Neural Reconstruction';
  if (type === 'broken-wire' || type === 'signal-decay') return 'Link Recovery';
  return 'Signal Pathway';
}

function getStorySceneMode(family, type) {
  if (type === 'return-sequence') return 'RECOVERY MODE / EXIT READY';
  if (type === 'warning-signal' || type === 'signal-decay') return 'SAFE MODE / DEGRADED LINK';
  if (family === 'boot') return 'SAFE MODE / BOOT DIAGNOSTIC';
  if (family === 'reconstruction') return 'SAFE MODE / RECONSTRUCTION';
  return 'SAFE MODE / ROUTE ANALYSIS';
}

function getStoryRouteLabel(family, type, sequence) {
  if (family === 'boot') return 'PRIMARY ROUTES OFFLINE';
  if (family === 'diagnostics') return `DIAGNOSTIC SWEEP ${String(sequence).padStart(2, '0')}`;
  if (family === 'reconstruction') return 'CORE TO FUNCTION BLOCKS';
  return 'SOURCE: CORE N-0 / DEST: MEMORY M-01';
}

function getStoryOperation(family, type, sequence) {
  if (type === 'return-sequence') return '복구된 연결을 통해 안전 모드 종료를 준비 중입니다.';
  if (type === 'signal-decay') return '현실 신호가 약해지는 구간을 우회 복구 중입니다.';
  if (type === 'broken-wire') return '끊어진 신경 브리지를 찾아 기억 영역으로 다시 잇는 중입니다.';
  if (type === 'stable-wave') return '현실의 생체 신호가 안정권으로 돌아오는지 확인 중입니다.';
  if (family === 'boot') return '안전 모드에서 의식 핵심과 기억 경로의 손상 여부를 확인 중입니다.';
  if (family === 'diagnostics') return '현재 손상 상태를 진단하고 복구해야 할 경로를 표시합니다.';
  if (family === 'reconstruction') return '자아의 중심에서 기억, 감각, 맥락 기능으로 연결을 재구성 중입니다.';
  if (sequence >= 19) return '현실 감각 신호를 기억 영역으로 되돌리는 경로를 강화 중입니다.';
  if (sequence >= 13) return '현실과 2D 안전 모드를 잇는 신경 브리지를 복구 중입니다.';
  return '완성한 회로를 통해 첫 번째 기억 신호를 전달하는 중입니다.';
}

function getStoryDiagramNote(family, type) {
  if (type === 'return-sequence') return '모든 주요 경로가 연결되면 2D 안전 모드는 종료 가능한 상태가 됩니다.';
  if (type === 'signal-decay') return '붉은 표식은 신호가 사라지는 지점, 노란 경로는 복구 중인 우회로입니다.';
  if (type === 'broken-wire') return '끊긴 구간을 복구해야 기억과 현실 감각이 다시 도달합니다.';
  if (family === 'boot') return '흐린 노드는 아직 접근할 수 없는 기능, X 표식은 손상된 연결입니다.';
  if (family === 'diagnostics') return '진단 결과는 어느 기능이 아직 손상되었는지와 무엇을 먼저 복구할지 보여줍니다.';
  if (family === 'reconstruction') return '중앙 CORE에서 주변 기능 블록으로 연결이 복구될수록 자아가 현실에 가까워집니다.';
  return '강조된 경로가 이번 장면의 핵심 사건입니다. 노란 점선은 복구 중, 청록 실선은 안정 연결입니다.';
}

function getStoryScenePhases(family, type) {
  if (type === 'return-sequence') return ['BEFORE: fragmented', 'NOW: stable bridge', 'AFTER: exit ready'];
  if (type === 'signal-decay') return ['BEFORE: signal loss', 'NOW: rerouting', 'AFTER: stabilize'];
  if (family === 'boot') return ['BEFORE: unknown', 'NOW: safe mode', 'AFTER: route scan'];
  if (family === 'diagnostics') return ['BEFORE: damaged', 'NOW: diagnose', 'AFTER: choose route'];
  if (family === 'reconstruction') return ['BEFORE: isolated core', 'NOW: reconnecting', 'AFTER: restored self'];
  return ['BEFORE: broken link', 'NOW: reconstruction', 'AFTER: partial access'];
}

function buildStoryMetrics(progress, family, type) {
  let integrity = 24 + progress * 72;
  let stability = 30 + progress * 60;
  let corruption = 78 - progress * 72;
  let recovery = progress * 96;

  if (family === 'boot') {
    integrity -= 12;
    stability -= 8;
    corruption += 14;
    recovery *= 0.55;
  }
  if (type === 'warning-signal' || type === 'signal-decay') {
    stability -= 18;
    corruption += 12;
  }
  if (type === 'stable-wave') {
    stability += 14;
    corruption -= 12;
  }
  if (type === 'return-sequence') {
    integrity = 96;
    stability = 94;
    corruption = 3;
    recovery = 100;
  }

  integrity = Math.round(clampStoryNumber(integrity, 0, 100));
  stability = Math.round(clampStoryNumber(stability, 0, 100));
  corruption = Math.round(clampStoryNumber(corruption, 0, 100));
  recovery = Math.round(clampStoryNumber(recovery, 0, 100));

  return [
    createMetric('integrity', 'SYSTEM INTEGRITY', integrity, getPositiveMetricState(integrity), 'I'),
    createMetric('stability', 'SIGNAL STABILITY', stability, getPositiveMetricState(stability), 'S'),
    createMetric('corruption', 'CORRUPTION LEVEL', corruption, getCorruptionMetricState(corruption), 'X'),
    createMetric('recovery', 'RECOVERY PROGRESS', recovery, recovery >= 90 ? 'normal' : 'updated', 'R')
  ];
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

function buildBootScene(base, sequence, type) {
  const coreState = sequence <= 1 ? 'selected' : 'restoring';
  const memoryState = sequence >= 4 ? 'restoring' : 'corrupted';
  return {
    ...base,
    nodes: [
      { id: 'sensor', label: 'SIGNAL INPUT', detail: '외부 신호', state: 'inactive', x: 180, y: 250 },
      { id: 'core', label: 'CORE N-0', detail: '자아의 중심', state: coreState, x: 400, y: 250 },
      { id: 'memory', label: 'MEMORY M-01', detail: '기억 영역', state: memoryState, x: 620, y: 250 }
    ],
    paths: [
      { from: 'sensor', to: 'core', state: sequence >= 2 ? 'restoring' : 'inactive', pulse: sequence >= 2, label: sequence >= 2 ? 'SAFE MODE SIGNAL' : '' },
      { from: 'core', to: 'memory', state: 'broken', warning: true, label: 'BROKEN MEMORY LINK' }
    ]
  };
}

function buildDiagnosticsScene(base, sequence, type, progress) {
  const warning = type === 'warning-signal' || type === 'signal-decay';
  const stable = type === 'stable-wave';
  const memoryState = stable ? 'active' : (warning ? 'corrupted' : 'restoring');
  const contextState = progress > 0.75 ? 'active' : 'restoring';
  return {
    ...base,
    nodes: [
      { id: 'core', label: 'CORE N-0', detail: '자아의 중심', state: warning ? 'selected' : 'active', x: 230, y: 250 },
      { id: 'memory', label: 'MEMORY M-01', detail: '기억 접근', state: memoryState, x: 555, y: 160 },
      { id: 'context', label: 'CONTEXT C-04', detail: '상황 맥락', state: contextState, x: 555, y: 340 },
      { id: 'temporal', label: 'TEMP T-03', detail: '시간 감각', state: warning ? 'corrupted' : 'inactive', x: 385, y: 430 }
    ],
    paths: [
      { from: 'core', to: 'memory', state: memoryState === 'corrupted' ? 'broken' : 'restoring', warning: memoryState === 'corrupted', pulse: memoryState !== 'corrupted', label: memoryState === 'corrupted' ? 'SIGNAL LOSS DETECTED' : 'UNDER RECONSTRUCTION' },
      { from: 'core', to: 'context', state: contextState === 'active' ? 'active' : 'restoring', pulse: true, label: contextState === 'active' ? 'CONTEXT STABLE' : 'CONTEXT RESTORING' },
      { from: 'core', to: 'temporal', state: warning ? 'broken' : 'inactive', warning, label: warning ? 'UNSTABLE ROUTE' : '' }
    ]
  };
}

function buildPathwayScene(base, sequence, type, progress) {
  const decaying = type === 'signal-decay';
  const broken = type === 'broken-wire' || type === 'final-connection' || decaying;
  const restored = type === 'world-bridge' || type === 'thickening-link' || type === 'final-connection';
  const destinationState = restored && !decaying ? 'active' : 'restoring';
  const relayState = broken && !restored ? 'corrupted' : 'restoring';
  const routeDetail = sequence >= 19 ? '현실 감각 경로' : '신경 브리지';
  return {
    ...base,
    nodes: [
      { id: 'source', label: 'CORE N-0', detail: '자아의 중심', state: 'active', x: 165, y: 250 },
      { id: 'route', label: 'ROUTE R-12', detail: routeDetail, state: relayState, x: 400, y: 250 },
      { id: 'memory', label: 'MEMORY M-01', detail: '기억 영역', state: destinationState, x: 635, y: 250 }
    ],
    paths: [
      { from: 'source', to: 'route', state: restored ? 'active' : 'restoring', pulse: true, pulseDuration: '1.7s', label: restored ? 'SIGNAL FLOW STABLE' : 'UNDER RECONSTRUCTION' },
      { from: 'route', to: 'memory', state: decaying ? 'broken' : (restored ? 'active' : 'restoring'), warning: decaying, pulse: !decaying, pulseDuration: restored ? '1.4s' : '2s', label: decaying ? 'SIGNAL LOSS DETECTED' : (restored ? 'PARTIAL ACCESS RESTORED' : 'MEMORY ACCESS PARTIAL') }
    ]
  };
}

function buildReconstructionScene(base, sequence, type, progress) {
  const complete = type === 'return-sequence';
  const nearComplete = type === 'near-complete-circuit' || complete;
  const memoryState = progress > 0.55 ? 'active' : 'restoring';
  const temporalState = nearComplete ? 'active' : 'restoring';
  return {
    ...base,
    nodes: [
      { id: 'core', label: 'CORE N-0', detail: '자아의 중심', state: complete ? 'selected' : 'active', x: 400, y: 250 },
      { id: 'memory', label: 'MEMORY', detail: '기억', state: memoryState, x: 400, y: 82 },
      { id: 'logic', label: 'LOGIC', detail: '판단', state: 'active', x: 635, y: 205 },
      { id: 'context', label: 'CONTEXT', detail: '맥락', state: nearComplete ? 'active' : 'restoring', x: 590, y: 395 },
      { id: 'temporal', label: 'TEMPORAL', detail: '시간', state: temporalState, x: 280, y: 410 },
      { id: 'perception', label: 'PERCEPTION', detail: '감각', state: 'restoring', x: 160, y: 205 }
    ],
    paths: [
      { from: 'core', to: 'memory', state: memoryState === 'active' ? 'active' : 'restoring', pulse: true, label: memoryState === 'active' ? 'MEMORY STABLE' : 'MEMORY RESTORING' },
      { from: 'core', to: 'logic', state: 'active', pulse: true, pulseDuration: '1.5s', label: 'LOGIC STABLE' },
      { from: 'core', to: 'context', state: nearComplete ? 'active' : 'restoring', pulse: true, label: nearComplete ? 'CONTEXT STABLE' : 'CONTEXT RESTORING' },
      { from: 'core', to: 'temporal', state: temporalState === 'active' ? 'active' : 'restoring', pulse: true, label: temporalState === 'active' ? 'TIME STABLE' : '' },
      { from: 'core', to: 'perception', state: 'restoring', pulse: true, label: 'SENSORY ROUTE' }
    ]
  };
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

  briefing.append(mode, operation, route, note, phases);
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
  if (playbackMetricsEl) playbackMetricsEl.innerHTML = '';
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
    class: `story-path story-path--${state}`,
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
    class: `story-node story-node--${node.state || 'inactive'}`,
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

  if (node.state === 'selected') {
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
