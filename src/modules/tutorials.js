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

const fallbackTranslate = key => key;

function resolveLanguage(map, lang) {
  return map[lang] || map.en || Object.values(map)[0] || [];
}

export function initializeTutorials({
  lang = 'en',
  translate,
  storage = typeof window !== 'undefined' ? window.localStorage : undefined,
  elements = {},
  lockOrientationLandscape,
  getStageDataPromise,
  startLevel,
  getLevelTitles,
  getClearedLevels
} = {}) {
  const t = typeof translate === 'function' ? translate : fallbackTranslate;
  const tutorialSteps = resolveLanguage(tutorialStepsData, lang);

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
    screens = {}
  } = elements;

  const { gameScreen } = screens;

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
    if (gameScreen) {
      showGameScreen();
    }
  };

  const autoTutorialEnabled = false;

  const maybeStartTutorial = () => {
    if (!autoTutorialEnabled) {
      return;
    }
    if (!storage || storage.getItem('tutorialCompleted')) {
      return;
    }
    showTutorial(0);
  };

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
    maybeStartTutorial
  };
}
