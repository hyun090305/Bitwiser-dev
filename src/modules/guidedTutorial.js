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
        ko: 'Shift를 누른 채 드래그하여 도선을 설치하세요.',
        en: 'Hold Shift and drag to lay wires.'
      }
    },
    {
      id: 'grade',
      titleKo: '채점 버튼 누르기',
      titleEn: 'Press the grade button',
      hint: {
        ko: "'채점하기' 버튼을 눌러 결과를 확인하세요.",
        en: "Press 'Grade' to check your result."
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
    if (missionPanel) {
      missionPanel.style.display = visible ? 'flex' : 'none';
    }
  }

  function renderMissionList() {
    if (!missionList) return;
    missionList.innerHTML = '';
    steps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'tutorial-mission-item';
      if (index < currentStepIndex) {
        item.classList.add('tutorial-mission-item--done');
      } else if (index === currentStepIndex) {
        item.classList.add('tutorial-mission-item--active');
      }
      const title = document.createElement('div');
      title.className = 'tutorial-mission-title';
      title.textContent = `${index + 1}. ${step.titleKo} / ${step.titleEn}`;
      item.appendChild(title);
      if (step.hint) {
        const hint = document.createElement('p');
        hint.className = 'tutorial-mission-hint';
        hint.textContent = step.hint.ko;
        const hintEn = document.createElement('span');
        hintEn.className = 'tutorial-mission-hint__en';
        hintEn.textContent = step.hint.en;
        hint.appendChild(hintEn);
        item.appendChild(hint);
      }
      missionList.appendChild(item);
    });
  }

  function render() {
    if (!active) return;
    setPanelVisible(true);
    renderMissionList();
    updateTutorialHighlights();
    updateTutorialWireGuides();
  }

  function maybeAdvance() {
    if (!active || currentStepIndex >= steps.length) return;
    updateTutorialHighlights();
    updateTutorialWireGuides();
    const step = steps[currentStepIndex];
    if (step.id === 'place' && blocksPlaced()) {
      currentStepIndex += 1;
      render();
    } else if (step.id === 'wire' && connectionsCompleted()) {
      currentStepIndex += 1;
      render();
    }
  }

  function handleGradeClick() {
    if (!active) return;
    if (currentStepIndex >= steps.length) return;
    const step = steps[currentStepIndex];
    if (step.id === 'grade') {
      currentStepIndex += 1;
      render();
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
