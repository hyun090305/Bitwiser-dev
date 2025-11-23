let stageMapScreenEl = null;
let gameScreenEl = null;
let labScreenEl = null;
let openUserProblemsShortcutHandler = null;

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

function animateEnter(screen) {
  if (!screen) return;
  screen.classList.remove('stage-screen-exit');
  screen.classList.add('stage-screen-enter');
  screen.addEventListener(
    'animationend',
    event => {
      if (event.target === screen) {
        screen.classList.remove('stage-screen-enter');
      }
    },
    { once: true }
  );
}

function animateExit(screen, onDone) {
  if (!screen) {
    onDone?.();
    return;
  }
  const computed = window.getComputedStyle(screen);
  if (computed.display === 'none') {
    onDone?.();
    return;
  }
  screen.classList.remove('stage-screen-enter');
  screen.classList.add('stage-screen-exit');
  screen.addEventListener(
    'animationend',
    event => {
      if (event.target !== screen) return;
      screen.classList.remove('stage-screen-exit');
      screen.style.display = 'none';
      onDone?.();
    },
    { once: true }
  );
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
}

export function hideGameScreen() {
  ensureScreens();
  toggleScreen(gameScreenEl, false);
  document.body.classList.remove('game-active');
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

export function openUserProblemsFromShortcut() {
  if (typeof openUserProblemsShortcutHandler === 'function') {
    openUserProblemsShortcutHandler();
  } else {
    console.warn('User problems navigation is not ready yet');
  }
}

export function setupNavigation({
  refreshUserData,
  renderUserProblemList
} = {}) {
  ensureScreens();

  const userProblemsBtn = document.getElementById('userProblemsBtn');
  const userProblemsScreen = document.getElementById('user-problems-screen');
  const backFromUserProblemsBtn = document.getElementById('backToChapterFromUserProblems');

  function refreshUserInfo() {
    if (typeof refreshUserData === 'function') {
      refreshUserData();
    }
  }

  function openUserProblemsScreen() {
    hideStageMapScreen();
    toggleScreen(userProblemsScreen, true, 'block');
    animateEnter(userProblemsScreen);
    if (typeof renderUserProblemList === 'function') {
      renderUserProblemList();
    }
    refreshUserInfo();
  }

  function closeUserProblemsScreen() {
    animateExit(userProblemsScreen, () => {
      showStageMapScreen();
      refreshUserInfo();
    });
  }

  userProblemsBtn?.addEventListener('click', () => {
    lockOrientationLandscape();
    openUserProblemsScreen();
  });

  openUserProblemsShortcutHandler = () => {
    lockOrientationLandscape();
    openUserProblemsScreen();
  };

  backFromUserProblemsBtn?.addEventListener('click', closeUserProblemsScreen);

  showStageMapScreen();
  refreshUserInfo();
}
