import { chapterForStage } from './stageCatalog.js';
import { diagnosticMessage } from '../canvas/connections.js';
import { createCounterexampleTrace, observationLabel } from './counterexampleTrace.js';
import { createTracePlayback } from '../canvas/tracePlayback.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const tr = (ko, en) => (globalThis.window?.currentLang || document.documentElement.lang) === 'en' ? en : ko;

export function resultStageLabel(stage) {
  if (stage == null) return 'CUSTOM CIRCUIT';
  const chapter = chapterForStage(Number(stage));
  return `${chapter ? chapter.title.toUpperCase() + ' · ' : ''}STAGE ${String(stage).padStart(2, '0')}`;
}

export function createResultHeader({ stage, title }) {
  const header = el('header', 'grading-result-header');
  header.append(el('p', 'level-intro-screen__code', resultStageLabel(stage)), el('h2', 'level-intro-screen__title', title));
  return header;
}

// The cost/achievement result keeps its existing actions and content, while
// sharing the same panel, stage label and title hierarchy as failures.
export function stylePassedResult(container, stage) {
  container.classList.add('grading-result-panel', 'grading-result-panel--passed');
  container.querySelector('.grading-result-header')?.remove();
  container.prepend(createResultHeader({ stage, title: tr('채점 결과: 통과', 'Result: passed') }));
}

export function createGradingResultView({ getCircuit, getTraceView, onEdit, onClose = () => {} } = {}) {
  if (typeof document === 'undefined') return null;
  const dialog = el('dialog', 'grading-result-overlay');
  dialog.id = 'gradingResultOverlay';
  dialog.setAttribute('aria-labelledby', 'gradingResultTitle');
  const panel = el('section', 'grading-result-panel');
  dialog.append(panel); document.body.append(dialog);
  let playback = null, cameraView = null, timer = null, generation = 0;
  let previousFocus = null;
  let renderedTrace = null;

  function stopReplay() {
    generation++;
    clearTimeout(timer); timer = null;
    playback?.restore(); playback = null;
    cameraView?.restore(); cameraView = null;
  }
  function close({ restoreFocus = true } = {}) {
    stopReplay();
    renderedTrace?.destroy(); renderedTrace = null;
    dialog.classList.remove('is-replaying');
    if (dialog.open) dialog.close();
    onClose();
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
  }
  const edit = () => { close(); onEdit?.(); };
  dialog.addEventListener('cancel', e => { e.preventDefault(); edit(); });
  return {
    close,
    destroy() { close({ restoreFocus: false }); dialog.remove(); },
    show(result, { stage = null } = {}) {
      stopReplay(); dialog.classList.remove('is-replaying');
      renderedTrace?.destroy(); renderedTrace = null;
      panel.replaceChildren();
      const status = result.ok ? 'passed' : result.status === 'incomplete' ? 'incomplete' : 'failed';
      dialog.dataset.state = status;
      const title = result.ok ? tr('채점 결과: 통과', 'Result: passed')
        : result.status === 'incomplete' ? tr('채점 결과: 검증 미완료', 'Result: verification incomplete')
        : result.reason === 'completion_timeout' ? tr('채점 결과: 10 tick 내 미완료', 'Result: no completion within 10 ticks')
        : result.reason === 'wrong_first_complete' ? tr('채점 결과: 첫 완료의 값이 틀림', 'Result: incorrect first completion')
        : result.trace ? tr('채점 결과: 출력 불일치', 'Result: output mismatch')
        : tr('채점 결과: 잘못된 연결', 'Result: invalid circuit');
      const header = createResultHeader({ stage, title });
      header.querySelector('h2').id = 'gradingResultTitle'; panel.append(header);
      const failedObservation = !result.ok && observationLabel(result.observation);
      if (failedObservation) panel.append(el('p', 'grading-result-message grading-result-observation', `${tr('실패 시점', 'Mismatch observed')}: ${failedObservation}`));
      let traceView = null;
      if (result.trace?.length) {
        const section = el('section', 'grading-result-trace');
        const heading = el('div', 'grading-result-trace__heading');
        heading.append(el('p', 'level-intro-screen__logic-label', 'COUNTEREXAMPLE'));
        traceView = createCounterexampleTrace(result.trace); renderedTrace = traceView;
        heading.append(traceView.controls); section.append(heading, traceView.element); panel.append(section);
      } else if (!result.ok) {
        const message = result.status === 'incomplete'
          ? tr('탐색 한도에 도달했습니다. 회로를 단순화한 뒤 다시 검증하세요.', 'Search limit reached. Simplify the circuit and verify again.')
          : result.diagnostics?.map(d => diagnosticMessage(d)).join(' · ');
        if (message) panel.append(el('p', 'grading-result-message', message));
      }
      const footer = el('footer', 'grading-result-footer');
      if (result.states != null) footer.append(el('small', 'grading-result-stats', `${result.states} states · ${result.transitions} transitions checked`));
      const live = el('span', 'grading-result-progress'); live.setAttribute('role', 'status');
      footer.append(live);
      const actions = el('div', 'grading-result-actions');
      if (traceView && getCircuit?.()) {
        const replay = el('button', 'level-intro-screen__action', tr('▶ 반례 재생', '▶ Replay counterexample'));
        replay.type = 'button'; replay.id = 'gradingReplayBtn';
        replay.addEventListener('click', () => {
          stopReplay();
          const run = generation;
          playback = createTracePlayback(getCircuit(), result.trace);
          playback.start(); cameraView = getTraceView?.();
          dialog.classList.add('is-replaying');
          replay.disabled = true;
          function advance() {
            if (run !== generation || !dialog.open) return;
            try {
              const step = playback.step();
              if (!step) {
                replay.disabled = false;
                replay.textContent = tr('↻ 다시 재생', '↻ Replay again');
                return;
              }
              traceView.setActive(step.index);
              const phase = observationLabel(step.event.observation);
              live.textContent = `${step.index + 1} / ${result.trace.length} · ${step.event.type.toUpperCase()}${phase ? ` · ${phase}` : ''}`;
              cameraView?.focus(step.highlight.blocks.map(b => b.blockId), panel.getBoundingClientRect().top);
              timer = setTimeout(advance, 650);
            } catch (error) {
              stopReplay(); replay.disabled = false;
              live.textContent = tr('재생을 완료하지 못했습니다.', 'Replay could not complete.');
              console.error(error);
            }
          }
          // Give the docked panel one frame to lay out before focusing blocks.
          timer = setTimeout(advance, 0);
        });
        actions.append(replay);
      }
      const back = el('button', 'grading-result-edit', tr('회로 수정', 'Edit circuit'));
      back.id = 'gradingResultEditBtn'; back.type = 'button'; back.addEventListener('click', edit);
      actions.append(back); footer.append(actions); panel.append(footer);
      previousFocus = document.activeElement;
      if (!dialog.open) dialog.showModal();
      actions.querySelector('button').focus();
      traceView?.focusFailure();
    }
  };
}
