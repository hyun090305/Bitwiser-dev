import {
  lockOrientationLandscape,
  hideStageMapScreen,
  showGameScreen,
  showStageMapScreen
} from './navigation.js';

const translate = typeof window !== 'undefined' && typeof window.t === 'function'
  ? window.t
  : key => key;

function createNodeElement(node) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stage-node';
  button.dataset.stage = String(node.level);
  button.style.left = `${node.x}px`;
  button.style.top = `${node.y}px`;
  button.innerHTML = `
    <span class="stage-node__chapter">${node.chapterName}</span>
    <span class="stage-node__title">${node.title}</span>
    <span class="stage-node__status"></span>
  `;
  return button;
}

function buildMapNodes({ getChapterData, getLevelTitle }) {
  const chapters = typeof getChapterData === 'function' ? getChapterData() : [];
  const columnSpacing = 320;
  const rowSpacing = 150;
  const jitter = 60;
  let maxStages = 0;
  const nodes = [];

  chapters.forEach((chapter = {}, chapterIndex) => {
    const stages = Array.isArray(chapter.stages) ? chapter.stages : [];
    maxStages = Math.max(maxStages, stages.length);
    stages.forEach((stageId, stageIndex) => {
      const level = Number(stageId);
      const title = getLevelTitle?.(level) ?? `Stage ${level}`;
      const xOffset = stageIndex % 2 === 0 ? -jitter / 2 : jitter / 2;
      const yOffset = chapterIndex % 2 === 0 ? 0 : jitter / 3;
      nodes.push({
        level,
        chapterIndex,
        chapterName: chapter.name || `Chapter ${chapterIndex + 1}`,
        title,
        x: chapterIndex * columnSpacing + 200 + xOffset,
        y: stageIndex * rowSpacing + 140 + yOffset
      });
    });
  });

  const width = Math.max(1200, chapters.length * columnSpacing + 400);
  const height = Math.max(900, maxStages * rowSpacing + 260);

  return { nodes, mapSize: { width, height } };
}

function getDescription(getLevelDescription, level) {
  const info = getLevelDescription?.(level);
  if (info?.desc) return info.desc;
  const fallback = translate('stageDetailDescription');
  return typeof fallback === 'string' ? fallback : '';
}

function setDefaultDetail(detailElements) {
  const {
    titleEl,
    descriptionEl,
    chapterEl,
    statusEl,
    playButton
  } = detailElements;
  if (chapterEl) chapterEl.textContent = '';
  if (titleEl) titleEl.textContent = translate('stageDetailTitle');
  if (descriptionEl) descriptionEl.textContent = translate('stageDetailDescription');
  if (statusEl) statusEl.textContent = '';
  if (playButton) {
    playButton.disabled = true;
    playButton.textContent = translate('stageDetailPlayBtn');
  }
}

function updatePanelState(panel, isOpen, backdrop) {
  if (!panel) return;
  panel.classList.toggle('stage-panel--open', isOpen);
  panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (backdrop) {
    backdrop.hidden = !isOpen;
  }
}

