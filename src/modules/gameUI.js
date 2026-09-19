import { getAutoSaveSetting, setAutoSaveSetting, getBgmEnabledSetting, setBgmEnabledSetting, getSfxEnabledSetting, setSfxEnabledSetting } from './storage.js';
import { setBgmEnabled, setSfxEnabled } from './bgm.js';
import { getAvailableThemes, getActiveThemeId, setActiveTheme, getThemeById, onThemeChange, getThemeText, getThemeGridBackground } from '../themes.js';
import { drawGrid, renderContent, setupCanvas } from '../canvas/renderer.js';
import { CELL, GAP } from '../canvas/model.js';
const translate = key => window.t?.(key) || key;
export function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/***** UI 요소 *****/

const statusToggle  = document.getElementById("wireStatusInfo");
const deleteToggle  = document.getElementById("wireDeleteInfo");
const resetToggle   = document.getElementById("DeleteAllInfo");
const problemStatusToggle = document.getElementById('problemWireStatusInfo');
const problemDeleteToggle = document.getElementById('problemWireDeleteInfo');
const problemResetToggle  = document.getElementById('problemDeleteAllInfo');
let grid;

function simulateKey(key, type = 'keydown') {
  const actualKey =
    key === 'Control' && isApplePlatform
      ? 'Meta'
      : key;
  const eventInit = {
    key: actualKey,
    bubbles: true,
    cancelable: true
  };

  if (actualKey === 'Meta') {
    eventInit.metaKey = true;
  } else if (actualKey === 'Control') {
    eventInit.ctrlKey = true;
  } else if (actualKey === 'Shift') {
    eventInit.shiftKey = true;
  }

  const ev = new KeyboardEvent(type, eventInit);
  document.dispatchEvent(ev);
}

const APPLE_PLATFORM_REGEX = /Mac|iP(hone|ad|od)/i;
const platformSource =
  typeof navigator !== 'undefined'
    ? navigator.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      ''
    : '';
const isApplePlatform = APPLE_PLATFORM_REGEX.test(platformSource);

export function setupKeyToggles() {
  const bindings = [
    [statusToggle, 'Control'],
    [deleteToggle, 'Shift'],
    [resetToggle, 'r'],
    [problemStatusToggle, 'Control'],
    [problemDeleteToggle, 'Shift'],
    [problemResetToggle, 'r']
  ];

  bindings.forEach(([btn, key]) => {
    if (!btn) return;
    if (key.toLowerCase() === 'r') {
      btn.addEventListener('click', () => {
        btn.classList.add('active');
        simulateKey(key, 'keydown');
        simulateKey(key, 'keyup');
        setTimeout(() => btn.classList.remove('active'), 150);
      });
    } else {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const active = !btn.classList.contains('active');
        bindings
          .filter(([, k]) => k === key)
          .forEach(([b]) => b.classList.toggle('active', active));
        simulateKey(key, active ? 'keydown' : 'keyup');
      });
    }
  });

  function isControlKeyEvent(e) {
    if (e.key === 'Control') return true;
    return isApplePlatform && e.key === 'Meta';
  }

  function matchesBinding(e, key) {
    if (key === 'Control') return isControlKeyEvent(e);
    if (key.toLowerCase() === 'r') return e.key.toLowerCase() === 'r';
    return e.key === key;
  }

  document.addEventListener('keydown', e => {
    if (isTextInputFocused() && e.key.toLowerCase() === 'r') {
      bindings.forEach(([btn, key]) => {
        if (btn && key.toLowerCase() === 'r') btn.classList.remove('active');
      });
      return;
    }
    bindings.forEach(([btn, key]) => {
      if (btn && matchesBinding(e, key)) {
        btn.classList.add('active');
        if (key.toLowerCase() === 'r') {
          setTimeout(() => btn.classList.remove('active'), 150);
        }
      }
    });
  });

  document.addEventListener('keyup', e => {
    bindings.forEach(([btn, key]) => {
      if (btn && matchesBinding(e, key) && key.toLowerCase() !== 'r') {
        btn.classList.remove('active');
      }
    });
  });
}

