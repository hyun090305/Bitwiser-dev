import { onCircuitModified } from './grid.js';

export const TUTORIAL_LEVEL = 0;

const TARGET_LAYOUT = {
  IN1: { r: 1, c: 0 },
  NOT: { r: 1, c: 2 },
  IN2: { r: 3, c: 0 },
  AND: { r: 2, c: 4 },
  OUT1: { r: 2, c: 5 }
};

const CONNECTIONS = [
  ['IN1', 'NOT'],
  ['NOT', 'AND'],
  ['IN2', 'AND'],
  ['AND', 'OUT1']
];

function formatCellKo(pos) {
  return `${pos.r + 1}행 ${pos.c + 1}열`;
}

function formatCellEn(pos) {
  return `row ${pos.r + 1}, col ${pos.c + 1}`;
}

function createBilingualLine({ ko, en }) {
  const line = document.createElement('div');
  line.className = 'tutorial-bilingual-line';
  const koSpan = document.createElement('span');
  koSpan.textContent = ko;
  const enSpan = document.createElement('span');
  enSpan.className = 'tutorial-english';
  enSpan.textContent = en;
  line.appendChild(koSpan);
  line.appendChild(enSpan);
  return line;
}

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
  missionDetail,
  calloutLayer,
  gradeButton,
  getPlayCircuit = () => null,
  getGridDimensions = () => [6, 6]
} = {}) {
  let active = false;
  let currentStepIndex = 0;
  let unsubscribeCircuit = null;

  const steps = [
    {
      id: 'place',
      titleKo: '블록 배치하기',
      titleEn: 'Place the blocks'
    },
    {
      id: 'wire',
      titleKo: '도선 그리기',
      titleEn: 'Draw the wires'
    },
    {
      id: 'grade',
      titleKo: '채점 버튼 누르기',
      titleEn: 'Press the grade button'
    }
  ];

  const blockPlacementLines = [
    {
      ko: `IN1 입력을 ${formatCellKo(TARGET_LAYOUT.IN1)}에 놓아요.`,
      en: `Drop IN1 at ${formatCellEn(TARGET_LAYOUT.IN1)}.`
    },
    {
      ko: `IN2 입력을 ${formatCellKo(TARGET_LAYOUT.IN2)}에 놓아요.`,
      en: `Place IN2 at ${formatCellEn(TARGET_LAYOUT.IN2)}.`
    },
    {
      ko: `NOT 게이트를 ${formatCellKo(TARGET_LAYOUT.NOT)}에 배치해요.`,
      en: `Position the NOT gate at ${formatCellEn(TARGET_LAYOUT.NOT)}.`
    },
    {
      ko: `AND 게이트는 ${formatCellKo(TARGET_LAYOUT.AND)}에 둡니다.`,
      en: `Set the AND gate at ${formatCellEn(TARGET_LAYOUT.AND)}.`
    },
    {
      ko: `OUT1 출력은 ${formatCellKo(TARGET_LAYOUT.OUT1)} 칸에 놓아주세요.`,
      en: `Drop OUT1 at ${formatCellEn(TARGET_LAYOUT.OUT1)}.`
    }
  ];

  const wireLines = [
    {
      ko: `${formatCellKo(TARGET_LAYOUT.IN1)}의 IN1에서 ${formatCellKo(TARGET_LAYOUT.NOT)}의 NOT까지 Ctrl/Cmd를 누른 채 드래그해 연결해요.`,
      en: `Hold Ctrl/Cmd and drag from IN1 (${formatCellEn(TARGET_LAYOUT.IN1)}) to NOT (${formatCellEn(TARGET_LAYOUT.NOT)}).`
    },
    {
      ko: `${formatCellKo(TARGET_LAYOUT.NOT)}의 NOT에서 ${formatCellKo(TARGET_LAYOUT.AND)}의 AND까지 같은 방식으로 이어요.`,
      en: `Drag from NOT (${formatCellEn(TARGET_LAYOUT.NOT)}) to AND (${formatCellEn(TARGET_LAYOUT.AND)}).`
    },
    {
      ko: `${formatCellKo(TARGET_LAYOUT.IN2)}의 IN2를 ${formatCellKo(TARGET_LAYOUT.AND)}의 AND 입력으로 연결해요.`,
      en: `Connect IN2 (${formatCellEn(TARGET_LAYOUT.IN2)}) to the AND gate (${formatCellEn(TARGET_LAYOUT.AND)}).`
    },
    {
      ko: `${formatCellKo(TARGET_LAYOUT.AND)}의 AND에서 ${formatCellKo(TARGET_LAYOUT.OUT1)}의 OUT1까지 선을 마무리해요.`,
      en: `Finish the path from AND (${formatCellEn(TARGET_LAYOUT.AND)}) to OUT1 (${formatCellEn(TARGET_LAYOUT.OUT1)}).`
    }
  ];

  const gradeLines = [
    {
      ko: "오른쪽 상단 '채점하기' 버튼을 클릭해 테스트를 실행해요.",
      en: "Click the 'Grade' button on the right to run the checks."
    },
    {
      ko: '회로도가 IN1 → NOT → AND → OUT1 (IN2는 AND로) 형태인지 다시 한 번 확인해요.',
      en: 'Confirm the circuit is IN1 → NOT → AND → OUT1 with IN2 feeding the AND gate.'
    }
  ];

  function isTutorialLevel(level) {
    return Number(level) === TUTORIAL_LEVEL;
  }

  function clearCallouts() {
    if (calloutLayer) {
      calloutLayer.innerHTML = '';
    }
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
    cachedTargets = map;
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
    if (calloutLayer) {
      calloutLayer.style.display = visible ? 'block' : 'none';
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
      missionList.appendChild(item);
    });
  }

  function renderDetail() {
    if (!missionDetail) return;
    missionDetail.innerHTML = '';
    if (currentStepIndex >= steps.length) {
      const doneLine = createBilingualLine({
        ko: '튜토리얼을 모두 완료했어요! 채점 결과 창에서 성공을 확인해보세요.',
        en: 'Tutorial steps are complete! Check the grading results to confirm your success.'
      });
      missionDetail.appendChild(doneLine);
      return;
    }

    const step = steps[currentStepIndex];
    const introLine = createBilingualLine({
      ko: '목표 회로: IN1 → NOT → AND → OUT1 (IN2는 AND 입력으로)',
      en: 'Target circuit: IN1 → NOT → AND → OUT1 (IN2 feeds the AND gate)'
    });
    missionDetail.appendChild(introLine);

    let lines = [];
    if (step.id === 'place') {
      lines = blockPlacementLines;
    } else if (step.id === 'wire') {
      lines = wireLines;
    } else if (step.id === 'grade') {
      lines = gradeLines;
    }
    lines.forEach(line => missionDetail.appendChild(createBilingualLine(line)));
  }

  function getCellCenter(pos) {
    const overlayCanvas = document.getElementById('overlayCanvas');
    const container = document.getElementById('gameScreen');
    if (!overlayCanvas || !container) return null;
    const rect = overlayCanvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const panelWidth = Number.parseFloat(overlayCanvas.dataset?.panelWidth || '0');
    const [rows, cols] = getGridDimensions?.() || [];
    if (!rows || !cols) return null;
    const cellWidth = (rect.width - panelWidth) / cols;
    const cellHeight = rect.height / rows;
    return {
      x: rect.left - containerRect.left + panelWidth + cellWidth * (pos.c + 0.5),
      y: rect.top - containerRect.top + cellHeight * (pos.r + 0.5)
    };
  }

  function calloutForButton(btn, label) {
    if (!btn || !calloutLayer) return null;
    const rect = btn.getBoundingClientRect();
    const layerRect = calloutLayer.getBoundingClientRect();
    return {
      x: rect.left - layerRect.left + rect.width / 2,
      y: rect.top - layerRect.top + rect.height / 2,
      label,
      pulse: true
    };
  }

  function buildCallouts() {
    if (!calloutLayer || currentStepIndex >= steps.length) return [];
    const step = steps[currentStepIndex];
    const layerRect = calloutLayer.getBoundingClientRect();
    if (!layerRect.width || !layerRect.height) return [];

    if (step.id === 'grade') {
      return [
        calloutForButton(gradeButton, "'채점하기' / 'Grade'")
      ].filter(Boolean);
    }

    if (step.id === 'place') {
      return Object.entries(TARGET_LAYOUT)
        .map(([key, pos]) => {
          const center = getCellCenter(pos);
          if (!center) return null;
          return {
            x: center.x,
            y: center.y,
            label: `${key}`,
            pulse: key === 'AND' || key === 'NOT'
          };
        })
        .filter(Boolean);
    }

    if (step.id === 'wire') {
      return CONNECTIONS.map(([from, to]) => {
        const start = getCellCenter(TARGET_LAYOUT[from]);
        const end = getCellCenter(TARGET_LAYOUT[to]);
        if (!start || !end) return null;
        return {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
          label: `${from} → ${to}`,
          pulse: true
        };
      }).filter(Boolean);
    }

    return [];
  }

  function renderCallouts() {
    if (!calloutLayer) return;
    calloutLayer.innerHTML = '';
    if (!active || currentStepIndex > steps.length - 1) return;
    const layerRect = calloutLayer.getBoundingClientRect();
    const callouts = buildCallouts();
    callouts.forEach(callout => {
      const marker = document.createElement('div');
      marker.className = 'tutorial-callout';
      if (callout.pulse) {
        marker.classList.add('tutorial-callout--pulse');
      }
      marker.style.left = `${callout.x}px`;
      marker.style.top = `${callout.y}px`;
      const label = document.createElement('div');
      label.className = 'tutorial-callout__label';
      label.textContent = callout.label;
      marker.appendChild(label);
      calloutLayer.appendChild(marker);
    });
  }

  function render() {
    if (!active) return;
    setPanelVisible(true);
    renderMissionList();
    renderDetail();
    renderCallouts();
  }

  function maybeAdvance() {
    if (!active || currentStepIndex >= steps.length) return;
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
        renderCallouts();
      });
    }
    if (gradeButton) {
      gradeButton.addEventListener('click', handleGradeClick);
    }
    window.addEventListener('resize', renderCallouts);
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
    window.removeEventListener('resize', renderCallouts);
    setPanelVisible(false);
    clearCallouts();
  }

  return {
    handleLevelStart(level) {
      start(level);
    },
    stop
  };
}
