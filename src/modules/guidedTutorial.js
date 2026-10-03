import { onCircuitModified, getPlayController } from './grid.js';
import { evaluateCircuit, getEvaluationResult } from '../canvas/engine.js';

export const TUTORIAL_LEVEL = 0;
const TARGET_LAYOUT = {
  IN1: { r: 1, c: 1 }, NOT: { r: 1, c: 3 }, IN2: { r: 3, c: 1 },
  AND: { r: 3, c: 3 }, OUT1: { r: 4, c: 4 }
};
const CONNECTIONS = [['IN1', 'NOT'], ['NOT', 'AND'], ['IN2', 'AND'], ['AND', 'OUT1']];

export function createGuidedTutorial({ lang = 'en', missionPanel, missionList, gradeButton, getPlayCircuit = () => null } = {}) {
  let active = false, step = 0, unsubscribeCircuit = null, overlay = null;
  const language = () => window.currentLang || lang;
  const tr = (ko, en) => language() === 'ko' ? ko : en;
  const shortcut = /Mac|iP(hone|ad|od)/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '') ? 'Cmd' : 'Ctrl';
  const steps = [
    ['place', '블록 배치하기', 'Place the blocks', '블록을 안내된 칸에 드래그하세요.', 'Drag the blocks onto the marked cells.'],
    ['wire', '도선 연결하기', 'Connect the wires', `도선 도구를 선택하거나 ${shortcut}를 누른 채 드래그하세요.`, `Use the wire tool, or hold ${shortcut} and drag.`],
    ['input-in2', '입력으로 동작 확인하기', 'Try the inputs', 'IN2를 눌러 보세요.', 'Press IN2.'],
    ['input-in1', '입력으로 동작 확인하기', 'Try the inputs', '이번에는 IN1을 눌러 보세요.', 'Now press IN1.'],
    ['grade', '채점하기', 'Check the circuit', '채점 버튼을 눌러 보세요.', 'Press the grade button.']
  ];
  function locate() {
    const circuit = getPlayCircuit(), blocks = Object.values(circuit?.blocks || {}), map = {};
    for (const [key, pos] of Object.entries(TARGET_LAYOUT)) {
      const type = key.startsWith('IN') ? 'INPUT' : key === 'OUT1' ? 'OUTPUT' : key;
      const candidates = blocks.filter(b => b.type === type && (!['INPUT', 'OUTPUT'].includes(type) || b.name === key));
      // A restored design may use different positions; keep its blocks and wires.
      map[key] = candidates.find(b => b.pos.r === pos.r && b.pos.c === pos.c) || candidates[0];
    }
    return { circuit, map, placed: Object.values(map).every(Boolean) };
  }
  function connected({ circuit, map, placed }) {
    return placed && CONNECTIONS.every(([from, to]) => Object.values(circuit.wires).some(w => w.startBlockId === map[from].id && w.endBlockId === map[to].id));
  }
  function prepareExperiment(state) {
    state.map.IN1.value = false; state.map.IN2.value = false;
    evaluateCircuit(state.circuit); getPlayController()?.refreshVisuals();
  }
  function guidePath(from, to) {
    const path = [{ ...from }]; let { r, c } = from;
    while (c !== to.c) { c += Math.sign(to.c - c); path.push({ r, c }); }
    while (r !== to.r) { r += Math.sign(to.r - r); path.push({ r, c }); }
    return path;
  }
  function render() {
    if (!active) return;
    if (!overlay) {
      const parent = document.querySelector('#consoleFrame .console-frame__core') || document.getElementById('consoleFrame');
      if (parent) {
        overlay = document.createElement('div'); overlay.className = 'tutorial-mission-overlay';
        overlay.setAttribute('role', 'status'); parent.append(overlay);
      }
    }
    const host = overlay || missionList || missionPanel;
    if (host) {
      host.style.display = 'flex'; host.dataset.step = steps[step]?.[0] || 'complete'; host.replaceChildren();
      const title = document.createElement('div'); title.className = 'tutorial-mission-title single';
      const number = step < 2 ? step + 1 : step < 4 ? 3 : 4;
      title.textContent = steps[step] ? `${number}. ${steps[step][language() === 'ko' ? 1 : 2]}` : tr('미션 완료!', 'Mission complete!'); if (step !== 2 && step !== 3) host.append(title);
      if (steps[step]) {
        const hint = document.createElement('div'); hint.className = 'tutorial-mission-hint single';
        hint.textContent = steps[step][language() === 'ko' ? 3 : 4]; host.append(hint);
      }
    }
    const { map, circuit } = locate(), controller = getPlayController();
    const highlights = step === 0 ? Object.entries(TARGET_LAYOUT).filter(([key]) => !map[key]).map(([label, pos]) => ({ label, pos }))
      : step === 2 || step === 3 ? [{ pos: map[step === 2 ? 'IN2' : 'IN1']?.pos, label: step === 2 ? 'IN2' : 'IN1' }] : [];
    controller?.setTutorialHighlights(highlights);
    controller?.setTutorialWireGuides(step === 1 ? CONNECTIONS.filter(([from, to]) => map[from] && map[to] &&
      !Object.values(circuit.wires).some(w => w.startBlockId === map[from].id && w.endBlockId === map[to].id))
      .map(([from, to]) => ({ path: guidePath(map[from].pos, map[to].pos) })) : []);
  }
  function reconcile() {
    if (!active) return;
    const state = locate(), ready = connected(state) && getEvaluationResult(state.circuit)?.ok;
    if (!state.placed) step = 0;
    else if (!ready) step = 1;
    else if (step < 2) { step = 2; prepareExperiment(state); }
    else if ((step === 2 && (state.map.IN1.value || state.map.IN2.value)) ||
      (step === 3 && (!state.map.IN2.value || state.map.IN1.value)) ||
      (step >= 4 && (!state.map.IN1.value || !state.map.IN2.value))) { step = 2; prepareExperiment(state); }
    render();
  }
  function inputChanged(event) {
    if (!active || event.detail?.circuit !== getPlayCircuit()) return;
    const state = locate();
    if (!connected(state) || !getEvaluationResult(state.circuit)?.ok) { reconcile(); return; }
    const { IN1, IN2, OUT1 } = state.map;
    if (step === 2 && event.detail.blockId === IN2.id && !IN1.value && IN2.value && OUT1.value === true) step = 3;
    else if (step === 3 && event.detail.blockId === IN1.id && IN1.value && IN2.value && OUT1.value === false) step = 4;
    else if ((step === 2 && IN1.value) || (step === 3 && !IN2.value)) { step = 2; prepareExperiment(state); }
    render();
  }
  function gradeClicked() { if (active && step === 4) { step = 5; render(); } }
  function stop() {
    active = false; step = 0; unsubscribeCircuit?.(); unsubscribeCircuit = null;
    document.removeEventListener('bitwiser:inputChanged', inputChanged); gradeButton?.removeEventListener('click', gradeClicked);
    if (overlay) overlay.style.display = 'none'; if (missionPanel) missionPanel.style.display = 'none';
    getPlayController()?.setTutorialHighlights([]); getPlayController()?.setTutorialWireGuides([]);
  }
  return {
    handleLevelStart(level) {
      stop(); if (Number(level) !== TUTORIAL_LEVEL) return;
      active = true; unsubscribeCircuit = onCircuitModified(context => { if (context === 'play') reconcile(); });
      document.addEventListener('bitwiser:inputChanged', inputChanged); gradeButton?.addEventListener('click', gradeClicked); reconcile();
    },
    stop
  };
}
