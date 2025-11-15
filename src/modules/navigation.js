const SCREEN_CONFIG = {
  map: { id: 'chapterStageScreen', display: 'block' },
  lab: { id: 'labScreen', display: 'block' },
  custom: { id: 'user-problems-screen', display: 'block' },
  play: { id: 'gameScreen', display: 'flex' }
};

let activeScreen = null;

function setElementDisplay(element, visible, displayValue) {
  if (!element) return;
  element.style.display = visible ? displayValue : 'none';
  element.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function setActiveNavButton(navEl, key) {
  if (!navEl) return;
  navEl.querySelectorAll('[data-screen]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.screen === key);
    btn.setAttribute('aria-pressed', btn.dataset.screen === key ? 'true' : 'false');
  });
}

function setScreen(screenKey) {
  Object.entries(SCREEN_CONFIG).forEach(([key, config]) => {
    const el = document.getElementById(config.id);
    if (!el) return;
    const isActive = key === screenKey;
    setElementDisplay(el, isActive, config.display);
  });
  activeScreen = screenKey;
}

function ensureNavContainer() {
  let nav = document.getElementById('worldNav');
  if (nav) return nav;
  nav = document.createElement('nav');
  nav.id = 'worldNav';
  nav.className = 'world-nav';
  nav.setAttribute('aria-label', 'World navigation');
  nav.innerHTML = `
    <button type="button" class="world-nav__btn" data-screen="map">🗺️ <span>Map</span></button>
    <button type="button" class="world-nav__btn" data-screen="lab">🔬 <span>Lab</span></button>
    <button type="button" class="world-nav__btn" data-screen="custom">⚒️ <span>Custom</span></button>
  `;
  document.body.prepend(nav);
  return nav;
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

export function setupNavigation({
  worldState,
  renderWorldMap,
  renderUserProblemList,
  refreshUserData,
  enterLab
} = {}) {
  const firstScreen = document.getElementById('firstScreen');
  if (firstScreen) {
    firstScreen.style.display = 'none';
  }
  const mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    mobileNav.style.display = 'none';
  }

  const nav = ensureNavContainer();

  const controller = {
    goToMap: () => {
      setScreen('map');
      setActiveNavButton(nav, 'map');
      if (typeof renderWorldMap === 'function') {
        renderWorldMap();
      }
      if (typeof refreshUserData === 'function') {
        refreshUserData();
      }
    },
    goToLab: () => {
      setScreen('lab');
      setActiveNavButton(nav, 'lab');
      if (typeof enterLab === 'function') {
        enterLab();
      }
      lockOrientationLandscape();
    },
    goToCustom: () => {
      setScreen('custom');
      setActiveNavButton(nav, 'custom');
      if (typeof renderUserProblemList === 'function') {
        renderUserProblemList();
      }
      if (typeof refreshUserData === 'function') {
        refreshUserData();
      }
    },
    goToPlay: () => {
      setScreen('play');
      setActiveNavButton(nav, null);
      lockOrientationLandscape();
    },
    getActiveScreen: () => activeScreen
  };

  nav.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.screen;
      if (target === 'map') {
        controller.goToMap();
      } else if (target === 'lab') {
        controller.goToLab();
      } else if (target === 'custom') {
        controller.goToCustom();
      }
    });
  });

  if (worldState && typeof worldState.subscribe === 'function' && typeof renderWorldMap === 'function') {
    worldState.subscribe(() => {
      if (activeScreen === 'map') {
        renderWorldMap();
      }
    });
  }

  const handleShowMapEvent = () => controller.goToMap();
  document.addEventListener('world:showMap', handleShowMapEvent);

  controller.goToMap();
  return controller;
}

