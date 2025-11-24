const TUTORIAL_LEVEL = 0;

const REQUIRED_BLOCKS = [
  { type: 'INPUT', name: 'IN1' },
  { type: 'INPUT', name: 'IN2' },
  { type: 'NOT' },
  { type: 'AND' },
  { type: 'OUTPUT', name: 'OUT1' }
];

const RECOMMENDED_POSITIONS = {
  IN1: { r: 2, c: 2 },
  IN2: { r: 4, c: 2 },
  NOT: { r: 2, c: 4 },
  AND: { r: 3, c: 5 },
  OUT1: { r: 3, c: 6 }
};

const WIRE_TARGETS = [
  ['IN1', 'NOT'],
  ['NOT', 'AND'],
  ['IN2', 'AND'],
  ['AND', 'OUT1']
];

function safeTranslate(translate, key, fallback) {
  if (typeof translate === 'function') {
    const value = translate(key);
    if (typeof value === 'string' && value !== key) return value;
  }
  return fallback || key;
}

function formatPosition({ r, c }) {
  return `r${r} · c${c}`;
}

function createLocationsLine(translate) {
  const parts = [
    `IN1: ${formatPosition(RECOMMENDED_POSITIONS.IN1)}`,
    `IN2: ${formatPosition(RECOMMENDED_POSITIONS.IN2)}`,
    `NOT: ${formatPosition(RECOMMENDED_POSITIONS.NOT)}`,
    `AND: ${formatPosition(RECOMMENDED_POSITIONS.AND)}`,
    `OUT1: ${formatPosition(RECOMMENDED_POSITIONS.OUT1)}`
  ];
  return safeTranslate(translate, 'tutorialMissionPositionLine', parts.join(' · '));
}

function createWireLine(translate) {
  const sequence = ['IN1→NOT', 'NOT→AND', 'IN2→AND', 'AND→OUT1'];
  return safeTranslate(translate, 'tutorialMissionWireLine', sequence.join(', '));
}

