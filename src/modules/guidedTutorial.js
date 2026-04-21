import { onCircuitModified, getPlayController } from './grid.js';

export const TUTORIAL_LEVEL = 0;

const TARGET_LAYOUT = {
  IN1: { r: 1, c: 1 },
  NOT: { r: 1, c: 3 },
  IN2: { r: 3, c: 1 },
  AND: { r: 3, c: 3 },
  OUT1: { r: 4, c: 4 }
};

const CONNECTIONS = [
  ['IN1', 'NOT'],
  ['NOT', 'AND'],
  ['IN2', 'AND'],
  ['AND', 'OUT1']
];

function matchesTarget(key, block, target) {
  if (!block || !block.pos || block.pos.r !== target.r || block.pos.c !== target.c) {
    return false;
  }
  if (key === 'IN1' || key === 'IN2') {
    return block.type === 'INPUT' && block.name === key;
  }
  if (key === 'OUT1') {
    return block.type === 'OUTPUT' && block.name === 'OUT1';
  }
  if (key === 'NOT') {
    return block.type === 'NOT';
  }
  if (key === 'AND') {
    return block.type === 'AND';
  }
  return false;
}

export function createGuidedTutorial({
  lang = 'en',
  missionPanel,
  missionList,
  gradeButton,
  getPlayCircuit = () => null
} = {}) {
  let active = false;
  let currentStepIndex = 0;
  let unsubscribeCircuit = null;
  let overlayEl = null;
  let isTransitioning = false;

  const steps = [
    {
      id: 'place',
      titleKo: '블록 배치하기',
      titleEn: 'Place the blocks',
      hint: {
        ko: '드래그 앤 드롭을 통해 블록을 배치하세요.',
        en: 'Drag and drop blocks onto the grid.'
      }
    },
    {
      id: 'wire',
      titleKo: '도선 그리기',
      titleEn: 'Draw the wires',
      hint: {
        ko: 'Ctrl을 누른 채 드래그하여 도선을 설치하세요.',
        en: 'Hold Ctrl and drag to lay wires.'
      }
    },
    {
      id: 'grade',
      titleKo: '회로 실행 버튼 누르기',
      titleEn: 'Press the Run Circuit button',
      hint: {
        ko: "'회로 실행' 버튼을 눌러 결과를 확인하세요.",
        en: "Press 'Run Circuit' to check the result."
      }
    }
  ];

  function isTutorialLevel(level) {
    return Number(level) === TUTORIAL_LEVEL;
  }

  function applyTutorialHighlightState(highlights = []) {
    const controller = getPlayController?.();
    controller?.setTutorialHighlights?.(highlights);
  }

  function applyTutorialWireGuideState(guides = []) {
    const controller = getPlayController?.();
    controller?.setTutorialWireGuides?.(guides);
  }

  function updateTutorialHighlights() {
    if (!active) {
      applyTutorialHighlightState([]);
      return;
    }
    const step = steps[currentStepIndex];
    if (!step || step.id !== 'place') {
      applyTutorialHighlightState([]);
      return;
    }
    const { map } = locateTargetBlocks();
    const outstanding = Object.entries(TARGET_LAYOUT)
      .filter(([key]) => !map[key])
      .map(([key, pos]) => ({ pos, label: key }));
    applyTutorialHighlightState(outstanding);
  }

  function buildGuidePath(from, to) {
    if (!from || !to) return [];
    const path = [];
    let r = from.r;
    let c = from.c;
    path.push({ r, c });
    const stepC = Math.sign(to.c - c);
    while (c !== to.c) {
      c += stepC;
      path.push({ r, c });
    }
    const stepR = Math.sign(to.r - r);
    while (r !== to.r) {
      r += stepR;
      path.push({ r, c });
    }
    return path;
  }

  function updateTutorialWireGuides() {
    if (!active) {
      applyTutorialWireGuideState([]);
      return;
    }
    const step = steps[currentStepIndex];
    if (!step || step.id !== 'wire') {
      applyTutorialWireGuideState([]);
      return;
    }
    const circuit = getPlayCircuit?.();
    if (!circuit) {
      applyTutorialWireGuideState([]);
      return;
    }
    const { complete, map } = locateTargetBlocks();
    if (!complete) {
      applyTutorialWireGuideState([]);
      return;
    }
    const wires = Object.values(circuit.wires || {});
    const guides = CONNECTIONS.filter(([from, to]) => {
      const startId = map[from];
      const endId = map[to];
      if (!startId || !endId) return false;
      return !wires.some(wire => wire.startBlockId === startId && wire.endBlockId === endId);
    }).map(([from, to]) => ({
      path: buildGuidePath(TARGET_LAYOUT[from], TARGET_LAYOUT[to])
    }));
    applyTutorialWireGuideState(guides);
  }

  function locateTargetBlocks() {
    const circuit = getPlayCircuit?.();
    const map = {};
    if (!circuit || !circuit.blocks) {
      return { complete: false, map };
    }
    const entries = Object.entries(circuit.blocks);
    let complete = true;
    Object.entries(TARGET_LAYOUT).forEach(([key, target]) => {
      const match = entries.find(([, block]) => matchesTarget(key, block, target));
      if (match) {
        map[key] = match[0];
      } else {
        complete = false;
      }
    });
    return { complete, map };
  }

  function blocksPlaced() {
    return locateTargetBlocks().complete;
  }

  function connectionsCompleted() {
    const circuit = getPlayCircuit?.();
    if (!circuit || !circuit.wires) return false;
    const { complete, map } = locateTargetBlocks();
    if (!complete) return false;
    const wires = Object.values(circuit.wires);
    return CONNECTIONS.every(([from, to]) =>
      wires.some(wire => wire.startBlockId === map[from] && wire.endBlockId === map[to])
    );
  }

  function setPanelVisible(visible) {
    // Prefer overlay inside the console frame. Create lazily.
    try {
      if (!overlayEl) {
        const parent = document.querySelector('#consoleFrame .console-frame__core') || document.getElementById('consoleFrame') || document.body;
        overlayEl = document.createElement('div');
        overlayEl.className = 'tutorial-mission-overlay';
        overlayEl.style.display = 'none';
        // Ensure parent is positioned to contain absolutely positioned overlay
        try {
          const computed = window.getComputedStyle(parent);
          if (computed.position === 'static') parent.style.position = 'relative';
        } catch (e) {}
        parent.appendChild(overlayEl);
      }
      overlayEl.style.display = visible ? 'flex' : 'none';
    } catch (err) {
      if (missionPanel) missionPanel.style.display = visible ? 'flex' : 'none';
    }
  }
  function renderMissionList() {
    // Render only current mission into the overlay element (or missionList if provided).
    const step = steps[currentStepIndex];
    if (!step) {
      // All steps complete — render final completion card
      try {
        if (!overlayEl) {
          const parent = document.querySelector('#consoleFrame .console-frame__core') || document.getElementById('consoleFrame') || document.body;
          overlayEl = document.createElement('div');
          overlayEl.className = 'tutorial-mission-overlay';
          overlayEl.style.display = 'none';
          try {
            const computed = window.getComputedStyle(parent);
            if (computed.position === 'static') parent.style.position = 'relative';
          } catch (e) {}
          parent.appendChild(overlayEl);
        }
        overlayEl.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'tutorial-complete-final';
        const check = document.createElement('div');
        check.className = 'tutorial-complete-final__check';
        check.textContent = '✓';
        const text = document.createElement('div');
        text.className = 'tutorial-complete-final__text';
        text.textContent = '미션 완료! / Mission complete!';
        container.appendChild(check);
        container.appendChild(text);
        overlayEl.appendChild(container);
      } catch (err) {
        if (!missionList) return;
        missionList.innerHTML = '';
        const item = document.createElement('li');
        item.className = 'tutorial-mission-item tutorial-mission-item--done';
        const title = document.createElement('div');
        title.className = 'tutorial-mission-title';
        title.textContent = '미션 완료! / Mission complete!';
        item.appendChild(title);
        missionList.appendChild(item);
      }
      return;
    }
    const titleText = `${currentStepIndex + 1}. ${step.titleKo} / ${step.titleEn}`;
    const hintKo = step.hint?.ko || '';
    const hintEn = step.hint?.en || '';

    // Update overlay element if present
    try {
      if (!overlayEl) {
        const parent = document.querySelector('#consoleFrame .console-frame__core') || document.getElementById('consoleFrame') || document.body;
        overlayEl = document.createElement('div');
        overlayEl.className = 'tutorial-mission-overlay';
        overlayEl.style.display = 'none';
        try {
          const computed = window.getComputedStyle(parent);
          if (computed.position === 'static') parent.style.position = 'relative';
        } catch (e) {}
        parent.appendChild(overlayEl);
      }
      overlayEl.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'tutorial-mission-title single';
      title.textContent = titleText;
      overlayEl.appendChild(title);
      if (hintKo || hintEn) {
        const hint = document.createElement('div');
        hint.className = 'tutorial-mission-hint single';
        hint.textContent = hintKo;
        if (hintEn) {
          const hintEnEl = document.createElement('div');
          hintEnEl.className = 'tutorial-mission-hint__en single';
          hintEnEl.textContent = hintEn;
          hint.appendChild(hintEnEl);
        }
        overlayEl.appendChild(hint);
      }
    } catch (err) {
      // Fallback to previous list behavior if overlay can't be used
      if (!missionList) return;
      missionList.innerHTML = '';
      const item = document.createElement('li');
      item.className = 'tutorial-mission-item tutorial-mission-item--active';
      const title = document.createElement('div');
      title.className = 'tutorial-mission-title';
      title.textContent = titleText;
      item.appendChild(title);
      if (step.hint) {
        const hint = document.createElement('p');
        hint.className = 'tutorial-mission-hint';
        hint.textContent = hintKo;
        const hintEnEl = document.createElement('span');
        hintEnEl.className = 'tutorial-mission-hint__en';
        hintEnEl.textContent = hintEn;
        hint.appendChild(hintEnEl);
        item.appendChild(hint);
      }
      missionList.appendChild(item);
    }
  }

  function render() {
    if (!active) return;
    setPanelVisible(true);
    renderMissionList();
    updateTutorialHighlights();
    updateTutorialWireGuides();
  }

  function triggerCompleteEffect(next) {
    if (!overlayEl) {
      try {
        overlayEl = document.querySelector('#consoleFrame .console-frame__core .tutorial-mission-overlay') || document.querySelector('#consoleFrame .tutorial-mission-overlay');
      } catch (e) {
        overlayEl = null;
      }
    }
    if (!overlayEl) {
      // no overlay available; proceed immediately
      if (typeof next === 'function') next();
      return;
    }
    // prevent overlapping transitions
    if (isTransitioning) {
      if (typeof next === 'function') next();
      return;
    }
    isTransitioning = true;
    overlayEl.classList.add('tutorial-complete');
    // animate out, then call next(), then animate in
    function handleOutEnd(e) {
      // ignore unrelated animations
      if (e && e.animationName && e.animationName !== 'tutorial-out') return;
      overlayEl.removeEventListener('animationend', handleOutEnd);
      // cleanup out class so it doesn't keep the element hidden
      overlayEl.classList.remove('tutorial-out');
      // hide while content updates
      overlayEl.style.visibility = 'hidden';
      // slight delay to allow CSS glow to remain visible briefly
      setTimeout(() => {
        try {
          if (typeof next === 'function') next();
        } catch (err) {
          console.error('Error advancing tutorial step', err);
        }
        // show and animate in
        requestAnimationFrame(() => {
          overlayEl.style.visibility = 'visible';
          // force reflow to ensure animation plays
          // eslint-disable-next-line no-unused-expressions
          overlayEl.offsetHeight;
          // ensure no leftover out class
          overlayEl.classList.remove('tutorial-out');
          overlayEl.classList.add('tutorial-in');
          function handleInEnd(e2) {
            if (e2 && e2.animationName && e2.animationName !== 'tutorial-in') return;
            overlayEl.removeEventListener('animationend', handleInEnd);
            overlayEl.classList.remove('tutorial-in');
            // remove highlight class after in animation completes
            overlayEl.classList.remove('tutorial-complete');
            isTransitioning = false;
          }
          overlayEl.addEventListener('animationend', handleInEnd);
        });
      }, 90);
    }
    overlayEl.addEventListener('animationend', handleOutEnd);
    // start out-animation
    overlayEl.classList.add('tutorial-out');
  }

  function maybeAdvance() {
    // Reconcile tutorial state when circuit changes: advance or rollback
    if (!active) return;
    reconcileTutorialState();
  }

  function reconcileTutorialState() {
    if (!active) return;
    // compute highest satisfied step index
    let desired = 0;
    if (blocksPlaced()) desired = 1;
    if (connectionsCompleted()) desired = 2;

    // If desired is less than current, rollback immediately
    if (desired < currentStepIndex) {
      currentStepIndex = desired;
      render();
      return;
    }

    // If desired is greater, attempt to advance (with effect) unless transitioning
    if (desired > currentStepIndex && !isTransitioning) {
      // triggerCompleteEffect will call next to increment and render
      triggerCompleteEffect(() => {
        // advance only up to desired (in case multiple steps)
        currentStepIndex = Math.min(desired, currentStepIndex + 1);
        render();
        // if there's still more to advance (rare), call reconcile again
        requestAnimationFrame(() => {
          if (desired > currentStepIndex) reconcileTutorialState();
        });
      });
    } else {
      // nothing to do but update highlights/guides
      updateTutorialHighlights();
      updateTutorialWireGuides();
    }
  }

  function handleGradeClick() {
    if (!active) return;
    if (currentStepIndex >= steps.length) return;
    const step = steps[currentStepIndex];
    if (step.id === 'grade') {
      triggerCompleteEffect(() => {
        currentStepIndex += 1;
        render();
      });
    }
  }

  function start(level) {
    if (!isTutorialLevel(level)) {
      stop();
      return;
    }
    active = true;
    currentStepIndex = 0;
    setPanelVisible(true);
    if (!unsubscribeCircuit) {
      unsubscribeCircuit = onCircuitModified(() => {
        maybeAdvance();
      });
    }
    if (gradeButton) {
      gradeButton.addEventListener('click', handleGradeClick);
    }
    render();
    maybeAdvance();
  }

  function stop() {
    active = false;
    currentStepIndex = 0;
    if (unsubscribeCircuit) {
      unsubscribeCircuit();
      unsubscribeCircuit = null;
    }
    if (gradeButton) {
      gradeButton.removeEventListener('click', handleGradeClick);
    }
    setPanelVisible(false);
    applyTutorialHighlightState([]);
    applyTutorialWireGuideState([]);
  }

  return {
    handleLevelStart(level) {
      start(level);
    },
    stop
  };
}
