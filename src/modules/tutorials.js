import { hideStageMapScreen, showGameScreen } from './navigation.js';

const tutorialStepsData = {
  ko: [
    {
      title: "블록 배치하기",
      desc: "왼쪽 패널에서 블록을 드래그하여 그리드 위에 배치해보세요.\n- AND, OR, NOT, IN/OUT 블록이 있어요.",
      img: "assets/tutorial-place-blocks.gif"
    },
    {
      title: "전선 그리기",
      desc: "[Ctrl/Cmd] 키를 누른 상태로 블록 간을 드래그하면 전선 모드가 활성화됩니다.\n드래그를 놓으면 두 블록이 연결돼요.",
      img: "assets/tutorial-draw-wire.gif"
    },
    {
      title: "전선 삭제하기",
      desc: "[Shift] 키를 누른 상태에서 전선을 드래그하거나 블록을 드래그하여 전선을 삭제할 수 있어요.",
      img: "assets/tutorial-delete-wire.gif"
    },
    {
      title: "회로 채점하기",
      desc: "오른쪽 ‘채점하기’ 버튼을 누르면 테스트 케이스별 결과가 표시됩니다.\n정확한 회로를 설계해 보세요!\n튜토리얼이 끝났다면 ‘튜토리얼 마치기’를 눌러주세요.",
      img: "assets/tutorial-evaluate.gif"
    }
  ],
  en: [
    {
      title: "Placing Blocks",
      desc: "Drag blocks from the left panel onto the grid.\n- Includes AND, OR, NOT, and IN/OUT blocks.",
      img: "assets/tutorial-place-blocks.gif"
    },
    {
      title: "Drawing Wires",
      desc: "Hold [Ctrl/Cmd] and drag between blocks to enter wire mode.\nRelease to connect the blocks.",
      img: "assets/tutorial-draw-wire.gif"
    },
    {
      title: "Deleting Wires",
      desc: "Hold [Shift] and drag a wire or block to remove wires.",
      img: "assets/tutorial-delete-wire.gif"
    },
    {
      title: "Grading Circuits",
      desc: "Press the 'Grade' button on the right to see results for each test case.\nDesign the correct circuit!\nWhen you're ready, tap 'Finish Tutorial.'",
      img: "assets/tutorial-evaluate.gif"
    }
  ]
};

const stageTutorialsData = {
  ko: {
    1: [{ img: 'assets/not-gate-tutorial.gif', desc: 'NOT 게이트는 입력 신호와 반대되는 신호를 전달합니다.' }],
    2: [{ img: 'assets/or-gate-tutorial.gif', desc: 'OR 게이트는 여러 개의 입력 신호 중 하나라도 1이 있으면 1을 전달하고, 모두 0이면 0을 전달합니다.' }],
    3: [{ img: 'assets/and-gate-tutorial.gif', desc: 'AND 게이트는 여러 개의 입력 신호가 모두 1이면 1을 전달하고, 모두 0이면 0을 전달합니다.' }],
    7: [
      { img: 'assets/junction-tutorial.gif', desc: 'JUNC 블록은 하나의 입력 신호를 그대로 전달합니다.' },
      { img: 'assets/multi-input-tutorial.gif', desc: 'OR, AND 게이트는 최대 3개의 입력 신호를 받을 수 있습니다.' }
    ]
  },
  en: {
    1: [{ img: 'assets/not-gate-tutorial.gif', desc: 'The NOT gate outputs the opposite of its input.' }],
    2: [{ img: 'assets/or-gate-tutorial.gif', desc: 'The OR gate outputs 1 if any input is 1, otherwise 0.' }],
    3: [{ img: 'assets/and-gate-tutorial.gif', desc: 'The AND gate outputs 1 only when all inputs are 1.' }],
    7: [
      { img: 'assets/junction-tutorial.gif', desc: 'The JUNC block passes a single input signal unchanged.' },
      { img: 'assets/multi-input-tutorial.gif', desc: 'OR and AND gates can accept up to three input signals.' }
    ]
  }
};

const fallbackTranslate = key => key;

function resolveLanguage(map, lang) {
  return map[lang] || map.en || Object.values(map)[0] || [];
}

