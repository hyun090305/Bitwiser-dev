import { createTickRunner } from '../canvas/tickRunner.js';
import { getExecutionState, getEvaluationResult } from '../canvas/evaluation.js';
import { diagnosticMessage } from '../canvas/connections.js';

export const D_HELP = 'D는 1비트를 저장합니다. 입력 1개: 매 tick 저장. 입력 2개: EN=1일 때 D를 저장, EN=0이면 유지. 두 입력이 있을 때 짧게 클릭/탭하면 D와 EN을 교환합니다.';

export function createMemoryControls(circuit, canvas) {
  const tr = (ko, en) => window.currentLang === 'en' ? en : ko;
  const bar = document.createElement('section');
  bar.className = 'memory-playback-bar';
  bar.setAttribute('aria-label', tr('회로 재생 제어', 'Circuit playback controls'));

  const tickStatus = document.createElement('span');
  tickStatus.className = 'memory-playback-tick';
  const lamp = document.createElement('span');
  lamp.className = 'memory-playback-lamp';
  lamp.setAttribute('aria-hidden', 'true');
  const count = document.createElement('span');
  tickStatus.append(lamp, count);

  const speedLabel = document.createElement('label');
  speedLabel.className = 'memory-playback-speed';
  const speedText = document.createElement('span');
  const speed = document.createElement('input');
  speed.type = 'range';
  speed.min = '1';
  speed.max = '10';
  speed.step = '1';
  speed.value = '2';
  speed.setAttribute('aria-label', tr('재생 속도', 'Playback speed'));
  speedLabel.append(speedText, speed);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.memoryAction = 'play';
  bar.append(tickStatus, speedLabel, toggle);

  const container = canvas.parentElement;
  const host = container?.parentElement;
  host?.classList.add('memory-playback-host');
  container?.insertAdjacentElement('afterend', bar);
  const diagnostics = document.createElement('p');
  diagnostics.className = 'circuit-diagnostics';
  diagnostics.setAttribute('role', 'status');
  diagnostics.hidden = true;
  bar.insertAdjacentElement('afterend', diagnostics);
  // A rejected attempt is not a defect in the current design and must not
  // disable playback or be overwritten by continuous evaluation refreshes.
  const editNotice = document.createElement('p');
  editNotice.className = 'circuit-edit-notice';
  editNotice.setAttribute('role', 'status');
  editNotice.hidden = true;
  diagnostics.insertAdjacentElement('afterend', editNotice);
  let editDiagnostics = [];
  function refreshEditNotice() {
    const messages = editDiagnostics.map(d => diagnosticMessage(d));
    const text = messages.length ? tr('편집 거부: ', 'Edit rejected: ') + messages[0] : '';
    const title = messages.join('\n');
    // Keep the live region unchanged during frame/tick refreshes.
    if (editNotice.hidden !== !messages.length) editNotice.hidden = !messages.length;
    if (editNotice.textContent !== text) editNotice.textContent = text;
    if (editNotice.title !== title) editNotice.title = title;
  }

  let failure = null;
  let pulseTimer = null;
  let lastInterval = null;
  let lastState = null;
  function clearPulse() {
    if (pulseTimer !== null) clearTimeout(pulseTimer);
    pulseTimer = null;
    lamp.classList.remove('is-lit');
  }
  const locked = () => Boolean(window.isScoring || window.isGradingResultOpen);
  const visible = () => !document.hidden && canvas.getClientRects().length > 0;
  const runner = createTickRunner(circuit, {
    interval: 500,
    canRun: () => !locked() && visible(),
    onChange(result) {
      failure = result?.ok === false ? result : null;
      refresh(result?.ok === true);
    }
  });

  function refresh(tickCompleted = false) {
    refreshEditNotice();
    const result = getEvaluationResult(circuit);
    // A repaired preview also clears a previous tick failure.
    failure = result?.ok === false ? result : null;
    const messages = (failure?.diagnostics || []).map(d => diagnosticMessage(d));
    diagnostics.hidden = !messages.length;
    diagnostics.textContent = messages.slice(0, 3).join(' · ');
    diagnostics.title = messages.join('\n');
    const hasMemory = Object.values(circuit.blocks).some(block => block.type === 'D' || block.inputMode === 'button');
    const hiddenChanged = bar.hidden === hasMemory;
    bar.hidden = !hasMemory;
    const ticksPerSecond = Math.round(1000 / runner.getInterval());
    const state = getExecutionState(circuit);
    count.textContent = `TICK ${String(state.tick % 1000).padStart(3, '0')}`;
    if (lastInterval !== runner.getInterval() || lastState !== state || !runner.isRunning() || !hasMemory) clearPulse();
    lastInterval = runner.getInterval();
    lastState = state;
    if (runner.isRunning() && hasMemory) {
      if (1000 / runner.getInterval() > 3) {
        clearPulse();
        lamp.classList.add('is-lit');
      } else if (tickCompleted === true) {
        clearPulse();
        lamp.classList.add('is-lit');
        // Presentation only: never schedule or delay circuit execution here.
        pulseTimer = setTimeout(clearPulse, 150);
      }
    }
    speedText.textContent = `${tr('속도', 'Speed')} · ${ticksPerSecond} tick/s`;
    speed.value = String(ticksPerSecond);
    speed.disabled = locked();
    toggle.disabled = locked() || Boolean(failure);
    toggle.textContent = runner.isRunning() ? tr('일시정지', 'Pause') : tr('계속', 'Continue');
    toggle.setAttribute('aria-pressed', runner.isRunning() ? 'true' : 'false');
    if (hiddenChanged) window.dispatchEvent(new Event('resize'));
  }

  speed.addEventListener('input', () => {
    const ticksPerSecond = Math.min(10, Math.max(1, Number(speed.value) || 1));
    runner.setInterval(1000 / ticksPerSecond);
  });
  toggle.addEventListener('click', () => {
    if (runner.isRunning()) runner.pause();
    else runner.play();
  });

  const pauseIfHidden = () => { if (!visible()) runner.pause(); };
  const scoringChanged = () => { if (locked()) runner.pause(); refresh(); };
  document.addEventListener('visibilitychange', pauseIfHidden);
  document.addEventListener('bitwiser:scoring', scoringChanged);
  window.addEventListener('pagehide', pauseIfHidden);
  refresh();

  return {
    runner,
    refresh,
    showEditRejection(items) { editDiagnostics = items; refreshEditNotice(); },
    clearEditRejection() { editDiagnostics = []; refreshEditNotice(); },
    getHeight: () => bar.hidden ? 0 : bar.getBoundingClientRect().height,
    destroy() {
      runner.destroy();
      clearPulse();
      bar.remove();
      diagnostics.remove();
      editNotice.remove();
      if (!host?.querySelector('.memory-playback-bar')) host?.classList.remove('memory-playback-host');
      document.removeEventListener('visibilitychange', pauseIfHidden);
      document.removeEventListener('bitwiser:scoring', scoringChanged);
      window.removeEventListener('pagehide', pauseIfHidden);
      window.dispatchEvent(new Event('resize'));
    }
  };
}
