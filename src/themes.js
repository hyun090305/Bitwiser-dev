const THEME_STORAGE_KEY = 'bitwiserTheme';

function safeGetItem(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn('Failed to read localStorage key', key, err);
    return null;
  }
}

function safeSetItem(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('Failed to write localStorage key', key, err);
  }
}

const THEMES = [
  {
    id: 'soft-glow',
    name: { ko: '소프트 글로우', en: 'Soft Glow' },
    summary: {
      ko: '부드러운 파스텔과 은은한 그림자',
      en: 'Soft pastels with gentle depth'
    },
    description: {
      ko: '은은한 보라빛과 밝은 격자가 어우러진 기본 테마입니다. 회로 요소가 또렷하게 보이면서도 눈에 부담이 적도록 디자인했습니다.',
      en: 'A balanced default palette with lavender blocks and crisp grid lines designed to stay easy on the eyes.'
    },
    swatches: ['#c7d2fe', '#eef2ff', '#4338ca'],
    accentColor: '#6366f1',
    accentSoft: 'rgba(99, 102, 241, 0.25)',
    grid: {
      background: '#f8fafc',
      gridFillA: '#ffffff',
      gridFillB: '#eef2ff',
      gridStroke: '#c7d2fe',
      panelFill: '#e0e7ff',
      panelShadow: {
        color: 'rgba(79, 70, 229, 0.14)',
        blur: 24,
        offsetX: 0,
        offsetY: 10
      },
      borderColor: '#a5b4fc',
      borderWidth: 3,
      cellRadius: 8
    },
    panel: {
      panelBackground: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(224, 231, 255, 0.8)' },
          { offset: 1, color: 'rgba(224, 231, 255, 0.95)' }
        ]
      },
      background: 'rgba(248, 250, 252, 0.82)',
      border: 'rgba(99, 102, 241, 0.35)',
      labelColor: '#312e81',
      itemFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(198, 209, 254, 0.95)' },
          { offset: 1, color: 'rgba(167, 186, 255, 0.95)' }
        ]
      },
      itemTextColor: '#1e293b',
      itemShadow: 'rgba(79, 70, 229, 0.18)',
      itemBorderColor: 'rgba(79, 70, 229, 0.25)'
    },
    block: {
      fill: ['#d7dbff', '#b9c1ff'],
      hoverFill: ['#c7cffb', '#a3b1ff'],
      textColor: '#111827',
      activeFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef3c7' },
          { offset: 0.55, color: '#fde047' },
          { offset: 1, color: '#facc15' }
        ]
      },
      activeHoverFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef9c3' },
          { offset: 0.5, color: '#fde68a' },
          { offset: 1, color: '#fbbf24' }
        ]
      },
      activeTextColor: '#422006',
      radius: 12,
      shadow: {
        color: 'rgba(79, 70, 229, 0.18)',
        blur: 18,
        offsetX: 0,
        offsetY: 6
      },
      hoverShadow: {
        color: 'rgba(79, 70, 229, 0.25)',
        blur: 24,
        offsetX: 0,
        offsetY: 10
      },
      strokeColor: 'rgba(99, 102, 241, 0.4)',
      strokeWidth: 1.2
    },
    wire: {
      color: '#4338ca',
      width: 2.4,
      dashPattern: [20, 16],
      nodeFill: '#eef2ff',
      nodeShadow: 'rgba(79, 70, 229, 0.12)'
    }
  },
  {
    id: 'mono-slate',
    name: { ko: '모노 슬레이트', en: 'Mono Slate' },
    summary: {
      ko: '차분한 회색조의 플랫 디자인',
      en: 'Calm greys with a flat finish'
    },
    description: {
      ko: '그라데이션을 줄이고 선명한 라인을 강조한 플랫 스타일입니다. 블록과 격자가 깔끔하게 정리되어 집중하기 좋습니다.',
      en: 'A flat, low-contrast look that minimizes gradients and keeps focus on precise grid lines.'
    },
    swatches: ['#d9dde5', '#f8fafc', '#475569'],
    accentColor: '#475569',
    accentSoft: 'rgba(71, 85, 105, 0.25)',
    grid: {
      background: '#f8fafc',
      gridFillA: '#ffffff',
      gridFillB: '#f1f5f9',
      gridStroke: '#d4dbe6',
      borderColor: '#94a3b8',
      borderWidth: 2,
      cellRadius: 10,
      panelFill: '#e2e8f0',
      panelShadow: {
        color: 'rgba(15, 23, 42, 0.08)',
        blur: 18,
        offsetX: 0,
        offsetY: 8
      }
    },
    panel: {
      panelBackground: '#e2e8f0',
      background: 'rgba(255, 255, 255, 0.9)',
      border: 'rgba(148, 163, 184, 0.65)',
      labelColor: '#334155',
      itemFill: '#dde3ec',
      itemTextColor: '#1f2937',
      itemShadow: 'rgba(15, 23, 42, 0.08)',
      itemBorderColor: 'rgba(148, 163, 184, 0.6)'
    },
    block: {
      fill: '#dce3ef',
      hoverFill: '#cfd8e6',
      textColor: '#1f2937',
      activeFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef3c7' },
          { offset: 0.55, color: '#fde047' },
          { offset: 1, color: '#facc15' }
        ]
      },
      activeHoverFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef9c3' },
          { offset: 0.5, color: '#fde68a' },
          { offset: 1, color: '#fbbf24' }
        ]
      },
      activeTextColor: '#422006',
      radius: 12,
      shadow: {
        color: 'rgba(15, 23, 42, 0.18)',
        blur: 16,
        offsetX: 0,
        offsetY: 8
      },
      hoverShadow: {
        color: 'rgba(15, 23, 42, 0.22)',
        blur: 24,
        offsetX: 0,
        offsetY: 10
      },
      strokeColor: 'rgba(148, 163, 184, 0.75)',
      strokeWidth: 1.4
    },
    wire: {
      color: '#475569',
      width: 2.6,
      dashPattern: [18, 14],
      nodeFill: '#e2e8f0',
      nodeShadow: 'rgba(71, 85, 105, 0.12)'
    }
  },
  {
    id: 'midnight-neon',
    name: { ko: '미드나이트 네온', en: 'Midnight Neon' },
    summary: {
      ko: '어두운 배경과 선명한 네온 악센트',
      en: 'Deep midnight canvas with neon accents'
    },
    description: {
      ko: '야간에도 잘 보이도록 만든 다크 테마입니다. 짙은 파랑과 청록 네온이 대비를 이루며 회로 흐름이 또렷하게 드러납니다.',
      en: 'A dark mode palette with electric cyan highlights that makes circuits pop during late-night sessions.'
    },
    swatches: ['#0f172a', '#1e293b', '#38bdf8'],
    accentColor: '#38bdf8',
    accentSoft: 'rgba(56, 189, 248, 0.3)',
    grid: {
      background: '#0f172a',
      gridFillA: 'rgba(30, 41, 59, 0.92)',
      gridFillB: 'rgba(15, 23, 42, 0.92)',
      gridStroke: 'rgba(148, 163, 184, 0.2)',
      borderColor: 'rgba(94, 234, 212, 0.6)',
      borderWidth: 2,
      cellRadius: 10,
      panelFill: '#111827',
      panelShadow: {
        color: 'rgba(56, 189, 248, 0.45)',
        blur: 30,
        offsetX: 0,
        offsetY: 12
      }
    },
    panel: {
      panelBackground: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(15, 23, 42, 0.9)' },
          { offset: 1, color: 'rgba(17, 24, 39, 0.95)' }
        ]
      },
      background: 'rgba(15, 23, 42, 0.85)',
      border: 'rgba(56, 189, 248, 0.55)',
      labelColor: '#bae6fd',
      itemFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(14, 116, 144, 0.85)' },
          { offset: 1, color: 'rgba(8, 145, 178, 0.85)' }
        ]
      },
      itemTextColor: '#f8fafc',
      itemShadow: 'rgba(56, 189, 248, 0.35)',
      itemBorderColor: 'rgba(6, 182, 212, 0.55)'
    },
    block: {
      fill: ['#0ea5e9', '#38bdf8'],
      hoverFill: ['#38bdf8', '#67e8f9'],
      textColor: '#f8fafc',
      activeFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef3c7' },
          { offset: 0.55, color: '#fde047' },
          { offset: 1, color: '#facc15' }
        ]
      },
      activeHoverFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef9c3' },
          { offset: 0.5, color: '#fde68a' },
          { offset: 1, color: '#fbbf24' }
        ]
      },
      activeTextColor: '#1f2937',
      radius: 12,
      shadow: {
        color: 'rgba(56, 189, 248, 0.35)',
        blur: 22,
        offsetX: 0,
        offsetY: 12
      },
      hoverShadow: {
        color: 'rgba(129, 230, 217, 0.45)',
        blur: 28,
        offsetX: 0,
        offsetY: 14
      },
      strokeColor: 'rgba(94, 234, 212, 0.6)',
      strokeWidth: 1.6
    },
    wire: {
      color: '#67e8f9',
      width: 2.8,
      dashPattern: [16, 12],
      nodeFill: 'rgba(14, 116, 144, 0.55)',
      nodeShadow: 'rgba(56, 189, 248, 0.3)'
    }
  },
  {
    id: 'solar-punch',
    name: { ko: '솔라 펀치', en: 'Solar Punch' },
    summary: {
      ko: '따뜻한 주황빛과 밝은 그리드',
      en: 'Warm oranges with sunny highlights'
    },
    description: {
      ko: '활기찬 주황과 크림 톤으로 회로 제작에 에너지를 더합니다. 따뜻한 색감이 집중력을 높여주고 시인성도 우수합니다.',
      en: 'A lively warm palette featuring glowing tangerine blocks over a soft cream grid for energetic building.'
    },
    swatches: ['#fdba74', '#fff7ed', '#ea580c'],
    accentColor: '#f97316',
    accentSoft: 'rgba(249, 115, 22, 0.28)',
    grid: {
      background: '#fff7ed',
      gridFillA: '#fffdf7',
      gridFillB: '#ffedd5',
      gridStroke: '#fed7aa',
      borderColor: '#f59e0b',
      borderWidth: 3,
      cellRadius: 12,
      panelFill: '#ffe4c7',
      panelShadow: {
        color: 'rgba(249, 115, 22, 0.25)',
        blur: 26,
        offsetX: 0,
        offsetY: 12
      }
    },
    panel: {
      panelBackground: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(255, 237, 213, 0.95)' },
          { offset: 1, color: 'rgba(255, 247, 237, 0.95)' }
        ]
      },
      background: 'rgba(255, 247, 237, 0.92)',
      border: 'rgba(249, 115, 22, 0.3)',
      labelColor: '#9a3412',
      itemFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(253, 196, 140, 0.95)' },
          { offset: 1, color: 'rgba(251, 146, 60, 0.95)' }
        ]
      },
      itemTextColor: '#7c2d12',
      itemShadow: 'rgba(234, 88, 12, 0.25)',
      itemBorderColor: 'rgba(251, 146, 60, 0.45)'
    },
    block: {
      fill: ['#fdba74', '#fb923c'],
      hoverFill: ['#fb923c', '#f97316'],
      textColor: '#7c2d12',
      activeFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef3c7' },
          { offset: 0.55, color: '#fde047' },
          { offset: 1, color: '#facc15' }
        ]
      },
      activeHoverFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef9c3' },
          { offset: 0.5, color: '#fde68a' },
          { offset: 1, color: '#fbbf24' }
        ]
      },
      activeTextColor: '#422006',
      radius: 14,
      shadow: {
        color: 'rgba(249, 115, 22, 0.35)',
        blur: 22,
        offsetX: 0,
        offsetY: 10
      },
      hoverShadow: {
        color: 'rgba(251, 191, 36, 0.4)',
        blur: 26,
        offsetX: 0,
        offsetY: 12
      },
      strokeColor: 'rgba(234, 88, 12, 0.45)',
      strokeWidth: 1.5
    },
    wire: {
      color: '#ea580c',
      width: 2.6,
      dashPattern: [18, 14],
      nodeFill: 'rgba(253, 224, 171, 0.9)',
      nodeShadow: 'rgba(249, 115, 22, 0.22)'
    }
  },
  {
    id: 'mint-circuit',
    name: { ko: '민트 회로', en: 'Mint Circuit' },
    summary: {
      ko: '차분한 민트와 청량한 포인트',
      en: 'Calming mint with crisp teal accents'
    },
    description: {
      ko: '초록빛 파스텔로 눈의 피로를 줄여주는 테마입니다. 산뜻한 민트 색상과 선명한 테두리가 회로 구조를 선명하게 표현합니다.',
      en: 'A refreshing mint palette that stays easy on the eyes while keeping circuit boundaries clear.'
    },
    swatches: ['#bbf7d0', '#ecfdf5', '#0f766e'],
    accentColor: '#14b8a6',
    accentSoft: 'rgba(20, 184, 166, 0.28)',
    grid: {
      background: '#ecfdf5',
      gridFillA: '#ffffff',
      gridFillB: '#d1fae5',
      gridStroke: '#a7f3d0',
      borderColor: '#34d399',
      borderWidth: 3,
      cellRadius: 12,
      panelFill: '#d1fae5',
      panelShadow: {
        color: 'rgba(45, 212, 191, 0.25)',
        blur: 24,
        offsetX: 0,
        offsetY: 12
      }
    },
    panel: {
      panelBackground: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(209, 250, 229, 0.95)' },
          { offset: 1, color: 'rgba(236, 253, 245, 0.95)' }
        ]
      },
      background: 'rgba(236, 253, 245, 0.94)',
      border: 'rgba(20, 184, 166, 0.35)',
      labelColor: '#0f766e',
      itemFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: 'rgba(167, 243, 208, 0.95)' },
          { offset: 1, color: 'rgba(110, 231, 183, 0.95)' }
        ]
      },
      itemTextColor: '#134e4a',
      itemShadow: 'rgba(20, 184, 166, 0.22)',
      itemBorderColor: 'rgba(45, 212, 191, 0.4)'
    },
    block: {
      fill: ['#a7f3d0', '#6ee7b7'],
      hoverFill: ['#6ee7b7', '#34d399'],
      textColor: '#064e3b',
      activeFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef3c7' },
          { offset: 0.55, color: '#fde047' },
          { offset: 1, color: '#facc15' }
        ]
      },
      activeHoverFill: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#fef9c3' },
          { offset: 0.5, color: '#fde68a' },
          { offset: 1, color: '#fbbf24' }
        ]
      },
      activeTextColor: '#14532d',
      radius: 14,
      shadow: {
        color: 'rgba(16, 185, 129, 0.35)',
        blur: 22,
        offsetX: 0,
        offsetY: 12
      },
      hoverShadow: {
        color: 'rgba(45, 212, 191, 0.4)',
        blur: 26,
        offsetX: 0,
        offsetY: 14
      },
      strokeColor: 'rgba(5, 150, 105, 0.45)',
      strokeWidth: 1.5
    },
    wire: {
      color: '#0f766e',
      width: 2.6,
      dashPattern: [18, 14],
      nodeFill: 'rgba(204, 251, 241, 0.9)',
      nodeShadow: 'rgba(16, 185, 129, 0.25)'
    }
  }
];