export function initializeTutorials({
  lang = 'en',
  translate,
  storage = typeof window !== 'undefined' ? window.localStorage : undefined,
  elements = {},
  configureLevelModule,
  lockOrientationLandscape,
  getStageDataPromise,
  startLevel,
  getLevelTitles,
  getClearedLevels
} = {}) {
  const t = typeof translate === 'function' ? translate : fallbackTranslate;
  const tutorialSteps = resolveLanguage(tutorialStepsData, lang);
  const stageTutorials = resolveLanguage(stageTutorialsData, lang);

  const {
    tutorialModal,
    tutorialTitle,
    tutorialDescription,
    tutorialPrevButton,
    tutorialNextButton,
    tutorialCloseButton,
    tutorialFinishButton,
    tutorialButton,
    tutorialImage,
    stageModal,
    stageImage,
    stageDescription,
    stageButton,
    screens = {}
  } = elements;

  const { gameScreen, chapterStageScreen } = screens;

  let tutIndex = 0;

  const getLowestUnclearedStage = () => {
    if (!getLevelTitles || !getClearedLevels) return 1;
    const stages = Object.keys(getLevelTitles())
      .map(n => parseInt(n, 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const cleared = new Set(getClearedLevels());
    for (const s of stages) {
      if (!cleared.has(s)) return s;
    }
    return stages[0] || 1;
  };

  const showTutorial = idx => {
    if (!tutorialModal || !tutorialTitle || !tutorialDescription || !tutorialPrevButton || !tutorialNextButton || !tutorialFinishButton || !tutorialImage) {
      return;
    }
    const step = tutorialSteps[idx];
    if (!step) return;
    tutIndex = idx;
    tutorialTitle.textContent = step.title;
    tutorialDescription.textContent = step.desc;

    if (step.img) {
      tutorialImage.src = step.img;
      tutorialImage.style.display = 'block';
    } else {
      tutorialImage.style.display = 'none';
    }

    tutorialPrevButton.disabled = idx === 0;
    tutorialNextButton.style.display = idx === tutorialSteps.length - 1 ? 'none' : 'inline-block';
    tutorialFinishButton.style.display = idx === tutorialSteps.length - 1 ? 'inline-block' : 'none';
    tutorialModal.style.display = 'flex';
  };

  const finishTutorial = () => {
    if (storage) {
      storage.setItem('tutorialCompleted', 'true');
    }
    if (tutorialModal) {
      tutorialModal.style.display = 'none';
    }
    if (typeof lockOrientationLandscape === 'function') {
      lockOrientationLandscape();
    }
    if (typeof getStageDataPromise === 'function' && typeof startLevel === 'function') {
      getStageDataPromise().then(() => {
        startLevel(getLowestUnclearedStage());
      });
    }
    if (typeof document !== 'undefined') {
      document.body.classList.add('game-active');
    }
    hideStageMapScreen();
    if (chapterStageScreen) {
      chapterStageScreen.style.display = 'none';
    }
    if (gameScreen) {
      showGameScreen();
    }
  };

  const maybeStartTutorial = () => {
    if (!storage || storage.getItem('tutorialCompleted')) {
      return;
    }
    showTutorial(0);
  };

  const showStageTutorial = (level, done = () => {}) => {
    const steps = stageTutorials[level];
    if (!steps || !stageModal || !stageImage || !stageDescription || !stageButton) {
      done();
      return;
    }
    let idx = 0;
    const render = () => {
      const step = steps[idx];
      stageImage.src = step.img;
      stageDescription.textContent = step.desc;
      stageButton.textContent = idx === steps.length - 1 ? t('stageTutBtn') : t('tutNextBtn');
    };
    stageButton.onclick = () => {
      if (idx < steps.length - 1) {
        idx += 1;
        render();
      } else {
        stageModal.classList.remove('show');
        setTimeout(() => {
          stageModal.style.display = 'none';
          done();
        }, 180);
      }
    };
    render();
    stageModal.style.display = 'flex';
    requestAnimationFrame(() => stageModal.classList.add('show'));
  };

  if (typeof configureLevelModule === 'function') {
    configureLevelModule({ showStageTutorial });
  }

  if (tutorialButton) {
    tutorialButton.addEventListener('click', () => showTutorial(0));
  }
  if (tutorialPrevButton) {
    tutorialPrevButton.addEventListener('click', () => showTutorial(Math.max(0, tutIndex - 1)));
  }
  if (tutorialNextButton) {
    tutorialNextButton.addEventListener('click', () => showTutorial(Math.min(tutorialSteps.length - 1, tutIndex + 1)));
  }
  if (tutorialFinishButton) {
    tutorialFinishButton.addEventListener('click', finishTutorial);
  }
  if (tutorialCloseButton) {
    tutorialCloseButton.addEventListener('click', () => {
      if (tutorialModal) {
        tutorialModal.style.display = 'none';
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && tutorialModal && tutorialModal.style.display === 'flex') {
        tutorialModal.style.display = 'none';
      }
    });
  }

  return {
    showTutorial,
    maybeStartTutorial,
    showStageTutorial
  };
}
