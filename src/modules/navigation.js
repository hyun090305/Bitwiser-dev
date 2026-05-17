import { setBgmMode } from './bgm.js';
import { adjustGridZoom } from './grid.js';

let stageMapScreenEl = null;
let gameScreenEl = null;
let labScreenEl = null;

function ensureScreens() {
  if (!stageMapScreenEl) {
    stageMapScreenEl = document.getElementById('stageMapScreen');
  }
  if (!gameScreenEl) {
    gameScreenEl = document.getElementById('gameScreen');
  }
  if (!labScreenEl) {
    labScreenEl = document.getElementById('labScreen');
  }
}

function toggleScreen(element, shouldShow, displayValue = 'block') {
  if (!element) return;
  element.style.display = shouldShow ? displayValue : 'none';
}

export function lockOrientationLandscape() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(err => {
      console.warn('Orientation lock failed:', err);
    });
  }
}

export function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function showStageMapScreen() {
  ensureScreens();
  toggleScreen(stageMapScreenEl, true, 'flex');
  stageMapScreenEl?.setAttribute('aria-hidden', 'false');
  setBgmMode('ambient');
}

export function hideStageMapScreen() {
  ensureScreens();
  toggleScreen(stageMapScreenEl, false);
  stageMapScreenEl?.setAttribute('aria-hidden', 'true');
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new Event('stageMap:closePanels'));
  }
}

export function showGameScreen() {
  ensureScreens();
  toggleScreen(gameScreenEl, true, 'flex');
  document.body.classList.add('game-active');
  const introModal = document.getElementById('levelIntroModal');
  const isIntroOpen = Boolean(introModal && introModal.style.display !== 'none');
  setBgmMode(isIntroOpen ? 'ambient' : 'gameplay');
  if (typeof window !== 'undefined') {
    const refreshGridZoom = () => {
      adjustGridZoom();
      adjustGridZoom('problemCanvasContainer');
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        refreshGridZoom();
        window.requestAnimationFrame(refreshGridZoom);
      });
    } else {
      refreshGridZoom();
    }
  }
}

export function hideGameScreen() {
  ensureScreens();
  toggleScreen(gameScreenEl, false);
  document.body.classList.remove('game-active');
  setBgmMode('ambient');
}

export function showLabScreen() {
  ensureScreens();
  toggleScreen(labScreenEl, true, 'block');
  document.body.classList.add('lab-mode-active');
}

export function hideLabScreen() {
  ensureScreens();
  toggleScreen(labScreenEl, false);
  document.body.classList.remove('lab-mode-active');
}

export function setupNavigation({
  refreshUserData
} = {}) {
  ensureScreens();

  function refreshUserInfo() {
    if (typeof refreshUserData === 'function') {
      refreshUserData();
    }
  }

  showStageMapScreen();
  refreshUserInfo();
}