function parseColorToRgb(color) {
  if (typeof color !== 'string' || !color) return null;
  if (typeof document === 'undefined' || !document.body) return null;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = color;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const match = computed.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const channels = match[1]
    .split(',')
    .slice(0, 3)
    .map(part => Number.parseFloat(part.trim()))
    .filter(v => Number.isFinite(v));
  if (channels.length !== 3) return null;
  return channels.map(v => Math.max(0, Math.min(255, v)));
}

function computeRelativeLuminance(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) return null;
  const [r, g, b] = rgb.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isColorDark(color) {
  const rgb = parseColorToRgb(color);
  if (!rgb) return false;
  const luminance = computeRelativeLuminance(rgb);
  if (luminance == null) return false;
  return luminance < 0.45;
}

export function syncGameAreaBackground(theme) {
  const gameArea = document.getElementById('gameArea');
  const hasConsoleFrame = Boolean(document.getElementById('consoleFrame'));
  const color = getThemeGridBackground(theme);
  if (gameArea) {
    gameArea.style.backgroundColor = hasConsoleFrame ? '' : (color || '');
    const isDarkTheme = color ? isColorDark(color) : false;
    gameArea.style.color = isDarkTheme ? '#e2e8f0' : '';
    gameArea.classList.toggle('game-area--dark', isDarkTheme);
    try {
      document.body.classList.toggle('theme--dark', isDarkTheme);
    } catch (err) {
      // ignore in non-DOM environments
    }
  }
}

