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

export function openStoryArchive({ reset = false } = {}) {
  if (!overlayEl) return;
  if (reset) {
    currentFragmentIndex = 0;
  }
  renderFragments();
  overlayEl.dataset.open = 'true';
  overlayEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('story-modal-open');
  window.requestAnimationFrame(() => {
    if (!modalEl) return;
    modalEl.setAttribute('data-glitch', 'true');
    setTimeout(() => modalEl?.setAttribute('data-glitch', 'false'), 140);
    setTimeout(() => continueBtn?.focus(), 200);
  });
}

export function openStoryModal(options = {}) {
  return openStoryArchive(options);
}

export function closeStoryModal() {
  if (!overlayEl) return;
  overlayEl.dataset.open = 'false';
  overlayEl.setAttribute('aria-hidden', 'true');
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
    if (playbackTextEl) {
      playbackTextEl.innerHTML = '';
    }
    document.body.classList.remove('story-playback-open');
    const resolve = playbackResolve;
    playbackResolve = null;
    resolve?.(Boolean(shown));
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

function handleKeydown(event) {
  if (playbackActive && isPlaybackSkipKey(event)) {
    event.preventDefault();
    event.stopPropagation();
    finishStoryPlayback(true);
    return;
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
