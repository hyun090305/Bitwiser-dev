import { createTickRunner } from '../canvas/tickRunner.js';
import { createPlaybackPolicy } from '../canvas/playbackPolicy.js';
import { getExecutionState, getEvaluationResult } from '../canvas/evaluation.js';
import { diagnosticMessage } from '../canvas/connections.js';

export const D_HELP = 'D는 1비트를 저장합니다. 입력 1개: 매 tick 저장. 입력 2개: EN=1일 때 D를 저장, EN=0이면 유지. 두 입력이 있을 때 짧게 클릭/탭하면 D와 EN을 교환합니다.';

export function createMemoryControls(circuit, canvas, { executionMode = 'combinational', isEditing } = {}) {
  const tr = (ko, en) => window.currentLang === 'en' ? en : ko;
  const tickBased = executionMode === 'sequential';
  const bar = document.createElement('section');
  bar.className = 'memory-playback-bar';
  bar.hidden = !tickBased;
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
  const status = document.createElement('div');
  status.className = 'circuit-status-area';
  container?.insertAdjacentElement('beforebegin', status);
  const diagnosticControl = document.createElement('div');
  diagnosticControl.className = 'circuit-diagnostic-control';
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'circuit-diagnostic-badge';
  badge.hidden = true;
  badge.setAttribute('aria-expanded', 'false');
  const diagnostics = document.createElement('div');
  diagnostics.className = 'circuit-diagnostics';
  diagnostics.id = `${canvas.id}-diagnostics`;
  diagnostics.setAttribute('role', 'tooltip');
  diagnostics.hidden = true;
  badge.setAttribute('aria-describedby', diagnostics.id);
  badge.setAttribute('aria-controls', diagnostics.id);
  diagnosticControl.append(badge, diagnostics);
  status.append(diagnosticControl);
  let pinned = false;
  function showDetails(show) {
    diagnostics.hidden = !show || badge.hidden;
    badge.setAttribute('aria-expanded', String(!diagnostics.hidden));
  }
  diagnosticControl.addEventListener('mouseenter', () => showDetails(true));
  diagnosticControl.addEventListener('mouseleave', () => { if (!pinned && document.activeElement !== badge) showDetails(false); });
  badge.addEventListener('focus', () => showDetails(true));
  badge.addEventListener('blur', () => { if (!pinned) showDetails(false); });
  badge.addEventListener('click', () => { pinned = !pinned; showDetails(pinned); });
  badge.addEventListener('keydown', event => {
    if (event.key === 'Escape') { pinned = false; showDetails(false); event.stopPropagation(); }
  });
  const dismissDetails = event => {
    if (!diagnosticControl.contains(event.target)) { pinned = false; showDetails(false); }
  };
  document.addEventListener('pointerdown', dismissDetails);
  // A rejected attempt is not a defect in the current design and must not
  // disable playback or be overwritten by continuous evaluation refreshes.
  const editNotice = document.createElement('p');
  editNotice.className = 'circuit-edit-notice';
  editNotice.setAttribute('role', 'status');
  editNotice.hidden = true;
  status.append(editNotice);
  let editDiagnostics = [];
  let noticeTimer = null;
  function refreshEditNotice() {
    const messages = editDiagnostics.map(d => diagnosticMessage(d));
    const text = messages.length ? tr('⚠ 편집 거부: ', '⚠ Edit rejected: ') + messages[0] : '';
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
  let pageActive = true;
  const visible = () => pageActive && !document.hidden && canvas.getClientRects().length > 0 &&
    !canvas.closest('[inert]') && !document.getElementById('levelIntroModal')?.getClientRects().length;
  const executable = () => Object.keys(circuit.blocks).length > 0 && getEvaluationResult(circuit)?.ok === true;
  let policy;
  const runner = createTickRunner(circuit, {
    interval: 500,
    canRun: () => policy?.canRun() || false,
    onChange(result) {
      failure = result?.ok === false ? result : null;
      refresh(result?.ok === true);
    }
  });
  policy = createPlaybackPolicy(runner, { enabled: tickBased, canRun: () => !locked() && visible() && executable(), isEditing });

  function refresh(tickCompleted = false) {
    refreshEditNotice();
    const result = getEvaluationResult(circuit);
    // A repaired preview also clears a previous tick failure.
    failure = result?.ok === false ? result : null;
    const items = failure?.diagnostics || (!Object.keys(circuit.blocks).length ? [{ code: 'EMPTY_CIRCUIT',
      message: '부품과 도선을 배치해 회로를 완성하세요.', messageEn: 'Place blocks and wires to complete the circuit.' }] : []);
    const messages = items.map(d => diagnosticMessage(d));
    badge.hidden = !messages.length;
    const incomplete = items.every(d => ['MISSING_INPUT', 'MISSING_D_INPUT', 'EMPTY_CIRCUIT'].includes(d.code));
    const label = `⚠ ${incomplete ? tr('미완성', 'Incomplete') : tr('연결 오류', 'Invalid circuit')} · ${items.length}`;
    if (badge.textContent !== label) badge.textContent = label;
    const details = messages.join('\n');
    if (diagnostics.textContent !== details) diagnostics.textContent = details;
    if (badge.hidden) { pinned = false; showDetails(false); }
    const ticksPerSecond = Math.round(1000 / runner.getInterval());
    const state = getExecutionState(circuit);
    count.textContent = `TICK ${String(state.tick % 1000).padStart(3, '0')}`;
    if (lastInterval !== runner.getInterval() || lastState !== state || !runner.isRunning() || !tickBased) clearPulse();
    lastInterval = runner.getInterval();
    lastState = state;
    if (runner.isRunning() && tickBased) {
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
    toggle.disabled = locked() || !executable();
    toggle.textContent = runner.isRunning() ? tr('일시정지', 'Pause') : tr('계속', 'Continue');
    toggle.setAttribute('aria-pressed', runner.isRunning() ? 'true' : 'false');
  }

  speed.addEventListener('input', () => {
    const ticksPerSecond = Math.min(10, Math.max(1, Number(speed.value) || 1));
    runner.setInterval(1000 / ticksPerSecond);
  });
  toggle.addEventListener('click', () => {
    policy.toggle();
    refresh();
  });

  const pauseIfHidden = () => policy.sync();
  const pageHidden = () => { pageActive = false; policy.sync(); };
  const pageShown = () => { pageActive = true; policy.sync(); };
  const scoringChanged = () => { policy.sync(); refresh(); };
  document.addEventListener('visibilitychange', pauseIfHidden);
  document.addEventListener('bitwiser:scoring', scoringChanged);
  window.addEventListener('pagehide', pageHidden);
  window.addEventListener('pageshow', pageShown);
  refresh();

  return {
    runner,
    refresh,
    beginEdit: policy.beginEdit,
    syncPlayback: policy.sync,
    setReady: policy.setReady,
    showEditRejection(items) {
      editDiagnostics = items; refreshEditNotice();
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { editDiagnostics = []; refreshEditNotice(); noticeTimer = null; }, 3000);
    },
    getHeight: () => bar.hidden ? 0 : bar.getBoundingClientRect().height,
    getStatusHeight: () => status.getBoundingClientRect().height,
    destroy() {
      runner.destroy();
      clearTimeout(noticeTimer);
      clearPulse();
      bar.remove();
      status.remove();
      if (!host?.querySelector('.memory-playback-bar')) host?.classList.remove('memory-playback-host');
      document.removeEventListener('visibilitychange', pauseIfHidden);
      document.removeEventListener('bitwiser:scoring', scoringChanged);
      window.removeEventListener('pagehide', pageHidden);
      window.removeEventListener('pageshow', pageShown);
      document.removeEventListener('pointerdown', dismissDetails);
      window.dispatchEvent(new Event('resize'));
    }
  };
}