export function setupSettings({ localSave = false } = {}) {
  const btn = document.getElementById('settingsBtn');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const autoSaveCheckbox = document.getElementById('autoSaveCheckbox');
  const bgmCheckbox = document.getElementById('bgmCheckbox');
  const sfxCheckbox = document.getElementById('sfxCheckbox');
  const themeOptionsEl = document.getElementById('themeOptions');
  const previewCanvas = document.getElementById('themePreviewCanvas');
  const previewLabel = document.getElementById('themePreviewLabel');
  const themeDescriptionEl = document.getElementById('themeDescription');
  if (!btn || !modal || !closeBtn ) return;

  const hasThemeUI = Boolean(themeOptionsEl && previewCanvas && themeDescriptionEl);
  const themeInputs = new Map();
  const previewConfig = { rows: 3, cols: 3 };
  const previewWidth = previewConfig.cols * (CELL + GAP) + GAP;
  const previewHeight = previewConfig.rows * (CELL + GAP) + GAP;
  const previewCircuit = {
    rows: previewConfig.rows,
    cols: previewConfig.cols,
    blocks: {
      input: {
        id: 'preview_in',
        type: 'INPUT',
        name: 'IN',
        pos: { r: 1, c: 0 },
        value: false
      },
      output: {
        id: 'preview_out',
        type: 'OUTPUT',
        name: 'OUT',
        pos: { r: 1, c: 2 },
        value: false
      }
    },
    wires: {
      w1: {
        id: 'preview_wire1',
        path: [
          { r: 1, c: 0 },
          { r: 1, c: 1 },
          { r: 1, c: 2 }
        ],
        startBlockId: 'preview_in',
        endBlockId: 'preview_out'
      }
    }
  };

  const themes = hasThemeUI ? getAvailableThemes() : [];
  let previewCtx = null;
  let previewPhase = 0;
  let previewAnimationId = null;
  let previewActiveTheme = null;

  if (hasThemeUI) {
    previewCtx = setupCanvas(previewCanvas, previewWidth, previewHeight);
  }

  if (!localSave && autoSaveCheckbox) {
    autoSaveCheckbox.checked = getAutoSaveSetting();
    autoSaveCheckbox.addEventListener('change', () => setAutoSaveSetting(autoSaveCheckbox.checked));
  }

  const bgmEnabled = getBgmEnabledSetting();
  if (bgmCheckbox) {
    bgmCheckbox.checked = bgmEnabled;
    setBgmEnabled(bgmEnabled);
    bgmCheckbox.addEventListener('change', () => {
      const enabled = bgmCheckbox.checked;
      setBgmEnabledSetting(enabled);
      setBgmEnabled(enabled);
    });
  }

  const sfxEnabled = getSfxEnabledSetting();
  if (sfxCheckbox) {
    sfxCheckbox.checked = sfxEnabled;
    setSfxEnabled(sfxEnabled);
    sfxCheckbox.addEventListener('change', () => {
      const enabled = sfxCheckbox.checked;
      setSfxEnabledSetting(enabled);
      setSfxEnabled(enabled);
    });
  }

  const getCurrentLang = () =>
    typeof window !== 'undefined' && window.currentLang === 'en' ? 'en' : 'ko';

  const clearPreviewCanvas = () => {
    if (!previewCtx) return;
    previewCtx.save();
    previewCtx.setTransform(1, 0, 0, 1, 0, 0);
    const pixelWidth = previewCanvas?.width || 0;
    const pixelHeight = previewCanvas?.height || 0;
    if (pixelWidth > 0 && pixelHeight > 0) {
      previewCtx.clearRect(0, 0, pixelWidth, pixelHeight);
    }
    previewCtx.restore();
  };

  const renderPreviewFrame = () => {
    if (!previewCtx || !previewActiveTheme) return;
    clearPreviewCanvas();
    drawGrid(previewCtx, previewCircuit.rows, previewCircuit.cols, 0, null, {
      theme: previewActiveTheme
    });
    renderContent(
      previewCtx,
      previewCircuit,
      previewPhase,
      0,
      null,
      null,
      { theme: previewActiveTheme, preserveExisting: true }
    );
  };

  const stepPreviewAnimation = () => {
    previewAnimationId = null;
    if (!previewCtx || !previewActiveTheme) return;
    previewPhase = (previewPhase + 1.5) % 256;
    renderPreviewFrame();
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      previewAnimationId = window.requestAnimationFrame(stepPreviewAnimation);
    }
  };

  const drawThemePreview = theme => {
    if (!previewCtx || !theme) return;
    previewActiveTheme = theme;
    previewPhase = 0;
    renderPreviewFrame();
    if (previewAnimationId != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(previewAnimationId);
      previewAnimationId = null;
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      previewAnimationId = window.requestAnimationFrame(stepPreviewAnimation);
    }
  };

  const buildThemeOptions = () => {
    if (!hasThemeUI) return;
    themeInputs.clear();
    themeOptionsEl.innerHTML = '';
    const lang = getCurrentLang();
    const activeId = getActiveThemeId();
    themes.forEach(theme => {
      const label = document.createElement('label');
      label.className = 'theme-option';
      const accent = theme.accentColor || '#6366f1';
      const accentSoft = theme.accentSoft || 'rgba(99, 102, 241, 0.24)';
      label.style.setProperty('--theme-accent', accent);
      label.style.setProperty('--theme-accent-soft', accentSoft);
      const optionBg = theme.panel?.background || theme.grid?.background || 'rgba(248, 250, 252, 0.88)';
      const activeBg = theme.grid?.gridFillA || theme.grid?.gridFillB || optionBg;
      label.style.setProperty('--theme-option-bg', optionBg);
      label.style.setProperty('--theme-option-bg-active', activeBg);

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'themeSelection';
      input.value = theme.id;
      input.checked = theme.id === activeId;
      input.setAttribute('aria-label', getThemeText(theme, 'name', lang) || theme.id);

      const content = document.createElement('span');
      content.className = 'theme-option__content';

      const swatches = document.createElement('span');
      swatches.className = 'theme-option__swatches';
      const swatchColors = (theme.swatches && theme.swatches.length
        ? theme.swatches
        : [accent, optionBg, activeBg]
      ).filter(Boolean);
      swatchColors.slice(0, 4).forEach(color => {
        const sw = document.createElement('span');
        sw.className = 'theme-option__swatch';
        sw.style.background = color;
        swatches.appendChild(sw);
      });

      const nameEl = document.createElement('span');
      nameEl.className = 'theme-option__name';
      nameEl.textContent = getThemeText(theme, 'name', lang) || theme.id;

      const summaryText = getThemeText(theme, 'summary', lang);
      const summaryEl = document.createElement('span');
      summaryEl.className = 'theme-option__summary';
      summaryEl.textContent = summaryText || '';

      content.appendChild(swatches);
      content.appendChild(nameEl);
      if (summaryText) {
        content.appendChild(summaryEl);
      }

      input.addEventListener('change', () => {
        if (!input.checked) return;
        const previous = getActiveThemeId();
        const nextTheme = setActiveTheme(theme.id);
        if (previous === theme.id && nextTheme) {
          handleThemeChange(nextTheme);
        }
      });

      label.appendChild(input);
      label.appendChild(content);
      themeOptionsEl.appendChild(label);
      themeInputs.set(theme.id, { input, label });
    });
  };

  const handleThemeChange = theme => {
    syncGameAreaBackground(theme);
    if (!hasThemeUI || !theme) return;
    const lang = getCurrentLang();
    const name = getThemeText(theme, 'name', lang) || theme.id;
    const description = getThemeText(theme, 'description', lang);
    const previewText =
      typeof window !== 'undefined' && typeof window.t === 'function'
        ? window.t('themePreviewLabel')
        : 'Preview';
    themeInputs.forEach(({ input, label }, id) => {
      const isActive = id === theme.id;
      if (input) input.checked = isActive;
      if (label) label.classList.toggle('is-active', isActive);
    });
    if (previewLabel) {
      previewLabel.textContent = `${previewText} · ${name}`;
    }
    if (themeDescriptionEl) {
      themeDescriptionEl.textContent = description || '';
    }
    drawThemePreview(theme);
  };

  if (hasThemeUI) {
    buildThemeOptions();
    onThemeChange(handleThemeChange);
    const initialTheme = getThemeById(getActiveThemeId());
    if (initialTheme) {
      handleThemeChange(initialTheme);
    }
  }

  btn.addEventListener('click', () => {
    modal.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

export function setupSystemMenuDrawer() {
  const button = document.getElementById('systemMenuBtn');
  const drawer = document.getElementById('systemMenuDrawer');
  const backdrop = document.getElementById('systemMenuBackdrop');
  const drawerItems = drawer ? Array.from(drawer.querySelectorAll('button')) : [];
  if (!button || !drawer || !backdrop) return;

  document.body.append(backdrop, drawer);

  const updateLabel = () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    const key = expanded ? 'systemMenuClose' : 'systemMenuOpen';
    const label = translate(key);
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  };

  const isLabModeActive = () => document.body.classList.contains('lab-mode-active');

  const open = () => {
    if (isLabModeActive()) return;
    backdrop.hidden = false;
    drawer.hidden = false;
    document.body.classList.add('system-menu-open');
    button.setAttribute('aria-expanded', 'true');
    updateLabel();
  };

  const close = () => {
    backdrop.hidden = true;
    drawer.hidden = true;
    document.body.classList.remove('system-menu-open');
    button.setAttribute('aria-expanded', 'false');
    updateLabel();
  };

  const syncLabModeAvailability = () => {
    const disabled = isLabModeActive();
    button.hidden = disabled;
    button.disabled = disabled;
    button.setAttribute('aria-hidden', disabled ? 'true' : 'false');
    if (disabled && !drawer.hidden) {
      close();
    } else if (!disabled) {
      updateLabel();
    }
  };

  const toggle = () => {
    if (isLabModeActive()) {
      close();
      return;
    }
    if (drawer.hidden) {
      open();
    } else {
      close();
    }
  };

  button.addEventListener('click', event => {
    event.stopPropagation();
    toggle();
  });

  drawerItems.forEach(item => {
    item.addEventListener('click', () => {
      close();
    });
  });

  backdrop.addEventListener('click', () => {
    close();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !drawer.hidden) {
      close();
      if (!button.hidden) {
        button.focus();
      }
    }
  });

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(syncLabModeAvailability);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  close();
  syncLabModeAvailability();
}