const DEFAULT_THEME_ID = THEMES[0].id;

let activeThemeId = (() => {
  const stored = safeGetItem(THEME_STORAGE_KEY);
  if (!stored) return DEFAULT_THEME_ID;
  return THEMES.some(theme => theme.id === stored) ? stored : DEFAULT_THEME_ID;
})();

const listeners = new Set();

function notify(theme) {
  listeners.forEach(listener => {
    try {
      listener(theme);
    } catch (err) {
      console.error('Theme listener threw', err);
    }
  });
}

export function getAvailableThemes() {
  return [...THEMES];
}

export function getThemeById(id) {
  return THEMES.find(theme => theme.id === id) || null;
}

export function getActiveThemeId() {
  return activeThemeId;
}

export function getActiveTheme() {
  return getThemeById(activeThemeId) || THEMES[0];
}

export function setActiveTheme(id) {
  if (!id || activeThemeId === id) {
    return getActiveTheme();
  }
  const nextTheme = getThemeById(id);
  if (!nextTheme) return getActiveTheme();
  activeThemeId = nextTheme.id;
  safeSetItem(THEME_STORAGE_KEY, activeThemeId);
  notify(nextTheme);
  return nextTheme;
}

export function onThemeChange(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThemeText(theme, field, lang = (typeof window !== 'undefined' && window.currentLang) || 'ko') {
  if (!theme) return '';
  const source = theme[field];
  if (!source) return '';
  if (typeof source === 'string') return source;
  return source[lang] || source.en || '';
}

export function getThemeAccent(theme) {
  if (!theme) return '#6366f1';
  return theme.accentColor || '#6366f1';
}

export function getThemeAccentSoft(theme) {
  if (!theme) return 'rgba(99, 102, 241, 0.2)';
  return theme.accentSoft || 'rgba(99, 102, 241, 0.2)';
}

export function getThemeGridBackground(theme) {
  const sourceTheme = theme || getActiveTheme();
  const background = sourceTheme?.grid?.background;
  if (!background) return null;
  if (typeof background === 'string') return background;
  if (typeof background === 'object') {
    if (typeof background.color === 'string') {
      return background.color;
    }
    if (Array.isArray(background.stops)) {
      const validStop = background.stops.find(stop => typeof stop?.color === 'string');
      if (validStop?.color) {
        return validStop.color;
      }
    }
  }
  return null;
}