export function createTutorialStageGuide({
  translate,
  getCurrentLevel,
  getPlayCircuit,
  onCircuitModified,
  gradeButton
} = {}) {
  const t = key => safeTranslate(translate, key, key);

  const panel = document.getElementById('tutorialMissionPanel');
  const eyebrowEl = document.getElementById('tutorialMissionEyebrow');
  const titleEl = document.getElementById('tutorialMissionTitle');
  const subtitleEl = document.getElementById('tutorialMissionSubtitle');

  const placeTitleEl = document.getElementById('tutorialStepPlaceTitle');
  const placeBodyEl = document.getElementById('tutorialStepPlaceBody');
  const placeHintEl = document.getElementById('tutorialStepPlaceHint');

  const wireTitleEl = document.getElementById('tutorialStepWireTitle');
  const wireBodyEl = document.getElementById('tutorialStepWireBody');
  const wireHintEl = document.getElementById('tutorialStepWireHint');

  const gradeTitleEl = document.getElementById('tutorialStepGradeTitle');
  const gradeBodyEl = document.getElementById('tutorialStepGradeBody');
  const gradeHintEl = document.getElementById('tutorialStepGradeHint');

  const statusLabels = {
    blocks: document.querySelector('[data-step="place"]'),
    wires: document.querySelector('[data-step="wire"]'),
    grade: document.querySelector('[data-step="grade"]')
  };

  let active = false;
  let state = { blocks: false, wires: false, gradeClicked: false };
  let detachCircuitListener = null;
  let gradeListener = null;
  let boundGradeButton = gradeButton;

  function renderCopy() {
    if (!panel) return;
    if (eyebrowEl) eyebrowEl.textContent = t('tutorialMissionEyebrow');
    if (titleEl) titleEl.textContent = t('tutorialMissionTitle');
    if (subtitleEl) subtitleEl.textContent = t('tutorialMissionSubtitle');

    if (placeTitleEl) placeTitleEl.textContent = t('tutorialMissionPlaceTitle');
    if (placeBodyEl) placeBodyEl.textContent = t('tutorialMissionPlaceBody');
    if (placeHintEl) placeHintEl.textContent = createLocationsLine(t);

    if (wireTitleEl) wireTitleEl.textContent = t('tutorialMissionWireTitle');
    if (wireBodyEl) wireBodyEl.textContent = t('tutorialMissionWireBody');
    if (wireHintEl) wireHintEl.textContent = createWireLine(t);

    if (gradeTitleEl) gradeTitleEl.textContent = t('tutorialMissionGradeTitle');
    if (gradeBodyEl) gradeBodyEl.textContent = t('tutorialMissionGradeBody');
    if (gradeHintEl) gradeHintEl.textContent = t('tutorialMissionGradeHint');
  }

  function updateClasses() {
    const gradeDone = state.gradeClicked && state.wires;
    const steps = [
      ['place', state.blocks],
      ['wire', state.wires],
      ['grade', gradeDone]
    ];
    let activeAssigned = false;

    steps.forEach(([step, done]) => {
      const item = statusLabels[step];
      if (!item) return;
      const isActive = !done && !activeAssigned && active;
      if (!done && !activeAssigned) {
        activeAssigned = true;
      }
      item.classList.toggle('is-complete', done);
      item.classList.toggle('is-active', isActive);
    });
  }

  function getBlocksByName(circuit) {
    const blocks = Object.values(circuit?.blocks || {});
    const byName = new Map();
    REQUIRED_BLOCKS.forEach(req => {
      const found = blocks.find(block => {
        if (block.type !== req.type) return false;
        if (req.name && block.name !== req.name) return false;
        return true;
      });
      if (found) {
        const key = req.name || req.type;
        byName.set(key, found);
      }
    });
    return byName;
  }

  function hasRequiredBlocks(circuit) {
    const byName = getBlocksByName(circuit);
    return REQUIRED_BLOCKS.every(req => {
      const key = req.name || req.type;
      return byName.has(key);
    });
  }

  function hasRequiredWires(circuit) {
    const byName = getBlocksByName(circuit);
    const wires = Object.values(circuit?.wires || {});

    return WIRE_TARGETS.every(([fromKey, toKey]) => {
      const from = byName.get(fromKey);
      const to = byName.get(toKey);
      if (!from || !to) return false;
      return wires.some(w =>
        (w.startBlockId === from.id && w.endBlockId === to.id) ||
        (w.startBlockId === to.id && w.endBlockId === from.id)
      );
    });
  }

  function evaluateProgress() {
    if (!active) return;
    const circuit = typeof getPlayCircuit === 'function' ? getPlayCircuit() : null;
    if (!circuit) return;

    state.blocks = hasRequiredBlocks(circuit);
    state.wires = state.blocks && hasRequiredWires(circuit);
    updateClasses();
  }

  function attachCircuitListener() {
    if (typeof onCircuitModified !== 'function') return;
    detachCircuitListener = onCircuitModified(() => evaluateProgress());
  }

  function detachListeners() {
    if (typeof detachCircuitListener === 'function') {
      detachCircuitListener();
      detachCircuitListener = null;
    }
    if (boundGradeButton && gradeListener) {
      boundGradeButton.removeEventListener('click', gradeListener);
      gradeListener = null;
    }
  }

  function ensureGradeListener() {
    if (!boundGradeButton || gradeListener) return;
    gradeListener = () => {
      if (!active || !state.wires) return;
      state.gradeClicked = true;
      updateClasses();
    };
    boundGradeButton.addEventListener('click', gradeListener);
  }

  function activate() {
    if (active) return;
    active = true;
    state = { blocks: false, wires: false, gradeClicked: false };
    renderCopy();
    if (panel) panel.hidden = false;
    attachCircuitListener();
    ensureGradeListener();
    evaluateProgress();
    updateClasses();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    state = { blocks: false, wires: false, gradeClicked: false };
    detachListeners();
    if (panel) panel.hidden = true;
    updateClasses();
  }

  function handleLevelStarted(level) {
    const numericLevel = Number(level);
    if (Number.isFinite(numericLevel) && numericLevel === TUTORIAL_LEVEL) {
      activate();
    } else {
      deactivate();
    }
  }

  function handleLevelIntroComplete() {
    if (!active) return;
    if (panel) {
      panel.classList.add('tutorial-mission-panel--visible');
    }
    evaluateProgress();
    updateClasses();
  }

  function bindGradeButton(button) {
    if (button === boundGradeButton) return;
    detachListeners();
    boundGradeButton = button;
    if (active) {
      ensureGradeListener();
    }
  }

  return {
    handleLevelStarted,
    handleLevelIntroComplete,
    bindGradeButton,
    deactivate
  };
}
