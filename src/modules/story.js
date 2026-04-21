const STORY_SOURCE = 'storyFragments.json';

const PLAYBACK_TIMING = {
  visualDelayMs: 350,
  lineIntervalMs: 1000,
  holdAfterLastLineMs: 1200,
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
  const source = Array.isArray(fragment?.lines) && fragment.lines.length
    ? fragment.lines
    : (Array.isArray(fragment?.body) ? fragment.body.slice(0, 3) : []);
  return source
    .map(line => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function renderPlaybackLine(text) {
  if (!playbackTextEl) return;
  const line = document.createElement('p');
  line.className = 'story-playback__line';
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
    playbackVisualEl.innerHTML = '';
    playbackVisualEl.dataset.visualType = 'flat-plane';
    const visual = document.createElement('div');
    visual.className = 'story-visual story-visual--flat-plane';
    visual.setAttribute('aria-hidden', 'true');
    buildFlatPlaneVisual(visual);
    playbackVisualEl.appendChild(visual);
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
  line.className = 'story-playback__line is-visible';
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

function renderPlaybackVisual(fragment) {
  if (!playbackVisualEl) return;
  const type = normalizeVisualType(fragment?.visual?.type);
  playbackVisualEl.innerHTML = '';
  playbackVisualEl.dataset.visualType = type;

  const visual = document.createElement('div');
  visual.className = `story-visual story-visual--${type}`;
  visual.setAttribute('aria-hidden', 'true');

  const builders = {
    'void-consciousness': buildVoidConsciousnessVisual,
    'flat-plane': buildFlatPlaneVisual,
    'collision-lines': buildCollisionLinesVisual,
    'circuit-shadow': buildCircuitShadowVisual,
    'first-link': buildFirstLinkVisual,
    'constrained-path': buildConstrainedPathVisual,
    blueprint: buildBlueprintVisual,
    'sensory-ripple': buildSensoryRippleVisual,
    'voice-wave': buildVoiceWaveVisual,
    'equipment-hud': buildEquipmentHudVisual,
    'choice-log': buildChoiceLogVisual,
    'safe-mode': buildSafeModeVisual,
    'broken-wire': buildBrokenWireVisual,
    'world-bridge': buildWorldBridgeVisual,
    'protocol-blueprint': buildProtocolBlueprintVisual,
    'warning-signal': buildWarningSignalVisual,
    'flatten-fall': buildFlattenFallVisual,
    'signal-decay': buildSignalDecayVisual,
    'thickening-link': buildThickeningLinkVisual,
    'grid-collapse': buildGridCollapseVisual,
    'dual-layer': buildDualLayerVisual,
    'chosen-path': buildChosenPathVisual,
    'stable-wave': buildStableWaveVisual,
    'network-growth': buildNetworkGrowthVisual,
    'near-complete-circuit': buildNearCompleteCircuitVisual,
    'final-connection': buildFinalConnectionVisual,
    'return-sequence': buildReturnSequenceVisual
  };

  const builder = builders[type] || buildFlatPlaneVisual;
  builder(visual);
  playbackVisualEl.appendChild(visual);
}

function normalizeVisualType(type) {
  const value = String(type || '').trim().toLowerCase();
  return value || 'flat-plane';
}

function appendVisualPart(parent, className, text = '') {
  const part = document.createElement('span');
  part.className = className;
  if (text) part.textContent = text;
  parent.appendChild(part);
  return part;
}

function appendNode(parent, className, style = {}) {
  const node = appendVisualPart(parent, `story-visual__node ${className}`);
  Object.entries(style).forEach(([key, value]) => {
    node.style.setProperty(key, value);
  });
  return node;
}

function appendWire(parent, className, style = {}) {
  const wire = appendVisualPart(parent, `story-visual__wire ${className}`);
  Object.entries(style).forEach(([key, value]) => {
    wire.style.setProperty(key, value);
  });
  return wire;
}

function appendSignal(parent, className, style = {}) {
  const signal = appendVisualPart(parent, `story-visual__signal ${className}`);
  Object.entries(style).forEach(([key, value]) => {
    signal.style.setProperty(key, value);
  });
  return signal;
}

function buildVoidConsciousnessVisual(visual) {
  appendVisualPart(visual, 'story-visual__noise');
  appendVisualPart(visual, 'story-visual__consciousness');
  appendVisualPart(visual, 'story-visual__pulse');
}

function buildFlatPlaneVisual(visual) {
  appendVisualPart(visual, 'story-visual__plane');
  appendVisualPart(visual, 'story-visual__axis story-visual__axis--x');
  appendVisualPart(visual, 'story-visual__axis story-visual__axis--y');
  appendVisualPart(visual, 'story-visual__axis story-visual__axis--z', 'Z');
  appendVisualPart(visual, 'story-visual__none-label', 'NONE');
}

function buildCollisionLinesVisual(visual) {
  appendWire(visual, 'story-visual__wire--collision-a');
  appendWire(visual, 'story-visual__wire--collision-b');
  appendVisualPart(visual, 'story-visual__impact');
}

function buildCircuitShadowVisual(visual) {
  buildNodeField(visual, { ghost: true });
  appendVisualPart(visual, 'story-visual__pulse story-visual__pulse--wide');
}

function buildFirstLinkVisual(visual) {
  appendNode(visual, 'story-visual__node--left');
  appendNode(visual, 'story-visual__node--right');
  appendWire(visual, 'story-visual__wire--horizontal');
  appendSignal(visual, 'story-visual__signal--horizontal');
  appendVisualPart(visual, 'story-visual__flash');
}

function buildConstrainedPathVisual(visual) {
  appendWire(visual, 'story-visual__wire--blocked-a');
  appendWire(visual, 'story-visual__wire--blocked-b');
  appendWire(visual, 'story-visual__wire--bent-path');
  appendVisualPart(visual, 'story-visual__impact story-visual__impact--small');
}

function buildBlueprintVisual(visual) {
  buildNodeField(visual, { blueprint: true });
  appendVisualPart(visual, 'story-visual__blueprint-sheet');
}

function buildSensoryRippleVisual(visual) {
  buildFirstLinkVisual(visual);
  appendVisualPart(visual, 'story-visual__ripple story-visual__ripple--one');
  appendVisualPart(visual, 'story-visual__ripple story-visual__ripple--two');
}

function buildVoiceWaveVisual(visual) {
  appendWaveform(visual, { glitched: true });
}

function buildEquipmentHudVisual(visual) {
  appendVisualPart(visual, 'story-visual__hud-frame');
  appendVisualPart(visual, 'story-visual__headset');
  appendWaveform(visual, { compact: true });
}

function buildChoiceLogVisual(visual) {
  appendVisualPart(visual, 'story-visual__log-line story-visual__log-line--one');
  appendVisualPart(visual, 'story-visual__log-line story-visual__log-line--two');
  appendVisualPart(visual, 'story-visual__log-line story-visual__log-line--three');
  appendVisualPart(visual, 'story-visual__choice-marker');
}

function buildSafeModeVisual(visual) {
  appendVisualPart(visual, 'story-visual__system-box', 'SAFE MODE');
  appendVisualPart(visual, 'story-visual__shield');
}

function buildBrokenWireVisual(visual) {
  appendNode(visual, 'story-visual__node--left');
  appendNode(visual, 'story-visual__node--right');
  appendWire(visual, 'story-visual__wire--broken-left');
  appendWire(visual, 'story-visual__wire--broken-right');
  appendSignal(visual, 'story-visual__signal--fade');
}

function buildWorldBridgeVisual(visual) {
  appendVisualPart(visual, 'story-visual__world story-visual__world--left');
  appendVisualPart(visual, 'story-visual__world story-visual__world--right');
  appendWire(visual, 'story-visual__wire--bridge');
  appendSignal(visual, 'story-visual__signal--bridge');
}

function buildProtocolBlueprintVisual(visual) {
  buildBlueprintVisual(visual);
  appendVisualPart(visual, 'story-visual__protocol-line story-visual__protocol-line--one');
  appendVisualPart(visual, 'story-visual__protocol-line story-visual__protocol-line--two');
}

function buildWarningSignalVisual(visual) {
  appendVisualPart(visual, 'story-visual__warning', 'WARNING');
  appendWaveform(visual, { unstable: true });
}

function buildFlattenFallVisual(visual) {
  appendVisualPart(visual, 'story-visual__cube');
  appendVisualPart(visual, 'story-visual__plane story-visual__plane--flatten');
}

function buildSignalDecayVisual(visual) {
  appendWire(visual, 'story-visual__wire--horizontal story-visual__wire--decay');
  appendSignal(visual, 'story-visual__signal--decay');
  appendVisualPart(visual, 'story-visual__decay-tail');
}

function buildThickeningLinkVisual(visual) {
  appendNode(visual, 'story-visual__node--left');
  appendNode(visual, 'story-visual__node--right');
  appendWire(visual, 'story-visual__wire--horizontal story-visual__wire--thickening');
  appendSignal(visual, 'story-visual__signal--horizontal story-visual__signal--strong');
}

function buildGridCollapseVisual(visual) {
  appendVisualPart(visual, 'story-visual__collapse-grid');
  appendVisualPart(visual, 'story-visual__void-cut story-visual__void-cut--one');
  appendVisualPart(visual, 'story-visual__void-cut story-visual__void-cut--two');
}

function buildDualLayerVisual(visual) {
  appendVisualPart(visual, 'story-visual__split story-visual__split--left');
  appendVisualPart(visual, 'story-visual__split story-visual__split--right');
  appendWire(visual, 'story-visual__wire--bridge story-visual__wire--split-link');
}

function buildChosenPathVisual(visual) {
  appendWire(visual, 'story-visual__wire--choice story-visual__wire--choice-a');
  appendWire(visual, 'story-visual__wire--choice story-visual__wire--choice-b');
  appendWire(visual, 'story-visual__wire--choice story-visual__wire--choice-c');
  appendSignal(visual, 'story-visual__signal--choice');
}

function buildStableWaveVisual(visual) {
  appendWaveform(visual, { stable: true });
  appendVisualPart(visual, 'story-visual__noise-cleanse');
}

function buildNetworkGrowthVisual(visual) {
  buildNodeField(visual, { network: true });
  appendVisualPart(visual, 'story-visual__growth-ring');
}

function buildNearCompleteCircuitVisual(visual) {
  buildNodeField(visual, { dense: true });
  appendVisualPart(visual, 'story-visual__missing-link');
}

function buildFinalConnectionVisual(visual) {
  buildWorldBridgeVisual(visual);
  appendVisualPart(visual, 'story-visual__final-gap');
}

function buildReturnSequenceVisual(visual) {
  buildNodeField(visual, { dense: true, active: true });
  appendVisualPart(visual, 'story-visual__return-light');
  appendVisualPart(visual, 'story-visual__dissolve-grid');
}

function buildNodeField(visual, options = {}) {
  const className = [
    'story-visual__node-field',
    options.ghost ? 'story-visual__node-field--ghost' : '',
    options.blueprint ? 'story-visual__node-field--blueprint' : '',
    options.network ? 'story-visual__node-field--network' : '',
    options.dense ? 'story-visual__node-field--dense' : '',
    options.active ? 'story-visual__node-field--active' : ''
  ].filter(Boolean).join(' ');
  const field = appendVisualPart(visual, className);
  for (let index = 0; index < 9; index += 1) {
    appendVisualPart(field, 'story-visual__node-dot');
  }
}

function appendWaveform(visual, options = {}) {
  const className = [
    'story-visual__waveform',
    options.glitched ? 'story-visual__waveform--glitched' : '',
    options.compact ? 'story-visual__waveform--compact' : '',
    options.unstable ? 'story-visual__waveform--unstable' : '',
    options.stable ? 'story-visual__waveform--stable' : ''
  ].filter(Boolean).join(' ');
  const wave = appendVisualPart(visual, className);
  for (let index = 0; index < 18; index += 1) {
    const bar = appendVisualPart(wave, 'story-visual__wave-bar');
    bar.style.setProperty('--bar-index', index);
  }
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
