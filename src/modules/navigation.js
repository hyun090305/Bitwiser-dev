const NAV_HASHES = ['#ranking', '#home', '#guestbook'];
const HASH_TO_INDEX = {
  '#ranking': 0,
  '#home': 1,
  '#guestbook': 2
};

function focusFirstInActiveTab(tabs, activeIndex) {
  const container = tabs[activeIndex];
  if (!container) return;
  const focusable = container.querySelector(
    'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable) focusable.focus();
}

function updateNavActive(mobileNav, activeIndex) {
  mobileNav
    .querySelectorAll('.nav-item')
    .forEach((item, i) => {
      const isActive = i === activeIndex;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
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
  refreshUserData,
  renderChapterList,
  selectChapter,
  getClearedLevels,
  renderUserProblemList
} = {}) {
  const chapterStageScreen = document.getElementById('chapterStageScreen');
  const chapterNavBtn = document.getElementById('chapterNavBtn');
  const userProblemsBtn = document.getElementById('userProblemsBtn');
  const backBtn = document.getElementById('backToMainFromChapter');
  const overallRankingAreaEl = document.getElementById('overallRankingArea');
  const mainScreenSection = document.getElementById('mainArea');
  const guestbookAreaEl = document.getElementById('guestbookArea');
  const firstScreenEl = document.getElementById('firstScreen');
  const mobileNav = document.getElementById('mobileNav');
  const userProblemsScreen = document.getElementById('user-problems-screen');
  const backToMainFromUserProblemsBtn = document.getElementById('backToChapterFromUserProblems');
  const mainScreen = document.getElementById('mainScreen');

  const getClearedLevelsFn = typeof getClearedLevels === 'function'
    ? getClearedLevels
    : () => [];

  function animateFirstScreenExit() {
    const mainScreen = document.getElementById('mainScreen');

    if (overallRankingAreaEl) {
      overallRankingAreaEl.classList.add('slide-out-left');
    }
    if (guestbookAreaEl) {
      guestbookAreaEl.classList.add('slide-out-right');
    }
    if (mainScreen) {
      mainScreen.classList.add('fade-scale-out');
    }

    return new Promise(resolve => {
      setTimeout(() => {
        if (firstScreenEl) {
          firstScreenEl.style.display = 'none';
        }
        if (overallRankingAreaEl) {
          overallRankingAreaEl.classList.remove('slide-out-left');
        }
        if (guestbookAreaEl) {
          guestbookAreaEl.classList.remove('slide-out-right');
        }
        if (mainScreen) {
          mainScreen.classList.remove('fade-scale-out');
        }
        resolve();
      }, 200);
    });
  }

  if (chapterNavBtn && chapterStageScreen) {
    chapterNavBtn.addEventListener('click', () => {
      lockOrientationLandscape();
      const updateChapters = renderChapterList
        ? Promise.resolve(renderChapterList())
        : Promise.resolve();

      updateChapters
        .then(() => {
          if (typeof selectChapter === 'function') {
            selectChapter(0);
          }
        })
        .catch(err => console.error(err));

      animateFirstScreenExit().then(() => {
        chapterStageScreen.style.display = 'block';
        chapterStageScreen.classList.add('stage-screen-enter');
        if (typeof refreshUserData === 'function') {
          refreshUserData();
        }
        chapterStageScreen.addEventListener(
          'animationend',
          event => {
            if (event.target === chapterStageScreen) {
              chapterStageScreen.classList.remove('stage-screen-enter');
            }
          },
          { once: true }
        );
      });
    });
  }

  if (userProblemsBtn && userProblemsScreen) {
    userProblemsBtn.addEventListener('click', () => {
      lockOrientationLandscape();
      const updateChapters = renderChapterList
        ? Promise.resolve(renderChapterList())
        : Promise.resolve();

      updateChapters
        .then(() => animateFirstScreenExit())
        .then(() => {
          if (chapterStageScreen) {
            chapterStageScreen.style.display = 'none';
          }
          userProblemsScreen.style.display = 'block';
          if (typeof renderUserProblemList === 'function') {
            renderUserProblemList();
          }
          if (typeof refreshUserData === 'function') {
            refreshUserData();
          }
        })
        .catch(err => {
          console.error(err);
        });
    });
  }

  function transitionToMainScreen(screenEl) {
    if (!screenEl) {
      if (firstScreenEl) {
        firstScreenEl.style.display = '';
      }
      if (typeof refreshUserData === 'function') {
        refreshUserData();
      }
      return;
    }

    screenEl.classList.remove('stage-screen-enter');
    screenEl.classList.add('stage-screen-exit');
    let completed = false;
    const exitDurationMs = 220;

    const finalizeReturn = () => {
      if (completed) return;
      completed = true;
      screenEl.classList.remove('stage-screen-exit');
      screenEl.classList.remove('stage-screen-enter');
      screenEl.style.display = 'none';

      if (firstScreenEl) {
        firstScreenEl.style.display = '';
      }
      if (!isMobileDevice()) {
        if (overallRankingAreaEl) {
          overallRankingAreaEl.classList.add('slide-in-left');
          overallRankingAreaEl.addEventListener(
            'animationend',
            () => {
              overallRankingAreaEl.classList.remove('slide-in-left');
              window.dispatchEvent(new Event('resize'));
            },
            { once: true }
          );
        }
        if (guestbookAreaEl) {
          guestbookAreaEl.classList.add('slide-in-right');
          guestbookAreaEl.addEventListener(
            'animationend',
            () => {
              guestbookAreaEl.classList.remove('slide-in-right');
              window.dispatchEvent(new Event('resize'));
            },
            { once: true }
          );
        }
        if (mainScreen) {
          mainScreen.classList.add('fade-scale-in');
          mainScreen.addEventListener(
            'animationend',
            () => {
              mainScreen.classList.remove('fade-scale-in');
              window.dispatchEvent(new Event('resize'));
            },
            { once: true }
          );
        }
      } else {
        window.dispatchEvent(new Event('resize'));
      }

      if (typeof refreshUserData === 'function') {
        refreshUserData();
      }
    };

    const fallbackTimer = setTimeout(finalizeReturn, exitDurationMs);

    const onAnimationEnd = event => {
      if (event.target !== screenEl) return;
      clearTimeout(fallbackTimer);
      finalizeReturn();
    };

    screenEl.addEventListener('animationend', onAnimationEnd, { once: true });
  }

  if (backBtn && chapterStageScreen) {
    backBtn.addEventListener('click', () => {
      transitionToMainScreen(chapterStageScreen);
    });
  }

  if (backToMainFromUserProblemsBtn && userProblemsScreen) {
    backToMainFromUserProblemsBtn.addEventListener('click', () => {
      transitionToMainScreen(userProblemsScreen);
    });
  }

  if (!mobileNav || !firstScreenEl || !overallRankingAreaEl || !mainScreenSection || !guestbookAreaEl) {
    return;
  }

  const tabs = [overallRankingAreaEl, mainScreenSection, guestbookAreaEl];
  let activeTabIndex = HASH_TO_INDEX[location.hash] ?? 1;
  let isTransitioning = false;
  let startX = 0;
  let startY = 0;
  let isSwiping = false;
  let swipeThreshold = window.innerWidth * 0.25;
  let hashLock = false;

  function syncHash(index) {
    hashLock = true;
    location.hash = NAV_HASHES[index];
    setTimeout(() => {
      hashLock = false;
    }, 0);
  }

  function initMobile() {
    tabs.forEach((tab, i) => {
      tab.style.display = 'flex';
      tab.style.transition = '';
      tab.style.transform = `translateX(${(i - activeTabIndex) * 100}%)`;
      tab.style.opacity = i === activeTabIndex ? '1' : '0';
      tab.style.pointerEvents = i === activeTabIndex ? 'auto' : 'none';
      tab.classList.toggle('active', i === activeTabIndex);
    });
    updateNavActive(mobileNav, activeTabIndex);
    swipeThreshold = window.innerWidth * 0.25;
    syncHash(activeTabIndex);
    focusFirstInActiveTab(tabs, activeTabIndex);
    if (typeof refreshUserData === 'function') {
      refreshUserData();
    }
  }

  function resetDesktop() {
    tabs.forEach(tab => {
      tab.style.transition = '';
      tab.style.transform = '';
      tab.style.opacity = '';
      tab.style.pointerEvents = '';
      tab.style.display = '';
      tab.classList.remove('active');
    });
  }

  function goToTab(index) {
    if (isTransitioning || index === activeTabIndex || index < 0 || index >= tabs.length) {
      return;
    }
    const direction = index > activeTabIndex ? 1 : -1;
    const current = tabs[activeTabIndex];
    const next = tabs[index];
    isTransitioning = true;

    next.style.transition = 'none';
    next.style.transform = `translateX(${100 * direction}%)`;
    next.style.opacity = '0';
    next.style.pointerEvents = 'none';
    next.classList.add('active');

    requestAnimationFrame(() => {
      current.style.transition =
        next.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      current.style.transform = `translateX(${-100 * direction}%)`;
      current.style.opacity = '0';
      next.style.transform = 'translateX(0)';
      next.style.opacity = '1';
      next.style.pointerEvents = 'auto';
    });

    next.addEventListener(
      'transitionend',
      () => {
        current.style.transition = '';
        next.style.transition = '';
        current.style.pointerEvents = 'none';
        current.classList.remove('active');
        current.style.transform = `translateX(${-100 * direction}%)`;
        activeTabIndex = index;
        updateNavActive(mobileNav, activeTabIndex);
        focusFirstInActiveTab(tabs, activeTabIndex);
        syncHash(activeTabIndex);
        if (typeof refreshUserData === 'function') {
          refreshUserData();
        }
        isTransitioning = false;
      },
      { once: true }
    );
  }

  mobileNav.querySelectorAll('.nav-item').forEach((item, i) => {
    item.addEventListener('click', () => goToTab(i));
  });

  function onTouchStart(e) {
    if (isTransitioning || window.innerWidth >= 1024) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = true;
  }

  function onTouchMove(e) {
    if (!isSwiping) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) {
      isSwiping = false;
      tabs[activeTabIndex].style.transform = 'translateX(0)';
      return;
    }
    tabs[activeTabIndex].style.transition = 'none';
    tabs[activeTabIndex].style.transform = `translateX(${dx}px)`;
  }

  function onTouchEnd(e) {
    if (!isSwiping) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const absDx = Math.abs(dx);
    const current = tabs[activeTabIndex];
    current.style.transition = 'transform 0.3s ease';
    current.style.transform = 'translateX(0)';
    if (absDx > swipeThreshold && absDx > Math.abs(dy)) {
      if (dx < 0 && activeTabIndex < tabs.length - 1) {
        goToTab(activeTabIndex + 1);
      } else if (dx > 0 && activeTabIndex > 0) {
        goToTab(activeTabIndex - 1);
      }
    }
    isSwiping = false;
  }

  firstScreenEl.addEventListener('touchstart', onTouchStart, { passive: true });
  firstScreenEl.addEventListener('touchmove', onTouchMove, { passive: true });
  firstScreenEl.addEventListener('touchend', onTouchEnd);

  window.addEventListener('hashchange', () => {
    if (hashLock) return;
    const idx = HASH_TO_INDEX[location.hash];
    if (idx !== undefined && idx !== activeTabIndex) {
      goToTab(idx);
    }
  });

  function handleResize() {
    swipeThreshold = window.innerWidth * 0.25;
    if (window.innerWidth >= 1024) {
      resetDesktop();
    } else {
      initMobile();
    }
  }

  window.addEventListener('resize', handleResize);
  handleResize();
}