export function initializeStageMap({
  getChapterData,
  getLevelTitle,
  getLevelDescription,
  isLevelUnlocked,
  getClearedLevels,
  startLevel,
  returnToEditScreen
} = {}) {
  const screenEl = document.getElementById('stageMapScreen');
  const viewport = document.getElementById('stageMapViewport');
  const nodesLayer = document.getElementById('stageMapNodes');
  const connectionsSvg = document.getElementById('stageMapConnections');
  const detailTitle = document.getElementById('stageDetailTitle');
  const detailDescription = document.getElementById('stageDetailDescription');
  const detailChapter = document.getElementById('stageDetailChapter');
  const detailStatus = document.getElementById('stageDetailStatus');
  const playButton = document.getElementById('stageDetailPlayBtn');
  const zoomInBtn = document.getElementById('stageMapZoomIn');
  const zoomOutBtn = document.getElementById('stageMapZoomOut');
  const zoomResetBtn = document.getElementById('stageMapZoomReset');
  const surface = document.getElementById('stageMapSurface');
  const panels = Array.from(document.querySelectorAll('.stage-panel'));
  const panelButtons = document.querySelectorAll('[data-panel-target]');
  const panelButtonByPanel = new Map();
  const panelBackdrop = document.getElementById('stagePanelBackdrop');

  if (!screenEl || !viewport || !nodesLayer || !connectionsSvg) {
    return null;
  }

  const detailElements = {
    titleEl: detailTitle,
    descriptionEl: detailDescription,
    chapterEl: detailChapter,
    statusEl: detailStatus,
    playButton
  };

  const state = {
    nodes: [],
    elements: new Map(),
    selected: null,
    scale: 1,
    translateX: 0,
    translateY: 0,
    openPanel: null,
    pointerStart: null
  };

  function refreshNodeStates() {
    const cleared = new Set(getClearedLevels?.() ?? []);
    state.nodes.forEach(node => {
      const el = state.elements.get(node.level);
      if (!el) return;
      const unlocked = isLevelUnlocked?.(node.level) ?? true;
      const clearedClass = cleared.has(node.level);
      el.classList.toggle('stage-node--locked', !unlocked);
      el.classList.toggle('stage-node--cleared', Boolean(clearedClass));
      const status = el.querySelector('.stage-node__status');
      if (status) {
        if (!unlocked) {
          status.textContent = translate('stageDetailLockedMessage');
        } else if (clearedClass) {
          status.textContent = translate('stageDetailClearedMessage');
        } else {
          status.textContent = translate('stageDetailReadyMessage');
        }
      }
      node.locked = !unlocked;
      node.cleared = Boolean(clearedClass);
    });

    if (state.selected) {
      updateDetail(state.selected);
    }
  }

  function updateDetail(node) {
    state.elements.forEach(el => el.classList.remove('stage-node--active'));
    const el = state.elements.get(node.level);
    if (el) el.classList.add('stage-node--active');

    if (detailChapter) {
      detailChapter.textContent = `${node.chapterName} · Stage ${node.level}`;
    }
    if (detailTitle) {
      detailTitle.textContent = node.title;
    }
    if (detailDescription) {
      detailDescription.textContent = getDescription(getLevelDescription, node.level);
    }
    if (detailStatus) {
      if (node.locked) {
        detailStatus.textContent = translate('stageDetailLockedMessage');
      } else if (node.cleared) {
        detailStatus.textContent = translate('stageDetailClearedMessage');
      } else {
        detailStatus.textContent = translate('stageDetailReadyMessage');
      }
    }
    if (playButton) {
      playButton.disabled = Boolean(node.locked);
      playButton.textContent = translate('stageDetailPlayBtn');
    }
    state.selected = node;
  }

  function attachNodes() {
    const { nodes, mapSize } = buildMapNodes({ getChapterData, getLevelTitle });
    state.nodes = nodes;
    viewport.style.setProperty('--map-width', `${mapSize.width}px`);
    viewport.style.setProperty('--map-height', `${mapSize.height}px`);
    nodesLayer.innerHTML = '';
    connectionsSvg.innerHTML = '';
    state.elements.clear();

    nodes.forEach((node, idx) => {
      const el = createNodeElement(node);
      el.addEventListener('click', () => {
        updateDetail(node);
      });
      nodesLayer.appendChild(el);
      state.elements.set(node.level, el);
      if (idx > 0) {
        const prev = nodes[idx - 1];
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${prev.x} ${prev.y} Q ${(prev.x + node.x) / 2} ${prev.y - 60}, ${node.x} ${node.y}`);
        connectionsSvg.appendChild(path);
      }
    });

    refreshNodeStates();
    setDefaultDetail(detailElements);
  }

  function updateViewport() {
    viewport.style.setProperty('--map-scale', String(state.scale));
    viewport.style.setProperty('--map-translate-x', `${state.translateX}px`);
    viewport.style.setProperty('--map-translate-y', `${state.translateY}px`);
  }

  function handleZoom(delta) {
    state.scale = Math.max(0.6, Math.min(1.6, state.scale + delta));
    updateViewport();
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${state.scale.toFixed(1)}×`;
    }
  }

  function resetView() {
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    updateViewport();
    if (zoomResetBtn) {
      zoomResetBtn.textContent = '1×';
    }
  }

  function attachPanHandlers() {
    if (!surface) return;

    surface.addEventListener('pointerdown', event => {
      if (event.target.closest('.stage-panel') || event.target.closest('.hud-button') || event.target.closest('.stage-node')) {
        return;
      }
      surface.setPointerCapture(event.pointerId);
      state.pointerStart = {
        x: event.clientX - state.translateX,
        y: event.clientY - state.translateY
      };
    });

    surface.addEventListener('pointermove', event => {
      if (!state.pointerStart) return;
      state.translateX = event.clientX - state.pointerStart.x;
      state.translateY = event.clientY - state.pointerStart.y;
      updateViewport();
    });

    surface.addEventListener('pointerup', () => {
      state.pointerStart = null;
    });

    surface.addEventListener('wheel', event => {
      if (!event.ctrlKey) {
        event.preventDefault();
        handleZoom(event.deltaY > 0 ? -0.05 : 0.05);
      }
    }, { passive: false });
  }

  async function launchSelectedStage() {
    if (!state.selected || state.selected.locked) {
      if (detailStatus && state.selected?.locked) {
        detailStatus.textContent = translate('stageDetailLockedMessage');
      }
      return;
    }
    if (typeof startLevel !== 'function') return;
    lockOrientationLandscape?.();
    returnToEditScreen?.();
    closeOpenPanel();
    try {
      await startLevel(state.selected.level);
      hideStageMapScreen();
      showGameScreen();
      document.body.classList.add('game-active');
    } catch (err) {
      console.error(err);
    }
  }

  function setupPlayButton() {
    if (playButton) {
      playButton.textContent = translate('stageDetailPlayBtn');
      playButton.addEventListener('click', launchSelectedStage);
    }
  }

  function closeOpenPanel() {
    if (!state.openPanel) return;
    updatePanelState(state.openPanel, false, panelBackdrop);
    panelButtonByPanel.get(state.openPanel)?.setAttribute('aria-expanded', 'false');
    state.openPanel = null;
    showStageMapScreen();
  }

  function setupPanels() {
    panels.forEach(panel => {
      panel.setAttribute('aria-hidden', 'true');
      const closeBtn = panel.querySelector('[data-panel-close]');
      closeBtn?.addEventListener('click', () => closeOpenPanel());
    });

    panelButtons.forEach(btn => {
      const targetSelector = btn.getAttribute('data-panel-target');
      const targetPanel = document.querySelector(targetSelector);
      if (!targetPanel) return;
      panelButtonByPanel.set(targetPanel, btn);
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        const isOpen = state.openPanel === targetPanel;
        closeOpenPanel();
        if (!isOpen) {
          state.openPanel = targetPanel;
          updatePanelState(targetPanel, true, panelBackdrop);
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    panelBackdrop?.addEventListener('click', closeOpenPanel);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeOpenPanel();
      }
    });
  }

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => handleZoom(0.1));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => handleZoom(-0.1));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

  setupPlayButton();
  attachNodes();
  attachPanHandlers();
  setupPanels();

  document.addEventListener('stageMap:progressUpdated', refreshNodeStates);
  document.addEventListener('stageMap:closePanels', closeOpenPanel);
  showStageMapScreen();
  setDefaultDetail(detailElements);

  return {
    refresh: () => {
      attachNodes();
    }
  };
}
