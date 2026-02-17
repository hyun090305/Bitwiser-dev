const TRACKS = {
  ambient: 'assets/Minimalistic Ambient Technology.mp3',
  gameplay: 'assets/Minimal Technological Calm.mp3',
  uiOpen: 'assets/UI open.wav',
  stageIntro: 'assets/Swoosh.wav',
  itemPickup: 'assets/Item Pickup.wav',
  itemDrop: 'assets/Item Drop.wav',
  wirePlacing: 'assets/Wire Placing.wav'
};

let initialized = false;
let desiredMode = 'ambient';
let currentMode = null;
let ambientAudio = null;
let gameplayAudio = null;
let uiOpenAudio = null;
let stageIntroAudio = null;
let itemPickupAudio = null;
let itemDropAudio = null;
let wirePlacingAudio = null;
let unlockBound = false;
let uiSoundBound = false;
let bgmEnabled = true;
let sfxEnabled = true;

function createAudio(src) {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.2;
  return audio;
}

function createEffectAudio(src) {
  const audio = new Audio(src);
  audio.loop = false;
  audio.preload = 'auto';
  audio.volume = 0.5;
  return audio;
}

function getAudioForMode(mode) {
  if (mode === 'gameplay') return gameplayAudio;
  return ambientAudio;
}

function stopAll() {
  if (ambientAudio) ambientAudio.pause();
  if (gameplayAudio) gameplayAudio.pause();
}

function tryPlay(audio) {
  if (!audio) return;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Ignore autoplay restrictions; a later user gesture will retry.
    });
  }
}

function playUiOpenSound() {
  if (!sfxEnabled) return;
  if (!uiOpenAudio) return;
  try {
    uiOpenAudio.currentTime = 0;
  } catch (_) {
    // Ignore seek failures from interrupted playbacks.
  }
  tryPlay(uiOpenAudio);
}

export function playStageIntroSound() {
  if (!sfxEnabled) return;
  if (!stageIntroAudio) return;
  try {
    stageIntroAudio.currentTime = 0;
  } catch (_) {
    // Ignore seek failures from interrupted playbacks.
  }
  tryPlay(stageIntroAudio);
}

export function playItemPickupSound() {
  if (!sfxEnabled) return;
  if (!itemPickupAudio) return;
  try {
    itemPickupAudio.currentTime = 0;
  } catch (_) {
    // Ignore seek failures from interrupted playbacks.
  }
  tryPlay(itemPickupAudio);
}

export function playItemDropSound() {
  if (!sfxEnabled) return;
  if (!itemDropAudio) return;
  try {
    itemDropAudio.currentTime = 0;
  } catch (_) {
    // Ignore seek failures from interrupted playbacks.
  }
  tryPlay(itemDropAudio);
}

export function playWirePlacingSound() {
  if (!sfxEnabled) return;
  if (!wirePlacingAudio) return;
  try {
    wirePlacingAudio.currentTime = 0;
  } catch (_) {
    // Ignore seek failures from interrupted playbacks.
  }
  tryPlay(wirePlacingAudio);
}

function applyMode() {
  if (!initialized) return;
  if (!bgmEnabled) {
    stopAll();
    currentMode = null;
    return;
  }
  const next = desiredMode === 'gameplay' ? 'gameplay' : 'ambient';
  if (currentMode === next) {
    const activeAudio = getAudioForMode(next);
    if (activeAudio && activeAudio.paused) {
      tryPlay(activeAudio);
    }
    return;
  }
  stopAll();
  const nextAudio = getAudioForMode(next);
  tryPlay(nextAudio);
  currentMode = next;
}

function bindUnlockHandlers() {
  if (unlockBound || typeof document === 'undefined') return;
  unlockBound = true;
  const retry = () => applyMode();
  document.addEventListener('pointerdown', retry);
  document.addEventListener('keydown', retry);
  document.addEventListener('touchstart', retry, { passive: true });
}

function bindUiButtonSound() {
  if (uiSoundBound || typeof document === 'undefined') return;
  uiSoundBound = true;
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('button, [role="button"], .btn');
    if (!button) return;
    if (button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') return;

    playUiOpenSound();
  }, true);
}

export function initializeBgm() {
  if (initialized) {
    applyMode();
    return;
  }
  ambientAudio = createAudio(TRACKS.ambient);
  gameplayAudio = createAudio(TRACKS.gameplay);
  uiOpenAudio = createEffectAudio(TRACKS.uiOpen);
  stageIntroAudio = createEffectAudio(TRACKS.stageIntro);
  itemPickupAudio = createEffectAudio(TRACKS.itemPickup);
  itemDropAudio = createEffectAudio(TRACKS.itemDrop);
  wirePlacingAudio = createEffectAudio(TRACKS.wirePlacing);
  initialized = true;
  bindUnlockHandlers();
  bindUiButtonSound();
  applyMode();
}

export function setBgmMode(mode) {
  desiredMode = mode === 'gameplay' ? 'gameplay' : 'ambient';
  applyMode();
}

export function setBgmEnabled(enabled) {
  bgmEnabled = Boolean(enabled);
  applyMode();
}

export function setSfxEnabled(enabled) {
  sfxEnabled = Boolean(enabled);
}
